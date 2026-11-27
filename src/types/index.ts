import type { TransferableRecord } from '@/lib/recordCustody';
export type SystemRole =
  | 'SUPER_ADMIN'
  | 'DGP'
  | 'ADGP'
  | 'IG'
  | 'DIG'
  | 'CP'
  | 'JOINT_CP'
  | 'DCP'
  | 'ADDL_DCP'
  | 'ACP'
  | 'SP_DISTRICT'
  | 'ASP'
  | 'DSP_SUBDIV'
  | 'COMMANDANT'
  | 'ADDL_COMMANDANT'
  | 'ASST_COMMANDANT'
  | 'SHO'
  | 'INSPECTOR'
  | 'SI'
  | 'ASI'
  | 'MHC_GD_INCHARGE'
  | 'MM'
  | 'ENQUIRY_OFFICER'
  | 'READER_TO_SHO'
  | 'HEAD_CONSTABLE'
  | 'CONSTABLE'
  | 'VIEWER_AUDITOR'
  | string;

export type PoliceRank =
  | 'CONSTABLE'
  | 'HEAD_CONSTABLE'
  | 'ASSISTANT_SUB_INSPECTOR'
  | 'SUB_INSPECTOR'
  | 'INSPECTOR'
  | 'DEPUTY_SP'
  | 'ADDITIONAL_SP'
  | 'SUPERINTENDENT_OF_POLICE'
  | 'INSPECTOR_GENERAL'
  | 'ADGP'
  | 'DGP'
  | 'CP'
  | 'JOINT_CP'
  | 'DCP'
  | 'ADDL_DCP'
  | 'ACP'
  | 'COMMANDANT'
  | 'ADDL_COMMANDANT'
  | 'ASST_COMMANDANT'
  | string;

export interface UserSession {
  beltNumber?: string;
  id: string;
  pno: string;
  name: string;
  rank: PoliceRank;
  rankDisplay: string;
  role: SystemRole;
  roleDisplay: string;
  stationName: string;
  stationCode: string;
  unitId?: string;
  jurisdictionUnits?: string[];
  district: string;
  zone?: string;
  avatarUrl?: string;
}

export type ComplaintPriority = 'ROUTINE' | 'URGENT' | 'CRITICAL_SENSITIVE' | 'CM_WINDOW_VIP';

export type MainComplaintStatus =
  | 'Not Assigned'
  | 'Pending'
  | 'Complete'
  | 'FIR Register'
  | 'FIR Recommend'
  | 'FIR Registered'
  | 'Correction Required';

export type FinalRecommendationCategory = 'NCR' | 'FIR_RECOMMEND' | 'CLOSURE';

export type WorkflowState =
  | 'NOT_ASSIGNED'
  | 'PENDING'
  | 'REPORT_READY'
  | 'SENT_TO_SHO'
  | 'RE_ENQUIRY'
  | 'CORRECTION_REQUIRED'
  | 'FIR_RECOMMENDED'
  | 'FIR_RECOMMEND'
  | 'FIR_REGISTER'
  | 'FIR_REGISTRATION_PENDING'
  | 'FIR_REGISTERED'
  | 'COMPLETE';

export type EOOutcome = 'Complete' | 'Pending' | 'FIR Recommend';

export type ComplaintStatus =
  | 'NOT_ASSIGNED'
  | 'PENDING'
  | 'COMPLETE'
  | 'Complete'
  | 'Pending'
  | 'FIR_RECOMMEND'
  | 'FIR Recommend'
  | 'FIR_REGISTER'
  | 'FIR Register'
  | 'FIR_REGISTERED'
  | 'FIR Registered'
  | 'CORRECTION_REQUIRED'
  | 'Correction Required'
  | 'REGISTERED'
  | 'ASSIGNED_TO_EO'
  | 'ENQUIRY_IN_PROGRESS'
  | 'INTERIM_REPORT_SUBMITTED'
  | 'REPORT_SUBMITTED'
  | 'PENDING_SHO_REVIEW'
  | 'RECOMMENDED_FOR_FIR'
  | 'DISPOSED_MUTUAL_ACCORD'
  | 'DISPOSED_CIVIL_NATURE'
  | 'DISPOSED_UNSUBSTANTIATED'
  | 'TRANSFERRED_OTHER_PS';

export function getMainComplaintStatus(
  complaint: {
    assignedEoId?: string;
    assignedEoName?: string;
    status?: string;
    workflowState?: string;
    isFirRegistered?: boolean;
    firNumber?: string;
    eoOutcome?: string;
    directSendToFir?: boolean;
    shoDecision?: string;
    finalCategory?: string;
  },
  viewerRole?: string
): MainComplaintStatus {
  // 1. Fully Registered FIR
  if (
    complaint.isFirRegistered ||
    complaint.status === "FIR_REGISTERED" ||
    complaint.workflowState === "FIR_REGISTERED" ||
    (complaint.firNumber && complaint.firNumber.trim().length > 0)
  ) {
    return "FIR Registered";
  }

  // 2. Direct Send to FIR (awaiting formal registration by SHO)
  if (
    complaint.directSendToFir ||
    complaint.status === "FIR_REGISTER" ||
    complaint.workflowState === "FIR_REGISTER"
  ) {
    return "FIR Register";
  }

  if (
    !complaint.shoDecision &&
    (complaint.workflowState === "SENT_TO_SHO" ||
      complaint.workflowState === "FIR_RECOMMENDED" ||
      complaint.status === "PENDING_SHO_REVIEW")
  ) {
    return "Pending";
  }

  // 3. SHO-approved FIR recommendation awaiting registration
  if (
    complaint.finalCategory === "FIR Recommend" ||
    complaint.finalCategory === "FIR_RECOMMEND" ||
    complaint.status === "FIR Recommend" ||
    complaint.status === "FIR_RECOMMEND" ||
    complaint.workflowState === "FIR_REGISTRATION_PENDING" ||
    complaint.workflowState === "FIR_RECOMMENDED"
  ) {
    return "FIR Recommend";
  }

  // 4. SHO Rejection / Correction Required
  if (
    complaint.workflowState === "CORRECTION_REQUIRED" ||
    complaint.status === "CORRECTION_REQUIRED" ||
    (complaint.shoDecision === "REJECT" && complaint.workflowState !== "COMPLETE")
  ) {
    return "Correction Required";
  }

  const hasEo = Boolean(
    (complaint.assignedEoId && complaint.assignedEoId.trim().length > 0) ||
    (complaint.assignedEoName && complaint.assignedEoName.trim().length > 0)
  );

  if (!hasEo) {
    return "Not Assigned";
  }

  if (
    complaint.status === "COMPLETE" ||
    complaint.workflowState === "COMPLETE" ||
    complaint.eoOutcome === "Complete" ||
    complaint.finalCategory === "NCR" ||
    complaint.finalCategory === "Closure" ||
    complaint.finalCategory === "CLOSURE" ||
    complaint.status === "DISPOSED_MUTUAL_ACCORD" ||
    complaint.status === "DISPOSED_CIVIL_NATURE"
  ) {
    return "Complete";
  }

  return "Pending";
}

export type ComplaintSource =
  | 'WALK_IN_STATION'
  | 'CM_WINDOW_HARYANA'
  | 'CITIZEN_PORTAL_HARPATH'
  | 'EMERGENCY_112'
  | 'SP_OFFICE_REFERENCE'
  | 'POSTAL_APPLICATION';

