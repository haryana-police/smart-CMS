import type {FIRItem} from "@/types";
import {recordedCalendarDate} from "@/lib/dataIntegrity";
import { stationStaffService } from "./stationStaffService";
import { isComplaintResolved } from "@/lib/complaintIntegrity";
import type { IgpBriefing } from "@/lib/igpTemplate";
import {
  CrimeSitrepData,
  WeeklyCrimeDiaryData,
  SitrepFirEntry,
  SitrepHeadCount,
  SitrepArrestEntry,
  SitrepRecoveryEntry,
  SitrepSectionModification,
  SitrepDisposalEntry,
  SitrepReopenedCase,
  SitrepRukkaEntry,
  SitrepUploadSummary,
  UiCasePartA,
  PartialChallanCase,
  UnderCheckingChallan,
  PendingComplaint05P,
  AdampataFile,
  Parcha12StatePending,
  SavedReportEntry,
} from "@/types/reports";
import { firService } from "./firService";
import { ComplaintService } from "./complaintService";
import { GeneralDiaryService } from "./generalDiaryService";
import { RegistrationService } from "./registrationService";

// Calculate days between two dates
function getDaysDiff(dateStr: string): number {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 0;
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
}

// Determines age category for UI cases
function getAgeCategory(dateStr: string): UiCasePartA["ageCategory"] {
  const days = getDaysDiff(dateStr);
  if (days > 730) return "OVER TWO YEARS";
  if (days > 365) return "OVER ONE YEAR";
  if (days > 180) return "OVER SIX MONTHS";
  if (days > 90) return "OVER THREE MONTHS";
  return "UNDER THREE MONTHS";
}

// Helper to extract clean YYYY-MM-DD from various date formats
function parseToIsoDate(d: any): string {
  if (!d) return "";
  if (typeof d === "string") {
    const recorded=recordedCalendarDate(d);if(recorded)return recorded;
    const iso = d.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const slash = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;
    const hyphen = d.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (hyphen) return `${hyphen[3]}-${hyphen[2]}-${hyphen[1]}`;
  }
  try {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) return dt.toISOString().split("T")[0];
  } catch {}
  return "";
}

// Computes previous day in YYYY-MM-DD
function computePreviousDayIso(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().split("T")[0];
}

