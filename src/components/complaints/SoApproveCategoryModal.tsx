"use client";

import React, { useState } from "react";
import { CheckCircle, X, Scale, ShieldCheck, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComplaintItem } from "@/types";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export type SOCategoryOption = "NCR" | "FIR_RECOMMEND" | "CLOSURE" | "DISPOSED_MUTUAL_ACCORD" | "DISPOSED_CIVIL_NATURE" | "DISPOSED_UNSUBSTANTIATED" | "OTHER";

interface SoApproveCategoryModalProps {
  complaint: ComplaintItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { finalCategory: string; remarks: string }) => Promise<void> | void;
  isLoading?: boolean;
}

export function SoApproveCategoryModal({ complaint, isOpen, onClose, onSubmit, isLoading = false }: SoApproveCategoryModalProps) {
  const initial = String(complaint?.shoFinalCategory || complaint?.finalCategory || complaint?.eoRecommendedCategory || "").toUpperCase();
  const [selected, setSelected] = useState<SOCategoryOption | "">(
    initial.includes("FIR") ? "FIR_RECOMMEND" : initial === "NCR" ? "NCR" : initial === "CLOSURE" ? "CLOSURE" :
      ["DISPOSED_MUTUAL_ACCORD", "DISPOSED_CIVIL_NATURE", "DISPOSED_UNSUBSTANTIATED"].includes(initial) ? initial as SOCategoryOption : ""
  );
  const [other, setOther] = useState("");
  const [remarks, setRemarks] = useState("");

  useEscapeKey(isOpen, onClose);
  if (!isOpen || !complaint) return null;

  const options = [
    { value: "NCR" as const, label: "NCR", description: "Non-Cognizable Report — complaint completed under BNSS 174.", icon: FileCheck },
    { value: "FIR_RECOMMEND" as const, label: "FIR Recommend", description: "Sanction regular FIR registration; Register FIR button becomes available.", icon: Scale },
    { value: "CLOSURE" as const, label: "Closure", description: "Close the complaint as settled / civil / unsubstantiated.", icon: ShieldCheck },
    { value: "DISPOSED_MUTUAL_ACCORD" as const, label: "Disposed — Mutual Accord", description: "Settled between the parties.", icon: ShieldCheck },
    { value: "DISPOSED_CIVIL_NATURE" as const, label: "Disposed — Civil Nature", description: "Civil dispute; no criminal offence made out.", icon: ShieldCheck },
    { value: "DISPOSED_UNSUBSTANTIATED" as const, label: "Disposed — Unsubstantiated", description: "Allegations not substantiated.", icon: ShieldCheck },
    { value: "OTHER" as const, label: "Other existing status", description: "Use another approved complaint disposal status.", icon: CheckCircle },
  ];

  const finalCategory = selected === "OTHER" ? other.trim() : selected;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 flex flex-col max-h-[92vh]">
        <div className="p-4 bg-emerald-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-200" />
            <div>
              <h3 className="font-bold text-sm">SO Final Approval</h3>
              <p className="text-[11px] text-emerald-100">Authoritative final status by Supervisory Officer</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isLoading} className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (finalCategory) onSubmit({ finalCategory, remarks: remarks.trim() }); }}
          className="p-5 space-y-4 text-xs overflow-y-auto"
        >
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
            <p><strong>Complaint:</strong> {complaint.complaintNumber}</p>
            <p><strong>SHO recommendation:</strong> {String(complaint.shoFinalCategory || complaint.finalCategory || complaint.eoRecommendedCategory || "Not specified")}</p>
            {complaint.soName && <p><strong>Forwarded to:</strong> {complaint.soName}</p>}
          </div>

          <div className="space-y-2">
            <label className="font-bold text-slate-800">Select final status (mandatory)</label>
            {options.map((option) => {
              const Icon = option.icon;
              return (
                <label key={option.value} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer ${selected === option.value ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                  <input type="radio" name="so-final" checked={selected === option.value} onChange={() => setSelected(option.value)} className="mt-0.5" />
                  <Icon className="w-4 h-4 mt-0.5 text-emerald-700 shrink-0" />
                  <span>
                    <span className="block font-bold text-slate-900">{option.label}</span>
                    <span className="block text-[11px] text-slate-600">{option.description}</span>
                  </span>
                </label>
              );
            })}
            {selected === "OTHER" && (
              <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Enter complaint status" className="w-full border border-slate-300 rounded-lg p-2" />
            )}
          </div>

          <label className="block space-y-1">
            <span className="font-bold text-slate-800">SO remarks (optional)</span>
            <textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2" />
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isLoading || !finalCategory} className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer">
              {isLoading ? "Approving..." : "Approve & Finalize"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