export type ComplaintCategory =
  | 'CYBER_CRIME'
  | 'PROPERTY_THEFT_BURGLARY'
  | 'FINANCIAL_FRAUD_CHEATING'
  | 'LAND_PROPERTY_DISPUTE'
  | 'PHYSICAL_ASSAULT_AFFRAY'
  | 'DOMESTIC_VIOLENCE_DOWRY'
  | 'PUBLIC_NUISANCE'
  | 'MISSING_PERSON'
  | 'NARCOTICS_DRUGS_INFO'
  | 'HARASSMENT_STALKING'
  | 'OTHER_GENERAL';

export type RelativeRelation = 'S/O' | 'D/O' | 'W/O' | 'C/O';

export interface ComplainantPerson {
  id?: string;
  name: string;
  relationType: RelativeRelation;
  relativeName: string;
  gender?: 'MALE' | 'FEMALE' | 'TRANSGENDER';
  nationality?: string;
  age?: number;
  presentAddress: string;
  presentCity: string;
  presentDistrict: string;
  presentState: string;
  presentCountry: string;
  isPermanentSameAsPresent: boolean;
  permanentAddress?: string;
  permanentCity?: string;
  permanentDistrict?: string;
  permanentState?: string;
  permanentCountry?: string;
  mobile: string;
}

export interface AccusedPerson {
  arrestDate?: string;
  id?: string;
  name: string;
  alias?: string;
  fatherName?: string;
  relativeName?: string;
  age?: number | string;
  isArrested?: boolean;
  custodyStatus?: 'ARRESTED' | 'ABSCONDING' | 'JUDICIAL_CUSTODY' | 'BAIL' | 'SUSPECT' | string;
  address?: string;
  phone?: string;
  relationWithComplainant?: string;
  physicalDescription?: string;
  isIdentified?: boolean;
  isSuspect?: boolean;
}

export interface ComplaintEvidenceAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  category: 'document' | 'video' | 'audio' | 'image' | 'other';
  dataUrl?: string;
  uploadedAt: string;
  description?: string;
  isAutoFilled?: boolean;
  isProcessed?: boolean;
  processedRecordId?: string;
}

export interface ComplaintItem extends TransferableRecord {
  persistenceVersion?: number;
  resolvedAt?: string;
  id: string;
  complaintNumber: string;
  source: ComplaintSource;
  category: ComplaintCategory;
  categoryDisplay: string;
  subCategory?: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  
  // Incident Info
  incidentDate: string;
  incidentTime?: string;
  isIncidentDateTimeKnown?: boolean;
  incidentPlace: string;
  incidentLandmark?: string;
  incidentDetails: string;
  
  // Complainant Info
  complainantName: string;
  complainantRelationType?: RelativeRelation;
  complainantRelativeName?: string;
  complainantFatherSpouse?: string;
  complainantNationality?: string;
  complainantGender: 'MALE' | 'FEMALE' | 'TRANSGENDER' | 'OTHER';
  complainantAge?: number;
  complainantMobile: string;
  complainantAltPhone?: string;
  complainantAddress: string;
  complainantCity: string;
  complainantDistrict: string;
  complainantState?: string;
  complainantCountry?: string;
  complainantPermanentAddress?: string;
  complainantPermanentCity?: string;
  complainantPermanentDistrict?: string;
  complainantPermanentState?: string;
  complainantPermanentCountry?: string;
  additionalComplainants?: ComplainantPerson[];
  
  // 4. Complaint Details
  intakeMode?: string;
  complaintSubject?: string;
  subject?: string;
  complaintDescription?: string;
  isFirRegistered?: boolean;
  firNumber?: string;
  firDate?: string;
  firRegisteredBy?: string;
  firRegisteredAt?: string;
  caseType?: 'ADULT' | 'JUVENILE & ADULT' | 'ONLY JUVENILE' | string;
  gdEntryNumber?: string;
  complaintAgeType?: 'FRESH' | 'OLD';
  complaintClassification?: string;
  complaintPurpose?: string;
  
  // Accused Info
  isAccusedKnown?: boolean;
  accusedList: AccusedPerson[];
  
  // Station & Officer Assignment
  policeStation: string;
  district: string;
  registeredBy: string;
  assignedEoId?: string;
  assignedEoName?: string;
  assignedEoRank?: string;
  assignedEoPno?: string;
  assignedEoBeltNumber?: string;
  assignedEoPhone?: string;
  mhcName?: string;
  mhcRank?: string;
  mhcBeltNumber?: string;
  mhcPhone?: string;
  assignedAt?: string;
  assignedDirections?: string;
  assignedRosterDuty?: string;
  daysPending: number;
  targetResolutionDate?: string;
  fivePNumber?: string;
  officeReferenceNumber?: string;
  sourceOffice?: string;
  linkedComplaintNumber?: string;
  crossComplaintNumber?: string;
  isCrossComplaint?: boolean;
  linkedComplaintReason?: string;
  linkedComplaintsList?: LinkedComplaintEntry[];
  isTransferred?: boolean;
  transferType?: "OTHER_STATION" | "OTHER_DISTRICT" | "OTHER_STATE";
  transferredToState?: string;
  transferredToDistrict?: string;
  transferredToPoliceStation?: string;
  transferredAt?: string;
  transferredBy?: string;
  transferReason?: string;
  transferOrderNumber?: string;
  transferHistory?: ComplaintTransferRecord[];
  ncrNumber?: string;
  dispositionType?: string;
  dispositionCategory?: string;
  dispositionRemarks?: string;
  disposedAt?: string;
  recommendedAction?: string;
  isRecommendedForFir?: boolean;
  recommendedForFirAt?: string;
  recommendedForFirBy?: string;
  firSections?: string;
  sentToShoAt?: string;
  sentToShoBy?: string;
  
  // Evidence Attachments (Documents, Audio, Video, Photos)
  attachments?: ComplaintEvidenceAttachment[];

  // Enquiry Notes, Documents, and Full Timeline
  enquiryNotes?: EnquiryNoteItem[];
  documents?: ComplaintDocumentItem[];
  timeline?: ComplaintTimelineEvent[];
  
  // EO Private Confidential Dossier (Never attached to public complaint or history)
  confidentialDossier?: ConfidentialDossierItem[];

  // Investigation Reports & Statutory Drafts
  reports?: ComplaintReportItem[];
  
  // Progress Report Demand from SHO
  progressReportRequested?: boolean;
  progressReportRequestedAt?: string;
  progressReportRemarks?: string;
  progressReportRequestedBy?: string;

  // AI & Statutory Legal Assistant Analysis
  legalAnalysis?: LegalAnalysisReport;

  // AI & Investigation Case Summary (Overview, Documents & History)
  investigationSummary?: InvestigationSummaryReport;

  // Cached Processed Document Records (Zero Reprocessing)
  processedDocuments?: any[];

  // Direct Send to FIR
  directSendToFir?: boolean;
  directSendToFirChoice?: 'YES' | 'NO';