// Formats YYYY-MM-DD into DD/MM/YYYY
export function formatDisplayDateIn(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

export const ReportsService = {
  // Maximum allowed date for SITREP selection (cannot exceed today or latest record date)
  getLatestAllowedDate: (): string => {
    const allFirs = firService.getAllFirs();
    let maxDate = "";
    allFirs.forEach((f) => {
      const d1 = parseToIsoDate(f.firDate);
      if (d1 && d1 > maxDate) maxDate = d1;
      const d2 = parseToIsoDate(f.createdAt);
      if (d2 && d2 > maxDate) maxDate = d2;
    });
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const todayIso = `${y}-${m}-${d}`;
    return todayIso;
  },

  // 1. DYNAMIC CRIME SITREP (Strict 24-hr audit of the back day of latest date)
  getCrimeSitrep: async (filterDate?: string, filterStation?: string, district?: string): Promise<CrimeSitrepData> => {
    const activeDistrict = (district || "Panipat").toUpperCase();

    const allFirs = firService.getAllFirs();
    const allGd = await GeneralDiaryService.getEntries();
    const maxAllowed = ReportsService.getLatestAllowedDate();

    // Determine reference date (Report Date)
    let latestDate = filterDate ? parseToIsoDate(filterDate) : "";
    // User constraint: Report date cannot exceed latest date
    if (latestDate && latestDate > maxAllowed) {
      latestDate = maxAllowed;
    }
    if (!latestDate) {
      // By default use latest allowed date (cannot exceed today or latest record date)
      latestDate = maxAllowed;
    }

    // STRICT RULE: When Report Date is selected, automatically set cutoff to previous day (up to midnight 24hrs)
    // and strictly audit that back day's data
    const targetAuditDate = computePreviousDayIso(latestDate);
    const reportDisplayDate = formatDisplayDateIn(latestDate);
    const auditDisplayDate = formatDisplayDateIn(targetAuditDate);

    const scopedFirs = allFirs.filter(f => f.district?.trim().toLowerCase() === activeDistrict.toLowerCase() && (!filterStation || filterStation === "ALL" || f.policeStation?.trim().toLowerCase() === filterStation.trim().toLowerCase()));
    // Filter FIRs strictly registered within the 24-hour window of targetAuditDate (00:00:00 to 23:59:59)
    let matchedFirs = scopedFirs.filter((f: any) => {
      const fDate = parseToIsoDate(f.firDate) || parseToIsoDate(f.createdAt);
      const isTargetDay = fDate === targetAuditDate;
      const isDistrictMatch =
        !f.district ||
        f.district.toUpperCase().includes(activeDistrict) ||
        activeDistrict.includes(f.district.toUpperCase());
      return isTargetDay && isDistrictMatch;
    });

    if (filterStation && filterStation !== "ALL") {
      matchedFirs = matchedFirs.filter(
        (f) => f.policeStation && f.policeStation.toLowerCase().includes(filterStation.toLowerCase())
      );
    }

    // Convert real FIRs into SITREP format
    const firEntries: SitrepFirEntry[] = matchedFirs.map((f: any, idx: number) => {
      const propertyAmt = f.totalPropertyEstimatedValue
        ? String(f.totalPropertyEstimatedValue)
        : f.stolenPropertyDetails?.totalValue
        ? String(f.stolenPropertyDetails.totalValue)
        : "Nil";

      const victimInfo = f.victimType
        ? `${f.victimType} R/o Local`
        : f.complainantName
        ? `${f.complainantName}${f.complainantAge != null ? ` Age ${f.complainantAge}` : ""}`
        : "Victim";

      return {
        srNo: idx + 1,
        ps: f.policeStation || "PS City Panipat",
        head: f.categoryDisplay || f.majorAct || "General Crime",
        ipcSections: typeof f.actsAndSections === "string" ? f.actsAndSections : "",
        firNo: f.firNumber || String(f.id),
        dated: f.firDate ? `${f.firDate}${f.firTime ? ` ${f.firTime}` : ""}` : "--",
        us: typeof f.actsAndSections === "string" ? f.actsAndSections : "--",
        complainant: f.complainantName
          ? `${f.complainantName}${f.complainantAddress ? ` R/o ${f.complainantAddress}` : ""}`
          : "--",
        complainantMobile: f.complainantMobile || "--",
        victim: victimInfo,
        accused:
          f.accusedList && f.accusedList.length > 0
            ? f.accusedList.map((a: any) => a.name).join(", ")
            : "Nil",
        suspectedPersons: f.accusedList?.some((a: any) => a.isSuspect) || false,
        occurrenceFrom: f.incidentDateFrom ? `${f.incidentDateFrom}${f.incidentTimeFrom ? ` ${f.incidentTimeFrom}` : ""}` : "--",
        occurrenceTo: f.incidentDateTo ? `${f.incidentDateTo}${f.incidentTimeTo ? ` ${f.incidentTimeTo}` : ""}` : "--",
        totalPropertyAmount: propertyAmt,
        placeOfOccurrence: f.incidentPlace || "--",
        briefFacts: f.briefFacts || f.incidentDetails || "--",
        reasonOfDelay: f.delayReason || f.reasonsForDelay || "Nil",
        ioNameRank: f.actionTakenData?.investigationOfficerName || "--",
        ioMobile: f.actionTakenData?.investigationOfficerMobile || "--",
      };
    });

    // 17 HEADS EXACTLY AS SPECIFIED IN THE POLICE SITREP AUDIT FORMAT:
    const specificHeads = [
      { srNo: 1, name: "Murder", check: (f: any) => new RegExp("(?:^|[^0-9])302(?![0-9])", "i").test(f.actsAndSections || "") || new RegExp("(?:^|[^0-9])103(?![0-9])", "i").test(f.actsAndSections || "") },
      { srNo: 2, name: "Kidnapping", check: (f: any) => new RegExp("(?:^|[^0-9])363(?![0-9])", "i").test(f.actsAndSections || "") || new RegExp("(?:^|[^0-9])137(?![0-9])", "i").test(f.actsAndSections || "") },
      { srNo: 3, name: "Abetment of Suicide", check: (f: any) => new RegExp("(?:^|[^0-9])306(?![0-9])", "i").test(f.actsAndSections || "") || new RegExp("(?:^|[^0-9])108(?![0-9])", "i").test(f.actsAndSections || "") },
      { srNo: 4, name: "Rape", check: (f: any) => new RegExp("(?:^|[^0-9])376(?![0-9])", "i").test(f.actsAndSections || "") || new RegExp("(?:^|[^0-9])64(?![0-9])", "i").test(f.actsAndSections || "") },
      { srNo: 5, name: "POCSO Act (Sec. 4/6)", check: (f: any) => f.actsAndSections?.toLowerCase().includes("pocso") },
      { srNo: 6, name: "Obstruction in Govt. duty", check: (f: any) => new RegExp("(?:^|[^0-9])353(?![0-9])", "i").test(f.actsAndSections || "") || new RegExp("(?:^|[^0-9])132(?![0-9])", "i").test(f.actsAndSections || "") },
      { srNo: 7, name: "Snatching", check: (f: any) => new RegExp("(?:^|[^0-9])379A(?![0-9])", "i").test(f.actsAndSections || "") || new RegExp("(?:^|[^0-9])304(?![0-9])", "i").test(f.actsAndSections || "") },
      { srNo: 8, name: "Robbery", check: (f: any) => new RegExp("(?:^|[^0-9])392(?![0-9])", "i").test(f.actsAndSections || "") || new RegExp("(?:^|[^0-9])309(?![0-9])", "i").test(f.actsAndSections || "") },
      { srNo: 9, name: "Dacoity", check: (f: any) => new RegExp("(?:^|[^0-9])395(?![0-9])", "i").test(f.actsAndSections || "") || new RegExp("(?:^|[^0-9])310(?![0-9])", "i").test(f.actsAndSections || "") },
      { srNo: 10, name: "Economic Offences", check: (f: any) => new RegExp("(?:^|[^0-9])420(?![0-9])", "i").test(f.actsAndSections || "") || new RegExp("(?:^|[^0-9])318(?![0-9])", "i").test(f.actsAndSections || "") },
      { srNo: 11, name: "SC/ST (POA) Act", check: (f: any) => f.actsAndSections?.toLowerCase().includes("sc/st") },
      { srNo: 12, name: "NDPS Act, 1985", check: (f: any) => f.actsAndSections?.toLowerCase().includes("ndps") },
      { srNo: 13, name: "HSGS Act, 2015", check: (f: any) => f.actsAndSections?.toLowerCase().includes("hsgs") },
    ];

    let totalHeinous = 0;
    const section1HeadCounts: SitrepHeadCount[] = [];

    specificHeads.forEach((h) => {
      const count = matchedFirs.filter(h.check).length;
      if (h.name === "Murder" || h.name === "Rape" || h.name === "Robbery" || h.name === "Dacoity") {
        totalHeinous += count;
      }
      section1HeadCounts.push({
        srNo: h.srNo,
        head: h.name,
        totalNumber: count > 0 ? count : "--",
      });
    });

    // 14: Total Heinous Crime
    section1HeadCounts.push({
      srNo: 14,
      head: "Total Heinous Crime",
      totalNumber: totalHeinous > 0 ? totalHeinous : "--",
    });

    // 15: MV Theft
    const mvTheftCount = matchedFirs.filter(
      (f: any) => (new RegExp("(?:^|[^0-9])379(?![0-9])", "i").test(f.actsAndSections || "") || new RegExp("(?:^|[^0-9])303(?![0-9])", "i").test(f.actsAndSections || "")) && (f.category?.toLowerCase().includes("vehicle") || f.categoryDisplay?.toLowerCase().includes("vehicle") || f.briefFacts?.toLowerCase().includes("motorcycle") || f.briefFacts?.toLowerCase().includes("car"))
    ).length;
    section1HeadCounts.push({
      srNo: 15,
      head: "MV Theft",
      totalNumber: mvTheftCount > 0 ? mvTheftCount : "--",
    });

    // 16: Other Crime
    const otherCrimeCount = Math.max(0, matchedFirs.length - totalHeinous - mvTheftCount);
    section1HeadCounts.push({
      srNo: 16,
      head: "Other Crime",
      totalNumber: otherCrimeCount > 0 ? otherCrimeCount : "--",
    });

    // 17: Total Crime
    section1HeadCounts.push({
      srNo: 17,
      head: "Total Crime",
      totalNumber: matchedFirs.length > 0 ? matchedFirs.length : "--",
    });

    // Dynamic Arrests from actual FIR accused list
    const arrests: SitrepArrestEntry[] = [];
    scopedFirs.forEach((f: any) => {
      if (f.accusedList && Array.isArray(f.accusedList)) {
        f.accusedList.forEach((acc: any) => {
          if (parseToIsoDate(acc.arrestDate) === targetAuditDate) {
            arrests.push({
              srNo: arrests.length + 1,
              gdNoArrestTime: `${acc.arrestGdNo || "--"}\n${acc.arrestTime || "--"}`,
              ps: f.policeStation || "--",
              firNoAndUs: `${f.firNumber} u/s ${f.actsAndSections || "BNS"}`,
              head: f.categoryDisplay || "Crime",
              firDate: f.firDate || auditDisplayDate,
              accusedDetails: `${acc.name}${acc.alias ? ` @ ${acc.alias}` : ""}${acc.age ? ` (${acc.age})` : ""}${acc.fatherName ? ` S/o ${acc.fatherName}` : ""}${acc.address ? ` R/o ${acc.address}` : ""}`,
              ioDetails: `${f.actionTakenData?.investigationOfficerName || "--"}${f.actionTakenData?.investigationOfficerRank ? `, ${f.actionTakenData.investigationOfficerRank}` : ""}${f.actionTakenData?.investigationOfficerMobile ? ` (Mob: ${f.actionTakenData.investigationOfficerMobile})` : ""}`,
            });
          }
        });
      }
    });

    // Dynamic Recoveries from actual FIR property or GD seizures
    const recoveries: SitrepRecoveryEntry[] = [];
    scopedFirs.forEach((f: any) => {
      if (f.propertiesList && Array.isArray(f.propertiesList) && f.propertiesList.length > 0) {
        f.propertiesList.forEach((p: any) => {
          if (!/^(RECOVERED|SEIZED|RETURNED|RESTORED|DISPOSED)$/i.test(p.status || "") || parseToIsoDate(p.recoveredAt) !== targetAuditDate) return;
          recoveries.push({
            srNo: recoveries.length + 1,
            gdNoRecoveryTime: `${f.gdNumber || "--"}\n--`,
            ps: f.policeStation || "--",
            firNoAndUs: `${f.firNumber} u/s ${f.actsAndSections || "--"}`,
            head: f.categoryDisplay || "Property Offence",
            firDate: f.firDate || auditDisplayDate,
            recoveredItems: `${p.propertyType || "Seized Property"}${p.brandOrMake ? ` (Make: ${p.brandOrMake})` : ""}${p.quantity ? ` Qty: ${p.quantity}` : ""}${p.estimatedValue ? ` Value: ₹ ${p.estimatedValue}` : ""}`,
            ioDetails: `${f.actionTakenData?.investigationOfficerName || "--"}${f.actionTakenData?.investigationOfficerRank ? `, ${f.actionTakenData.investigationOfficerRank}` : ""}${f.actionTakenData?.investigationOfficerMobile ? ` (Mob: ${f.actionTakenData.investigationOfficerMobile})` : ""}`,
          });
        });
      }
    });

    // Dynamic Modifications
    const modifications: SitrepSectionModification[] = [];

    // Dynamic Disposals (Challans, Cancellations, Untraced) from actual status
    const completeChallans: SitrepDisposalEntry[] = [];
    const partialChallans: SitrepDisposalEntry[] = [];
    const cancellations: SitrepDisposalEntry[] = [];
    const untraced: SitrepDisposalEntry[] = [];

    const disposals=scopedFirs.flatMap(f=>{
      const events=(f.completionHistory || []).filter(event=>parseToIsoDate(event.completedAt)===targetAuditDate);
      if(events.length)return events.map(event=>({...f,status:(event.completionType==='CHARGESHEET'?'CHARGESHEET_FILED':event.completionType==='CLOSURE'?'CLOSURE_REPORT_FILED':event.completionType) as FIRItem['status'],mainStatus:undefined,finalFormDate:event.completedAt}));
      return parseToIsoDate(f.finalFormDate)===targetAuditDate?[f]:[];
    });
    disposals.forEach((f: any) => {
      if (f.status === "CHARGESHEET_FILED" || f.mainStatus === "Chargesheet Filed" || f.mainStatus === "Challan Submitted") {
        completeChallans.push({
          srNo: completeChallans.length + 1,
          ps: f.policeStation || "--",
          firNo: `${f.firNumber} u/s ${f.actsAndSections || "--"}`,
          firDate: f.firDate || auditDisplayDate,
          head: f.categoryDisplay || "General",
          accusedArrested: f.accusedList?.filter((a:any)=>a.isArrested || a.custodyStatus === "ARRESTED").length || 0,
          type: "Fresh",
          ioDetails: `${f.actionTakenData?.investigationOfficerName || "--"}${f.actionTakenData?.investigationOfficerMobile ? ` (Mob: ${f.actionTakenData.investigationOfficerMobile})` : ""}`,
        });
      } else if (f.status === "CANCELLED" || f.mainStatus === "Cancelled") {
        cancellations.push({
          srNo: cancellations.length + 1,
          ps: f.policeStation || "--",
          firNo: f.firNumber,
          firDate: f.firDate || auditDisplayDate,
          head: f.categoryDisplay || "General",
          reason: f.cancellationReason || "Not recorded",
          ioDetails: `${f.actionTakenData?.investigationOfficerName || "--"}${f.actionTakenData?.investigationOfficerMobile ? ` (Mob: ${f.actionTakenData.investigationOfficerMobile})` : ""}`,
        });
      } else if (f.status === "UNTRACED" || f.mainStatus === "Untraced") {
        untraced.push({
          srNo: untraced.length + 1,
          ps: f.policeStation || "--",
          firNo: f.firNumber,
          firDate: f.firDate || auditDisplayDate,
          head: f.categoryDisplay || "General",
          byName: "No",
          propertyStolenOrInvolved: String(f.totalPropertyEstimatedValue || 0),
          ioDetails: `${f.actionTakenData?.investigationOfficerName || "--"}${f.actionTakenData?.investigationOfficerMobile ? ` (Mob: ${f.actionTakenData.investigationOfficerMobile})` : ""}`,
        });
      }
    });

    scopedFirs.forEach(f=>{for(const challan of f.challanRecords || []){
      if(challan.challanMode !== 'PARTIAL' || !challan.submittedToCourt || parseToIsoDate(challan.courtSubmittedAt)!==targetAuditDate)continue;
      partialChallans.push({srNo:partialChallans.length+1,ps:f.policeStation,firNo:f.firNumber,firDate:f.firDate,head:f.categoryDisplay || '',type:challan.challanType==='SUPPLEMENTARY'?'Supplementary':'Fresh',reasonOfPartialChallan:challan.briefFacts || 'Not recorded',ioDetails:f.assignedIoName || '--'});
    }});
    const reopenedCases:SitrepReopenedCase[]=scopedFirs.flatMap(f=>(f.reopenHistory || []).filter(event=>parseToIsoDate(event.reopenedAt)===targetAuditDate).map(event=>({srNo:0,ps:f.policeStation,firNo:f.firNumber,firDate:f.firDate,head:f.categoryDisplay || '',dateOfLastIif5:'Not recorded',typeOfLastIif5:event.priorCompletionReason || 'Not recorded',dateOfReopening:event.reopenedAt,reasonOfReopening:event.reason,ioDetails:event.assignedIoName || f.assignedIoName || '--'}))).map((event,i)=>({...event,srNo:i+1}));

    // Dynamic Rukkas from General Diary strictly on targetAuditDate (24 hrs)
    const rukkas: SitrepRukkaEntry[] = [];
    allGd.forEach((gd) => {
      const gDate = parseToIsoDate(gd.activityDateTime) || parseToIsoDate(gd.officialCreationTimestamp);
      if (gDate !== targetAuditDate) return;
      const gDist = gd.district || "";
      if (gDist && !gDist.toUpperCase().includes(activeDistrict) && !activeDistrict.includes(gDist.toUpperCase())) {
        return;
      }
      if (filterStation && filterStation !== "ALL" && gd.policeStation !== filterStation) return;
      const subject = gd.subject || "";
      const narrative = gd.narrative || "";
      const typeCode = gd.typeCode || "";
      if (
        typeCode.includes("HOSPITAL") ||
        typeCode.includes("RUKKA") ||
        subject.toLowerCase().includes("rukka") ||
        subject.toLowerCase().includes("hospital") ||
        subject.toLowerCase().includes("रुक्का") ||
        narrative.toLowerCase().includes("रुक्का")
      ) {
        rukkas.push({
          srNo: rukkas.length + 1,
          ps: gd.policeStation || "--",
          patientDetails: subject,
          rukkaIdHospital: `${gd.gdNumber}`,
          briefDetails: narrative.slice(0, 150),
        });
      }
    });

    // Dynamic Upload Summaries by Police Station for the previous day
    const panipatPoliceStations = [
      "PS City Panipat",
      "PS Model Town Panipat",
      "PS Chandni Bagh Panipat",
      "PS Samalkha",
      "PS Industrial Area Panipat",
      "PS Sadar Panipat",
      "PS Israna",
      "PS Matlauda",
      "PS Bapoli",
      "PS Sanoli",
      "PS Sector 29 Panipat",
    ];

    const stationMap: Record<string, number> = {};
    panipatPoliceStations.forEach((ps) => {
      stationMap[ps] = 0;
    });
    matchedFirs.forEach((f: any) => {
      const ps = f.policeStation || panipatPoliceStations[0];
      stationMap[ps] = (stationMap[ps] || 0) + 1;
    });

    const uploadSummaries: SitrepUploadSummary[] = Object.keys(stationMap).map((ps) => {
      const count = stationMap[ps];
      return {
        ps,
        registeredPreviousDay: count,
        uploadedCitizenPortal: matchedFirs.filter(f=>f.policeStation===ps && f.cctnsSyncStatus === "SYNCED").length,
        notUploadedCitizenPortal: matchedFirs.filter(f=>f.policeStation===ps && f.cctnsSyncStatus !== "SYNCED").length,
      };
    });

    return {
      dataQualityWarnings:["Arrest, recovery and disposal tables use recorded event dates, including older FIRs. Undated events are excluded; empty sections do not certify NIL. Upload totals reflect saved sync status only."],
      id: `SITREP-${activeDistrict}-${latestDate}`,
      reportTitle: "CRIME SITREP",
      officeTitle: "Superintendent of Police",
      district: activeDistrict,
      reportDate: reportDisplayDate,
      cutoffTime: `Up to Midnight of ${auditDisplayDate}`,
      generatedDateTime: new Date().toLocaleString("en-IN"),
      controlRoomIncharge: `Inspector / Incharge Control Room, ${activeDistrict}`,
      officeLocation: `Office of the Superintendent of Police, ${activeDistrict}`,
      pageNumber: 1,
      totalPages: 19,
      section1HeadCounts,
      firEntries,
      arrests,
      recoveries,
      modifications,
      completeChallans,
      partialChallans,
      cancellations,
      untraced,
      reopenedCases,
      rukkas,
      uploadSummaries,
    };
  },

  // 2. DYNAMIC WEEKLY CRIME DIARY (100% computed from active station, officers, and cases)
  getWeeklyCrimeDiary: async (filterStation?: string, district?: string): Promise<WeeklyCrimeDiaryData> => {
    const activeStation = filterStation && filterStation !== "ALL" ? filterStation : "PS City Panipat";
    const activeDistrict = district || "Panipat";

    const allFirs = firService.getAllFirs().filter(f=>f.district?.toLowerCase()===activeDistrict.toLowerCase());
    const allComplaints = (await ComplaintService.getComplaints()).filter(c=>c.district?.toLowerCase()===activeDistrict.toLowerCase());
    const stationUsers = stationStaffService.getStaffForStation(activeStation);

    const shoUser = stationUsers.find(u=>u.category === "SHO");
    const mhcUser = stationUsers.find(u=>u.category === "MHC");
    const dspUser = undefined;

    // Calculate dates for current week
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateRange = `${weekAgo.toLocaleDateString("en-IN")} TO ${now.toLocaleDateString("en-IN")}`;

    // Compute Staff Strength dynamically from station roster
    const staffStrength = {
      insp: stationUsers.filter((u) => /inspector/i.test(u.rank) && !/sub|assistant/i.test(u.rank)).length,
      siPsi: stationUsers.filter((u) => /sub.inspector/i.test(u.rank) && !/assistant/i.test(u.rank)).length,
      asiLasi: stationUsers.filter((u) => /assistant/i.test(u.rank)).length,
      hcLhc: stationUsers.filter((u) => /head constable/i.test(u.rank)).length,
      ehcCt: stationUsers.filter((u) => /^constable$/i.test(u.rank)).length,
      spo: 0,
      hgh: 0,
      hkrn: 0,
      total: stationUsers.length,
    };

    // Filter UI cases from actual website FIRs
    const stationFirs = allFirs.filter(
      (f) => !filterStation || filterStation === "ALL" || f.policeStation?.toLowerCase().includes(activeStation.toLowerCase())
    );

    const uiCasesPartA: UiCasePartA[] = stationFirs
      .filter((f) => f.status === "UNDER_INVESTIGATION" || !f.status || f.mainStatus === "Under Investigation")
      .map((f: any, idx: number) => {
        const arrestedCount = f.accusedList?.filter((a: any) => a.isArrested || a.custodyStatus === "ARRESTED").length || 0;
        const pendingCount = Math.max(0, (f.accusedList?.length || 0) - arrestedCount);

        return {
          srNo: idx + 1,
          firNo: f.firNumber || String(f.id),
          date: f.firDate || "--",
          us: f.actsAndSections || "BNS",
          head: f.categoryDisplay || "Crime Offence",
          amount: f.totalPropertyEstimatedValue ? String(f.totalPropertyEstimatedValue) : "Nil",
          placeOfOccurrence: f.incidentPlace || "--",
          briefFacts: f.briefFacts || f.incidentDetails || "--",
          noOfAccusedInFir: f.accusedList?.length || 0,
          noOfAccusedArrested: arrestedCount,
          noOfAccusedPendingArrest: pendingCount,
          ioNameMobile: f.actionTakenData?.investigationOfficerName
            ? `${f.actionTakenData.investigationOfficerName}${f.actionTakenData.investigationOfficerMobile ? ` (${f.actionTakenData.investigationOfficerMobile})` : ""}`
            : "--",
          actionTaken: f.actionTakenData?.briefDescription || (arrestedCount > 0 ? `${arrestedCount} Accused arrested` : "--"),
          pendingReason: f.pendingReason || (pendingCount > 0 ? "Arrest of pending accused" : "--"),
          ageCategory: getAgeCategory(f.firDate || ""),
        };
      });

    // Compute Status of Complaints 05-P from actual website complaints
    const pendingComplaints: PendingComplaint05P[] = allComplaints
      .filter((c) => !isComplaintResolved(c) && (!filterStation || filterStation === "ALL" || c.policeStation === activeStation))
      .map((c: any, idx: number) => ({
        srNo: idx + 1,
        psDiaryNo: `${c.complaintNumber || `CMP-${idx + 1}`}`,
        dateOfReceipt: c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : "--",
        complainantNameMobile: `${c.complainantName}${c.complainantMobile ? ` (${c.complainantMobile})` : ""}`,
        ioNameMobile: c.assignedOfficerName || "--",
        officeDiaryNo: c.officeDiaryNo || "--",
        date: c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : "--",
        cctnsNo: c.status === "ENQUIRY_COMPLETED" ? "RESOLVED" : "PENDING",
      }));

    // 12 Parts Overview dynamically calculated from real numbers
    const part1to12Overview = [
      { part: "PART I", table: "156 (3) Cases / Zero FIR", remarks: "Not available — verified event data required" },
      {
        part: "PART II",
        table: "IIF-5 Filling details (Disposal this week)",
        remarks: `${stationFirs.filter((f) => f.status === "CHARGESHEET_FILED" && new Date(f.finalFormDate || "").getTime() >= weekAgo.getTime() && new Date(f.finalFormDate || "").getTime() <= now.getTime()).length} dated Challans, ${stationFirs.filter((f) => f.status === "UNTRACED" && new Date(f.finalFormDate || "").getTime() >= weekAgo.getTime() && new Date(f.finalFormDate || "").getTime() <= now.getTime()).length} dated Untraced`,
      },
      { part: "PART III", table: "Final Reports (IIF-5) u/s 173 CrPC dispatched", remarks: "Not available — verified event data required" },
      { part: "PART IV", table: "Submission of Final Reports in Court this week", remarks: "Not available — verified event data required" },
      { part: "PART V", table: "Cases reopened for investigation this week", remarks: "Not available — verified event data required" },
      { part: "PART VI", table: "Arrests made during this week", remarks: `${stationFirs.reduce((sum,f)=>sum+(f.accusedList || []).filter(a=>(a.isArrested || a.custodyStatus === "ARRESTED") && new Date(a.arrestDate || "").getTime() >= weekAgo.getTime() && new Date(a.arrestDate || "").getTime() <= now.getTime()).length,0)} dated arrests` },
      { part: "PART VII", table: "Recoveries made during this week", remarks: "Not available — verified event data required" },
      { part: "PART VIII", table: "List of Under Investigation cases (Part A)", remarks: `${uiCasesPartA.length} Active Cases` },
      { part: "PART IX", table: "List of UI cases (Part B) - IIF-5 filled once", remarks: "Not available — verified event data required" },
      { part: "PART X", table: "PO / Bail Jumpers / Parole Jumpers", remarks: "Not available — verified event data required" },
      { part: "PART XI", table: "Details of Gangs arrested this week", remarks: "Not available — verified event data required" },
      { part: "PART XII", table: "Miscellaneous (Preventive Action / Missing)", remarks: "Not available — verified event data required" },
    ];

    return {
      dataQualityWarnings:["Event counts include only dated records. Not available means data has not been verified, not NIL. Staff strength uses the station roster."],
      policeStation: activeStation.toUpperCase(),
      district: activeDistrict.toUpperCase(),
      dateRange,
      shoName: shoUser?.name || "--",
      shoPostedSince: "--",
      mhcName: mhcUser?.name || "--",
      mhcPostedSince: "--",
      soName: "Not recorded",
      soChargeSince: "--",
      staffStrength,
      vehicles: [],
      firCurrentYear: stationFirs.filter(f=>f.firYear===now.getFullYear()).length,
      firPrevYearSameTime: stationFirs.filter(f=>f.firYear===now.getFullYear()-1 && f.firDate.slice(5)<=now.toISOString().slice(5,10)).length,
      firPrevYearTotal: stationFirs.filter(f=>f.firYear===now.getFullYear()-1).length,
      firLastOneYearTotal: stationFirs.filter(f=>Date.parse(f.firDate)>=Date.now()-365*86400000).length,
      uiCasesPartACount: uiCasesPartA.length,
      uiCasesPartBCount: 0,
      preparedByName: mhcUser?.name || "--",
      preparedByDate: now.toLocaleDateString("en-IN"),
      part1to12Overview,
      untracedList: [],
      dispatchedFinalReports: [],
      uiCasesPartA,
      partialChallans: [],
      underCheckingChallans: [],
      pendingComplaints,
      adampataFiles: [],
      parcha12Pending: [
        { state: "Haryana", count: uiCasesPartA.length },
      ],
    };
  },

  // 3. DYNAMIC IGP MEETING PRESENTATION (Computed live from website cases)
  getIgpPresentationData: async (cutoff?: string, signal?: AbortSignal): Promise<IgpBriefing> => {
    const query = cutoff ? '?cutoff='+encodeURIComponent(cutoff) : '';
    const response = await fetch('/api/reports/igp-briefing'+query, {cache:'no-store', signal});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'IGP report could not be loaded.');
    return data;
  },

  // In-memory fallback for saved reports across re-renders/environments
  _inMemorySavedReports: [] as SavedReportEntry[],

  // 4. SAVED REPORTS REPOSITORY & SP SITREP GENERATOR
  getSavedReports: async (): Promise<SavedReportEntry[]> => {
    let list: SavedReportEntry[] = [];
    if (typeof window !== "undefined") {
      try {
        const data = localStorage.getItem("cms_saved_reports_data");
        if (data) {
          list = JSON.parse(data);
        }
      } catch (err) {
        console.warn("Could not read localStorage for saved reports:", err);
      }
    }
    // Merge with in-memory store to prevent loss
    const map = new Map<string, SavedReportEntry>();
    list.forEach((r) => map.set(r.id, r));
    ReportsService._inMemorySavedReports.forEach((r) => map.set(r.id, r));
    const merged = Array.from(map.values()).sort((a, b) => {
      return (b.id || "").localeCompare(a.id || "");
    });
    ReportsService._inMemorySavedReports = merged;
    return merged;
  },

  saveReport: async (report: SavedReportEntry): Promise<void> => {
    try {
      ReportsService._inMemorySavedReports = [
        report,
        ...ReportsService._inMemorySavedReports.filter((r) => r.id !== report.id),
      ];
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem("cms_saved_reports_data");
          const existing: SavedReportEntry[] = raw ? JSON.parse(raw) : [];
          const updated = [report, ...existing.filter((r) => r.id !== report.id)];
          localStorage.setItem("cms_saved_reports_data", JSON.stringify(updated));
        } catch (storageErr) {
          console.warn("LocalStorage save error, fallback to in-memory store:", storageErr);
        }
        window.dispatchEvent(new CustomEvent("cms_saved_reports_updated", { detail: report }));
      }
    } catch (e) {
      console.error("Failed to save report", e);
    }
  },

  deleteSavedReport: async (id: string): Promise<void> => {
    try {
      ReportsService._inMemorySavedReports = ReportsService._inMemorySavedReports.filter((r) => r.id !== id);
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem("cms_saved_reports_data");
          const existing: SavedReportEntry[] = raw ? JSON.parse(raw) : [];
          const updated = existing.filter((r) => r.id !== id);
          localStorage.setItem("cms_saved_reports_data", JSON.stringify(updated));
        } catch (storageErr) {
          console.warn("LocalStorage delete error:", storageErr);
        }
        window.dispatchEvent(new CustomEvent("cms_saved_reports_updated", { detail: { id } }));
      }
    } catch (e) {
      console.error("Failed to delete report", e);
    }
  },

  generateAndSaveCrimeSitrep: async (district?: string, referenceDate?: string): Promise<SavedReportEntry> => {
    const activeDistrict = (district || "Panipat").toUpperCase();
    const sitrep = await ReportsService.getCrimeSitrep(referenceDate, undefined, activeDistrict);
    const reportId = `SITREP-${activeDistrict}-${Date.now().toString().slice(-6)}`;
    sitrep.id = reportId;

    const savedEntry: SavedReportEntry = {
      id: reportId,
      reportType: "CRIME_SITREP",
      reportTitle: "CRIME SITREP",
      district: activeDistrict,
      reportDate: sitrep.reportDate,
      cutoffTime: sitrep.cutoffTime,
      generatedByRole: "Superintendent of Police",
      generatedByName: `SP ${activeDistrict}`,
      generatedAt: new Date().toLocaleString("en-IN"),
      caseCount: sitrep.firEntries.length,
      data: sitrep,
    };

    await ReportsService.saveReport(savedEntry);
    return savedEntry;
  },
};

