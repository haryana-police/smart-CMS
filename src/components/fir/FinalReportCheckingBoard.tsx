"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ComplaintReportItem } from '@/types';
import { finalReportClient } from '@/services/finalReportClient';

const stages = { SAVED: 'Saved — pending Send to SHO', SENT_TO_SHO: 'Pending SHO View', SHO_VIEWED: 'Pending SHO Decision', SENT_TO_SO: 'Pending SO View', SO_VIEWED: 'Pending SO Decision', REJECTED: 'Returned to IO', UNDER_CHECKING: 'Under Checking', COMPLETED: 'Completed Cases', PARTIAL: 'Partial' } as const;
export function FinalReportCheckingBoard({ station, district, userId }: { station: string; district?: string; userId: string }) {
  const [items, setItems] = useState<Array<{ firNumber: string; report: ComplaintReportItem }>>([]);
  const [stage, setStage] = useState<keyof typeof stages>('UNDER_CHECKING');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [chi, setChi] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false; setLoading(true); setError('');
    fetch(`/api/fir/final-reports?${district ? `district=${encodeURIComponent(district)}` : `station=${encodeURIComponent(station)}`}`, { cache: 'no-store' }).then(async response => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not load backend reports.');
      if (!cancelled) setItems(result.items);
    }).catch(error => { if (!cancelled) setError(error.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [station, district, refresh]);
  const submit = async (report: ComplaintReportItem) => {
    const number = chi[report.id]?.trim();
    if (!number) { setError('Enter a CHI number before submitting.'); return; }
    setBusy(report.id); setError('');
    try {
      const saved = await finalReportClient.submitChi(report, report.complaintId, userId, number);
      setItems(rows => rows.map(row => row.report.id === saved.id ? { ...row, report: saved } : row));
      setStage(saved.finalReportWorkflow!.state);
    } catch (error) { setError(error instanceof Error ? error.message : 'CHI could not be saved.'); }
    finally { setBusy(''); }
  };
  return <section className="bg-white border rounded-xl p-4 space-y-4">
    <div className="flex justify-between"><div><h2 className="font-bold text-lg">Final Reports — CHI & Case Progress</h2><p className="text-xs text-slate-500">Backend records · {district || station} · CHI submission moves Completed investigations to Completed Cases and continued investigations to Partial.</p></div><button className="text-sm underline" onClick={() => setRefresh(n => n + 1)}>Refresh</button></div>
    <div className="flex flex-wrap gap-2">{Object.entries(stages).map(([key, label]) => <button key={key} onClick={() => setStage(key as keyof typeof stages)} className={`px-3 py-2 border rounded-lg text-xs font-semibold ${stage === key ? 'bg-blue-900 text-white' : 'bg-slate-50'}`}>{label} ({items.filter(row => row.report.finalReportWorkflow?.state === key).length})</button>)}</div>
    {error && <p role="alert" className="p-3 bg-red-50 text-red-800 rounded">{error}</p>}
    {loading ? <p className="text-sm">Loading backend reports…</p> : <div className="space-y-3">{items.filter(row => row.report.finalReportWorkflow?.state === stage).map(({firNumber, report}) => <div key={report.id} className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm"><Link href={`/fir/${encodeURIComponent(report.complaintId)}`} className="font-bold text-blue-900 underline">FIR {firNumber}</Link><p>{report.title} · v{report.versionNumber}</p><p className="text-xs">{report.reportType === 'CHARGESHEET' ? `Challan — ${report.finalReportData?.chargeSheetType}` : `Final Report — ${report.reportType}: ${report.finalReportData?.finalReportReason}`} · Investigation: {report.finalReportData?.investigationStatus}</p><p className="text-xs">Accused: {report.finalReportData?.accused.map(a => `${a.name}: ${a.action}`).join(', ') || 'None recorded'}</p>{report.finalReportWorkflow?.chiNumber && <p className="text-xs font-bold">CHI: {report.finalReportWorkflow.chiNumber} · {report.finalReportWorkflow.chiSubmittedAt}</p>}</div>
      {stage === 'UNDER_CHECKING' && <div className="flex gap-2"><label className="text-xs">CHI number<input aria-label={`CHI number for ${report.dispatchNo}`} className="block border rounded p-2" value={chi[report.id] || ''} onChange={e => setChi(values => ({...values,[report.id]:e.target.value}))}/></label><button disabled={Boolean(busy)} className="px-3 py-2 bg-emerald-700 text-white rounded text-sm disabled:opacity-50" onClick={() => submit(report)}>{busy === report.id ? 'Saving…' : 'Submit CHI'}</button></div>}
    </div>)}{!items.some(row => row.report.finalReportWorkflow?.state === stage) && <p className="text-sm text-slate-500">No records in {stages[stage]}.</p>}</div>}
  </section>;
}