  // New Complaint Status & SHO Approval Workflow
  workflowState?: WorkflowState;
  eoOutcome?: EOOutcome;
  isSentToSho?: boolean;
  isFirApprovedBySho?: boolean;
  firApprovedAt?: string;
  firApprovedBy?: string;
  shoDecision?: 'APPROVE' | 'RE_ENQUIRY' | 'REJECT';
  shoDecisionAt?: string;
  shoDecisionBy?: string;
  shoRemarks?: string;
  rejectionReason?: string;
  rejectionAt?: string;
  rejectionBy?: string;
  rejectionCount?: number;
  reEnquiryCount?: number;
  reEnquiryRemarks?: string;
  reEnquiryAt?: string;
  reEnquiryBy?: string;
  // EO Recommendation before sending to SHO (NCR | FIR Recommend | Closure)
  eoRecommendedCategory?: 'NCR' | 'FIR_RECOMMEND' | 'CLOSURE' | string;
  eoRecommendedBy?: string;
  eoRecommendedById?: string;
  eoRecommendedAt?: string;
  eoRecommendedReportTitle?: string;
  eoRecommendedReportId?: string;
  eoRecommendedRemarks?: string;

  // SHO Final Decision & Category
  shoFinalCategory?: 'NCR' | 'FIR_RECOMMEND' | 'CLOSURE' | string;
  finalCategory?: 'NCR' | 'FIR_RECOMMEND' | 'CLOSURE' | 'FIR Recommend' | 'Closure' | string;
  finalStatus?: string;
  shoApprovedBy?: string;
  shoApprovedAt?: string;

  shoActionRequired?: boolean;
  isReportViewedBySho?: boolean;
  shoReportViewedAt?: string;
  auditTrail?: ComplaintAuditRecord[];

  // Current Complaint Owner & RBAC tracking
  currentComplaintOwnerId?: string;
  reassignmentHistory?: ReassignmentRecord[];
  progressRequests?: ProgressRequestItem[];
  transferJustifications?: TransferJustificationRecord[];
  
  createdAt: string;
  updatedAt: string;
}

export interface ReassignmentRecord {
  id: string;
  complaintId: string;
  previousEoId: string;
  previousEoName: string;
  newEoId: string;
  newEoName: string;
  reassignedById: string;
  reassignedByName: string;
  reassignedByRole: string;
  reassignedAt: string;
  reason: string;
  previousDirections?: string;
  newDirections?: string;
}

export interface ProgressRequestItem {
  id: string;
  complaintId: string;
  requestedById: string;
  requestedByName: string;
  requestedByRole: string;
  requestedFromId: string;
  requestedFromName: string;
  requestedFromRole: string;
  requestedAt: string;
  requestMessage: string;
  deadlineHours?: number;
  eoResponse?: string;
  respondedAt?: string;
  status: 'REQUESTED' | 'RESPONDED' | 'CLOSED';
}

export interface TransferJustificationRecord {
  id: string;
  complaintId: string;
  requestedById: string;
  requestedByName: string;
  requestedByRole: string;
  targetUnitOrStation: string;
  justificationReason: string;
  timestamp: string;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
}

export interface ComplaintAuditRecord {
  id: string;
  complaintId: string;
  action:
    | 'COMPLAINT_REGISTERED'
    | 'EO_ASSIGNED'
    | 'EO_REASSIGNED'
    | 'REPORT_GENERATED'
    | 'REPORT_SAVED'
    | 'REPORT_UPLOADED'
    | 'REPORT_DELETED'
    | 'DOCUMENT_UPLOADED'
    | 'DOCUMENT_DELETED'
    | 'DOCUMENT_VIEWED'
    | 'DOCUMENT_PREVIEWED'
    | 'DOCUMENT_SUMMARY_GENERATED'
    | 'PROGRESS_REPORT_REQUESTED'
    | 'TRANSFER_JUSTIFICATION_SUBMITTED'
    | 'EO_OUTCOME_SELECTED'
    | 'SENT_TO_SHO'
    | 'SHO_APPROVED'
    | 'SHO_RE_ENQUIRY'
    | 'SHO_REJECTED'
    | 'FIR_REGISTERED'
    | 'GD_CRIMINAL_CASE_LOGGED'
    | 'GD_CRIMINAL_CASE_SUGGESTED';
  actionLabel: string;
  performedBy: string;
  userPno?: string;
  userRole?: string;
  timestamp: string;
  details?: string;
  outcome?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface ComplaintReportItem {
  finalReportData?: import('@/lib/finalReport').FinalReportData;
  finalReportWorkflow?: {
    state: 'SAVED' | 'SENT_TO_SHO' | 'SHO_VIEWED' | 'REJECTED' | 'UNDER_CHECKING' | 'COMPLETED' | 'PARTIAL';
    viewedBy?: string;
    viewedAt?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    rejectionReason?: string;
    assignedIoId?: string;
    assignedIoPno?: string;
    assignedIoName?: string;
    chiNumber?: string;
    chiSubmittedAt?: string;
    chiSubmittedBy?: string;
  };
  id: string;
  complaintId: string;
  versionNumber?: number;
  title: string;
  reportType: string;
  reportTypeLabel: string;
  dispatchNo?: string;
  generatedDate: string;
  officerName: string;
  officerRank?: string;
  officerPno?: string;
  conclusionSummary?: string;
  content?: string;
  contentHtml?: string;
  fileName?: string;
  fileSize?: string;
  fileUrl?: string;
  dataUrl?: string;
  fileFormat?: string;
  isUploaded?: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  lastModifiedBy?: string;
  status?: 'Draft' | 'Saved' | 'Finalized' | 'Saved in Complaint';
  recommendationType?:
    | 'GAMINI'
    | 'DIWANI'
    | 'NCR'
    | 'FIR'
    | 'NIVARAN'
    | 'RAZINAMA'
    | 'FIR_RECOMMENDED'
    | 'JAMINI_LAND_DISPUTE'
    | 'DIWANI_CIVIL_MONEY'
    | 'RAJINAMA_COMPROMISE'
    | 'NIVARAK_PREVENTIVE'
    | 'NO_COGNIZABLE_OFFENCE';
  isFirRecommended?: boolean;
  selectedOutcome?: EOOutcome;
  sentToSho?: boolean;
  isSentToSho?: boolean;
  analysisClassification?: string;
  analysisRationale?: string;
  sentToShoAt?: string;
  sentToShoBy?: string;

  // Immutable Ownership & Transfer History
  createdByUserId?: string;
  createdByRole?: string;
  createdByName?: string;
  currentOwnerUserId?: string;
  currentOwner?: string;
  source?: 'UPLOADED' | 'GENERATED';
  lastModifiedByUserId?: string;
  transferHistory?: Array<{ fromUserId: string; toUserId: string; timestamp: string; action: string; remarks?: string }>;
}

export interface EnquiryNoteItem {
  id: string;
  complaintId: string;
  officerName: string;
  officerRank: string;
  officerPno: string;
  noteType: 'SPOT_VISIT' | 'WITNESS_EXAMINATION' | 'ACCUSED_EXAMINATION' | 'DOCUMENT_VERIFICATION' | 'INTERIM_PROGRESS' | 'GENERAL';
  content: string;
  createdAt: string;
  location?: string;
  attachment?: ComplaintEvidenceAttachment;
}

export interface ComplaintDocumentItem {
  id: string;
  complaintId: string;
  fileName: string;
  fileCategory: string;
  uploadedBy: string;
  uploadedAt: string;
  fileSize: string;
  fileUrl?: string;
  dataUrl?: string;
  contentHtml?: string;
  mimeType?: string;
  description?: string;
  originalName?: string;

