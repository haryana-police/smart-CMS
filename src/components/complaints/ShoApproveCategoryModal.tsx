"use client";

import React, { useState } from "react";
import { CheckCircle, X, AlertCircle, Scale, ShieldCheck, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComplaintItem } from "@/types";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export type SHOCategoryOption = "NCR" | "FIR_RECOMMEND" | "CLOSURE";

interface ShoApproveCategoryModalProps {
  complaint: ComplaintItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    finalCategory: SHOCategoryOption;
    remarks: string;
  }) => Promise<void> | void;
  isLoading?: boolean;
}

export function ShoApproveCategoryModal({
  complaint,
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}: ShoApproveCategoryModalProps) {
  // Preselect based on EO recommendation if available
  const [selectedCategory, setSelectedCategory] = useState<SHOCategoryOption | "">(() => {
    if (!complaint) return "";
    if (complaint.eoRecommendedCategory) {
      const c = complaint.eoRecommendedCategory.toUpperCase();
      if (c === "NCR") return "NCR";
      if (c === "CLOSURE" || c === "CLOSE") return "CLOSURE";
      if (c.includes("FIR")) return "FIR_RECOMMEND";
    }
    if (complaint.eoOutcome === "FIR Recommend" || complaint.isRecommendedForFir) {
      return "FIR_RECOMMEND";
    }
    return "";
  });

  const [remarks, setRemarks] = useState("");

  useEscapeKey(isOpen && Boolean(complaint), onClose);

  if (!isOpen || !complaint) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory) return;
    onSubmit({
      finalCategory: selectedCategory,
      remarks: remarks.trim(),
    });
  };

  // Human-readable EO recommendation string
  const eoRecommendationDisplay = (() => {
    const raw = complaint.eoRecommendedCategory || (complaint.eoOutcome === "FIR Recommend" ? "FIR_RECOMMEND" : complaint.eoOutcome);
    if (!raw) return "Not specified";
    const u = raw.toUpperCase();
    if (u === "NCR") return "NCR (असंज्ञेय अपराध)";
    if (u === "FIR_RECOMMEND" || u.includes("FIR")) return "FIR Recommend (संज्ञेय अपराध)";
    if (u === "CLOSURE" || u === "CLOSE") return "Closure (निस्तारण / बंद)";
    return raw;
  })();

  const CATEGORY_OPTIONS: {
    value: SHOCategoryOption;
    label: string;
    description: string;
    statusEffect: string;
    badgeClass: string;
    icon: any;
  }[] = [
    {
      value: "NCR",
      label: "1. NCR",
      description: "Non-Cognizable Report — असंज्ञेय अपराध होने पर (रोजनामचा Auto-Suggestions & Drafts में ड्राफ्ट भेजा जाएगा)।",
      statusEffect: "Final Status: Complete (रोजनामचा Auto Suggestions & Drafts में असंज्ञेय अपराध रपट u/s 174 BNSS का ड्राफ्ट मुंशी हेतु जाएगा)",
      badgeClass: "border-blue-300 bg-blue-50/70 text-blue-900",
      icon: FileCheck,
    },
    {
      value: "FIR_RECOMMEND",
      label: "2. FIR Recommend",
      description: "Cognizable Offence Sanction — संज्ञेय अपराध होने पर FIR दर्ज करने की स्वीकृति (रोजनामचा Auto-Suggestions & Drafts में ड्राफ्ट भेजा जाएगा)।",
      statusEffect: "Final Status: FIR Recommend (Auto Suggestions & Drafts में संज्ञेय अपराध रपट जाएगी व 'Register FIR' बटन उपलब्ध रहेगा)",
      badgeClass: "border-red-300 bg-red-50/70 text-red-900",
      icon: Scale,
    },
    {
      value: "CLOSURE",
      label: "3. Closure",
      description: "Closure / Compromise / Civil Dispute — राजीनामा / दीवानी विवाद / असत्यापित।",
      statusEffect: "Final Status: Complete (मामला निस्तारित होकर बंद होगा व रोजनामचा GD ऑटो-सुझाव ड्राफ्ट में जाएगा)",
      badgeClass: "border-emerald-300 bg-emerald-50/70 text-emerald-900",
      icon: ShieldCheck,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 bg-emerald-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-200" />
            <div>
              <h3 className="font-bold text-sm">SHO Review &amp; Recommendation</h3>
              <p className="text-[11px] text-emerald-100">
                Recommendation is forwarded to the Supervisory Officer (SO) for the final decision
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
          {/* EO Recommendation Card (Crucial for SHO review) */}
          <div className="p-3.5 bg-blue-50/80 border-2 border-blue-200 rounded-xl space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <span className="font-mono font-bold text-slate-800">
                Complaint #{complaint.complaintNumber}
              </span>
              <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-blue-700 text-white tracking-wider">
                EO Recommendation
              </span>
            </div>
            <div className="text-slate-800 space-y-0.5 pt-0.5">
              <p>
                <strong>Enquiry Officer:</strong> {complaint.assignedEoName || complaint.eoRecommendedBy || "Enquiry Officer"}
              </p>
              <p className="text-sm">
                <strong>EO Recommendation:</strong>{" "}
                <span className="font-extrabold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-300">
                  {eoRecommendationDisplay}
                </span>
              </p>
              {complaint.eoRecommendedRemarks && (
                <p className="text-[11px] text-slate-600 italic pt-0.5">
                  &ldquo;{complaint.eoRecommendedRemarks}&rdquo;
                </p>
              )}
            </div>
          </div>

          {/* Mandatory SHO Final Category Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-slate-800 text-xs">
                Select SHO Final Authoritative Category (अनिवार्य):
              </label>
              <span className="text-[11px] text-rose-600 font-semibold">
                * Required to Approve
              </span>
            </div>

            <div className="space-y-2">
              {CATEGORY_OPTIONS.map((opt) => {
                const isSelected = selectedCategory === opt.value;
                const Icon = opt.icon;
                return (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer select-none ${
                      isSelected
                        ? "border-emerald-600 bg-emerald-50/70 shadow-2xs"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="shoFinalCategory"
                      value={opt.value}
                      checked={isSelected}
                      onChange={() => setSelectedCategory(opt.value)}
                      className="mt-0.5 w-4 h-4 text-emerald-600 border-slate-300 focus:ring-emerald-500"
                    />
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                          <Icon className="w-3.5 h-3.5 text-slate-700" />
                          <span>{opt.label}</span>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.2 rounded-full">
                            Authoritative Decision
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-normal">
                        {opt.description}
                      </p>
                      <p className={`text-[10px] font-semibold pt-0.5 ${
                        opt.value === "FIR_RECOMMEND" ? "text-red-700 font-bold" : "text-emerald-700"
                      }`}>
                        {opt.statusEffect}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Special note for FIR Recommend */}
          {selectedCategory === "FIR_RECOMMEND" && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-[11px] leading-relaxed flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>
                <strong>Notice:</strong> Selecting <strong>FIR Recommend</strong> will set the Complaint Status to <strong>&ldquo;FIR Recommend&rdquo;</strong> (not Complete). The complaint remains active in the FIR registration workflow and the <strong>&ldquo;Register FIR&rdquo;</strong> action will be available.
              </span>
            </div>
          )}

          {/* Remarks */}
          <div className="space-y-1">
            <label className="block font-semibold text-slate-700">
              SHO Supervisory Remarks / Directions (Optional)
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Findings verified and approved as per enquiry report..."
              className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
            />
          </div>

          {/* Modal Footer */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isLoading}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!selectedCategory || isLoading}
              className={`text-xs font-bold gap-1.5 shadow-xs cursor-pointer ${
                selectedCategory
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-slate-300 text-slate-500 cursor-not-allowed"
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{isLoading ? "Approving..." : "Approve & Set Final Category"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
