import { isMhcOrMmRole } from "@/lib/officerRoles";
import { readCaseRecords, usesPostgresStore, withCaseRecordTransaction, writeCaseRecords } from "@/lib/runtimeJsonStore";
import type { Prisma } from "@prisma/client";
import { readMasterLocationReferences } from "@/services/masterLocationReferences";
import {readFirRecords} from "@/services/firRepository";
import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import type {ComplaintItem,UserSession} from '@/types';
import {canViewComplaint,isShoOrSuperior,canDeleteDocument,canEditDocument,isUserAssignedEo,isComplaintAssignedToEo} from '@/utils/complaintPermissions';
import {stabilizeComplaint,computeDaysPending} from '@/lib/complaintIntegrity';
import {complaintRegistrationSchema} from '@/lib/validations/complaint';
import {nextComplaintNumber} from '@/lib/complaintNumber';
import { getActiveStationOfficers } from '@/services/accountMasterService';
const file=path.join(process.cwd(),'prisma','complaints-store.json');
export class ComplaintAccessError extends Error{}
export class ComplaintConflict extends Error{}
const item=z.object({id:z.string().min(1).max(200),complaintNumber:z.string().min(1).max(200),policeStation:z.string().min(1).max(200),district:z.string().min(1).max(200),complainantName:z.string().min(1).max(500),status:z.enum(['NOT_ASSIGNED','PENDING','COMPLETE','Complete','Pending','FIR_RECOMMEND','FIR Recommend','FIR_REGISTER','FIR Register','FIR_REGISTERED','FIR Registered','CORRECTION_REQUIRED','Correction Required','REGISTERED','ASSIGNED_TO_EO','ENQUIRY_IN_PROGRESS','INTERIM_REPORT_SUBMITTED','REPORT_SUBMITTED','PENDING_SHO_REVIEW','RECOMMENDED_FOR_FIR','DISPOSED_MUTUAL_ACCORD','DISPOSED_CIVIL_NATURE','DISPOSED_UNSUBSTANTIATED','TRANSFERRED_OTHER_PS']),createdAt:z.string().refine(v=>Number.isFinite(Date.parse(v)),'Invalid registration timestamp'),updatedAt:z.string().refine(v=>Number.isFinite(Date.parse(v)),'Invalid update timestamp')}).passthrough();
const row=z.object({id:z.string().min(1).max(200)}).passthrough();
const complaintInput=item.extend({attachments:z.array(row.extend({name:z.string(),dataUrl:z.string().optional()})).optional(),documents:z.array(row.extend({fileName:z.string()})).optional(),reports:z.array(row.extend({title:z.string()})).optional(),enquiryNotes:z.array(row).optional(),timeline:z.array(row).optional(),auditTrail:z.array(row).optional(),accusedList:z.array(z.object({id:z.string().optional(),name:z.string()}).passthrough()).optional()});
const request=z.object({operation:z.string().min(1),changes:z.array(z.object({complaint:complaintInput,expectedVersion:z.number().int().nonnegative()})).min(1).max(100)});
export async function readComplaints(db?: Prisma.TransactionClient):Promise<ComplaintItem[]>{
 try{const parsed=await readCaseRecords<ComplaintItem>('complaints',file,db);if(!Array.isArray(parsed))throw new Error('Invalid complaint store');const locations = await readMasterLocationReferences(db); return parsed.map(c=>stabilizeComplaint(locations.caseRecord(c, 'name')));}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
}
function authorize(user:UserSession,next:ComplaintItem,old?:ComplaintItem,registeredFir=false){
 if(!old){if(user.unitId && user.role==='DSP_SUBDIV' && !canViewComplaint(user,next).allowed)throw new ComplaintAccessError('Registration outside your subdivision.');if(!isShoOrSuperior(user.role)&&(next.assignedEoId||next.assignedEoName||next.assignedEoPno))throw new ComplaintAccessError('Only supervisory officers can assign an EO.');if(next.shoDecision||next.shoApprovedAt||next.isFirApprovedBySho||next.isSentToSho)throw new ComplaintAccessError('New complaints must start at intake without approval.');if(!isShoOrSuperior(user.role)&&!isMhcOrMmRole(user.role))throw new ComplaintAccessError('Only intake officers can register complaints.');if(user.role!=='SUPER_ADMIN'&&(user.district!==next.district||(!isShoOrSuperior(user.role)||user.role==='SHO')&&user.stationName!==next.policeStation))throw new ComplaintAccessError('Registration outside your jurisdiction.');return;}
 if(!canViewComplaint(user,old).allowed)throw new ComplaintAccessError('Complaint access denied.');
 if(old.policeStation!==next.policeStation||old.district!==next.district||old.complaintNumber!==next.complaintNumber)throw new ComplaintAccessError('Complaint identity and source jurisdiction cannot be overwritten.');
 if(registeredFir && isMhcOrMmRole(user.role)){
  const allowed=new Set(['isFirRegistered','firNumber','firDate','firRegisteredBy','firRegisteredAt','firSections','status','workflowState','shoActionRequired','updatedAt','auditTrail','timeline']);
  for(const key of new Set([...Object.keys(old),...Object.keys(next)]))if(!allowed.has(key)&&JSON.stringify(old[key as keyof ComplaintItem])!==JSON.stringify(next[key as keyof ComplaintItem]))throw new ComplaintAccessError('Only the saved FIR registration may be linked at this stage.');
  if(next.status!=='FIR_REGISTERED'||next.workflowState!=='FIR_REGISTERED')throw new ComplaintAccessError('Invalid FIR registration transition.');
  return;
 }
 if(!isShoOrSuperior(user.role)){
  const intake=isMhcOrMmRole(user.role)&&!isComplaintAssignedToEo(old);
  if(intake){const allowed=new Set(['documents','attachments','timeline','auditTrail','updatedAt','daysPending']);for(const k of new Set([...Object.keys(old),...Object.keys(next)]))if(!allowed.has(k)&&JSON.stringify(old[k as keyof ComplaintItem])!==JSON.stringify(next[k as keyof ComplaintItem]))throw new ComplaintAccessError('Intake officers can only attach intake documents before assignment.');}
  else if(user.role!=='ENQUIRY_OFFICER'||!isUserAssignedEo(user,old))throw new ComplaintAccessError('Only assigned EO or supervisory officers can update this complaint.');
  const allowed=new Set(['status','workflowState','isSentToSho','sentToShoAt','sentToShoBy','shoActionRequired','isReportViewedBySho','shoReportViewedAt','isRecommendedForFir','recommendedAction','reports','documents','attachments','enquiryNotes','auditTrail','timeline','confidentialDossier','updatedAt','daysPending','legalAnalysis','investigationSummary']);
  const keys=new Set([...Object.keys(old),...Object.keys(next)]);
  for(const k of keys)if(!allowed.has(k)&&!k.startsWith('eo')&&JSON.stringify(old[k as keyof ComplaintItem])!==JSON.stringify(next[k as keyof ComplaintItem]))throw new ComplaintAccessError('Supervisory authority required.');
  if(next.isReportViewedBySho&&!old.isReportViewedBySho)throw new ComplaintAccessError('Only SHO can record report viewing.');
  if(old.shoReportViewedAt!==next.shoReportViewedAt&&next.shoReportViewedAt)throw new ComplaintAccessError('Only SHO can record report viewing.');
  if(old.status!==next.status&&['COMPLETE','FIR_REGISTERED','FIR_REGISTER','DISPOSED_MUTUAL_ACCORD','DISPOSED_CIVIL_NATURE','DISPOSED_UNSUBSTANTIATED'].includes(next.status.toUpperCase().replaceAll(' ','_')))throw new ComplaintAccessError('Only supervisory officers can finalize complaints.');
  if(old.workflowState!==next.workflowState&&['COMPLETE','FIR_REGISTERED','FIR_REGISTRATION_PENDING','FIR_REGISTER'].includes(next.workflowState||''))throw new ComplaintAccessError('Only supervisory officers can finalize complaints.');
 }
 for(const field of ['documents','reports'] as const){for(const doc of old[field]||[]){const updated=(next[field]||[]).find(d=>d.id===doc.id);if(!updated&&!canDeleteDocument(user,doc,old).allowed)throw new ComplaintAccessError('Only the original creator may delete this document/report.');if(updated&&JSON.stringify(doc)!==JSON.stringify(updated)&&!canEditDocument(user,doc,old).allowed){const before={...doc} as Record<string,unknown>,after={...updated} as Record<string,unknown>;for(const k of ['sentToSho','sentToShoAt','sentToShoBy','status']){delete before[k];delete after[k];}if(JSON.stringify(before)!==JSON.stringify(after))throw new ComplaintAccessError('Only the original creator may edit this document/report.');}}}
}
async function withLock<T>(fn:(db?: Prisma.TransactionClient)=>Promise<T>):Promise<T>{
 if (usesPostgresStore()) return withCaseRecordTransaction('complaints', fn);
 await fs.mkdir(path.dirname(file),{recursive:true});const lock=file+'.lock';let handle;
 for(let i=0;i<100;i++){try{handle=await fs.open(lock,'wx');break;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,25));}}
 if(!handle)throw new ComplaintConflict('Another save is in progress. Retry shortly.');
 try{return await fn();}finally{await handle.close();await fs.unlink(lock);}
}
export async function saveComplaintChanges(input:unknown,user:UserSession){
 const body=request.parse(input);
 if(new Set(body.changes.map(c=>c.complaint.id)).size!==body.changes.length)throw new ComplaintConflict('Duplicate complaint IDs in save request.');
 return withLock(async db=>{
 const list=await readComplaints(db),saved:ComplaintItem[]=[];
 for(const change of body.changes){let next=change.complaint as unknown as ComplaintItem;const index=list.findIndex(c=>c.id===next.id),old=list[index];
 const registeredFir=body.operation==='registerFir' && old ? (await readFirRecords(db)).some(f=>f.sourceComplaintId===old.id&&f.firNumber===next.firNumber&&f.policeStation===old.policeStation&&f.district===old.district) : false;
 next={...next,custodyUnit:old?.custodyUnit,recordTransfers:old?.recordTransfers};
 authorize(user,next,old,registeredFir);
 if((old?.persistenceVersion||0)!==change.expectedVersion)throw new ComplaintConflict('Complaint changed on another device. Reload and retry.');
 const assignmentChanged = next.assignedEoId !== old?.assignedEoId ||
   next.assignedEoPno !== old?.assignedEoPno || next.assignedEoName !== old?.assignedEoName;
 const station = old?.custodyUnit?.name || next.policeStation;
 const district = old?.custodyUnit?.district || next.district;
 if (db && assignmentChanged && (next.assignedEoId || next.assignedEoPno || next.assignedEoName)) {
   const officer = (await getActiveStationOfficers(station, district)).find(account =>
     account.id === next.assignedEoId && account.role === 'ENQUIRY_OFFICER' && account.pno === next.assignedEoPno);
   if (!officer) {
     throw new ComplaintAccessError('Select an active EO/IO from the complaint’s current station.');
   }
   next = {...next, assignedEoName: officer.fullName, assignedEoRank: officer.rankDisplay || officer.rank,
     assignedEoBeltNumber: officer.beltNumber, assignedEoPhone: officer.mobileNumber};
 }
 if(!old){const year=Number(next.createdAt.slice(0,4));if(!Number.isInteger(year)||year<1900||year>new Date().getFullYear()+1)throw new Error('Invalid registration date');complaintRegistrationSchema.parse(next);
 const number=nextComplaintNumber(list,year,next.policeStation,next.district);
 if(next.complaintNumber!==number)throw new ComplaintConflict('Complaint number changed. Refresh the register and retry registration.');
 if(next.status!=='REGISTERED'&&next.status!=='FIR_REGISTER')throw new ComplaintAccessError('New complaints must start at intake.');
 const roster = db ? await getActiveStationOfficers(station, district) : [];
 const desk = roster.find(account => account.id === user.id && isMhcOrMmRole(account.role)) ||
   roster.find(account => account.role === 'MHC_GD_INCHARGE') || roster.find(account => account.role === 'MM');
 next={...next,registeredBy:user.name,mhcName:desk?.fullName,mhcRank:desk?.rankDisplay || desk?.rank,
   mhcBeltNumber:desk?.beltNumber,mhcPhone:desk?.mobileNumber};}
 const oldDocuments=new Set(old?.documents?.map(d=>d.id)||[]),oldReports=new Set(old?.reports?.map(r=>r.id)||[]);
 next={...next,documents:next.documents?.map(d=>oldDocuments.has(d.id)?d:{...d,createdByUserId:user.id,uploadedBy:user.name}),reports:next.reports?.map(r=>oldReports.has(r.id)?r:{...r,createdByUserId:user.id,officerName:user.name,createdByName:user.name,createdByRole:user.role})};
 const auditIds=new Set(old?.auditTrail?.map(a=>a.id)||[]),timelineIds=new Set(old?.timeline?.map(t=>t.id)||[]);
 next={...next,auditTrail:next.auditTrail?.map(a=>auditIds.has(a.id)?a:{...a,performedBy:user.name,userPno:user.pno,userRole:user.role}),timeline:next.timeline?.map(t=>timelineIds.has(t.id)?t:{...t,officerName:user.name})};
 // Intake/OCR references and recommendations are not proof of FIR registration.
 const linkedFir=(await readFirRecords(db)).find(f=>f.sourceComplaintId===next.id && f.policeStation===next.policeStation && f.district===next.district);
 next={...next,isFirRegistered:Boolean(linkedFir)};
 if(linkedFir)next={...next,firNumber:linkedFir.firNumber};
 next=stabilizeComplaint({...next,persistenceVersion:(old?.persistenceVersion||0)+1},old);next.daysPending=computeDaysPending(next);
 if(index<0)list.unshift(next);else list[index]=next;saved.push(next);
 }
 const locations = await readMasterLocationReferences(db);
 await writeCaseRecords('complaints', file, list.map(record => locations.caseRecord(record, 'id')), db);
 return saved;
 });
}

export async function updateComplaintTransfer(id: string, update: (record: ComplaintItem) => ComplaintItem) {
  return withLock(async db => {
    const records = await readComplaints(db);
    const index = records.findIndex(record => record.id === id);
    if (index < 0) return null;
    const current = records[index];
    const saved = { ...update(current), persistenceVersion: (current.persistenceVersion || 0) + 1 };
    records[index] = saved;
    const locations = await readMasterLocationReferences(db);
    await writeCaseRecords('complaints', file, records.map(record => locations.caseRecord(record, 'id')), db);
    return saved;
  });
}