  // Immutable Ownership & Transfer History
  createdByUserId?: string;
  createdByRole?: string;
  createdByName?: string;
  currentOwnerUserId?: string;
  currentOwner?: string;
  version?: number;
  source?: 'UPLOADED' | 'GENERATED';
  status?: string;
  lastModifiedAt?: string;
  lastModifiedByUserId?: string;
  lastModifiedBy?: string;
  transferHistory?: Array<{ fromUserId: string; toUserId: string; timestamp: string; action: string; remarks?: string }>;
  isAutoFilled?: boolean;
  isProcessed?: boolean;
  processedRecordId?: string;
  rawExtractedText?: string;
  detectedLanguage?: string;
  isPermanentRegistrationDoc?: boolean;
}

export interface PoliceReportFormData {
  dispatchNo: string;
  complaintRefNo: string;
  gdEntryNo: string;
  policeStation: string;
  district: string;
  reportDate: string;
  reportTime: string;

  complainantName: string;
  complainantFather: string;
  complainantAge: string;
  complainantAddress: string;
  complainantPhone: string;

  accusedName: string;
  accusedFather: string;
  accusedAddress: string;
  accusedPhone: string;

  incidentDate: string;
  incidentPlace: string;
  sectionsOfLaw: string;
  disputeSubject: string;
  amountOrPropertyDetails: string;
  complaintSubstance: string;

  witnessesExamined: string;
  documentsVerified: string;
  enquiryFindings: string;
  finalConclusion: string;
  shoRecommendation: string;

  officerName: string;
  officerRank: string;
  officerPno: string;
  officerPhone: string;
}

export interface NoticeFormData {
  dispatchNo?: string;
  policeStation: string;
  district: string;
  issueDate: string;

  noticeeName: string;
  noticeeFather: string;
  noticeeAge: string;
  noticeeAddress: string;
  noticeePhone: string;
  noticeeRole: string;

  complaintNo: string;
  complainantName?: string;
  incidentDate?: string;
  sectionsOfLaw?: string;
  allegationsBrief?: string;

  appearanceDate?: string;
  appearanceTime?: string;
  appearancePlace?: string;
  documentsRequired?: string;

  officerName: string;
  officerRank: string;
  officerPno: string;
  officerPhone: string;
  officerEmail?: string;
  stationEmail?: string;
  complainantAddress?: string;
  videoConferenceDeadline?: string;

  mhcName?: string;
  mhcRank?: string;
  mhcBeltNumber?: string;
  mhcPhone?: string;

  subjectTitle?: string;
  recipientDesignation?: string;
  groundsBrief?: string;
  certificateText?: string;
  shoName?: string;
  supervisoryOfficerName?: string;
  accusedAadhaar?: string;
  accusedPan?: string;
  accusedGender?: string;
  jamaTalashiArticles?: string;
  familyInformedDetails?: string;
  witness1Details?: string;
  witness2Details?: string;
  natgridReason?: string;
  natgridDepartment?: string;
  natgridInfoRequired?: string;
  shoPhone?: string;
  shoEmail?: string;
  noticeeDob?: string;
  natgridNationalSecurity?: boolean;
  natgridCounterTerror?: boolean;
  natgridHeinousCrime?: boolean;
  natgridOtherInfo?: string;

  headerDept?: string;
  headerGovt?: string;
  docTitle?: string;
  docSubTitle?: string;
  statutoryClarification?: string;
  toAuthority?: string;
  haryanaNoticeFullText?: string;
  para1CustomText?: string;
  para2CustomText?: string;
  para3CustomText?: string;
  para4CustomText?: string;
  annexureText?: string;
  sealLabel?: string;
  ioSignLabel?: string;
  cdrRows?: Array<{
    id: string;
    phone: string;
    operator?: string;
    period?: string;
    details?: string;
    periodFrom?: string;
    periodTo?: string;
    reason?: string;
  }>;

