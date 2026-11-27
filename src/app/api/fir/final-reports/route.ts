import { readFirRecords } from "@/services/firRepository";
import { prisma } from "@/lib/prisma";
import { isFirVisibleToUser } from "@/lib/firIntegrity";
import { apiAccess, scopeAllowed, forbidden } from "@/lib/apiSecurity";
import { firReportAccusedSources } from '@/services/firReportAccusedSources';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { finalReportDbService, FinalReportConflict } from '@/services/finalReportDbService';
import { synchronizeFinalReportFir } from '@/services/finalReportFirSync';

export const runtime = 'nodejs';
function failed(error: unknown) {
  console.error('Final report persistence failed:', error);
  if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid final report data. Check all required fields.' }, { status: 400 });
  if (error instanceof FinalReportConflict) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ error: 'Backend could not save/load the report. Check database configuration and retry.' }, { status: 503 });
}
export async function GET(req: NextRequest) {
  const apiUser = await apiAccess(req); if (apiUser instanceof Response) return apiUser;

  const notifyUser = req.nextUrl.searchParams.get('notificationsFor');
  if (notifyUser) {
    if (notifyUser !== apiUser.id) return forbidden();
    try { return NextResponse.json({ notifications: await finalReportDbService.notifications(apiUser) }, { headers: { 'Cache-Control': 'no-store' } }); }
    catch (error) { return failed(error); }
  }
  const firId = req.nextUrl.searchParams.get('firId');
  if (!firId) {
    const station = req.nextUrl.searchParams.get('station') || undefined;
    const district = req.nextUrl.searchParams.get('district') || (apiUser.role !== 'SUPER_ADMIN' ? apiUser.district : undefined);
    if (apiUser.role !== 'SUPER_ADMIN' && (!district || district.toLowerCase() !== apiUser.district.toLowerCase() || !['SP_DISTRICT','DSP_SUBDIV','ASP_HQ'].includes(apiUser.role) && station !== apiUser.stationName)) return forbidden();
    if (!station && !district) return NextResponse.json({ error: 'FIR ID or station required.' }, { status: 400 });
    try {
      const visible = new Set((await readFirRecords()).filter(f => isFirVisibleToUser(apiUser,f)).map(f => f.id));
      return NextResponse.json({ items: (await finalReportDbService.stationReports(station, district)).filter(item => visible.has(item.report.complaintId)) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (error) { return failed(error); }
  }
  const scope = (await readFirRecords()).find(f => f.id === firId);
  if (!scope || !isFirVisibleToUser(apiUser,scope)) return forbidden();
  try { return NextResponse.json({ reports: await finalReportDbService.list(firId), history: await finalReportDbService.history(firId) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return failed(error); }
}
export async function POST(req: NextRequest) {
  const apiUser = await apiAccess(req); if (apiUser instanceof Response) return apiUser;

  try {
    const body=await req.json();
    const canonical=(await readFirRecords()).find(f=>f.id===body.fir?.id);
    if (!canonical) return NextResponse.json({error:"Save or import this FIR before creating its final report."},{status:409});
    if (!isFirVisibleToUser(apiUser,canonical)) return forbidden();
    const accusedIds = new Set((await firReportAccusedSources(canonical, apiUser)).map(person => person.accusedId));
    if (!Array.isArray(body.data?.accused) || body.data.accused.some((accused: { accusedId: string }) => !accusedIds.has(accused.accusedId))) return NextResponse.json({ error: 'An accused is not linked to this FIR or its processed evidence. Reload the form.' }, { status: 400 });
    body.fir=canonical;
    const existing=await prisma.firFinalReport.findUnique({where:{id:body.id}});
    if (existing) {
      const locations = await readMasterLocationReferences();
      if (existing.createdBy !== apiUser.id || !scopeAllowed(apiUser, locations.location(existing, 'name'))) return forbidden();
    }
    body.author={id:apiUser.id,name:apiUser.name};
    return NextResponse.json({ report: await finalReportDbService.save(body) });
  }
  catch (error) { return failed(error); }
}
export async function PATCH(req: NextRequest) {
  const apiUser = await apiAccess(req); if (apiUser instanceof Response) return apiUser;

  try {
    const body = z.object({ action: z.enum(['SEND_TO_SHO', 'SUBMIT_CHI', 'VIEW_SHO', 'APPROVE_SHO', 'REJECT_SHO', 'VIEW_SO', 'APPROVE_SO', 'REJECT_SO']).default('SEND_TO_SHO'), reason: z.string().trim().max(10000).optional(), soFinalStatus: z.string().trim().max(100).optional(), chiNumber: z.string().trim().min(1).max(100).optional(), id: z.string().min(1), firId: z.string().min(1), expectedVersion: z.number().int().positive(), authorId: z.string().min(1) }).parse(await req.json());
    body.authorId=apiUser.id;
    const stored=await prisma.firFinalReport.findUnique({where:{id:body.id}});
    const canonical=(await readFirRecords()).find(f=>f.id===body.firId);
    if (!stored || stored.firId !== body.firId || !canonical || !isFirVisibleToUser(apiUser,canonical)) return forbidden();
    if (['SEND_TO_SHO','SUBMIT_CHI'].includes(body.action) && stored.createdBy !== apiUser.id && apiUser.role !== 'SHO') return forbidden();
    const synced = async (report: Awaited<ReturnType<typeof finalReportDbService.review>>) => { await synchronizeFinalReportFir(report,apiUser); return NextResponse.json({report}); };
    if (body.action === 'VIEW_SHO'  || body.action === 'APPROVE_SHO' || body.action === 'REJECT_SHO') return synced(await finalReportDbService.review(body.id, body.firId, body.expectedVersion, apiUser, body.action, body.reason));
    if (body.action === 'VIEW_SO' || body.action === 'APPROVE_SO' || body.action === 'REJECT_SO') return synced(await finalReportDbService.reviewSo(body.id, body.firId, body.expectedVersion, apiUser, body.action, body.reason, body.soFinalStatus));
    if (body.action === 'SUBMIT_CHI') {
      if (!body.chiNumber) return NextResponse.json({ error: 'CHI number is required.' }, { status: 400 });
      return synced(await finalReportDbService.submitChi(body.id, body.firId, body.expectedVersion, body.authorId, body.chiNumber));
    }
    return synced(await finalReportDbService.sendToSho(body.id, body.firId, body.expectedVersion, body.authorId));
  } catch (error) { return failed(error); }
}
import { readMasterLocationReferences } from '@/services/masterLocationReferences';
