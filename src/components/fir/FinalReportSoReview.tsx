"use client";
import { useEffect, useState } from 'react';
import type { ComplaintReportItem } from '@/types';
import { finalReportClient } from '@/services/finalReportClient';

const FIR_SO_STATUS_OPTIONS = [
  { value: 'CHARGESHEET', label: 'Chargesheet / Challan' },
  { value: 'CLOSURE', label: 'Final Report — Closure' },
  { value: 'UNTRACED', label: 'Untraced' },
  { value: 'PROGRESS', label: 'Progress Report' },
  { value: 'ABATED', label: 'Abated / Cancelled' },
];

export function FinalReportSoReview({ report, userId, loaded, onUpdated }: { report: ComplaintReportItem; userId: string; loaded: boolean; onUpdated: (report: ComplaintReportItem) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [finalStatus, setFinalStatus] = useState('');
  const [retry, setRetry] = useState(0);
  const state = report.finalReportWorkflow?.state;

  useEffect(() => {
    if (!loaded || !['SENT_TO_SO', 'SO_VIEWED'].includes(state || '') || report.finalReportWorkflow?.soViewedBy === userId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setBusy(true); setError('');
      finalReportClient.reviewSo(report, userId, 'VIEW_SO').then(saved => { if (!cancelled) onUpdated(saved); }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setBusy(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id, report.versionNumber, userId, loaded, retry]);

  const decide = async (action: 'APPROVE_SO' | 'REJECT_SO') => {
    if (action === 'REJECT_SO' && !reason.trim()) { setError('IO को वापस भेजने का कारण लिखें।'); return; }
    if (action === 'APPROVE_SO' && !finalStatus) { setError('Select the final FIR report status before approving.'); return; }
    setBusy(true); setError('');
    try { onUpdated(await finalReportClient.reviewSo(report, userId, action, reason, finalStatus)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Review could not be saved.'); }
    finally { setBusy(false); }
  };

  if (!['SENT_TO_SO', 'SO_VIEWED'].includes(state || '')) {
    return <p className="p-3 text-sm bg-blue-50">{state === 'REJECTED' ? `Returned to assigned IO: ${report.finalReportWorkflow?.rejectionReason}` : state === 'UNDER_CHECKING' ? 'SO approved — Under Checking (CHI can now be submitted)' : 'Awaiting supervisory review'}</p>;
  }

  const ready = loaded && state === 'SO_VIEWED' && report.finalReportWorkflow?.soViewedBy === userId && !busy;
  return <div className="p-3 border-t bg-white space-y-2 shrink-0">
    <p className="text-xs font-bold text-slate-800">Supervisory Officer (SO) final review</p>
    {error && <p role="alert" className="text-sm text-red-700">{error} <button onClick={() => setRetry(n => n + 1)} className="underline">Retry view receipt</button></p>}
    <label className="block text-xs">
      <span className="font-semibold">Final FIR report status</span>
      <select value={finalStatus} onChange={e => setFinalStatus(e.target.value)} className="block w-full border rounded p-2 mt-1">
        <option value="">Select status…</option>
        {FIR_SO_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <label className="text-xs block">
      <span className="font-semibold">Reason / remarks</span>
      <textarea aria-label="SO rejection reason" className="block w-full border rounded p-2 mt-1" rows={2} value={reason} onChange={e => setReason(e.target.value)} />
    </label>
    <div className="flex flex-wrap gap-2">
      <button disabled={!ready} onClick={() => decide('APPROVE_SO')} className="bg-green-700 text-white rounded px-3 py-2 disabled:opacity-50">Approve — Under Checking</button>
      <button disabled={!ready} onClick={() => decide('REJECT_SO')} className="bg-red-700 text-white rounded px-3 py-2 disabled:opacity-50">Reject — Return to IO</button>
    </div>
  </div>;
}