  // Arrest & Surrender Memo Form 26.8(1) (4 Pages Official Haryana Police Format)
  headerVersion?: string;
  arrestYear?: string;
  arrestDate?: string;
  arrestTime?: string;
  arrestGdNo?: string;
  arrestPlace?: string;
  arrestPoliceStation?: string;
  arrestDistrict?: string;
  courtNameSurrender?: string;
  noticeeAlias1?: string;
  noticeeAlias2?: string;
  noticeeNationality?: string;
  voterOrIdCardNo?: string;
  passportNo?: string;
  passportIssueDate?: string;
  passportIssuePlace?: string;
  religion?: string;
  categoryCaste?: string;
  occupation?: string;
  permanentAddress?: string;
  currentAddress?: string;
  mobileNo?: string;
  phoneNo?: string;
  userIdentificationNo?: string;
  panNo?: string;
  physicalConditionOrInjuries?: string;
  custodyDate?: string;
  custodyTime?: string;
  custodyPlace?: string;
  arrestWitnesses?: Array<{ id: string; srNo: string; name: string; address: string; signature: string }>;
  relativeName?: string;
  relativeRelation?: string;
  intimationDate?: string;
  intimationTime?: string;
  relativeMobile?: string;
  familyMember1?: string;
  familyMember2?: string;
  familyMember3?: string;
  grounds47Sections?: string;
  grounds47Role?: string;
  grounds47Evidence?: string;
  grounds47Other?: string;
  jamaTalashiItems?: Array<{ id: string; srNo: string; description: string; quantity: string }>;
  witnessSign1?: string;
  witnessSign2?: string;
  ioSignPlace?: string;
  ioSignDate?: string;
  accusedPhotoUrl?: string;
  stateCaseTitle?: string;
  caseNo?: string;
  caseDate?: string;
  caseSections?: string;
  casePs?: string;
  vsName?: string;
  gender?: string;
  dobYear?: string;
  bodyBuild?: string;
  heightCm?: string;
  colorBloodGroup?: string;
  identMarks?: string;
  deformities?: string;
  teeth?: string;
  hair?: string;
  eyes?: string;
  habits?: string;
  dress?: string;
  languageDialect?: string;
  burnMarks?: string;
  leukodermaSpots?: string;
  moleMarks?: string;
  scarWoundMarks?: string;
  tattooMarks?: string;
  otherIdentTraits?: string;
  fingerprintsTaken?: string;
  livingStandard?: string;
  educationalQualification?: string;
  profession?: string;
  incomeGroup?: string;
  isDangerous?: string;
  isBailJumped?: string;
  usuallyCarriesArms?: string;
  activeWithGang?: string;
  isKnownListedCriminal?: string;
  isHabitualOffender?: string;
  isLikelyToEscapeBail?: string;
  isLikelyToThreatenOrRepeat?: string;
  wantedInOtherCrime?: string;
  riskNotesRemarks?: string;
  ioSignPlaceP4?: string;
  ioSignDateP4?: string;
  priorRecord1?: string;
  priorRecord2?: string;
  priorRecord3?: string;
  eagleCriminalId?: string;
  [key: string]: any;
}

export interface DynamicDocumentSection {
  id: string;
  title: string;
  content: string;
  variant?: "standard" | "highlight" | "danger" | "grid";
}

export interface ConfidentialDossierItem {
  id: string;
  complaintId: string;
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
  createdAt: string;
}

export interface ComplaintTimelineEvent {
  id: string;
  complaintId: string;
  title: string;
  description: string;
  category: 'REGISTRATION' | 'ASSIGNMENT' | 'ENQUIRY_NOTE' | 'EVIDENCE' | 'DOCUMENT' | 'STATUS_CHANGE' | 'TRANSFER' | 'NOTICE' | 'PROGRESS_REQUEST';
  officerName: string;
  officerRank?: string;
  timestamp: string;
  documentName?: string;
}

export interface ComplaintTransferRecord {
  id: string;
  complaintId: string;
  complaintNumber: string;
  complainantName?: string;
  transferType: "OTHER_STATION" | "OTHER_DISTRICT" | "OTHER_STATE";
  sourcePoliceStation: string;
  sourceDistrict: string;
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
  timestamp: string;
}

export interface LinkedComplaintEntry {
  id: string;
  complaintNumber: string;
  complaintId?: string;
  complainantName?: string;
  incidentDate?: string;
  linkType: "RELATED" | "CROSS" | "DUPLICATE" | "SAME_ACCUSED";
  reason: string;
  linkedAt: string;
  linkedBy: string;
}

export interface OfficerNotification {
  id: string;
  recipientPno: string;
  recipientName: string;
  complaintId: string;
  complaintNumber: string;
  title: string;
  message: string;
  directions?: string;
  priority: string;
  createdAt: string;
  read?: boolean;
}

export type GDEntryType =
  | 'OPENING_OF_DIARY'
  | 'SHIFT_RELIEF_TURNOVER'
  | 'OFFICER_DEPARTURE'
  | 'OFFICER_ARRIVAL'
  | 'PATROL_DEPARTURE_RETURN'
  | 'COMPLAINT_RECEIPT'
  | 'FIR_REGISTERED_ENTRY'
  | 'ARREST_INTIMATION'
  | 'SEIZURE_MUDDMAL'
  | 'SUPERVISORY_INSPECTION'
  | 'CLOSING_OF_DIARY'
  | 'MISCELLANEOUS_EVENT';

export * from "./generalDiary";

export interface GeneralDiaryItem {
  id: string;
  gdNumber: string;
  sequencePerDay: number;
  entryTime?: string;
  entryDate?: string;
  entryType?: any;
  entryTypeDisplay?: string;
  subject: string;
  narrative: string;
  policeStation: string;
  loggedByOfficer?: string;
  loggedByPno?: string;
  relatedComplaintNumber?: string;
  isLocked: boolean;
  activityDateTime?: string;
  officialCreationTimestamp?: string;
  verificationTimestamp?: string;
  status?: import("./generalDiary").GDStatus;
  source?: import("./generalDiary").GDSource;
  entryForOfficer?: import("./generalDiary").GDOfficerParticulars;
  actualAuthor?: import("./generalDiary").GDOfficerParticulars;
  auditTrail?: import("./generalDiary").GDAuditLog[];
  relatedRecords?: import("./generalDiary").GDRelatedRecords;
}

export interface HistoricalFirItem {
  id: string;
  firNumber: string;
  policeStation: string;
  district: string;
  registrationDate: string;
  sectionsOfLaw: string;
  complainantName: string;
  complainantPhone?: string;
  accusedNames: string[];
  accusedPhones?: string[];
  status: 'PENDING_TRIAL' | 'UNDER_INVESTIGATION' | 'CHARGESHEETED' | 'CONVICTED' | 'ACQUITTED';
  incidentBrief: string;
}

export interface CrossComplaintMatch {
  existingComplaint: ComplaintItem;
  matchType: 'CROSS_COMPLAINT' | 'REVERSE_PARTIES';
  reason: string;
  severity: 'HIGH' | 'MEDIUM';
}

export interface RepeatComplainantHistory {
  totalPreviousComplaints: number;
  complaints: ComplaintItem[];
  riskLevel: 'FREQUENT_COMPLAINANT' | 'MULTIPLE_PRIOR' | 'FIRST_TIME';
}

export interface LinkedComplaintMatch {
  existingComplaint: ComplaintItem;
  similarityScore: number;
  matchedOn: string[];
  summary: string;
}

export interface PriorFirMatch {
  fir: HistoricalFirItem;
  matchedParty: 'COMPLAINANT' | 'ACCUSED' | 'BOTH' | 'LOCATION';
  partyRole: 'ACCUSED_IN_FIR' | 'COMPLAINANT_IN_FIR' | 'NAMED_PERSON';
  reason: string;
}

export interface IntelligenceCheckResult {
  hasAlerts: boolean;
  crossComplaints: CrossComplaintMatch[];
  repeatHistory: RepeatComplainantHistory;
  linkedComplaints: LinkedComplaintMatch[];
  priorFirs: PriorFirMatch[];
  scannedAt: string;
}

export interface LegalSectionItem {
  sectionNumber: string;
  title: string;
  chapter?: string;
  description: string;
  verbatimText?: string;
  punishment?: string;
  cognizable?: 'Cognizable' | 'Non-cognizable';
  bailable?: 'Bailable' | 'Non-bailable';
  triableBy?: string;
}

export interface LegalActItem {
  id: string;
  title: string;
  shortName: string;
  actNumber: string;
  enactmentDate: string;
  effectiveDate: string;
  category: 'CRIMINAL_CODE' | 'PROCEDURAL_CODE' | 'EVIDENCE_CODE' | 'SPECIAL_ACT' | 'ECONOMIC_PROPERTY' | 'POLICE_RULES' | 'OTHER';
  categoryLabel: string;
  totalSections: number;
  totalChapters: number;
  fileFormat: 'PDF' | 'DOCX' | 'TXT' | 'IMAGE' | 'OTHER';
  fileName?: string;
  fileSize?: string;
  fileUrl?: string;
  fileDataUrl?: string;
  verbatimText?: string;
  preambleVerbatim?: string;
  isCustomUpload?: boolean;
  hasLargeFileInIdb?: boolean;
  uploadedAt?: string;
  uploadedBy?: string;
  description: string;
  chapters?: {
    chapterNumber: string;
    title: string;
    sectionsRange: string;
  }[];
  keySections: LegalSectionItem[];
}

export interface LegalSuggestionItem {
  id: string;
  actId: string;
  actTitle: string;
  actShortName: string;
  actFileName?: string;
  sectionNumber: string;
  sectionTitle: string;
  chapter: string;
  pageNumber: number | string;
  description: string;
  verbatimSnippet?: string;
  punishment?: string;
  cognizable?: 'Cognizable' | 'Non-cognizable';
  bailable?: 'Bailable' | 'Non-bailable';
  triableBy?: string;
  recommendationType: 'PRIMARY_OFFENCE' | 'CORROBORATING_OFFENCE' | 'PROCEDURAL_MANDATE' | 'EVIDENTIARY_RULE';
  recommendationTypeLabel: string;
  reason: string;
  evidenceProof: string[];
  confidenceScore: number;
}

export interface LegalAnalysisReport {
  advisoryWarning?: string;
  complaintId?: string;
  complaintNumber?: string;
  firId?: string;
  firNumber?: string;
  analyzedAt: string;
  summary: string;
  scannedFactsCount: number;
  scannedDocumentsCount: number;
  scannedEvidenceSummary: {
    documentsFound: string[];
    keyAllegationsIdentified: string[];
    accusedIdentified: string[];
    injuriesOrLossNoted: string[];
  };
  suggestedSections: LegalSuggestionItem[];
  investigativeStepsRecommended: string[];
}

export interface InvestigationSummaryActionItem {
  id: string;
  category?: 'OVERVIEW' | 'DOCUMENTS' | 'HISTORY' | 'FIELD_ACTION' | 'LEGAL_PROCEDURE';
  categoryLabel?: string;
  title: string;
  detail: string;
  status: 'COMPLETED' | 'PENDING' | 'CRITICAL';
  completedAt?: string;
  officerResponsible?: string;
  remarks?: string;
  actor?: string;
  priority?: string;
  deadline?: string;
}

export interface InvestigationSummaryReport {
  id: string;
  complaintId: string;
  complaintNumber: string;
  generatedAt: string;
  updatedAt: string;
  version: number;
  generatedBy: string;

