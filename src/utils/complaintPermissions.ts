import { isMhcOrMmRole } from "@/lib/officerRoles";
import { MOCK_ENQUIRY_OFFICERS } from '@/lib/mockData';
import {
  UserSession,
  ComplaintItem,
  ComplaintDocumentItem,
  ComplaintReportItem,
  SystemRole,
} from "@/types";

export const normalizeOfficerPno=(value?:string)=>(value||'').replace(/^HR[-\s]?/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export type AuthUserContext = {
  id?: string;
  pno?: string;
  name?: string;
  role?: SystemRole | string;
  [key: string]: any;
};

/**
 * Checks if a user is superior to SHO in the police hierarchy
 * (SUPER_ADMIN, SP_DISTRICT, DSP_SUBDIV)
 */
export function isSuperiorToSho(role?: SystemRole | string): boolean {
  return role === "SUPER_ADMIN" || role === "SP_DISTRICT" || role === "DSP_SUBDIV";
}

/**
 * Checks if a user is SHO or superior
 */
export function isShoOrSuperior(role?: SystemRole | string): boolean {
  return role === "SHO" || isSuperiorToSho(role);
}

/**
 * Checks if the complaint is currently assigned to an EO
 */
export function isComplaintAssignedToEo(complaint: ComplaintItem): boolean {
  return Boolean(
    (complaint.assignedEoId && complaint.assignedEoId.trim().length > 0) ||
    (complaint.assignedEoName && complaint.assignedEoName.trim().length > 0) ||
    (complaint.assignedEoPno && complaint.assignedEoPno.trim().length > 0)
  );
}

/**
 * Checks if the user is the currently assigned Enquiry Officer (EO)
 */
export function isUserAssignedEo(user: AuthUserContext, complaint: ComplaintItem): boolean {
  if (!isComplaintAssignedToEo(complaint)) return false;

  if (complaint.assignedEoId && (complaint.assignedEoId === user.id || complaint.assignedEoId === user.pno)) return true;
  if (complaint.assignedEoPno && user.pno && normalizeOfficerPno(complaint.assignedEoPno) === normalizeOfficerPno(user.pno)) return true;

  if(complaint.assignedEoId && user.id && complaint.assignedEoId === user.id.replace(/^usr_/,''))return true;
  const roster=MOCK_ENQUIRY_OFFICERS.find(e=>e.id===complaint.assignedEoId);
  if(roster?.pno && normalizeOfficerPno(user.pno)===normalizeOfficerPno(roster.pno))return true;
  // If complaint is assigned to SHO and current logged-in user is SHO
  if (user.role === "SHO" && complaint.assignedEoId === "eo_sho" && user.stationName === complaint.policeStation) return true;

  if (!complaint.assignedEoId && !complaint.assignedEoPno && complaint.assignedEoName && user.name) {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/\b(assistant sub[- ]inspector|sub[- ]inspector|head constable|sho|inspector|si|asi|hc|constable|dsp|sp)\b/gi, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
    const cName = normalize(complaint.assignedEoName);
    const uName = normalize(user.name);
    if (cName && uName && cName === uName) {
      return true;
    }

  }
  return false;
}

/**
 * Gets the current Complaint Owner ID.
 * When assigned to an EO, the assigned EO is the owner.
 */
export function getCurrentComplaintOwnerId(complaint: ComplaintItem): string | null {
  return complaint.currentComplaintOwnerId || complaint.assignedEoId || null;
}

/**
 * 1. Can View Complaint:
 * Assigned EO, SHO, Superiors, MHC, and authorized viewers
 */
export function canViewComplaint(user: AuthUserContext, complaint: ComplaintItem): PermissionResult {
  const norm=(v?:string)=>(v||'').trim().toLowerCase();
  if(!user?.id)return {allowed:false,reason:'Login required.'};
  if(user.role==='SUPER_ADMIN')return {allowed:true};
  if(complaint.custodyUnit && !user.unitId)return {allowed:false,reason:'A verified posting is required.'};
  const jurisdiction=complaint.custodyUnit ? {district:complaint.custodyUnit.district,policeStation:complaint.custodyUnit.name} : complaint;
  if(user.unitId && (!norm(user.district) || norm(user.district)!==norm(jurisdiction.district))) return {allowed:false,reason:'Complaint is outside your district.'};
  if(user.role==='DSP_SUBDIV' && user.unitId) return {allowed:Boolean(user.jurisdictionUnits?.some((name:string)=>norm(name)===norm(jurisdiction.policeStation))),reason:'Complaint is outside your subdivision.'};
  if(isSuperiorToSho(user.role))return {allowed:Boolean(norm(user.district)&&norm(user.district)===norm(jurisdiction.district)),reason:'Complaint is outside your district.'};
  if(complaint.custodyUnit && user.unitId !== complaint.custodyUnit.id)return {allowed:false,reason:'Complaint is outside your unit.'};
  if(['SHO','MHC_GD_INCHARGE', 'MM'].includes(user.role||'')){
    // Station staff see every complaint of their own station — and nothing outside it.
    if(!norm(user.stationName)||norm(user.stationName)!==norm(jurisdiction.policeStation))return {allowed:false,reason:'Complaint is outside your police station.'};
    return {allowed:true};
  }
  // Enquiry / Investigating Officers and other readers: ONLY the
  // complaints assigned to them — never another officer's complaint and never the
  // whole station list. Assignment is the permission itself, so an assigned complaint
  // stays visible even when it belongs to another police station.
  return {allowed:isUserAssignedEo(user,complaint),reason:'Only the assigned officer can view this complaint.'};
}

/**
 * 2. Can Create / Upload / Generate Document against Complaint
 * Assigned EO and authorized station/supervisory officers can add documents.
 * Complaint visibility is checked first to preserve station/district scope.
 */
export function canCreateDocument(user: AuthUserContext, complaint: ComplaintItem): PermissionResult {
  const scope=canViewComplaint(user,complaint);if(!scope.allowed)return scope;
  if (isShoOrSuperior(user.role) || isMhcOrMmRole(user.role)) {
    return { allowed: true };
  }
  if (isComplaintAssignedToEo(complaint)) {
    if (isUserAssignedEo(user, complaint)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Access Denied: Complaint is currently assigned to Enquiry Officer ${complaint.assignedEoName || ""}. Only the assigned EO can upload or generate documents.`,
    };
  }

  return {
    allowed: false,
    reason: "Access Denied: You do not have permission to upload or generate documents for this complaint.",
  };
}

/**
 * 3. Can Edit Document / Report
 * Strict rule: document.createdByUserId === user.id
 * Only the creator can edit their own document/report.
 */
export function canEditDocument(
  user: AuthUserContext,
  doc: { createdByUserId?: string; uploadedBy?: string; createdBy?: string; officerName?: string },
  complaint?: ComplaintItem
): PermissionResult {
  const creatorId = doc.createdByUserId;
  if (creatorId && (creatorId === user.id || (user.pno && normalizeOfficerPno(creatorId) === normalizeOfficerPno(user.pno)))) {
    return { allowed: true };
  }

  // Fallback for legacy documents without createdByUserId
  const creatorName = doc.uploadedBy || doc.createdBy || doc.officerName || "";
  if (!creatorId && creatorName && user.name && creatorName.trim().toLowerCase() === user.name.trim().toLowerCase()) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "Access Denied: Only the original creator/uploader of this document can edit it.",
  };
}

/**
 * 4. Can Delete Document / Report
 * Strict rule: document.createdByUserId === user.id
 * No other user (even SHO or Superiors) can delete another user's document!
 */
export function canDeleteDocument(
  user: AuthUserContext,
  doc: {
    createdByUserId?: string;
    uploadedBy?: string;
    createdBy?: string;
    officerName?: string;
    fileCategory?: string;
    fileName?: string;
    isPermanentRegistrationDoc?: boolean;
    sentToSho?: boolean;
    authorRole?: string;
    authorId?: string;
  },
  complaint?: ComplaintItem
): PermissionResult {
  // Statutory Rule & PPR Rule 22.48: Official registered complaint docket is permanent and cannot be deleted
  const isRegisteredComplaintDoc =
    Boolean(doc.isPermanentRegistrationDoc) ||
    doc.fileCategory === "REGISTERED COMPLAINT DOCKET" ||
    doc.fileCategory === "INTAKE VERIFICATION PROFORMA" ||
    Boolean(doc.fileName && doc.fileName.toLowerCase().includes("registered_complaint")) ||
    Boolean(doc.fileName && doc.fileName.toLowerCase().includes("intake_verification"));

  if (isRegisteredComplaintDoc) {
    return {
      allowed: false,
      reason: "Statutory Law & PPR Rule 22.48: Official registered complaint docket is permanent and cannot be deleted.",
    };
  }

  // Strict Rule: SHO cannot delete enquiry reports submitted by the Enquiry Officer
  if (doc.sentToSho && isShoOrSuperior(user.role)) {
    return {
      allowed: false,
      reason: "Access Denied: SHO cannot delete enquiry reports submitted by the Enquiry Officer.",
    };
  }

  if ((doc as { sentToSo?: boolean }).sentToSo && isShoOrSuperior(user.role)) {
    return {
      allowed: false,
      reason: "Access Denied: A report already forwarded to the Supervisory Officer cannot be deleted here.",
    };
  }

  // Strict Ownership: Only the user/ID who saved/uploaded the document/report can delete it. No one else!
  const creatorId = doc.createdByUserId || doc.authorId || (doc as any)?.userId;
  if (creatorId) {
    const matchesId = Boolean(user.id && (creatorId === user.id || String(creatorId).toLowerCase() === String(user.id).toLowerCase()));
    const normCreator = normalizeOfficerPno(String(creatorId));
    const normPno = user.pno ? normalizeOfficerPno(user.pno) : "";
    const matchesPno = Boolean(normPno && normCreator === normPno);
    const matchesBelt = Boolean(user.beltNumber && creatorId === user.beltNumber);

    if (matchesId || matchesPno || matchesBelt) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "Access Denied: Only the officer/user who created or uploaded this document can delete it. No other user can delete it.",
    };
  }

  // Fallback for legacy documents without createdByUserId
  const creatorName = (doc.uploadedBy || doc.createdBy || doc.officerName || (doc as any)?.createdByName || "").trim().toLowerCase();
  const currentUserName = (user.name || "").trim().toLowerCase();
  const currentUserPno = (user.pno || "").trim().toLowerCase();
  const currentUserId = (user.id || "").trim().toLowerCase();

  if (creatorName) {
    if (
      (currentUserName && creatorName === currentUserName) ||
      (currentUserPno && creatorName === currentUserPno) ||
      (currentUserId && creatorName === currentUserId)
    ) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: "Access Denied: Only the officer/user who created or uploaded this document can delete it. No other user can delete it.",
  };
}

/**
 * 5. Can Reassign EO / Assign EO
 * Under PPR Rules 22.48 / 22.49 & statutory procedure:
 * MHC cannot assign EO/IO. Only SHO (or Supervisory Officers) can assign or reassign.
 */
export function canReassignEO(user: AuthUserContext, complaint: ComplaintItem): PermissionResult {
  const scope=canViewComplaint(user,complaint);if(!scope.allowed)return scope;
  const isMhc = isMhcOrMmRole(user.role);
  if (isMhc || user.role === "ENQUIRY_OFFICER") {
    return {
      allowed: false,
      reason: "Access Denied: MHC cannot assign EO/IO. Under PPR Rule 22.48 / 22.49, Enquiry/Investigating Officers must be assigned by SHO only.",
    };
  }

  if (isShoOrSuperior(user.role)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "Access Denied: Supervisory authority required. Only SHO can assign EO/IO.",
  };
}

/**
 * 6. Can Ask Progress Report
 * Available to SHO and Superior users when complaint is assigned to an EO.
 */
/**
 * Checks if the assigned Enquiry Officer on the complaint is of SHO rank/role
 */
export function isAssignedOfficerSho(complaint: ComplaintItem): boolean {
  if (!isComplaintAssignedToEo(complaint)) return false;
  const id = (complaint.assignedEoId || "").toLowerCase();
  const rank = (complaint.assignedEoRank || "").toUpperCase();
  const name = (complaint.assignedEoName || "").toUpperCase();
  const role = (((complaint as any).assignedEoRole) || "").toUpperCase();

  return (
    id === "eo_sho" ||
    rank === "SHO" ||
    role === "SHO" ||
    name.startsWith("SHO") ||
    name.includes("SHO -") ||
    name.includes("INSPECTOR RAJESH KUMAR")
  );
}

export function canAskProgressReport(user: AuthUserContext, complaint: ComplaintItem): PermissionResult {
  const scope=canViewComplaint(user,complaint);if(!scope.allowed)return scope;
  if (!isComplaintAssignedToEo(complaint)) {
    return {
      allowed: false,
      reason: "Cannot request progress report: No Enquiry Officer is currently assigned.",
    };
  }

  // Jisko complaint assign hai, wo khud progress report nahi maang sakta
  if (isUserAssignedEo(user, complaint)) {
    return {
      allowed: false,
      reason: "You are the assigned enquiry officer. Progress report can only be requested by supervisory officers.",
    };
  }

  // Agar SHO ko mark hai: SHO ko na dikhe, sirf us se upar walo ko dikhe (DSP, SP, Super Admin)
  if (isAssignedOfficerSho(complaint)) {
    if (isSuperiorToSho(user.role)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Supervisory authority required: When inquiry is held by SHO, progress report can only be sought by DSP, SP or District Supervisory Officers.",
    };
  }

  // Agar subordinate EO (SI, ASI, HC) ko assign hai: SHO ya us se upar walo ko dikhe
  if (isShoOrSuperior(user.role)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "Access Denied: Only SHO or Supervisory Officers can request progress reports.",
  };
}

/**
 * 7. Can Transfer Justification
 * When EO is assigned:
 * EO -> NOT ALLOWED
 * MHC -> NOT ALLOWED
 * SHO -> ALLOWED
 * Superior to SHO -> ALLOWED
 */
export function canTransferJustification(user: AuthUserContext, complaint: ComplaintItem): PermissionResult {
  const scope=canViewComplaint(user,complaint);if(!scope.allowed)return scope;
  if (user.role === "ENQUIRY_OFFICER" || isMhcOrMmRole(user.role)) {
    return {
      allowed: false,
      reason: "Access Denied: Transfer Justification is only available to SHO and Supervisory Officers.",
    };
  }

  if (isShoOrSuperior(user.role)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "Access Denied: Only SHO and superior officers can submit transfer justifications.",
  };
}

/**
 * 8. Can Create SHO's Own Report (Separate from EO's report)
 * When complaint is assigned to EO, SHO/Superiors cannot generate reports; only EO can.
 * Only when unassigned or review stage can SHO create supervisory reports.
 */
export function canCreateShoReport(user: AuthUserContext, complaint: ComplaintItem): PermissionResult {
  const scope=canViewComplaint(user,complaint);if(!scope.allowed)return scope;
  if (!isShoOrSuperior(user.role)) {
    return {
      allowed: false,
      reason: "Access Denied: Only SHO or Supervisory Officers can create supervisory reports.",
    };
  }

  // Once a complaint is sent to SHO for review or approved by SHO, SHO is fully authorized to generate/save their own report
  if (
    complaint.isSentToSho ||
    complaint.shoDecision === "APPROVE" ||
    complaint.shoApprovedAt ||
    complaint.workflowState === "SENT_TO_SHO" ||
    complaint.workflowState === "SHO_APPROVED" ||
    complaint.workflowState === "SENT_TO_SO" ||
    complaint.workflowState === "COMPLETE" ||
    complaint.workflowState === "FIR_REGISTRATION_PENDING" ||
    complaint.status === "REPORT_SUBMITTED" ||
    complaint.status === "RECOMMENDED_FOR_FIR" ||
    complaint.status === "FIR_RECOMMEND" ||
    complaint.status === "COMPLETE"
  ) {
    return { allowed: true };
  }

  if (isComplaintAssignedToEo(complaint)) {
    return {
      allowed: false,
      reason: "Access Denied: Complaint is currently assigned to Enquiry Officer. SHO supervisory report can be generated once submitted or approved.",
    };
  }

  return { allowed: true };
}
