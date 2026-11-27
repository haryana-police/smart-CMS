import { prisma } from '@/lib/prisma';
import { buildFinalReport, finalReportChiState, validateFinalReport } from '@/lib/finalReport';
import { finalReportRequestSchema } from '@/lib/finalReportSchema';
import type { ComplaintReportItem, FIRItem, UserSession } from '@/types';
import { readMasterLocationReferences } from './masterLocationReferences';

export class FinalReportConflict extends Error {}

export const finalReportDbService = {
  async notifications(user: UserSession) {
    const locations = await readMasterLocationReferences();
    const station = locations.station(user.stationName, user.district, 'id');
    const isSupervisor = user.role === 'DSP_SUBDIV' || user.role === 'SP_DISTRICT' || user.role === 'SUPER_ADMIN';
    const rows = await prisma.firFinalReport.findMany({ where: isSupervisor
      ? { state: { in: ['SENT_TO_SO', 'SO_VIEWED'] } }
      : { policeStation: { in: [user.stationName, station] }, state: { in: ['SENT_TO_SHO', 'SHO_VIEWED', 'REJECTED'] } }, orderBy: { updatedAt: 'desc' } });
    return rows.filter(row => {
      const location = locations.location(row, 'name');
      if (isSupervisor) return user.role === 'SUPER_ADMIN' || location.district === user.district;
      if (location.policeStation !== user.stationName || location.district !== user.district) return false;
      if (user.role === 'SHO') return row.state !== 'REJECTED';
      const fir = JSON.parse(row.firSnapshotJson) as FIRItem;
      return row.state === 'REJECTED' && (fir.assignedIoId === user.id || fir.assignedIoPno === user.pno || (!fir.assignedIoId && !fir.assignedIoPno && fir.assignedIoName === user.name));
    }).map(row => ({ id: row.id, firId: row.firId, version: row.version, title: `${row.firNumber} — ${isSupervisor ? 'Final report for SO decision' : row.state === 'REJECTED' ? 'Report returned by SHO' : 'Final report for SHO review'}`, message: (JSON.parse(row.reportJson) as ComplaintReportItem).finalReportWorkflow?.rejectionReason || 'View the report before approving or rejecting.', unread: isSupervisor ? row.state !== 'SO_VIEWED' : row.state !== 'SHO_VIEWED' }));
  },
  async review(id: string, firId: string, expectedVersion: number, actor: UserSession, action: 'VIEW_SHO' | 'APPROVE_SHO' | 'REJECT_SHO', reason?: string) {
    const locations = await readMasterLocationReferences();
    return prisma.$transaction(async tx => {
      const stored = await tx.firFinalReport.findUnique({ where: { id } });
      const authorId = actor.id;
      if (!stored || stored.firId !== firId || stored.version !== expectedVersion) throw new FinalReportConflict('Report changed. Reload before review.');
      const location = locations.location(stored, 'name');
      if (actor.role !== 'SHO' || actor.stationName !== location.policeStation || actor.district !== location.district) throw new FinalReportConflict('Only the SHO of this police station can review this report.');
      const report = JSON.parse(stored.reportJson) as ComplaintReportItem;
      const workflow = report.finalReportWorkflow!;
      if (action === 'VIEW_SHO' && stored.state === 'SHO_VIEWED' && workflow.viewedBy === authorId) return report;
      // SHO approval now lands in the SO queue. Older UNDER_CHECKING records
      // remain idempotent for the same reviewer.
      if (action === 'APPROVE_SHO' && ['SENT_TO_SO', 'SO_VIEWED', 'UNDER_CHECKING', 'COMPLETED', 'PARTIAL'].includes(stored.state) && workflow.reviewedBy === authorId) return report;
      if (action === 'REJECT_SHO' && stored.state === 'REJECTED' && workflow.reviewedBy === authorId && workflow.rejectionReason === reason?.trim()) return report;
      if (!['SENT_TO_SHO', 'SHO_VIEWED'].includes(stored.state)) throw new FinalReportConflict('This report is not pending SHO review.');
      if (action !== 'VIEW_SHO' && (stored.state !== 'SHO_VIEWED' || workflow.viewedBy !== authorId)) throw new FinalReportConflict('View this report revision before approving or rejecting.');
      if (action === 'REJECT_SHO' && !reason?.trim()) throw new FinalReportConflict('Enter a rejection reason for the assigned IO.');
      const fir = JSON.parse(stored.firSnapshotJson) as FIRItem;
      if (action === 'REJECT_SHO' && !fir.assignedIoId && !fir.assignedIoPno && !fir.assignedIoName) throw new FinalReportConflict('Assign an IO to this FIR before returning the report.');
      const now = new Date().toISOString();
      const state = action === 'VIEW_SHO' ? 'SHO_VIEWED' : action === 'APPROVE_SHO' ? 'SENT_TO_SO' : 'REJECTED';
      const updated: ComplaintReportItem = { ...report, updatedAt: now, finalReportWorkflow: { ...workflow, state,
        ...(action === 'VIEW_SHO' ? { viewedBy: authorId, viewedAt: now } : { reviewedBy: authorId, reviewedAt: now }),
        ...(action === 'REJECT_SHO' ? { rejectionReason: reason!.trim(), assignedIoId: fir.assignedIoId, assignedIoPno: fir.assignedIoPno, assignedIoName: fir.assignedIoName } : {}),
      } };
      const changed = await tx.firFinalReport.updateMany({ where: { id, version: expectedVersion, state: stored.state }, data: { state, updatedBy: authorId, reportJson: JSON.stringify(updated) } });
      if (changed.count !== 1) throw new FinalReportConflict('Review changed. Reload before continuing.');
      await tx.firFinalReportEvent.create({ data: { reportId: id, firId, action, version: stored.version, actorId: authorId, snapshotJson: JSON.stringify(updated) } });
      return updated;
    });
  },
  async reviewSo(id: string, firId: string, expectedVersion: number, actor: UserSession, action: 'VIEW_SO' | 'APPROVE_SO' | 'REJECT_SO', reason?: string, soFinalStatus?: string) {
    const locations = await readMasterLocationReferences();
    return prisma.$transaction(async tx => {
      const stored = await tx.firFinalReport.findUnique({ where: { id } });
      const authorId = actor.id;
      if (!stored || stored.firId !== firId || stored.version !== expectedVersion) throw new FinalReportConflict('Report changed. Reload before review.');
      const isSupervisor = actor.role === 'DSP_SUBDIV' || actor.role === 'SP_DISTRICT' || actor.role === 'SUPER_ADMIN';
      if (!isSupervisor) throw new FinalReportConflict('Only a Supervisory Officer (DSP/SP/Super Admin) can take the final decision.');
      const location = locations.location(stored, 'name');
      if (actor.role !== 'SUPER_ADMIN' && location.district !== actor.district) throw new FinalReportConflict('This report is outside your supervisory district.');
      const report = JSON.parse(stored.reportJson) as ComplaintReportItem;
      const workflow = report.finalReportWorkflow!;
      if (action === 'VIEW_SO' && stored.state === 'SO_VIEWED' && workflow.soViewedBy === authorId) return report;
      if (action === 'APPROVE_SO' && ['UNDER_CHECKING', 'COMPLETED', 'PARTIAL'].includes(stored.state) && workflow.soApprovedBy === authorId) return report;
      if (action === 'REJECT_SO' && stored.state === 'REJECTED' && workflow.soApprovedBy === authorId && workflow.rejectionReason === reason?.trim()) return report;
      if (!['SENT_TO_SO', 'SO_VIEWED'].includes(stored.state)) throw new FinalReportConflict('This report is not pending SO review.');
      if (action !== 'VIEW_SO' && (stored.state !== 'SO_VIEWED' || workflow.soViewedBy !== authorId)) throw new FinalReportConflict('View this report revision before approving or rejecting.');
      if (action === 'APPROVE_SO' && !soFinalStatus?.trim()) throw new FinalReportConflict('Select the final FIR report status before approving.');
      if (action === 'REJECT_SO' && !reason?.trim()) throw new FinalReportConflict('Enter a rejection reason for the assigned IO.');
      const fir = JSON.parse(stored.firSnapshotJson) as FIRItem;
      if (action === 'REJECT_SO' && !fir.assignedIoId && !fir.assignedIoPno && !fir.assignedIoName) throw new FinalReportConflict('Assign an IO to this FIR before returning the report.');
      const now = new Date().toISOString();
      const state = action === 'VIEW_SO' ? 'SO_VIEWED' : action === 'APPROVE_SO' ? 'UNDER_CHECKING' : 'REJECTED';
      const updated: ComplaintReportItem = { ...report, updatedAt: now, finalReportWorkflow: { ...workflow, state,
        ...(action === 'VIEW_SO' ? { soViewedBy: authorId, soViewedAt: now } : { soApprovedBy: authorId, soApprovedAt: now, soRemarks: reason?.trim() }),
        ...(action === 'APPROVE_SO' ? { soFinalStatus: soFinalStatus!.trim() } : {}),
        ...(action === 'REJECT_SO' ? { rejectionReason: reason!.trim(), assignedIoId: fir.assignedIoId, assignedIoPno: fir.assignedIoPno, assignedIoName: fir.assignedIoName } : {}),
      } };
      const changed = await tx.firFinalReport.updateMany({ where: { id, version: expectedVersion, state: stored.state }, data: { state, updatedBy: authorId, reportJson: JSON.stringify(updated) } });
      if (changed.count !== 1) throw new FinalReportConflict('Review changed. Reload before continuing.');
      await tx.firFinalReportEvent.create({ data: { reportId: id, firId, action, version: stored.version, actorId: authorId, snapshotJson: JSON.stringify(updated) } });
      return updated;
    });
  },
  async stationReports(policeStation?: string, district?: string) {
    const locations = await readMasterLocationReferences();
    const rows = await prisma.firFinalReport.findMany({
      where: district ? { district: { in: [district, locations.district(district, 'id')] } } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
    const seen = new Set<string>();
    return rows.filter(row => {
      if (policeStation && locations.location(row, 'name').policeStation !== policeStation) return false;
      if (seen.has(row.firId)) return false;
      seen.add(row.firId);
      return true;
    })
      .map(row => ({ firNumber: row.firNumber, report: JSON.parse(row.reportJson) as ComplaintReportItem }));
  },
  async history(firId: string) {
    return prisma.firFinalReportEvent.findMany({ where: { firId }, orderBy: { createdAt: 'asc' } });
  },
  async list(firId: string) {
    const rows = await prisma.firFinalReport.findMany({ where: { firId }, orderBy: { updatedAt: 'desc' } });
    return rows.map(row => JSON.parse(row.reportJson) as ComplaintReportItem);
  },
  async save(input: unknown) {
    const body = finalReportRequestSchema.parse(input);
    const errors = validateFinalReport(body.data);
    if (errors.length) throw new Error(errors.join(' '));
    if (new Set(body.data.accused.map(a => a.accusedId)).size !== body.data.accused.length) throw new Error('Duplicate accused identifiers.');
    const locations = await readMasterLocationReferences();
    return prisma.$transaction(async tx => {
      const stored = await tx.firFinalReport.findUnique({ where: { id: body.id } });
      if (stored && stored.firId !== body.fir.id) throw new FinalReportConflict('Report belongs to a different FIR.');
      // Stable ID makes a retried first submit idempotent after a lost response.
      if (stored && body.expectedVersion === 0 && stored.version === 1 && stored.formDataJson === JSON.stringify(body.data)) return JSON.parse(stored.reportJson) as ComplaintReportItem;
      if ((stored?.version || 0) !== body.expectedVersion) throw new FinalReportConflict('Report changed. Reload the saved report before editing.');
      const previous = stored ? JSON.parse(stored.reportJson) as ComplaintReportItem : undefined;
      const report = { ...buildFinalReport(body.fir as unknown as FIRItem, body.data, body.author, previous, body.previewHtml), id: body.id };
      const values = {
        firId: body.fir.id, firNumber: body.fir.firNumber,
        ...locations.location({ policeStation: body.fir.policeStation, district: body.fir.district }, 'id'),
        reportNumber: body.data.reportNo, reportType: body.data.formType,
        reportCategory: body.data.formType === 'CHARGESHEET' ? 'CHALLAN' : 'FINAL_REPORT',
        finalReportReason: body.data.formType === 'CHARGESHEET' ? '' : body.data.finalReportReason,
        investigationStatus: body.data.investigationStatus,
        chargeSheetType: body.data.formType === 'CHARGESHEET' ? body.data.chargeSheetType : '',
        version: body.expectedVersion + 1, state: 'SAVED', formDataJson: JSON.stringify(body.data),
        firSnapshotJson: JSON.stringify(body.fir), reportJson: JSON.stringify(report),
        createdBy: stored?.createdBy || body.author.id, updatedBy: body.author.id,
        sentToShoAt: null, sentToShoBy: null,
      };
      if (stored) {
        const updated = await tx.firFinalReport.updateMany({ where: { id: body.id, version: body.expectedVersion, state: stored.state }, data: values });
        if (updated.count !== 1) throw new FinalReportConflict('Another edit was saved. Reload this report.');
        await tx.firFinalReportAccused.deleteMany({ where: { reportId: body.id } });
      } else await tx.firFinalReport.create({ data: { id: body.id, ...values } });
      for (const accused of body.data.accused) await tx.firFinalReportAccused.create({ data: {
        reportId: body.id, accusedId: accused.accusedId, name: accused.name, action: accused.action,
        status: accused.status, detailsJson: JSON.stringify(accused),
      } });
      await tx.firFinalReportEvent.create({ data: { reportId: body.id, firId: body.fir.id,
        action: stored ? 'REPORT_EDITED_AND_SAVED' : 'FINAL_SUBMIT_SAVED', version: values.version,
        actorId: body.author.id, snapshotJson: JSON.stringify({ report, fir: body.fir, data: body.data }),
      } });
      return report;
    });
  },
  async sendToSho(id: string, firId: string, expectedVersion: number, authorId: string) {
    return prisma.$transaction(async tx => {
      const stored = await tx.firFinalReport.findUnique({ where: { id } });
      if (!stored || stored.firId !== firId) throw new FinalReportConflict('Saved report not found.');
      if (stored.version !== expectedVersion) throw new FinalReportConflict('Report changed. Reload before sending to SHO.');
      const report = JSON.parse(stored.reportJson) as ComplaintReportItem;
      if (stored.state === 'SENT_TO_SHO') return report;
      const now = new Date();
      const sent: ComplaintReportItem = { ...report, sentToSho: true, isSentToSho: true, sentToShoAt: now.toISOString(), sentToShoBy: authorId, updatedAt: now.toISOString(), finalReportWorkflow: { state: 'SENT_TO_SHO' } };
      if (stored.state !== 'SAVED') throw new FinalReportConflict('This report has already completed checking. Edit and save a new revision before sending again.');
      const result = await tx.firFinalReport.updateMany({ where: { id, version: expectedVersion, state: 'SAVED' }, data: { state: 'SENT_TO_SHO', sentToShoAt: now, sentToShoBy: authorId, reportJson: JSON.stringify(sent) } });
      if (result.count !== 1) throw new FinalReportConflict('Report changed. Reload before sending.');
      await tx.firFinalReportEvent.create({ data: { reportId: id, firId, action: 'SENT_TO_SHO', version: stored.version, actorId: authorId, snapshotJson: JSON.stringify(sent) } });
      return sent;
    });
  },
  async submitChi(id: string, firId: string, expectedVersion: number, authorId: string, chiNumber: string) {
    return prisma.$transaction(async tx => {
      const stored = await tx.firFinalReport.findUnique({ where: { id } });
      if (!stored || stored.firId !== firId || stored.version !== expectedVersion) throw new FinalReportConflict('Report changed or was not found. Reload before submitting CHI.');
      const report = JSON.parse(stored.reportJson) as ComplaintReportItem;
      if (report.finalReportWorkflow?.chiNumber === chiNumber && ['COMPLETED', 'PARTIAL'].includes(stored.state)) return report;
      if (stored.state !== 'UNDER_CHECKING') throw new FinalReportConflict('CHI can only be submitted after SO approval places the report Under Checking.');
      const data = report.finalReportData;
      if (data?.formType === 'CHARGESHEET' && !['Complete', 'Partial'].includes(data.chargeSheetType)) throw new FinalReportConflict('Select Complete or Partial in the IIF-V chargesheet before submitting CHI.');
      const state = finalReportChiState(data);
      const now = new Date().toISOString();
      const updated: ComplaintReportItem = { ...report, updatedAt: now, finalReportWorkflow: { ...report.finalReportWorkflow, state, chiNumber, chiSubmittedAt: now, chiSubmittedBy: authorId } };
      const result = await tx.firFinalReport.updateMany({ where: { id, version: expectedVersion, state: 'UNDER_CHECKING' }, data: { state, updatedBy: authorId, reportJson: JSON.stringify(updated) } });
      if (result.count !== 1) throw new FinalReportConflict('Report changed. Reload before submitting CHI.');
      await tx.firFinalReportEvent.create({ data: { reportId: id, firId, action: `CHI_SUBMITTED_${state}`, version: stored.version, actorId: authorId, snapshotJson: JSON.stringify(updated) } });
      return updated;
    });
  },
};