  // Executive Synopsis & Standing
  caseSynopsis: string;
  currentStage: string;
  progressPercentage: number; // e.g. 65%

  // Work Done So Far (कितना काम हुआ है अब तक)
  workDoneSummary: string;
  completedActions: InvestigationSummaryActionItem[];
  scannedOverviewHighlights: string[];
  scannedDocumentsHighlights: {
    name: string;
    type: string;
    status: string;
    summary: string;
  }[];
  scannedHistoryMilestones: {
    date: string;
    action?: string;
    officer?: string;
    details?: string;
    title?: string;
    actor?: string;
    impact?: string;
  }[];

  // Pending Work & Next Steps (क्या बाकी है)
  pendingWorkSummary: string;
  pendingActions: InvestigationSummaryActionItem[];
  pendingActionItems?: InvestigationSummaryActionItem[];
  urgentDeadlines: string[];
  statutoryDeadlines?: {
    ruleName: string;
    deadlineDays: number;
    description: string;
    status: string;
  }[];
  recommendedEoActions: string[];
  recommendedShoDirections: string[];

  // Evidence & Risk Evaluation
  evidenceStrength: 'STRONG' | 'MODERATE' | 'PRELIMINARY' | 'INSUFFICIENT';
  primaFacieObservation: string;
  suggestedOutcome:
    | 'REGISTER_FIR'
    | 'FURTHER_ENQUIRY'
    | 'MUTUAL_SETTLEMENT'
    | 'NON_COGNIZABLE_NCR'
    | 'CLOSURE_REPORT'
    | string;
  suggestedOutcomeReason: string;

  // Change Log / Update Track (for when update summary is triggered)
  lastUpdateNotes?: string;
  newItemsDetectedSinceLastUpdate?: string[];
}

// ==========================================
// FIR (FIRST INFORMATION REPORT) MODULE TYPES
// ==========================================

export type FIRStatus =
  | 'REGISTERED'
  | 'UNDER_INVESTIGATION'
  | 'PENDING_SUPERVISORY_REVIEW'
  | 'CHARGESHEET_FILED'
  | 'CLOSURE_REPORT_FILED'
  | 'UNTRACED'
  | 'CANCELLED'
  | 'QUASHED_BY_COURT';

export type MainFIRStatus =
  | 'Registered'
  | 'Not Assigned'
  | 'Under Investigation'
  | 'Under investigation'
  | 'Pending SHO review'
  | 'Chargesheet Filed'
  | 'Closure Filed'
  | 'Untraced'
  | 'Cancelled';

export interface FIRTransferRecord {
  id: string;
  firId: string;
  firNumber: string;
  complainantName?: string;
  actsAndSections?: string;
  transferType: "INTER_STATE";
  sourceState: string;
  sourceDistrict: string;
  sourcePoliceStation: string;
  targetState: string;
  targetDistrict: string;
  targetPoliceStation: string;
  transferReason: string;
  statutoryGround: string;
  orderNumber?: string;
  orderDate?: string;
  dispatchDate: string;
  dispatchTime?: string;
  transferredBy: string;
  transferredByRank?: string;
  remarks?: string;
  timestamp: string;
}

export interface LinkedFIREntry {
  id: string;
  firId: string;
  firNumber: string;
  cctnsFirNumber?: string;
  complainantName?: string;
  firDate?: string;
  linkType: "DUPLICATE" | "CROSS" | "CONNECTED";
  reason: string;
  linkedAt: string;
  linkedBy: string;
}

export interface FIRCaseDiaryItem {
  id: string;
  firId?: string;
  zimniNumber?: number;
  date: string;
  time: string;
  officer: string;
  officerRole?: string;
  summary: string;
  details: string;
  isAutoGenerated?: boolean;
  fileName?: string;
  fileUrl?: string;
  dataUrl?: string;
  contentHtml?: string;
  fileSize?: string;
  isUploaded?: boolean;
  proformaData?: any;
  uploadedAt?: string;
  createdBy?: string;
}

export interface FIRDocumentItem {
  documentType?: 'IIF_III';
  arrestAccusedId?: string;
  arrestFormData?: Record<string, unknown>;
  id: string;
  firId?: string;
  title: string;
  fileName: string;
  category: string;
  uploadedBy: string;
  uploadedAt: string;
  fileSize?: string;
  fileUrl?: string;
  dataUrl?: string;
}

export interface FIRTimelineEvent {
  id: string;
  firId?: string;
  date: string;
  title: string;
  description: string;
  actor: string;
  stage?: string;
}

export interface FIRAuditRecord {
  id: string;
  firId?: string;
  timestamp: string;
  action: string;
  officerName?: string;
  role?: string;
  details?: string;
}

// ==========================================
// CCTNS 11-TAB & I.I.F.-I EXTENDED FIR TYPES
// ==========================================

export interface FIRActSectionEntry {
  id: string;
  srNo?: number;
  act: string;
  sections: string;
}

export interface FIRMajorMinorHeadEntry {
  id: string;
  srNo?: number;
  majorHead: string;
  minorHead: string;
}

export interface FIROccurrenceItem {
  id: string;
  srNo?: number;
  day?: string;
  dateFrom: string;
  dateTo?: string;
  timePeriodPahar?: string;
  timePeriod?: string;
  timeFrom?: string;
  timeTo?: string;
  directionFromPs?: string;
  distanceFromPsKm?: string | number;
  distanceKm?: string | number;
  area?: string;
  city?: string;
  beatNumber?: string;
  beatNo?: string;
  landmark?: string;
  address?: string;
  houseNo?: string;
  streetName?: string;
  tehsil?: string;
  pincode?: string;
  isOutsidePsLimits?: boolean;
  outsidePs?: boolean;
  outsidePsName?: string;
  outsideDistrict?: string;
  outsideState?: string;
}

export interface FIRAliasEntry {
  id: string;
  alias?: string;
  aliasName?: string;
}

export interface FIRIdentificationEntry {
  id: string;
  idType: string; // Ration Card, Voter ID Card, Passport, UID No., Driving License, PAN Card
  idNumber: string;
}

export interface FIRDepartmentEntry {
  id: string;
  departmentName: string;
  departmentEmail: string;
}

export interface FIRUidbEntry {
  id: string;
  uidbNumber: string;
}

export interface FIRPropertyItem {
  recoveredAt?: string;
  id: string;
  srNo?: number;
  propertyCategory: string;
  propertyType: string;
  brandOrMake?: string;
  quantity?: string | number;
  status?: string;
  natureOfProperty?: string;
  description: string;
  estimatedValue?: number | string; // undefined/empty string = unknown, 0 = 0
  isUnknownValue?: boolean;
}

export interface FIRHurtDetails {
  deceasedCount: number;
  seriouslyHurtCount: number;
  simpleHurtCount: number;
  nonInjuredCount: number;
  injuryDetails?: string;
  meansOfCausingInjury?: string;
  hasVideoFootage?: boolean;
  uploadedDocuments?: Array<{
    id: string;
    name: string;
    size?: string | number;
    type?: string;
    dataUrl?: string;
  }>;
}

export interface FIRSignatureData {
  complainantSignatureType?: 'CAPTURE' | 'THUMB' | 'UPLOAD' | 'EXEMPT';
  complainantSignatureDataUrl?: string;
  officerSignatureDataUrl?: string;
  officerInChargeName?: string;
  officerInChargeRank?: string;
  officerInChargeNumber?: string;
}

export interface FIRActionTakenData {
  keepSecretOrInvisible?: boolean;
  isSecretFir?: boolean;
  actionTakenType?: 'INVESTIGATION_TAKEN' | 'DIRECTED_IO' | 'REFUSED' | 'TRANSFERRED';
  actionType?: 'INVESTIGATION_TAKEN' | 'DIRECTED_IO' | 'REFUSED' | 'TRANSFERRED' | 'REGISTERED_INVESTIGATION' | 'REFUSED_INVESTIGATION' | 'TRANSFERRED_JURISDICTION' | string;
  investigationOfficerName?: string;
  investigationOfficerRank?: string;
  investigationOfficerMobile?: string;
  // Directed IO
  directedIoId?: string;
  directedIoName?: string;
  directedIoRank?: string;
  directedIoNumber?: string;
  directedIoBelt?: string;
  // Refused
  refusedReason?: string;
  // Transferred
  transferredPs?: string;
  transferredDistrict?: string;
  // Inquest / UD Case
  inquestCaseNo?: string;
  inquestReportNo?: string;
  uidbList?: FIRUidbEntry[];
  // Court Dispatch
  courtDispatchDate?: string;
  courtDispatchTime?: string;
  courtDispatchDateTime?: string;
  // ROAC Confirmation
  roacConfirmed?: boolean;
  freeCopyGiven?: boolean;
}


// ==========================================
// FIR TRACKING WORKFLOW SPECIFICATION (Part A / Part B / Complete)
// ==========================================

export type FIRTrackingState =
  | 'PART_A_FRESH'
  | 'PART_B_PARTIAL'
  | 'PART_B_UNDER_CHECKING'
  | 'PART_B_REOPEN'
  | 'COMPLETED';

export type ChallanMode = 'COMPLETE' | 'PARTIAL';
export type ChallanType = 'INITIAL' | 'SUPPLEMENTARY';

export interface FIRChallanRecord {
  id: string;
  challanNumber: string;
  challanType: ChallanType;
  challanMode: ChallanMode;
  issuedAt: string;
  issuedBy: string;
  issuedByRank?: string;
  courtName: string;
  briefFacts?: string;
  submittedToCourt?: boolean;
  courtSubmittedAt?: string;
  courtSubmittedBy?: string;
  courtReceiptNo?: string;
  reportId?: string;
}

export interface FIRReopenEvent {
  id: string;
  reopenedAt: string;
  reopenedBy: string;
  reopenedByRank?: string;
  reason: string;
  orderNumber?: string;
  orderDate?: string;
  courtName?: string;
  orderDocumentUrl?: string;
  assignedIoId?: string;
  assignedIoName?: string;
  assignedIoRank?: string;
  assignedDirections?: string;
  priorCompletionReason?: string;
}

export interface FIRCompletionEvent {
  id: string;
  completedAt: string;
  completedBy: string;
  completionType: 'CHARGESHEET' | 'CLOSURE' | 'UNTRACED' | 'CANCELLED';
  courtName?: string;
  referenceNumber?: string;
  summary?: string;
  reason?: string;
}

export interface FIRItem extends TransferableRecord {
  accusedChargesheetDrafts?: Record<string, {
    accusedId: string; name: string; relation: string; relativeName: string; status: string;
    chargesheetDetails: import('@/lib/accusedChargesheet').AccusedChargesheetDetails;
    revision: number; updatedAt: string; savedBy: string;
  }>;
  finalReportAppliedKey?: string;
  persistenceVersion?: number;
  id: string;
  firNumber: string;
  firYear: number;
  firDate: string;
  firTime?: string;
  policeStation: string;
  district: string;
  state: string;

