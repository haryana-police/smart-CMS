import { isMhcOrMmRole } from "@/lib/officerRoles";
import { formatDate } from '@/lib/utils';
import {computeDaysPending,stabilizeComplaint} from '@/lib/complaintIntegrity';
import {getStationComplaintCode,nextComplaintNumber} from '@/lib/complaintNumber';
export {computeDaysPending} from '@/lib/complaintIntegrity';
export {getStationComplaintCode,nextComplaintNumber} from '@/lib/complaintNumber';
import {
  ComplaintItem,
  ComplaintStatus,
  ComplaintPriority,
  SystemRole,
  IntelligenceCheckResult,
  CrossComplaintMatch,
  RepeatComplainantHistory,
  LinkedComplaintMatch,
  PriorFirMatch,
  HistoricalFirItem,
  OfficerNotification,
  EnquiryNoteItem,
  ComplaintDocumentItem,
  ComplaintTimelineEvent,
  ComplaintEvidenceAttachment,
  ConfidentialDossierItem,
  ComplaintReportItem,
  ComplaintAuditRecord,
  ReassignmentRecord,
  ProgressRequestItem,
  TransferJustificationRecord,
  WorkflowState,
  EOOutcome,
  MainComplaintStatus,
  getMainComplaintStatus,
  LegalAnalysisReport,
  InvestigationSummaryReport,
  ComplaintTransferRecord,
  LinkedComplaintEntry,
} from "@/types";
import {
  canCreateDocument,
  canDeleteDocument,
  canEditDocument,
  canReassignEO,
  canAskProgressReport,
  canTransferJustification,
  canCreateShoReport,
  isUserAssignedEo,
  isShoOrSuperior,
  AuthUserContext,
  canViewComplaint,
} from "@/utils/complaintPermissions";
import { MOCK_COMPLAINTS, MOCK_HISTORICAL_FIRS } from "@/lib/mockData";
import { ComplaintRegistrationInput } from "@/lib/validations/complaint";
import { GeneralDiaryService } from "./generalDiaryService";
import { GeneralDiaryRecord } from "@/types/generalDiary";
import { complaintAutoFillService } from "./complaintAutoFillService";
import { universalEvidenceService } from "./universalEvidenceService";
import { evidenceBlobStore } from "./evidenceBlobStore";
import { getTodayIsoIST, toIsoDateString } from "@/lib/utils";

const LEGACY_COMPLAINTS_STORAGE_KEY = "haryana_police_cms_complaints_v1";
const NOTIFICATIONS_STORAGE_KEY = "haryana_police_cms_notifications_v1";

// Evidence previews can look up large files by ID or filename.
const globalDataUrlCache = new Map<string, string>();

function cacheComplaintEvidence(items: ComplaintItem[]) {
  function remember(url: string, fileName: string, keys: string[]) {
    if (url.length <= 30000) return;
    for (const key of keys) {
      globalDataUrlCache.set(key, url);
      void evidenceBlobStore.put(key, url, { fileName });
    }
  }

  for (const item of items) {
    for (const attachment of item.attachments ?? []) {
      remember(attachment.dataUrl || "", attachment.name,
        [`att_${attachment.id}`, `${item.id}_${attachment.name}`, attachment.name]);
    }
    for (const document of item.documents ?? []) {
      const keys = [document.id, `${item.id}_${document.fileName}`, document.fileName];
      if (document.originalName) keys.push(document.originalName, `${item.id}_${document.originalName}`);
      remember(document.dataUrl || document.fileUrl || "", document.fileName, keys);
    }
    for (const report of item.reports ?? []) {
      remember(report.dataUrl || report.fileUrl || "", report.fileName || report.title, [report.id]);
    }
  }
}

function restoreDataUrlsForComplaint(item: ComplaintItem): ComplaintItem {
  return {
    ...item,
    attachments: item.attachments?.map((att) => {
      if (!att.dataUrl) {
        const cached = globalDataUrlCache.get(`att_${att.id}`) || globalDataUrlCache.get(`${item.id}_${att.name}`);
        if (cached) return { ...att, dataUrl: cached };
      }
      return att;
    }),
    documents: item.documents?.map((doc) => {
      if (!doc.dataUrl && !doc.fileUrl) {
        const cached = globalDataUrlCache.get(doc.id) || globalDataUrlCache.get(`${item.id}_${doc.fileName}`);
        if (cached) return { ...doc, dataUrl: cached, fileUrl: cached };
      }
      return doc;
    }),
    reports: item.reports?.map((r) => ({
      ...r,
      sentToSho: Boolean(r.sentToSho),
    })),
  };
}

let complaintsStore: ComplaintItem[] = [];
let officerNotificationsStore: OfficerNotification[] = [];

let mutationDepth=0;
let hydrated=false;
let hydration:Promise<void>|undefined;
let serverSnapshot=new Map<string,ComplaintItem>();
function currentComplaintUser():AuthUserContext|undefined {
 // Legacy client-side persona lookup removed with the demo accounts. The signed-in
 // session user is always passed explicitly by the API routes; callers without an
 // explicit user fall back to undefined exactly as they did for non-persona users.
 return undefined;
}
function loadComplaintsFromStorage():ComplaintItem[]{
 if(typeof window==='undefined')return complaintsStore.length?complaintsStore:MOCK_COMPLAINTS.map(c=>stabilizeComplaint(c));
 return complaintsStore;
}
let legacyCacheRemoved = false;
function removeLegacyComplaintCache() {
  if (legacyCacheRemoved) return;
  try {
    window.localStorage.removeItem(LEGACY_COMPLAINTS_STORAGE_KEY);
    legacyCacheRemoved = true;
  } catch {
    // Complaint records are already loaded from the backend.
  }
}

function saveComplaintsToStorage(items:ComplaintItem[]){
 complaintsStore=items.map(c=>stabilizeComplaint(c,serverSnapshot.get(c.id)));
 // The backend is authoritative. Never trim records to fit browser storage.
}
async function hydrateComplaints(){
 if(typeof window==='undefined'||mutationDepth)return;
 if(hydration)return hydration;
 hydration=(async()=>{const response=await fetch('/api/complaints',{cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(body.error||'Complaints could not be loaded. Sign in and retry.');
 complaintsStore=body.complaints.map((c:ComplaintItem)=>restoreDataUrlsForComplaint(stabilizeComplaint(c)));
 serverSnapshot=new Map(complaintsStore.map(c=>[c.id,structuredClone(c)]));hydrated=true;
 removeLegacyComplaintCache();
 cacheComplaintEvidence(complaintsStore);
 })();try{await hydration;}finally{hydration=undefined;}
}
function comparable(c:ComplaintItem){const value:Partial<ComplaintItem>={...c};delete value.daysPending;return JSON.stringify(value);}
async function persistComplaints(operation:string){
 if(typeof window==='undefined')return;
 const changes=complaintsStore.filter(c=>!serverSnapshot.has(c.id)||comparable(c)!==comparable(serverSnapshot.get(c.id)!)).map(c=>({complaint:c,expectedVersion:serverSnapshot.get(c.id)?.persistenceVersion||0}));
 if(!changes.length)return;
 const response=await fetch('/api/complaints',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,changes})});
 const body=await response.json();if(!response.ok)throw new Error(body.error||'Complaint could not be saved. Please retry.');
 for(const saved of body.complaints as ComplaintItem[]){const index=complaintsStore.findIndex(c=>c.id===saved.id);if(index>=0)complaintsStore[index]=saved;serverSnapshot.set(saved.id,structuredClone(saved));}
 cacheComplaintEvidence(complaintsStore);
}
function loadNotificationsFromStorage(): OfficerNotification[] {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Could not load notifications from localStorage", e);
    }
  }
  return [];
}

function saveNotificationsToStorage(items: OfficerNotification[]) {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn("Could not save notifications to localStorage", e);
    }
  }
}

function syncComplaintsToServer(_items:ComplaintItem[]){
 // Public async mutations await one version-checked backend commit below.
}

function isActiveForEnquiryOfficer(complaint: ComplaintItem): boolean {
  if (complaint.workflowState === "RE_ENQUIRY" || complaint.workflowState === "CORRECTION_REQUIRED") {
    return true;
  }

  return complaint.shoDecision !== "APPROVE" && !complaint.isFirApprovedBySho;
}

// Initialize stores
complaintsStore = loadComplaintsFromStorage();
officerNotificationsStore = loadNotificationsFromStorage();


