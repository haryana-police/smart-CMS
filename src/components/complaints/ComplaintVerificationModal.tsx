"use client";

import React, { useRef, useEffect } from "react";
import {
  FileText,
  Printer,
  Edit3,
  CheckCircle2,
  X,
  Shield,
  User,
  MapPin,
  Calendar,
  Phone,
  AlertCircle,
  FileCheck2,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { relativePrefix } from "@/lib/complaintRelation";
import { printA4Element, downloadA4DocumentAsHtml } from "@/utils/printElement";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export interface ComplaintPreviewData {
  sourceChannel: string;
  priorityLevel: string;
  complainants: Array<{
    name: string;
    relationType?: string;
    relativeName?: string;
    gender?: string;
    age?: string;
    nationalityChoice?: string;
    otherNationality?: string;
    mobile: string;
    presentAddress: string;
    presentCity: string;
    presentDistrict: string;
    presentState: string;
    presentCountry?: string;
  }>;
  isAccusedKnown: boolean;
  accusedList: Array<{
    name: string;
    address: string;
    phone?: string;
    alias?: string;
    relationWithComplainant?: string;
  }>;
  incidentPlace: string;
  incidentLandmark?: string;
  isDateTimeKnown: boolean;
  incidentDate?: string;
  incidentTime?: string;
  incidentApproxPeriod?: string;
  incidentCategory: string;
  incidentDetails: string;
  complaintSubject: string;
  complaintDescription: string;
  isFirRegistered: boolean;
  firNumber?: string;
  firDate?: string;
  complaintClassification?: string;
  complaintPurpose?: string;
  directSendToFir?: boolean;
  directSendToFirChoice?: "YES" | "NO";
  attachmentsCount: number;
  isSho: boolean;
  shouldAssignEoNow: boolean;
  selectedEoName?: string;
  selectedEoRank?: string;
  selectedEoPno?: string;
  assignedDirections?: string;
  targetDays?: number;
  policeStation: string;
  district: string;
  registeredBy: string;
}

interface ComplaintVerificationModalProps {
  isOpen: boolean;
  previewData: ComplaintPreviewData | null;
  isSubmitting: boolean;
  onEdit: () => void;
  onSubmit: () => void;
  readOnlyPreview?: boolean;
}

export function ComplaintVerificationModal({
  isOpen,
  previewData,
  isSubmitting,
  onEdit,
  onSubmit,
  readOnlyPreview = false,
}: ComplaintVerificationModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  useEscapeKey(isOpen, onEdit);

  if (!isOpen || !previewData) return null;

  const handlePrint = () => {
    printA4Element("printable-complaint-preview", `Verification_${previewData.policeStation}`);
  };

  const handleDownload = () => {
    downloadA4DocumentAsHtml(
      "printable-complaint-preview",
      `Complaint_Verification_${previewData.policeStation}`,
      "Complaint Intake Verification Proforma"
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-hidden animate-in fade-in-50"
      onClick={onEdit}
    >
      <div
        className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-400 overflow-hidden flex flex-col my-auto max-h-[95vh] h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="no-print shrink-0 flex items-center justify-between px-5 py-3 bg-[#0b192c] text-white border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-amber-400/20 border border-amber-400/30 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight text-white flex items-center gap-2">
                <span>Complaint Preview</span>
                <span className="text-[10px] bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded uppercase">
                  Draft Preview
                </span>
              </h3>
              <p className="text-[11px] text-slate-300">
                Official complaint intake format preview
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!readOnlyPreview && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Download A4</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-300" />
                  <span>Print Preview</span>
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 text-white hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Preview Sheet */}
        <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-0 p-4 sm:p-6 bg-slate-200/70">
          <div
            id="printable-complaint-preview"
            ref={printRef}
            className="cms-paper-sheet w-full max-w-[800px] mx-auto bg-white border border-slate-400 p-8 sm:p-12 text-slate-950 space-y-5 font-serif shadow-sm print:shadow-none print:border-none print:p-0 relative my-3 min-h-[800px] h-auto"
            style={{ lineHeight: "1.6" }}
          >
            {/* Seal & Department Title */}
            <div className="text-center pb-3 border-b-2 border-slate-900">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Shield className="w-7 h-7 text-[#0b192c]" />
                <span className="text-xs font-bold tracking-widest uppercase text-[#0b192c]">
                  HARYANA POLICE • हरियाणा पुलिस
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold uppercase tracking-wide text-slate-950">
                Citizen Complaint Intake Verification Proforma
              </h1>
              <p className="text-xs font-semibold uppercase text-slate-800 tracking-wider mt-0.5">
                {previewData.policeStation}, District {previewData.district}
              </p>
              <p className="text-[11px] text-slate-600 italic mt-0.5">
                (Under PPR Rule 22.48 &amp; Section 173(3) of Bharatiya Nagarik Suraksha Sanhita, 2023)
              </p>
            </div>

            {/* Quick Summary Grid */}
            <div className="border border-slate-400 p-3 bg-white grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-sans">
              <div>
                <span className="text-slate-600 font-semibold block text-[10px] uppercase">Channel:</span>
                <span className="font-bold text-slate-950">{previewData.sourceChannel}</span>
              </div>
              <div>
                <span className="text-slate-600 font-semibold block text-[10px] uppercase">Priority:</span>
                <span className="font-bold text-slate-950">{previewData.priorityLevel}</span>
              </div>
              <div>
                <span className="text-slate-600 font-semibold block text-[10px] uppercase">Crime / Category:</span>
                <span className="font-bold text-slate-950">{previewData.incidentCategory}</span>
              </div>
              <div>
                <span className="text-slate-600 font-semibold block text-[10px] uppercase">Date of Intake:</span>
                <span className="font-mono font-bold text-slate-950">{formatDate(new Date())}</span>
              </div>
            </div>

            {/* 1. Complainant Details */}
            <div className="space-y-1.5 font-sans">
              <div className="flex items-center gap-1.5 border-b border-slate-400 pb-1">
                <User className="w-3.5 h-3.5 text-slate-700" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-950">
                  1. Complainant Particulars ({previewData.complainants.length} Person{previewData.complainants.length > 1 ? "s" : ""})
                </h3>
              </div>
              {previewData.complainants.map((comp, idx) => (
                <div key={idx} className="border border-slate-300 p-3 bg-white text-xs space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-bold text-slate-950">
                      #{idx + 1} {comp.name} {comp.relativeName ? `(${[relativePrefix(comp.relationType, comp.gender), comp.relativeName.trim()].filter(Boolean).join(" ")})` : ""}
                    </span>
                    <span className="font-mono font-bold text-slate-900 border border-slate-300 px-1.5 py-0.2">
                      Mob: +91 {comp.mobile}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px] text-slate-700 pt-1 border-t border-slate-200">
                    <div>
                      <strong>Gender / Age:</strong> {comp.gender || "—"} / {comp.age ? `${comp.age} Yrs` : "—"}
                    </div>
                    <div>
                      <strong>Nationality:</strong> {comp.nationalityChoice || "Indian"}
                    </div>
                    <div className="sm:col-span-3">
                      <strong>Address:</strong> {comp.presentAddress}, {comp.presentCity}, {comp.presentDistrict}, {comp.presentState}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 2. Accused Details */}
            <div className="space-y-1.5 font-sans">
              <div className="flex items-center gap-1.5 border-b border-slate-400 pb-1">
                <Shield className="w-3.5 h-3.5 text-slate-700" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-950">
                  2. Accused / Suspect Particulars
                </h3>
              </div>
              {previewData.isAccusedKnown && previewData.accusedList.length > 0 ? (
                <div className="space-y-1.5">
                  {previewData.accusedList.map((acc, idx) => (
                    <div key={idx} className="border border-slate-300 p-3 bg-white text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-950">
                          #{idx + 1} {acc.name} {acc.alias ? `(Alias: ${acc.alias})` : ""}
                        </span>
                        {acc.phone && <span className="font-mono text-slate-800">Mob: {acc.phone}</span>}
                      </div>
                      <p className="text-[11px] text-slate-700">
                        <strong>Address:</strong> {acc.address || "Not specified"}
                      </p>
                      {acc.relationWithComplainant && (
                        <p className="text-[11px] text-slate-600">
                          <strong>Relation with Complainant:</strong> {acc.relationWithComplainant}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-slate-300 p-2.5 bg-slate-50 text-xs text-slate-700 italic">
                  Accused is unknown at this preliminary intake stage (अज्ञात / To be identified during enquiry).
                </div>
              )}
            </div>

            {/* 3. Incident Place, Date & Details */}
            <div className="space-y-1.5 font-sans">
              <div className="flex items-center gap-1.5 border-b border-slate-400 pb-1">
                <MapPin className="w-3.5 h-3.5 text-slate-700" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-950">
                  3. Occurrence &amp; Allegation Particulars
                </h3>
              </div>
              <div className="border border-slate-400 p-3.5 bg-white text-xs space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-800">
                  <div>
                    <strong>Place of Incident:</strong> {previewData.incidentPlace}
                    {previewData.incidentLandmark ? ` (Near: ${previewData.incidentLandmark})` : ""}
                  </div>
                  <div>
                    <strong>Date &amp; Time:</strong>{" "}
                    {previewData.isDateTimeKnown
                      ? `${previewData.incidentDate || "—"} at ${previewData.incidentTime || "—"}`
                      : previewData.incidentApproxPeriod || "Approximate / Undated"}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-300">
                  <strong className="block text-slate-800 mb-0.5 uppercase tracking-wide text-[11px]">
                    Subject:
                  </strong>
                  <p className="text-slate-950 font-bold text-xs sm:text-sm">
                    {previewData.complaintSubject}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-300">
                  <strong className="block text-slate-800 mb-0.5 uppercase tracking-wide text-[11px]">
                    Brief Synopsis:
                  </strong>
                  <p className="text-slate-900 text-xs leading-relaxed whitespace-pre-wrap">
                    {previewData.complaintDescription}
                  </p>
                </div>

                {previewData.incidentDetails && previewData.incidentDetails !== previewData.complaintDescription && (
                  <div className="pt-2 border-t border-slate-300">
                    <strong className="block text-slate-800 mb-0.5 uppercase tracking-wide text-[11px]">
                      Additional Incident Notes:
                    </strong>
                    <p className="text-slate-800 text-xs leading-relaxed whitespace-pre-wrap">
                      {previewData.incidentDetails}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Direct Send to FIR Status */}
            <div className="space-y-1.5 font-sans">
              <div className="flex items-center gap-1.5 border-b border-slate-400 pb-1">
                <Shield className="w-3.5 h-3.5 text-slate-700" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-950">
                  4. Direct Send to FIR Decision
                </h3>
              </div>
              <div className="border border-slate-300 p-3 bg-white text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-950">
                    Direct Send to FIR?: {previewData.directSendToFir ? "YES" : "NO"}
                  </span>
                  <span className="text-[10px] font-bold border border-slate-400 px-1.5 py-0.2">
                    {previewData.directSendToFir ? "Direct FIR Route" : "Standard Enquiry Route"}
                  </span>
                </div>
                <p className="text-[11px] mt-1 text-slate-700">
                  {previewData.directSendToFir
                    ? "Preliminary enquiry bypassed. Complaint will appear with status “FIR Register” in register for SHO direct FIR registration."
                    : "Standard enquiry workflow with Enquiry Officer preliminary spot verification and findings report."}
                </p>
              </div>
            </div>

            {/* 5. EO Allocation Preview */}
            {!previewData.directSendToFir && previewData.isSho && previewData.shouldAssignEoNow && previewData.selectedEoName && (
              <div className="space-y-1.5 font-sans">
                <div className="flex items-center gap-1.5 border-b border-slate-400 pb-1">
                  <FileCheck2 className="w-3.5 h-3.5 text-slate-700" />
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-950">
                    5. Immediate Enquiry Officer (EO) Allocation
                  </h3>
                </div>
                <div className="border border-slate-300 p-3 bg-white text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-950">
                      Assigned Officer: {previewData.selectedEoName} ({previewData.selectedEoRank})
                    </span>
                    <span className="font-mono text-slate-800 text-[11px]">
                      PNO: {previewData.selectedEoPno || "—"} • Target: {previewData.targetDays || 14} Days
                    </span>
                  </div>
                  {previewData.assignedDirections && (
                    <p className="text-[11px] text-slate-800 italic pt-1 border-t border-slate-200">
                      &ldquo;{previewData.assignedDirections}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Footer Signatures */}
            <div className="pt-4 border-t-2 border-slate-900 flex items-end justify-between text-xs font-sans">
              <div className="text-center w-40">
                <div className="h-12 border border-dashed border-slate-400 flex items-center justify-center text-[10px] text-slate-500">
                  Complainant Sign / Thumb
                </div>
                <p className="mt-1 font-bold text-slate-800">COMPLAINANT SIGNATURE</p>
              </div>

              <div className="text-right space-y-0.5">
                <p className="text-slate-400">______________________________________</p>
                <p className="font-bold text-slate-950">
                  {previewData.registeredBy}
                </p>
                <p className="text-slate-700 text-[11px]">
                  Intake Officer / Duty Clerk
                </p>
                <p className="text-slate-600 font-mono text-[11px]">
                  {previewData.policeStation}, District {previewData.district}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions: Edit Form OR Confirm & Register (Hidden in Read-Only Preview mode) */}
        {!readOnlyPreview && (
          <div className="no-print shrink-0 p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Submitting will register this complaint into the central register and auto-save this proforma under Documents.
              </span>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={onEdit}
                disabled={isSubmitting}
                className="text-xs font-bold gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                <span>Edit Form</span>
              </Button>

              <Button
                type="button"
                variant="danger"
                size="md"
                onClick={onSubmit}
                isLoading={isSubmitting}
                className="text-xs sm:text-sm font-bold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 shadow-md transition-all active:scale-98 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Submit &amp; Register Complaint</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