  // Source & Linkage
  sourceComplaintId?: string;
  sourceComplaintSyncStatus?: "PENDING" | "SYNCED" | "ERROR";
  sourceComplaintNumber?: string;
  cctnsFirNumber?: string;
  cctnsSyncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_ERROR';

  // Major Classification
  category: ComplaintCategory | string;
  categoryDisplay: string;
  priority: ComplaintPriority | string;
  status: FIRStatus;
  mainStatus?: MainFIRStatus;

  // Tab 1: Acts & Sections & Basic Details
  gdNumber?: string;
  gdDate?: string;
  gdTime?: string;
  sourceOfComplaint?: string;
  complaintNumber?: string;
  isHeinous?: boolean;
  isHeinousCrime?: boolean;
  isSensitive?: boolean;
  isSensitiveFIR?: boolean;
  originalDateTime?: string;
  remarks?: string;
  typeOfInformation: 'WRITTEN' | 'ORAL' | 'E_COMPLAINT';
  actsAndSectionsList?: FIRActSectionEntry[];
  majorMinorHeadsList?: FIRMajorMinorHeadEntry[];
  caseType?: 'ADULT' | 'JUVENILE & ADULT' | 'ONLY JUVENILE' | string;

  // Legacy/Compatibility fields
  actsAndSections: string;
  majorAct?: string;
  bnsSections?: string[];
  specialActs?: string;

  // Tab 2: Occurrence
  occurrencesList?: FIROccurrenceItem[];
  infoReceivedDate?: string;
  infoReceivedTime?: string;
  // Occurrence details
  incidentDateFrom: string;
  incidentDateTo?: string;
  incidentTimeFrom?: string;
  incidentTimeTo?: string;
  incidentDay?: string;
  incidentTimePeriod?: string;
  incidentPlace: string;
  incidentLandmark?: string;
  distanceFromPs?: string;
  beatNumber?: string;
  isPlaceOutsidePs?: boolean;
  outsidePsDetails?: string;
  outsidePsName?: string;
  outsideDistrict?: string;
  outsideState?: string;
  gdEntryNumber?: string;
  gdEntryDateTime?: string;

