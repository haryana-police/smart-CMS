// Document generator for complaint intake verification proforma
import { ComplaintPreviewData } from "@/components/complaints/ComplaintVerificationModal";
import { escapeHtml } from "@/lib/utils";
import { relativePrefix } from "@/lib/complaintRelation";

export function generateComplaintIntakeHtml(data: ComplaintPreviewData, complaintNo: string): string {
  const e = escapeHtml;
  const primaryComp = data.complainants[0];
  const dateFormatted = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeFormatted = new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const complainantsHtml = data.complainants
    .map(
      (c, idx) => `
    <div style="margin-bottom: 12px; padding: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;">
      <div style="font-weight: bold; font-size: 13px; color: #0f172a;">
        #${idx + 1} ${e(c.name)} ${c.relativeName ? `(${e([relativePrefix(c.relationType, c.gender), c.relativeName.trim()].filter(Boolean).join(" "))})` : ""}
        <span style="float: right; font-family: monospace; color: #1e3a8a; background: #dbeafe; padding: 2px 6px; border-radius: 4px;">
          Mob: +91 ${e(c.mobile)}
        </span>
      </div>
      <div style="font-size: 11px; color: #334155; margin-top: 6px;">
        <strong>Gender/Age:</strong> ${e(c.gender || "—")} / ${c.age ? `${e(c.age)} Yrs` : "—"} |
        <strong>Nationality:</strong> ${e(c.nationalityChoice || "Indian")}
      </div>
      <div style="font-size: 11px; color: #334155; margin-top: 4px;">
        <strong>Present Address:</strong> ${e(c.presentAddress)}, ${e(c.presentCity)}, ${e(c.presentDistrict)}, ${e(c.presentState)}
      </div>
    </div>
  `
    )
    .join("");

  const accusedHtml =
    data.isAccusedKnown && data.accusedList.length > 0
      ? data.accusedList
          .map(
            (a, idx) => `
      <div style="margin-bottom: 8px; padding: 8px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; font-size: 12px;">
        <strong>#${idx + 1} ${e(a.name)} ${a.alias ? `(Alias: ${e(a.alias)})` : ""}</strong>
        ${a.phone ? `<span style="float: right; font-family: monospace;">Mob: ${e(a.phone)}</span>` : ""}
        <div style="font-size: 11px; color: #4b5563; margin-top: 3px;">
          <strong>Address:</strong> ${e(a.address || "Not specified")}
          ${a.relationWithComplainant ? ` | <strong>Relation:</strong> ${e(a.relationWithComplainant)}` : ""}
        </div>
      </div>
    `
          )
          .join("")
      : `<div style="padding: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-style: italic; font-size: 12px; color: #64748b;">
        Accused is unknown at preliminary stage (अज्ञात / To be identified during preliminary enquiry).
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Complaint Intake Verification Proforma - ${e(complaintNo)}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      line-height: 1.5;
      color: #0f172a;
      background: #fff;
      margin: 0;
      padding: 20px;
    }
    .sheet {
      border: 2px solid #000;
      border-radius: 8px;
      padding: 24px;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #000;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .seal {
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 2px;
      color: #0b192c;
    }
    h1 {
      font-size: 18px;
      font-weight: 900;
      text-transform: uppercase;
      margin: 4px 0;
      color: #000;
    }
    .subline {
      font-size: 12px;
      font-weight: bold;
      color: #334155;
      text-transform: uppercase;
    }
    .badge-bar {
      display: flex;
      justify-content: space-between;
      background: #f1f5f9;
      padding: 8px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 16px;
    }
    .sec-title {
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
      margin-top: 14px;
      margin-bottom: 8px;
      color: #0f172a;
    }
    .box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px;
      font-size: 12px;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 2px solid #000;
      padding-top: 24px;
      margin-top: 30px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="seal">HARYANA POLICE</div>
      <h1>Citizen Complaint Intake Verification Proforma</h1>
      <div class="subline">${e(data.policeStation)}, District ${e(data.district)}</div>
      <div style="font-size: 11px; color: #64748b; font-style: italic; margin-top: 2px;">
        (Under PPR Rule 22.48 &amp; Section 173(3) of Bharatiya Nagarik Suraksha Sanhita, 2023)
      </div>
    </div>

    <div class="badge-bar">
      <div><strong>Complaint No:</strong> <span style="font-family: monospace; color: #1e3a8a; font-weight: bold;">${e(complaintNo)}</span></div>
      <div><strong>Date/Time:</strong> ${e(dateFormatted)} ${e(timeFormatted)}</div>
      <div><strong>Channel:</strong> ${e(data.sourceChannel)}</div>
      <div><strong>Priority:</strong> ${e(data.priorityLevel)}</div>
    </div>

    <div class="sec-title">1. Complainant Particulars</div>
    ${complainantsHtml}

    <div class="sec-title">2. Accused / Suspect Particulars</div>
    ${accusedHtml}

    <div class="sec-title">3. Occurrence &amp; Allegation Particulars</div>
    <div class="box">
      <div style="margin-bottom: 6px;">
        <strong>Place of Incident:</strong> ${e(data.incidentPlace)} ${data.incidentLandmark ? `(Landmark: ${e(data.incidentLandmark)})` : ""} |
        <strong>Date/Time:</strong> ${data.isDateTimeKnown ? `${e(data.incidentDate)} ${e(data.incidentTime || "")}` : e(data.incidentApproxPeriod || "Undated")}
      </div>
      <div style="margin-bottom: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0;">
        <strong style="text-transform: uppercase; color: #0f172a;">Subject / विषय:</strong>
        <div style="font-weight: bold; font-size: 13px; color: #000; margin-top: 2px;">${e(data.complaintSubject)}</div>
      </div>
      <div style="padding-top: 6px; border-top: 1px solid #e2e8f0;">
        <strong style="text-transform: uppercase; color: #0f172a;">Brief Synopsis / विवरण:</strong>
        <div style="color: #1e293b; margin-top: 2px; white-space: pre-wrap;">${e(data.complaintDescription)}</div>
      </div>
    </div>

    ${
      data.isSho && data.shouldAssignEoNow && data.selectedEoName
        ? `
      <div class="sec-title">4. Immediate Enquiry Officer (EO) Allocation</div>
      <div style="padding: 10px; background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 6px; font-size: 12px;">
        <strong>Assigned Officer:</strong> ${e(data.selectedEoName)} (${e(data.selectedEoRank || "EO")}) |
        <strong>PNO:</strong> ${e(data.selectedEoPno || "—")} |
        <strong>Target:</strong> ${e(String(data.targetDays || 14))} Days
        ${data.assignedDirections ? `<div style="font-style: italic; color: #581c87; margin-top: 4px;">&ldquo;${e(data.assignedDirections)}&rdquo;</div>` : ""}
      </div>
    `
        : ""
    }

    <div class="footer">
      <div style="text-align: center; width: 140px;">
        <div style="height: 50px; border: 1px dashed #94a3b8; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #94a3b8;">
          Thumb / Sign
        </div>
        <div style="font-weight: bold; font-size: 11px; margin-top: 4px;">Complainant Signature</div>
      </div>

      <div style="text-align: right;">
        <div>______________________________________</div>
        <div style="font-weight: bold; font-size: 13px; color: #0f172a; margin-top: 4px;">${e(data.registeredBy)}</div>
        <div style="color: #475569; font-size: 11px;">Intake Officer / Duty Clerk</div>
        <div style="color: #64748b; font-size: 10px; font-family: monospace;">${e(data.policeStation)}, District ${e(data.district)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
