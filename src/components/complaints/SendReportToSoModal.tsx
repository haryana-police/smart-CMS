"use client";

import React, { useState } from "react";
import { Send, X, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { resolveSupervisoryOfficers, type SupervisoryOfficerOption } from "@/lib/supervisoryOfficer";

export interface SupervisoryStatusOption {
  value: string;
  label: string;
  description?: string;
}

interface SendReportToSoModalProps {
  isOpen: boolean;
  recordNumber: string;
  reportTitle?: string;
  policeStation?: string;
  district?: string;
  statusOptions: SupervisoryStatusOption[];
  title?: string;
  subtext?: string;
  statusLabel?: string;
  onClose: () => void;
  onSubmit: (data: {
    status: string;
    remarks: string;
    soName: string;
    soRole: string;
    soId: string;
  }) => Promise<void> | void;
  isLoading?: boolean;
}

export function SendReportToSoModal({
  isOpen,
  recordNumber,
  reportTitle,
  policeStation,
  district,
  statusOptions,
  title = "Send Report to Supervisory Officer (SO)",
  subtext = "Select the final status you recommend and the supervisory officer who will decide the case.",
  statusLabel = "Select Status / Recommendation (mandatory)",
  onClose,
  onSubmit,
  isLoading = false,
}: SendReportToSoModalProps) {
  const officers: SupervisoryOfficerOption[] = resolveSupervisoryOfficers(policeStation, district);
  const primary = officers.find((o) => o.isPrimary) || officers[0];
  const [soId, setSoId] = useState(primary?.id || "");
  const [manualName, setManualName] = useState("");
  const [status, setStatus] = useState("");
  const [otherStatus, setOtherStatus] = useState("");
  const [remarks, setRemarks] = useState("");

  useEscapeKey(isOpen, onClose);
  if (!isOpen) return null;

  const selected = officers.find((o) => o.id === soId) || primary;
  const soName = selected?.role === 'OTHER' ? manualName.trim() : selected?.name || "";
  const resolvedStatus = status === 'OTHER' ? otherStatus.trim() : status;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedStatus || !soName) return;
    onSubmit({ status: resolvedStatus, remarks: remarks.trim(), soName, soRole: selected?.role || 'OTHER', soId: selected?.id || '' });
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 flex flex-col max-h-[92vh]">
        <div className="p-4 bg-[#0b192c] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-bold text-sm">{title}</h3>
              <p className="text-[11px] text-slate-300">{subtext}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isLoading} className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4 text-xs overflow-y-auto">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <p><strong>Record:</strong> {recordNumber}</p>
            {reportTitle && <p className="truncate"><strong>Report:</strong> {reportTitle}</p>}
          </div>

          <div className="space-y-2">
            <label className="block font-bold text-slate-800">{statusLabel}</label>
            <div className="space-y-2">
              {statusOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer ${
                    status === option.value ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <input type="radio" name="so-status" className="mt-0.5" checked={status === option.value} onChange={() => setStatus(option.value)} />
                  <span>
                    <span className="block font-bold text-slate-900">{option.label}</span>
                    {option.description && <span className="block text-[11px] text-slate-600">{option.description}</span>}
                  </span>
                </label>
              ))}
            </div>
            {status === "OTHER" && (
              <input
                value={otherStatus}
                onChange={(e) => setOtherStatus(e.target.value)}
                placeholder="Enter existing complaint status"
                className="w-full border border-slate-300 rounded-lg p-2"
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="block font-bold text-slate-800">Forward to Supervisory Officer</label>
            <select
              value={soId}
              onChange={(e) => setSoId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2 bg-white"
            >
              {officers.map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.isPrimary ? "★ " : ""}{officer.name || officer.designation} ({officer.designation})
                </option>
              ))}
            </select>
            {selected?.role === 'OTHER' && (
              <input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Enter authorized supervisory officer name"
                className="w-full border border-slate-300 rounded-lg p-2"
              />
            )}
            {selected?.isPrimary && (
              <p className="flex items-center gap-1 text-[11px] text-emerald-700"><ShieldCheck className="w-3 h-3" /> Primary SO: DSP of the station subdivision.</p>
            )}
          </div>

          <label className="block space-y-1">
            <span className="font-bold text-slate-800">Remarks (optional)</span>
            <textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2" placeholder="Supervisory note for the final decision..." />
          </label>

          {(!resolvedStatus || !soName) && (
            <p className="flex items-center gap-1 text-rose-700"><AlertCircle className="w-3 h-3" /> Select a status and a supervisory officer to continue.</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isLoading || !resolvedStatus || !soName} className="bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer">
              {isLoading ? "Sending..." : "Send To SO"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
