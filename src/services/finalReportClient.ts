import type { ComplaintReportItem, FIRItem } from '@/types';
import type { FinalReportData } from '@/lib/finalReport';
import { firPersistence } from './persistentFirService';
export interface FinalReportHistoryEvent { id: string; reportId: string; action: string; version: number; actorId: string; createdAt: string; snapshotJson: string }
async function request(body?: unknown, method = 'POST', firId?: string) {
  const response = await fetch(`/api/fir/final-reports${firId ? `?firId=${encodeURIComponent(firId)}` : ''}`, {
    method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Backend report operation failed.');
  if (method === 'PATCH') await firPersistence.refresh();
  if (method !== 'GET' && typeof window !== 'undefined') window.dispatchEvent(new Event('officer_notifications_updated'));
  return result;
}
export const finalReportClient = {
  async review(report: ComplaintReportItem, authorId: string, action: 'VIEW_SHO' | 'APPROVE_SHO' | 'REJECT_SHO', reason?: string): Promise<ComplaintReportItem> {
    return (await request({ action, id: report.id, firId: report.complaintId, expectedVersion: report.versionNumber, authorId, reason }, 'PATCH')).report;
  },
  async reviewSo(report: ComplaintReportItem, authorId: string, action: 'VIEW_SO' | 'APPROVE_SO' | 'REJECT_SO', reason?: string, soFinalStatus?: string): Promise<ComplaintReportItem> {
    return (await request({ action, id: report.id, firId: report.complaintId, expectedVersion: report.versionNumber, authorId, reason, soFinalStatus }, 'PATCH')).report;
  },
  async list(firId: string): Promise<{ reports: ComplaintReportItem[]; history: FinalReportHistoryEvent[] }> { return request(undefined, 'GET', firId); },
  async save(id: string, fir: FIRItem, data: FinalReportData, previewHtml: string, author: {id: string;name: string}, expectedVersion: number): Promise<ComplaintReportItem> {
    const snapshot = { ...fir, reports: undefined };
    return (await request({ id, fir: snapshot, data, previewHtml, author, expectedVersion })).report;
  },
  async sendToSho(report: ComplaintReportItem, firId: string, authorId: string): Promise<ComplaintReportItem> {
    return (await request({ id: report.id, firId, expectedVersion: report.versionNumber, authorId }, 'PATCH')).report;
  },
  async submitChi(report: ComplaintReportItem, firId: string, authorId: string, chiNumber: string): Promise<ComplaintReportItem> {
    return (await request({ action: 'SUBMIT_CHI', id: report.id, firId, expectedVersion: report.versionNumber, authorId, chiNumber }, 'PATCH')).report;
  },
};