export const ComplaintService = {
  generateNextComplaintNumber(stationName?: string, year?: number, district?:string): string {
    const y = year || new Date().getFullYear();
    const list = loadComplaintsFromStorage();
    return nextComplaintNumber(list, y, stationName, district || currentComplaintUser()?.district);
  },

  async getComplaints(filter?: {
    search?: string;
    status?: string;
    statuses?: string[];
    priority?: string;
    category?: string;
    finalCategory?: string;
    assignedEo?: string;
    viewerRole?: SystemRole | string;
    viewerStation?: string;
    activeQueueOnly?: boolean;
    showSentToSho?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ComplaintItem[]> {
    if(!mutationDepth)await hydrateComplaints();
    complaintsStore = loadComplaintsFromStorage();
    let list = complaintsStore.map((c) => ({
      ...c,
      daysPending: computeDaysPending(c),
    }));

    const viewer=currentComplaintUser();
    // The client store is hydrated exclusively from the server API, which already
    // scopes every record to the signed-in session user. The legacy persona lookup
    // was removed with the demo accounts; an undefined viewer must NOT wipe the
    // register for every role — only filter when an explicit client viewer exists.
    if(typeof window!=='undefined'&&viewer)list=list.filter(c=>canViewComplaint(viewer,c).allowed);

    // 0. Station-level isolation:
    // SHO, MHC, and IO/EO see ONLY complaints of their police station.
    // Superior district officers (DSP, SP, ASP, Super Admin) see across the district.
    const isSuperiorRole =
      filter?.viewerRole === "DSP_SUBDIV" ||
      filter?.viewerRole === "SP_DISTRICT" ||
      filter?.viewerRole === "SUPER_ADMIN";

    if (!isSuperiorRole && filter?.viewerStation && filter.viewerStation.trim()) {
      const vStn = filter.viewerStation.trim().toLowerCase();
      const vStnCode = getStationComplaintCode(filter.viewerStation);

      list = list.filter((c) => {
        if (c.custodyUnit) return c.custodyUnit.name.trim().toLowerCase() === vStn;
        const cStn = (c.policeStation || "").trim().toLowerCase();
        if (cStn && (cStn === vStn || cStn.includes(vStn) || vStn.includes(cStn))) {
          return true;
        }
        if (c.complaintNumber && vStnCode && c.complaintNumber.toUpperCase().includes("-" + vStnCode + "-")) {
          return true;
        }
        return false;
      });
    }

    // 1. Role-based visibility
    const isEo =
      filter?.viewerRole === "ENQUIRY_OFFICER" ||
      (Boolean(filter?.assignedEo) &&
        filter?.viewerRole !== "SHO" &&
        !isMhcOrMmRole(filter?.viewerRole) &&
        filter?.viewerRole !== "DSP_SUBDIV" &&
        filter?.viewerRole !== "SP_DISTRICT" &&
        filter?.viewerRole !== "SUPER_ADMIN");

    if (isEo && filter?.assignedEo) {
      list = list.filter((c) => {
        if(!isUserAssignedEo(viewer||{id:filter.assignedEo,pno:filter.assignedEo,name:filter.assignedEo},c))return false;

        return filter.activeQueueOnly === false || filter.showSentToSho || isActiveForEnquiryOfficer(c);
      });
    }

    // 2. Status filtering based on the 3+1 statuses: Not Assigned, Pending, Complete, FIR Registered
    if (filter?.statuses && filter.statuses.length > 0 && !filter.statuses.includes("ALL")) {
      list = list.filter((c) => {
        const main = getMainComplaintStatus(c);
        return filter.statuses!.some((st) => {
          const sUpper = st.toUpperCase();
          if (sUpper === "NOT_ASSIGNED" || sUpper === "UNASSIGNED" || sUpper === "REGISTERED") {
            return main === "Not Assigned";
          }
          if (
            sUpper === "PENDING" ||
            sUpper === "UNDER_ENQUIRY" ||
            sUpper === "ENQUIRY_IN_PROGRESS" ||
            sUpper === "RE_ENQUIRY"
          ) {
            return main === "Pending";
          }
          if (
            sUpper === "COMPLETE" ||
            sUpper === "COMPLETED" ||
            sUpper === "DISPOSED" ||
            sUpper === "DISPOSED_CIVIL_NATURE"
          ) {
            return main === "Complete";
          }
          if (sUpper === "FIR_REGISTER" || sUpper === "FIR REGISTER") {
            return main === "FIR Register";
          }
          if (sUpper === "FIR_RECOMMEND" || sUpper === "FIR RECOMMEND" || sUpper === "FIR_RECOMMENDED") {
            return main === "FIR Recommend";
          }
          if (sUpper === "FIR_REGISTERED" || sUpper === "FIR REGISTERED") {
            return main === "FIR Registered";
          }
          if (sUpper === "CORRECTION_REQUIRED" || sUpper === "CORRECTION REQUIRED") {
            return main === "Correction Required";
          }
          if (sUpper === "WAITING_SHO" || sUpper === "UNDER_REVIEW") {
            return Boolean(c.isSentToSho && !c.isFirRegistered);
          }
          return c.status === st || main === st;
        });
      });
    } else if (filter?.status && filter.status !== "ALL") {
      const sUpper = filter.status.toUpperCase();
      if (sUpper === "NOT_ASSIGNED" || sUpper === "UNASSIGNED" || sUpper === "REGISTERED") {
        list = list.filter((c) => getMainComplaintStatus(c) === "Not Assigned");
      } else if (
        sUpper === "PENDING" ||
        sUpper === "UNDER_ENQUIRY" ||
        sUpper === "ENQUIRY_IN_PROGRESS" ||
        sUpper === "RE_ENQUIRY"
      ) {
        list = list.filter((c) => getMainComplaintStatus(c) === "Pending");
      } else if (
        sUpper === "COMPLETE" ||
        sUpper === "COMPLETED" ||
        sUpper === "DISPOSED" ||
        sUpper === "DISPOSED_CIVIL_NATURE"
      ) {
        list = list.filter((c) => getMainComplaintStatus(c) === "Complete");
      } else if (sUpper === "FIR_REGISTER" || sUpper === "FIR REGISTER") {
        list = list.filter((c) => getMainComplaintStatus(c) === "FIR Register");
      } else if (sUpper === "FIR_RECOMMEND" || sUpper === "FIR RECOMMEND" || sUpper === "FIR_RECOMMENDED") {
        list = list.filter((c) => getMainComplaintStatus(c) === "FIR Recommend");
      } else if (sUpper === "FIR_REGISTERED" || sUpper === "FIR REGISTERED") {
        list = list.filter((c) => getMainComplaintStatus(c) === "FIR Registered");
      } else if (sUpper === "CORRECTION_REQUIRED" || sUpper === "CORRECTION REQUIRED") {
        list = list.filter((c) => getMainComplaintStatus(c) === "Correction Required");
      } else if (sUpper === "WAITING_SHO" || sUpper === "UNDER_REVIEW") {
        list = list.filter((c) => c.isSentToSho && !c.isFirRegistered);
      } else {
        list = list.filter((c) => c.status === filter.status);
      }
    }

    if (filter?.priority && filter.priority !== "ALL") {
      list = list.filter((c) => c.priority === filter.priority);
    }

    if (filter?.category && filter.category !== "ALL") {
      const catUpper = filter.category.toUpperCase().replace(/\s+/g, "_");
      // Check if filtering by Recommendation Category: NCR, FIR Recommend, Closure
      if (catUpper === "NCR") {
        list = list.filter((c) => c.finalCategory === "NCR" || c.eoRecommendedCategory === "NCR" || (c.category as string) === "NCR");
      } else if (catUpper === "FIR_RECOMMEND" || catUpper === "FIR_RECOMMENDED" || catUpper === "FIR") {
        list = list.filter((c) =>
          c.finalCategory === "FIR Recommend" ||
          c.finalCategory === "FIR_RECOMMEND" ||
          c.status === "FIR Recommend" ||
          c.status === "FIR_RECOMMEND" ||
          c.workflowState === "FIR_REGISTRATION_PENDING" ||
          c.eoRecommendedCategory === "FIR_RECOMMEND" ||
          (c.category as string) === "FIR_RECOMMEND"
        );
      } else if (catUpper === "CLOSURE") {
        list = list.filter((c) =>
          c.finalCategory === "Closure" ||
          c.finalCategory === "CLOSURE" ||
          c.eoRecommendedCategory === "CLOSURE" ||
          (c.category as string) === "CLOSURE"
        );
      } else {
        list = list.filter((c) => c.category === filter.category);
      }
    }

    if (filter?.finalCategory && filter.finalCategory !== "ALL") {
      const fUpper = filter.finalCategory.toUpperCase().replace(/\s+/g, "_");
      if (fUpper === "NCR") {
        list = list.filter((c) => c.finalCategory === "NCR");
      } else if (fUpper === "FIR_RECOMMEND" || fUpper === "FIR_RECOMMENDED" || fUpper === "FIR") {
        list = list.filter((c) => c.finalCategory === "FIR Recommend" || c.finalCategory === "FIR_RECOMMEND");
      } else if (fUpper === "CLOSURE") {
        list = list.filter((c) => c.finalCategory === "Closure" || c.finalCategory === "CLOSURE");
      }
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, "");
      list = list.filter((c) => {
        // Text field matches
        const matchesBasic =
          c.complaintNumber.toLowerCase().includes(q) ||
          c.complainantName.toLowerCase().includes(q) ||
          c.incidentPlace.toLowerCase().includes(q) ||
          (c.complaintSubject && c.complaintSubject.toLowerCase().includes(q)) ||
          (c.complaintDescription && c.complaintDescription.toLowerCase().includes(q)) ||
          (c.policeStation && c.policeStation.toLowerCase().includes(q)) ||
          (c.assignedEoName && c.assignedEoName.toLowerCase().includes(q)) ||
          (c.firNumber && c.firNumber.toLowerCase().includes(q)) ||
          (c.fivePNumber && c.fivePNumber.toLowerCase().includes(q)) ||
          c.accusedList.some(
            (a) =>
              (a.name && a.name.toLowerCase().includes(q)) ||
              (a.address && a.address.toLowerCase().includes(q))
          );
        if (matchesBasic) return true;

        // Mobile number matches (complainant or accused, supports raw digits matching)
        const mob = (c.complainantMobile || "").replace(/\D/g, "");
        if (mob.includes(q) || (qDigits.length > 0 && mob.includes(qDigits))) return true;
        const accusedMobMatch = c.accusedList.some((a) => {
          const aPhone = (a.phone || "").replace(/\D/g, "");
          return aPhone.includes(q) || (qDigits.length > 0 && aPhone.includes(qDigits));
        });
        if (accusedMobMatch) return true;

        // Status matches (display status e.g. Pending, Complete, Not Assigned, FIR Register, FIR Recommend)
        const displayStatus = getMainComplaintStatus(c).toLowerCase();
        if (
          displayStatus.includes(q) ||
          ((q === "closed" || q === "closure" || q === "disposed") && displayStatus === "complete") ||
          ((q === "unassigned" || q === "no eo") && displayStatus === "not assigned") ||
          ((q === "re-enquiry" || q === "rejected") && displayStatus === "correction required") ||
          (q === "enquiry" && displayStatus === "pending")
        ) {
          return true;
        }

        // Date matches (formatted DD/MM/YYYY, ISO string, or digits)
        const dmy = formatDate(c.createdAt || c.incidentDate);
        if (dmy.toLowerCase().includes(q)) return true;
        if (c.createdAt && c.createdAt.toLowerCase().includes(q)) return true;
        if (c.incidentDate && c.incidentDate.toLowerCase().includes(q)) return true;
        if (qDigits.length >= 2) {
          const dmyDigits = dmy.replace(/\D/g, "");
          if (dmyDigits.includes(qDigits)) return true;
        }

        return false;
      });
    }
    if (filter?.dateFrom) {
      const fromIso = toIsoDateString(filter.dateFrom);
      if (fromIso) {
        list = list.filter((c) => {
          const rawIso = toIsoDateString(c.createdAt || c.incidentDate);
          return !rawIso || rawIso >= fromIso;
        });
      }
    }

    if (filter?.dateTo) {
      const toIso = toIsoDateString(filter.dateTo);
      if (toIso) {
        list = list.filter((c) => {
          const rawIso = toIsoDateString(c.createdAt || c.incidentDate);
          return !rawIso || rawIso <= toIso;
        });
      }
    }

    return list;
  },

  async getComplaintById(id: string): Promise<ComplaintItem | undefined> {
    if (!id) return undefined;
    if(!mutationDepth)await hydrateComplaints();
    const cleanId = decodeURIComponent(id).trim().toLowerCase();

    // 1. Search in-memory complaintsStore directly first
    let found = complaintsStore.find(
      (c) =>
        c.id.toLowerCase() === cleanId ||
        c.complaintNumber.toLowerCase() === cleanId
    );
    if (found) {
      if(typeof window!=='undefined'){const viewer=currentComplaintUser();if(viewer&&!canViewComplaint(viewer,found).allowed)return undefined;}
      found.daysPending = computeDaysPending(found);
      return found;
    }

    // 2. If not found in memory, reload from storage and search
    complaintsStore = loadComplaintsFromStorage();
    found = complaintsStore.find(
      (c) =>
        c.id.toLowerCase() === cleanId ||
        c.complaintNumber.toLowerCase() === cleanId
    );
    if (found) {
      if(typeof window!=='undefined'){const viewer=currentComplaintUser();if(viewer&&!canViewComplaint(viewer,found).allowed)return undefined;}
      found.daysPending = computeDaysPending(found);
    }
    return found;
  },

  /**
   * Synchronously retrieves a complaint from local cache by ID or complaint number
   */
  getComplaintByIdSync(id: string): ComplaintItem | undefined {
    if (!id) return undefined;
    const cleanId = decodeURIComponent(id).trim().toLowerCase();
    let found = complaintsStore.find(
      (c) =>
        c.id.toLowerCase() === cleanId ||
        c.complaintNumber.toLowerCase() === cleanId
    );
    if (found) {
      if(typeof window!=='undefined'){const viewer=currentComplaintUser();if(viewer&&!canViewComplaint(viewer,found).allowed)return undefined;}
      found.daysPending = computeDaysPending(found);
      return found;
    }
    complaintsStore = loadComplaintsFromStorage();
    found = complaintsStore.find(
      (c) =>
        c.id.toLowerCase() === cleanId ||
        c.complaintNumber.toLowerCase() === cleanId
    );
    if (found) {
      if(typeof window!=='undefined'){const viewer=currentComplaintUser();if(viewer&&!canViewComplaint(viewer,found).allowed)return undefined;}
      found.daysPending = computeDaysPending(found);
    }
    return found;
  },

  getById(id: string): ComplaintItem | undefined {
    return this.getComplaintByIdSync(id);
  },

  getByComplaintNumber(complaintNumber: string): ComplaintItem | undefined {
    return this.getComplaintByIdSync(complaintNumber);
  },

  async getStatusCounts(assignedEoFilter?: string, viewerStation?: string, viewerRole?: string): Promise<{
    all: number;
    unassigned: number;
    underEnquiry: number;
    underReview: number;
    disposed: number;
    notAssigned: number;
    pending: number;
    complete: number;
    firRegister: number;
    firRecommend: number;
    firRegistered: number;
    correctionRequired: number;
  }> {
    if(!mutationDepth)await hydrateComplaints();
    complaintsStore = loadComplaintsFromStorage();
    const viewer=currentComplaintUser();
    // Server-hydrated store is already role-scoped; an undefined client viewer
    // (persona lookup removed) must not wipe status counts to zero.
    let baseList = complaintsStore.filter(c=>typeof window==='undefined'||!viewer||canViewComplaint(viewer,c).allowed);

    const isSuperior =
      viewerRole === "DSP_SUBDIV" ||
      viewerRole === "SP_DISTRICT" ||
      viewerRole === "SUPER_ADMIN";

    if (!isSuperior && viewerStation && viewerStation.trim()) {
      const vStn = viewerStation.trim().toLowerCase();
      const vStnCode = getStationComplaintCode(viewerStation);
      baseList = baseList.filter((c) => {
        if (c.custodyUnit) return c.custodyUnit.name.trim().toLowerCase() === vStn;
        const cStn = (c.policeStation || "").trim().toLowerCase();
        if (cStn && (cStn === vStn || cStn.includes(vStn) || vStn.includes(cStn))) {
          return true;
        }
        if (c.complaintNumber && vStnCode && c.complaintNumber.toUpperCase().includes("-" + vStnCode + "-")) {
          return true;
        }
        return false;
      });
    }

    if (assignedEoFilter) {
      baseList = baseList.filter((c) => {
        if(!isUserAssignedEo(viewer||{id:assignedEoFilter,pno:assignedEoFilter,name:assignedEoFilter},c))return false;

        return isActiveForEnquiryOfficer(c);
      });
    }

    const all = baseList.length;
    let unassigned = 0;
    let underEnquiry = 0;
    let underReview = 0;
    let disposed = 0;

    let notAssigned = 0;
    let pending = 0;
    let complete = 0;
    let firRegister = 0;
    let firRecommend = 0;
    let firRegistered = 0;
    let correctionRequired = 0;

    for (const c of baseList) {
      const main = getMainComplaintStatus(c);
      if (main === "Not Assigned") notAssigned++;
      else if (main === "Pending") pending++;
      else if (main === "Complete") complete++;
      else if (main === "FIR Register") firRegister++;
      else if (main === "FIR Recommend") firRecommend++;
      else if (main === "FIR Registered") firRegistered++;
      else if (main === "Correction Required") correctionRequired++;

      if (c.status === "REGISTERED") {
        unassigned++;
      } else if (c.status === "ENQUIRY_IN_PROGRESS" || c.status === "ASSIGNED_TO_EO") {
        underEnquiry++;
      } else if (
        c.status === "REPORT_SUBMITTED" ||
        c.status === "PENDING_SHO_REVIEW" ||
        c.status === "INTERIM_REPORT_SUBMITTED"
      ) {
        underReview++;
      } else if (
        c.status.startsWith("DISPOSED_") ||
        c.status === "RECOMMENDED_FOR_FIR" ||
        c.status === "TRANSFERRED_OTHER_PS"
      ) {
        disposed++;
      }
    }

    return { all, unassigned, underEnquiry, underReview, disposed, notAssigned, pending, complete, firRegister, firRecommend, firRegistered, correctionRequired };
  },

  async createComplaint(
    input: ComplaintRegistrationInput,
    officerName: string,
    station: string,
    district: string,
    officerPno: string = "HR-04291882"
  ): Promise<ComplaintItem> {
    const isDirectFir = Boolean(input.directSendToFir || input.directSendToFirChoice === "YES");
    const initialStatus: ComplaintStatus = isDirectFir ? "FIR_REGISTER" : "REGISTERED";
    const initialWorkflow: WorkflowState = isDirectFir ? "FIR_REGISTER" : "NOT_ASSIGNED";
    const generatedComplaintNumber = this.generateNextComplaintNumber(station,undefined,district);

    const newComplaint: ComplaintItem = {
      id: `cmp_${crypto.randomUUID()}`,
      complaintNumber: generatedComplaintNumber,
      source: input.source,
      category: input.category,
      subCategory: input.subCategory?.trim() || undefined,
      categoryDisplay: input.subCategory?.trim() || input.category.replace(/_/g, " "),
      priority: input.priority,
      status: initialStatus,
      directSendToFir: isDirectFir,
      directSendToFirChoice: isDirectFir ? "YES" : "NO",
      incidentDate: input.incidentDate,
      incidentTime: input.incidentTime,
      isIncidentDateTimeKnown: input.isIncidentDateTimeKnown,
      incidentPlace: input.incidentPlace,
      incidentLandmark: input.incidentLandmark,
      incidentDetails: input.incidentDetails || "Written complaint filed",
      complainantName: input.complainantName,
      complainantRelationType: input.complainantRelationType || undefined,
      complainantRelativeName: input.complainantRelativeName || input.complainantFatherSpouse || "",
      complainantFatherSpouse: input.complainantRelativeName || input.complainantFatherSpouse || "",
      complainantGender: input.complainantGender || "MALE",
      complainantAge: input.complainantAge,
      complainantMobile: input.complainantMobile,
      complainantAltPhone: input.complainantAltPhone,
      complainantAddress: input.complainantAddress,
      complainantCity: input.complainantCity,
      complainantDistrict: input.complainantDistrict,
      complainantState: input.complainantState || "Haryana",
      complainantCountry: input.complainantCountry || "India",
      complainantNationality: input.complainantNationality || "Indian",
      complainantPermanentAddress: input.complainantPermanentAddress || input.complainantAddress,
      complainantPermanentCity: input.complainantPermanentCity || input.complainantCity,
      complainantPermanentDistrict: input.complainantPermanentDistrict || input.complainantDistrict,
      complainantPermanentState: input.complainantPermanentState || input.complainantState || "Haryana",
      complainantPermanentCountry: input.complainantPermanentCountry || input.complainantCountry || "India",
      additionalComplainants: input.additionalComplainants || [],
      // 4. Complaint Details
      intakeMode: input.intakeMode || input.source,
      complaintSubject: input.complaintSubject || (input as any).subject || input.complaintDescription || "",
      subject: input.complaintSubject || (input as any).subject || input.complaintDescription || "",
      complaintDescription: input.complaintDescription,
      isFirRegistered: input.isFirRegistered || false,
      firNumber: input.firNumber,
      firDate: input.firDate,
      complaintAgeType: input.complaintAgeType || "FRESH",
      complaintClassification: input.complaintClassification,
      complaintPurpose: input.complaintPurpose,
      isAccusedKnown: input.isAccusedKnown,
      accusedList: (input.accusedList && input.accusedList.length > 0)
        ? input.accusedList
        : input.accusedName
        ? [
            {
              name: input.accusedName,
              fatherName: input.accusedFatherName,
              address: input.accusedAddress,
              phone: input.accusedPhone,
              relationWithComplainant: input.relationWithComplainant,
            },
          ]
        : [],
      policeStation: station,
      district: district,
      registeredBy: officerName,
      fivePNumber: input.fivePNumber,
      officeReferenceNumber: input.officeReferenceNumber || input.fivePNumber,
      sourceOffice: input.sourceOffice,
      linkedComplaintNumber: input.linkedComplaintNumber,
      crossComplaintNumber: input.isCrossComplaint ? input.linkedComplaintNumber : undefined,
      isCrossComplaint: input.isCrossComplaint,
      processedDocuments: (input as any).processedDocuments || [],
      attachments: input.attachments || [],
      documents: [
        ...((input as any).documents || []),
        ...(input.attachments || []).map((att: any) => ({
          id: `doc_${att.id}`,
          complaintId: generatedComplaintNumber,
          fileName: att.name,
          fileCategory: att.category.toUpperCase(),
          uploadedBy: officerName,
          uploadedAt: att.uploadedAt || new Date().toISOString(),
          fileSize: typeof att.size === 'number' ? `${(att.size / 1024).toFixed(1)} KB` : String(att.size || '10 KB'),
          fileUrl: att.dataUrl,
          dataUrl: att.dataUrl,
          description: att.description || "Uploaded during complaint registration",
        })),
      ].filter((doc, idx, arr) => arr.findIndex((d) => d.fileName.toLowerCase() === doc.fileName.toLowerCase()) === idx),
      daysPending: 0,
      workflowState: initialWorkflow,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const initialAudit: ComplaintAuditRecord = {
      id: `audit_${Date.now()}_reg`,
      complaintId: newComplaint.id,
      action: "COMPLAINT_REGISTERED",
      actionLabel: isDirectFir ? "Complaint Registered (Direct FIR)" : "Complaint Registered",
      performedBy: officerName,
      userPno: officerPno,
      userRole: "MHC_GD_INCHARGE",
      timestamp: new Date().toISOString(),
      details: isDirectFir
        ? `Citizen complaint ${generatedComplaintNumber} registered with Direct send to FIR: YES. Status: FIR Register. Dispatched directly to SHO for formal FIR registration.`
        : `Citizen complaint ${generatedComplaintNumber} registered in CMS register. Status: Not Assigned.`,
    };
    newComplaint.auditTrail = [initialAudit];

    complaintsStore.unshift(newComplaint);
    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("complaints_updated", { detail: newComplaint }));
    }

    // Complaint registered directly without auto-entry in Roznamcha
    return newComplaint;
  },

  async assignEnquiryOfficer(
    complaintId: string,
    eoId: string,
    eoName: string,
    eoRank: string,
    eoPno: string,
    assignedByName: string,
    directions: string = "Conduct preliminary spot verification & verify facts as per Section 173(3) BNSS.",
    targetDays: number = 14,
    user?: AuthUserContext
  ): Promise<{ complaint: ComplaintItem; notification: OfficerNotification }> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const currentComplaint = complaintsStore[index];
    user=user||currentComplaintUser();
    if(!user)throw new Error('Officer identity is required.');
    if (user) {
      const perm = canReassignEO(user, currentComplaint);
      if (!perm.allowed) {
        throw new Error(perm.reason || "Unauthorized to assign or reassign Enquiry Officer.");
      }
    }

    const previousEoId = currentComplaint.assignedEoId;
    const previousEoName = currentComplaint.assignedEoName;
    const isReassignment = Boolean(previousEoId && previousEoId !== eoId);

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + targetDays);
    const nowIso = new Date().toISOString();

    const updated: ComplaintItem = {
      ...currentComplaint,
      assignedEoId: eoId,
      assignedEoName: eoName,
      assignedEoRank: eoRank,
      assignedEoPno: eoPno,
      assignedEoBeltNumber: undefined,
      assignedEoPhone: undefined,
      assignedAt: nowIso,
      assignedDirections: directions,
      assignedRosterDuty: "Investigation Duty",
      targetResolutionDate: targetDate.toISOString().split("T")[0],
      status: "ASSIGNED_TO_EO" as ComplaintStatus,
      workflowState: "PENDING",
      isSentToSho: false,
      shoActionRequired: false,
      currentComplaintOwnerId: eoId,
      updatedAt: nowIso,
    };

    if (isReassignment && previousEoId) {
      const reassignmentRecord: ReassignmentRecord = {
        id: `reassign_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        complaintId: updated.id,
        previousEoId,
        previousEoName: previousEoName || "Previous EO",
        newEoId: eoId,
        newEoName: eoName,
        reassignedById: user?.id || user?.pno || "SHO",
        reassignedByName: user?.name || assignedByName,
        reassignedByRole: user?.role || "SHO",
        reassignedAt: nowIso,
        reason: directions,
        previousDirections: currentComplaint.assignedDirections,
        newDirections: directions,
      };
      if (!updated.reassignmentHistory) updated.reassignmentHistory = [];
      updated.reassignmentHistory.unshift(reassignmentRecord);
    }

    const assignAudit: ComplaintAuditRecord = {
      id: `audit_${Date.now()}_assign`,
      complaintId: updated.id,
      action: isReassignment ? "EO_REASSIGNED" : "EO_ASSIGNED",
      actionLabel: isReassignment
        ? `EO Reassigned: ${previousEoName || "Previous EO"} ➔ ${eoName} (${eoRank})`
        : `EO Assigned: ${eoName} (${eoRank})`,
      performedBy: user?.name || assignedByName,
      userRole: user?.role || "SHO",
      timestamp: nowIso,
      details: isReassignment
        ? `Case reassigned from ${previousEoName || "Previous EO"} to ${eoName} (PNO: ${eoPno}). Reason: "${directions}". All previously uploaded documents remain intact.`
        : `Enquiry Officer assigned: ${eoName}, PNO: ${eoPno}. Target: ${targetDays} days. Directions: "${directions}". Status changed to Pending.`,
    };

    if (!updated.auditTrail) updated.auditTrail = [];
    updated.auditTrail.unshift(assignAudit);

    complaintsStore[index] = updated;
    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    // Create & dispatch notification to the respected Enquiry Officer
    const notification: OfficerNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recipientPno: eoPno,
      recipientName: eoName,
      complaintId: updated.id,
      complaintNumber: updated.complaintNumber,
      title: `New Case Assigned: ${updated.complaintNumber}`,
      message: `You have been designated Enquiry Officer by ${assignedByName}. Target: ${targetDays} days. Directions: "${directions}"`,
      directions: directions,
      priority: updated.priority,
      createdAt: new Date().toISOString(),
      read: false,
    };

    officerNotificationsStore.unshift(notification);
    saveNotificationsToStorage(officerNotificationsStore);

    return { complaint: updated, notification };
  },

  async getOfficerNotifications(pno?: string): Promise<OfficerNotification[]> {
    if (pno) {
      return officerNotificationsStore.filter((n) => n.recipientPno === pno);
    }
    return [...officerNotificationsStore];
  },

  async getDashboardMetrics() {
    const total = complaintsStore.length;
    let notAssigned = 0;
    let pending = 0;
    let complete = 0;
    let firRegistered = 0;

    for (const c of complaintsStore) {
      const main = getMainComplaintStatus(c);
      if (main === "Not Assigned") notAssigned++;
      else if (main === "Pending") pending++;
      else if (main === "Complete") complete++;
      else if (main === "FIR Registered") firRegistered++;
    }

    const pendingEnquiry = complaintsStore.filter(
      (c) => c.status === "ASSIGNED_TO_EO" || c.status === "ENQUIRY_IN_PROGRESS"
    ).length;
    const pendingAssignment = complaintsStore.filter((c) => c.status === "REGISTERED" || !c.assignedEoName).length;
    const pendingApproval = complaintsStore.filter(
      (c) => c.status === "REPORT_SUBMITTED" || c.status === "RECOMMENDED_FOR_FIR" || Boolean(c.isSentToSho)
    ).length;
    const disposed = complete;
    const criticalUrgent = complaintsStore.filter(
      (c) => c.priority === "URGENT" || c.priority === "CM_WINDOW_VIP" || c.priority === "CRITICAL_SENSITIVE"
    ).length;

    return {
      total,
      notAssigned,
      pending,
      complete,
      firRegistered,
      pendingEnquiry,
      pendingAssignment,
      pendingApproval,
      disposed,
      criticalUrgent,
      overdueEnquiries: complaintsStore.filter((c) => c.daysPending > 15).length,
    };
  },

  /**
   * Loads the station register from the backend before a *read-only* view of it
   * (the intelligence check) runs. Mutations already hydrate themselves, which
   * is why a directly-opened / refreshed register form used to report
   * "0 cross-cases / First-time complainant" against an empty in-memory store.
   */
  async ensureRegisterHydrated(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      if (hydration) await hydration;
      if (!hydrated) await hydrateComplaints();
    } catch (error) {
      console.warn("Register could not be refreshed before the intelligence check:", error);
    }
  },

  checkComplaintIntelligence(input: {
    complainantName: string;
    complainantFatherSpouse?: string;
    complainantMobile: string;
    complainantAddress?: string;
    accusedName?: string;
    accusedFatherName?: string;
    accusedPhone?: string;
    accusedAddress?: string;
    incidentPlace?: string;
    incidentDetails?: string;
  }): IntelligenceCheckResult {
    const norm = (s?: string) => (s || "").trim().toLowerCase();
    const cName = norm(input.complainantName);
    const cMobile = (input.complainantMobile || "").replace(/\D/g, "");
    const aName = norm(input.accusedName);
    const aMobile = (input.accusedPhone || "").replace(/\D/g, "");
    const place = norm(input.incidentPlace);
    const details = norm(input.incidentDetails);

    const crossComplaints: CrossComplaintMatch[] = [];
    const linkedComplaints: LinkedComplaintMatch[] = [];
    const repeatComplaints: ComplaintItem[] = [];

    // 1. Scan across existing complaints in store
    complaintsStore.forEach((c) => {
      const existingCName = norm(c.complainantName);
      const existingCMobile = (c.complainantMobile || "").replace(/\D/g, "");
      const existingAccusedNames = c.accusedList.map((a) => norm(a.name));
      const existingAccusedPhones = c.accusedList.map((a) => (a.phone || "").replace(/\D/g, "")).filter(Boolean);
      const existingPlace = norm(c.incidentPlace);
      const existingDetails = norm(c.incidentDetails);

      // Check Repeat Complainant (Same Mobile or matching Name)
      const isSameComplainant =
        (cMobile && cMobile.length === 10 && existingCMobile === cMobile) ||
        (cName && existingCName && (existingCName === cName || existingCName.includes(cName) || cName.includes(existingCName)) && cName.length > 3);

      if (isSameComplainant) {
        repeatComplaints.push(c);
      }

      // Check Cross Complaint:
      // Case A: The current accused has previously filed a complaint against current complainant!
      const accusedIsOldComplainant =
        (aName && aName.length > 2 && (existingCName.includes(aName) || aName.includes(existingCName))) ||
        (aMobile && aMobile.length === 10 && existingCMobile === aMobile);

      const complainantIsOldAccused =
        (cName && cName.length > 2 && existingAccusedNames.some((an) => an.includes(cName) || cName.includes(an))) ||
        (cMobile && cMobile.length === 10 && existingAccusedPhones.includes(cMobile));

      if (accusedIsOldComplainant || (accusedIsOldComplainant && complainantIsOldAccused)) {
        crossComplaints.push({
          existingComplaint: c,
          matchType: "CROSS_COMPLAINT",
          reason: `Opposite Party "${input.accusedName || "Accused"}" previously filed Complaint #${c.complaintNumber} on ${c.incidentDate} alleging offences against ${c.accusedList.map((a) => a.name).join(", ") || "current party"}!`,
          severity: "HIGH",
        });
      }

      // Check Linked / Duplicate Complaints
      let score = 0;
      const matchedOn: string[] = [];

      if (cMobile && existingCMobile === cMobile) {
        score += 45;
        matchedOn.push("Same Complainant Mobile");
      }
      if (place && existingPlace && (existingPlace.includes(place) || place.includes(existingPlace)) && place.length > 3) {
        score += 30;
        matchedOn.push("Matching Incident Location");
      }
      if (aName && existingAccusedNames.some((an) => an.includes(aName) || aName.includes(an))) {
        score += 25;
        matchedOn.push("Same Accused Person");
      }
      if (details && existingDetails) {
        const words = details.split(/\s+/).filter((w) => w.length > 4);
        const matchWords = words.filter((w) => existingDetails.includes(w));
        if (matchWords.length >= 2) {
          score += 20;
          matchedOn.push(`Narrative keywords (${matchWords.slice(0, 2).join(", ")})`);
        }
      }

      if (score >= 40 && !crossComplaints.some((x) => x.existingComplaint.id === c.id)) {
        linkedComplaints.push({
          existingComplaint: c,
          similarityScore: Math.min(score, 98),
          matchedOn,
          summary: `Complaint matches on ${matchedOn.join(", ")}`,
        });
      }
    });

    // 2. Scan Prior FIR Database
    const priorFirs: PriorFirMatch[] = [];
    MOCK_HISTORICAL_FIRS.forEach((fir) => {
      const firComp = norm(fir.complainantName);
      const firCompPhone = (fir.complainantPhone || "").replace(/\D/g, "");
      const firAccused = fir.accusedNames.map((n) => norm(n));
      const firAccusedPhones = (fir.accusedPhones || []).map((p) => p.replace(/\D/g, ""));

      let matchedParty: "COMPLAINANT" | "ACCUSED" | "BOTH" | "LOCATION" | null = null;
      let partyRole: "ACCUSED_IN_FIR" | "COMPLAINANT_IN_FIR" | "NAMED_PERSON" = "NAMED_PERSON";
      let reason = "";

      const accusedInFir =
        (aName && aName.length > 2 && firAccused.some((an) => an.includes(aName) || aName.includes(an))) ||
        (aMobile && aMobile.length === 10 && firAccusedPhones.includes(aMobile));

      const compInFirAsAccused =
        (cName && cName.length > 2 && firAccused.some((an) => an.includes(cName) || cName.includes(an))) ||
        (cMobile && cMobile.length === 10 && firAccusedPhones.includes(cMobile));

      const compInFirAsComplainant =
        (cName && cName.length > 2 && (firComp.includes(cName) || cName.includes(firComp))) ||
        (cMobile && cMobile.length === 10 && firCompPhone === cMobile);

      if (accusedInFir && compInFirAsAccused) {
        matchedParty = "BOTH";
        partyRole = "ACCUSED_IN_FIR";
        reason = `Both Current Accused (${input.accusedName}) and Complainant (${input.complainantName}) are listed in ${fir.firNumber}!`;
      } else if (accusedInFir) {
        matchedParty = "ACCUSED";
        partyRole = "ACCUSED_IN_FIR";
        reason = `Accused ${input.accusedName} is named as an accused in ${fir.firNumber} (${fir.sectionsOfLaw})`;
      } else if (compInFirAsAccused) {
        matchedParty = "COMPLAINANT";
        partyRole = "ACCUSED_IN_FIR";
        reason = `Complainant ${input.complainantName} was previously chargesheeted/accused in ${fir.firNumber}!`;
      } else if (compInFirAsComplainant) {
        matchedParty = "COMPLAINANT";
        partyRole = "COMPLAINANT_IN_FIR";
        reason = `Complainant ${input.complainantName} previously registered ${fir.firNumber} at ${fir.policeStation}`;
      }

      if (matchedParty) {
        priorFirs.push({
          fir,
          matchedParty,
          partyRole,
          reason,
        });
      }
    });

    const repeatCount = repeatComplaints.length;
    const repeatRisk =
      repeatCount >= 3
        ? "FREQUENT_COMPLAINANT"
        : repeatCount >= 1
        ? "MULTIPLE_PRIOR"
        : "FIRST_TIME";

    const hasAlerts = crossComplaints.length > 0 || repeatCount > 0 || linkedComplaints.length > 0 || priorFirs.length > 0;

    return {
      hasAlerts,
      crossComplaints,
      repeatHistory: {
        totalPreviousComplaints: repeatCount,
        complaints: repeatComplaints,
        riskLevel: repeatRisk,
      },
      linkedComplaints: linkedComplaints.sort((a, b) => b.similarityScore - a.similarityScore),
      priorFirs,
      scannedAt: new Date().toISOString(),
    };
  },

  async addEnquiryNote(
    complaintId: string,
    note: {
      officerName: string;
      officerRank: string;
      officerPno: string;
      noteType: 'SPOT_VISIT' | 'WITNESS_EXAMINATION' | 'ACCUSED_EXAMINATION' | 'DOCUMENT_VERIFICATION' | 'INTERIM_PROGRESS' | 'GENERAL';
      content: string;
      location?: string;
      attachment?: ComplaintEvidenceAttachment;
    }
  ): Promise<EnquiryNoteItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const newNote: EnquiryNoteItem = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      complaintId: complaintsStore[index].id,
      officerName: note.officerName,
      officerRank: note.officerRank,
      officerPno: note.officerPno,
      noteType: note.noteType,
      content: note.content,
      location: note.location,
      attachment: note.attachment,
      createdAt: new Date().toISOString(),
    };

    if (!complaintsStore[index].enquiryNotes) {
      complaintsStore[index].enquiryNotes = [];
    }
    complaintsStore[index].enquiryNotes!.unshift(newNote);

    // If attachment provided with enquiry note, also add to complaint attachments
    if (note.attachment) {
      if (!complaintsStore[index].attachments) {
        complaintsStore[index].attachments = [];
      }
      complaintsStore[index].attachments!.unshift(note.attachment);
    }

    // Add to timeline
    this.addTimelineEvent(complaintsStore[index].id, {
      title: `Enquiry Note Recorded: ${note.noteType.replace(/_/g, " ")}${note.attachment ? ` (${note.attachment.category.toUpperCase()} Attached)` : ""}`,
      description: note.content.slice(0, 160) + (note.content.length > 160 ? "..." : ""),
      category: "ENQUIRY_NOTE",
      officerName: note.officerName,
      officerRank: note.officerRank,
      timestamp: new Date().toISOString(),
      documentName: note.attachment?.name,
    });

    return newNote;
  },

  async addEvidence(
    complaintId: string,
    evidence: {
      name: string;
      size: number;
      type: string;
      category: 'document' | 'video' | 'audio' | 'image' | 'other';
      dataUrl?: string;
      description?: string;
      officerName?: string;
    }
  ): Promise<ComplaintEvidenceAttachment> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const newEvidence: ComplaintEvidenceAttachment = {
      id: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: evidence.name,
      size: evidence.size,
      type: evidence.type,
      category: evidence.category,
      dataUrl: evidence.dataUrl,
      description: evidence.description,
      uploadedAt: new Date().toISOString(),
    };

    if (!complaintsStore[index].attachments) {
      complaintsStore[index].attachments = [];
    }
    complaintsStore[index].attachments!.unshift(newEvidence);

    // Also mirror to documents repository so it appears in Documents tab
    if (!complaintsStore[index].documents) {
      complaintsStore[index].documents = [];
    }
    const mirroredDoc: ComplaintDocumentItem = {
      id: `doc_${newEvidence.id}`,
      complaintId: complaintsStore[index].id,
      fileName: newEvidence.name,
      fileCategory: newEvidence.category.toUpperCase(),
      uploadedBy: evidence.officerName || "Enquiry Officer",
      uploadedAt: newEvidence.uploadedAt,
      fileSize: typeof newEvidence.size === 'number' ? `${(newEvidence.size / 1024).toFixed(1)} KB` : String(newEvidence.size || '10 KB'),
      fileUrl: newEvidence.dataUrl,
      dataUrl: newEvidence.dataUrl,
      description: newEvidence.description || "Evidence attachment",
    };
    complaintsStore[index].documents!.unshift(mirroredDoc);

    // Add to timeline
    this.addTimelineEvent(complaintsStore[index].id, {
      title: `Evidence Attached: ${evidence.name}`,
      description: `Format: ${evidence.category.toUpperCase()} • Description: ${evidence.description || "Digital evidence attached to complaint file"}`,
      category: "EVIDENCE",
      officerName: evidence.officerName || "Enquiry Officer",
      timestamp: new Date().toISOString(),
      documentName: evidence.name,
    });

    return newEvidence;
  },

  async addDocument(
    complaintId: string,
    doc: {
      fileName: string;
      fileCategory: string;
      fileSize: string;
      fileUrl?: string;
      dataUrl?: string;
      contentHtml?: string;
      description?: string;
      uploadedBy: string;
      source?: 'UPLOADED' | 'GENERATED';
      createdByUserId?: string;
      createdByRole?: string;
    },
    user?: AuthUserContext
  ): Promise<ComplaintDocumentItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    user=user||currentComplaintUser();
    if(!user)throw new Error('Officer identity is required.');
    if (user) {
      const perm = canCreateDocument(user, complaintsStore[index]);
      if (!perm.allowed) {
        throw new Error(perm.reason || "Unauthorized to upload or generate documents for this complaint.");
      }
    }

    const nowIso = new Date().toISOString();
    const createdByUserId = user?.id || user?.pno || doc.createdByUserId || doc.uploadedBy;
    const createdByRole = user?.role || doc.createdByRole || (isUserAssignedEo(user || {}, complaintsStore[index]) ? "ENQUIRY_OFFICER" : "OFFICER");
    const createdByName = user?.name || doc.uploadedBy;

    const newDoc: ComplaintDocumentItem = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      complaintId: complaintsStore[index].id,
      fileName: doc.fileName,
      fileCategory: doc.fileCategory,
      uploadedBy: doc.uploadedBy,
      uploadedAt: nowIso,
      fileSize: doc.fileSize,
      fileUrl: doc.fileUrl || doc.dataUrl,
      dataUrl: doc.dataUrl || doc.fileUrl,
      contentHtml: doc.contentHtml,
      description: doc.description,
      createdByUserId,
      createdByRole: String(createdByRole),
      createdByName,
      currentOwnerUserId: createdByUserId,
      source: doc.source || "UPLOADED",
      status: "UPLOADED",
      version: 1,
    };

    if (!complaintsStore[index].documents) {
      complaintsStore[index].documents = [];
    }
    complaintsStore[index].documents!.unshift(newDoc);

    const docAudit: ComplaintAuditRecord = {
      id: `audit_${Date.now()}_doc_up`,
      complaintId: complaintsStore[index].id,
      action: "DOCUMENT_UPLOADED",
      actionLabel: `Document Uploaded: ${doc.fileName}`,
      performedBy: createdByName,
      userRole: String(createdByRole),
      timestamp: nowIso,
      details: `Official document "${doc.fileName}" (${doc.fileCategory}) uploaded/generated by ${createdByName} (${createdByRole}). Creator ID: ${createdByUserId}.`,
    };
    if (!complaintsStore[index].auditTrail) complaintsStore[index].auditTrail = [];
    complaintsStore[index].auditTrail!.unshift(docAudit);

    // Add to timeline
    this.addTimelineEvent(complaintsStore[index].id, {
      title: `Official Document Uploaded: ${doc.fileName}`,
      description: `Category: ${doc.fileCategory} • Size: ${doc.fileSize}`,
      category: "DOCUMENT",
      officerName: doc.uploadedBy,
      timestamp: nowIso,
      documentName: doc.fileName,
    });

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    // Persistently register raw evidence and process structured data in background (Process Once and Reuse Everywhere)
    if (typeof window !== "undefined") {
      universalEvidenceService
        .registerAndProcess({
          fileId: newDoc.id,
          fileName: newDoc.fileName,
          dataUrl: newDoc.dataUrl || newDoc.fileUrl,
          caseId: complaintsStore[index].id,
          caseNumber: complaintsStore[index].complaintNumber,
          module: "COMPLAINTS",
          uploadedBy: newDoc.uploadedBy,
        })
        .catch((err) => {
          console.warn("Evidence persistent registration error:", err);
        });
    }

    return newDoc;
  },

  addTimelineEvent(
    complaintId: string,
    event: {
      title: string;
      description: string;
      category: ComplaintTimelineEvent['category'];
      officerName: string;
      officerRank?: string;
      timestamp: string;
      documentName?: string;
    }
  ): ComplaintTimelineEvent {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const newEvent: ComplaintTimelineEvent = {
      id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      complaintId: complaintsStore[index].id,
      title: event.title,
      description: event.description,
      category: event.category,
      officerName: event.officerName,
      officerRank: event.officerRank,
      timestamp: event.timestamp || new Date().toISOString(),
      documentName: event.documentName,
    };

    if (!complaintsStore[index].timeline) {
      complaintsStore[index].timeline = [];
    }
    complaintsStore[index].timeline!.unshift(newEvent);
    saveComplaintsToStorage(complaintsStore);

    return newEvent;
  },

  async transferComplaint(
    complaintId: string,
    destinationStation: string,
    reason: string,
    officerName: string
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    complaintsStore[index] = {
      ...complaintsStore[index],
      status: "TRANSFERRED_OTHER_PS",
      isTransferred: true,
      transferredToPoliceStation: destinationStation,
      transferredAt: new Date().toISOString(),
      transferredBy: officerName,
      transferReason: reason,
      policeStation: complaintsStore[index].policeStation,
      updatedAt: new Date().toISOString(),
    };

    this.addTimelineEvent(complaintsStore[index].id, {
      title: `Complaint Transferred to ${destinationStation}`,
      description: `Jurisdictional transfer ordered by ${officerName}. Reason: "${reason}"`,
      category: "TRANSFER",
      officerName,
      timestamp: new Date().toISOString(),
    });

    saveComplaintsToStorage(complaintsStore);
    return complaintsStore[index];
  },

  async transferComplaintFull(payload: {
    complaintId: string;
    transferType: "OTHER_STATION" | "OTHER_DISTRICT" | "OTHER_STATE";
    targetState: string;
    targetDistrict: string;
    targetPoliceStation: string;
    transferReason: string;
    orderNumber?: string;
    dispatchDate: string;
    dispatchTime?: string;
    transferredBy: string;
    transferredByRank?: string;
    remarks?: string;
  }): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex(
      (c) => c.id === payload.complaintId || c.complaintNumber === payload.complaintId
    );
    if (index === -1) throw new Error("Complaint not found");

    const complaint = complaintsStore[index];
    const typeLabel =
      payload.transferType === "OTHER_STATION"
        ? "Other Station (अन्य थाना)"
        : payload.transferType === "OTHER_DISTRICT"
        ? "Other District (अन्य ज़िला)"
        : "Other State (अन्य राज्य)";

    const transferRecord: ComplaintTransferRecord = {
      id: `TRF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      complaintId: complaint.id,
      complaintNumber: complaint.complaintNumber,
      complainantName: complaint.complainantName,
      transferType: payload.transferType,
      sourcePoliceStation: complaint.policeStation || "Station Intake",
      sourceDistrict: complaint.district || "Haryana",
      targetState: payload.targetState,
      targetDistrict: payload.targetDistrict,
      targetPoliceStation: payload.targetPoliceStation,
      transferReason: payload.transferReason,
      orderNumber: payload.orderNumber || "",
      dispatchDate: payload.dispatchDate || getTodayIsoIST(),
      dispatchTime: payload.dispatchTime || new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }),
      transferredBy: payload.transferredBy,
      transferredByRank: payload.transferredByRank || "Inspector / SHO",
      remarks: payload.remarks,
      timestamp: new Date().toISOString(),
    };

    const existingHistory = complaint.transferHistory || [];
    const updatedHistory = [transferRecord, ...existingHistory];

    complaintsStore[index] = {
      ...complaint,
      status: "TRANSFERRED_OTHER_PS",
      isTransferred: true,
      transferType: payload.transferType,
      transferredToState: payload.targetState,
      transferredToDistrict: payload.targetDistrict,
      transferredToPoliceStation: payload.targetPoliceStation,
      transferredAt: new Date().toISOString(),
      transferredBy: payload.transferredBy,
      transferReason: payload.transferReason,
      transferOrderNumber: payload.orderNumber,
      transferHistory: updatedHistory,
      updatedAt: new Date().toISOString(),
    };

    this.addTimelineEvent(complaint.id, {
      title: `स्थानांतरित / Transferred (${typeLabel}) ➔ ${payload.targetPoliceStation}`,
      description: `स्थानांतरित स्थान: ${payload.targetPoliceStation}, ${payload.targetDistrict}, ${payload.targetState} | आदेश सं. (Order No): ${payload.orderNumber || "N/A"} | कारण (Reason): "${payload.transferReason}" | द्वारा: ${payload.transferredBy} (${payload.transferredByRank || "SHO"})`,
      category: "TRANSFER",
      officerName: payload.transferredBy,
      officerRank: payload.transferredByRank || "SHO",
      timestamp: new Date().toISOString(),
    });

    this.saveGlobalTransferRecord(transferRecord);
    saveComplaintsToStorage(complaintsStore);
    return complaintsStore[index];
  },

  saveGlobalTransferRecord(record: ComplaintTransferRecord): void {
    if (typeof window === "undefined") return;
    try {
      const viewer = currentComplaintUser();
      const scope = (viewer?.stationName || viewer?.id || "global").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const storageKey = `cms_complaint_transfers_log_v1_${scope}`;
      const existingStr = localStorage.getItem(storageKey);
      const list: ComplaintTransferRecord[] = existingStr ? JSON.parse(existingStr) : [];
      list.unshift(record);
      localStorage.setItem(storageKey, JSON.stringify(list.slice(0, 100)));
    } catch (e) {
      console.warn("Could not save global transfer log", e);
    }
  },

  getTransferHistory(): ComplaintTransferRecord[] {
    const listMap = new Map<string, ComplaintTransferRecord>();
    const viewer = typeof window !== "undefined" ? currentComplaintUser() : undefined;

    // 1. From complaintsStore in-memory (already scoped to authorized complaints for viewer)
    complaintsStore.forEach((c) => {
      if (viewer && !canViewComplaint(viewer, c).allowed) return;
      if (c.transferHistory && c.transferHistory.length > 0) {
        c.transferHistory.forEach((tr) => listMap.set(tr.id, tr));
      } else if (c.isTransferred && c.transferredToPoliceStation) {
        const syntheticId = `TRF-SYNTH-${c.id}`;
        if (!listMap.has(syntheticId)) {
          listMap.set(syntheticId, {
            id: syntheticId,
            complaintId: c.id,
            complaintNumber: c.complaintNumber,
            complainantName: c.complainantName,
            transferType: c.transferType || "OTHER_STATION",
            sourcePoliceStation: c.policeStation || "Station Intake",
            sourceDistrict: c.district || "Haryana",
            targetState: c.transferredToState || "Haryana",
            targetDistrict: c.transferredToDistrict || c.district || "Haryana",
            targetPoliceStation: c.transferredToPoliceStation || "Other Station",
            transferReason: c.transferReason || "Jurisdictional transfer",
            orderNumber: c.transferOrderNumber || "TRF/2026/01",
            dispatchDate: (c.transferredAt && toIsoDateString(c.transferredAt)) || getTodayIsoIST(),
            dispatchTime: "10:30",
            transferredBy: c.transferredBy || "SHO In-charge",
            transferredByRank: "Inspector",
            timestamp: c.transferredAt || new Date().toISOString(),
          });
        }
      }
    });

    // 2. From station-scoped localStorage (never leaking across personas/stations)
    if (typeof window !== "undefined" && viewer) {
      try {
        const scope = (viewer.stationName || viewer.id || "global").toLowerCase().replace(/[^a-z0-9]+/g, "_");
        const storageKey = `cms_complaint_transfers_log_v1_${scope}`;
        const existingStr = localStorage.getItem(storageKey);
        if (existingStr) {
          const storedList: ComplaintTransferRecord[] = JSON.parse(existingStr);
          storedList.forEach((r) => {
            if (!listMap.has(r.id)) listMap.set(r.id, r);
          });
        }
      } catch (e) {
        console.warn("Could not parse transfer history from localStorage", e);
      }
    }

    const all = Array.from(listMap.values());
    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return all;
  },

  async linkComplaint(
    complaintId: string,
    targetComplaintNumber: string,
    relationType: string = "LINKED",
    officerName: string = "Investigating Officer"
  ): Promise<ComplaintItem> {
    if (!mutationDepth) await hydrateComplaints();
    complaintsStore = loadComplaintsFromStorage();

    const pIdx = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (pIdx === -1) throw new Error("Primary complaint not found");

    // Strictly validate that target complaint actually exists in the register database
    const tIdx = complaintsStore.findIndex(
      (c) => c.complaintNumber.trim().toUpperCase() === targetComplaintNumber.trim().toUpperCase() ||
             c.id === targetComplaintNumber.trim()
    );
    if (tIdx === -1) {
      throw new Error(`Target complaint "${targetComplaintNumber}" does not exist in the register database.`);
    }

    if (pIdx === tIdx) {
      throw new Error("Cannot link a complaint to itself.");
    }

    const primary = complaintsStore[pIdx];
    const target = complaintsStore[tIdx];

    const linkTypeEnum: "RELATED" | "CROSS" | "DUPLICATE" | "SAME_ACCUSED" =
      relationType === "CROSS"
        ? "CROSS"
        : relationType === "DUPLICATE" || relationType === "REPEATED"
        ? "DUPLICATE"
        : relationType === "SAME_ACCUSED"
        ? "SAME_ACCUSED"
        : "RELATED";

    // Use full bidirectional linking
    const result = await this.linkComplaintsFull({
      primaryComplaintId: primary.id,
      targetComplaintId: target.id,
      linkType: linkTypeEnum,
      reason: `Linked as ${relationType} with ${target.complaintNumber}`,
      officerName,
    });

    return result.primary;
  },

  async linkComplaintsFull(payload: {
    primaryComplaintId: string;
    targetComplaintId: string;
    linkType: "RELATED" | "CROSS" | "DUPLICATE" | "SAME_ACCUSED";
    reason: string;
    officerName: string;
  }): Promise<{ primary: ComplaintItem; target: ComplaintItem }> {
    const pIdx = complaintsStore.findIndex(
      (c) => c.id === payload.primaryComplaintId || c.complaintNumber === payload.primaryComplaintId
    );
    const tIdx = complaintsStore.findIndex(
      (c) => c.id === payload.targetComplaintId || c.complaintNumber === payload.targetComplaintId
    );

    if (pIdx === -1 || tIdx === -1) {
      throw new Error("One or both complaints could not be found");
    }

    const primary = complaintsStore[pIdx];
    const target = complaintsStore[tIdx];

    const typeLabel =
      payload.linkType === "CROSS"
        ? "Cross-Complaint (क्रॉस शिकायत)"
        : payload.linkType === "DUPLICATE"
        ? "Duplicate Complaint (समान/डुप्लीकेट)"
        : payload.linkType === "SAME_ACCUSED"
        ? "Same Accused / Gang (समान आरोपी)"
        : "Related Matter (संबंधित मामला)";

    // Update Primary
    const pExisting = primary.linkedComplaintsList || [];
    const pFiltered = pExisting.filter((l) => l.complaintNumber !== target.complaintNumber);
    const pNewEntry: LinkedComplaintEntry = {
      id: `LNK-${Date.now()}-P`,
      complaintId: target.id,
      complaintNumber: target.complaintNumber,
      complainantName: target.complainantName,
      incidentDate: target.incidentDate,
      linkType: payload.linkType,
      reason: payload.reason,
      linkedAt: new Date().toISOString(),
      linkedBy: payload.officerName,
    };
    complaintsStore[pIdx] = {
      ...primary,
      linkedComplaintNumber: target.complaintNumber,
      isCrossComplaint: payload.linkType === "CROSS" || primary.isCrossComplaint,
      crossComplaintNumber: payload.linkType === "CROSS" ? target.complaintNumber : primary.crossComplaintNumber,
      linkedComplaintsList: [pNewEntry, ...pFiltered],
      updatedAt: new Date().toISOString(),
    };

    // Update Target
    const tExisting = target.linkedComplaintsList || [];
    const tFiltered = tExisting.filter((l) => l.complaintNumber !== primary.complaintNumber);
    const tNewEntry: LinkedComplaintEntry = {
      id: `LNK-${Date.now()}-T`,
      complaintId: primary.id,
      complaintNumber: primary.complaintNumber,
      complainantName: primary.complainantName,
      incidentDate: primary.incidentDate,
      linkType: payload.linkType,
      reason: payload.reason,
      linkedAt: new Date().toISOString(),
      linkedBy: payload.officerName,
    };
    complaintsStore[tIdx] = {
      ...target,
      linkedComplaintNumber: primary.complaintNumber,
      isCrossComplaint: payload.linkType === "CROSS" || target.isCrossComplaint,
      crossComplaintNumber: payload.linkType === "CROSS" ? primary.complaintNumber : target.crossComplaintNumber,
      linkedComplaintsList: [tNewEntry, ...tFiltered],
      updatedAt: new Date().toISOString(),
    };

    // Timeline for Primary
    this.addTimelineEvent(primary.id, {
      title: `लिंक किया गया / Linked with ${target.complaintNumber} (${typeLabel})`,
      description: `संबंधित शिकायत: ${target.complaintNumber} (${target.complainantName}). संबंध: ${typeLabel}. कारण: "${payload.reason}". द्वारा: ${payload.officerName}`,
      category: "STATUS_CHANGE",
      officerName: payload.officerName,
      timestamp: new Date().toISOString(),
    });

    // Timeline for Target
    this.addTimelineEvent(target.id, {
      title: `लिंक किया गया / Linked with ${primary.complaintNumber} (${typeLabel})`,
      description: `संबंधित शिकायत: ${primary.complaintNumber} (${primary.complainantName}). संबंध: ${typeLabel}. कारण: "${payload.reason}". द्वारा: ${payload.officerName}`,
      category: "STATUS_CHANGE",
      officerName: payload.officerName,
      timestamp: new Date().toISOString(),
    });

    saveComplaintsToStorage(complaintsStore);
    return { primary: complaintsStore[pIdx], target: complaintsStore[tIdx] };
  },

  async delinkComplaintsFull(payload: {
    primaryComplaintId: string;
    targetComplaintNumber: string;
    reason: string;
    officerName: string;
  }): Promise<{ primary: ComplaintItem; target?: ComplaintItem }> {
    const pIdx = complaintsStore.findIndex(
      (c) => c.id === payload.primaryComplaintId || c.complaintNumber === payload.primaryComplaintId
    );
    if (pIdx === -1) throw new Error("Primary complaint not found");

    const primary = complaintsStore[pIdx];
    const pUpdatedList = (primary.linkedComplaintsList || []).filter(
      (l) => l.complaintNumber !== payload.targetComplaintNumber
    );

    complaintsStore[pIdx] = {
      ...primary,
      linkedComplaintsList: pUpdatedList,
      linkedComplaintNumber: primary.linkedComplaintNumber === payload.targetComplaintNumber ? undefined : primary.linkedComplaintNumber,
      crossComplaintNumber: primary.crossComplaintNumber === payload.targetComplaintNumber ? undefined : primary.crossComplaintNumber,
      isCrossComplaint: primary.crossComplaintNumber === payload.targetComplaintNumber ? false : primary.isCrossComplaint,
      updatedAt: new Date().toISOString(),
    };

    this.addTimelineEvent(primary.id, {
      title: `डी-लिंक किया गया / Delinked from ${payload.targetComplaintNumber}`,
      description: `शिकायत ${payload.targetComplaintNumber} से संबंध हटाया गया। कारण: "${payload.reason}". द्वारा: ${payload.officerName}`,
      category: "STATUS_CHANGE",
      officerName: payload.officerName,
      timestamp: new Date().toISOString(),
    });

    // Target complaint update if exists
    const tIdx = complaintsStore.findIndex((c) => c.complaintNumber === payload.targetComplaintNumber);
    let updatedTarget: ComplaintItem | undefined;
    if (tIdx !== -1) {
      const target = complaintsStore[tIdx];
      const tUpdatedList = (target.linkedComplaintsList || []).filter(
        (l) => l.complaintNumber !== primary.complaintNumber
      );
      complaintsStore[tIdx] = {
        ...target,
        linkedComplaintsList: tUpdatedList,
        linkedComplaintNumber: target.linkedComplaintNumber === primary.complaintNumber ? undefined : target.linkedComplaintNumber,
        crossComplaintNumber: target.crossComplaintNumber === primary.complaintNumber ? undefined : target.crossComplaintNumber,
        isCrossComplaint: target.crossComplaintNumber === primary.complaintNumber ? false : target.isCrossComplaint,
        updatedAt: new Date().toISOString(),
      };
      this.addTimelineEvent(target.id, {
        title: `डी-लिंक किया गया / Delinked from ${primary.complaintNumber}`,
        description: `शिकायत ${primary.complaintNumber} से संबंध हटाया गया। कारण: "${payload.reason}". द्वारा: ${payload.officerName}`,
        category: "STATUS_CHANGE",
        officerName: payload.officerName,
        timestamp: new Date().toISOString(),
      });
      updatedTarget = complaintsStore[tIdx];
    }

    saveComplaintsToStorage(complaintsStore);
    return { primary: complaintsStore[pIdx], target: updatedTarget };
  },

  async issueNcrReference(
    complaintId: string,
    ncrNumber: string,
    sections: string,
    officerName: string
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    complaintsStore[index] = {
      ...complaintsStore[index],
      status: "DISPOSED_CIVIL_NATURE",
      updatedAt: new Date().toISOString(),
    };

    this.addTimelineEvent(complaintsStore[index].id, {
      title: `NCR Issued: ${ncrNumber}`,
      description: `Non-Cognizable Report generated under Section 174 BNSS (${sections}). Complainant instructed on magistrate remedy.`,
      category: "STATUS_CHANGE",
      officerName,
      timestamp: new Date().toISOString(),
      documentName: `NCR-${ncrNumber}.pdf`,
    });

    return complaintsStore[index];
  },

  async linkFir(
    complaintId: string,
    firNumber: string,
    sections: string,
    officerName: string
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    complaintsStore[index] = {
      ...complaintsStore[index],
      status: "RECOMMENDED_FOR_FIR",
      isFirRegistered: true,
      firNumber: firNumber,
      firSections: sections,
      firDate: new Date().toISOString(),
      firRegisteredBy: officerName,
      dispositionType: "FIR_REGISTERED",
      updatedAt: new Date().toISOString(),
    };

    this.addTimelineEvent(complaintsStore[index].id, {
      title: `Converted to FIR: ${firNumber}`,
      description: `Cognizable offense substantiated under BNS sections ${sections}. Formal regular FIR ${firNumber} registered at Police Station by ${officerName}.`,
      category: "STATUS_CHANGE",
      officerName,
      timestamp: new Date().toISOString(),
      documentName: `FIR-${firNumber}.pdf`,
    });

    saveComplaintsToStorage(complaintsStore);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("complaints_updated"));
    }

    return complaintsStore[index];
  },

  async requestProgressReport(
    complaintId: string,
    shoName: string,
    shoPno: string,
    remarks: string,
    deadlineHours: number = 24,
    user?: AuthUserContext
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const complaint = complaintsStore[index];
    user=user||currentComplaintUser();
    if(!user)throw new Error('Officer identity is required.');
    if (user) {
      const perm = canAskProgressReport(user, complaint);
      if (!perm.allowed) {
        throw new Error(perm.reason || "Unauthorized to request progress report.");
      }
    }

    const now = new Date();
    const requesterRole = user?.role || "SHO";
    const requesterName = user?.name || shoName;
    const requesterId = user?.id || shoPno;

    const progressItem: ProgressRequestItem = {
      id: `prog_req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      complaintId: complaint.id,
      requestedById: requesterId,
      requestedByName: requesterName,
      requestedByRole: requesterRole,
      requestedFromId: complaint.assignedEoId || complaint.assignedEoPno || "",
      requestedFromName: complaint.assignedEoName || "Enquiry Officer",
      requestedFromRole: "ENQUIRY_OFFICER",
      requestedAt: now.toISOString(),
      requestMessage: remarks,
      deadlineHours,
      status: "REQUESTED",
    };

    const progressAudit: ComplaintAuditRecord = {
      id: `audit_${Date.now()}_prog`,
      complaintId: complaint.id,
      action: "PROGRESS_REPORT_REQUESTED",
      actionLabel: `Progress Report Requested by ${requesterName} (${requesterRole})`,
      performedBy: requesterName,
      userRole: requesterRole,
      timestamp: now.toISOString(),
      details: `Supervisory directive issued to EO ${complaint.assignedEoName || "Officer"} within ${deadlineHours}h. Instructions: "${remarks}".`,
    };

    const updated: ComplaintItem = {
      ...complaint,
      progressReportRequested: true,
      progressReportRequestedAt: now.toISOString(),
      progressReportRemarks: remarks,
      progressReportRequestedBy: requesterName,
      progressRequests: [progressItem, ...(complaint.progressRequests || [])],
      auditTrail: [progressAudit, ...(complaint.auditTrail || [])],
      updatedAt: now.toISOString(),
    };

    complaintsStore[index] = updated;

    // Dispatch formal notification to the assigned EO
    if (complaint.assignedEoPno) {
      const notification: OfficerNotification = {
        id: `notif_${Date.now()}_prog`,
        recipientPno: complaint.assignedEoPno,
        recipientName: complaint.assignedEoName || "Assigned Enquiry Officer",
        complaintId: complaint.id,
        complaintNumber: complaint.complaintNumber,
        title: `URGENT: Supervisory Progress Report Demanded (${complaint.complaintNumber})`,
        message: `${requesterRole} ${requesterName} has requested an urgent progress report within ${deadlineHours}h. Directive: "${remarks}"`,
        directions: remarks,
        priority: "URGENT",
        createdAt: now.toISOString(),
        read: false,
      };
      officerNotificationsStore.unshift(notification);
    }

    // Add supervisory directive event into case timeline
    this.addTimelineEvent(complaint.id, {
      title: `Supervisory Directive: Progress Report Demanded`,
      description: `${requesterRole} ${requesterName} (PNO: ${shoPno}) ordered interim progress submission from EO ${complaint.assignedEoName || "Officer"} within ${deadlineHours} hours. Instructions: "${remarks}"`,
      category: "PROGRESS_REQUEST",
      officerName: requesterName,
      officerRank: requesterRole,
      timestamp: now.toISOString(),
    });

    // Dispatch Suggestion to Station General Diary (waits for manual verification)
    const nowTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    try {
      await GeneralDiaryService.generateSuggestionFromSystemEvent({
        eventType: "PROGRESS_REPORT_DEMANDED",
        category: "INVESTIGATION_PROCESS",
        typeCode: "INVESTIGATION_REPORTS",
        typeDisplay: "Investigation Reports",
        typeDisplayHi: "जांच आख्या / पर्यवेक्षी निर्देश (PPR 22.48)",
        subject: `Directive: Progress Report Demanded - ${complaint.complaintNumber}`,
        narrative: `At ${nowTime} hours, ${requesterRole} ${requesterName} issued formal supervisory directions to Enquiry Officer ${complaint.assignedEoName || "Officer"} for expedited enquiry report in ${complaint.complaintNumber}. Instructions: "${remarks}". Compliance window: ${deadlineHours} hours.`,
        officer: {
          name: requesterName,
          rank: requesterRole,
          beltNumber: `${shoPno.slice(-3)}/KKR`,
          pno: shoPno,
        },
        policeStation: complaint.policeStation,
        district: complaint.district || "Panipat",
        relatedRecords: {
          complaintNumber: complaint.complaintNumber,
          personName: complaint.complainantName,
          purpose: remarks,
        },
      });
    } catch (gdErr) {
      console.warn("Could not generate GD suggestion:", gdErr);
    }

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    return updated;
  },

  async submitTransferJustification(
    complaintId: string,
    targetUnitOrStation: string,
    justificationReason: string,
    user: AuthUserContext
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const perm = canTransferJustification(user, complaintsStore[index]);
    if (!perm.allowed) {
      throw new Error(perm.reason || "Unauthorized to submit transfer justification.");
    }

    const complaint = complaintsStore[index];
    const nowIso = new Date().toISOString();

    const record: TransferJustificationRecord = {
      id: `trans_just_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      complaintId: complaint.id,
      requestedById: user.id || user.pno || "SHO",
      requestedByName: user.name || "Supervisory Officer",
      requestedByRole: user.role || "SHO",
      targetUnitOrStation,
      justificationReason,
      timestamp: nowIso,
      status: "SUBMITTED",
    };

    const auditRec: ComplaintAuditRecord = {
      id: `audit_${Date.now()}_trans_just`,
      complaintId: complaint.id,
      action: "TRANSFER_JUSTIFICATION_SUBMITTED",
      actionLabel: `Transfer Justification: ${targetUnitOrStation}`,
      performedBy: user.name || "Supervisory Officer",
      userRole: user.role || "SHO",
      timestamp: nowIso,
      details: `Formal supervisory transfer justification submitted for destination "${targetUnitOrStation}". Reason: "${justificationReason}".`,
    };

    const updated: ComplaintItem = {
      ...complaint,
      transferJustifications: [record, ...(complaint.transferJustifications || [])],
      auditTrail: [auditRec, ...(complaint.auditTrail || [])],
      updatedAt: nowIso,
    };

    this.addTimelineEvent(complaint.id, {
      title: `Transfer Justification Submitted: ${targetUnitOrStation}`,
      description: `Supervisory transfer justification filed by ${user.name || "Officer"} (${user.role || "Supervisory"}). Target Station/Unit: ${targetUnitOrStation}. Reason: "${justificationReason}".`,
      category: "STATUS_CHANGE",
      officerName: user.name || "Officer",
      officerRank: user.rank || (user.role as string),
      timestamp: nowIso,
    });

    complaintsStore[index] = updated;
    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    return updated;
  },

  async deleteEnquiryNote(
    complaintId: string,
    noteId: string,
    officerName: string
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const note = (complaintsStore[index].enquiryNotes || []).find((n) => n.id === noteId);
    complaintsStore[index] = {
      ...complaintsStore[index],
      enquiryNotes: (complaintsStore[index].enquiryNotes || []).filter((n) => n.id !== noteId),
      updatedAt: new Date().toISOString(),
    };

    this.addTimelineEvent(complaintsStore[index].id, {
      title: `Enquiry Note Expunged by EO`,
      description: `Note titled "${note?.noteType.replace(/_/g, " ") || "Enquiry Note"}" removed by assigned Enquiry Officer ${officerName}.`,
      category: "ENQUIRY_NOTE",
      officerName,
      timestamp: new Date().toISOString(),
    });

    return complaintsStore[index];
  },

  async deleteEvidence(
    complaintId: string,
    evidenceId: string,
    officerName: string
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const ev = (complaintsStore[index].attachments || []).find((e) => e.id === evidenceId);
    complaintsStore[index] = {
      ...complaintsStore[index],
      attachments: (complaintsStore[index].attachments || []).filter((e) => e.id !== evidenceId),
      updatedAt: new Date().toISOString(),
    };

    this.addTimelineEvent(complaintsStore[index].id, {
      title: `Evidence Attachment Removed by EO`,
      description: `Attachment "${ev?.name || "Evidence file"}" purged from case docket by assigned Enquiry Officer ${officerName}.`,
      category: "EVIDENCE",
      officerName,
      timestamp: new Date().toISOString(),
    });

    return complaintsStore[index];
  },

  async deleteDocument(
    complaintId: string,
    docId: string,
    officerName: string,
    user?: AuthUserContext
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const cleanDocId = docId.replace(/^doc_att_/, "").replace(/^doc_/, "");
    const doc = (complaintsStore[index].documents || []).find((d) => d.id === docId || d.id === cleanDocId);

    user=user||currentComplaintUser();
    if(!user)throw new Error('Officer identity is required.');
    if (user && doc) {
      const perm = canDeleteDocument(user, doc, complaintsStore[index]);
      if (!perm.allowed) {
        throw new Error(perm.reason || "Access Denied: Only the officer who uploaded or generated this document can delete it.");
      }
    }

    // Delete associated cached processed data from database so no stale analysis lingers
    complaintAutoFillService.deleteByDocumentId(docId);
    complaintAutoFillService.deleteByDocumentId(cleanDocId);
    universalEvidenceService.deleteByDocumentId(docId);
    universalEvidenceService.deleteByDocumentId(cleanDocId);
    if (doc?.fileName) {
      complaintAutoFillService.deleteByFileName(doc.fileName, complaintsStore[index].id);
      complaintAutoFillService.deleteByFileName(doc.fileName, complaintsStore[index].complaintNumber);
      universalEvidenceService.deleteByDocumentId(doc.fileName);
    }

    const nowIso = new Date().toISOString();
    const currentProcessed = complaintsStore[index].processedDocuments;
    const filteredProcessed = currentProcessed
      ? currentProcessed.filter(
          (p: any) =>
            p.documentId !== docId &&
            p.documentId !== cleanDocId &&
            p.id !== docId &&
            p.id !== cleanDocId &&
            p.rawDocument?.fileName !== doc?.fileName &&
            p.processedData?.classifiedDocumentName !== doc?.fileName
        )
      : undefined;

    complaintsStore[index] = {
      ...complaintsStore[index],
      documents: (complaintsStore[index].documents || []).filter(
        (d) => d.id !== docId && d.id !== cleanDocId && `doc_${d.id}` !== docId
      ),
      attachments: (complaintsStore[index].attachments || []).filter(
        (a) => a.id !== docId && a.id !== cleanDocId && `doc_${a.id}` !== docId
      ),
      processedDocuments: filteredProcessed,
      updatedAt: nowIso,
    };

    const deleteAudit: ComplaintAuditRecord = {
      id: `audit_${Date.now()}_doc_del`,
      complaintId: complaintsStore[index].id,
      action: "DOCUMENT_DELETED",
      actionLabel: `Document Deleted: ${doc?.fileName || "Document"}`,
      performedBy: user?.name || officerName,
      userRole: user?.role || "OFFICER",
      timestamp: nowIso,
      details: `Document "${doc?.fileName || docId}" removed by ${user?.name || officerName}. Original creator: ${doc?.createdByName || doc?.uploadedBy || "Unknown"}.`,
    };
    if (!complaintsStore[index].auditTrail) complaintsStore[index].auditTrail = [];
    complaintsStore[index].auditTrail!.unshift(deleteAudit);

    this.addTimelineEvent(complaintsStore[index].id, {
      title: `Document Record Deleted`,
      description: `Document record "${doc?.fileName || "Document"}" removed by ${officerName}.`,
      category: "DOCUMENT",
      officerName,
      timestamp: nowIso,
    });

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);
    return complaintsStore[index];
  },

  /**
   * Resolves full-fidelity dataUrl for any document across Memory, IndexedDB, and Server Evidence Store.
   */
  async resolveDocumentDataUrl(
    complaintId: string,
    doc: { id?: string; fileName?: string; originalName?: string; dataUrl?: string; fileUrl?: string }
  ): Promise<string | null> {
    // 1. Direct valid dataUrl on the document
    if (doc.dataUrl && doc.dataUrl.length > 50 && !doc.dataUrl.includes("HARYANA%20POLICE%20OFFICIAL%20DOCKET")) {
      return doc.dataUrl;
    }
    if (doc.fileUrl && doc.fileUrl.length > 50 && !doc.fileUrl.includes("HARYANA%20POLICE%20OFFICIAL%20DOCKET")) {
      return doc.fileUrl;
    }

    // 2. In-memory Map cache
    if (doc.id && globalDataUrlCache.has(doc.id)) {
      return globalDataUrlCache.get(doc.id)!;
    }
    if (doc.fileName) {
      if (globalDataUrlCache.has(`${complaintId}_${doc.fileName}`)) {
        return globalDataUrlCache.get(`${complaintId}_${doc.fileName}`)!;
      }
      if (globalDataUrlCache.has(doc.fileName)) {
        return globalDataUrlCache.get(doc.fileName)!;
      }
    }
    if (doc.originalName && globalDataUrlCache.has(doc.originalName)) {
      return globalDataUrlCache.get(doc.originalName)!;
    }

    // 3. Persistent IndexedDB Blob Store
    if (typeof window !== "undefined") {
      if (doc.id) {
        const idb = await evidenceBlobStore.get(doc.id);
        if (idb) return idb;
      }
      if (doc.fileName) {
        const idbByCase = await evidenceBlobStore.get(`${complaintId}_${doc.fileName}`);
        if (idbByCase) return idbByCase;
        const idbByName = await evidenceBlobStore.get(doc.fileName);
        if (idbByName) return idbByName;
      }
      if (doc.originalName) {
        const idbOrig = await evidenceBlobStore.get(doc.originalName);
        if (idbOrig) return idbOrig;
      }
    }

    // 4. Universal Evidence Service local cache
    if (doc.fileName) {
      const evRec = universalEvidenceService.getByFileName(doc.fileName, complaintId) ||
        (doc.originalName ? universalEvidenceService.getByFileName(doc.originalName, complaintId) : null);
      if (evRec?.rawDocument?.dataUrl && evRec.rawDocument.dataUrl.length > 50) {
        return evRec.rawDocument.dataUrl;
      }
    }

    // 5. Query persistent server store API
    try {
      if (typeof window !== "undefined" && doc.fileName) {
        const url = `/api/evidence/store?fileName=${encodeURIComponent(doc.fileName)}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.record?.rawDocument?.dataUrl) {
            const serverUrl = json.record.rawDocument.dataUrl;
            if (serverUrl && serverUrl.length > 50) {
              evidenceBlobStore.put(doc.fileName, serverUrl);
              return serverUrl;
            }
          }
        }
      }
    } catch {
      // ignore
    }

    return null;
  },

  async addConfidentialDossier(
    complaintId: string,
    dossier: {
      officerName: string;
      officerRank?: string;
      officerPno: string;
      category: 'INFORMANT_LEAD' | 'FIELD_OBSERVATION' | 'OFF_RECORD_STATEMENT' | 'SUSPECT_INTEL' | 'PERSONAL_REMINDER' | 'GENERAL_CONFIDENTIAL';
      title: string;
      content: string;
      referenceTag?: string;
      attachmentName?: string;
      attachmentDataUrl?: string;
      attachmentType?: 'audio' | 'video' | 'document' | 'image' | 'other';
      attachmentSize?: string;
    }
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const newDossier: ConfidentialDossierItem = {
      id: `dos_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      complaintId: complaintsStore[index].id,
      officerName: dossier.officerName,
      officerRank: dossier.officerRank,
      officerPno: dossier.officerPno,
      category: dossier.category,
      title: dossier.title,
      content: dossier.content,
      referenceTag: dossier.referenceTag,
      attachmentName: dossier.attachmentName,
      attachmentDataUrl: dossier.attachmentDataUrl,
      attachmentType: dossier.attachmentType,
      attachmentSize: dossier.attachmentSize,
      createdAt: new Date().toISOString(),
    };

    if (!complaintsStore[index].confidentialDossier) {
      complaintsStore[index].confidentialDossier = [];
    }
    complaintsStore[index].confidentialDossier!.unshift(newDossier);
    saveComplaintsToStorage(complaintsStore);

    // Note: No public timeline or history generated - strictly private EO dossier
    return complaintsStore[index];
  },

  async deleteConfidentialDossier(
    complaintId: string,
    dossierId: string
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    complaintsStore[index] = {
      ...complaintsStore[index],
      confidentialDossier: (complaintsStore[index].confidentialDossier || []).filter((d) => d.id !== dossierId),
      updatedAt: new Date().toISOString(),
    };
    saveComplaintsToStorage(complaintsStore);

    return complaintsStore[index];
  },

  addAuditRecord(
    complaintId: string,
    record: Omit<ComplaintAuditRecord, "id" | "timestamp" | "complaintId"> & { timestamp?: string; id?: string }
  ): ComplaintItem | undefined {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) return undefined;
    const newAudit: ComplaintAuditRecord = {
      id: record.id || `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      complaintId: complaintsStore[index].id,
      action: record.action,
      actionLabel: record.actionLabel,
      performedBy: record.performedBy,
      userPno: record.userPno,
      userRole: record.userRole,
      timestamp: record.timestamp || new Date().toISOString(),
      details: record.details,
      outcome: record.outcome,
      reason: record.reason,
      metadata: record.metadata,
    };
    if (!complaintsStore[index].auditTrail) {
      complaintsStore[index].auditTrail = [];
    }
    complaintsStore[index].auditTrail!.unshift(newAudit);
    complaintsStore[index].updatedAt = new Date().toISOString();
    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);
    return complaintsStore[index];
  },

  async addComplaintReport(
    complaintId: string,
    report: Omit<ComplaintReportItem, "id" | "createdAt" | "complaintId"> & { id?: string; createdAt?: string; complaintId?: string },
    options?: { isNewVersion?: boolean },
    user?: AuthUserContext
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const existingReports = complaintsStore[index].reports || [];
    const nowIso = new Date().toISOString();
    const existingIndex = report.id ? existingReports.findIndex((r) => r.id === report.id) : -1;

    user=user||currentComplaintUser();
    if(!user)throw new Error('Officer identity is required.');
    if (user) {
      if (existingIndex !== -1 && !options?.isNewVersion) {
        const prev = existingReports[existingIndex];
        const perm = canEditDocument(user, prev, complaintsStore[index]);
        if (!perm.allowed) {
          throw new Error(perm.reason || "Access Denied: Only the creator can edit this report.");
        }
      } else {
        const perm = canCreateDocument(user, complaintsStore[index]);
        if (!perm.allowed && !canCreateShoReport(user, complaintsStore[index]).allowed) {
          throw new Error(perm.reason || "Unauthorized to create or upload reports for this complaint.");
        }
      }
    }

    let targetReport: ComplaintReportItem;

    if (existingIndex !== -1 && !options?.isNewVersion) {
      // Update existing report in-place
      const prev = existingReports[existingIndex];
      targetReport = {
        ...prev,
        ...report,
        id: prev.id,
        complaintId: complaintsStore[index].id,
        versionNumber: prev.versionNumber || 1,
        title: report.title || prev.title,
        content: report.content !== undefined ? report.content : prev.content,
        contentHtml: report.contentHtml !== undefined ? report.contentHtml : prev.contentHtml,
        status: report.status || prev.status || "Saved in Complaint",
        lastModifiedBy: user?.name || report.lastModifiedBy || report.officerName || prev.lastModifiedBy,
        lastModifiedByUserId: user?.id || user?.pno,
        updatedAt: nowIso,
        recommendationType: report.recommendationType || prev.recommendationType,
      };
      existingReports[existingIndex] = targetReport;
      complaintsStore[index].reports = [...existingReports];
    } else {
      // Create new report or new version
      const maxVer = existingReports.reduce((max, r) => Math.max(max, r.versionNumber || 1), 0);
      const versionNumber = options?.isNewVersion ? maxVer + 1 : (report.versionNumber || maxVer + 1);

      const createdByUserId = user?.id || user?.pno || report.createdByUserId || report.officerPno || report.officerName;
      const createdByRole = user?.role || report.createdByRole || report.officerRank || "ENQUIRY_OFFICER";
      const createdByName = user?.name || report.officerName || "Enquiry Officer";

      targetReport = {
        id: (options?.isNewVersion ? null : report.id) || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        complaintId: complaintsStore[index].id,
        versionNumber,
        title: report.title,
        reportType: report.reportType || "RECOMMENDATION_REPORT",
        reportTypeLabel: report.reportTypeLabel || "Enquiry Report",
        dispatchNo: report.dispatchNo,
        generatedDate: report.generatedDate || nowIso,
        officerName: report.officerName || "Enquiry Officer",
        officerRank: report.officerRank,
        officerPno: report.officerPno,
        conclusionSummary: report.conclusionSummary,
        content: report.content,
        contentHtml: report.contentHtml,
        fileName: report.fileName,
        fileSize: report.fileSize,
        fileUrl: report.fileUrl,
        dataUrl: report.dataUrl,
        fileFormat: report.fileFormat || "TXT",
        isUploaded: report.isUploaded || false,
        createdAt: report.createdAt || nowIso,
        updatedAt: nowIso,
        createdBy: createdByName,
        lastModifiedBy: createdByName,
        createdByUserId,
        createdByRole: String(createdByRole),
        currentOwnerUserId: createdByUserId,
        source: report.isUploaded ? "UPLOADED" : "GENERATED",
        status: report.status || "Saved in Complaint",
        recommendationType: report.recommendationType,
        isFirRecommended: report.isFirRecommended,
        selectedOutcome: report.selectedOutcome,
        analysisClassification: report.analysisClassification,
        analysisRationale: report.analysisRationale,
      };

      complaintsStore[index].reports = [targetReport, ...existingReports];
    }

    if (report.isFirRecommended) {
      complaintsStore[index].isRecommendedForFir = true;
      complaintsStore[index].recommendedAction = "RECOMMEND_FIR";
    }

    if (report.selectedOutcome) {
      complaintsStore[index].eoOutcome = report.selectedOutcome;
      if (report.selectedOutcome === "Complete") {
        complaintsStore[index].status = "COMPLETE";
        complaintsStore[index].workflowState = "COMPLETE";
      } else if (report.selectedOutcome === "Pending") {
        complaintsStore[index].status = "ENQUIRY_IN_PROGRESS";
        complaintsStore[index].workflowState = "PENDING";
      } else if (report.selectedOutcome === "FIR Recommend") {
        complaintsStore[index].status = "RECOMMENDED_FOR_FIR";
        complaintsStore[index].workflowState = "FIR_RECOMMENDED";
      }
    }

    complaintsStore[index].updatedAt = nowIso;

    const repAudit: ComplaintAuditRecord = {
      id: `audit_${Date.now()}_rep`,
      complaintId: complaintsStore[index].id,
      action: report.isUploaded ? "REPORT_UPLOADED" : "REPORT_GENERATED",
      actionLabel: `Report ${report.isUploaded ? "Uploaded" : "Generated"}: ${report.title}`,
      performedBy: user?.name || report.officerName || "Enquiry Officer",
      userRole: user?.role || report.officerRank || "ENQUIRY_OFFICER",
      timestamp: nowIso,
      details: `Enquiry Report "${report.title}" (${report.reportTypeLabel || "Enquiry Report"}) saved with version v${targetReport.versionNumber || 1}.`,
    };
    if (!complaintsStore[index].auditTrail) complaintsStore[index].auditTrail = [];
    complaintsStore[index].auditTrail!.unshift(repAudit);

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    return complaintsStore[index];
  },

  async submitEoReportWithOutcome(
    complaintId: string,
    report: Omit<ComplaintReportItem, "id" | "createdAt" | "complaintId"> & { id?: string; createdAt?: string; complaintId?: string },
    outcome: EOOutcome,
    officerName: string,
    officerRank?: string,
    officerPno?: string,
    userRole?: string
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const complaint = complaintsStore[index];
    const nowIso = new Date().toISOString();
    const existingReports = complaint.reports || [];
    const reportId = report.id || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const existingReportIndex = existingReports.findIndex((r) => r.id === reportId);
    const versionNumber = existingReportIndex >= 0 ? (existingReports[existingReportIndex].versionNumber || 1) : existingReports.length + 1;

    const newReport: ComplaintReportItem = {
      id: reportId,
      complaintId: complaint.id,
      versionNumber,
      title: report.title,
      reportType: report.reportType,
      reportTypeLabel: report.reportTypeLabel,
      dispatchNo: report.dispatchNo,
      generatedDate: report.generatedDate || nowIso.split("T")[0],
      officerName: report.officerName || officerName,
      officerRank: report.officerRank || officerRank,
      officerPno: report.officerPno || officerPno,
      conclusionSummary: report.conclusionSummary,
      content: report.content,
      contentHtml: report.contentHtml,
      fileName: report.fileName,
      fileSize: report.fileSize,
      fileUrl: report.fileUrl,
      dataUrl: report.dataUrl,
      fileFormat: report.fileFormat,
      isUploaded: report.isUploaded,
      createdAt: report.createdAt || (existingReportIndex >= 0 ? existingReports[existingReportIndex].createdAt : nowIso),
      createdBy: officerName,
      lastModifiedBy: officerName,
      createdByUserId: officerPno || officerName,
      createdByRole: userRole || officerRank || "ENQUIRY_OFFICER",
      createdByName: officerName,
      currentOwnerUserId: officerPno || officerName,
      source: report.isUploaded ? "UPLOADED" : "GENERATED",
      recommendationType: report.recommendationType,
      isFirRecommended: outcome === "FIR Recommend" || report.isFirRecommended,
      selectedOutcome: outcome,
      status: "Saved in Complaint",
      // CRITICAL FIX: Generating/saving a report NEVER automatically sends it to SHO!
      sentToSho: existingReportIndex >= 0 ? (existingReports[existingReportIndex].sentToSho || false) : false,
      sentToShoAt: existingReportIndex >= 0 ? existingReports[existingReportIndex].sentToShoAt : undefined,
      sentToShoBy: existingReportIndex >= 0 ? existingReports[existingReportIndex].sentToShoBy : undefined,
      analysisClassification: report.analysisClassification,
      analysisRationale: report.analysisRationale,
    };

    let updatedReportsList: ComplaintReportItem[];
    if (existingReportIndex >= 0) {
      updatedReportsList = [...existingReports];
      updatedReportsList[existingReportIndex] = newReport;
    } else {
      updatedReportsList = [newReport, ...existingReports];
    }

    // Keep active enquiry status - DO NOT mark completed or sent to SHO upon saving a report
    const activeStatus: ComplaintStatus =
      complaint.status === "REGISTERED"
        ? "ASSIGNED_TO_EO"
        : (complaint.status || "ENQUIRY_IN_PROGRESS");

    complaintsStore[index] = {
      ...complaint,
      reports: updatedReportsList,
      status: activeStatus,
      // CRITICAL FIX: isSentToSho remains false until user explicitly clicks "Send to SHO" and picks category!
      isSentToSho: false,
      shoActionRequired: false,
      eoOutcome: outcome,
      updatedAt: nowIso,
    };

    const wasRejected = complaint.shoDecision === "REJECT" || complaint.workflowState === "CORRECTION_REQUIRED";
    if (wasRejected && outcome === "Complete") {
      const shoNotif: OfficerNotification = {
        id: `notif_${Date.now()}_sho_resubmitted`,
        recipientPno: "HR-04291882",
        recipientName: "Station House Officer (SHO)",
        complaintId: complaint.id,
        complaintNumber: complaint.complaintNumber,
        title: `REPORT RESUBMITTED: ${complaint.complaintNumber}`,
        message: `EO ${officerName} has corrected and saved the enquiry report on ${complaint.complaintNumber}.`,
        createdAt: nowIso,
        priority: "URGENT",
      };
      officerNotificationsStore.unshift(shoNotif);
      saveNotificationsToStorage(officerNotificationsStore);
    }

    // Add audit records
    this.addAuditRecord(complaint.id, {
      action: report.isUploaded ? "REPORT_UPLOADED" : "REPORT_SAVED",
      actionLabel: report.isUploaded ? `Report Uploaded (v${versionNumber})` : `Report Saved (v${versionNumber})`,
      performedBy: officerName,
      userPno: officerPno,
      userRole: userRole || "ENQUIRY_OFFICER",
      timestamp: nowIso,
      details: `${report.title} (${report.reportTypeLabel || report.reportType}) - File: ${report.fileName || "Draft proforma"}`,
      outcome,
    });

    this.addAuditRecord(complaint.id, {
      action: "EO_OUTCOME_SELECTED",
      actionLabel: `Outcome Selected: ${outcome}`,
      performedBy: officerName,
      userPno: officerPno,
      userRole: userRole || "ENQUIRY_OFFICER",
      timestamp: nowIso,
      outcome,
      details: `Enquiry Officer designated outcome as: "${outcome}". Current main status: ${getMainComplaintStatus(complaintsStore[index])}.`,
    });

    this.addTimelineEvent(complaint.id, {
      title: `Enquiry Report Recorded (v${versionNumber}) - Outcome: ${outcome}`,
      description: `EO ${officerName} recorded report "${report.title}". Outcome set to ${outcome}.`,
      category: "STATUS_CHANGE",
      officerName,
      timestamp: nowIso,
      documentName: report.fileName,
    });

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("complaints_updated", { detail: complaintsStore[index] }));
    }

    return complaintsStore[index];
  },

  async sendReportToSho(
    complaintId: string,
    officerName: string,
    officerPno: string = "HR-04291882",
    remarks?: string,
    options?: {
      recommendedCategory?: 'NCR' | 'FIR_RECOMMEND' | 'CLOSURE' | string;
      eoId?: string;
      reportId?: string;
      reportTitle?: string;
      content?: string;
      contentHtml?: string;
      dataUrl?: string;
      fileName?: string;
      fileFormat?: string;
      fileSize?: string;
      dispatchNo?: string;
      officerRank?: string;
      recommendationType?: any;
    }
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const complaint = complaintsStore[index];
    const nowIso = new Date().toISOString();

    const recommendedCategory = options?.recommendedCategory || (complaint.eoOutcome === "FIR Recommend" ? "FIR_RECOMMEND" : "NCR");
    const displayCategory =
      recommendedCategory === "FIR_RECOMMEND"
        ? "FIR Recommend"
        : recommendedCategory === "CLOSURE"
        ? "Closure"
        : "NCR";

    const targetReportId = options?.reportId;
    const targetReportTitle = options?.reportTitle;

    let foundTarget = false;
    const updatedReports = (complaint.reports || []).map((r, i) => {
      const isTarget = targetReportId
        ? r.id === targetReportId
        : targetReportTitle
        ? r.title === targetReportTitle
        : (!targetReportId && !targetReportTitle && complaint.reports && complaint.reports.length === 1 && i === 0);

      if (isTarget) {
        foundTarget = true;
        return {
          ...r,
          sentToSho: true,
          sentToShoAt: nowIso,
          sentToShoBy: officerName,
          status: "Saved in Complaint" as const,
          content: options?.content || r.content,
          contentHtml: options?.contentHtml || r.contentHtml,
          dataUrl: options?.dataUrl || r.dataUrl,
          fileName: options?.fileName || r.fileName,
          fileFormat: options?.fileFormat || r.fileFormat,
          fileSize: options?.fileSize || r.fileSize,
        };
      }
      return r;
    });

    // If report is not yet in complaint.reports, auto-save it now into reports list
    if (!foundTarget) {
      const newReportId = targetReportId || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const reportTitle = targetReportTitle || `जांच आख्या / Enquiry Report (${displayCategory})`;
      const repType =
        recommendedCategory === "FIR_RECOMMEND"
          ? "FIR_RECOMMENDED"
          : recommendedCategory === "CLOSURE"
          ? "CLOSURE_REPORT"
          : "NCR";

      const autoSavedReport: ComplaintReportItem = {
        id: newReportId,
        complaintId: complaint.id,
        versionNumber: (complaint.reports?.length || 0) + 1,
        title: reportTitle,
        reportType: repType,
        reportTypeLabel: `Enquiry Report (${displayCategory})`,
        dispatchNo: options?.dispatchNo || complaint.complaintNumber,
        generatedDate: nowIso.split("T")[0],
        officerName: officerName,
        officerRank: options?.officerRank || complaint.assignedEoRank || "Enquiry Officer (EO)",
        officerPno: officerPno,
        conclusionSummary: remarks || `Enquiry report submitted by EO ${officerName} with recommendation ${displayCategory}.`,
        content: options?.content || remarks || `Enquiry report submitted by EO ${officerName} recommending ${displayCategory}. Case forwarded for SHO review and supervisory decision.`,
        contentHtml: options?.contentHtml,
        dataUrl: options?.dataUrl,
        fileName: options?.fileName || `${reportTitle.replace(/[\/\\?%*:|"<> ]/g, "_")}.html`,
        fileFormat: options?.fileFormat || "HTML",
        fileSize: options?.fileSize || (options?.contentHtml ? `${Math.round(options.contentHtml.length / 1024) || 4} KB` : "4 KB"),
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: officerName,
        lastModifiedBy: officerName,
        createdByUserId: options?.eoId || complaint.assignedEoId || officerPno,
        createdByRole: "ENQUIRY_OFFICER",
        createdByName: officerName,
        currentOwnerUserId: options?.eoId || complaint.assignedEoId || officerPno,
        source: "GENERATED",
        status: "Saved in Complaint",
        recommendationType:
          options?.recommendationType ||
          (recommendedCategory === "FIR_RECOMMEND"
            ? "FIR_RECOMMENDED"
            : recommendedCategory === "CLOSURE"
            ? "GAMINI"
            : "NCR"),
        isFirRecommended: recommendedCategory === "FIR_RECOMMEND",
        selectedOutcome: recommendedCategory === "FIR_RECOMMEND" ? "FIR Recommend" : "Complete",
        sentToSho: true,
        sentToShoAt: nowIso,
        sentToShoBy: officerName,
      };

      updatedReports.unshift(autoSavedReport);
    }

    let nextStatus: ComplaintStatus = "REPORT_SUBMITTED";
    let isRecommendedForFir = complaint.isRecommendedForFir;
    let recommendedAction = complaint.recommendedAction;
    let nextWorkflowState: WorkflowState = "SENT_TO_SHO";

    if (recommendedCategory === "FIR_RECOMMEND") {
      nextStatus = "RECOMMENDED_FOR_FIR";
      isRecommendedForFir = true;
      recommendedAction = "RECOMMEND_FIR";
      nextWorkflowState = "FIR_RECOMMENDED";
    }

    complaintsStore[index] = {
      ...complaint,
      reports: updatedReports,
      isSentToSho: true,
      sentToShoAt: nowIso,
      sentToShoBy: officerName,
      status: nextStatus,
      workflowState: nextWorkflowState,
      eoRecommendedCategory: recommendedCategory,
      eoRecommendedBy: officerName,
      eoRecommendedById: options?.eoId || complaint.assignedEoId || officerPno,
      eoRecommendedAt: nowIso,
      eoRecommendedReportId: targetReportId,
      eoRecommendedReportTitle: targetReportTitle || (complaint.reports && complaint.reports[0]?.title) || "Enquiry Report",
      eoRecommendedRemarks: remarks,
      shoActionRequired: true,
      shoDecision: undefined,
      shoDecisionAt: undefined,
      shoDecisionBy: undefined,
      rejectionReason: undefined,
      rejectionAt: undefined,
      rejectionBy: undefined,
      isReportViewedBySho: false,
      shoReportViewedAt: undefined,
      isRecommendedForFir,
      recommendedAction,
      updatedAt: nowIso,
    };

    // Audit record
    this.addAuditRecord(complaint.id, {
      action: "SENT_TO_SHO",
      actionLabel: `Report Sent to SHO (EO Recommendation: ${displayCategory})`,
      performedBy: officerName,
      userPno: officerPno,
      userRole: "ENQUIRY_OFFICER",
      timestamp: nowIso,
      outcome: displayCategory,
      details: remarks || `EO submitted completed enquiry report to SHO with recommendation: ${displayCategory}.`,
      metadata: {
        eoRecommendedCategory: recommendedCategory,
        eoId: options?.eoId || complaint.assignedEoId,
        reportTitle: options?.reportTitle,
      },
    });

    // Timeline
    this.addTimelineEvent(complaint.id, {
      title: `Enquiry Report Dispatched to SHO (Recommendation: ${displayCategory})`,
      description: `Enquiry Officer ${officerName} submitted report to SHO for review. EO Recommendation: ${displayCategory}. Remarks: ${remarks || "Awaiting SHO approval."}`,
      category: "STATUS_CHANGE",
      officerName,
      timestamp: nowIso,
    });

    // Officer Notification for SHO
    const shoNotif: OfficerNotification = {
      id: `notif_${Date.now()}_sho_action`,
      recipientPno: "HR-04291882",
      recipientName: "Station House Officer (SHO)",
      complaintId: complaint.id,
      complaintNumber: complaint.complaintNumber,
      title: `View Complaint Report: ${complaint.complaintNumber}`,
      message: `EO ${officerName} submitted enquiry report for Complaint #${complaint.complaintNumber} (${displayCategory}). Click to view report before taking action.`,
      createdAt: nowIso,
      priority: complaint.priority === "ROUTINE" ? "URGENT" : "CRITICAL",
      read: false,
    };
    officerNotificationsStore.unshift(shoNotif);
    saveNotificationsToStorage(officerNotificationsStore);

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("complaints_updated", { detail: complaintsStore[index] }));
      window.dispatchEvent(new CustomEvent("officer_notifications_updated", { detail: shoNotif }));
    }

    return complaintsStore[index];
  },

  async sendReportToSo(
    complaintId: string,
    officerName: string,
    officerPno: string,
    data: {
      status: string;
      remarks?: string;
      soName: string;
      soRole?: string;
      soId?: string;
      reportId?: string;
    }
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const complaint = complaintsStore[index];
    if (!data.soName?.trim()) throw new Error("Select the Supervisory Officer before sending.");
    if (!data.status?.trim()) throw new Error("Select a status before sending to SO.");
    if (complaint.isFirRegistered || complaint.firNumber) {
      throw new Error("FIR is already registered. The report cannot be forwarded for final approval.");
    }
    if (complaint.shoDecision !== "APPROVE" && complaint.workflowState !== "SHO_APPROVED") {
      throw new Error("The SHO must approve the report before it is sent to SO.");
    }

    const nowIso = new Date().toISOString();
    let foundTarget = false;
    const updatedReports = (complaint.reports || []).map((report) => {
      const isTarget = data.reportId ? report.id === data.reportId : report.createdByRole === "SHO" || /\bSHO\b/i.test(report.officerRank || "");
      if (!isTarget || foundTarget) return report;
      foundTarget = true;
      return {
        ...report,
        sentToSo: true,
        sentToSoAt: nowIso,
        sentToSoBy: officerName,
        soName: data.soName.trim(),
        soRole: data.soRole,
        soRecommendation: data.status,
        soRemarks: data.remarks,
      };
    });

    if (!foundTarget) {
      throw new Error("SHO supervisory report not found. Save or generate it before sending to SO.");
    }

    complaintsStore[index] = {
      ...complaint,
      reports: updatedReports,
      workflowState: "SENT_TO_SO",
      status: "REPORT_SUBMITTED",
      isSentToSo: true,
      sentToSoAt: nowIso,
      sentToSoBy: officerName,
      soName: data.soName.trim(),
      soRole: data.soRole,
      soId: data.soId,
      soActionRequired: true,
      soDecision: undefined,
      soDecisionAt: undefined,
      soDecisionBy: undefined,
      updatedAt: nowIso,
    };

    this.addAuditRecord(complaint.id, {
      action: "SENT_TO_SO",
      actionLabel: `SHO Report Sent to SO (${data.status})`,
      performedBy: officerName,
      userPno: officerPno,
      userRole: "SHO",
      timestamp: nowIso,
      outcome: data.status,
      details: `SHO ${officerName} forwarded the supervisory report to ${data.soName} with status ${data.status}. ${data.remarks || ""}`,
      metadata: { soName: data.soName, soRole: data.soRole, status: data.status },
    });

    this.addTimelineEvent(complaint.id, {
      title: `Report Sent to Supervisory Officer (${data.status})`,
      description: `SHO report forwarded to ${data.soName} for final decision. Recommended status: ${data.status}.`,
      category: "STATUS_CHANGE",
      officerName,
      timestamp: nowIso,
    });

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("complaints_updated", { detail: complaintsStore[index] }));
    }

    return complaintsStore[index];
  },

  /**
   * SHO review no longer finalizes the complaint. It records the SHO's
   * authoritative recommendation and generates the SHO supervisory report;
   * the forwarded report is then sent to the SO for the final decision.
   */
  async shoApprove(
    complaintId: string,
    shoName: string,
    shoPno: string = "HR-04291882",
    remarks?: string,
    finalCategory?: 'NCR' | 'FIR_RECOMMEND' | 'CLOSURE' | string
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const complaint = complaintsStore[index];
    if (complaint.isFirRegistered || complaint.firNumber) {
      throw new Error("FIR is already registered for this complaint. No further approval is allowed.");
    }
    if (complaint.shoDecision === "APPROVE" && complaint.workflowState === "SHO_APPROVED") {
      return complaint;
    }

    const nowIso = new Date().toISOString();
    const chosenCategory = finalCategory || complaint.eoRecommendedCategory || (complaint.eoOutcome === "FIR Recommend" ? "FIR_RECOMMEND" : "NCR");
    const isFir = chosenCategory === "FIR_RECOMMEND" || chosenCategory === "FIR Recommend";
    const isNcr = chosenCategory === "NCR";
    const displayCategory = isFir ? "FIR Recommend" : isNcr ? "NCR" : "Closure";

    const shoReportId = `rep_sho_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const shoReportTitle = isFir
      ? `SHO संज्ञान व एफआईआर संस्तुति आदेश (FIR Registration Recommendation) - ${complaint.complaintNumber}`
      : isNcr
      ? `SHO असंज्ञेय अपराध संस्तुति आदेश (NCR u/s 174 BNSS) - ${complaint.complaintNumber}`
      : `SHO शिकायत निस्तारण संस्तुति आदेश (Closure Recommendation) - ${complaint.complaintNumber}`;

    const shoReportNarrative = `================================================================================
कार्यालय थाना प्रभारी (OFFICE OF STATION HOUSE OFFICER)
थाना: ${complaint.policeStation || "थाना क्षेत्र"}, जिला: ${complaint.district || "District"}
शिकायत संदर्भ सं.: ${complaint.complaintNumber} | दिनांक: ${nowIso.split("T")[0]}
================================================================================
विषय: जांच आख्या अवलोकन उपरांत SHO का पर्यवेक्षीय संस्तुति आदेश (${displayCategory})

1. जांच अधिकारी (EO) संस्तुति: ${complaint.eoRecommendedCategory || displayCategory}
2. SHO पर्यवेक्षीय टिप्पणी: ${remarks || "जांच आख्या, साक्ष्य एवं बयानों का अवलोकन किया गया।"}
3. SHO संस्तुति: ${displayCategory}
4. महत्वपूर्ण बिंदु: यह संस्तुति अंतिम निर्णय हेतु पर्यवेक्षीय अधिकारी (SO/DSP) को भेजी जाएगी।

हस्ताक्षर / आदेशकर्ता:
(${shoName})
थाना प्रभारी (Station House Officer)
PNO: ${shoPno}
थाना: ${complaint.policeStation || "थाना क्षेत्र"}
`;

    const shoReportItem: ComplaintReportItem = {
      id: shoReportId,
      complaintId: complaint.id,
      versionNumber: (complaint.reports?.length || 0) + 1,
      title: shoReportTitle,
      reportType: "SHO_SUPERVISORY_ENDORSEMENT",
      reportTypeLabel: `SHO संस्तुति (${displayCategory})`,
      dispatchNo: `SHO/REC/${complaint.complaintNumber}`,
      generatedDate: nowIso.split("T")[0],
      officerName: shoName,
      officerRank: "Station House Officer (SHO)",
      officerPno: shoPno,
      conclusionSummary: remarks || `SHO recommended final category: ${displayCategory}`,
      content: shoReportNarrative,
      fileFormat: "TXT",
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: shoName,
      createdByName: shoName,
      createdByUserId: shoPno,
      createdByRole: "SHO",
      currentOwnerUserId: shoPno,
      source: "GENERATED",
      status: "Saved in Complaint",
      recommendationType: isFir ? "FIR" : isNcr ? "NCR" : "RAZINAMA",
      isFirRecommended: isFir,
      selectedOutcome: isFir ? "FIR Recommend" : "Complete",
    };

    const updatedReports = [shoReportItem, ...(complaint.reports || [])];

    complaintsStore[index] = {
      ...complaint,
      reports: updatedReports,
      status: "REPORT_SUBMITTED",
      workflowState: "SHO_APPROVED",
      shoFinalCategory: chosenCategory,
      finalCategory: undefined,
      finalStatus: undefined,
      shoDecision: "APPROVE",
      shoDecisionAt: nowIso,
      shoDecisionBy: shoName,
      shoApprovedBy: shoName,
      shoApprovedAt: nowIso,
      shoRemarks: remarks,
      shoActionRequired: false,
      soActionRequired: true,
      isFirApprovedBySho: false,
      firApprovedAt: undefined,
      firApprovedBy: undefined,
      soDecision: undefined,
      soApprovedAt: undefined,
      soApprovedBy: undefined,
      eoRecommendedReportId: complaint.eoRecommendedReportId || (complaint.reports?.[0]?.id),
      updatedAt: nowIso,
    };

    this.addAuditRecord(complaint.id, {
      action: "SHO_RECOMMENDED_TO_SO",
      actionLabel: `SHO Recommendation: ${displayCategory} — forwarded to SO`,
      performedBy: shoName,
      userPno: shoPno,
      userRole: "SHO",
      timestamp: nowIso,
      outcome: displayCategory,
      details: remarks || `SHO approved the enquiry report with recommendation ${displayCategory}; awaiting SO final decision.`,
    });

    this.addTimelineEvent(complaint.id, {
      title: `SHO Recommendation Recorded: ${displayCategory}`,
      description: `Station House Officer ${shoName} recorded recommendation ${displayCategory}. The SHO supervisory report is ready to be sent to the Supervisory Officer.`,
      category: "STATUS_CHANGE",
      officerName: shoName,
      timestamp: nowIso,
    });

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("complaints_updated", { detail: complaintsStore[index] }));
    }

    return complaintsStore[index];
  },

  async soApprove(
    complaintId: string,
    shoName: string,
    shoPno: string = "HR-04291882",
    remarks?: string,
    finalCategory?: 'NCR' | 'FIR_RECOMMEND' | 'CLOSURE' | string
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const complaint = complaintsStore[index];
    if (complaint.workflowState !== "SENT_TO_SO") {
      throw new Error("This complaint must be sent to the Supervisory Officer before final approval.");
    }
    if (complaint.isFirRegistered || complaint.firNumber) {
      throw new Error("FIR is already registered for this complaint. No further final approval is allowed.");
    }
    const nowIso = new Date().toISOString();

    // Final authoritative category selected by the Supervisory Officer (SO/DSP).
    const rawCategory = String(finalCategory || complaint.shoFinalCategory || complaint.eoRecommendedCategory || (complaint.eoOutcome === "FIR Recommend" ? "FIR_RECOMMEND" : "NCR")).trim().toUpperCase().replaceAll(" ", "_");
    const chosenCategory = finalCategory || complaint.shoFinalCategory || complaint.eoRecommendedCategory || rawCategory;
    const isFir = rawCategory.includes("FIR");
    const isNcr = rawCategory === "NCR";
    const isClosure = !isFir && !isNcr;
    const otherFinalStatuses = new Set<ComplaintStatus>([
      "COMPLETE", "DISPOSED_MUTUAL_ACCORD", "DISPOSED_CIVIL_NATURE", "DISPOSED_UNSUBSTANTIATED", "TRANSFERRED_OTHER_PS", "CORRECTION_REQUIRED",
    ]);
    const otherStatus = otherFinalStatuses.has(rawCategory as ComplaintStatus) ? rawCategory as ComplaintStatus : undefined;

    const displayFinalCategory = isFir ? "FIR Recommend" : isNcr ? "NCR" : otherStatus ? otherStatus.replaceAll("_", " ") : "Closure";
    const displayFinalStatus = isFir ? "FIR Recommend" : otherStatus || "COMPLETE";

    let nextWorkflowState: WorkflowState = "COMPLETE";
    let nextStatus: ComplaintStatus = "COMPLETE";
    let isFirApprovedBySho = false;

    if (isFir) {
      nextWorkflowState = "FIR_REGISTRATION_PENDING";
      nextStatus = "FIR_RECOMMEND";
      isFirApprovedBySho = true;
    } else {
      nextWorkflowState = "COMPLETE";
      nextStatus = otherStatus || "COMPLETE";
      isFirApprovedBySho = false;
    }

    // The SHO supervisory report was generated at the SHO approval stage and is left untouched.
    complaintsStore[index] = {
      ...complaint,
      reports: complaint.reports,
      status: nextStatus,
      workflowState: nextWorkflowState,
      shoFinalCategory: complaint.shoFinalCategory || chosenCategory,
      finalCategory: displayFinalCategory,
      finalStatus: displayFinalStatus,
      soDecision: "APPROVE",
      soDecisionAt: nowIso,
      soDecisionBy: shoName,
      soFinalCategory: displayFinalCategory,
      soRemarks: remarks,
      soApprovedAt: nowIso,
      soApprovedBy: shoName,
      isFirApprovedBySo: isFir,
      // Compatibility flags reused by the unchanged Register FIR flow.
      isFirApprovedBySho,
      firApprovedAt: isFirApprovedBySho ? nowIso : undefined,
      firApprovedBy: isFirApprovedBySho ? shoName : undefined,
      soActionRequired: false,
      shoActionRequired: false,
      eoRecommendedReportId: complaint.eoRecommendedReportId || complaint.reports?.[0]?.id,
      updatedAt: nowIso,
    };

    // Audit record
    this.addAuditRecord(complaint.id, {
      action: "SO_APPROVED",
      actionLabel: `SO Final Decision: ${displayFinalCategory} (Status: ${displayFinalStatus})`,
      performedBy: shoName,
      userPno: shoPno,
      userRole: "SHO",
      timestamp: nowIso,
      outcome: displayFinalCategory,
      details: remarks || `SO approved case with authoritative final category: ${displayFinalCategory}. (SHO recommendation was: ${complaint.shoFinalCategory || complaint.eoRecommendedCategory || "Not specified"}).`,
      metadata: {
        shoFinalCategory: chosenCategory,
        finalCategory: displayFinalCategory,
        finalStatus: displayFinalStatus,
        eoRecommendedCategory: complaint.eoRecommendedCategory,
      },
    });

    // Timeline
    this.addTimelineEvent(complaint.id, {
      title: `SO Approved Final Category: ${displayFinalCategory}`,
      description: `Supervisory Officer ${shoName} decided final category: ${displayFinalCategory}. Status set to: ${displayFinalStatus}. ${remarks ? `Remarks: ${remarks}` : ""}`,
      category: "STATUS_CHANGE",
      officerName: shoName,
      timestamp: nowIso,
    });

    // Notify EO that SHO approved
    if (complaint.assignedEoPno) {
      const eoNotif: OfficerNotification = {
        id: `notif_${Date.now()}_eo_approved`,
        recipientPno: complaint.assignedEoPno,
        recipientName: complaint.assignedEoName || "Enquiry Officer",
        complaintId: complaint.id,
        complaintNumber: complaint.complaintNumber,
        title: `Report Decision: ${complaint.complaintNumber}`,
        message: `Supervisory Officer ${shoName} has finalized the case with category "${displayFinalCategory}". ${remarks ? `Remarks: "${remarks}"` : ""}`,
        createdAt: nowIso,
        priority: "ROUTINE",
      };
      officerNotificationsStore.unshift(eoNotif);
      saveNotificationsToStorage(officerNotificationsStore);
    }

    // Auto-suggest in Roznamcha General Diary (Suggestions & Drafts) if NCR is Approved by SHO (BNSS Section 174)
    if (isNcr) {
      try {
        const targetReport =
          (complaint.reports || []).find(
            (r) => r.id === complaint.eoRecommendedReportId || r.sentToSho || r.recommendationType === "NCR"
          ) || (complaint.reports && complaint.reports[0]);

        let reportBody = targetReport?.content?.trim() || "";
        if (!reportBody && targetReport?.contentHtml) {
          reportBody = targetReport.contentHtml
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<\/p>|<\/div>|<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/\n\s*\n/g, "\n\n")
            .trim();
        }
        if (!reportBody && targetReport?.conclusionSummary) {
          reportBody = targetReport.conclusionSummary.trim();
        }

        // If no pre-existing saved report body, dynamically generate the complete 8-section official draft
        if (!reportBody) {
          try {
            const { RecommendationReportService } = await import("./recommendationReportService");
            const generatedDraft = RecommendationReportService.generateDraft(complaint, "NCR", {
              name: complaint.assignedEoName,
              rank: complaint.assignedEoRank,
              pno: complaint.assignedEoPno,
              station: complaint.policeStation,
            });
            reportBody = generatedDraft.plainText;
          } catch {
            reportBody = complaint.incidentDetails?.trim() || "कोई पृथक जांच आख्या विवरण उपलब्ध नहीं।";
          }
        }

        const reportTitle = targetReport?.title || "जांच आख्या (Enquiry Report - NCR u/s 174 BNSS)";
        const eoName = complaint.assignedEoName || targetReport?.officerName || "Enquiry Officer";
        const eoRank = complaint.assignedEoRank || targetReport?.officerRank || "ASI/SI";
        const eoPno = complaint.assignedEoPno || targetReport?.officerPno || "HR-04291882";
        const psName = complaint.policeStation || "PS City Panipat";
        const distName = complaint.district || "Panipat";
        const dateStr = nowIso.split("T")[0];
        const timeStr = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

        const ncrSubject = `असंज्ञेय अपराध रपट (NCR स्वीकृत) - शिकायत सं. ${complaint.complaintNumber} [BNSS धारा 174]`;

        const ncrNarrative = `================================================================================
रोजनामचा आम सुझाव (General Diary Draft) - असंज्ञेय अपराध (Non-Cognizable Report)
थाना: ${psName}, जिला: ${distName} | दिनांक: ${dateStr} समय: ${timeStr}
कानूनी प्रावधान: भारतीय नागरिक सुरक्षा संहिता (BNSS), 2023 धारा 174
================================================================================
वक्त बाबत: आज दिनांक ${dateStr} को समय ${timeStr} बजे, नागरिक शिकायत सं. ${complaint.complaintNumber} (${complaint.categoryDisplay || "General"}) की जांच रिपोर्ट SHO ${shoName} (PNO: ${shoPno}) द्वारा अवलोकित व स्वीकृत की गई। जांच अधिकारी ${eoName} (${eoRank}) द्वारा प्रस्तुत आख्या के आधार पर मामला असंज्ञेय (Non-Cognizable) अपराध की श्रेणी में पाया गया, जिसके फलस्वरूप इसे NCR के रूप में निस्तारित किया जाता है।

1. शिकायतकर्ता का विवरण (Complainant Particulars):
- नाम: ${complaint.complainantName || "नागरिक"}
- मोबाइल: ${complaint.complainantMobile || "N/A"}
- पता: ${complaint.complainantAddress || "N/A"}, ${complaint.complainantCity || ""}

2. घटना स्थल व समय (Occurrence Details):
- घटनास्थल: ${complaint.incidentPlace || "थाना क्षेत्र"}
- घटना दिनांक: ${complaint.incidentDate || dateStr}

3. जांच अधिकारी (Enquiry Officer Details):
- नाम व पद: ${eoName} (${eoRank})
- PNO: ${eoPno}

4. SHO आदेश व टिप्पणी (SHO Final Order & Remarks):
- ${remarks ? remarks.trim() : "जांच रिपोर्ट का गहनता से अवलोकन किया गया। संज्ञेय अपराध नहीं बनता, अतः रिपोर्ट अनुसार NCR स्वीकृत कर शिकायत निस्तारित की जाती है।"}

5. सम्पूर्ण जांच रिपोर्ट / आख्या (Complete Enquiry Report Body - ${reportTitle}):
--------------------------------------------------------------------------------
${reportBody}
--------------------------------------------------------------------------------

6. वैधानिक निर्देश व कार्यवाही (Statutory Directive under Section 174(2) BNSS):
चूंकि मामला असंज्ञेय अपराध का है, अतः पुलिस द्वारा सीधे अन्वेषण अपेक्षित नहीं है। शिकायतकर्ता को BNSS धारा 174(2) के तहत सक्षम इलाका मजिस्ट्रेट के समक्ष परिवाद दायर करने की वैधानिक हिदायत दी गई।`;

        const ncrAttachments: any[] = [];
        if (targetReport?.contentHtml || targetReport?.dataUrl) {
          ncrAttachments.push({
            id: `att_${Date.now()}_ncr`,
            name: targetReport.fileName || `NCR_Report_${complaint.complaintNumber}.html`,
            size: targetReport.contentHtml?.length || targetReport.dataUrl?.length || 2048,
            type: "text/html",
            dataUrl:
              targetReport.dataUrl ||
              (targetReport.contentHtml
                ? `data:text/html;charset=utf-8,${encodeURIComponent(targetReport.contentHtml)}`
                : undefined),
            uploadedAt: nowIso,
          });
        }

        await GeneralDiaryService.generateSuggestionFromSystemEvent({
          eventType: "COMPLAINT_NCR",
          category: "COURT_DOCUMENTATION",
          typeCode: "NON_COGNIZABLE_REPORT",
          typeDisplay: "Non-Cognizable Report",
          typeDisplayHi: "असंज्ञेय अपराध रपट (BNSS धारा 174)",
          subject: ncrSubject,
          narrative: ncrNarrative,
          policeStation: psName,
          district: distName,
          officer: {
            name: shoName,
            rank: "Station House Officer (SHO)",
            pno: shoPno,
            beltNumber: `${shoPno.slice(-3)}/KKR`,
          },
          relatedRecords: {
            complaintNumber: complaint.complaintNumber,
            personName: complaint.complainantName,
            destinationLocation: complaint.incidentPlace,
            purpose: ncrSubject,
          },
          attachments: ncrAttachments.length > 0 ? ncrAttachments : undefined,
        });

        this.addTimelineEvent(complaint.id, {
          title: `Roznamcha GD Suggestion Created (NCR)`,
          description: `General Diary auto-suggestion generated for Non-Cognizable Report (BNSS u/s 174) with complete enquiry report narrative. Sent to Auto-Suggestions & Drafts for MHC (Munshi) review and disposal.`,
          category: "STATUS_CHANGE",
          officerName: shoName,
          timestamp: new Date().toISOString(),
        });
      } catch (gdErr) {
        console.warn("Could not auto-suggest NCR to Roznamcha GD:", gdErr);
      }
    }

    // Auto-suggest in Roznamcha General Diary (Suggestions & Drafts) if FIR is Recommended & approved by SHO (BNSS Section 173)
    if (isFir) {
      try {
        const targetReport =
          (complaint.reports || []).find(
            (r) => r.id === complaint.eoRecommendedReportId || r.sentToSho || r.recommendationType === "FIR"
          ) || (complaint.reports && complaint.reports[0]);

        let reportBody = targetReport?.content?.trim() || "";
        if (!reportBody && targetReport?.contentHtml) {
          reportBody = targetReport.contentHtml
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<\/p>|<\/div>|<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/\n\s*\n/g, "\n\n")
            .trim();
        }
        if (!reportBody && targetReport?.conclusionSummary) {
          reportBody = targetReport.conclusionSummary.trim();
        }

        if (!reportBody) {
          try {
            const { RecommendationReportService } = await import("./recommendationReportService");
            const generatedDraft = RecommendationReportService.generateDraft(complaint, "FIR", {
              name: complaint.assignedEoName,
              rank: complaint.assignedEoRank,
              pno: complaint.assignedEoPno,
              station: complaint.policeStation,
            });
            reportBody = generatedDraft.plainText;
          } catch {
            reportBody = complaint.incidentDetails?.trim() || "संज्ञेय अपराध घटित होना पाया गया।";
          }
        }

        const reportTitle = targetReport?.title || "जांच आख्या (Enquiry Report - Recommended for FIR)";
        const eoName = complaint.assignedEoName || targetReport?.officerName || "Enquiry Officer";
        const eoRank = complaint.assignedEoRank || targetReport?.officerRank || "ASI/SI";
        const eoPno = complaint.assignedEoPno || targetReport?.officerPno || "HR-04291882";
        const psName = complaint.policeStation || "PS City Panipat";
        const distName = complaint.district || "Panipat";
        const dateStr = nowIso.split("T")[0];
        const timeStr = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const compSubject = complaint.subject || complaint.complaintSubject || complaint.categoryDisplay || "दरख्वास्त शिकायत";

        const firSubject = `संज्ञेय अपराध / FIR पंजीकरण अनुशंसा - शिकायत सं. ${complaint.complaintNumber} (${complaint.complainantName}) [BNSS धारा 173]`;

        const firNarrative = `================================================================================
रोजनामचा आम सुझाव (General Diary Draft) - संज्ञेय अपराध / प्राथमिकी अनुशंसा
थाना: ${psName}, जिला: ${distName} | दिनांक: ${dateStr} समय: ${timeStr}
कानूनी प्रावधान: भारतीय नागरिक सुरक्षा संहिता (BNSS), 2023 धारा 173
================================================================================
वक्त बाबत: आज दिनांक ${dateStr} को समय ${timeStr} बजे, दरख्वास्त शिकायत क्रमांक ${complaint.complaintNumber} मनजानिब ${complaint.complainantName} (मोबाइल: ${complaint.complainantMobile || "N/A"}) निवासी ${complaint.complainantAddress || complaint.incidentPlace || "इलाका थाना"} बाबत '${compSubject}' की जांच आख्या जांच अधिकारी ${eoName} (${eoRank}, PNO: ${eoPno}) द्वारा प्रस्तुत की गई।

थाना प्रभारी (SHO) ${shoName} (PNO: ${shoPno}) द्वारा पत्रावली व प्राथमिक जांच आख्या का सूक्ष्मता से अवलोकन किया गया। मामले में संज्ञेय अपराध (Cognizable Offence) का घटित होना प्रथम दृष्टया प्रमाणित पाया गया। अतः SHO महोदय द्वारा नियमित FIR पंजीकृत करने की अनुशंसा (Recommended for FIR) स्वीकृत की गई।

1. घटना विवरण (Occurrence Details):
- घटनास्थल: ${complaint.incidentPlace || "थाना क्षेत्र"}
- दिनांक व समय: ${complaint.incidentDate || dateStr}

2. SHO आदेश व कानूनी निर्देश (SHO Order & Legal Directives):
- ${remarks ? remarks.trim() : "जांच आख्या के आधार पर संज्ञेय अपराध बनता है। नियमित मुकद्दमा दर्ज कर तफ्तीश अमल में लाई जाए।"}

3. प्राथमिक जांच आख्या का सारांश (Enquiry Report Narrative - ${reportTitle}):
--------------------------------------------------------------------------------
${reportBody}
--------------------------------------------------------------------------------

4. अग्रिम कार्यवाही:
मुंशी (MHC) इस सुझाव का अवलोकन कर रोजनामचा में संज्ञेय अपराध इंद्राज तस्दीक (Verify & Lock) करें तथा विधिवत FIR पंजीकरण की प्रक्रिया अमल में लाएं।`;

        const firAttachments: any[] = [];
        if (targetReport?.contentHtml || targetReport?.dataUrl) {
          firAttachments.push({
            id: `att_${Date.now()}_fir`,
            name: targetReport.fileName || `FIR_Recommendation_${complaint.complaintNumber}.html`,
            size: targetReport.contentHtml?.length || targetReport.dataUrl?.length || 2048,
            type: "text/html",
            dataUrl:
              targetReport.dataUrl ||
              (targetReport.contentHtml
                ? `data:text/html;charset=utf-8,${encodeURIComponent(targetReport.contentHtml)}`
                : undefined),
            uploadedAt: nowIso,
          });
        }

        await GeneralDiaryService.generateSuggestionFromSystemEvent({
          eventType: "COMPLAINT_FIR_RECOMMENDED",
          category: "INVESTIGATION_PROCESS",
          typeCode: "CRIMINAL_CASE",
          typeDisplay: "Cognizable Crime / FIR Recommendation",
          typeDisplayHi: "संज्ञेय अपराध / FIR पंजीकरण अनुशंसा (BNSS धारा 173)",
          subject: firSubject,
          narrative: firNarrative,
          policeStation: psName,
          district: distName,
          officer: {
            name: shoName,
            rank: "Station House Officer (SHO)",
            pno: shoPno,
            beltNumber: `${shoPno.slice(-3)}/KKR`,
          },
          relatedRecords: {
            complaintNumber: complaint.complaintNumber,
            personName: complaint.complainantName,
            destinationLocation: complaint.incidentPlace,
            purpose: compSubject,
          },
          attachments: firAttachments.length > 0 ? firAttachments : undefined,
        });

        this.addTimelineEvent(complaint.id, {
          title: `Roznamcha GD Suggestion Created (FIR Recommendation)`,
          description: `General Diary auto-suggestion generated for Cognizable Crime / FIR Recommendation under Section 173 BNSS with enquiry report narrative. Sent to Auto-Suggestions & Drafts for MHC (Munshi) review and disposal.`,
          category: "STATUS_CHANGE",
          officerName: shoName,
          timestamp: new Date().toISOString(),
        });
      } catch (suggErr) {
        console.warn("Could not generate GD FIR recommendation auto-suggestion:", suggErr);
      }
    }

    // Auto-suggest in Roznamcha General Diary (Suggestions & Drafts) if CLOSURE is selected & approved by SHO
    if (isClosure) {
      try {
        const timeStr = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const psName = complaint.policeStation || "PS City Panipat";
        const distName = complaint.district || "Panipat";
        const eoName = complaint.assignedEoName || "जांच अधिकारी";
        const eoRank = complaint.assignedEoRank || "EO";
        const eoPno = complaint.assignedEoPno || "HR-00000000";
        const compSubject = complaint.subject || complaint.complaintSubject || complaint.categoryDisplay || "दरख्वास्त शिकायत";

        const closureSubject = `फैसला / अंतिम निस्तारण शिकायत - ${complaint.complaintNumber} (${complaint.complainantName})`;

        const closureNarrative = `बवक्त हाजा (${timeStr}), दरख्वास्त शिकायत क्रमांक ${complaint.complaintNumber} मनजानिब ${complaint.complainantName} (मोबाइल: ${complaint.complainantMobile || "N/A"}) निवासी ${complaint.complainantAddress || complaint.incidentPlace || "इलाका थाना"} बाबत '${compSubject}' की जांच आख्या जांच अधिकारी ${eoName} (${eoRank}, PNO: ${eoPno}) द्वारा प्रस्तुत की गई। थाना प्रभारी (SHO) ${shoName} (PNO: ${shoPno}) द्वारा पत्रावली व जांच आख्या का पूर्ण अवलोकन किया गया। मामले में कोई संज्ञेय अपराध घटित होना नहीं पाया गया / दोनों पक्षों के मध्य राजीनामा अथवा तथ्य निराधार पाए जाने के फलस्वरूप SHO महोदय द्वारा अंतिम निर्णय 'Closure (निस्तारण / फाइल दाखिल)' अनुमोदित किया गया। SHO आदेश/टिप्पणी: "${remarks ? remarks.trim() : "जांच आख्या अनुसार मामले में कोई संज्ञेय अपराध नहीं बनता। दोनों पक्षों में राजीनामा / शिकायत निराधार पाई गई। अतः दरख्वास्त शिकायत को निस्तारित (Closed) किया जाता है।"}" शिकायत पत्रावली को केंद्रीय शिकायत रजिस्टर में 'Complete / Closed' दर्ज किया गया तथा रपट दर्ज रोजनामचा की गई।`;

        await GeneralDiaryService.generateSuggestionFromSystemEvent({
          eventType: "COMPLAINT_CLOSURE",
          subject: closureSubject,
          narrative: closureNarrative,
          officer: {
            name: shoName,
            rank: "Inspector / SHO",
            beltNumber: `${shoPno.slice(-3)}/KKR`,
            pno: shoPno,
          },
          policeStation: psName,
          district: distName,
          relatedRecords: {
            complaintNumber: complaint.complaintNumber,
            personName: complaint.complainantName,
            destinationLocation: complaint.incidentPlace,
            purpose: compSubject,
          },
        });

        this.addTimelineEvent(complaint.id, {
          title: `Roznamcha GD Suggestion Created (Closure)`,
          description: `General Diary auto-suggestion generated for complaint closure. Available in Suggestions & Drafts for MHC (Munshi) review and disposal.`,
          category: "STATUS_CHANGE",
          officerName: shoName,
          timestamp: new Date().toISOString(),
        });
      } catch (suggErr) {
        console.warn("Could not generate GD closure auto-suggestion:", suggErr);
      }
    }

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("complaints_updated", { detail: complaintsStore[index] }));
    }

    return complaintsStore[index];
  },

  async shoReEnquiry(
    complaintId: string,
    shoName: string,
    shoPno: string = "HR-04291882",
    reason: string
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const complaint = complaintsStore[index];
    const nowIso = new Date().toISOString();
    const reEnquiryCount = (complaint.reEnquiryCount || 0) + 1;

    // Re-assign to SAME EO, reappears in EO active list, status Pending
    complaintsStore[index] = {
      ...complaint,
      status: "ENQUIRY_IN_PROGRESS",
      workflowState: "RE_ENQUIRY",
      eoOutcome: "Pending",
      isSentToSho: false,
      shoActionRequired: false,
      isFirApprovedBySho: false,
      shoDecision: "RE_ENQUIRY",
      shoDecisionAt: nowIso,
      shoDecisionBy: shoName,
      reEnquiryCount,
      reEnquiryRemarks: reason,
      reEnquiryAt: nowIso,
      reEnquiryBy: shoName,
      updatedAt: nowIso,
    };

    // Audit record
    this.addAuditRecord(complaint.id, {
      action: "SHO_RE_ENQUIRY",
      actionLabel: `Re-Enquiry Ordered by SHO (Cycle #${reEnquiryCount})`,
      performedBy: shoName,
      userPno: shoPno,
      userRole: "SHO",
      timestamp: nowIso,
      reason,
      details: `SHO ordered re-enquiry. Re-assigned to EO ${complaint.assignedEoName} (PNO: ${complaint.assignedEoPno}). Reason/Directions: "${reason}".`,
    });

    // Timeline
    this.addTimelineEvent(complaint.id, {
      title: `Re-Enquiry Ordered by SHO (Cycle #${reEnquiryCount})`,
      description: `SHO ${shoName} returned the complaint to EO ${complaint.assignedEoName} for further enquiry. Directions: "${reason}". Status remains Pending.`,
      category: "STATUS_CHANGE",
      officerName: shoName,
      timestamp: nowIso,
    });

    // Notify EO about re-enquiry!
    if (complaint.assignedEoPno) {
      const eoNotif: OfficerNotification = {
        id: `notif_${Date.now()}_eo_reenquiry`,
        recipientPno: complaint.assignedEoPno,
        recipientName: complaint.assignedEoName || "Enquiry Officer",
        complaintId: complaint.id,
        complaintNumber: complaint.complaintNumber,
        title: `RE-ENQUIRY ORDERED: ${complaint.complaintNumber}`,
        message: `SHO ${shoName} ordered re-enquiry on ${complaint.complaintNumber}. Reason / Instructions: "${reason}". The case has been returned to your active docket.`,
        directions: reason,
        createdAt: nowIso,
        priority: "URGENT",
      };
      officerNotificationsStore.unshift(eoNotif);
      saveNotificationsToStorage(officerNotificationsStore);
    }

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("complaints_updated", { detail: complaintsStore[index] }));
    }

    return complaintsStore[index];
  },

  async shoReject(
    complaintId: string,
    shoName: string,
    shoPno: string = "HR-04291882",
    reason: string
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const complaint = complaintsStore[index];
    const nowIso = new Date().toISOString();
    const rejectionCount = (complaint.rejectionCount || 0) + 1;

    // Return to the SAME assigned EO for correction and resubmission
    complaintsStore[index] = {
      ...complaint,
      status: "CORRECTION_REQUIRED",
      workflowState: "CORRECTION_REQUIRED",
      eoOutcome: "Pending",
      isSentToSho: false,
      shoActionRequired: false,
      isFirApprovedBySho: false,
      shoDecision: "REJECT",
      shoDecisionAt: nowIso,
      shoDecisionBy: shoName,
      rejectionCount,
      rejectionReason: reason,
      rejectionAt: nowIso,
      rejectionBy: shoName,
      updatedAt: nowIso,
    };

    // Audit record
    this.addAuditRecord(complaint.id, {
      action: "SHO_REJECTED",
      actionLabel: `Report Rejected by SHO (Cycle #${rejectionCount})`,
      performedBy: shoName,
      userPno: shoPno,
      userRole: "SHO",
      timestamp: nowIso,
      reason,
      details: `SHO rejected enquiry report. Returned to assigned EO ${complaint.assignedEoName} (PNO: ${complaint.assignedEoPno}) for correction and report resubmission. Reason: "${reason}".`,
    });

    // Timeline
    this.addTimelineEvent(complaint.id, {
      title: `Enquiry Report Rejected by SHO (Cycle #${rejectionCount})`,
      description: `SHO ${shoName} rejected the report and returned the case to EO ${complaint.assignedEoName} for correction and resubmission. Reason: "${reason}". Status: Correction Required.`,
      category: "STATUS_CHANGE",
      officerName: shoName,
      timestamp: nowIso,
    });

    // Notify EO about rejection and required corrections
    if (complaint.assignedEoPno) {
      const eoNotif: OfficerNotification = {
        id: `notif_${Date.now()}_eo_rejected`,
        recipientPno: complaint.assignedEoPno,
        recipientName: complaint.assignedEoName || "Enquiry Officer",
        complaintId: complaint.id,
        complaintNumber: complaint.complaintNumber,
        title: `CORRECTION REQUIRED: Report Rejected (${complaint.complaintNumber})`,
        message: `SHO ${shoName} rejected your enquiry report. Reason: "${reason}". Please correct and resubmit the report.`,
        directions: reason,
        createdAt: nowIso,
        priority: "URGENT",
      };
      officerNotificationsStore.unshift(eoNotif);
      saveNotificationsToStorage(officerNotificationsStore);
    }

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("complaints_updated", { detail: complaintsStore[index] }));
    }

    return complaintsStore[index];
  },

  markReportViewedBySho(complaintId: string, shoName: string = "Station House Officer"): ComplaintItem | undefined {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) return undefined;

    const complaint = complaintsStore[index];
    const nowIso = new Date().toISOString();

    complaintsStore[index] = {
      ...complaint,
      isReportViewedBySho: true,
      shoReportViewedAt: nowIso,
      updatedAt: nowIso,
    };

    // Mark corresponding SHO notification as read
    officerNotificationsStore = officerNotificationsStore.map((n) => {
      if (n.complaintId === complaint.id || n.complaintNumber === complaint.complaintNumber) {
        return { ...n, read: true };
      }
      return n;
    });

    saveNotificationsToStorage(officerNotificationsStore);
    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("complaints_updated", { detail: complaintsStore[index] }));
      window.dispatchEvent(new CustomEvent("officer_notifications_updated"));
    }

    return complaintsStore[index];
  },

  markNotificationAsRead(notificationId: string): void {
    officerNotificationsStore = officerNotificationsStore.map((n) =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    saveNotificationsToStorage(officerNotificationsStore);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("officer_notifications_updated"));
    }
  },

  markAllNotificationsAsRead(pno?: string): void {
    officerNotificationsStore = officerNotificationsStore.map((n) => {
      if (!pno || n.recipientPno === pno) {
        return { ...n, read: true };
      }
      return n;
    });
    saveNotificationsToStorage(officerNotificationsStore);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("officer_notifications_updated"));
    }
  },

  async registerFir(
    complaintId: string,
    firNumber: string,
    sections: string,
    officerName: string,
    userRole?: string,
    firDate?: string
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const complaint = complaintsStore[index];

    // One-time registration guard. A retry of the same FIR (used by the
    // complaint/FIR sync path) remains idempotent; a second/different FIR is rejected.
    const { persistentFirService: existingFirService } = await import("./persistentFirService");
    const existingFir = existingFirService.getFirBySourceComplaintId(complaint.id);
    const alreadyRegistered = Boolean(complaint.isFirRegistered || complaint.firNumber || existingFir);
    const sameFirRetry = Boolean(existingFir && (!complaint.firNumber || complaint.firNumber === firNumber));
    if (alreadyRegistered && !sameFirRetry) {
      throw new Error("FIR is already registered for this complaint. Another FIR cannot be registered.");
    }

    const nowIso = new Date().toISOString();
    const dateStr = firDate || nowIso.split("T")[0];

    complaintsStore[index] = {
      ...complaint,
      isFirRegistered: true,
      firNumber,
      firDate: dateStr,
      firRegisteredBy: officerName,
      firRegisteredAt: nowIso,
      firSections: sections,
      status: "FIR_REGISTERED",
      workflowState: "FIR_REGISTERED",
      shoActionRequired: false,
      updatedAt: nowIso,
    };

    // Audit record
    this.addAuditRecord(complaint.id, {
      action: "FIR_REGISTERED",
      actionLabel: `Regular FIR Registered: ${firNumber}`,
      performedBy: officerName,
      userRole: userRole || "SHO",
      timestamp: nowIso,
      details: `Official FIR No. ${firNumber} registered under ${sections} at Police Station ${complaint.policeStation}. Complaint docket closed and converted to criminal FIR investigation.`,
    });

    // Timeline
    this.addTimelineEvent(complaint.id, {
      title: `FIR Registered: ${firNumber}`,
      description: `Regular First Information Report No. ${firNumber} registered under ${sections} by ${officerName}. Complaint status converted to FIR Registered.`,
      category: "STATUS_CHANGE",
      officerName,
      timestamp: nowIso,
    });

    // Log to Roznamcha General Diary as Suggestion (waits for manual verification)
    try {
      await GeneralDiaryService.generateSuggestionFromSystemEvent({
        eventType: "FIR_LODGED",
        category: "INVESTIGATION_PROCESS",
        typeCode: "CRIMINAL_CASE",
        typeDisplay: "Criminal case",
        typeDisplayHi: "पंजीकरण मुकद्दमा / FIR (PPR 22.48)",
        subject: `Regular FIR Registered: ${firNumber} (ex-Complaint ${complaint.complaintNumber})`,
        narrative: `Pursuant to preliminary enquiry under Section 173(3) BNSS, FIR No. ${firNumber} was officially registered under ${sections} at ${complaint.policeStation}. Complainant: ${complaint.complainantName}. Registered by ${officerName}.`,
        officer: {
          name: officerName,
          rank: userRole || "SHO",
          beltNumber: "HR-04291882",
          pno: "04291882",
        },
        policeStation: complaint.policeStation,
        district: complaint.district || "Panipat",
        relatedRecords: {
          complaintNumber: complaint.complaintNumber,
          firNumber: firNumber,
          personName: complaint.complainantName,
          actsAndSections: sections,
        },
      });
    } catch (gdErr) {
      console.warn("Could not log FIR suggestion to GD:", gdErr);
    }

    // Synchronize to FIR Module Store
    try {
      const { persistentFirService: firService } = await import("./persistentFirService");
      const existing = firService.getFirBySourceComplaintId(complaint.id);
      if (!existing) {
        await firService.registerFir({
          sourceComplaintId: complaint.id,
          sourceComplaintNumber: complaint.complaintNumber,
          firNumber,
          firDate: dateStr,
          policeStation: complaint.policeStation,
          district: complaint.district,
          state: "Haryana",
          category: complaint.category,
          categoryDisplay: complaint.categoryDisplay,
          priority: complaint.priority,
          actsAndSections: sections,
          incidentDateFrom: complaint.incidentDate || dateStr,
          incidentPlace: complaint.incidentPlace,
          complainantName: complaint.complainantName,
          complainantMobile: complaint.complainantMobile,
          complainantAddress: complaint.complainantAddress,
          complainantCity: complaint.complainantCity,
          complainantDistrict: complaint.complainantDistrict,
          incidentDetails: complaint.incidentDetails,
          registeredBy: officerName,
          assignedIoId: complaint.assignedEoId,
          assignedIoName: complaint.assignedEoName,
          assignedIoRank: complaint.assignedEoRank,
          assignedIoBeltNumber: complaint.assignedEoBeltNumber,
          assignedIoPhone: complaint.assignedEoPhone,
        });
      }
    } catch (firSyncErr) {
      throw new Error("FIR could not be saved on the server. The complaint was not finalized; retry after reloading FIR records.");
    }

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("complaints_updated", { detail: complaintsStore[index] }));
    }

    return complaintsStore[index];
  },

  async getComplaintByNumber(complaintNumber: string): Promise<ComplaintItem | undefined> {
    return this.getComplaintById(complaintNumber);
  },

  async createFirCriminalCaseGdEntry(
    complaintId: string,
    options?: {
      caseType?: "ADULT" | "JUVENILE & ADULT" | "ONLY JUVENILE" | string;
      actsAndSections?: string;
      majorAct?: string;
      officerName?: string;
      officerPno?: string;
      officerBelt?: string;
      officerRank?: string;
    }
  ): Promise<{ gdRecord: GeneralDiaryRecord; complaint: ComplaintItem }> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const complaint = complaintsStore[index];
    const nowIso = new Date().toISOString();
    const caseType = options?.caseType || complaint.caseType || "ADULT";
    const majorAct = options?.majorAct || "Bharatiya Nyaya Sanhita, 2023 (BNS)";
    const actsAndSections =
      options?.actsAndSections ||
      complaint.firSections ||
      "Section 303(2), 115(2), 3(5) BNS, 2023";

    const officerName = options?.officerName || "Inspector Rajesh Kumar (SHO)";
    const officerPno = options?.officerPno || "HR-04291882";
    const officerRank = options?.officerRank || "Inspector / SHO";
    const officerBelt = options?.officerBelt || "04291882";

    // EO / IO Details
    const eoIoName = complaint.assignedEoName || officerName;
    const eoIoRank = complaint.assignedEoRank || "Sub-Inspector";
    const eoIoPno = complaint.assignedEoPno || officerPno;
    const eoIoBelt = complaint.assignedEoBeltNumber || officerBelt;
    const eoIoPhone = complaint.assignedEoPhone || "N/A";

    const narrative = `[रोजनामचा आमद / आपराधिक मामला प्रविष्टि (RUKKA / CRIMINAL CASE ENTRY)]
शिकायत संख्या (Complaint No.): ${complaint.complaintNumber}
वादी / शिकायतकर्ता (Complainant): ${complaint.complainantName} (पिता/पति: ${complaint.complainantFatherSpouse || "N/A"}, संपर्क: ${complaint.complainantMobile || "N/A"}, पता: ${complaint.complainantAddress || "N/A"}, जिला: ${complaint.complainantDistrict || "Gurugram"}).
घटना का विवरण व स्थान (Occurrence Details): दिनांक ${complaint.incidentDate || "N/A"}, समय ${complaint.incidentTime || "N/A"}, स्थान: ${complaint.incidentPlace || "थाना क्षेत्र"}.
केस प्रकार (Case Type): ${caseType}
लागू अधिनियम व धाराएं (Acts & Sections): ${actsAndSections} (प्रमुख अधिनियम: ${majorAct})
जांच अधिकारी / अनुसंधान अधिकारी (Enquiry / Investigating Officer - EO/IO):
- नाम (Name): ${eoIoName}
- पद (Rank): ${eoIoRank}
- PNO: ${eoIoPno}
- बेल्ट नंबर (Belt No): ${eoIoBelt}
- संपर्क नंबर (Phone): ${eoIoPhone}
शिकायत का संक्षिप्त विवरण (Brief Narrative of Complaint):
"${complaint.incidentDetails || "संज्ञेय अपराध बाबत शिकायत प्राप्त हुई।"}"
वैधानिक आदेश (Statutory Order): प्राथमिक जांच / संज्ञेय अपराध के आधार पर धारा 173(3) BNSS, 2023 के तहत प्रथम सूचना रिपोर्ट (FIR) दर्ज की जा रही है। रुकका तैयार कर रोजनामचा में प्रविष्टि दर्ज की गई। अब CCTNS FIR रजिस्टर में विधिवत FIR दर्ज करने हेतु प्रेषित।`;

    const gdRecord = await GeneralDiaryService.generateSuggestionFromSystemEvent({
      eventType: "COMPLAINT_FIR_RECOMMENDED",
      category: "INVESTIGATION_PROCESS",
      typeCode: "CRIMINAL_CASE",
      typeDisplay: "Criminal case",
      typeDisplayHi: "आपराधिक मामला (FIR पंजीकरण अनुशंसा)",
      subject: `आपराधिक मामला: FIR दर्ज करने बाबत (शिकायत: ${complaint.complaintNumber})`,
      narrative,
      officer: {
        name: eoIoName,
        rank: eoIoRank,
        pno: eoIoPno,
        beltNumber: eoIoBelt,
      },
      policeStation: complaint.policeStation,
      district: complaint.district || "Panipat",
      relatedRecords: {
        complaintNumber: complaint.complaintNumber,
        caseType,
        actsAndSections,
        majorAct,
      },
    });

    complaintsStore[index] = {
      ...complaint,
      gdEntryNumber: gdRecord.gdNumber && gdRecord.gdNumber !== "GD-PENDING-SUGGESTION" ? gdRecord.gdNumber : complaint.gdEntryNumber,
      caseType,
      firSections: actsAndSections,
      updatedAt: nowIso,
    };

    this.addAuditRecord(complaint.id, {
      action: "GD_CRIMINAL_CASE_LOGGED",
      actionLabel: `Roznamcha GD Auto-Suggestion Generated`,
      performedBy: officerName,
      userRole: "SHO",
      timestamp: nowIso,
      details: `General Diary Criminal Case auto-suggestion generated for complaint ${complaint.complaintNumber}. Case Type: ${caseType}, Sections: ${actsAndSections}. Sent to Auto-Suggestions & Drafts tab for review. Forwarded to FIR Registration Form.`,
    });

    this.addTimelineEvent(complaint.id, {
      title: `Roznamcha GD Auto-Suggested`,
      description: `Criminal Case GD auto-suggestion sent to Roznamcha Auto-Suggestions & Drafts for regular FIR registration under ${actsAndSections}. Case Type: ${caseType}. Assigned IO: ${eoIoName}.`,
      category: "STATUS_CHANGE",
      officerName,
      timestamp: nowIso,
    });

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("complaints_updated", { detail: complaintsStore[index] }));
    }

    return { gdRecord, complaint: complaintsStore[index] };
  },

  async sendReportToShoForFir(
    complaintId: string,
    officerName: string,
    officerPno: string,
    reportTitle?: string,
    sections?: string
  ): Promise<ComplaintItem> {
    return this.sendReportToSho(complaintId, officerName, officerPno, `FIR recommended under ${sections || "BNS provisions"}. Title: ${reportTitle || "Enquiry Report"}`);
  },

  async deleteComplaintReport(
    complaintId: string,
    reportId: string,
    user?: AuthUserContext
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    const report = (complaintsStore[index].reports || []).find((r) => r.id === reportId);
    user=user||currentComplaintUser();
    if(!user)throw new Error('Officer identity is required.');
    if (user && report) {
      if (report.sentToSho && isShoOrSuperior(user.role)) {
        throw new Error("Access Denied: SHO cannot delete enquiry reports submitted by the Enquiry Officer.");
      }
      const perm = canDeleteDocument(user, report, complaintsStore[index]);
      if (!perm.allowed) {
        throw new Error(perm.reason || "Access Denied: Only the creator of this report can delete it.");
      }
    }

    const nowIso = new Date().toISOString();
    complaintsStore[index] = {
      ...complaintsStore[index],
      reports: (complaintsStore[index].reports || []).filter((r) => r.id !== reportId),
      updatedAt: nowIso,
    };

    const deleteAudit: ComplaintAuditRecord = {
      id: `audit_${Date.now()}_rep_del`,
      complaintId: complaintsStore[index].id,
      action: "REPORT_DELETED",
      actionLabel: `Report Deleted: ${report?.title || reportId}`,
      performedBy: user?.name || "Officer",
      userRole: user?.role || "OFFICER",
      timestamp: nowIso,
      details: `Report "${report?.title || reportId}" removed by ${user?.name || "Officer"}. Original creator: ${report?.createdByName || report?.createdBy || report?.officerName || "Unknown"}.`,
    };
    if (!complaintsStore[index].auditTrail) complaintsStore[index].auditTrail = [];
    complaintsStore[index].auditTrail!.unshift(deleteAudit);

    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    return complaintsStore[index];
  },

  async saveLegalAnalysis(
    complaintId: string,
    analysis: LegalAnalysisReport
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    complaintsStore[index] = {
      ...complaintsStore[index],
      legalAnalysis: analysis,
      updatedAt: new Date().toISOString(),
    };
    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    return complaintsStore[index];
  },

  async saveInvestigationSummary(
    complaintId: string,
    summary: InvestigationSummaryReport
  ): Promise<ComplaintItem> {
    const index = complaintsStore.findIndex((c) => c.id === complaintId || c.complaintNumber === complaintId);
    if (index === -1) throw new Error("Complaint not found");

    complaintsStore[index] = {
      ...complaintsStore[index],
      investigationSummary: summary,
      updatedAt: new Date().toISOString(),
    };
    saveComplaintsToStorage(complaintsStore);
    syncComplaintsToServer(complaintsStore);

    return complaintsStore[index];
  },
};

