"use client";

import { isMhcOrMmRole } from "@/lib/officerRoles";
import { useLanguage } from "@/context/LanguageContext";
import { FinalReportShoReview } from "@/components/fir/FinalReportShoReview";
import { FinalReportSoReview } from "@/components/fir/FinalReportSoReview";
import { SendReportToSoModal, type SupervisoryStatusOption } from "@/components/complaints/SendReportToSoModal";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { writeCaseDraft } from "@/lib/caseWritingClient";
import { escapeDraftText } from "@/utils/documentHtmlGenerators";
import { useParams, useSearchParams } from "next/navigation";
import { useGuardedRouter as useRouter } from "@/hooks/useGuardedRouter";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  UserCheck,
  Calendar,
  Clock,
  Phone,
  MapPin,
  User,
  Paperclip,
  FileText,
  Plus,
  Send,
  CheckCircle,
  CheckCircle2,
  Check,
  AlertTriangle,
  Printer,
  Sparkles,
  Link2,
  History as HistoryIcon,
  Scale,
  X,
  UploadCloud,
  Eye,
  RefreshCw,
  Lock,
  Trash2,
  Download,
  Edit3,
  ShieldAlert,
  ShieldCheck,
  Database,
  Archive,
  ArrowRight,
  ScrollText,
  ChevronDown,
  FileCheck2,
  Copy,
  TrendingUp,
  BookOpen,
  ArrowRightLeft,
  Globe2,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { persistentFirService as firService } from "@/services/persistentFirService";
import { isFirVisibleToUser, getAuthoritativeTrackingState } from "@/lib/firIntegrity";
import { GeneralDiaryService } from "@/services/generalDiaryService";
import { ComplaintService } from "@/services/complaintService";
import { universalEvidenceService } from "@/services/universalEvidenceService";
import { evidenceBlobStore } from "@/services/evidenceBlobStore";
import { CaseEvidenceDataModal } from "@/components/evidence/CaseEvidenceDataModal";
import { UniversalEvidenceRecord } from "@/types/evidence";
import {
  FIRItem,
  FIRCaseDiaryItem,
  FIRDocumentItem,
  ComplaintReportItem,
  FIRTimelineEvent,
  ConfidentialDossierItem,
} from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/ui/badge";
import { LoadingSkeleton } from "@/components/ui/state-views";
import { useFirIoRoster } from "@/hooks/useFirIoRoster";
import { formatDate, getTodayIsoIST } from "@/lib/utils";
import { DatePickerDDMMYYYY } from "@/components/ui/date-picker-ddmmyyyy";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { printHtmlContent, downloadA4DocumentAsHtml } from "@/utils/printElement";
import { generateIIFVChargesheetHtmlFromFir } from "@/utils/iifvChargesheetGenerator";
import { FIRReceiptModal } from "@/components/fir/FIRReceiptModal";
import { FIRSummaryTab } from "@/components/fir/FIRSummaryTab";
import { FIRCaseAnalysisPanel } from "@/components/fir/FIRCaseAnalysisPanel";
import { FIRLegalAssistant } from "@/components/fir/FIRLegalAssistant";
import { CrimeDetailModal } from "@/components/fir/CrimeDetailModal";
import { finalReportClient, type FinalReportHistoryEvent } from "@/services/finalReportClient";
import { CctnsFinalReportModal } from "@/components/fir/CctnsFinalReportModal";
import { ModifyActsModal } from "@/components/fir/ModifyActsModal";

type ActiveTab =
  | "knowledge_graph"
  | "case_contradictions"
  | "overview"
  | "case_diaries"
  | "documents"
  | "legal_assistant"
  | "summary"
  | "reports"
  | "history"
  | "confidential_dossier";

const VALID_FIR_TABS: readonly ActiveTab[] = [
  "knowledge_graph",
  "case_contradictions",
  "overview",
  "case_diaries",
  "documents",
  "legal_assistant",
  "summary",
  "reports",
  "history",
  "confidential_dossier",
];

function normalizeFirTab(raw: string | null): ActiveTab {
  if (!raw) return "overview";
  const cleaned = raw.trim().toLowerCase() as ActiveTab;
  return VALID_FIR_TABS.includes(cleaned) ? cleaned : "overview";
}

const FIR_DOC_TEMPLATES = [
  {
    key: "notice_35_3",
    label: "1. Notice of Appearance (Sec 35(3) BNSS)",
    desc: "Mandatory statutory appearance notice to accused with non-arrest assurance",
    icon: FileText,
  },
  {
    key: "summons_179",
    label: "2. Witness Summons (Sec 179 BNSS)",
    desc: "Order requiring attendance of witnesses acquainted with circumstances of case",
    icon: ScrollText,
  },
  {
    key: "site_plan",
    label: "3. Site Plan / Naksha Mauka (मौका नक्शा)",
    desc: "Detailed inspection sketch with physical boundaries, north pointer and points of interest",
    icon: MapPin,
  },
  {
    key: "seizure_memo",
    label: "4. Seizure Memo / Fard Zabti (फ़र्द जब्ती)",
    desc: "Recovery & seizure memo of weapons, contraband, or stolen property with punch witnesses",
    icon: Shield,
  },
  {
    key: "zimni_extract",
    label: "5. Case Diary Zimni Extract (Sec 175 BNSS)",
    desc: "Official daily docket extract of investigation actions certified by IO",
    icon: BookOpen,
  },
];

const FIR_REPORT_OPTIONS = [
  {
    key: "CHARGESHEET",
    label: "1. Final Report / Chargesheet (दोषारोप पत्र)",
    desc: "Police Report u/s 193 BNSS with prima facie evidence for trial",
    icon: Scale,
    badgeBg: "bg-red-50 text-red-800 border-red-300",
  },
  {
    key: "CLOSURE",
    label: "2. Closure Report / Cancellation (खारिजी रिपोर्ट)",
    desc: "Grounds for closure due to lack of evidence, mistake of fact, or compromise",
    icon: FileText,
    badgeBg: "bg-amber-50 text-amber-800 border-amber-300",
  },
  {
    key: "UNTRACED",
    label: "3. Untraced Report (अदम सुराग)",
    desc: "Investigation report when culprits/stolen property remain untraced",
    icon: ShieldAlert,
    badgeBg: "bg-blue-50 text-blue-800 border-blue-300",
  },
  {
    key: "PROGRESS",
    label: "4. Supervisory Progress Report (केस प्रगति रिपोर्ट)",
    desc: "Periodic progress submission for SHO / DSP / SP review",
    icon: Sparkles,
    badgeBg: "bg-purple-50 text-purple-800 border-purple-300",
  },
  {
    key: "ABATED",
    label: "5. Abated Final Report (अभियुक्त की मृत्यु)",
    desc: "Proceedings abated due to demise of sole accused person",
    icon: CheckCircle2,
    badgeBg: "bg-slate-50 text-slate-800 border-slate-300",
  },
];

// FIR profile keeps its own report statuses; no complaint-only options here.
const FIR_SO_STATUS_OPTIONS: SupervisoryStatusOption[] = FIR_REPORT_OPTIONS.map((option) => ({
  value: option.key,
  label: option.label,
  description: option.desc,
}));

import { BailDetailsModal } from '@/components/fir/BailDetailsModal';

