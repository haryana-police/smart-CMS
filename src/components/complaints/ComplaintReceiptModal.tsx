"use client";

import { formatComplaintRelative } from "@/lib/complaintRelation";

import React, { useRef, useEffect } from "react";
import {
  Printer,
  X,
  Shield,
  FileCheck2,
  Building,
  UserCheck,
  AlertCircle,
  FileDown,
} from "lucide-react";
import { ComplaintItem } from "@/types";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/utils";
import { printA4Element, downloadA4DocumentAsHtml } from "@/utils/printElement";
import { useEscapeKey } from "@/hooks/useEscapeKey";

interface ComplaintReceiptModalProps {
  complaint: ComplaintItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ComplaintReceiptModal({
  complaint,
  isOpen,
  onClose,
}: ComplaintReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  useEscapeKey(isOpen && Boolean(complaint), onClose);

  if (!isOpen || !complaint) return null;

  // Format date and time
  const formattedDateTime = (() => {
    try {
      const d = complaint.createdAt ? new Date(complaint.createdAt) : new Date();
      return formatDateTime(d);
    } catch {
      return formatDate(new Date());
    }
  })();

  const handlePrint = () => {
    printA4Element("printable-receipt", `Receipt_${complaint.complaintNumber}`);
  };

  const handleDownload = () => {
    downloadA4DocumentAsHtml(
      "printable-receipt",
      `Receipt_${complaint.complaintNumber}`,
      `Complaint Receipt - ${complaint.complaintNumber}`
    );
  };

  // Determine if Enquiry Officer (EO / IO) is currently assigned
  const isEoAssigned = Boolean(
    complaint.assignedEoName &&
    complaint.assignedEoName.trim() !== "" &&
    complaint.assignedEoName !== "Not Assigned" &&
    complaint.assignedEoName !== "None" &&
    complaint.assignedEoName !== "Pending"
  );

  // IO Details (if assigned)
  const ioRank = complaint.assignedEoRank || "Sub-Inspector";
  const ioName = complaint.assignedEoName || "";
  const ioBeltNumber = complaint.assignedEoBeltNumber || complaint.assignedEoPno || "—";
  const ioMobile = complaint.assignedEoPhone || "—";

  // Station SHO Details (displayed when IO is not assigned)
  const shoRank = "Inspector (SHO)";
  const shoName = complaint.policeStation ? `SHO In-charge (${complaint.policeStation})` : "Station House Officer";
  const shoBeltNumber = "SHO";
  const shoMobile = "—";

  // MHC details fallback (station-neutral, avoid cross-district KKR leak)
  const isMhcInvalid = !complaint.mhcName || complaint.mhcName.includes("Inspector");
  const mhcRank = complaint.mhcRank || "MHC";
  const mhcName = isMhcInvalid ? `Station MHC (${complaint.policeStation || "Duty Desk"})` : complaint.mhcName;
  const mhcBeltNumber = !complaint.mhcBeltNumber || complaint.mhcBeltNumber === "882/KKR" ? "MHC-Desk" : complaint.mhcBeltNumber;
  const mhcMobile = isMhcInvalid ? "—" : (complaint.mhcPhone || "—");

  // Complainant Details
  const complainantRelative = formatComplaintRelative(complaint);
  const complainantFullName = complaint.complainantName
    ? `${complaint.complainantName}${complainantRelative ? ` (${complainantRelative})` : ""}`
    : "Citizen Complainant";

  const fullAddress = [
    complaint.complainantAddress,
    complaint.complainantCity,
    complaint.complainantDistrict,
    complaint.complainantState || "Haryana",
  ]
    .filter(Boolean)
    .join(", ");

  const respondents = (complaint.accusedList ?? []).filter((person) =>
    [person.name, person.alias, person.fatherName, person.relativeName, person.address, person.phone, person.relationWithComplainant]
      .some((value) => value?.trim())
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-hidden animate-in fade-in-50"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-400 overflow-hidden flex flex-col my-auto max-h-[95vh] h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar (Hidden in Print) */}
        <div className="no-print shrink-0 flex items-center justify-between px-5 py-3 bg-[#0b192c] text-white border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-amber-500/20 border border-amber-400/40 flex items-center justify-center">
              <FileCheck2 className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight text-white">
                Receipt of registered complaints
              </h3>
              <p className="text-[11px] text-slate-300">
                Official Proforma • PPR 22.48 &amp; BNSS 173(3)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              <span>Print Receipt</span>
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-white hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Body - Clean A4 Proforma */}
        <div
          ref={scrollContainerRef}
          className="overflow-y-auto flex-1 min-h-0 p-4 sm:p-6 bg-slate-200/70"
        >
          <div
            id="printable-receipt"
            ref={receiptRef}
            className="cms-paper-sheet w-full max-w-[800px] mx-auto bg-white border border-slate-400 p-6 sm:p-8 text-slate-950 space-y-4 font-sans shadow-md relative my-3 min-h-[750px] h-auto"
            style={{ lineHeight: "1.5" }}
          >
            {/* Header Title */}
            <div className="text-center pb-3 border-b-2 border-slate-900">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Shield className="w-7 h-7 text-[#0b192c]" />
                <span className="text-xs font-bold tracking-widest uppercase text-[#0b192c]">
                  HARYANA POLICE • हरियाणा पुलिस
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold uppercase tracking-wide text-slate-950">
                Receipt of Registered Complaints
              </h1>
              <p className="text-xs font-semibold uppercase text-slate-800 tracking-wider mt-0.5">
                {complaint.policeStation || "PS City Panipat"}, District {complaint.district || "Panipat"}
              </p>
              <p className="text-[11px] text-slate-600 italic mt-0.5">
                (Statutory Intake Slip under PPR Rule 22.48 &amp; Section 173(3) BNSS, 2023)
              </p>
            </div>

            {/* Acknowledgement No & Date Time */}
            <div className="border border-slate-400 p-3 bg-white flex flex-row items-center justify-between gap-2 text-xs sm:text-sm font-sans">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">Station Complaint No:</span>
                <span className="font-mono font-bold text-slate-950 border border-slate-400 px-2.5 py-0.5 bg-slate-50">
                  {complaint.complaintNumber}
                </span>
                {complaint.fivePNumber && (
                  <span className="font-mono font-bold text-purple-900 border border-purple-400 px-2.5 py-0.5 bg-purple-50">
                    5-P Ref: {complaint.fivePNumber}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <span className="font-bold text-slate-800">Date &amp; Time:</span>
                <span className="font-mono text-slate-950 font-semibold">
                  {formattedDateTime}
                </span>
              </div>
            </div>

            {/* Citizen Particulars */}
            <div className="border border-slate-400 p-3.5 bg-white space-y-2 text-xs sm:text-sm font-sans">
              <div className="flex flex-row items-start gap-2">
                <span className="font-bold text-slate-800 w-[170px] shrink-0">
                  Complainant Name:
                </span>
                <span className="font-bold text-slate-950 break-words flex-1">
                  {complainantFullName}
                </span>
              </div>

              <div className="flex flex-row items-start gap-2">
                <span className="font-bold text-slate-800 w-[170px] shrink-0">
                  Address:
                </span>
                <span className="text-slate-900 flex-1">
                  {fullAddress || "Not specified"}
                </span>
              </div>

              <div className="flex flex-row items-start gap-2">
                <span className="font-bold text-slate-800 w-[170px] shrink-0">
                  Mobile No:
                </span>
                <span className="font-mono font-bold text-slate-950 flex-1">
                  +91 {complaint.complainantMobile || "—"}
                </span>
              </div>

              <div className="flex flex-row items-start gap-2 pt-2 border-t border-slate-300">
                <span className="font-bold text-slate-800 w-[170px] shrink-0 uppercase tracking-wide">
                  Subject:
                </span>
                <span className="font-bold text-slate-950 flex-1 leading-snug">
                  {complaint.subject || complaint.complaintSubject || complaint.categoryDisplay || "Formal Written Citizen Complaint"}
                </span>
              </div>
            </div>

            {respondents.length > 0 && (
              <section className="border border-slate-400 bg-white p-3.5 text-xs sm:text-sm font-sans">
                <h2 className="border-b border-slate-300 pb-2 font-bold uppercase tracking-wide text-slate-950">
                  Respondent Details
                </h2>
                <ol className="divide-y divide-slate-200">
                  {respondents.map((person, index) => (
                    <li key={person.id ?? index} className="break-inside-avoid space-y-1 py-2 [overflow-wrap:anywhere]">
                      <p className="font-bold text-slate-950">
                        {respondents.length > 1 && `${index + 1}. `}
                        {person.name?.trim() || "Name not specified"}
                        {person.alias?.trim() && <span className="font-normal"> (Alias: {person.alias.trim()})</span>}
                      </p>
                      {(person.fatherName?.trim() || person.relativeName?.trim()) && (
                        <p><strong>{person.fatherName?.trim() ? "Father / Guardian:" : "Relative:"}</strong> {person.fatherName?.trim() || person.relativeName?.trim()}</p>
                      )}
                      {person.relationWithComplainant?.trim() && (
                        <p><strong>Relation to complainant:</strong> {person.relationWithComplainant.trim()}</p>
                      )}
                      {person.address?.trim() && <p><strong>Address:</strong> {person.address.trim()}</p>}
                      {person.phone?.trim() && <p><strong>Mobile No:</strong> {person.phone.trim()}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Officer Particulars */}
            <div className="grid grid-cols-2 gap-3 font-sans">
              {/* Assigned IO Details */}
              <div className="border border-slate-400 p-3 bg-white space-y-1.5 text-xs">
                <div className="flex items-center justify-between pb-1 border-b border-slate-300">
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-slate-700" />
                    <h4 className="font-bold uppercase tracking-wider text-[11px] text-slate-950">
                      {isEoAssigned ? "Assigned IO Details" : "Station SHO In-Charge"}
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-700 border border-slate-300 px-1 py-0.5 bg-slate-50">
                    {isEoAssigned ? "EO Assigned" : "IO Not Assigned"}
                  </span>
                </div>
                <div className="space-y-0.5 text-slate-900">
                  <p>
                    <span className="font-semibold text-slate-700">Rank:</span>{" "}
                    <span className="text-slate-950">
                      {isEoAssigned ? ioRank : shoRank}
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Name:</span>{" "}
                    <span className="font-bold text-slate-950">
                      {isEoAssigned ? ioName : shoName}
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Belt Number:</span>{" "}
                    <span className="font-mono text-slate-950">
                      {isEoAssigned ? ioBeltNumber : shoBeltNumber}
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Mobile Number:</span>{" "}
                    <span className="font-mono text-slate-950">
                      +91 {isEoAssigned ? ioMobile : shoMobile}
                    </span>
                  </p>
                </div>
              </div>

              {/* MHC Details */}
              <div className="border border-slate-400 p-3 bg-white space-y-1.5 text-xs">
                <div className="flex items-center justify-between pb-1 border-b border-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-slate-700" />
                    <h4 className="font-bold uppercase tracking-wider text-[11px] text-slate-950">
                      MHC Desk
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-700 border border-slate-300 px-1 py-0.5 bg-slate-50">
                    Station Staff
                  </span>
                </div>
                <div className="space-y-0.5 text-slate-900">
                  <p>
                    <span className="font-semibold text-slate-700">Rank:</span>{" "}
                    <span className="text-slate-950">{mhcRank}</span>
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Name:</span>{" "}
                    <span className="font-bold text-slate-950">{mhcName}</span>
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Belt Number:</span>{" "}
                    <span className="font-mono text-slate-950">{mhcBeltNumber}</span>
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Mobile Number:</span>{" "}
                    <span className="font-mono text-slate-950">+91 {mhcMobile}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Note if IO not assigned */}
            {!isEoAssigned && (
              <div className="border border-slate-300 p-2.5 bg-slate-50 text-xs text-slate-800 font-sans">
                <p className="font-bold text-slate-900 mb-0.5">
                  सूचना: जांच अधिकारी (IO) अभी नियुक्त नहीं है
                </p>
                <p className="text-[11px] text-slate-700 leading-relaxed">
                  यह शिकायत थाना पंजिका में दर्ज हो चुकी है और वर्तमान में थाना प्रभारी (SHO) के सीधे पर्यवेक्षण में है। जैसे ही जांच अधिकारी (EO/IO) नियुक्त किया जाएगा, इस रसीद पर जांच अधिकारी का विवरण प्रदर्शित हो जाएगा।
                </p>
              </div>
            )}

            {/* Statutory Note */}
            <div className="border border-slate-300 p-2.5 bg-slate-50 text-[10px] text-slate-600 leading-relaxed font-sans">
              <strong className="text-slate-800">Legal Note / वैधानिक सूचना:</strong> यह रसीद थाना दैनिकी (Roznamcha GD) और केंद्रीय शिकायत पंजिका में विधिवत प्रविष्टि के उपरांत जारी की गई है। धारा 173(3) BNSS के अंतर्गत 14 दिनों के भीतर प्रारंभिक जांच पूर्ण कर निष्पक्ष अग्रिम कार्यवाही अमल में लाई जाएगी।
            </div>

            {/* Stamp & Signature Footer */}
            <div className="pt-4 border-t-2 border-slate-900 flex flex-row items-end justify-between text-xs font-sans">
              <div className="text-center w-36">
                <div className="h-12 border border-dashed border-slate-400 flex items-center justify-center text-[10px] text-slate-500">
                  Station Seal
                </div>
                <p className="mt-1 font-bold text-slate-800">POLICE STATION SEAL</p>
              </div>

              <div className="text-right space-y-0.5">
                <p className="text-slate-400">______________________________________</p>
                <p className="font-bold text-slate-950">
                  {mhcName} ({mhcRank})
                </p>
                <p className="text-slate-700 text-[11px]">
                  Receiving Officer
                </p>
                <p className="text-slate-600 font-mono text-[11px]">
                  Belt No: {mhcBeltNumber} • {complaint.policeStation || "PS City Panipat"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Note (Hidden in Print) */}
        <div className="no-print shrink-0 px-5 py-2.5 bg-slate-100 border-t border-slate-300 flex items-center justify-between">
          <p className="text-xs text-slate-600">
            Recorded in the station diary and archived in CMS Haryana database.
          </p>
        </div>
      </div>
    </div>
  );
}