  // Tab 3: Complainant
  complainantUid?: string;
  complainantFirstName?: string;
  complainantMiddleName?: string;
  complainantLastName?: string;
  complainantName: string;
  complainantAliases?: FIRAliasEntry[];
  complainantAliasList?: FIRAliasEntry[];
  complainantGender: 'MALE' | 'FEMALE' | 'TRANSGENDER' | 'OTHER' | string;
  complainantMaritalStatus?: string;
  complainantCategory?: string;
  complainantMobile: string;
  complainantLandline?: string;
  complainantEmail?: string;
  complainantRelationType?: RelativeRelation | string;
  complainantRelativeName?: string;
  complainantRelativeAlias?: string;
  complainantRelativeAliasName?: string;
  complainantSameAsVictim?: boolean;
  complainantAge?: number;
  complainantDob?: string;
  complainantYearOfBirth?: string;
  complainantAgeGroup?: string;
  complainantNationality?: string;
  complainantOccupation?: string;
  complainantIdentifications?: FIRIdentificationEntry[];
  complainantPassportNumber?: string;
  complainantPassportDateOfIssue?: string;
  complainantPassportPlaceOfIssue?: string;
  complainantPassportIssueDate?: string;
  complainantPassportIssuePlace?: string;
  // Complainant Address
  complainantPermanentHouseNo?: string;
  complainantPermanentStreet?: string;
  complainantPermanentColony?: string;
  complainantPermanentVillageCity?: string;
  complainantPermanentTehsil?: string;
  complainantPermanentCountry?: string;
  complainantPermanentState?: string;
  complainantPermanentDistrict?: string;
  complainantPermanentPoliceStation?: string;
  complainantPermanentPincode?: string;
  complainantHouseNo?: string;
  complainantStreet?: string;
  complainantColony?: string;
  complainantTehsil?: string;
  complainantPincode?: string;
  isPermanentSameAsPresent?: boolean;
  complainantPresentAddressSame?: boolean;
  complainantPresentAddress?: string;
  complainantPresentHouseNo?: string;
  complainantPresentStreet?: string;
  complainantPresentColony?: string;
  complainantPresentVillageCity?: string;
  complainantPresentTehsil?: string;
  complainantPresentCountry?: string;
  complainantPresentState?: string;
  complainantPresentDistrict?: string;
  complainantPresentPoliceStation?: string;
  complainantPresentPincode?: string;
  // Legacy address fields
  complainantAddress: string;
  complainantCity: string;
  complainantDistrict: string;
  complainantState?: string;
  complainantCountry?: string;
  complainantFatherSpouse?: string;
  complainantAltPhone?: string;
  complainantPermanentAddress?: string;
  complainantPermanentCity?: string;
  additionalComplainants?: ComplainantPerson[];

  // Tab 4: FIR Content
  incidentDetails: string; // Full FIR Contents
  firContentText?: string;
  briefFacts?: string;
  delayReason?: string;
  reasonsForDelay?: string;

  // Tab 5: Action Taken
  keepSecretOrInvisible?: boolean;
  actionTakenData?: FIRActionTakenData;
  departmentsList?: FIRDepartmentEntry[];
  departmentNotifications?: FIRDepartmentEntry[];
  uidbEntries?: FIRUidbEntry[];
  inquestReportNo?: string;
  courtDispatchDateTime?: string;

  // Tab 6: Victim Information
  victimType?: string;
  victimsList?: any[];

  // Tab 7: Accused
  accusedTypeSelected?: 'Known' | 'Unknown / Seen';
  isAccusedKnown?: boolean;
  accusedList: AccusedPerson[];

  // Tab 8: Property of Interest
  propertiesList?: FIRPropertyItem[];
  totalPropertyEstimatedValue?: number;
  stolenPropertyDetails?: string;

  // Tab 9: Hurt Case Detail
  hurtDetails?: FIRHurtDetails;

  // Tab 10: Signature
  signatureData?: FIRSignatureData;

  // Tab 11: Tag FIR
  firTagType?: string;

  // Assignment & Investigation Officer (IO)
  registeredBy: string;
  assignedIoId?: string;
  assignedIoName?: string;
  assignedIoRank?: string;
  assignedIoPno?: string;
  assignedIoBeltNumber?: string;
  assignedIoPhone?: string;
  assignedAt?: string;
  assignedDirections?: string;
  targetResolutionDate?: string;
  daysPending: number;

  // Evidence Attachments & Case Diary / Documents
  attachments?: ComplaintEvidenceAttachment[];
  caseDiaries?: FIRCaseDiaryItem[];
  documents?: FIRDocumentItem[];
  timeline?: FIRTimelineEvent[];
  confidentialDossier?: ConfidentialDossierItem[];
  reports?: ComplaintReportItem[];

  // Legal Analysis & Case Summary
  legalAnalysis?: LegalAnalysisReport;
  investigationSummary?: InvestigationSummaryReport;

  // CCTNS Crime Detail Form (IIF-II)
  crimeDetailsFilled?: boolean;
  crimeDetailsData?: any;
  crimeDetailsFilledAt?: string;
  crimeDetailsFilledBy?: string;

  // SHO & Supervisory Review
  shoDecision?: 'APPROVE' | 'RE_INVESTIGATION' | 'REJECT';
  shoDecisionAt?: string;
  shoDecisionBy?: string;
  shoRemarks?: string;
  shoActionRequired?: boolean;

  // Final Form Disposal (Section 193 BNSS)
  finalFormType?: 'CHARGESHEET' | 'CLOSURE' | 'UNTRACED' | 'CANCELLED';
  finalFormNumber?: string;
  finalFormDate?: string;
  courtName?: string;
  finalFormSummary?: string;
  // Court Order & Further Assignment
  courtOrderNumber?: string;
  courtOrderDate?: string;
  courtOrderDocumentUrl?: string;
  courtOrderDocumentName?: string;

  // Inter-State Transfer (Statutory Jurisdiction / Zero FIR Transfer)
  isTransferred?: boolean;
  transferType?: "INTER_STATE";
  transferredToState?: string;
  transferredToDistrict?: string;
  transferredToPoliceStation?: string;
  transferredAt?: string;
  transferredBy?: string;
  transferReason?: string;
  transferStatutoryGround?: string;
  transferOrderNumber?: string;
  transferOrderDate?: string;
  transferRecord?: FIRTransferRecord;
  transferHistory?: FIRTransferRecord[];

  // Zero FIR Transferred-In metadata
  isZeroFirTransferIn?: boolean;
  originalZeroFirNumber?: string;
  originalZeroFirPs?: string;
  originalZeroFirDistrict?: string;
  originalZeroFirDate?: string;

  // Reciprocal FIR Linking & Duplicate Tagging
  isDuplicate?: boolean;
  isCrossFir?: boolean;
  linkedFirsList?: LinkedFIREntry[];

  // Authoritative Tracking Workflow State
  trackingState?: FIRTrackingState;
  challanRecords?: FIRChallanRecord[];
  pendingChallanId?: string;
  reopenHistory?: FIRReopenEvent[];
  completionHistory?: FIRCompletionEvent[];
  previouslyReopened?: boolean;
  completionReason?: string;
  auditTrail?: FIRAuditRecord[];
  createdAt: string;
  updatedAt: string;
}

export function getMainFIRStatus(fir: {
  assignedIoId?: string;
  assignedIoName?: string;
  status?: string;
  finalFormType?: string;
}): MainFIRStatus {
  if (fir.finalFormType === 'CHARGESHEET' || fir.status === 'CHARGESHEET_FILED') {
    return 'Chargesheet Filed';
  }
  if (fir.finalFormType === 'CLOSURE' || fir.status === 'CLOSURE_REPORT_FILED') {
    return 'Closure Filed';
  }
  if (fir.finalFormType === 'UNTRACED' || fir.status === 'UNTRACED') {
    return 'Untraced';
  }
  if (fir.finalFormType === 'CANCELLED' || fir.status === 'CANCELLED') {
    return 'Cancelled';
  }
  const hasIo = Boolean(
    (fir.assignedIoId && fir.assignedIoId.trim().length > 0) ||
    (fir.assignedIoName && fir.assignedIoName.trim().length > 0)
  );
  if (!hasIo) {
    return 'Not Assigned';
  }
  return 'Under Investigation';
}

export * from "./evidence";