export default function FIRProfilePage() {
  const { t } = useLanguage();
  const params = useParams();
  const router = useRouter();
  const firId = params?.id as string;
  const { currentUser } = useAuth();

  const searchParams = useSearchParams();
  const [fir, setFir] = useState<FIRItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => normalizeFirTab(searchParams.get("tab")));

  useEffect(() => {
    const paramTab = searchParams.get("tab");
    if (paramTab) {
      setActiveTab(normalizeFirTab(paramTab));
    }
  }, [searchParams]);

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    const idForUrl = fir?.id || firId;
    if (idForUrl) {
      router.replace(`/fir/${idForUrl}?tab=${tab}`, { scroll: false });
    }
  };

  // Statutory Receipt Modal
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isBailOpen, setIsBailOpen] = useState(false);

  // Modify Acts Modal
  const [isModifyActsModalOpen, setIsModifyActsModalOpen] = useState(false);

  // Crime Details Form (IIF-II) Modal
  const [isCrimeDetailsOpen, setIsCrimeDetailsOpen] = useState(false);

  // IO Assignment Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedIoId, setSelectedIoId] = useState("");
  const { officers: ioRoster, loading: ioRosterLoading, error: ioRosterError } = useFirIoRoster(fir?.policeStation, fir?.district, currentUser.role === "SHO");
  const [assignedDirections, setAssignmentDirections] = useState("");
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);

  // Upload Case Diary (Zimni) Modal
  const [isUploadZimniModalOpen, setIsUploadZimniModalOpen] = useState(false);
  const [uploadZimniTitle, setUploadZimniTitle] = useState("");
  const [uploadZimniDate, setUploadZimniDate] = useState(() => getTodayIsoIST());
  const [uploadZimniTime, setUploadZimniTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [uploadZimniOfficer, setUploadZimniOfficer] = useState("");
  const [uploadZimniRemarks, setUploadZimniRemarks] = useState("");
  const [uploadZimniFileName, setUploadZimniFileName] = useState("");
  const [uploadZimniFileDataUrl, setUploadZimniFileDataUrl] = useState("");
  const [uploadZimniFileSize, setUploadZimniFileSize] = useState("");
  const [uploadZimniSubmitting, setUploadZimniSubmitting] = useState(false);

  // Case Diary (Zimni) Preview State
  const [caseDiaryPreviewItem, setCaseDiaryPreviewItem] = useState<FIRCaseDiaryItem | null>(null);
  const [caseDiaryPreviewUrl, setCaseDiaryPreviewUrl] = useState<string>("");

  // Add Document Modal
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docCategory, setDocCategory] = useState("FIELD_REPORT");
  const [docFileName, setDocFileName] = useState("");
  const [docFileDataUrl, setDocFileDataUrl] = useState("");
  const [docFileSize, setDocFileSize] = useState("");
  const [retryingEvidenceIds, setRetryingEvidenceIds] = useState<Set<string>>(new Set());

  const handleRetryEvidence = async (evId: string) => {
    if (!evId) return;
    setRetryingEvidenceIds((prev) => new Set(prev).add(evId));
    try {
      await universalEvidenceService.retryProcessing(evId, currentUser?.name || "Officer");
    } catch (err: any) {
      alert("Retry failed: " + (err?.message || "Failed to reprocess evidence"));
    } finally {
      setRetryingEvidenceIds((prev) => {
        const next = new Set(prev);
        next.delete(evId);
        return next;
      });
      if (firId) {
        universalEvidenceService.syncFromServer(firId);
      }
    }
  };

  // Header action dropdown states (Print, Crime Details, Arrest Docs)
  const [headerActionsDropdownOpen, setHeaderActionsDropdownOpen] = useState(false);
  const headerActionsDropdownRef = useRef<HTMLDivElement | null>(null);

  // Document actions states
  const [generateDocDropdownOpen, setGenerateDocDropdownOpen] = useState(false);
  const generateDocDropdownRef = useRef<HTMLDivElement | null>(null);
  const [docPreviewItem, setDocPreviewItem] = useState<FIRDocumentItem | null>(null);

  // Report actions states
  const [generateReportDropdownOpen, setGenerateReportDropdownOpen] = useState(false);
  const generateReportDropdownRef = useRef<HTMLDivElement | null>(null);
  const [uploadReportModalOpen, setUploadReportModalOpen] = useState(false);
  const [sendToSoModalOpen, setSendToSoModalOpen] = useState(false);
  const [selectedReportForSo, setSelectedReportForSo] = useState<ComplaintReportItem | null>(null);
  const [sendingReportToSo, setSendingReportToSo] = useState(false);
  const [reviewPreviewLoaded, setReviewPreviewLoaded] = useState(false);
  const [reportPreviewItem, setReportPreviewItem] = useState<ComplaintReportItem | null>(null);
  const [reportDraftModalOpen, setReportDraftModalOpen] = useState(false);
  const [activeDraftReport, setActiveDraftReport] = useState<ComplaintReportItem | null>(null);
  const [reportDraftTitle, setReportDraftTitle] = useState("");
  const [reportDraftType, setReportDraftType] = useState<string>("CHARGESHEET");
  const [reportDraftDispatchNo, setReportDraftDispatchNo] = useState("");
  const [reportDraftContent, setReportDraftContent] = useState("");
  const [uploadReportTitle, setUploadReportTitle] = useState("");
  const [uploadReportType, setUploadReportType] = useState("CHARGESHEET");
  const [uploadReportDispatch, setUploadReportDispatch] = useState("");
  const [uploadReportRemarks, setUploadReportRemarks] = useState("");
  const [uploadReportOutcome, setUploadReportOutcome] = useState("Complete");

  // Final Form (Chargesheet/Closure) Modal
  const [isFinalFormModalOpen, setIsFinalFormModalOpen] = useState(false);
  const [isFinalReportModalOpen, setIsFinalReportModalOpen] = useState(false);
  const [backendReports, setBackendReports] = useState<ComplaintReportItem[]>([]);
  const [reportHistory, setReportHistory] = useState<FinalReportHistoryEvent[]>([]);
  const openedReportLink = useRef("");
  const [linkedReportNotice, setLinkedReportNotice] = useState<{ message: string; report?: ComplaintReportItem }>();
  const [reportBackendError, setReportBackendError] = useState("");
  const [reportRefresh, setReportRefresh] = useState(0);
  const [editingFinalReport, setEditingFinalReport] = useState<ComplaintReportItem | undefined>();
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenReasonText, setReopenReasonText] = useState("");
  const [reopenCourt, setReopenCourt] = useState(() => `Chief Judicial Magistrate (CJM), ${currentUser?.district || "Panipat"}`);
  const [reopenOrderNo, setReopenOrderNo] = useState("");
  const [reopenOrderDt, setReopenOrderDt] = useState(() => getTodayIsoIST());
  const [reopenConfirmedDetail, setReopenConfirmedDetail] = useState(false);
  const [isSubmittingReopenDetail, setIsSubmittingReopenDetail] = useState(false);
  const [finalFormType, setFinalFormType] = useState<"CHARGESHEET" | "CLOSURE" | "UNTRACED">("CHARGESHEET");
  const [courtName, setCourtName] = useState(() => `Court of CJM, ${currentUser?.district || "Panipat"}`);
  const [finalFormSummary, setFinalFormSummary] = useState("");
  const [finalFormSubmitting, setFinalFormSubmitting] = useState(false);

  useEscapeKey(Boolean(caseDiaryPreviewItem), () => { setCaseDiaryPreviewItem(null); setCaseDiaryPreviewUrl(""); });
  useEscapeKey(reportDraftModalOpen, () => setReportDraftModalOpen(false));
  useEscapeKey(uploadReportModalOpen, () => setUploadReportModalOpen(false));
  useEscapeKey(sendToSoModalOpen && !sendingReportToSo, () => setSendToSoModalOpen(false));
  useEscapeKey(Boolean(reportPreviewItem), () => setReportPreviewItem(null));
  useEscapeKey(Boolean(docPreviewItem), () => setDocPreviewItem(null));
  useEscapeKey(isFinalFormModalOpen, () => setIsFinalFormModalOpen(false));
  useEscapeKey(isDocModalOpen, () => setIsDocModalOpen(false));
  useEscapeKey(isUploadZimniModalOpen, () => setIsUploadZimniModalOpen(false));
  useEscapeKey(isAssignModalOpen, () => setIsAssignModalOpen(false));
  useEscapeKey(isReopenModalOpen, () => setIsReopenModalOpen(false));
  useEscapeKey(headerActionsDropdownOpen, () => setHeaderActionsDropdownOpen(false));
  useEscapeKey(generateDocDropdownOpen, () => setGenerateDocDropdownOpen(false));
  useEscapeKey(generateReportDropdownOpen, () => setGenerateReportDropdownOpen(false));

  const isMhc = isMhcOrMmRole(currentUser.role);
  const isSuperior =
    currentUser.role === "DSP_SUBDIV" ||
    currentUser.role === "SP_DISTRICT" ||
    currentUser.role === "SUPER_ADMIN";
  const isSho = (currentUser.role === "SHO" || currentUser.id === "usr_sho_1") && !isMhc;
  const isShoOrAbove = (isSho || isSuperior) && !isMhc;

  const handleDetailReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fir) return;
    if (!reopenReasonText.trim()) {
      alert("Statutory Requirement: Reason for reopening the case is mandatory.");
      return;
    }
    if (!reopenConfirmedDetail) {
      alert("Please confirm the reopening declaration before proceeding.");
      return;
    }
    setIsSubmittingReopenDetail(true);
    try {
      const updated = await firService.reopenCompletedCase({
        firId: fir.id,
        reopenedBy: currentUser?.name || "Competent Authority",
        reopenedByRank: currentUser?.role || "Authorized Officer",
        reason: reopenReasonText.trim(),
        orderNumber: reopenOrderNo.trim() || undefined,
        orderDate: reopenOrderDt || undefined,
        courtName: reopenCourt.trim() || undefined,
      });
      if (updated) {
        setIsReopenModalOpen(false);
        setFir(updated);
        alert(`Case ${updated.firNumber} moved to 'FIR Part B → Re-open' workspace.`);
        router.push("/fir/part-b?tab=REOPEN");
      }
    } catch (err: any) {
      alert(`Error: ${err.message || "Unable to reopen case."}`);
    } finally {
      setIsSubmittingReopenDetail(false);
    }
  };

  const isIo = currentUser.role === "ENQUIRY_OFFICER" || (!isSho && !isMhc && !isSuperior);

  const isCrimeDetailsFilled = Boolean(
    fir?.crimeDetailsFilled ||
    (fir as any)?.crimeDetailsData ||
    (typeof window !== "undefined" && Boolean(window.localStorage?.getItem(`haryana_police_cms_fir_crimedetails_${firId}`))) ||
    fir?.documents?.some(
      (d) =>
        d.title.toLowerCase().includes("crime detail") ||
        d.title.includes("IIF-II") ||
        d.title.includes("अपराध विवरण") ||
        d.category === "CCTNS_IIF2"
    )
  );

  const fetchFir = () => {
    if (!firId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const item = firService.getFirById(firId);
      if (item && isFirVisibleToUser(currentUser, item)) {
        // Rehydrate dedicated crimeDetailsData if missing on the item
        if (!item.crimeDetailsData && typeof window !== "undefined" && window.localStorage) {
          try {
            const raw = window.localStorage.getItem(`haryana_police_cms_fir_crimedetails_${firId}`);
            if (raw) {
              const parsedCrime = JSON.parse(raw);
              item.crimeDetailsData = parsedCrime;
              item.crimeDetailsFilled = true;
              if (
                !item.documents?.some(
                  (d) => d.category === "CCTNS_IIF2" || d.title.includes("IIF-II") || d.title.includes("Crime Detail")
                )
              ) {
                const crimeDoc: FIRDocumentItem = {
                  id: `doc-crime-detail-${item.id}`,
                  title: `Crime Detail Form (IIF-II) / अपराध विवरण प्रपत्र - ${item.cctnsFirNumber || item.firNumber}`,
                  fileName: `Crime_Detail_IIF_II_${item.firNumber.replace(/[\/\s]/g, "_")}.html`,
                  category: "CCTNS_IIF2",
                  uploadedBy: parsedCrime.submittedBy || "Investigating Officer",
                  uploadedAt: parsedCrime.submittedAt?.replace("T", " ").slice(0, 16) || new Date().toISOString().replace("T", " ").slice(0, 16),
                  fileSize: "68.5 KB",
                };
                item.documents = [crimeDoc, ...(item.documents || [])];
              }
            }
          } catch (_) {}
        }
        setFir(item);
        setSelectedIoId(item.assignedIoId || "");
        setAssignmentDirections(item.assignedDirections || "");
        if (item.district) {
          setReopenCourt((prev) => (prev.includes("Panipat") || !prev ? `Chief Judicial Magistrate (CJM), ${item.district}` : prev));
          setCourtName((prev) => (prev.includes("Gurugram") || prev.includes("Panipat") || !prev ? `Court of CJM, ${item.district}` : prev));
        }
      } else {
        setFir(null);
      }
    } catch (e) {
      console.error("Error loading FIR:", e);
      setLoadError(e instanceof Error ? e.message : "Failed to load FIR details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFir();
    const unsub = firService.subscribe(() => {
      fetchFir();
    });
    return unsub;
  }, [firId, currentUser]);

  useEffect(() => {
    let cancelled = false;
    setReportBackendError("");
    const accessible = firService.getFirById(firId);
    setBackendReports([]); setReportHistory([]);
    if (!accessible || !isFirVisibleToUser(currentUser, accessible)) return;
    finalReportClient.list(firId).then(result => {
      if (cancelled) return;
      setBackendReports(result.reports);
      setReportHistory(result.history);
      const query = new URLSearchParams(window.location.search);
      const reportId = query.get("reportId");
      const revision = query.get("reportVersion");
      const linkKey = JSON.stringify([currentUser.id, firId, reportId, revision]);
      if (!reportId || openedReportLink.current === linkKey) return;
      openedReportLink.current = linkKey;
      setActiveTab("reports");
      const report = result.reports.find(item => item.id === reportId);
      if (!report) {
        setLinkedReportNotice({ message: "This report is no longer available." });
      } else if (revision && String(report.versionNumber) !== revision) {
        setLinkedReportNotice({ message: "A newer revision is available for this report.", report });
      } else {
        setLinkedReportNotice(undefined);
        setReviewPreviewLoaded(false);
        setReportPreviewItem(report);
      }
    }).catch(error => { if (!cancelled) setReportBackendError(error.message); });
    return () => { cancelled = true; };
  }, [firId, reportRefresh, currentUser]);

  // Support direct URL query param ?openCrimeDetails=true
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("openCrimeDetails") === "true") {
        setIsCrimeDetailsOpen(true);
      }
    }
  }, []);

  const [selectedEvidenceRecord, setSelectedEvidenceRecord] = useState<UniversalEvidenceRecord | null>(null);
  const [evidenceRefreshTrigger, setEvidenceRefreshTrigger] = useState(0);

  // Sync universal evidence records and telecom evidence documents from server on mount
  const [telecomDocs, setTelecomDocs] = useState<any[]>([]);
  useEffect(() => {
    universalEvidenceService.syncFromServer(firId).then(() => {
      setEvidenceRefreshTrigger((c) => c + 1);
    });

    fetch("/api/telecom?firId=" + encodeURIComponent(firId))
      .then((r) => r.json())
      .then((data) => {
        if (data.files && Array.isArray(data.files)) {
          setTelecomDocs(data.files);
        }
      })
      .catch((e) => console.warn("Failed to fetch telecom docs for FIR profile:", e));
  }, [firId]);

  // Combine all documents: fir.documents + linked universalEvidenceService records + origin complaint documents
  const combinedFirDocuments: (FIRDocumentItem & { originSource?: string; evidenceRecord?: UniversalEvidenceRecord })[] = useMemo(() => {
    if (!fir) return [];
    const list: (FIRDocumentItem & { originSource?: string; evidenceRecord?: UniversalEvidenceRecord })[] = [
      ...(fir.documents || []).map((d) => ({ ...d, originSource: "FIR Investigation" })),
    ];
    const existingNames = new Set(list.map((d) => (d.fileName || "").toLowerCase().trim()));
    const existingIds = new Set(list.map((d) => d.id));

    // 1. Evidence records from universalEvidenceService linked to this FIR
    const allEvidence = universalEvidenceService.getAll();
    const linkedEvidence = allEvidence.filter(
      (r) =>
        (r.caseNumber && fir.firNumber && r.caseNumber.toLowerCase() === fir.firNumber.toLowerCase()) ||
        (r.caseId && r.caseId === fir.id) ||
        (fir.sourceComplaintNumber && r.caseNumber && r.caseNumber.toLowerCase() === fir.sourceComplaintNumber.toLowerCase()) ||
        (fir.sourceComplaintId && r.caseId && r.caseId === fir.sourceComplaintId)
    );

    linkedEvidence.forEach((ev) => {
      const key = (ev.rawDocument?.fileName || "").toLowerCase().trim();
      const recId = ev.fileId || ev.id;
      if (!existingNames.has(key) && !existingIds.has(recId) && !existingIds.has(ev.id)) {
        list.push({
          id: recId,
          firId: fir.id,
          title: ev.structuredData?.classifiedDocumentName || ev.rawDocument?.fileName || "Authoritative Case Evidence",
          fileName: ev.rawDocument?.fileName || "evidence.pdf",
          category: (ev.structuredData?.documentCategory || "OFFICIAL EVIDENCE").toUpperCase(),
          uploadedBy: ev.rawDocument?.uploadedBy || "Intake Officer",
          uploadedAt: ev.rawDocument?.uploadedAt ? ev.rawDocument.uploadedAt.replace("T", " ").slice(0, 16) : fir.firDate,
          fileSize: ev.rawDocument?.fileSize ? `${(ev.rawDocument.fileSize / 1024).toFixed(1)} KB` : "10 KB",
          dataUrl: ev.rawDocument?.dataUrl,
          fileUrl: ev.rawDocument?.fileUrl || `/api/evidence/download?id=${ev.id}&type=original`,
          originSource: ev.caseNumber === fir.sourceComplaintNumber ? `Complaint #${fir.sourceComplaintNumber}` : "Universal Evidence Store",
          evidenceRecord: ev,
        });
        existingNames.add(key);
        existingIds.add(recId);
      }
    });

    // 2. Documents & attachments from source complaint if connected
    if (fir.sourceComplaintId || fir.sourceComplaintNumber) {
      const sourceComp =
        (fir.sourceComplaintId ? ComplaintService.getById(fir.sourceComplaintId) : null) ||
        (fir.sourceComplaintNumber ? ComplaintService.getByComplaintNumber(fir.sourceComplaintNumber) : null);

      if (sourceComp) {
        (sourceComp.documents || []).forEach((cDoc: any) => {
          const key = (cDoc.fileName || "").toLowerCase().trim();
          if (!existingNames.has(key) && !existingIds.has(cDoc.id)) {
            list.push({
              id: cDoc.id,
              firId: fir.id,
              title: cDoc.fileName,
              fileName: cDoc.fileName,
              category: `ORIGIN COMPLAINT: ${cDoc.fileCategory || "DOCUMENT"}`,
              uploadedBy: cDoc.uploadedBy || sourceComp.registeredBy || "Intake Officer",
              uploadedAt: cDoc.uploadedAt ? cDoc.uploadedAt.replace("T", " ").slice(0, 16) : fir.firDate,
              fileSize: cDoc.fileSize || "10 KB",
              dataUrl: cDoc.dataUrl,
              fileUrl: cDoc.fileUrl,
              originSource: `Complaint #${sourceComp.complaintNumber}`,
            });
            existingNames.add(key);
            existingIds.add(cDoc.id);
          }
        });

        (sourceComp.attachments || []).forEach((att: any) => {
          const key = (att.name || "").toLowerCase().trim();
          if (!existingNames.has(key) && !existingIds.has(att.id)) {
            list.push({
              id: `att_${att.id}`,
              firId: fir.id,
              title: att.name,
              fileName: att.name,
              category: `ORIGIN EVIDENCE: ${att.category.toUpperCase()}`,
              uploadedBy: sourceComp.registeredBy || "Intake Officer",
              uploadedAt: att.uploadedAt ? att.uploadedAt.replace("T", " ").slice(0, 16) : fir.firDate,
              fileSize: typeof att.size === "number" ? `${(att.size / 1024).toFixed(1)} KB` : String(att.size || "10 KB"),
              dataUrl: att.dataUrl,
              fileUrl: att.dataUrl,
              originSource: `Complaint #${sourceComp.complaintNumber}`,
            });
            existingNames.add(key);
            existingIds.add(att.id);
          }
        });
      }
    }

    // 3. Documents from Telecom Evidence & Forensic Docket
    if (telecomDocs && telecomDocs.length > 0) {
      telecomDocs.forEach((tDoc) => {
        const key = (tDoc.originalFilename || "").toLowerCase().trim();
        if (!existingNames.has(key) && !existingIds.has(tDoc.id)) {
          list.push({
            id: tDoc.id,
            firId: fir.id,
            title: "[Telecom " + tDoc.category + "] " + tDoc.originalFilename,
            fileName: tDoc.originalFilename,
            category: "TELECOM EVIDENCE: " + tDoc.category,
            uploadedBy: tDoc.uploadedBy || "Telecom Nodal Officer",
            uploadedAt: tDoc.uploadedAt ? tDoc.uploadedAt.replace("T", " ").slice(0, 16) : fir.firDate,
            fileSize: tDoc.fileSizeBytes ? ((tDoc.fileSizeBytes / 1024).toFixed(1) + " KB") : "42 KB",
            dataUrl: tDoc.dataUrl,
            fileUrl: tDoc.dataUrl || ("/api/telecom?action=download&id=" + tDoc.id),
            originSource: "Telecom Forensic Docket (" + (tDoc.operator || "Operator") + ")",
          });
          existingNames.add(key);
          existingIds.add(tDoc.id);
        }
      });
    }

    return list;
  }, [fir, evidenceRefreshTrigger, telecomDocs]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        generateDocDropdownRef.current &&
        !generateDocDropdownRef.current.contains(e.target as Node)
      ) {
        setGenerateDocDropdownOpen(false);
      }
      if (
        generateReportDropdownRef.current &&
        !generateReportDropdownRef.current.contains(e.target as Node)
      ) {
        setGenerateReportDropdownOpen(false);
      }
      if (
        headerActionsDropdownRef.current &&
        !headerActionsDropdownRef.current.contains(e.target as Node)
      ) {
        setHeaderActionsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleConfirmAssign = async () => {
    if (!isSho) {
      alert("Access Denied: Investigating Officer must be assigned by SHO only (PPR Rule 22.48).");
      return;
    }
    if (!fir || !selectedIoId) return;
    const selectedOfficer = ioRoster.find((eo) => eo.id === selectedIoId);
    if (!selectedOfficer) return;

    setAssignmentSubmitting(true);
    try {
      await firService.assignIo(
        fir.id,
        selectedOfficer.id,
        selectedOfficer.name,
        selectedOfficer.rank,
        assignedDirections,
        currentUser.name,
        selectedOfficer
      );
      setIsAssignModalOpen(false);
      fetchFir();
    } catch (err) {
      console.error("Failed to assign IO:", err);
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  const handleZimniFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadZimniFileName(file.name);
      setUploadZimniFileSize(`${(file.size / 1024).toFixed(1)} KB`);
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        setUploadZimniFileDataUrl(loadEvt.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadZimniSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fir || !uploadZimniTitle.trim()) return;

    setUploadZimniSubmitting(true);
    try {
      const nextNum = (fir.caseDiaries?.length || 0) + 1;
      const note: FIRCaseDiaryItem = {
        id: `cd-${Date.now()}`,
        firId: fir.id,
        zimniNumber: nextNum,
        date: uploadZimniDate || getTodayIsoIST(),
        time: uploadZimniTime || new Date().toTimeString().slice(0, 5),
        officer: uploadZimniOfficer || fir.assignedIoName || currentUser.name || "Investigating Officer",
        officerRole: "INVESTIGATING_OFFICER",
        summary: uploadZimniTitle.trim(),
        details: uploadZimniRemarks.trim() || `Uploaded signed Zimni document (${uploadZimniFileName || "Scanned Zimni"}).`,
        isAutoGenerated: false,
        fileName: uploadZimniFileName || undefined,
        fileUrl: uploadZimniFileDataUrl || undefined,
        isUploaded: true,
      };

      await firService.addCaseDiary(fir.id, note);
      await firService.addAuditRecord(
        fir.id,
        "CASE_DIARY_RECORDED",
        `Uploaded Zimni: ${uploadZimniTitle}`,
        currentUser.name
      );

      // Also attach to documents docket if file was selected
      if (uploadZimniFileDataUrl) {
        const docId = `doc-zimni-${Date.now()}`;
        const newDoc: FIRDocumentItem = {
          id: docId,
          firId: fir.id,
          title: uploadZimniTitle.trim(),
          fileName: uploadZimniFileName || `zimni_${nextNum}.pdf`,
          category: "FIELD_REPORT",
          uploadedBy: uploadZimniOfficer || currentUser.name || "IO",
          uploadedAt: `${uploadZimniDate} ${uploadZimniTime}`,
          fileSize: uploadZimniFileSize || "24.0 KB",
          dataUrl: uploadZimniFileDataUrl,
        };
        await firService.addDocument(fir.id, newDoc);

        universalEvidenceService
          .registerAndProcess({
            dataUrl: uploadZimniFileDataUrl,
            fileName: newDoc.fileName,
            fileId: docId,
            caseId: fir.id,
            caseNumber: fir.firNumber,
            module: "FIR",
            uploadedBy: currentUser.name || "IO",
          })
          .catch((err) => console.warn("FIR universal evidence sync warning:", err));
      }

      setUploadZimniTitle("");
      setUploadZimniRemarks("");
      setUploadZimniFileName("");
      setUploadZimniFileDataUrl("");
      setUploadZimniFileSize("");
      setIsUploadZimniModalOpen(false);
      fetchFir();
    } catch (err) {
      console.error("Error uploading Zimni:", err);
    } finally {
      setUploadZimniSubmitting(false);
    }
  };

  // Case Diary (Zimni) Action Handlers: Preview, Download, Delete
  const handlePreviewCaseDiary = async (cd: FIRCaseDiaryItem) => {
    let displayUrl = cd.dataUrl || cd.fileUrl || "";

    if (!displayUrl && typeof window !== "undefined") {
      const idb = (await evidenceBlobStore.get(cd.id)) || (cd.fileName ? await evidenceBlobStore.get(cd.fileName) : null);
      if (idb) displayUrl = idb;
    }

    if (!displayUrl && cd.contentHtml) {
      displayUrl = `data:text/html;charset=utf-8,${encodeURIComponent(cd.contentHtml)}`;
    }

    setCaseDiaryPreviewUrl(displayUrl);
    setCaseDiaryPreviewItem(cd);
  };

  const handleDownloadCaseDiary = async (cd: FIRCaseDiaryItem) => {
    let content = cd.contentHtml;
    let url = cd.dataUrl || cd.fileUrl;

    if (!content && !url && typeof window !== "undefined") {
      const idb = (await evidenceBlobStore.get(cd.id)) || (cd.fileName ? await evidenceBlobStore.get(cd.fileName) : null);
      if (idb) url = idb;
    }

    if (content) {
      const blob = new Blob([content], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = cd.fileName || `Zimni_${cd.zimniNumber || 1}_${fir?.firNumber.replace(/[\/\s]/g, "_")}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      return;
    }

    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = cd.fileName || `Zimni_${cd.zimniNumber || 1}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const text = `HARYANA POLICE - CASE DIARY (SECTION 175 BNSS)\nFIR: ${fir?.firNumber}\nZimni #${cd.zimniNumber || 1}\nOfficer: ${cd.officer}\nDate: ${cd.date} ${cd.time}\nSummary: ${cd.summary}\n----------------------------------------\n${cd.details}`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `Zimni_${cd.zimniNumber || 1}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  const handleDeleteCaseDiary = async (cdId: string) => {
    if (!fir) return;
    if (!confirm("क्या आप इस केस डायरी (जिमनी) को आधिकारिक रिकॉर्ड से हटाना चाहते हैं?")) {
      return;
    }

    try {
      const updated = await firService.deleteCaseDiary(fir.id, cdId, currentUser.name);
      if (updated) {
        setFir(updated);
      }
      if (typeof window !== "undefined") {
        evidenceBlobStore.delete(cdId);
      }
      await universalEvidenceService.deleteByDocumentId(cdId);
      fetchFir();
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fir || !docTitle.trim()) return;

    const docId = `doc-${Date.now()}`;
    const newDoc: FIRDocumentItem = {
      id: docId,
      title: docTitle,
      fileName: docFileName || `${docTitle.toLowerCase().replace(/\s+/g, "_")}.pdf`,
      category: docCategory as any,
      uploadedBy: currentUser.name || "Officer",
      uploadedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      dataUrl: docFileDataUrl || undefined,
      fileSize: docFileSize || "45.0 KB",
    };

    await firService.addDocument(fir.id, newDoc);

    // Auto-trigger Roznamcha GD suggestion if the added document is an Arrest Memo, Crime Detail, or Seizure Form
    const lowerDocTitle = docTitle.toLowerCase();
    if (
      lowerDocTitle.includes("arrest") ||
      lowerDocTitle.includes("surrender") ||
      lowerDocTitle.includes("गिरफ्तारी") ||
      lowerDocTitle.includes("समर्पण") ||
      lowerDocTitle.includes("26.8")
    ) {
      void GeneralDiaryService.createFirActionSuggestion({
        actionType: "ARREST_MEMO",
        firId: fir.id,
        firNumber: fir.firNumber,
        policeStation: fir.policeStation,
        district: fir.district,
        officer: {
          name: currentUser.name || "Officer",
          rank: currentUser.rank || "Sub-Inspector",
        },
        actsAndSections: fir.actsAndSections,
        docTitle,
      }).catch((e) => console.warn("GD suggestion error:", e));
    } else if (
      lowerDocTitle.includes("crime detail") ||
      lowerDocTitle.includes("iif-ii") ||
      lowerDocTitle.includes("iif2") ||
      lowerDocTitle.includes("अपराध विवरण")
    ) {
      void GeneralDiaryService.createFirActionSuggestion({
        actionType: "CRIME_DETAILS",
        firId: fir.id,
        firNumber: fir.firNumber,
        policeStation: fir.policeStation,
        district: fir.district,
        officer: {
          name: currentUser.name || "Officer",
          rank: currentUser.rank || "Sub-Inspector",
        },
        actsAndSections: fir.actsAndSections,
        place: fir.incidentPlace,
        docTitle,
      }).catch((e) => console.warn("GD suggestion error:", e));
    } else if (
      lowerDocTitle.includes("seizure") ||
      lowerDocTitle.includes("iif-iv") ||
      lowerDocTitle.includes("iif4") ||
      lowerDocTitle.includes("जब्ती") ||
      lowerDocTitle.includes("तलाशी")
    ) {
      void GeneralDiaryService.createFirActionSuggestion({
        actionType: "PROPERTY_SEIZURE",
        firId: fir.id,
        firNumber: fir.firNumber,
        policeStation: fir.policeStation,
        district: fir.district,
        officer: {
          name: currentUser.name || "Officer",
          rank: currentUser.rank || "ASI",
        },
        actsAndSections: fir.actsAndSections,
        place: fir.incidentPlace,
        docTitle,
      }).catch((e) => console.warn("GD suggestion error:", e));
    }

    if (docFileDataUrl) {
      universalEvidenceService
        .registerAndProcess({
          dataUrl: docFileDataUrl,
          fileName: newDoc.fileName,
          fileId: docId,
          caseId: fir.id,
          caseNumber: fir.firNumber,
          module: "FIR",
          uploadedBy: currentUser.name || "Officer",
        })
        .catch((err) => console.warn("FIR universal evidence sync warning:", err));
    }

    setDocTitle("");
    setDocFileName("");
    setDocFileDataUrl("");
    setDocFileSize("");
    setIsDocModalOpen(false);
    fetchFir();
  };

  const handleSubmitFinalForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fir || !finalFormSummary.trim()) return;

    setFinalFormSubmitting(true);
    try {
      await firService.submitFinalForm(
        fir.id,
        finalFormType,
        courtName,
        currentUser.name || "IO",
        finalFormSummary
      );
      await firService.addAuditRecord(
        fir.id,
        "FINAL_FORM_SUBMITTED",
        `Filed ${finalFormType} report for submission before ${courtName}`,
        currentUser.name
      );
      setIsFinalFormModalOpen(false);
      fetchFir();
    } catch (err) {
      console.error("Failed to submit final form:", err);
    } finally {
      setFinalFormSubmitting(false);
    }
  };

  const displayReports = useMemo<ComplaintReportItem[]>(() => {
    if (!fir) return [];
    const list = [...backendReports, ...(fir.reports || []).filter(r => !backendReports.some(saved => saved.id === r.id))].map((r) => {
      // Ensure any chargesheet/final form report has authentic statutory HTML matching preview
      const isChargesheetOrFinal =
        r.reportType === "CHARGESHEET" ||
        r.reportType === "CLOSURE" ||
        r.reportType === "UNTRACED" ||
        r.reportType === "CANCELLED" ||
        r.title?.toLowerCase().includes("final form") ||
        r.title?.toLowerCase().includes("chargesheet");

      if (!r.contentHtml && isChargesheetOrFinal) {
        const syntheticHtml = generateIIFVChargesheetHtmlFromFir(fir, r, currentUser);
        return {
          ...r,
          contentHtml: syntheticHtml,
          dataUrl: r.dataUrl || `data:text/html;charset=utf-8,${encodeURIComponent(syntheticHtml)}`,
        };
      }
      return r;
    });

    if (fir.finalFormType && !list.some((r) => r.reportType === fir.finalFormType)) {
      const syntheticHtml = generateIIFVChargesheetHtmlFromFir(fir, undefined, currentUser);
      list.unshift({
        id: `final-form-${fir.id}`,
        complaintId: fir.id,
        title: `${
          fir.finalFormType === "CHARGESHEET"
            ? "Police Final Chargesheet (दोषारोप पत्र)"
            : fir.finalFormType === "CLOSURE"
            ? "Final Closure Report (खारिजी रिपोर्ट)"
            : "Final Untraced Report (अदम सुराग)"
        } u/s 193 BNSS`,
        reportType: fir.finalFormType,
        reportTypeLabel: `${fir.finalFormType} FILED`,
        dispatchNo: fir.finalFormNumber || `DISP/${fir.firYear || 2026}/${fir.firNumber}`,
        generatedDate: fir.finalFormDate || fir.updatedAt?.slice(0, 10) || fir.createdAt.slice(0, 10),
        officerName: fir.assignedIoName || "Investigating Officer",
        officerRank: fir.assignedIoRank || "IO",
        conclusionSummary:
          fir.finalFormSummary || `Statutory Police Report filed before ${fir.courtName || "Court of CJM"}.`,
        content: `POLICE FINAL REPORT UNDER SECTION 193 BNSS, 2023\nCourt: ${
          fir.courtName || "Court of CJM"
        }\nFIR No: ${fir.firNumber} | Police Station: ${fir.policeStation}\nSections: ${
          fir.actsAndSections
        }\n\nSummary of Findings:\n${
          fir.finalFormSummary || "Final form submitted on conclusion of investigation."
        }`,
        contentHtml: syntheticHtml,
        dataUrl: `data:text/html;charset=utf-8,${encodeURIComponent(syntheticHtml)}`,
        fileFormat: "Official I.I.F.-V (Statutory Document)",
        status: "Saved in Complaint",
        versionNumber: 1,
        createdAt: fir.finalFormDate || fir.createdAt,
      });
    }
    return list;
  }, [fir, currentUser, backendReports]);

  const handleGenerateDocumentTemplate = async (templateKey: string) => {
    if (!fir) return;
    setGenerateDocDropdownOpen(false);

    let title = "Document";
    let category = "OTHER";
    let content = "";

    switch (templateKey) {
      case "notice_35_3":
        title = `Notice u/s 35(3) BNSS - ${fir.accusedList?.[0]?.name || "Accused"}`;
        category = "FIELD_REPORT";
        content = `HARYANA POLICE\nNOTICE OF APPEARANCE UNDER SECTION 35(3) BNSS, 2023\n\nTo,\n${
          fir.accusedList?.[0]?.name || "Accused Person"
        }\nAddress: ${fir.accusedList?.[0]?.address || fir.incidentPlace}\n\nRe: FIR No. ${
          fir.firNumber
        } u/s ${fir.actsAndSections} PS ${fir.policeStation}\n\nTake notice that your presence is required for examination in relation to the investigation of above-noted FIR. You are directed to join investigation at Police Station ${
          fir.policeStation
        } within 7 days from receipt of this notice.\n\nInvestigating Officer: ${
          fir.assignedIoName || currentUser.name
        }\nRank: ${fir.assignedIoRank || currentUser.rankDisplay || "IO"}`;
        break;
      case "summons_179":
        title = `Witness Summons u/s 179 BNSS - ${fir.complainantName}`;
        category = "WITNESS_STATEMENT";
        content = `HARYANA POLICE\nSUMMONS TO WITNESS UNDER SECTION 179 BNSS, 2023\n\nTo,\n${
          fir.complainantName
        }\nAddress: ${fir.complainantAddress || fir.incidentPlace}\n\nWhereas information has been laid that an offence under ${
          fir.actsAndSections
        } has been committed. You appear to be acquainted with circumstances of the case.\n\nYou are hereby summoned to appear before the undersigned at Police Station ${
          fir.policeStation
        } to state relevant facts.\n\nIO: ${fir.assignedIoName || currentUser.name}`;
        break;
      case "site_plan":
        title = `Site Plan / Naksha Mauka - ${fir.incidentPlace}`;
        category = "FIELD_REPORT";
        content = `HARYANA POLICE\nSITE INSPECTION PLAN / NAKSHA MAUKA\n\nFIR No: ${fir.firNumber} | PS: ${
          fir.policeStation
        }\nPlace of Occurrence: ${fir.incidentPlace}\nLandmark: ${fir.incidentLandmark || "Not specified"}\n\nBOUNDARIES:\nNorth: Public Road / Open street\nSouth: Residential / Commercial structure\nEast: Main thoroughfare\nWest: Vacant plot / passage\n\nInspection Officer: ${
          fir.assignedIoName || currentUser.name
        }\nWitnesses Present: Local residents examined on spot.`;
        break;
      case "seizure_memo":
        title = `Seizure Memo / Fard Zabti - ${fir.firNumber}`;
        category = "SEIZURE_MEMO";
        content = `HARYANA POLICE\nSEIZURE MEMO / FARD ZABTI (RECOVERY UNDER BNSS)\n\nFIR No: ${
          fir.firNumber
        }\nDate of Seizure: ${formatDate(new Date())}\nPlace of Seizure: ${
          fir.incidentPlace
        }\n\nArticles Recovered & Seized:\n1. Material evidence related to ${
          fir.actsAndSections
        }.\n2. Sealed in tamper-evident police parcel bearing station stamp.\n\nWitnesses to Seizure:\n1. Independent Witness #1\n2. Independent Witness #2\n\nInvestigating Officer: ${
          fir.assignedIoName || currentUser.name
        }`;
        break;
      case "zimni_extract":
        title = `Case Diary Zimni Extract (Zimni #${(fir.caseDiaries?.length || 0) + 1})`;
        category = "FIELD_REPORT";
        content = `CASE DIARY EXTRACT (SECTION 175 BNSS)\nFIR No: ${fir.firNumber} | PS: ${
          fir.policeStation
        }\nDate: ${formatDate(new Date())}\n\nRecord of Day-to-Day Investigation:\n1. Investigation taken up by IO.\n2. Evidentiary material inspected and placed on docket.\n3. Case diaries maintained chronologically as mandated by law.\n\nSigned by IO: ${
          fir.assignedIoName || currentUser.name
        }`;
        break;
    }

    try {
      const narrative = await writeCaseDraft({ module: "FIR", caseId: fir.id, purpose: "document", title });
      content = content.split("\n\n")[0] + "\n\n" + narrative;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Document draft failed.");
      return;
    }

    const newDoc: FIRDocumentItem = {
      id: `doc-${Date.now()}`,
      title,
      fileName: `${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.txt`,
      category,
      uploadedBy: currentUser.name || "IO",
      uploadedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      fileSize: `${(new Blob([content]).size / 1024).toFixed(1)} KB`,
      dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
    };

    await firService.addDocument(fir.id, newDoc);
    fetchFir();
    setDocPreviewItem(newDoc);
  };

  const handleOpenDocPreview = async (doc: FIRDocumentItem) => {
    let item = { ...doc };
    if (!item.dataUrl && typeof window !== "undefined") {
      const idb =
        (await evidenceBlobStore.get(doc.id)) ||
        (doc.fileName ? await evidenceBlobStore.get(doc.fileName) : null) ||
        (await evidenceBlobStore.get(`crime_details_${firId}`));
      if (idb) item.dataUrl = idb;
    }
    setDocPreviewItem(item);
  };

  const handleDownloadDocument = async (doc: FIRDocumentItem) => {
    let dataUrl = doc.dataUrl;
    if (!dataUrl && typeof window !== "undefined") {
      const idb =
        (await evidenceBlobStore.get(doc.id)) ||
        (doc.fileName ? await evidenceBlobStore.get(doc.fileName) : null) ||
        (await evidenceBlobStore.get(`crime_details_${firId}`));
      if (idb) dataUrl = idb;
    }
    if (dataUrl) {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = doc.fileName || `${doc.title}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const content = `HARYANA POLICE\nFIR No: ${fir?.firNumber || ""}\nDocument: ${
        doc.title
      }\nDate: ${formatDate(new Date())}\n\nThis is an authentic certified evidentiary record attached to the case docket.`;
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.fileName || `${doc.title.replace(/\s+/g, "_")}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!fir) return;
    if (confirm("Are you sure you want to delete this document from the FIR docket?")) {
      await firService.deleteDocument(fir.id, docId);
      fetchFir();
    }
  };

  const handleOpenGenerateReportDraft = async (typeKey: string) => {
    if (!fir) return;
    setGenerateReportDropdownOpen(false);

    if (typeKey === "CHARGESHEET" || typeKey === "CLOSURE" || typeKey === "UNTRACED" || typeKey === "CANCELLED") {
      router.push(`/fir-workspace/drafts?firId=${encodeURIComponent(fir.id)}&type=${typeKey}`);
      return;
    }

    let title = "";
    const repType = typeKey;
    const dispatchNo = `DISP/${fir.firYear || 2026}/${fir.firNumber.replace(/[^0-9]/g, "").slice(-4) || "001"}/${typeKey}`;
    let content = "";

    switch (typeKey) {
      case "CHARGESHEET":
        title = `Final Police Report / Chargesheet (Sec 193 BNSS) - ${fir.firNumber}`;
        content = `POLICE REPORT / CHARGESHEET UNDER SECTION 193 BNSS, 2023\nIN THE COURT OF CHIEF JUDICIAL MAGISTRATE\n\n1. FIR No: ${
          fir.firNumber
        } Dated: ${fir.firDate}\n2. Police Station: ${fir.policeStation}, District: ${fir.district}\n3. Complainant: ${
          fir.complainantName
        }\n4. Accused: ${
          fir.accusedList?.map((a, i) => `${i + 1}. ${a.name} s/o ${a.fatherName || "N/A"}`).join(", ") ||
          "Named accused"
        }\n5. Acts & Sections: ${fir.actsAndSections}\n\nBRIEF FACTS & INVESTIGATION FINDINGS:\nInvestigation in this case was conducted under Section 173/175 BNSS. Spot inspection was carried out and site plan prepared. Statements of witnesses recorded under Section 180 BNSS. Sufficient prima facie oral and documentary evidence has been gathered substantiating the offence under ${
          fir.actsAndSections
        }.\n\nPRAYER:\nAccused person(s) may be summoned and put on trial in accordance with law.\n\nInvestigating Officer: ${
          fir.assignedIoName || currentUser.name
        }\nForwarded by SHO: PS ${fir.policeStation}`;
        break;
      case "CLOSURE":
        title = `Cancellation / Closure Report (Sec 193 BNSS) - ${fir.firNumber}`;
        content = `CLOSURE REPORT / CANCELLATION UNDER SECTION 193 BNSS, 2023\nIN THE COURT OF CHIEF JUDICIAL MAGISTRATE\n\n1. FIR No: ${
          fir.firNumber
        } Dated: ${fir.firDate}\n2. Police Station: ${fir.policeStation}\n3. Complainant: ${
          fir.complainantName
        }\n4. Offence: ${
          fir.actsAndSections
        }\n\nGROUNDS FOR CLOSURE:\nDuring comprehensive investigation, the allegations made in the FIR were thoroughly verified. Spot inspection and examination of independent witnesses reveal that the dispute is civil/private in nature and no cognizable criminal offence is substantiated against the named persons.\n\nPRAYER:\nThe Hon'ble Court is requested to accept this Closure/Cancellation report and discharge the proceedings.\n\nInvestigating Officer: ${
          fir.assignedIoName || currentUser.name
        }`;
        break;
      case "UNTRACED":
        title = `Untraced Report (अदम सुराग) - ${fir.firNumber}`;
        content = `FINAL UNTRACED REPORT UNDER SECTION 193 BNSS, 2023\nIN THE COURT OF CHIEF JUDICIAL MAGISTRATE\n\n1. FIR No: ${
          fir.firNumber
        }\n2. Police Station: ${fir.policeStation}\n3. Complainant: ${
          fir.complainantName
        }\n\nREASONS FOR UNTRACED STATUS:\nAll possible efforts, informant inquiries, surveillance checks and technical evidence analysis were exhausted to trace the perpetrators and stolen property. Despite best efforts, no clue could be traced. If any clue surfaces in the future, investigation will be reopened.\n\nSubmitted by IO: ${
          fir.assignedIoName || currentUser.name
        }`;
        break;
      case "PROGRESS":
        title = `Supervisory Progress Report - ${fir.firNumber}`;
        content = `SUPERVISORY INVESTIGATION PROGRESS REPORT\nSUBMITTED TO: Station House Officer / Sub-Divisional DSP\n\nFIR No: ${
          fir.firNumber
        }\nSections: ${fir.actsAndSections}\n\nINVESTIGATION MILESTONES COMPLETED:\n- Registration and spot inspection\n- Case Diary Zimnis: ${
          fir.caseDiaries?.length || 0
        } recorded\n- Evidentiary attachments: ${
          fir.documents?.length || 0
        } gathered\n\nPENDING STEPS & ACTION PLAN:\n- FSL / Scientific analysis report awaited\n- Arrest of absconding accused\n\nSubmitted by: ${
          fir.assignedIoName || currentUser.name
        }`;
        break;
      case "ABATED":
        title = `Abated Final Report (Death of Accused) - ${fir.firNumber}`;
        content = `FINAL REPORT - ABATED PROCEEDINGS (SECTION 193 BNSS)\nIN THE COURT OF CHIEF JUDICIAL MAGISTRATE\n\nFIR No: ${
          fir.firNumber
        }\nSections: ${fir.actsAndSections}\n\nGROUNDS:\nThe sole accused named in the FIR has expired during the pendency of investigation. Death certificate verified and placed on record. Criminal proceedings stand abated by operation of law.\n\nSubmitted by: ${
          fir.assignedIoName || currentUser.name
        }`;
        break;
    }

    try {
      content = await writeCaseDraft({ module: "FIR", caseId: fir.id, purpose: "report", title });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Report draft failed.");
      return;
    }

    setActiveDraftReport(null);
    setReportDraftTitle(title);
    setReportDraftType(repType);
    setReportDraftDispatchNo(dispatchNo);
    setReportDraftContent(content);
    setReportDraftModalOpen(true);
  };

  const handleEditReport = (report: ComplaintReportItem) => {
    if (report.finalReportData) {
      setEditingFinalReport(report);
      setIsFinalReportModalOpen(true);
      return;
    }
    setActiveDraftReport(report);
    setReportDraftTitle(report.title);
    setReportDraftType(report.reportType || "CHARGESHEET");
    setReportDraftDispatchNo(report.dispatchNo || "");
    setReportDraftContent(report.content || report.conclusionSummary || "");
    setReportDraftModalOpen(true);
  };

  const handleSaveReportDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fir || !reportDraftTitle.trim()) return;

    if (activeDraftReport) {
      const updatedReports = (fir.reports || []).map((r) =>
        r.id === activeDraftReport.id
          ? {
              ...r,
              title: reportDraftTitle,
              reportType: reportDraftType,
              reportTypeLabel: reportDraftType,
              dispatchNo: reportDraftDispatchNo,
              content: reportDraftContent,
              conclusionSummary: reportDraftContent.slice(0, 180) + "...",
              updatedAt: new Date().toISOString(),
            }
          : r
      );
      await firService.updateFir(fir.id, { reports: updatedReports });
    } else {
      const newReport: ComplaintReportItem = {
        id: `rep-${Date.now()}`,
        complaintId: fir.id,
        title: reportDraftTitle,
        reportType: reportDraftType,
        reportTypeLabel: reportDraftType,
        dispatchNo: reportDraftDispatchNo,
        generatedDate: new Date().toISOString().slice(0, 10),
        officerName: fir.assignedIoName || currentUser.name || "IO",
        officerRank: fir.assignedIoRank || currentUser.rankDisplay || "IO",
        conclusionSummary: reportDraftContent.slice(0, 180) + "...",
        content: reportDraftContent,
        fileFormat: "PDF",
        fileSize: "24.5 KB",
        status: "Saved in Complaint",
        versionNumber: 1,
        createdAt: new Date().toISOString(),
      };
      await firService.addReport(fir.id, newReport);
    }

    setReportDraftModalOpen(false);
    setActiveDraftReport(null);
    fetchFir();
  };

  const handleDownloadReport = (report: ComplaintReportItem) => {
    if (report.dataUrl && !report.dataUrl.startsWith("data:text/html")) {
      const link = document.createElement("a");
      link.href = report.dataUrl;
      link.download = report.fileName || `${report.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const isChargesheetOrFinal =
        report.reportType === "CHARGESHEET" ||
        report.reportType === "CLOSURE" ||
        report.reportType === "UNTRACED" ||
        report.reportType === "CANCELLED" ||
        report.title?.toLowerCase().includes("final form") ||
        report.title?.toLowerCase().includes("chargesheet");

      const html =
        report.contentHtml ||
        (isChargesheetOrFinal && fir
          ? generateIIFVChargesheetHtmlFromFir(fir, report, currentUser)
          : `
        <div style="font-family: 'Times New Roman', Times, serif; padding: 25px; line-height: 1.6; color: #000;">
          <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px;">
            <h2 style="margin: 0; text-transform: uppercase;">Haryana Police</h2>
            <h3 style="margin: 5px 0; color: #111;">${report.title}</h3>
            <p style="margin: 0; font-size: 12px; font-family: monospace;">Dispatch: ${
              report.dispatchNo || "N/A"
            } • Date: ${formatDate(report.generatedDate)}</p>
            <p style="margin: 0; font-size: 12px;">FIR No: ${fir?.firNumber || ""} • PS: ${
              fir?.policeStation || ""
            }</p>
          </div>
          <div style="white-space: pre-wrap; font-size: 13px; font-family: Arial, sans-serif;">${
            escapeDraftText(report.content || report.conclusionSummary || "")
          }</div>
        </div>
      `);
      downloadA4DocumentAsHtml(
        html,
        report.fileName || `${(report.dispatchNo || "POLICE_REPORT").replace(/[\/\\?%*:|"<>]/g, "_")}.html`,
        report.title
      );
    }
  };

  const handlePrintReport = (report: ComplaintReportItem) => {
    const isChargesheetOrFinal =
      report.reportType === "CHARGESHEET" ||
      report.reportType === "CLOSURE" ||
      report.reportType === "UNTRACED" ||
      report.reportType === "CANCELLED" ||
      report.title?.toLowerCase().includes("final form") ||
      report.title?.toLowerCase().includes("chargesheet");

    const html =
      report.contentHtml ||
      (isChargesheetOrFinal && fir
        ? generateIIFVChargesheetHtmlFromFir(fir, report, currentUser)
        : `
      <div style="font-family: 'Times New Roman', Times, serif; padding: 25px; line-height: 1.6; color: #000;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px;">
          <h2 style="margin: 0; text-transform: uppercase;">Haryana Police</h2>
          <h3 style="margin: 5px 0; color: #111;">${report.title}</h3>
          <p style="margin: 0; font-size: 12px; font-family: monospace;">Dispatch: ${
            report.dispatchNo || "N/A"
          } • Date: ${formatDate(report.generatedDate)}</p>
          <p style="margin: 0; font-size: 12px;">FIR No: ${fir?.firNumber || ""} • PS: ${
            fir?.policeStation || ""
          }</p>
        </div>
        <div style="white-space: pre-wrap; font-size: 13px; font-family: Arial, sans-serif;">${
          escapeDraftText(report.content || report.conclusionSummary || "")
        }</div>
      </div>
    `);
    printHtmlContent(html, report.title);
  };

  const handleCreateNewVersion = async (report: ComplaintReportItem) => {
    if (!fir) return;
    const currentVer = report.versionNumber || 1;
    const newVer = currentVer + 1;
    const newReport: ComplaintReportItem = {
      ...report,
      id: `rep-${Date.now()}`,
      title: `${report.title.replace(/\s*\(v\d+\)/, "")} (v${newVer})`,
      versionNumber: newVer,
      status: "Draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sentToSho: false,
    };
    await firService.addReport(fir.id, newReport);
    fetchFir();
    handleEditReport(newReport);
  };

  const handleSendReportToSupervisory = async (report: ComplaintReportItem) => {
    if (!fir) return;
    try {
      if (report.finalReportData) {
        const saved = await finalReportClient.sendToSho(report, fir.id, currentUser.id);
        setBackendReports(rows => rows.map(r => r.id === saved.id ? saved : r));
        setReportRefresh(n => n + 1);
        return;
      }
      const latest = firService.getFirById(fir.id);
      const stored = latest?.reports?.find(r => r.id === report.id);
      if (!latest || !stored) throw new Error("Report not found. Reload the profile.");
      if (stored.sentToSho) return;
      const now = new Date().toISOString();
      const reports = (latest.reports || []).map(r => r.id === report.id ? {
        ...r, sentToSho: true, isSentToSho: true, sentToShoAt: now,
        sentToShoBy: currentUser.id, updatedAt: now, status: "Finalized" as const,
      } : r);
      await firService.updateFir(fir.id, {
        reports,
        auditTrail: [{ id: `aud-${Date.now()}`, timestamp: now, action: "REPORT_FORWARDED",
          officerName: currentUser.name, role: currentUser.role,
          details: `Submitted report "${stored.title}" to SHO for review`,
        }, ...(latest.auditTrail || [])],
      });
      fetchFir();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not send report to SHO. Please retry.");
    }
  };

  const handleOpenShoSendToSoModal = (report: ComplaintReportItem) => {
    if (!isShoOrAbove) {
      alert("Access Denied: Only SHO or a supervisory officer can forward this report to SO.");
      return;
    }
    setSelectedReportForSo(report);
    setSendToSoModalOpen(true);
  };

  const handleShoSendToSoSubmit = async (data: {
    status: string;
    remarks: string;
    soName: string;
    soRole: string;
    soId: string;
  }) => {
    if (!fir) return;
    setSendingReportToSo(true);
    try {
      const latest = firService.getFirById(fir.id);
      const stored = latest?.reports?.find((r) => r.id === selectedReportForSo?.id);
      if (!latest || !stored) throw new Error("Report not found. Reload the profile.");
      if (stored.sentToSo) throw new Error("This report has already been sent to SO.");
      const now = new Date().toISOString();
      const reports = (latest.reports || []).map((r) => r.id === stored.id ? {
        ...r,
        sentToSo: true,
        sentToSoAt: now,
        sentToSoBy: currentUser.id,
        soName: data.soName,
        soRole: data.soRole,
        soRecommendation: data.status,
        soRemarks: data.remarks,
        updatedAt: now,
      } : r);
      await firService.updateFir(fir.id, {
        reports,
        soName: data.soName,
        soRole: data.soRole,
        soDecision: undefined,
        auditTrail: [{ id: `aud-so-${Date.now()}`, timestamp: now, action: "REPORT_FORWARDED_TO_SO",
          officerName: currentUser.name, role: currentUser.role,
          details: `SHO report "${stored.title}" forwarded to ${data.soName} with status ${data.status}`,
        }, ...(latest.auditTrail || [])],
      });
      setSendToSoModalOpen(false);
      alert(`Report forwarded to ${data.soName}. Awaiting SO final decision (${data.status}).`);
      fetchFir();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not send report to SO. Please retry.");
    } finally {
      setSendingReportToSo(false);
    }
  };

  const handleUploadReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fir || !uploadReportTitle.trim()) return;
    const file = new FormData(e.currentTarget as HTMLFormElement).get("signedReport");
    if (!(file instanceof File) || !file.size) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) {
      alert("The signed report file could not be read.");
      return;
    }

    const newReport: ComplaintReportItem = {
      id: `rep-${Date.now()}`,
      complaintId: fir.id,
      title: uploadReportTitle,
      reportType: uploadReportType,
      reportTypeLabel: uploadReportType,
      dispatchNo: uploadReportDispatch || `DISP/${fir.firYear || 2026}/${Date.now().toString().slice(-4)}`,
      generatedDate: new Date().toISOString().slice(0, 10),
      officerName: currentUser.name || "IO",
      officerRank: currentUser.rankDisplay || "IO",
      conclusionSummary: uploadReportRemarks || "Signed police report uploaded to case docket.",
      isUploaded: true,
      fileName: file.name,
      dataUrl,
      fileFormat: file.name.split(".").pop()?.toUpperCase() || "OTHER",
      fileSize: `${(file.size / 1024).toFixed(1)} KB`,
      status: "Saved in Complaint",
      versionNumber: 1,
      createdAt: new Date().toISOString(),
    };

    await firService.addReport(fir.id, newReport);
    void universalEvidenceService.registerAndProcess({
      file, fileId: newReport.id, caseId: fir.id, caseNumber: fir.firNumber, module: "FIR",
    }).catch(error => console.warn("Signed report processing failed:", error));
    await firService.addAuditRecord(
      fir.id,
      "REPORT_UPLOADED",
      `Uploaded signed report: ${uploadReportTitle}`,
      currentUser.name
    );
    setUploadReportTitle("");
    setUploadReportDispatch("");
    setUploadReportRemarks("");
    setUploadReportModalOpen(false);
    fetchFir();
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-10 space-y-4">
        <LoadingSkeleton count={4} />
      </div>
    );
  }

  if (!fir || !isFirVisibleToUser(currentUser, fir)) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <Scale className="w-12 h-12 text-slate-300 mx-auto" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          {loadError ? "Unable to Load FIR Record" : "FIR Record Not Found"}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {loadError || "The requested First Information Report could not be located in the register."}
        </p>
        <div className="flex items-center justify-center gap-2">
          {loadError && (
            <Button size="sm" onClick={fetchFir} className="text-xs">
              Retry
            </Button>
          )}
          <Link href="/fir">
            <Button variant="outline" size="sm" className="text-xs">
              Return to FIR Register
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 animate-in fade-in-50" data-agent-case={JSON.stringify({firNumber:fir.firNumber,complainant:fir.complainantName,accused:(fir.accusedList || []).map(person=>person.name)})}>
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/fir">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 text-slate-500 hover:text-slate-800"
              title="Back to FIR Register"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-black text-red-900">
                {fir.firNumber}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  fir.status === "UNDER_INVESTIGATION"
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : fir.status === "CHARGESHEET_FILED"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : fir.status === "CLOSURE_REPORT_FILED"
                    ? "bg-blue-50 text-blue-800 border-blue-200"
                    : "bg-slate-100 text-slate-800 border-slate-200"
                }`}
              >
                {fir.mainStatus || fir.status.replace(/_/g, " ")}
              </span>
              {(() => {
                const effectiveState = fir.trackingState || getAuthoritativeTrackingState(fir);
                const badgeMap: Record<string, { label: string; cls: string }> = {
                  PART_A_FRESH: { label: "Part A - Fresh", cls: "bg-sky-50 text-sky-800 border-sky-300" },
                  PART_B_PARTIAL: { label: "Part B - Partial", cls: "bg-blue-50 text-blue-800 border-blue-300" },
                  PART_B_UNDER_CHECKING: { label: "Part B - Under checking", cls: "bg-amber-50 text-amber-800 border-amber-300" },
                  PART_B_REOPEN: { label: "Part B - Re-open", cls: "bg-purple-50 text-purple-800 border-purple-300" },
                  COMPLETED: { label: "Complete cases", cls: "bg-emerald-50 text-emerald-800 border-emerald-300" }
                };
                const config = badgeMap[effectiveState] || { label: effectiveState, cls: "bg-slate-100 text-slate-800 border-slate-200" };
                return (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${config.cls}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {config.label}
                  </span>
                );
              })()}
              <span className="text-xs font-mono px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">
                {fir.cctnsFirNumber || "CCTNS LOCAL"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Registered on {fir.firDate} at {fir.firTime || "10:00"} hrs • {fir.policeStation}, {fir.district}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Actions & Forms Dropdown (Print Statutory FIR, Crime Details IIF-II, Arrest Docs IIF-III) */}
          <div className="relative" ref={headerActionsDropdownRef}>
            <Button
              size="sm"
              onClick={() => setHeaderActionsDropdownOpen(!headerActionsDropdownOpen)}
              className={`font-bold text-xs gap-1.5 transition-all shadow-sm cursor-pointer ${
                !isCrimeDetailsFilled
                  ? "bg-amber-600 hover:bg-amber-700 text-white shadow-[0_0_15px_rgba(245,158,11,0.7)] ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 border border-amber-300"
                  : "bg-slate-900 hover:bg-slate-800 text-white"
              }`}
              title="FIR Quick Actions & Statutory Forms"
            >
              <FileText className="w-3.5 h-3.5 text-white" />
              <span>Actions &amp; Forms</span>
              {!isCrimeDetailsFilled && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-200 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${headerActionsDropdownOpen ? "rotate-180" : ""}`} />
            </Button>

            {headerActionsDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1.5 space-y-1 animate-in fade-in-50 text-xs">
                <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 flex items-center justify-between">
                  <span>FIR Actions &amp; Forms</span>
                  <span className="text-[9px] font-mono text-slate-500 font-normal">CCTNS / BNSS</span>
                </div>

                {/* 1. Print Statutory FIR Copy */}
                <button
                  type="button"
                  onClick={() => {
                    setHeaderActionsDropdownOpen(false);
                    setIsReceiptOpen(true);
                  }}
                  className="w-full flex items-start gap-2.5 p-2 rounded-lg text-left hover:bg-red-50 text-slate-700 hover:text-red-900 transition-colors cursor-pointer group"
                >
                  <div className="w-7 h-7 rounded-lg bg-red-100 group-hover:bg-red-200 flex items-center justify-center shrink-0 mt-0.5">
                    <Printer className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs text-slate-900 group-hover:text-red-900 flex items-center justify-between">
                      <span>Print Statutory FIR Copy</span>
                      <span className="text-[9px] font-semibold bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-mono">
                        IIF-I
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 group-hover:text-red-700/80 mt-0.5">
                      Statutory FIR copy &amp; CCTNS acknowledgment receipt
                    </p>
                  </div>
                </button>

                {/* 2. Crime Details (IIF-II) */}
                <button
                  type="button"
                  onClick={() => {
                    setHeaderActionsDropdownOpen(false);
                    setIsCrimeDetailsOpen(true);
                  }}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-lg text-left transition-colors cursor-pointer group ${
                    !isCrimeDetailsFilled ? "bg-amber-50/70 hover:bg-amber-100/80" : "hover:bg-emerald-50"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    !isCrimeDetailsFilled ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {isCrimeDetailsFilled ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                      <span>Crime Details (IIF-II)</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        !isCrimeDetailsFilled
                          ? "bg-amber-200 text-amber-900 animate-pulse"
                          : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {!isCrimeDetailsFilled ? "अनिवार्य" : "✓ Filled"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {!isCrimeDetailsFilled
                        ? "अपराध विवरण प्रपत्र दर्ज करें (अनिवार्य चरण)"
                        : "CCTNS Integrated Investigation Form II"}
                    </p>
                  </div>
                </button>

                {/* 3. Arrest Docs and IIF-III */}
                <button
                  type="button"
                  onClick={() => {
                    setHeaderActionsDropdownOpen(false);
                    if (!isCrimeDetailsFilled) {
                      alert(
                        "⚠️ वैधानिक रोक: अपराध विवरण प्रपत्र (Crime Detail Form IIF-II) भरना अनिवार्य है!\n\nजब तक IIF-II फॉर्म भरकर FIR प्रोफाइल के दस्तावेज़ पैनल में सुरक्षित नहीं होगा, तब तक गिरफ़्तारी प्रपत्र (Arrest Docs & IIF-III) तैयार नहीं किए जा सकते।\n\nकृपया पहले 'Crime Details (IIF-II)' प्रपत्र भरें।"
                      );
                      setIsCrimeDetailsOpen(true);
                      return;
                    }
                    router.push(`/fir-workspace/arrest-docs?firId=${fir.id}`);
                  }}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-lg text-left transition-colors cursor-pointer group ${
                    !isCrimeDetailsFilled ? "opacity-75 hover:bg-slate-50" : "hover:bg-rose-50"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    !isCrimeDetailsFilled ? "bg-slate-100 text-slate-400" : "bg-rose-100 text-rose-700 group-hover:bg-rose-200"
                  }`}>
                    <ShieldAlert className={`w-3.5 h-3.5 ${!isCrimeDetailsFilled ? "text-slate-400" : "text-rose-600"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                      <span>Arrest Docs and IIF-III</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                        !isCrimeDetailsFilled
                          ? "bg-slate-200 text-slate-600"
                          : "bg-rose-100 text-rose-700"
                      }`}>
                        {!isCrimeDetailsFilled ? "Locked" : "IIF-III"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {!isCrimeDetailsFilled
                        ? "Locked until Crime Details (IIF-II) is completed"
                        : "Arrest Memo, Jamatalashi, Grounds & Remand"}
                    </p>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Modify Acts Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsModifyActsModalOpen(true)}
            className="border-red-300 text-red-900 bg-red-50 hover:bg-red-100 font-bold text-xs gap-1.5 cursor-pointer shadow-2xs"
            title="Modify Acts & Sections (धाराएं जोड़ें / हटाएं / संशोधित करें)"
          >
            <Scale className="w-3.5 h-3.5 text-red-700" />
            <span>Modify Acts</span>
          </Button>

          {/* Re-open Button strictly for COMPLETED tracking state cases */}
          {(fir.trackingState === "COMPLETED" || getAuthoritativeTrackingState(fir) === "COMPLETED") && (
            <Button
              size="sm"
              onClick={() => {
                setReopenReasonText("");
                setReopenCourt(`Chief Judicial Magistrate (CJM), ${fir.district || currentUser?.district || "Panipat"}`);
                setReopenOrderNo("");
                setReopenOrderDt(getTodayIsoIST());
                setReopenConfirmedDetail(false);
                setIsReopenModalOpen(true);
              }}
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs gap-1.5 cursor-pointer shadow-xs"
              title="Reopen completed case (Section 193(9) BNSS)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Re-open Case</span>
            </Button>
          )}

          {/* CDR / Telecom Evidence Analysis Module */}
          <Button
            size="sm"
            onClick={() => router.push(`/telecom?firId=${fir.id}&firNumber=${encodeURIComponent(fir.firNumber)}`)}
            className="bg-[#0b192c] hover:bg-[#132845] text-white font-bold text-xs gap-1.5 cursor-pointer shadow-xs border border-slate-800"
            title="Open Dedicated Telecom Forensic and CDR Analysis Workspace for this FIR"
          >
            <Phone className="w-3.5 h-3.5 text-amber-400" />
            <span>CDR Analysis</span>
          </Button>

          <Button size="sm" variant="outline" onClick={() => setIsBailOpen(true)} className="border-blue-300 text-blue-900 font-bold text-xs gap-1.5"><Scale className="w-3.5 h-3.5" />Bail Details</Button>

          {/* Assign / Reassign IO */}
          {isSho && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAssignModalOpen(true)}
              className="border-slate-300 text-slate-700 font-bold text-xs gap-1.5 cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
              {fir.assignedIoId ? "Change IO" : "Assign IO"}
            </Button>
          )}

          {/* Submit Final Form (Hidden as requested) */}
          {/* {fir.status === "UNDER_INVESTIGATION" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsFinalFormModalOpen(true)}
              className="border-emerald-300 text-emerald-800 font-bold text-xs gap-1.5 hover:bg-emerald-50"
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              File Final Report (Sec 193 BNSS)
            </Button>
          )} */}
        </div>
      </div>

      {/* Linked Source Complaint Banner (Reciprocal Connection) */}
      {fir.sourceComplaintNumber && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-900">
                Connected Origin Complaint: #{fir.sourceComplaintNumber}
              </p>
              <p className="text-[11px] text-blue-700">
                Registered pursuant to SHO recommendation on Complaint docket.
              </p>
            </div>
          </div>
          <Link href={`/complaints/${fir.sourceComplaintId || ""}`}>
            <Button size="sm" variant="outline" className="border-blue-300 text-blue-800 text-xs font-bold gap-1 bg-white hover:bg-blue-100">
              Open Complaint Profile
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      )}

      {/* CRIME DETAILS VERIFIED BANNER */}
      {isCrimeDetailsFilled && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 p-3 text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-emerald-900">
                  ✓ Crime Detail Form (IIF-II) / अपराध विवरण प्रपत्र सत्यापित व दर्ज
                </p>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 font-bold">
                  IIF-II SUBMITTED
                </span>
              </div>
              <p className="text-[11px] text-emerald-700">
                घटनास्थल, अपराध विधि (MO), संदिग्ध, साक्षी व संपत्तियों का विवरण दर्ज है।
                {fir.crimeDetailsFilledAt && ` (${formatDate(fir.crimeDetailsFilledAt)} को ${fir.crimeDetailsFilledBy || "IO"} द्वारा)`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTabChange("documents")}
              className="border-emerald-300 text-emerald-900 bg-white hover:bg-emerald-100 text-xs font-bold gap-1 cursor-pointer"
            >
              <Paperclip className="w-3.5 h-3.5" />
              दस्तावेज देखें (View in Docs)
            </Button>
            <Button
              size="sm"
              onClick={() => setIsCrimeDetailsOpen(true)}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold gap-1 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              प्रपत्र देखें / संपादित करें (Edit IIF-II)
            </Button>
          </div>
        </div>
      )}

      {/* INTER-STATE TRANSFERRED FIR BANNER */}
      {fir.isTransferred && (
        <div className="rounded-xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 via-amber-100/50 to-amber-50 p-4 text-amber-950 space-y-2.5 shadow-xs animate-in fade-in-50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold shrink-0">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase text-amber-950">
                    Inter-State Transferred Case Docket (अंतर्राज्यीय स्थानांतरित केस)
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 uppercase tracking-wider">
                    {fir.transferredToState || "Other State"}
                  </span>
                </div>
                <p className="text-[11px] text-amber-800">
                  यह प्राथमिकी अन्य राज्य/केंद्र शासित प्रदेश के संबंधित थाने को वैधानिक क्षेत्राधिकार नियमों के अंतर्गत स्थानांतरित की जा चुकी है।
                </p>
              </div>
            </div>
            {fir.transferredAt && (
              <span className="text-[11px] font-bold text-amber-900 bg-white/80 px-2.5 py-1 rounded-md border border-amber-300">
                स्थानांतरण दिनांक: {formatDate(fir.transferredAt)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-white/70 p-3 rounded-lg border border-amber-200">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">कहाँ से (Source):</span>
              <span className="font-semibold text-slate-800">{fir.policeStation}, {fir.district} (Haryana)</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-800 block mb-0.5">कहाँ भेजा गया (Destination):</span>
              <span className="font-black text-blue-700">
                {fir.transferredToPoliceStation || "Jurisdictional PS"}, {fir.transferredToDistrict || ""} ({fir.transferredToState || ""})
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">आदेश व अधिकारी:</span>
              <span className="font-medium text-slate-800">
                {fir.transferOrderNumber ? `आदेश: ${fir.transferOrderNumber} • ` : ""}
                {fir.transferredBy || "SHO Sector 29"}
              </span>
            </div>
          </div>

          {fir.transferReason && (
            <div className="text-[11px] text-amber-900 bg-amber-100/50 p-2 rounded border border-amber-200">
              <strong>वैधानिक आधार / कारण:</strong> {fir.transferReason}
            </div>
          )}
        </div>
      )}

      {/* LINKED FIRS CLUSTER BANNER */}
      {fir.linkedFirsList && fir.linkedFirsList.length > 0 && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/80 p-3.5 text-purple-950 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-purple-700" />
              <span className="text-xs font-bold text-purple-950">
                Linked / Connected FIRs Cluster ({fir.linkedFirsList.length} Connected Cases)
              </span>
            </div>
            <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-300">
              Babubhai / Cross-Case Linked
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {fir.linkedFirsList.map((link) => (
              <span
                key={link.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-purple-200 rounded-lg text-xs"
              >
                <span className="font-mono font-bold text-purple-900">{link.firNumber}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">
                  {link.linkType}
                </span>
                {link.complainantName && (
                  <span className="text-[10px] text-slate-500">({link.complainantName})</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-1.5">
        {[
          { key: "overview", label: "Overview & Facts", icon: FileText },
          { key: "case_diaries", label: `Case Diaries / Zimni (${fir.caseDiaries?.length || 0})`, icon: ScrollText },
          { key: "documents", label: `Documents (${combinedFirDocuments.length})`, icon: Paperclip },
          {
            key: "legal_assistant",
            label: fir.legalAnalysis?.suggestedSections?.length
              ? `Legal Help (${fir.legalAnalysis.suggestedSections.length})`
              : "Legal Help",
            icon: Scale,
          },
          { key: "summary", label: "Investigation Summary", icon: Sparkles },
          { key: "knowledge_graph", label: "Knowledge Graph", icon: Globe2 },
          { key: "case_contradictions", label: "Case Contradictions", icon: AlertTriangle },
          { key: "reports", label: "Final Form / Reports", icon: FileCheck2 },
          { key: "history", label: "Timeline & Audit", icon: HistoryIcon },
          { key: "confidential_dossier", label: "Confidential Dossier", icon: Lock },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              data-agent-operation="read"
              onClick={() => handleTabChange(tab.key as ActiveTab)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                isActive
                  ? "bg-[#0b192c] text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      {(activeTab === "knowledge_graph" || activeTab === "case_contradictions") && (
        <FIRCaseAnalysisPanel key={firId} firId={firId} mode={activeTab === "knowledge_graph" ? "graph" : "contradictions"} />
      )}

      {/* 1. OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="space-y-6">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Complainant Particulars */}
            <Card className="border-slate-200 shadow-xs bg-white">
              <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Complainant / Informant
                  </h3>
                </div>
              </div>
              <CardContent className="p-4 space-y-2 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold">Name:</span>{" "}
                  <strong data-no-translate="true" className="text-slate-900 user-data">{fir.complainantName}</strong>
                  {fir.complainantFatherSpouse && (
                    <span data-no-translate="true" className="text-slate-600 user-data"> ({t("पुत्र या पत्नी", "S/o, W/o")} {fir.complainantFatherSpouse})</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Gender / Age:</span>{" "}
                  <span data-no-translate="true" className="user-data">{t(fir.complainantGender)} / {fir.complainantAge ? t(`${fir.complainantAge} वर्ष`, `${fir.complainantAge} yrs`) : t("वयस्क", "Adult")}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Contact:</span>{" "}
                  <span data-no-translate="true" className="font-mono user-data">{fir.complainantMobile || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Address:</span>{" "}
                  <span data-no-translate="true" className="user-data">{[fir.complainantAddress, fir.complainantCity, fir.complainantDistrict].filter(Boolean).join(", ")}</span>
                </div>
              </CardContent>
            </Card>

            {/* Investigating Officer */}
            <Card className="border-slate-200 shadow-xs bg-white">
              <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Investigating Officer
                  </h3>
                </div>
                {isSho && (
                  <button
                    onClick={() => setIsAssignModalOpen(true)}
                    className="text-[11px] text-blue-600 font-bold hover:underline cursor-pointer"
                  >
                    Change IO
                  </button>
                )}
              </div>
              <CardContent className="p-4 space-y-2 text-xs">
                {fir.assignedIoName ? (
                  <>
                    <div>
                      <span className="text-slate-500 font-semibold">Assigned Officer:</span>{" "}
                      <strong className="text-slate-900">{fir.assignedIoName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 font-semibold">Rank &amp; Belt:</span>{" "}
                      <span>{fir.assignedIoRank || "IO"} ({fir.assignedIoBeltNumber || "—"})</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-semibold">Phone:</span>{" "}
                      <span className="font-mono">{fir.assignedIoPhone || "—"}</span>
                    </div>
                    {fir.assignedDirections && (
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded text-blue-900 mt-2">
                        <span className="font-bold block">SHO Directions:</span>
                        {fir.assignedDirections}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4 text-slate-500">
                    <p>No Investigating Officer assigned yet.</p>
                    {isSho ? (
                      <Button
                        size="sm"
                        onClick={() => setIsAssignModalOpen(true)}
                        className="mt-2 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                      >
                        Assign IO Now
                      </Button>
                    ) : isMhc ? (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-[11px] text-left">
                        <span className="font-bold block">PPR Rule 22.48 Statutory Authority:</span>
                        MHC cannot assign EO/IO. Allocation must be formally executed by SHO upon review.
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Occurrence Place & Time */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Occurrence of Offence
              </h3>
            </div>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-500 font-semibold block">Date &amp; Time</span>
                <strong className="text-slate-900">
                  {fir.incidentDateFrom} {fir.incidentTimeFrom || ""}
                </strong>
                {fir.incidentDateTo && (
                  <span className="text-slate-500 block text-[11px]">to {fir.incidentDateTo} {fir.incidentTimeTo || ""}</span>
                )}
              </div>
              <div className="md:col-span-2">
                <span className="text-slate-500 font-semibold block">Place of Occurrence</span>
                <strong className="text-slate-900">{fir.incidentPlace}</strong>
                {fir.incidentLandmark && (
                  <span className="text-slate-500 block text-[11px]">Landmark: {fir.incidentLandmark}</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Accused Persons */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Accused Details
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {fir.accusedList?.length || 0} Listed
              </span>
            </div>
            <CardContent className="p-4 space-y-2 text-xs">
              {fir.accusedList && fir.accusedList.length > 0 ? (
                fir.accusedList.map((acc, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="font-bold text-slate-900">
                      {idx + 1}. {acc.name} {acc.fatherName ? `(S/o ${acc.fatherName})` : ""}
                    </div>
                    {acc.address && <p className="text-slate-600 mt-0.5">Address: {acc.address}</p>}
                    {acc.physicalDescription && (
                      <p className="text-slate-500 mt-0.5 text-[11px]">Description: {acc.physicalDescription}</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-slate-500 italic">No accused persons specified.</p>
              )}
            </CardContent>
          </Card>

          {/* FIR Substance / Tehreer Content */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
              <FileText className="w-4 h-4 text-red-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Contents of FIR / Tehreer (First Information Substance)
              </h3>
            </div>
            <CardContent className="p-5 text-xs font-serif leading-relaxed text-slate-900 whitespace-pre-wrap">
              {fir.incidentDetails}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 2. CASE DIARIES / ZIMNI TAB */}
      {activeTab === "case_diaries" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Statutory Case Diaries (Zimni under Section 175 BNSS)
              </h3>

            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => router.push(`/fir-workspace/zimni?firId=${fir.id}`)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 shadow-xs"
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span>Generate Zimni</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const nextNum = (fir.caseDiaries?.length || 0) + 1;
                  setUploadZimniTitle(`Zimni No. ${nextNum}: `);
                  setUploadZimniOfficer(fir.assignedIoName || currentUser.name || "IO");
                  setIsUploadZimniModalOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-xs"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Zimni</span>
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {fir.caseDiaries && fir.caseDiaries.length > 0 ? (
              fir.caseDiaries.map((cd, idx) => (
                <Card key={cd.id || idx} className="border-slate-200 shadow-xs bg-white">
                  <CardContent className="p-4 space-y-2 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2 gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold px-2 py-0.5 bg-amber-100 text-amber-900 rounded text-[11px]">
                          Zimni #{fir.caseDiaries!.length - idx}
                        </span>
                        <strong className="text-slate-900">{cd.summary}</strong>
                        {cd.isUploaded && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                            Uploaded Copy
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className="text-[11px] text-slate-500 font-mono hidden md:inline">
                          {cd.date} at {cd.time} • {cd.officer}
                        </span>

                        <Button
                          size="sm"
                          type="button"
                          onClick={() => handlePreviewCaseDiary(cd)}
                          className="text-xs h-7 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-semibold gap-1 shadow-2xs cursor-pointer"
                          title="Instant preview of original case diary"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                          <span>Preview</span>
                        </Button>

                        <Button
                          size="sm"
                          type="button"
                          onClick={() => handleDownloadCaseDiary(cd)}
                          className="text-xs h-7 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg font-semibold gap-1 shadow-2xs cursor-pointer"
                          title="Download original case diary document"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-600" />
                          <span>Download</span>
                        </Button>

                        <Button
                          size="sm"
                          type="button"
                          onClick={() => handleDeleteCaseDiary(cd.id)}
                          className="text-xs h-7 px-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg font-semibold gap-1 shadow-2xs cursor-pointer"
                          title="Delete this case diary record"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                          <span>Delete</span>
                        </Button>
                      </div>
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap leading-relaxed font-serif pt-1">
                      {cd.details}
                    </p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-3">
                <ScrollText className="w-8 h-8 text-slate-400 mx-auto" />
                <div>
                  <p className="text-xs font-bold text-slate-700">No Case Diaries Recorded Yet</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Click &apos;Generate Zimni&apos; to draft in Investigation Workspace or &apos;Upload Zimni&apos; to attach scanned docket.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => router.push(`/fir-workspace/zimni?firId=${fir.id}`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5"
                  >
                    <ScrollText className="w-3.5 h-3.5" />
                    <span>Generate Zimni</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const nextNum = (fir.caseDiaries?.length || 0) + 1;
                      setUploadZimniTitle(`Zimni No. ${nextNum}: `);
                      setUploadZimniOfficer(fir.assignedIoName || currentUser.name || "IO");
                      setIsUploadZimniModalOpen(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload Zimni</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. DOCUMENTS TAB */}
      {activeTab === "documents" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span>Case Files, Memos &amp; Evidentiary Documents</span>
              </h3>

            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Generate Document Dropdown */}
              <div className="relative" ref={generateDocDropdownRef}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGenerateDocDropdownOpen(!generateDocDropdownOpen)}
                  className="gap-1.5 text-xs font-semibold border-purple-200 text-purple-900 bg-purple-50/70 hover:bg-purple-100 cursor-pointer shadow-2xs"
                  title="Generate statutory notice or crime memo"
                >
                  <ScrollText className="w-3.5 h-3.5 text-purple-700" />
                  <span>Generate Document</span>
                  <ChevronDown
                    className={`w-3 h-3 text-purple-600 transition-transform duration-200 ${
                      generateDocDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </Button>

                {generateDocDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-84 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-40 animate-in fade-in-50 zoom-in-95">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-purple-800">
                        Select Statutory Document Template
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Preloaded with FIR #{fir.firNumber}
                      </p>
                    </div>
                    <div className="py-1">
                      {FIR_DOC_TEMPLATES.map((tmpl) => {
                        const IconComponent = tmpl.icon;
                        return (
                          <button
                            key={tmpl.key}
                            type="button"
                            onClick={() => handleGenerateDocumentTemplate(tmpl.key)}
                            className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-purple-50 hover:text-purple-900 transition-colors flex items-center gap-2.5 group cursor-pointer"
                          >
                            <div className="p-1.5 rounded-md bg-purple-50 text-purple-700 group-hover:bg-purple-100 shrink-0">
                              <IconComponent className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-slate-800 group-hover:text-purple-950 truncate">
                                {tmpl.label}
                              </p>
                              <p className="text-[10px] text-slate-400 group-hover:text-purple-700 truncate">
                                {tmpl.desc}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Upload Document Button */}
              <Button
                size="sm"
                onClick={() => setIsDocModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 shadow-sm cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Document</span>
              </Button>

              {/* Crime Details Form (IIF-II) Button in Docs Tab */}
              <Button
                size="sm"
                onClick={() => setIsCrimeDetailsOpen(true)}
                className={`font-bold text-xs gap-1.5 cursor-pointer transition-all ${
                  !isCrimeDetailsFilled
                    ? "bg-amber-600 hover:bg-amber-700 text-white shadow-[0_0_15px_rgba(245,158,11,0.8)] animate-pulse ring-2 ring-amber-400"
                    : "border-indigo-300 text-indigo-900 bg-indigo-50/70 hover:bg-indigo-100"
                }`}
                variant={!isCrimeDetailsFilled ? "primary" : "outline"}
                title={
                  !isCrimeDetailsFilled
                    ? "अनिवार्य: अपराध विवरण प्रपत्र (IIF-II) दर्ज करें ताकि गिरफ़्तारी प्रपत्र तैयार किए जा सकें"
                    : "CCTNS Integrated Investigation Form II (IIF-II)"
                }
              >
                {!isCrimeDetailsFilled ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-200 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                  </span>
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>
                  {!isCrimeDetailsFilled
                    ? "Crime Details (IIF-II) • अनिवार्य"
                    : "Crime Details (IIF-II)"}
                </span>
              </Button>
            </div>
          </div>

          {combinedFirDocuments && combinedFirDocuments.length > 0 ? (
            <Card className="border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Document / File Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Uploaded By</th>
                      <th className="py-3 px-4">Date &amp; Time</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {combinedFirDocuments.map((doc) => {
                      const evidenceRec =
                        doc.evidenceRecord ||
                        universalEvidenceService.getAll().find(
                          (r) =>
                            r.fileId === doc.id ||
                            r.id === doc.id ||
                            (doc.fileName && r.rawDocument?.fileName?.toLowerCase() === doc.fileName?.toLowerCase())
                        );

                      return (
                        <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 space-y-1">
                                <p className="truncate font-bold text-slate-900" title={doc.title}>
                                  {doc.title}
                                </p>
                                <p className="text-[11px] text-slate-500 font-mono truncate" title={doc.fileName}>
                                  {doc.fileName} {doc.fileSize ? `(${doc.fileSize})` : ""}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                  {evidenceRec?.processingStatus === "PROCESSING" || (evidenceRec?.id && retryingEvidenceIds.has(evidenceRec.id)) ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded animate-pulse">
                                      <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-600" />
                                      Processing...
                                    </span>
                                  ) : evidenceRec?.processingStatus === "FAILED" ? (
                                    <button
                                      type="button"
                                      onClick={() => handleRetryEvidence(evidenceRec.id)}
                                      title={evidenceRec.errorMessage ? `${evidenceRec.errorMessage} — Click to retry processing` : "Processing failed — Click to restart processing"}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-300 hover:border-red-400 px-1.5 py-0.5 rounded cursor-pointer transition-colors shadow-2xs group"
                                    >
                                      <AlertTriangle className="w-2.5 h-2.5 text-red-600 group-hover:scale-110 transition-transform" />
                                      <span>Processing Failed</span>
                                      <span className="text-[9px] underline font-semibold text-red-700 ml-0.5">(Retry)</span>
                                    </button>
                                  ) : null}

                                  {(evidenceRec?.rawDocument?.sha256Hash || doc.dataUrl || doc.fileUrl) && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shadow-2xs"
                                      title={
                                        evidenceRec?.rawDocument?.sha256Hash
                                          ? `Authoritative Original Document • SHA-256: ${evidenceRec.rawDocument.sha256Hash}`
                                          : "Authoritative Original Document"
                                      }
                                    >
                                      <ShieldCheck className="w-2.5 h-2.5 text-blue-600" />
                                      Original
                                    </span>
                                  )}

                                  {doc.originSource && doc.originSource !== "FIR Investigation" && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded shadow-2xs"
                                      title="Preserved from Citizen Intake Complaint"
                                    >
                                      <Archive className="w-2.5 h-2.5 text-purple-600" />
                                      {doc.originSource}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {doc.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700">{doc.uploadedBy}</td>
                          <td className="py-3 px-4 text-slate-500 font-mono">
                            {doc.uploadedAt}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Retry (if failed) */}
                              {evidenceRec?.processingStatus === "FAILED" && (
                                <button
                                  type="button"
                                  disabled={retryingEvidenceIds.has(evidenceRec.id)}
                                  onClick={() => handleRetryEvidence(evidenceRec.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-2xs"
                                  title="Restart processing failed evidence"
                                >
                                  {retryingEvidenceIds.has(evidenceRec.id) ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 text-amber-700 animate-spin" />
                                      <span>Processing...</span>
                                    </>
                                  ) : (
                                    <>
                                      <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                                      <span>Retry</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {/* Preview */}
                              <button
                                type="button"
                                onClick={() => handleOpenDocPreview(doc)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                                title="Instant Preview without downloading"
                              >
                                <Eye className="w-3.5 h-3.5 text-blue-600" />
                                <span>Preview</span>
                              </button>

                              {/* Download */}
                              <a
                                href={
                                  evidenceRec
                                    ? `/api/evidence/download?id=${evidenceRec.id}&type=original`
                                    : doc.dataUrl || doc.fileUrl || "#"
                                }
                                download={doc.fileName}
                                onClick={(e) => {
                                  if (!evidenceRec && (!doc.dataUrl || !doc.fileUrl)) {
                                    e.preventDefault();
                                    handleDownloadDocument(doc);
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                                title="Download document"
                              >
                                <Download className="w-3.5 h-3.5 text-slate-600" />
                                <span>Download</span>
                              </a>

                              {/* Delete (only for directly uploaded FIR documents) */}
                              {(!doc.originSource || doc.originSource === "FIR Investigation") && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDocument(doc.id)}
                                  className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors inline-flex items-center cursor-pointer"
                                  title="Delete document"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-3">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">No Evidentiary Documents Attached</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload Tehreer copy, site plans, seizure memos or witness statements.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDocModalOpen(true)}
                className="gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5 text-blue-600" />
                <span>Upload Document</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* TAB: LEGAL ASSISTANT (BNS, BNSS, BSA Statutory Analysis & Bare Act Indexing) */}
      <div className={activeTab === "legal_assistant" ? "block animate-in fade-in-20" : "hidden"}>
        <FIRLegalAssistant
          fir={fir}
          onUpdateFir={async (updated) => {
            setFir(updated);
            if (updated.legalAnalysis) {
              try {
                await firService.saveLegalAnalysis(updated.id, updated.legalAnalysis);
              } catch (e) {
                console.error("Failed to persist FIR legal analysis", e);
              }
            }
          }}
        />
      </div>

      {/* 4. SUMMARY TAB */}
      <div className={activeTab === "summary" ? "block animate-in fade-in-20" : "hidden"}>
        <FIRSummaryTab
          fir={fir}
          currentUser={currentUser}
          onUpdateFir={async (updated) => {
            setFir(updated);
            await firService.updateFir(updated.id, updated);
          }}
        />
      </div>

      {/* 5. REPORTS TAB (Official Reports Docket) */}
      {activeTab === "reports" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-600" />
                <span>Police Reports &amp; Final Form Docket (Section 193 BNSS)</span>
              </h3>

            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Upload Report Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUploadReportModalOpen(true)}
                className="gap-1.5 text-xs font-semibold border-slate-300 text-slate-800 bg-slate-50 hover:bg-slate-100 cursor-pointer shadow-2xs"
              >
                <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
                <span>Upload Report</span>
              </Button>

              {/* Generate Report Split-Dropdown */}
              <div className="relative" ref={generateReportDropdownRef}>
                <div className="inline-flex rounded-lg shadow-xs">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleOpenGenerateReportDraft("CHARGESHEET")}
                    className="gap-1.5 text-xs font-bold bg-[#0b192c] hover:bg-slate-900 text-white rounded-r-none cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Generate Report</span>
                  </Button>
                  <button
                    type="button"
                    onClick={() => setGenerateReportDropdownOpen(!generateReportDropdownOpen)}
                    className="px-2 py-1.5 bg-[#0b192c] hover:bg-slate-900 text-white border-l border-slate-700 rounded-r-lg transition-colors cursor-pointer"
                    title="Select Report Type"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-amber-300 transition-transform duration-200 ${
                        generateReportDropdownOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </div>

                {generateReportDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-slate-200 p-2 z-40 animate-in fade-in-50 zoom-in-95">
                    <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>Select Statutory Report (5 Types)</span>
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Preloaded with FIR #{fir.firNumber}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono bg-amber-50 text-amber-900 px-1.5 py-0.5 rounded border border-amber-200">
                        Auto Draft
                      </span>
                    </div>
                    <div className="py-1.5 space-y-1">
                      {FIR_REPORT_OPTIONS.map((cat) => {
                        const IconComponent = cat.icon;
                        return (
                          <button
                            key={cat.key}
                            type="button"
                            onClick={() => handleOpenGenerateReportDraft(cat.key)}
                            className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-amber-50/80 transition-colors flex items-center gap-2.5 group cursor-pointer border border-transparent hover:border-amber-200"
                          >
                            <div className="p-2 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-amber-100 group-hover:text-amber-800 shrink-0">
                              <IconComponent className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <p className="font-bold text-slate-800 group-hover:text-amber-950 truncate">
                                  {cat.label}
                                </p>
                                <span className="text-[10px] font-mono text-slate-400 group-hover:text-amber-700 font-semibold">
                                  BNSS 193
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 group-hover:text-amber-800 truncate">
                                {cat.desc}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Final Report Button */}
              <Button
                data-agent-section="Reports toolbar"
                size="sm"
                onClick={() => { setEditingFinalReport(undefined); setIsFinalReportModalOpen(true); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-sm cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Final Report</span>
              </Button>
            </div>
          </div>

          {linkedReportNotice && <div role="status" className="p-3 border bg-blue-50 text-sm">{linkedReportNotice.message} {linkedReportNotice.report && <button className="underline" onClick={() => { const latest = backendReports.find(item => item.id === linkedReportNotice.report?.id); if (latest) { setReviewPreviewLoaded(false); setReportPreviewItem(latest); setLinkedReportNotice(undefined); } }}>Open latest revision</button>}</div>}
          {reportBackendError && <div role="alert" className="p-3 border border-red-200 bg-red-50 text-red-800 text-sm">{reportBackendError} <button className="underline" onClick={() => setReportRefresh(n => n + 1)}>Retry backend reports</button></div>}
          {reportHistory.length > 0 && <details className="border rounded-lg p-3 bg-slate-50 text-xs"><summary className="cursor-pointer font-bold">Final report history — {reportHistory.length} recorded steps</summary><ol className="space-y-2 mt-3">{reportHistory.map(event => <li key={event.id}>{event.createdAt} · {event.action} · v{event.version} · {event.actorId}</li>)}</ol></details>}
          {/* Reports List */}
          {displayReports && displayReports.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {displayReports.map((report) => {
                const isDraftStatus = report.status === "Draft";
                const isShoAuthored = /\bSHO\b/i.test(report.createdByRole || "") || /\bSHO\b/i.test(report.officerRank || "");
                return (
                  <Card key={report.id} className="border-slate-200 shadow-xs hover:shadow-md transition-shadow bg-white">
                    <CardContent className="p-4 space-y-3 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Type Badge */}
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-mono flex items-center gap-1">
                              ⚖️ {report.reportTypeLabel || report.reportType}
                            </span>

                            {/* Version Number */}
                            {report.versionNumber && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300 font-mono">
                                v{report.versionNumber}
                              </span>
                            )}

                            {/* Status Badge */}
                            {report.sentToSo ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono flex items-center gap-1">
                                <Send className="w-3 h-3 text-emerald-600" />
                                <span>Sent to SO{report.soName ? ` · ${report.soName}` : ""}</span>
                              </span>
                            ) : report.sentToSho ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-300 font-mono flex items-center gap-1">
                                <Send className="w-3 h-3 text-blue-600" />
                                <span>Sent to SHO</span>
                              </span>
                            ) : isDraftStatus ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-mono">
                                Status: Draft
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono flex items-center gap-1">
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                <span>Saved in Case</span>
                              </span>
                            )}

                            {report.isUploaded && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                Uploaded File
                              </span>
                            )}
                          </div>

                          <h4 className="font-bold text-sm text-slate-900 truncate">
                            {report.title}
                          </h4>
                          {report.dispatchNo && (
                            <p className="font-mono text-[11px] text-slate-500">
                              Dispatch: <strong className="text-slate-800">{report.dispatchNo}</strong>
                            </p>
                          )}
                        </div>

                        <span className="text-[11px] text-slate-400 font-mono shrink-0">
                          {formatDate(report.generatedDate || report.createdAt || new Date().toISOString())}
                        </span>
                      </div>

                      {report.finalReportData && <div className="text-xs bg-blue-50 rounded p-2 space-y-1"><p><strong>{report.reportType === "CHARGESHEET" ? `Challan: ${report.finalReportData.chargeSheetType}` : `Final Report: ${report.reportType} — ${report.finalReportData.finalReportReason}`}</strong></p><p>Investigation: {report.finalReportData.investigationStatus}</p><p>Review: {report.finalReportWorkflow?.state === "SENT_TO_SHO" ? "Pending SHO View" : report.finalReportWorkflow?.state === "SHO_VIEWED" ? "Pending SHO Decision" : report.finalReportWorkflow?.state === "SENT_TO_SO" ? "Pending SO View" : report.finalReportWorkflow?.state === "SO_VIEWED" ? "Pending SO Decision" : report.finalReportWorkflow?.state === "REJECTED" ? "Returned to IO" : report.finalReportWorkflow?.state?.replaceAll("_", " ")}</p>{report.finalReportWorkflow?.rejectionReason && <p className="text-red-700">Returned to {report.finalReportWorkflow.assignedIoName || "assigned IO"}: {report.finalReportWorkflow.rejectionReason}</p>}{report.finalReportWorkflow?.soFinalStatus && <p className="text-emerald-700">SO final status: {report.finalReportWorkflow.soFinalStatus}</p>}<p>Accused: {report.finalReportData.accused.map(a => `${a.name} (${a.action})`).join(", ") || "No accused recorded"}</p><p>✓ Final Submit saved · {report.sentToSho ? "✓ Sent to SHO" : "Pending: Send to SHO"} · {report.finalReportWorkflow?.chiNumber ? `✓ CHI ${report.finalReportWorkflow.chiNumber} — ${report.finalReportWorkflow.state}` : "Pending: CHI submission in FIR Part B"}</p></div>}
                      {report.conclusionSummary && (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-sans line-clamp-2">
                          <span className="font-bold text-slate-900">Findings: </span>
                          {report.conclusionSummary}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                        <span>
                          Created By: <strong className="text-slate-800">{report.officerName || report.createdBy || "IO"}</strong> ({report.officerRank || "IO"})
                        </span>
                        <span className="font-mono uppercase font-semibold">
                          {report.fileFormat || "PDF"} {report.fileSize ? `• ${report.fileSize}` : ""}
                        </span>
                      </div>

                      {/* Action buttons: View, Edit, Download, Print, New Version, Send to Supervisory */}
                      <div className="pt-1 flex flex-wrap items-center justify-end gap-1.5">
                        {/* 1. View / Preview */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => { setReviewPreviewLoaded(false); setReportPreviewItem(report); }}
                          className="text-[11px] h-7 px-2.5 gap-1 border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                          title="View report details"
                        >
                          <Eye className="w-3 h-3 text-blue-600" />
                          <span>View</span>
                        </Button>

                        {/* 2. Edit */}
                        {!report.isUploaded && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditReport(report)}
                            className="text-[11px] h-7 px-2.5 gap-1 border-slate-200 text-amber-800 bg-amber-50/50 hover:bg-amber-100 cursor-pointer font-semibold"
                            title="Edit this report"
                          >
                            <Edit3 className="w-3 h-3 text-amber-600" />
                            <span>Edit</span>
                          </Button>
                        )}

                        {/* 3. Download */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadReport(report)}
                          className="text-[11px] h-7 px-2.5 gap-1 border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                          title="Download report file"
                        >
                          <Download className="w-3 h-3 text-emerald-600" />
                          <span>Download</span>
                        </Button>

                        {/* 4. Print */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handlePrintReport(report)}
                          className="text-[11px] h-7 px-2.5 gap-1 border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                          title="Print official report"
                        >
                          <Printer className="w-3 h-3 text-blue-600" />
                          <span>Print</span>
                        </Button>

                        {/* 5. Create New Version */}
                        {!report.isUploaded && !report.finalReportData && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateNewVersion(report)}
                            className="text-[11px] h-7 px-2.5 gap-1 border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100 cursor-pointer font-semibold"
                            title="Create new version based on this report"
                          >
                            <Plus className="w-3 h-3 text-purple-600" />
                            <span>New Version</span>
                          </Button>
                        )}

                        {/* 6. Role-specific forwarding: IO -> SHO, SHO -> SO */}
                        {!isShoAuthored && !report.sentToSho && !report.sentToSo && (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => handleSendReportToSupervisory(report)}
                            className="text-[11px] h-7 px-2.5 gap-1 bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer shadow-xs"
                            title="Send this Report to SHO for Review & Approval"
                          >
                            <Send className="w-3 h-3" />
                            <span>Send to SHO</span>
                          </Button>
                        )}
                        {isShoAuthored && isShoOrAbove && !report.sentToSo && (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => handleOpenShoSendToSoModal(report)}
                            disabled={sendingReportToSo}
                            className="text-[11px] h-7 px-2.5 gap-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer shadow-xs"
                            title="Forward this SHO report to SO for final decision"
                          >
                            <Send className="w-3 h-3" />
                            <span>{sendingReportToSo && selectedReportForSo?.id === report.id ? "Sending..." : "Send To SO"}</span>
                          </Button>
                        )}
                        {report.sentToSho && !report.sentToSo && (
                          <span className="text-[10px] font-bold px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 font-mono">
                            <Check className="w-3 h-3 text-blue-600" />
                            <span>Sent to SHO</span>
                          </span>
                        )}
                        {report.sentToSo && (
                          <span className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 font-mono">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Sent to SO</span>
                          </span>
                        )}

                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-3">
              <Scale className="w-8 h-8 text-slate-400 mx-auto" />
              <div>
                <p className="text-xs font-bold text-slate-700">Investigation In Progress</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  When investigation concludes, the IO will file the Final Report (Chargesheet or Closure) under Sec 193 BNSS.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => handleOpenGenerateReportDraft("CHARGESHEET")}
                  className="bg-[#0b192c] hover:bg-slate-900 text-white font-bold text-xs gap-1.5 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Draft Chargesheet</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsFinalReportModalOpen(true)}
                  data-agent-section="Investigation In Progress"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-sm cursor-pointer"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>Final Report</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. HISTORY & AUDIT TAB */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900">
            Chronological Investigation Timeline &amp; Audit Trail
          </h3>
          <div className="space-y-3">
            {fir.timeline && fir.timeline.length > 0 ? (
              fir.timeline.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 bg-white border border-slate-200 rounded-lg flex items-start gap-3 text-xs"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <strong className="text-slate-900">{evt.title}</strong>
                      <span className="text-[10px] text-slate-400 font-mono">{evt.date}</span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{evt.description}</p>
                    <span className="text-[10px] text-slate-500 mt-1 inline-block">
                      Action By: {evt.actor}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic">No timeline entries recorded.</p>
            )}
          </div>
        </div>
      )}

      {/* 7. CONFIDENTIAL DOSSIER TAB */}
      {activeTab === "confidential_dossier" && (
        <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <Lock className="w-8 h-8 text-slate-400 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">Restricted Supervisory Dossier</h4>

        </div>
      )}

      {/* Statutory Receipt Modal */}
      {isReceiptOpen && (
        <FIRReceiptModal
          fir={fir}
          isOpen={isReceiptOpen}
          onClose={() => setIsReceiptOpen(false)}
        />
      )}

      {/* Re-open Completed Case Modal */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-purple-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-purple-300" />
                <h3 className="text-sm font-bold">Re-open Completed FIR ({fir.firNumber})</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReopenModalOpen(false)}
                className="text-purple-300 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleDetailReopenSubmit} className="p-4 space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-800">Reason for Reopening *</label>
                <textarea
                  required
                  rows={3}
                  value={reopenReasonText}
                  onChange={(e) => setReopenReasonText(e.target.value)}
                  placeholder="Further investigation / fresh evidence / Court directions..."
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700">Concerned Court</label>
                  <input
                    type="text"
                    value={reopenCourt}
                    onChange={(e) => setReopenCourt(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Order / Reference No.</label>
                  <input
                    type="text"
                    value={reopenOrderNo}
                    onChange={(e) => setReopenOrderNo(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Order Date</label>
                <DatePickerDDMMYYYY
                  size="sm"
                  max={getTodayIsoIST()}
                  value={reopenOrderDt}
                  onValueChange={setReopenOrderDt}
                  placeholder="DD/MM/YYYY"
                  className="w-full"
                />
              </div>
              <div className="pt-2 border-t border-slate-200">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reopenConfirmedDetail}
                    onChange={(e) => setReopenConfirmedDetail(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-700">
                    मैं प्रमाणित करता हूँ कि सक्षम न्यायालय अथवा पुलिस अधीक्षक/वरिष्ठ अधिकारी के निर्देशानुसार इस केस में वैधानिक अग्रिम विवेचना (Further Investigation) हेतु पुनः खोलने की अनुमति प्रदान की गई है।
                  </span>
                </label>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsReopenModalOpen(false)}
                  disabled={isSubmittingReopenDetail}
                >
                  रद्द करें
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingReopenDetail || !reopenConfirmedDetail}
                  className="bg-purple-700 hover:bg-purple-800 text-white font-bold"
                >
                  {isSubmittingReopenDetail ? "पुनः खुल रहा है..." : "पुष्टि करें (Re-open)"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Statutory Final Report (IIF-V u/s 193 BNSS) Modal */}
      {isFinalReportModalOpen && fir && (
        <CctnsFinalReportModal
          fir={fir}
          existing={editingFinalReport}
          onClose={() => { setIsFinalReportModalOpen(false); setEditingFinalReport(undefined); }}
          onSaved={(report) => {
            setBackendReports(rows => [report, ...rows.filter(r => r.id !== report.id)]);
            setReportRefresh(n => n + 1);
            handleTabChange("reports");
            const updated = firService.getFirById(fir.id);
            if (updated) setFir(updated);
            fetchFir();
          }}
          currentUser={currentUser}
        />
      )}

      {/* Crime Details Form (IIF-II) Modal */}
      {isCrimeDetailsOpen && fir && (
        <CrimeDetailModal
          fir={fir}
          isOpen={isCrimeDetailsOpen}
          onClose={() => setIsCrimeDetailsOpen(false)}
          onSubmitted={(updatedFir) => {
            setFir(updatedFir);
            fetchFir();
          }}
          currentUserName={currentUser.name}
        />
      )}

      {isBailOpen && <BailDetailsModal fir={fir} user={currentUser} onClose={() => setIsBailOpen(false)} />}

      {/* Assign IO Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="p-4 bg-[#0b192c] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">
                  {fir?.assignedIoId ? "Change Investigating Officer (IO)" : "Assign Investigating Officer (IO)"}
                </h3>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="text-white hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                  Select Investigating Officer (IO) *
                </label>
                <select
                  value={selectedIoId}
                  onChange={(e) => setSelectedIoId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-red-500/20"
                >
                  <option value="">-- Choose Officer --</option>
                  {ioRosterLoading && <option disabled>Loading officers…</option>}
                  {ioRosterError && <option disabled>{ioRosterError}</option>}
                  {!ioRosterLoading && !ioRosterError && ioRoster.length === 0 && <option disabled>No eligible officers</option>}
                  {fir.assignedIoId && !ioRoster.some(officer => officer.id === fir.assignedIoId) && <option value={fir.assignedIoId} disabled>Current IO: {fir.assignedIoName || fir.assignedIoId}</option>}
                  {ioRoster.map((officer) => (
                    <option key={officer.id} value={officer.id}>
                      {officer.name} ({officer.rank} • PNO: {officer.pno})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                  Supervisory Directions (SHO Order)
                </label>
                <textarea
                  rows={3}
                  value={assignedDirections}
                  onChange={(e) => setAssignmentDirections(e.target.value)}
                  placeholder="Directions for IO..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-red-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmAssign}
                  disabled={!ioRoster.some(officer => officer.id === selectedIoId) || assignmentSubmitting}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
                >
                  {assignmentSubmitting ? "Saving..." : (fir?.assignedIoId ? "Confirm Change IO" : "Confirm IO Assignment")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Zimni Modal */}
      {/* Upload Zimni Modal */}
      {isUploadZimniModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="p-4 bg-[#0b192c] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-sm">Upload Case Diary / Zimni (केस डायरी अपलोड)</h3>
                  <p className="text-[11px] text-slate-300">Section 175 BNSS statutory case docket attachment</p>
                </div>
              </div>
              <button
                onClick={() => setIsUploadZimniModalOpen(false)}
                className="text-white hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadZimniSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                  Zimni Title / Subject *
                </label>
                <input
                  type="text"
                  value={uploadZimniTitle}
                  onChange={(e) => setUploadZimniTitle(e.target.value)}
                  placeholder="e.g. Zimni No. 1: Crime Scene Inspection and Site Plan"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                    Date of Zimni *
                  </label>
                  <DatePickerDDMMYYYY
                    size="sm"
                    max={getTodayIsoIST()}
                    value={uploadZimniDate}
                    onValueChange={setUploadZimniDate}
                    placeholder="DD/MM/YYYY"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                    Time *
                  </label>
                  <input
                    type="time"
                    value={uploadZimniTime}
                    onChange={(e) => setUploadZimniTime(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                  Investigating Officer (IO) *
                </label>
                <input
                  type="text"
                  value={uploadZimniOfficer}
                  onChange={(e) => setUploadZimniOfficer(e.target.value)}
                  placeholder="Officer Name & Rank"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                  Upload Scanned / Signed Zimni File (PDF, Word, Image)
                </label>
                <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-4 text-center bg-slate-50 transition-colors">
                  <input
                    type="file"
                    id="zimniFileInput"
                    accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.txt"
                    onChange={handleZimniFileChange}
                    className="hidden"
                  />
                  <label htmlFor="zimniFileInput" className="cursor-pointer flex flex-col items-center">
                    <UploadCloud className="w-8 h-8 text-emerald-600 mb-2" />
                    {uploadZimniFileName ? (
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-emerald-900 block truncate max-w-xs">
                          {uploadZimniFileName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {uploadZimniFileSize} • Click to change file
                        </span>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs font-bold text-slate-700">
                          Click to browse file or drag &amp; drop
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5">
                          Supports PDF, DOCX, JPG, PNG (Max 25 MB)
                        </span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                  Brief Summary / Key Actions Taken (विवेचनात्मक विवरण)
                </label>
                <textarea
                  rows={3}
                  value={uploadZimniRemarks}
                  onChange={(e) => setUploadZimniRemarks(e.target.value)}
                  placeholder="Record short synopsis or highlights of this case diary entry..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-serif leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsUploadZimniModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={uploadZimniSubmitting || !uploadZimniTitle.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                >
                  {uploadZimniSubmitting ? "Uploading..." : "Upload Zimni"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {isDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="p-4 bg-[#0b192c] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paperclip className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm">Upload Case Document</h3>
              </div>
              <button
                onClick={() => setIsDocModalOpen(false)}
                className="text-white hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDocument} className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. Site Plan / Naksha Mauka"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                  Document Category
                </label>
                <select
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="FIELD_REPORT">Site Plan / Field Inspection</option>
                  <option value="COMPLAINT_COPY">Original Tehreer / Complaint Copy</option>
                  <option value="WITNESS_STATEMENT">Witness Statement (Sec 180 BNSS)</option>
                  <option value="MEDICAL_REPORT">Medico-Legal Report (MLR)</option>
                  <option value="FORENSIC_REPORT">Forensic / FSL Report</option>
                  <option value="SEIZURE_MEMO">Seizure Memo / Fard Baramadgi</option>
                  <option value="OTHER">Other Evidentiary Record</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                  File Attachment
                </label>
                <input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setDocFileName(f.name);
                      setDocFileSize(`${(f.size / 1024).toFixed(1)} KB`);
                      const reader = new FileReader();
                      reader.onload = (loadEvt) => {
                        setDocFileDataUrl(loadEvt.target?.result as string);
                      };
                      reader.readAsDataURL(f);
                    }
                  }}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDocModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                >
                  Upload Document
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Final Form Modal */}
      {isFinalFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="p-4 bg-[#0b192c] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">File Police Final Report (u/s 193 BNSS)</h3>
              </div>
              <button
                onClick={() => setIsFinalFormModalOpen(false)}
                className="text-white hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitFinalForm} className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                  Type of Final Disposal *
                </label>
                <select
                  value={finalFormType}
                  onChange={(e) => setFinalFormType(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white font-bold"
                >
                  <option value="CHARGESHEET">Chargesheet / Challan (दोषारोप पत्र)</option>
                  <option value="CLOSURE">Closure Report / Cancellation (खारिजी रिपोर्ट)</option>
                  <option value="UNTRACED">Untraced Report (अदम सुराग)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                  Court of Judicial Magistrate *
                </label>
                <input
                  type="text"
                  value={courtName}
                  onChange={(e) => setCourtName(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-semibold"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
                  Final Findings &amp; Grounds (निष्कर्ष) *
                </label>
                <textarea
                  rows={4}
                  value={finalFormSummary}
                  onChange={(e) => setFinalFormSummary(e.target.value)}
                  placeholder="Record summary of evidence established against accused or grounds for closure..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-serif leading-relaxed"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFinalFormModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={finalFormSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                >
                  {finalFormSubmitting ? "Submitting..." : "Submit to Court"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DOCUMENT PREVIEW */}
      {docPreviewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setDocPreviewItem(null)}
          />
          <div role="dialog" aria-modal="true" className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col z-10 animate-in fade-in-0 zoom-in-95 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                    {docPreviewItem.category}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Uploaded by {docPreviewItem.uploadedBy}
                  </span>
                </div>
                <h3 className="font-bold text-sm sm:text-base text-white truncate mt-0.5">
                  {docPreviewItem.title}
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                  title="Print document"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadDocument(docPreviewItem)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                  title="Download file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDocPreviewItem(null)}
                  className="p-1.5 text-white hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100/50 flex items-center justify-center min-h-[350px]">
              {docPreviewItem.dataUrl && docPreviewItem.dataUrl.startsWith("data:text/html") ? (
                <div className="w-full h-full flex flex-col p-1 sm:p-2">
                  <iframe
                    title={docPreviewItem.title}
                    srcDoc={(() => {
                      try {
                        const raw = docPreviewItem.dataUrl.split(",")[1] || "";
                        return decodeURIComponent(raw);
                      } catch (e) {
                        return docPreviewItem.dataUrl;
                      }
                    })()}
                    className="w-full min-h-[680px] h-[78vh] bg-white rounded-xl border border-slate-300 shadow-md"
                  />
                </div>
              ) : docPreviewItem.dataUrl && docPreviewItem.dataUrl.startsWith("data:text/plain") ? (
                <div className="w-full max-w-3xl bg-white p-8 rounded-xl border border-slate-300 shadow-sm font-sans text-xs sm:text-sm text-slate-900 leading-relaxed space-y-4">
                  <div className="text-center pb-3 border-b border-slate-300">
                    <h3 className="font-black text-sm tracking-wider uppercase text-slate-900">
                      HARYANA POLICE • INVESTIGATION DOCKET
                    </h3>
                    <p className="text-xs font-bold text-slate-600 uppercase">{docPreviewItem.title}</p>
                    <p className="text-[11px] font-mono text-slate-500">
                      FIR: {fir.firNumber} • PS: {fir.policeStation}
                    </p>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-slate-800 leading-relaxed text-xs sm:text-sm">
                    {decodeURIComponent(docPreviewItem.dataUrl.split(",")[1] || "")}
                  </pre>
                </div>
              ) : (
                <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center mx-auto">
                    <FileText className="w-7 h-7" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">{docPreviewItem.title}</h4>
                  <p className="text-xs text-slate-500 font-mono">{docPreviewItem.fileName}</p>
                  <p className="text-[11px] text-slate-400">
                    Uploaded on {docPreviewItem.uploadedAt} by {docPreviewItem.uploadedBy}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => handleDownloadDocument(docPreviewItem)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </Button>
                </div>
              )}
            </div>

            <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span>Date: {docPreviewItem.uploadedAt} • Category: {docPreviewItem.category}</span>
              <Button variant="outline" size="sm" onClick={() => setDocPreviewItem(null)}>
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REPORT PREVIEW */}
      {reportPreviewItem && (() => {
        const isChargesheetOrFinal =
          reportPreviewItem.reportType === "CHARGESHEET" ||
          reportPreviewItem.reportType === "CLOSURE" ||
          reportPreviewItem.reportType === "UNTRACED" ||
          reportPreviewItem.reportType === "CANCELLED" ||
          reportPreviewItem.title?.toLowerCase().includes("final form") ||
          reportPreviewItem.title?.toLowerCase().includes("chargesheet");

        const previewHtml =
          reportPreviewItem.contentHtml ||
          (isChargesheetOrFinal && fir
            ? generateIIFVChargesheetHtmlFromFir(fir, reportPreviewItem, currentUser)
            : undefined);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              onClick={() => setReportPreviewItem(null)}
            />
            <div role="dialog" aria-modal="true" className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full h-[92vh] flex flex-col z-10 animate-in fade-in-0 zoom-in-95 overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                      {reportPreviewItem.reportTypeLabel || reportPreviewItem.reportType}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {reportPreviewItem.dispatchNo || "DISP/2026/FIR"}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-white truncate mt-0.5">
                    {reportPreviewItem.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handlePrintReport(reportPreviewItem)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                    title="Print authentic legal report"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print A4</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadReport(reportPreviewItem)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                    title="Download report file"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReportPreviewItem(null)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {reportPreviewItem.finalReportData && currentUser.role === "SHO" && currentUser.stationName === fir.policeStation && ['SENT_TO_SHO', 'SHO_VIEWED', 'REJECTED', 'UNDER_CHECKING'].includes(reportPreviewItem.finalReportWorkflow?.state || '') && <FinalReportShoReview key={`${reportPreviewItem.id}-${reportPreviewItem.versionNumber}`} report={reportPreviewItem} userId={currentUser.id} loaded={reviewPreviewLoaded} onUpdated={saved => { setReportPreviewItem(saved); setBackendReports(rows => rows.map(row => row.id === saved.id ? saved : row)); setReportRefresh(n => n + 1); }} />}
              {reportPreviewItem.finalReportData && isSuperior && ['SENT_TO_SO', 'SO_VIEWED'].includes(reportPreviewItem.finalReportWorkflow?.state || '') && <FinalReportSoReview key={`${reportPreviewItem.id}-${reportPreviewItem.versionNumber}-so`} report={reportPreviewItem} userId={currentUser.id} loaded={reviewPreviewLoaded} onUpdated={saved => { setReportPreviewItem(saved); setBackendReports(rows => rows.map(row => row.id === saved.id ? saved : row)); setReportRefresh(n => n + 1); }} />}
              {previewHtml ? (
                /* Authentic Statutory A4 Proforma (Identical to Step 2 Statutory Preview) */
                <div className="flex-1 w-full bg-slate-100 overflow-hidden flex flex-col">
                  <iframe
                    title={reportPreviewItem.title}
                    srcDoc={previewHtml}
                    onLoad={() => setReviewPreviewLoaded(true)}
                    className="w-full h-full border-0 bg-white"
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100/50 flex items-center justify-center min-h-[400px]">
                  <div className="w-full max-w-3xl bg-white p-8 rounded-xl border border-slate-300 shadow-sm font-sans text-xs sm:text-sm text-slate-900 leading-relaxed space-y-4">
                    <div className="text-center pb-3 border-b-2 border-slate-900">
                      <div className="inline-block px-3 py-1 bg-slate-900 text-white font-mono font-bold text-[10px] rounded uppercase mb-1">
                        State Police Department • State of Haryana
                      </div>
                      <h3 className="font-black text-base tracking-wider uppercase text-slate-900">
                        HARYANA POLICE
                      </h3>
                      <p className="text-xs font-bold text-slate-700 uppercase">{reportPreviewItem.title}</p>
                      <div className="flex items-center justify-center gap-4 text-[11px] font-mono text-slate-500 mt-1">
                        <span>Dispatch No: {reportPreviewItem.dispatchNo || "N/A"}</span>
                        <span>•</span>
                        <span>Date: {formatDate(reportPreviewItem.generatedDate)}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-semibold mt-1">
                        FIR No: {fir.firNumber} | Police Station: {fir.policeStation} | District: {fir.district}
                      </p>
                    </div>

                    <div className="whitespace-pre-wrap text-slate-800 leading-relaxed font-sans pt-2">
                      {reportPreviewItem.content || reportPreviewItem.conclusionSummary || "Statutory report drafted for judicial submission."}
                    </div>

                    <div className="pt-8 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                      <div>
                        <p className="font-bold text-slate-800">Station House Officer</p>
                        <p className="text-[11px] text-slate-500">Police Station {fir.policeStation}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-800">
                          {reportPreviewItem.officerName || fir.assignedIoName || "Investigating Officer"}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {reportPreviewItem.officerRank || "IO / SI"} • CMS Verified
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
                <span>Date: {formatDate(reportPreviewItem.generatedDate)} • Officer: {reportPreviewItem.officerName}</span>
                <Button variant="outline" size="sm" onClick={() => setReportPreviewItem(null)}>
                  Close Preview
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: UPLOAD SIGNED REPORT */}
      {uploadReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setUploadReportModalOpen(false)}
          />
          <div role="dialog" aria-modal="true" className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-5 z-10 animate-in fade-in-0 zoom-in-95 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-emerald-600" />
                <span>Upload Signed Police Report</span>
              </h3>
              <button
                onClick={() => setUploadReportModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadReportSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Report Title *</label>
                <input
                  type="text"
                  required
                  value={uploadReportTitle}
                  onChange={(e) => setUploadReportTitle(e.target.value)}
                  placeholder="e.g. Signed Final Chargesheet u/s 193 BNSS / Closure Report"
                  className="w-full rounded-lg border border-slate-300 p-2 text-slate-900 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Report Type</label>
                  <select
                    value={uploadReportType}
                    onChange={(e) => setUploadReportType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-slate-900 bg-white"
                  >
                    <option value="CHARGESHEET">Final Form / Chargesheet</option>
                    <option value="CLOSURE">Closure Report / Cancellation</option>
                    <option value="UNTRACED">Untraced Report</option>
                    <option value="PROGRESS">Interim Progress Report</option>
                    <option value="ABATED">Abated Report</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Dispatch / Ref No.</label>
                  <input
                    type="text"
                    value={uploadReportDispatch}
                    onChange={(e) => setUploadReportDispatch(e.target.value)}
                    placeholder={`e.g. DISP/${fir.firYear || 2026}/REP-01`}
                    className="w-full rounded-lg border border-slate-300 p-2 text-slate-900 bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Upload Signed Document (PDF, Word, Scan) *
                </label>
                <input
                  type="file"
                  name="signedReport"
                  required
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Findings / Conclusion Summary
                </label>
                <textarea
                  rows={2}
                  value={uploadReportRemarks}
                  onChange={(e) => setUploadReportRemarks(e.target.value)}
                  placeholder="Summary of investigation findings, statutory prayer or grounds..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Investigation Status Outcome <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setUploadReportOutcome("Complete")}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      uploadReportOutcome === "Complete"
                        ? "border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/20"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-emerald-950">1. Complete</span>
                      {uploadReportOutcome === "Complete" && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 leading-tight">
                      Investigation completed. Ready for court submission.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUploadReportOutcome("Pending")}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      uploadReportOutcome === "Pending"
                        ? "border-amber-500 bg-amber-50/80 ring-2 ring-amber-500/20"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-amber-950">2. Interim</span>
                      {uploadReportOutcome === "Pending" && (
                        <CheckCircle2 className="w-4 h-4 text-amber-600" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 leading-tight">
                      Interim progress report. Investigation ongoing.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUploadReportOutcome("Chargesheet")}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      uploadReportOutcome === "Chargesheet"
                        ? "border-red-500 bg-red-50/80 ring-2 ring-red-500/20"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-red-950">3. Chargesheet</span>
                      {uploadReportOutcome === "Chargesheet" && (
                        <CheckCircle2 className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 leading-tight">
                      Prima facie case established against accused.
                    </p>
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setUploadReportModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                >
                  Save Report to Docket
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DRAFT / EDIT REPORT */}
      {reportDraftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setReportDraftModalOpen(false)}
          />
          <div role="dialog" aria-modal="true" className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-5 z-10 animate-in fade-in-0 zoom-in-95 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    {activeDraftReport ? "Edit Statutory Report" : "Draft Statutory Police Report"}
                  </h3>

                </div>
              </div>
              <button
                onClick={() => setReportDraftModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReportDraft} className="space-y-3.5 text-xs flex-1 flex flex-col overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-semibold text-slate-700 block mb-1">Report Title *</label>
                  <input
                    type="text"
                    required
                    value={reportDraftTitle}
                    onChange={(e) => setReportDraftTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 font-medium text-slate-900 bg-white"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Dispatch No.</label>
                  <input
                    type="text"
                    value={reportDraftDispatchNo}
                    onChange={(e) => setReportDraftDispatchNo(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 font-mono text-slate-900 bg-white"
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-[250px]">
                <label className="font-semibold text-slate-700 block mb-1">
                  Report Findings &amp; Statutory Text *
                </label>
                <textarea
                  required
                  rows={12}
                  value={reportDraftContent}
                  onChange={(e) => setReportDraftContent(e.target.value)}
                  className="w-full flex-1 rounded-xl border border-slate-300 p-3 font-mono text-xs text-slate-900 bg-slate-50 leading-relaxed resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <span className="text-[11px] text-slate-500">
                  You can print or download this report anytime from the Reports docket.
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => setReportDraftModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    type="submit"
                    className="bg-[#0b192c] hover:bg-slate-900 text-white font-bold"
                  >
                    Save Report to Case
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CASE DIARY PREVIEW */}
      {caseDiaryPreviewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => {
              setCaseDiaryPreviewItem(null);
              setCaseDiaryPreviewUrl("");
            }}
          />
          <div role="dialog" aria-modal="true" className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col z-10 animate-in fade-in-0 zoom-in-95 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                    Case Diary Zimni #{caseDiaryPreviewItem.zimniNumber || 1}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    FIR: {fir?.firNumber}
                  </span>
                </div>
                <h3 className="font-bold text-sm sm:text-base text-white truncate mt-1">
                  {caseDiaryPreviewItem.summary || "Case Diary Record"}
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const iframe = document.getElementById("case-diary-preview-iframe") as HTMLIFrameElement;
                    if (iframe && iframe.contentWindow) {
                      iframe.contentWindow.focus();
                      iframe.contentWindow.print();
                    } else {
                      window.print();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                  title="Print case diary"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadCaseDiary(caseDiaryPreviewItem)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                  title="Download file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCaseDiaryPreviewItem(null);
                    setCaseDiaryPreviewUrl("");
                  }}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100/60 flex items-center justify-center min-h-[420px]">
              {caseDiaryPreviewItem.contentHtml ? (
                <iframe
                  id="case-diary-preview-iframe"
                  srcDoc={caseDiaryPreviewItem.contentHtml}
                  className="w-full h-[72vh] rounded-xl border border-slate-300 shadow-md bg-white"
                  title="Case Diary Document Preview"
                />
              ) : caseDiaryPreviewUrl && (caseDiaryPreviewUrl.startsWith("data:application/pdf") || caseDiaryPreviewUrl.toLowerCase().endsWith(".pdf")) ? (
                <iframe
                  src={caseDiaryPreviewUrl}
                  className="w-full h-[72vh] rounded-xl border border-slate-300 shadow-md bg-white"
                  title="PDF Preview"
                />
              ) : (
                <div className="w-full max-w-3xl bg-white p-8 rounded-xl border border-slate-300 shadow-sm font-sans text-xs sm:text-sm text-slate-900 leading-relaxed space-y-4">
                  <div className="text-center pb-3 border-b border-slate-300">
                    <div className="font-mono text-xs font-bold text-slate-500 uppercase tracking-widest">
                      HARYANA POLICE • STATUTORY CASE DIARY RECORD
                    </div>
                    <h3 className="font-black text-base text-slate-900 mt-1">
                      {caseDiaryPreviewItem.summary || "Case Diary (Zimni)"}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">
                      Under Section 175 of Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 &amp; PPR 25.54
                    </p>
                    <div className="flex items-center justify-center gap-4 mt-2 text-[11px] font-mono text-slate-600 border-t border-slate-100 pt-2">
                      <span><strong>FIR:</strong> {fir?.firNumber}</span>
                      <span><strong>PS:</strong> {fir?.policeStation}</span>
                      <span><strong>Date:</strong> {caseDiaryPreviewItem.date} {caseDiaryPreviewItem.time}</span>
                      <span><strong>IO:</strong> {caseDiaryPreviewItem.officer}</span>
                    </div>
                  </div>

                  <div className="whitespace-pre-wrap font-serif text-slate-800 leading-relaxed text-sm pt-2 bg-slate-50/50 p-4 rounded-lg border border-slate-200">
                    {caseDiaryPreviewItem.details}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="font-mono">
                Date: {caseDiaryPreviewItem.date} {caseDiaryPreviewItem.time} • Recorded by: {caseDiaryPreviewItem.officer}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCaseDiaryPreviewItem(null);
                  setCaseDiaryPreviewUrl("");
                }}
              >
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Case Evidence & Lossless Integrity Verification Modal */}
      {selectedEvidenceRecord && (
        <CaseEvidenceDataModal
          record={selectedEvidenceRecord}
          onClose={() => setSelectedEvidenceRecord(null)}
          onUpdated={(updated) => {
            setSelectedEvidenceRecord(updated);
            setEvidenceRefreshTrigger((c) => c + 1);
          }}
        />
      )}

      {/* Modify Statutory Acts & Sections Modal */}
      {fir && isModifyActsModalOpen && (
        <ModifyActsModal
          isOpen={isModifyActsModalOpen}
          onClose={() => setIsModifyActsModalOpen(false)}
          fir={fir}
          currentUser={currentUser}
          onSuccess={(updatedFir) => {
            setFir(updatedFir);
            fetchFir();
          }}
        />
      )}

      {/* SHO -> SO forwarding modal (FIR-specific status options) */}
      <SendReportToSoModal
        isOpen={sendToSoModalOpen}
        recordNumber={fir?.firNumber || "FIR"}
        reportTitle={selectedReportForSo?.title}
        policeStation={fir?.policeStation}
        district={fir?.district}
        statusOptions={FIR_SO_STATUS_OPTIONS}
        title="Send FIR Report to Supervisory Officer (SO)"
        subtext="Select the FIR report status and the supervisory officer for the final decision."
        statusLabel="Select FIR report status (mandatory)"
        onClose={() => setSendToSoModalOpen(false)}
        onSubmit={handleShoSendToSoSubmit}
        isLoading={sendingReportToSo}
      />
    </div>
  );
}
