import { readCaseRecords, usesPostgresStore, withCaseRecordTransaction, writeCaseRecords } from "@/lib/runtimeJsonStore";
import type { Prisma } from "@prisma/client";
import { readMasterLocationReferences } from "@/services/masterLocationReferences";
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { FIRItem, UserSession } from '@/types';
import { canManageLegacyChallan, canRegisterFir, isFirVisibleToUser, nextFirNumber } from '@/lib/firIntegrity';
import { isDeepStrictEqual } from 'node:util';

const file=()=>process.env.CMS_FIR_STORE_PATH || path.join(process.cwd(),'prisma','firs-store.json');
export class FirRepositoryConflict extends Error {}
export class FirRepositoryAccessError extends Error {}
const recordSchema=z.object({id:z.string().min(1).max(200),firNumber:z.string().min(1).max(100),firYear:z.number().int().min(1900).max(2200),firDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value,'Invalid FIR date'),policeStation:z.string().min(1),district:z.string().min(1),status:z.string().min(1),complainantName:z.string(),createdAt:z.string().optional(),challanRecords:z.array(z.object({id:z.string().min(1),submittedToCourt:z.boolean().optional()}).passthrough()).max(10000).optional(),accusedList:z.array(z.object({id:z.string().optional(),name:z.string()}).passthrough()).max(1000).optional(),documents:z.array(z.object({id:z.string(),title:z.string(),fileName:z.string(),uploadedBy:z.string(),uploadedAt:z.string()}).passthrough()).max(5000).optional(),caseDiaries:z.array(z.object({id:z.string(),officer:z.string(),summary:z.string(),details:z.string()}).passthrough()).max(10000).optional(),reports:z.array(z.object({id:z.string(),title:z.string()}).passthrough()).max(5000).optional(),auditTrail:z.array(z.object({id:z.string(),action:z.string(),timestamp:z.string()}).passthrough()).max(10000).optional()}).passthrough();
const changesSchema=z.array(z.object({record:recordSchema,expectedVersion:z.number().int().nonnegative(),preserveNumber:z.boolean().optional()})).min(1).max(500);
export async function readFirRecords(db?: Prisma.TransactionClient):Promise<FIRItem[]> {
  // This mutable runtime store is provisioned/backed up separately, never bundled as source.
  try{const data=await readCaseRecords<FIRItem>('firs',file(),db);if(!Array.isArray(data))throw new Error('Invalid FIR store.');const locations = await readMasterLocationReferences(db); return data.map(record => locations.caseRecord(record, 'name'));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
}
async function withFirStore<T>(update: (records: FIRItem[]) => T, officerId?: string): Promise<T> {
  const target=file();
  const save = async (db?: Prisma.TransactionClient) => {
    const records = await readFirRecords(db);
    const result = update(records);
    const locations = await readMasterLocationReferences(db);
    await writeCaseRecords('firs', target, records.map(record => locations.caseRecord(record, 'id')), db, officerId);
    return result;
  };
  if (usesPostgresStore()) return withCaseRecordTransaction('firs', save);
  await fs.mkdir(path.dirname(target),{recursive:true});
  let lock;
  for(let i=0;i<100;i++){try{lock=await fs.open(target+'.lock','wx');break;}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;await new Promise(resolve=>setTimeout(resolve,25));}}
  if(!lock)throw new FirRepositoryConflict('Another FIR save is in progress. Retry.');
  try{return await save();}finally{await lock.close();await fs.unlink(target+'.lock');}
}
export async function updateFirTransfer(id: string, update: (record: FIRItem) => FIRItem) {
  return withFirStore(records => {
    const index = records.findIndex(record => record.id === id);
    if (index < 0) return null;
    const current = records[index];
    return records[index] = { ...update(current), persistenceVersion: (current.persistenceVersion || 0) + 1 };
  });
}
export async function saveFirRecords(input:unknown,user:UserSession, source?: 'final-report'):Promise<FIRItem[]> {
  const changes=changesSchema.parse(input);
  return withFirStore(records => {
    const saved:FIRItem[]=[];
    if(new Set(changes.map(c=>c.record.id)).size!==changes.length)throw new FirRepositoryConflict('Duplicate FIR identifiers.');
    for(const change of changes){
      const proposed=change.record as unknown as FIRItem,index=records.findIndex(f=>f.id===proposed.id),old=records[index];
      proposed.custodyUnit=old?.custodyUnit;
      proposed.recordTransfers=old?.recordTransfers;
      if(Number(proposed.firDate.slice(0,4))!==proposed.firYear)throw new Error("FIR year must match its registration date.");
      if(!isFirVisibleToUser(user,old || proposed))throw new FirRepositoryAccessError('FIR is outside your assignment or jurisdiction.');
      if(!old && !canRegisterFir(user.role))throw new FirRepositoryAccessError('Only intake officers may register FIRs.');
      if(old && (old.firNumber!==proposed.firNumber || old.firYear!==proposed.firYear || old.policeStation!==proposed.policeStation || old.district!==proposed.district))throw new FirRepositoryAccessError('FIR identity and source jurisdiction cannot be overwritten.');
      if(old && change.expectedVersion===0 && old.persistenceVersion===1){const previous={...old} as Record<string,unknown>,incoming={...proposed} as Record<string,unknown>;for(const key of ['persistenceVersion','firNumber']){delete previous[key];delete incoming[key];}if(JSON.stringify(previous)===JSON.stringify(incoming)){saved.push(old);continue;}}
      if((old?.persistenceVersion || 0)!==change.expectedVersion)throw new FirRepositoryConflict('FIR changed on another device. Reload and retry.');
      if (old && source !== 'final-report') {
        const previous = old.challanRecords ?? [];
        const incoming = proposed.challanRecords ?? [];
        if (!isDeepStrictEqual(previous, incoming)) {
          const withoutCourtReceipt = ({ courtSubmittedAt, courtSubmittedBy, courtReceiptNo, submittedToCourt, ...challan }: (typeof incoming)[number]) => challan;
          const isSubmission = previous.length === incoming.length &&
            previous.every((challan, index) => {
              const next = incoming[index];
              return isDeepStrictEqual(challan, next) ||
                (!challan.submittedToCourt && next.submittedToCourt === true &&
                  isDeepStrictEqual(withoutCourtReceipt(challan), withoutCourtReceipt(next)));
            });
          if (!canManageLegacyChallan(user, old, isSubmission ? 'submit' : 'prepare')) {
            throw new FirRepositoryAccessError('You are not authorized to change challan records for this FIR.');
          }
        }
      }
      if(old && user.role==='ENQUIRY_OFFICER' && ['assignedIoId','assignedIoName','assignedIoPno','shoDecision','shoDecisionBy','shoDecisionAt'].some(key=>JSON.stringify(old[key as keyof FIRItem])!==JSON.stringify(proposed[key as keyof FIRItem])))throw new FirRepositoryAccessError('Supervisory approval is required for assignment or SHO decisions.');
      if(!old && proposed.sourceComplaintId && records.some(f=>f.sourceComplaintId===proposed.sourceComplaintId))throw new FirRepositoryConflict('This complaint already has an FIR. Reload the existing FIR.');
      const oldAudit=new Map(old?.auditTrail?.map(a=>[a.id,a]) || []);
      if(old?.auditTrail?.some(a=>!proposed.auditTrail?.some(next=>next.id===a.id && JSON.stringify(next)===JSON.stringify(a))))throw new FirRepositoryAccessError('Saved audit history cannot be edited or removed.');
      let next={...proposed,persistenceVersion:change.expectedVersion+1,auditTrail:proposed.auditTrail?.map(a=>oldAudit.has(a.id)?a:{...a,officerName:user.name,role:user.role})};
      if(!old && records.some(f=>f.policeStation===next.policeStation && f.firYear===next.firYear && f.firNumber===next.firNumber)){if(change.preserveNumber)throw new FirRepositoryConflict("Legacy FIR number conflicts with a server record. The browser backup is retained; review before importing.");next={...next,firNumber:nextFirNumber(records,next.firYear,next.policeStation)};}
      if(index<0)records.push(next);else records[index]=next;
      saved.push(next);
    }
    return saved;
  }, user.id);
}
