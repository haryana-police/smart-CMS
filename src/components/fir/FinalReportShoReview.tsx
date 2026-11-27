"use client";
import { useEffect, useState } from 'react';
import type { ComplaintReportItem } from '@/types';
import { finalReportClient } from '@/services/finalReportClient';

export function FinalReportShoReview({ report, userId, loaded, onUpdated }: { report: ComplaintReportItem; userId: string; loaded: boolean; onUpdated: (report: ComplaintReportItem) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [retry, setRetry] = useState(0);
  const state = report.finalReportWorkflow?.state;
  useEffect(() => {
    if (!loaded || !['SENT_TO_SHO', 'SHO_VIEWED'].includes(state || '') || report.finalReportWorkflow?.viewedBy === userId) return;
    let cancelled = false;
    setBusy(true); setError('');
    finalReportClient.review(report, userId, 'VIEW_SHO').then(saved => { if (!cancelled) onUpdated(saved); }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  // A view receipt is scoped to the exact report revision and SHO identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id, report.versionNumber, userId, loaded, retry]);
  const decide = async (action: 'APPROVE_SHO' | 'REJECT_SHO') => {
    if (action === 'REJECT_SHO' && !reason.trim()) { setError('IO को वापस भेजने का कारण लिखें।'); return; }
    setBusy(true); setError('');
    try { onUpdated(await finalReportClient.review(report, userId, action, reason)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Review could not be saved.'); }
    finally { setBusy(false); }
  };
  if (!['SENT_TO_SHO', 'SHO_VIEWED'].includes(state || '')) return <p className="p-3 text-sm bg-blue-50">{state === 'REJECTED' ? `Returned to assigned IO: ${report.finalReportWorkflow?.rejectionReason}` : 'SHO approved — forwarded to SO for final decision'}</p>;
  const ready = loaded && state === 'SHO_VIEWED' && report.finalReportWorkflow?.viewedBy === userId && !busy;
  return <div className="p-3 border-t bg-white space-y-2 shrink-0">
    {error && <p role="alert" className="text-sm text-red-700">{error} <button onClick={() => setRetry(n => n + 1)} className="underline">Retry view receipt</button></p>}
    <div className="flex flex-wrap gap-2 items-end"><label className="text-xs flex-1">Reason for returning to assigned IO<textarea aria-label="SHO rejection reason" className="block w-full border rounded p-2" rows={2} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button disabled={!ready} onClick={() => decide('APPROVE_SHO')} className="bg-green-700 text-white rounded px-3 py-2 disabled:opacity-50">Approve — Send to SO</button>
      <button disabled={!ready} onClick={() => decide('REJECT_SHO')} className="bg-red-700 text-white rounded px-3 py-2 disabled:opacity-50">Reject — Return to IO</button>
    </div>
  </div>;
}