// Serialize browser mutations, commit only changed records, and expose persistence failures.
let mutationQueue:Promise<unknown>=Promise.resolve();
const mutations=['createComplaint','assignEnquiryOfficer','addEnquiryNote','addEvidence','addDocument','transferComplaint','transferComplaintFull','linkComplaint','linkComplaintsFull','delinkComplaintsFull','issueNcrReference','linkFir','requestProgressReport','submitTransferJustification','deleteEnquiryNote','deleteEvidence','deleteDocument','addConfidentialDossier','deleteConfidentialDossier','addComplaintReport','submitEoReportWithOutcome','sendReportToSho','sendReportToSo','shoApprove','soApprove','shoReEnquiry','shoReject','registerFir','createFirCriminalCaseGdEntry','deleteComplaintReport','saveLegalAnalysis','saveInvestigationSummary'] as const;
for(const key of mutations){
 const original=ComplaintService[key];
 if(typeof original!=='function')continue;
 const wrapped=function(this:typeof ComplaintService,...args:unknown[]){
  const actorId=currentComplaintUser()?.id;
  const run=async()=>{
   if(typeof window!=='undefined'&&actorId!==currentComplaintUser()?.id)throw new Error('Officer changed before saving. Retry with the current officer.');
   if(hydration)await hydration;
   if(typeof window!=='undefined'&&!hydrated)await hydrateComplaints();
   const before=structuredClone(complaintsStore),notifications=structuredClone(officerNotificationsStore);
   mutationDepth++;
   try{
    const result=await (original as (...a:unknown[])=>Promise<unknown>).apply(ComplaintService,args);
    await persistComplaints(key);
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('complaints_updated'));
    if(result&&typeof result==='object'){
     const value=result as {id?:string;complaint?:ComplaintItem};
     if(value.complaint)value.complaint=complaintsStore.find(c=>c.id===value.complaint!.id)||value.complaint;
     if(value.id)return complaintsStore.find(c=>c.id===value.id)||result;
    }
    return result;
   }catch(error){complaintsStore=before;officerNotificationsStore=notifications;saveNotificationsToStorage(notifications);if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('complaints_updated'));throw error;}
   finally{mutationDepth--;}
  };
  const pending=mutationQueue.then(run,run);mutationQueue=pending.catch(()=>{});return pending;
 };
 // Preserve each public method's existing typed signature.
 (ComplaintService as unknown as Record<string,unknown>)[key]=wrapped;
}
if(typeof window!=='undefined'){
 window.addEventListener('cms_user_switched',()=>{hydrated=false;complaintsStore=[];serverSnapshot.clear();});
}

let standaloneScheduled=false;
function scheduleStandalonePersist(){
 if(standaloneScheduled)return;standaloneScheduled=true;
 queueMicrotask(()=>{standaloneScheduled=false;const run=async()=>{try{await persistComplaints('updateAudit');}catch(e){complaintsStore=Array.from(serverSnapshot.values()).map(c=>structuredClone(c));window.dispatchEvent(new CustomEvent('complaints_save_error',{detail:e instanceof Error?e.message:'Complaint could not be saved.'}));}window.dispatchEvent(new CustomEvent('complaints_updated'));};const pending=mutationQueue.then(run,run);mutationQueue=pending.catch(()=>{});});
}
