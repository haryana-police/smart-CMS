"use client";

import { isMhcOrMmRole } from "@/lib/officerRoles";
import { useLanguage } from "@/context/LanguageContext";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useGuardedRouter as useRouter } from "@/hooks/useGuardedRouter";
import {
  Search,
  Filter,
  Calendar,
  Clock,
  Phone,
  MapPin,
  User,
  Shield,
  UserCheck,
  Eye,
  Check,
  CheckCircle,
  X,
  FileText,
  AlertTriangle,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Paperclip,
  Video,
  Music,
  Image as ImageIcon,
  Bell,
  Send,
  Printer,
  AlertCircle,
  Edit3,
  Scale,
  SlidersHorizontal,
  Columns3,
  PlusCircle,
  GripVertical,
  RotateCcw,
  ArrowRightLeft,
  Link2,
  Unlink,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ComplaintService } from "@/services/complaintService";
import { ComplaintItem, OfficerNotification, getMainComplaintStatus } from "@/types";
import { isUserAssignedEo } from "@/utils/complaintPermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/ui/badge";
import { EmptyState, LoadingSkeleton } from "@/components/ui/state-views";
import { useFirIoRoster, type FirIo } from "@/hooks/useFirIoRoster";
import { formatDate, formatDateTime, getTodayIsoIST, getDateDaysAgoIsoIST, getMonthStartIsoIST, toIsoDateString } from "@/lib/utils";
import { DatePickerDDMMYYYY } from "@/components/ui/date-picker-ddmmyyyy";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { ActionsDropdown } from "@/components/ui/actions-dropdown";
import { ComplaintReceiptModal } from "@/components/complaints/ComplaintReceiptModal";
import { EoSendingToShoModal, EOCategoryOption } from "@/components/complaints/EoSendingToShoModal";
import { ShoApproveCategoryModal, SHOCategoryOption } from "@/components/complaints/ShoApproveCategoryModal";
import { TableManagerService, ManagedColumn } from "@/services/tableManagerService";
import { TransferComplaintModal } from "@/components/complaints/TransferComplaintModal";
import { LinkDelinkComplaintsModal } from "@/components/complaints/LinkDelinkComplaintsModal";

type ComplaintSortField =
  | "complaintNumber"
  | "createdAt"
  | "complainantName"
  | "categoryDisplay"
  | "status"
  | "assignedEoName"
  | "daysPending";

const STATUS_OPTIONS = [
  { key: "NOT_ASSIGNED", label: "Not Assigned" },
  { key: "PENDING", label: "Pending" },
  { key: "COMPLETE", label: "Complete" },
  { key: "FIR_RECOMMEND", label: "FIR Recommend" },
  { key: "FIR_REGISTER", label: "Direct FIR (FIR Register)" },
  { key: "FIR_REGISTERED", label: "FIR Registered" },
  { key: "CORRECTION_REQUIRED", label: "Correction Required" },
];

const ALL_STATUS_KEYS = [
  "NOT_ASSIGNED",
  "PENDING",
  "COMPLETE",
  "FIR_RECOMMEND",
  "FIR_REGISTER",
  "FIR_REGISTERED",
  "CORRECTION_REQUIRED",
];

const DIRECTION_TEMPLATES = [
  {
    key: "SPOT_VERIFY",
    label: "Preliminary Spot Verification (BNSS 173(3))",
    text: "Conduct preliminary spot verification & inspect the scene within 48 hours. Record statements of immediate witnesses and local residents.",
    recommendedDays: 7,
  },
  {
    key: "SECTION_35_NOTICE",
    label: "Notice to Accused (Section 35(3) BNSS)",
    text: "Issue formal appearance notice under Section 35(3) BNSS to named suspect(s). Verify defense version and record formal explanation.",
    recommendedDays: 7,
  },
  {
    key: "DIGITAL_CCTV",
    label: "Collect CCTV & Digital Evidence",
    text: "Secure and preserve CCTV camera recordings from the spot, obtain bank transaction statements / UPI references, and preserve mobile communication records.",
    recommendedDays: 5,
  },
  {
    key: "MEDIATION",
    label: "Mediation & Mutual Settlement",
    text: "Convene joint meeting with both parties at Station Helpdesk. Facilitate peaceful mutual settlement or lawful compromise without coercion.",
    recommendedDays: 10,
  },
  {
    key: "MEDICAL_MLR",
    label: "Hospital MLR & Medical Verification",
    text: "Liaise with Government Civil Hospital to obtain formal Medico-Legal Report (MLR). Verify injury severity (simple vs grievous) with medical officer.",
    recommendedDays: 3,
  },
  {
    key: "REVENUE_LAND",
    label: "Revenue Patwari Land Demarcation",
    text: "Coordinate with Halqa Patwari / Tehsildar to inspect Khasra/Khatoni revenue demarcation and determine lawful possession of disputed land.",
    recommendedDays: 14,
  },
  {
    key: "CUSTOM",
    label: "Custom Supervisory Direction...",
    text: "",
    recommendedDays: 14,
  },
];

function ComplaintListContent() {
  const { t } = useLanguage();
  const { currentUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPriority = searchParams.get("priority") || "ALL";
  const initialStatusParam = searchParams.get("status");
  const initialSearchParam = searchParams.get("search") || "";
  const unassignedComplaintNo = searchParams.get("unassigned");

  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchRequestIdRef = useRef(0);
  const [advancedFilters,setAdvancedFilters]=useState(false);
  const [registerPage,setRegisterPage]=useState({key:"",page:1});
  const [searchQuery, setSearchQuery] = useState(initialSearchParam);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearchParam);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Status Filter with Dropdown and Checkboxes
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(() => {
    if (!initialStatusParam || initialStatusParam.toUpperCase() === "ALL") return ALL_STATUS_KEYS;
    const normalized = initialStatusParam.trim().toUpperCase().replace(/\s+/g, "_");
    return ALL_STATUS_KEYS.includes(normalized) ? [normalized] : ALL_STATUS_KEYS;
  });
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);

  const [statusCounts, setStatusCounts] = useState({
    all: 0,
    notAssigned: 0,
    pending: 0,
    complete: 0,
    firRegister: 0,
    firRecommend: 0,
    firRegistered: 0,
    correctionRequired: 0,
    unassigned: 0,
    underEnquiry: 0,
    underReview: 0,
    disposed: 0,
  });

  const isAllSelected = selectedStatuses.length === ALL_STATUS_KEYS.length;

  const isMhc = isMhcOrMmRole(currentUser.role);
  const isSho = currentUser.role === "SHO" || currentUser.id === "usr_sho_1";
  const isSuperior = currentUser.role === "DSP_SUBDIV" || currentUser.role === "SP_DISTRICT" || currentUser.role === "SUPER_ADMIN";
  const isEo = currentUser.role === "ENQUIRY_OFFICER" || (!isSho && !isMhc && !isSuperior);
  const canRegisterComplaint = isMhc || isSho || isSuperior;
  const eoFilterParam = isEo ? (currentUser.pno || currentUser.name) : undefined;

  // Column Selection Checkboxes state
  const [columnDropdownOpen, setColumnDropdownOpen] = useState(false);
  const columnDropdownRef = useRef<HTMLDivElement | null>(null);
  // Custom columns from Table Manager
  const [customCols, setCustomCols] = useState<ManagedColumn[]>(() => {
    return TableManagerService.getCustomColumns("complaints");
  });

  useEffect(() => {
    const handleUpdate = () => {
      setCustomCols(TableManagerService.getCustomColumns("complaints"));
    };
    window.addEventListener("cms_table_columns_changed", handleUpdate);
    return () => window.removeEventListener("cms_table_columns_changed", handleUpdate);
  }, []);

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    srNo: false,
    complaintId: true,
    dateTime: true,
    complainant: true,
    categoryLocation: false,
    status: true,
    assignedEo: true,
    daysPending: false,
    action: true,
  });

  // Column Reordering (Grab & Drag)
  type ComplaintColKey = string;
  const DEFAULT_COMPLAINT_COLUMN_ORDER: ComplaintColKey[] = [
    "srNo",
    "complaintId",
    "dateTime",
    "complainant",
    "categoryLocation",
    "status",
    "assignedEo",
    "daysPending",
  ];

  const COMPLAINT_COL_TO_SORT_FIELD: Record<string, ComplaintSortField> = {
    complaintId: "complaintNumber",
    dateTime: "createdAt",
    complainant: "complainantName",
    categoryLocation: "categoryDisplay",
    status: "status",
    assignedEo: "assignedEoName",
    daysPending: "daysPending",
  };

  const COMPLAINT_COL_LABELS: Record<string, string> = {
    srNo: "Sr No.",
    complaintId: "Complaint ID",
    dateTime: "Date & Time",
    complainant: "Complainant",
    categoryLocation: "Category & Incident Location",
    status: "Enquiry Status",
    assignedEo: "Enquiry Officer",
    daysPending: "Days Registered",
  };

  const getColLabel = (colKey: string) => {
    if (COMPLAINT_COL_LABELS[colKey]) return COMPLAINT_COL_LABELS[colKey];
    const custom = customCols.find((c) => c.key === colKey);
    return custom ? custom.label : colKey;
  };

  const [columnOrder, setColumnOrder] = useState<ComplaintColKey[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("cms_complaint_column_order");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length >= DEFAULT_COMPLAINT_COLUMN_ORDER.length) {
            return parsed;
          }
        }
      } catch {}
    }
    return DEFAULT_COMPLAINT_COLUMN_ORDER;
  });

  // Keep columnOrder and visibleColumns in sync with custom columns
  useEffect(() => {
    if (customCols.length > 0) {
      setColumnOrder((prev) => {
        const activeKeys = customCols.filter((c) => c.isActive).map((c) => c.key);
        const missing = activeKeys.filter((k) => !prev.includes(k));
        if (missing.length > 0) {
          const next = [...prev, ...missing];
          try {
            localStorage.setItem("cms_complaint_column_order", JSON.stringify(next));
          } catch {}
          return next;
        }
        return prev;
      });
      setVisibleColumns((prev) => {
        const next = { ...prev };
        let changed = false;
        customCols.forEach((c) => {
          if (next[c.key] === undefined) {
            next[c.key] = c.isActive;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [customCols]);

  const [draggedCol, setDraggedCol] = useState<ComplaintColKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ComplaintColKey | null>(null);

  const handleColumnDrop = (targetCol: ComplaintColKey) => {
    if (!draggedCol || draggedCol === targetCol) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const srcIdx = next.indexOf(draggedCol);
      const tgtIdx = next.indexOf(targetCol);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, draggedCol);
      try {
        localStorage.setItem("cms_complaint_column_order", JSON.stringify(next));
      } catch {}
      return next;
    });
    setDraggedCol(null);
    setDragOverCol(null);
  };

  const resetColumnOrder = () => {
    const fullOrder = [
      ...DEFAULT_COMPLAINT_COLUMN_ORDER,
      ...customCols.filter((c) => c.isActive).map((c) => c.key),
    ];
    setColumnOrder(fullOrder);
    try {
      localStorage.removeItem("cms_complaint_column_order");
    } catch {}
  };

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetColumns = () => {
    const base: Record<string, boolean> = {
      srNo: true,
      complaintId: true,
      dateTime: true,
      complainant: true,
      categoryLocation: true,
      status: true,
      assignedEo: true,
      daysPending: true,
      action: true,
    };
    customCols.forEach((c) => {
      base[c.key] = c.isActive;
    });
    setVisibleColumns(base);
    resetColumnOrder();
  };

  const [priorityFilter, setPriorityFilter] = useState(initialPriority);
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const [sortField, setSortField] = useState<ComplaintSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Column-specific search states (click column name to search, click arrow to sort)
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [activeSearchCol, setActiveSearchCol] = useState<string | null>(null);

  // Selected complaint for drawer/modal inspection
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintItem | null>(null);

  // Workflow Modals: SHO & EO Decision
  const [shoApproveModalComplaint, setShoApproveModalComplaint] = useState<ComplaintItem | null>(null);
  const [shoApproveRemarks, setShoApproveRemarks] = useState("");
  const [isApproving, setIsApproving] = useState(false);

  const [shoReEnquiryModalComplaint, setShoReEnquiryModalComplaint] = useState<ComplaintItem | null>(null);
  const [reEnquiryReason, setReEnquiryReason] = useState("");
  const [isSubmittingReEnquiry, setIsSubmittingReEnquiry] = useState(false);

  const [shoRejectModalComplaint, setShoRejectModalComplaint] = useState<ComplaintItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  const [firRegisterModalComplaint, setFirRegisterModalComplaint] = useState<ComplaintItem | null>(null);
  const [firNumberInput, setFirNumberInput] = useState("");
  const [firSectionsInput, setFirSectionsInput] = useState("");
  const [firCaseTypeInput, setFirCaseTypeInput] = useState<string>("ADULT");
  const [firMajorActInput, setFirMajorActInput] = useState<string>("Bharatiya Nyaya Sanhita, 2023 (BNS)");
  const [firDateInput, setFirDateInput] = useState("");
  const [isRegisteringFir, setIsRegisteringFir] = useState(false);

  const [eoSendToShoModalComplaint, setEoSendToShoModalComplaint] = useState<ComplaintItem | null>(null);
  const [eoSendRemarks, setEoSendRemarks] = useState("");
  const [isSendingToSho, setIsSendingToSho] = useState(false);

  // Assignment Modal & Directions
  const [assigningComplaint, setAssigningComplaint] = useState<ComplaintItem | null>(null);
  const [selectedEoId, setSelectedEoId] = useState("");
  const [directionTemplate, setDirectionTemplate] = useState("SPOT_VERIFY");
  const [assignedDirections, setAssignedDirections] = useState(
    DIRECTION_TEMPLATES[0].text
  );
  const [targetDays, setTargetDays] = useState(14);
  const [lastAssignedNotification, setLastAssignedNotification] = useState<OfficerNotification | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);

  // Official Receipt of Registered Complaints modal state
  const [receiptComplaint, setReceiptComplaint] = useState<ComplaintItem | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Quick Assign EO dropdown state (directly opens dropdown on click, no dialogue box)
  const [assignDropdownComplaintId, setAssignDropdownComplaintId] = useState<string | null>(null);
  const assignmentRecord = complaints.find(item => item.id === assignDropdownComplaintId) || assigningComplaint || selectedComplaint;
  const assignmentScope = assignmentRecord?.custodyUnit;
  const { officers: eoRoster, loading: eoRosterLoading, error: eoRosterError } = useFirIoRoster(assignmentScope?.name || assignmentRecord?.policeStation, assignmentScope?.district || assignmentRecord?.district, isSho && !isMhc);
  const [assignToast, setAssignToast] = useState<string | null>(null);
  const [isQuickAssigning, setIsQuickAssigning] = useState<boolean>(false);

  // Transfer and Link/Delink Modals
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isLinkDelinkModalOpen, setIsLinkDelinkModalOpen] = useState(false);
  const [modalPreselectedComplaintId, setModalPreselectedComplaintId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-assign-dropdown]")) {
        setAssignDropdownComplaintId(null);
      }
    };
    if (assignDropdownComplaintId) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [assignDropdownComplaintId]);

  const handleQuickAssignEO = async (complaintId: string, eo: FirIo) => {
    if (isMhc || !isSho) {
      setAssignToast("Access Denied: MHC cannot assign EO/IO. Allocation must be done by SHO only (PPR Rule 22.48).");
      setTimeout(() => setAssignToast(null), 4000);
      return;
    }
    try {
      setIsQuickAssigning(true);
      const label = eo.name.startsWith(eo.rank) ? eo.name : `${eo.rank} ${eo.name}`;
      await ComplaintService.assignEnquiryOfficer(
        complaintId,
        eo.id,
        eo.name,
        eo.rank,
        eo.pno,
        currentUser.name,
        "Conduct preliminary spot verification & verify facts as per Section 173(3) BNSS.",
        14,
        currentUser
      );
      setAssignDropdownComplaintId(null);
      await fetchComplaints();
      setAssignToast(`Enquiry Officer assigned: ${label}`);
      setTimeout(() => setAssignToast(null), 3500);
    } catch (err) {
      console.error("Failed to assign EO:", err);
      setAssignToast("Failed to assign Enquiry Officer.");
      setTimeout(() => setAssignToast(null), 3000);
    } finally {
      setIsQuickAssigning(false);
    }
  };

  const selectedEo = useMemo(() => {
    return eoRoster.find((e) => e.id === selectedEoId) || null;
  }, [selectedEoId, eoRoster]);

  const handleOpenAssignModal = (complaint: ComplaintItem) => {
    setAssigningComplaint(complaint);
    setAssignSuccess(false);
    setLastAssignedNotification(null);

    let defaultTemplate = "SPOT_VERIFY";
    if (complaint.category === "LAND_PROPERTY_DISPUTE") {
      defaultTemplate = "REVENUE_LAND";
    } else if (complaint.category === "DOMESTIC_VIOLENCE_DOWRY") {
      defaultTemplate = "MEDIATION";
    } else if (complaint.category === "PHYSICAL_ASSAULT_AFFRAY") {
      defaultTemplate = "MEDICAL_MLR";
    } else if (complaint.category === "CYBER_CRIME" || complaint.category === "FINANCIAL_FRAUD_CHEATING") {
      defaultTemplate = "DIGITAL_CCTV";
    }

    const tmpl = DIRECTION_TEMPLATES.find((t) => t.key === defaultTemplate);
    setSelectedEoId(complaint.assignedEoId || "");
    setDirectionTemplate(defaultTemplate);
    setAssignedDirections(tmpl?.text || "");
    setTargetDays(tmpl?.recommendedDays || 14);
  };

  const handleSelectEo = (eoId: string) => {
    setSelectedEoId(eoId);
  };

  const handleTemplateChange = (key: string) => {
    setDirectionTemplate(key);
    const tmpl = DIRECTION_TEMPLATES.find((t) => t.key === key);
    if (tmpl) {
      if (key !== "CUSTOM") {
        setAssignedDirections(tmpl.text);
      }
      setTargetDays(tmpl.recommendedDays);
    }
  };

  const handleAssignEO = async () => {
    if (!assigningComplaint || !selectedEoId) return;
    const eo = eoRoster.find((e) => e.id === selectedEoId);
    if (!eo) return;
    setIsAssigning(true);

    try {
      const result = await ComplaintService.assignEnquiryOfficer(
        assigningComplaint.id,
        eo.id,
        eo.name,
        eo.rank,
        eo.pno,
        currentUser.name,
        assignedDirections,
        targetDays
      );

      setLastAssignedNotification(result.notification);
      setAssignSuccess(true);
      fetchComplaints();

      // Immediately open Receipt of Registered Complaints modal!
      setReceiptComplaint(result.complaint);
      setShowReceiptModal(true);

      setTimeout(() => {
        setAssignSuccess(false);
        setAssigningComplaint(null);
        setLastAssignedNotification(null);
      }, 500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleShoApprove = async (payload?: { finalCategory: SHOCategoryOption; remarks: string }) => {
    if (!shoApproveModalComplaint) return;
    setIsApproving(true);
    try {
      await ComplaintService.shoApprove(
        shoApproveModalComplaint.id,
        currentUser.name,
        currentUser.pno || "HR-04291882",
        payload?.remarks ?? shoApproveRemarks,
        payload?.finalCategory
      );
      setShoApproveModalComplaint(null);
      setShoApproveRemarks("");
      fetchComplaints();
      if (payload?.finalCategory === "CLOSURE") {
        alert("Enquiry report approved with final category: Closure. Complaint marked Complete and Roznamcha GD entry sent to Auto Suggestions & Drafts for Munshi (MHC).");
      } else if (payload?.finalCategory === "NCR") {
        alert("Enquiry report approved with final category: NCR. Roznamcha GD suggestion sent to Auto Suggestions & Drafts for Munshi (MHC).");
      } else if (payload?.finalCategory === "FIR_RECOMMEND") {
        alert("Enquiry report approved with final category: Recommended for FIR. Roznamcha GD suggestion sent to Auto Suggestions & Drafts for Munshi (MHC).");
      }
    } catch (e) {
      console.error(e);
      alert("Error approving report");
    } finally {
      setIsApproving(false);
    }
  };

  const handleShoReEnquiry = async () => {
    if (!shoReEnquiryModalComplaint || !reEnquiryReason.trim()) {
      alert("Please provide the reason / instructions for re-enquiry.");
      return;
    }
    setIsSubmittingReEnquiry(true);
    try {
      await ComplaintService.shoReEnquiry(
        shoReEnquiryModalComplaint.id,
        currentUser.name,
        currentUser.pno || "HR-04291882",
        reEnquiryReason
      );
      setShoReEnquiryModalComplaint(null);
      setReEnquiryReason("");
      fetchComplaints();
    } catch (e) {
      console.error(e);
      alert("Error ordering re-enquiry");
    } finally {
      setIsSubmittingReEnquiry(false);
    }
  };

  const handleShoReject = async () => {
    if (!shoRejectModalComplaint || !rejectionReason.trim()) {
      alert("Please provide the rejection reason / instructions for correction.");
      return;
    }
    setIsSubmittingReject(true);
    try {
      await ComplaintService.shoReject(
        shoRejectModalComplaint.id,
        currentUser.name,
        currentUser.pno || "HR-04291882",
        rejectionReason.trim()
      );
      setShoRejectModalComplaint(null);
      setRejectionReason("");
      fetchComplaints();
    } catch (e) {
      console.error(e);
      alert("Error rejecting report");
    } finally {
      setIsSubmittingReject(false);
    }
  };

  const handleOpenFirRegisterModal = (c: ComplaintItem) => {
    setFirCaseTypeInput(c.caseType || "ADULT");
    setFirSectionsInput(c.firSections || "Section 303(2), 115(2), 3(5) BNS, 2023");
    setFirMajorActInput("Bharatiya Nyaya Sanhita, 2023 (BNS)");
    setFirRegisterModalComplaint(c);
  };

  const handleRegisterFirSubmit = async () => {
    if (!firRegisterModalComplaint) return;
    setIsRegisteringFir(true);
    try {
      const { gdRecord } = await ComplaintService.createFirCriminalCaseGdEntry(
        firRegisterModalComplaint.id,
        {
          caseType: firCaseTypeInput,
          actsAndSections: firSectionsInput.trim() || "Section 303(2), 115(2), 3(5) BNS, 2023",
          majorAct: firMajorActInput,
          officerName: currentUser.name,
          officerPno: currentUser.pno || "HR-04291882",
        }
      );
      const targetComplaintId = firRegisterModalComplaint.id;
      setFirRegisterModalComplaint(null);
      fetchComplaints();
      const gdQuery = gdRecord?.gdNumber && gdRecord.gdNumber !== "GD-PENDING-SUGGESTION" ? `&gdNumber=${encodeURIComponent(gdRecord.gdNumber)}` : "";
      router.push(`/fir/register?complaintId=${encodeURIComponent(targetComplaintId)}${gdQuery}`);
    } catch (e) {
      console.error(e);
      alert("Error logging GD / preparing FIR");
    } finally {
      setIsRegisteringFir(false);
    }
  };

  const handleEoSendToShoSubmit = async (payload?: { recommendedCategory: EOCategoryOption; remarks: string }) => {
    if (!eoSendToShoModalComplaint) return;
    setIsSendingToSho(true);
    try {
      await ComplaintService.sendReportToSho(
        eoSendToShoModalComplaint.id,
        currentUser.name,
        currentUser.pno || "HR-04291882",
        payload?.remarks ?? eoSendRemarks,
        {
          recommendedCategory: payload?.recommendedCategory,
          eoId: currentUser.id,
          reportTitle: eoSendToShoModalComplaint.reports?.[0]?.title || "Enquiry Report",
        }
      );
      setEoSendToShoModalComplaint(null);
      setEoSendRemarks("");
      fetchComplaints();
    } catch (e) {
      console.error(e);
      alert("Error sending report to SHO");
    } finally {
      setIsSendingToSho(false);
    }
  };

  // Close status dropdown, column dropdown, and column search on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(event.target as Node)) {
        setColumnDropdownOpen(false);
      }
      const target = event.target as HTMLElement;
      if (!target?.closest?.("[data-column-search-box]")) {
        setActiveSearchCol(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEscapeKey(statusDropdownOpen, () => setStatusDropdownOpen(false));
  useEscapeKey(columnDropdownOpen, () => setColumnDropdownOpen(false));
  useEscapeKey(Boolean(activeSearchCol), () => setActiveSearchCol(null));
  useEscapeKey(Boolean(assignDropdownComplaintId), () => setAssignDropdownComplaintId(null));
  useEscapeKey(Boolean(selectedComplaint && !assignDropdownComplaintId), () => setSelectedComplaint(null));
  useEscapeKey(Boolean(shoReEnquiryModalComplaint), () => setShoReEnquiryModalComplaint(null));
  useEscapeKey(Boolean(shoRejectModalComplaint), () => setShoRejectModalComplaint(null));
  useEscapeKey(Boolean(firRegisterModalComplaint), () => setFirRegisterModalComplaint(null));

  const handleToggleAll = () => {
    if (isAllSelected) {
      setSelectedStatuses([]);
    } else {
      setSelectedStatuses([...ALL_STATUS_KEYS]);
    }
  };

  const handleToggleStatus = (key: string) => {
    setSelectedStatuses((prev) => {
      // If currently all statuses are selected (default state),
      // clicking an individual status isolates it immediately as the single selected filter
      if (prev.length === ALL_STATUS_KEYS.length) {
        return [key];
      }
      // If user has already chosen custom selection, toggle this status on/off
      if (prev.includes(key)) {
        const next = prev.filter((k) => k !== key);
        // If everything becomes unchecked, revert back to all selected
        return next.length === 0 ? [...ALL_STATUS_KEYS] : next;
      } else {
        const next = [...prev, key];
        return next;
      }
    });
  };

  const getStatusButtonLabel = () => {
    if (isAllSelected) {
      return "All Complaints";
    }
    if (selectedStatuses.length === 0) {
      return "No Status Selected";
    }
    if (selectedStatuses.length === 1) {
      const opt = STATUS_OPTIONS.find((o) => o.key === selectedStatuses[0]);
      return opt ? opt.label : "1 Selected";
    }
    if (selectedStatuses.length === 2) {
      const labels = selectedStatuses
        .map((k) => STATUS_OPTIONS.find((o) => o.key === k)?.label)
        .filter(Boolean);
      return labels.join(", ");
    }
    return `${selectedStatuses.length} Statuses Selected`;
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchComplaints = async () => {
    const reqId = ++fetchRequestIdRef.current;
    setLoading(true);
    setFetchError(null);
    try {
    const [data, counts] = await Promise.all([
      ComplaintService.getComplaints({
        search: debouncedSearch,
        statuses: selectedStatuses.length === 0 ? ["NONE_MATCHING"] : (isAllSelected ? undefined : selectedStatuses),
        priority: priorityFilter,
        category: categoryFilter,
        assignedEo: eoFilterParam,
        viewerRole: currentUser.role,
        viewerStation: currentUser.stationName,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
      ComplaintService.getStatusCounts(eoFilterParam, currentUser.stationName, currentUser.role),
    ]);
    if (reqId !== fetchRequestIdRef.current) return;
    setComplaints(data);
    setStatusCounts(counts);
    } catch(error) {
      if (reqId !== fetchRequestIdRef.current) return;
      const msg = error instanceof Error ? error.message : "Complaints could not be loaded.";
      setFetchError(msg);
      setAssignToast(msg);
    } finally {
      if (reqId === fetchRequestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
    const handleUpdate = () => {
      fetchComplaints();
    };
    const handleFailure=(event:Event)=>setAssignToast(String((event as CustomEvent).detail));
    window.addEventListener("complaints_save_error",handleFailure);
    window.addEventListener("complaints_updated", handleUpdate);
    return () => {
      window.removeEventListener("complaints_updated", handleUpdate);
      window.removeEventListener("complaints_save_error",handleFailure);
    };
  }, [debouncedSearch, selectedStatuses, priorityFilter, categoryFilter, dateFrom, dateTo, currentUser]);

  // Keep filter state aligned with URL deep-link changes
  useEffect(() => {
    const urlId = searchParams.get("id");
    if (urlId) {
      ComplaintService.getComplaintById(urlId).then((found) => {
        if (found) setSelectedComplaint(found);
      });
    }
    const statusParam = searchParams.get("status");
    if (statusParam) {
      const normalized = statusParam.trim().toUpperCase().replace(/\s+/g, "_");
      if (normalized === "ALL") {
        setSelectedStatuses([...ALL_STATUS_KEYS]);
      } else if (ALL_STATUS_KEYS.includes(normalized)) {
        setSelectedStatuses([normalized]);
      }
    }
    const prioParam = searchParams.get("priority");
    if (prioParam) setPriorityFilter(prioParam);
    const searchParam = searchParams.get("search");
    if (searchParam !== null) {
      setSearchQuery(searchParam);
      setDebouncedSearch(searchParam);
    }
  }, [searchParams]);


  const handleSort = (field: ComplaintSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const sortedComplaints = useMemo(() => {
    let list = [...complaints];

    // Column-specific search filters
    for (const [col, term] of Object.entries(columnSearch)) {
      if (!term || !term.trim()) continue;
      const q = term.toLowerCase().trim();
      list = list.filter((c) => {
        if (col === "complaintNumber") {
          return (
            c.complaintNumber.toLowerCase().includes(q) || (c.fivePNumber?.toLowerCase().includes(q) ?? false) || (c.policeStation?.toLowerCase().includes(q) ?? false) ||
            (c.priority?.toLowerCase().includes(q) ?? false)
          );
        } else if (col === "createdAt") {
          const formatted = formatDate(c.createdAt);
          const rawDigitsTerm = q.replace(/\D/g, "");
          const rawDigitsDate = formatted.replace(/\D/g, "");
          const dmyMatch = formatted.toLowerCase().includes(q);
          const rawMatch = c.createdAt.toLowerCase().includes(q);
          const digitsMatch = rawDigitsTerm.length > 0 && rawDigitsDate.includes(rawDigitsTerm);
          return dmyMatch || rawMatch || digitsMatch;
        } else if (col === "complainantName") {
          return (
            c.complainantName.toLowerCase().includes(q) ||
            (c.complainantMobile?.includes(q) ?? false)
          );
        } else if (col === "categoryDisplay") {
          return (
            (c.categoryDisplay?.toLowerCase().includes(q) ?? false) ||
            (c.incidentPlace?.toLowerCase().includes(q) ?? false)
          );
        } else if (col === "status") {
          const mainStatus = getMainComplaintStatus(c, currentUser?.role);
          const statusText = String(mainStatus || "").toLowerCase();

          // 1. Direct match on the visible column status text
          if (statusText.includes(q)) {
            return true;
          }

          // 2. Exact status-specific aliases (bounded strictly to avoid overlap)
          if ((q === "closed" || q === "closure" || q === "disposed") && statusText === "complete") {
            return true;
          }
          if ((q === "unassigned" || q === "no eo") && statusText === "not assigned") {
            return true;
          }
          if ((q === "re-enquiry" || q === "rejected") && statusText === "correction required") {
            return true;
          }
          if (q === "enquiry" && statusText === "pending") {
            return true;
          }

          return false;
        } else if (col === "assignedEoName") {
          const isDirectFir = Boolean(c.directSendToFir || c.status === "FIR_REGISTER" || c.workflowState === "FIR_REGISTER");
          const eoMatch = c.assignedEoName?.toLowerCase().includes(q) ?? false;
          const eoPnoMatch = c.assignedEoPno?.toLowerCase().includes(q) ?? false;
          const eoBeltMatch = c.assignedEoBeltNumber?.toLowerCase().includes(q) ?? false;
          const directMatch = isDirectFir && (q.includes("fir") || q.includes("direct") || q.includes("no eo"));
          return eoMatch || eoPnoMatch || eoBeltMatch || directMatch;
        } else if (col === "daysPending") {
          return String(c.daysPending || 0).includes(q);
        }
        return true;
      });
    }

    // Date Range filtering (From & To)
    if (dateFrom) {
      const fromIso = toIsoDateString(dateFrom);
      if (fromIso) {
        list = list.filter((c) => {
          const rawIso = toIsoDateString(c.createdAt || c.incidentDate);
          return !rawIso || rawIso >= fromIso;
        });
      }
    }

    if (dateTo) {
      const toIso = toIsoDateString(dateTo);
      if (toIso) {
        list = list.filter((c) => {
          const rawIso = toIsoDateString(c.createdAt || c.incidentDate);
          return !rawIso || rawIso <= toIso;
        });
      }
    }

    return list.sort((a, b) => {
      if (sortField === "daysPending") {
        const aDays = typeof a.daysPending === "number" && a.daysPending > 0
          ? a.daysPending
          : (a.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 86400000)) : 0);
        const bDays = typeof b.daysPending === "number" && b.daysPending > 0
          ? b.daysPending
          : (b.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(b.createdAt).getTime()) / 86400000)) : 0);
        return sortOrder === "asc" ? aDays - bDays : bDays - aDays;
      }
      if (sortField === "createdAt") {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
      }
      const aVal = (a[sortField] || "").toString().toLowerCase();
      const bVal = (b[sortField] || "").toString().toLowerCase();
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [complaints, columnSearch, sortField, sortOrder, dateFrom, dateTo, currentUser?.role]);

  const pageKey=JSON.stringify([searchQuery,selectedStatuses,priorityFilter,categoryFilter,dateFrom,dateTo,columnSearch,sortField,sortOrder]);
  const pageCount=Math.max(1,Math.ceil(sortedComplaints.length/20));
  const page=registerPage.key===pageKey?Math.min(registerPage.page,pageCount):1;
  const pageComplaints=sortedComplaints.slice((page-1)*20,page*20);
  const visibleColumnCount = columnOrder.filter((col) => visibleColumns[col]).length
    + (visibleColumns.action ? 1 : 0);
  const hasColumnSearch = Object.values(columnSearch).some((term) => term.trim());
  const emptyComplaints = (
    <EmptyState
      title={hasColumnSearch ? "No matching complaints" : "No complaints found"}
      description={hasColumnSearch
        ? "Try a different column search or clear the filters."
        : isEo
          ? "Complaints assigned to you will appear here when they match the current filters."
          : "Try clearing your search or changing the selected filters."}
      actionLabel="Clear Filters"
      onAction={() => {
        setSearchQuery("");
        setColumnSearch({});
        setActiveSearchCol(null);
        setSelectedStatuses([...ALL_STATUS_KEYS]);
        setPriorityFilter("ALL");
        setCategoryFilter("ALL");
        setDateFrom("");
        setDateTo("");
      }}
    />
  );
  const renderComplaintColumnHeader = (colKey: ComplaintColKey) => {
    if (colKey === "srNo") {
      return (
        <span className="inline-flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-center whitespace-nowrap text-xs">
          Sr No.
        </span>
      );
    }
    const field = (COMPLAINT_COL_TO_SORT_FIELD[colKey] || colKey) as any;
    const label = getColLabel(colKey);
    const isSearching = activeSearchCol === field;
    const filterValue = columnSearch[field] || "";
    const isSorted = sortField === field;

    return (
      <div className="space-y-1 relative" data-column-search-box="true">
        <div className="flex items-center justify-between gap-1">
          {/* Grab Handle + Column Name */}
          <div className="flex items-center gap-1 min-w-0">
            <span
              className="text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing p-0.5 rounded shrink-0 transition-colors"
              title="Grab & drag to reorder position"
            >
              <GripVertical className="w-3 h-3" />
            </span>

            {/* Column Name Click -> Toggles Search */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveSearchCol(isSearching ? null : field);
              }}
              title="Click to Search Column"
              className="flex items-center gap-1 font-semibold text-slate-700 hover:text-blue-700 transition-colors text-left group cursor-pointer truncate"
            >
              <span className="truncate">{label}</span>
              {filterValue ? (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse shrink-0" />
              ) : (
                <Search className="w-3 h-3 text-slate-400 opacity-30 group-hover:opacity-100 group-hover:text-blue-600 transition-opacity shrink-0" />
              )}
            </button>
          </div>

          {/* Arrow Click -> Sorts */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSort(field);
            }}
            title={`Sort by ${label}`}
            className={`p-1 rounded hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0 ${
              isSorted ? "text-blue-700 bg-blue-50" : "text-slate-400 hover:text-slate-700"
            }`}
          >
            {isSorted ? (
              sortOrder === "asc" ? (
                <ArrowUp className="w-3.5 h-3.5 font-bold text-blue-700" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5 font-bold text-blue-700" />
              )
            ) : (
              <ArrowUpDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Inline Search Input or Active Filter Badge */}
        {isSearching ? (
          <div
            onClick={(e) => e.stopPropagation()}
            data-filter-control="true"
            className="pt-1 animate-in fade-in-50"
          >
            <div className="relative">
              <input
                type="text"
                autoFocus
                inputMode={colKey === "dateTime" ? "numeric" : undefined}
                value={filterValue}
                onChange={(e) => {
                  let val = e.target.value;
                  if (colKey === "dateTime") {
                    const digits = val.replace(/\D/g, "").slice(0, 8);
                    if (digits.length <= 2) {
                      val = digits;
                    } else if (digits.length <= 4) {
                      val = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                    } else {
                      val = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
                    }
                  }
                  setColumnSearch((prev) => ({ ...prev, [field]: val }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape" || e.key === "Enter") {
                    setActiveSearchCol(null);
                  }
                }}
                placeholder={colKey === "dateTime" ? "DD/MM/YYYY" : `Search ${label}...`}
                maxLength={colKey === "dateTime" ? 10 : undefined}
                className="w-full text-[11px] px-2 py-1 bg-white border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-600 font-normal pr-7 !text-slate-900 shadow-2xs"
              />
              {filterValue && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setColumnSearch((prev) => {
                      const next = { ...prev };
                      delete next[field];
                      return next;
                    });
                  }}
                  title="Clear column search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 !text-slate-500 hover:!text-red-600 hover:bg-slate-100 rounded transition-colors flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : filterValue ? (
          <div
            data-filter-control="true"
            className="flex items-center gap-1.5 text-[11px] font-medium !text-slate-900 bg-white px-2 py-0.5 rounded shadow-xs border border-slate-300"
          >
            <span className="truncate max-w-[90px] font-mono !text-slate-900">&ldquo;{filterValue}&rdquo;</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setColumnSearch((prev) => {
                  const next = { ...prev };
                  delete next[field];
                  return next;
                });
              }}
              title="Clear filter"
              className="p-0.5 !text-slate-500 hover:!text-red-600 hover:bg-slate-100 rounded transition-colors ml-auto flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderComplaintCell = (colKey: ComplaintColKey, c: ComplaintItem, index?: number) => {
    switch (colKey) {
      case "srNo":
        return (
          <td key="srNo" className="py-3 px-2 text-center font-mono text-xs text-slate-500 w-14 max-w-[56px] font-semibold">
            {typeof index === 'number' ? index + 1 : '—'}
          </td>
        );

      case "complaintId":
        return (
          <td key="complaintId" className="py-3 px-4 font-mono">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link
                href={`/complaints/${c.id}`}
                className="font-bold text-[#0b192c] hover:text-blue-600 hover:underline block"
              >
                {c.complaintNumber}
              </Link>
              {c.fivePNumber && (
                <span
                  title={`5-P Office Number: ${c.fivePNumber} (Source: ${c.sourceOffice || "SP Office"})`}
                  className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-900 border border-purple-300 shrink-0"
                >
                  5-P: {c.fivePNumber}
                </span>
              )}
            </div>
            {c.policeStation && (
              <span className="text-[10px] text-slate-400 block font-sans">
                {c.policeStation}
              </span>
            )}
            {(c.isTransferred || ((c.linkedComplaintsList && c.linkedComplaintsList.length > 0) || c.linkedComplaintNumber)) && (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {c.isTransferred && (
                  <span
                    title={`Transferred to: ${c.transferredToPoliceStation || "Other Station"}`}
                    className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5"
                  >
                    <ArrowRightLeft className="w-2.5 h-2.5 text-amber-700" />
                    <span>Transferred</span>
                  </span>
                )}
                {((c.linkedComplaintsList && c.linkedComplaintsList.length > 0) || c.linkedComplaintNumber) && (
                  <span
                    title={c.isCrossComplaint ? "Cross-Complaint" : "Linked Complaint"}
                    className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-900 border border-indigo-200 flex items-center gap-0.5"
                  >
                    <Link2 className="w-2.5 h-2.5 text-indigo-700" />
                    <span>{c.isCrossComplaint ? "Cross" : `Linked (${c.linkedComplaintsList?.length || 1})`}</span>
                  </span>
                )}
              </div>
            )}
          </td>
        );

      case "dateTime":
        return (
          <td key="dateTime" className="py-3 px-4 whitespace-nowrap">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>{formatDate(c.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {new Date(c.createdAt).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            </div>
          </td>
        );

      case "complainant":
        return (
          <td key="complainant" className="py-3 px-4">
            <Link
              href={`/complaints/${c.id}`}
              className="font-bold text-slate-900 hover:text-blue-600 hover:underline block break-words"
            >
              {c.complainantName}
            </Link>
            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 font-mono">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>+91 {c.complainantMobile}</span>
            </div>
          </td>
        );

      case "categoryLocation":
        return (
          <td key="categoryLocation" className="py-3 px-4">
            <div className="font-semibold text-slate-900">{c.categoryDisplay}</div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="line-clamp-2">{c.incidentPlace}</span>
            </div>
          </td>
        );

      case "status":
        return (
          <td key="status" className="py-3 px-4">
            <StatusBadge status={getMainComplaintStatus(c)} />
          </td>
        );

      case "assignedEo":
        return (
          <td key="assignedEo" className="py-3 px-4">
            {c.directSendToFir || c.status === "FIR_REGISTER" || c.workflowState === "FIR_REGISTER" ? (
              <div className="space-y-1">
                <span className="text-purple-700 bg-purple-50 border border-purple-200 font-bold text-[10px] px-2 py-0.5 rounded-full inline-block">
                  Direct to FIR (No EO)
                </span>
              </div>
            ) : c.assignedEoName ? (
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-900">{c.assignedEoName}</p>
                <p className="text-[10px] text-slate-500 font-mono">PNO: {c.assignedEoPno}</p>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-amber-700 bg-amber-50 border border-amber-200 font-bold text-[10px] px-2 py-0.5 rounded-full inline-block">
                  Not Assigned
                </span>
                {isSho && !isMhc && !c.directSendToFir && c.status !== "FIR_REGISTERED" && c.workflowState !== "FIR_REGISTERED" && (
                  <div className="relative inline-block mt-1" data-assign-dropdown>
                    <button
                      type="button"
                      onClick={() => setAssignDropdownComplaintId((prev) => prev === c.id ? null : c.id)}
                      className="text-xs font-bold text-white bg-[#0b192c] hover:bg-slate-800 px-2.5 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-amber-300" />
                      <span>Assign EO ▾</span>
                    </button>
                    {assignDropdownComplaintId === c.id && (
                      <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1 animate-in fade-in-50 text-left">
                        <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Select EO / IO</span>
                          <span className="text-slate-400 font-mono text-[9px]">Rank &amp; Name</span>
                        </div>
                        <div className="max-h-56 overflow-y-auto py-0.5">
                          {eoRoster.length === 0 && (
                            <p role="status" className="px-3 py-2 text-xs text-slate-600">
                              {eoRosterLoading ? "Loading station officers…" : eoRosterError || "No active EO/IO at this station."}
                            </p>
                          )}
                          {eoRoster.map((eo) => {
                            const label = eo.name.startsWith(eo.rank) ? eo.name : `${eo.rank} ${eo.name}`;
                            return (
                              <button
                                key={eo.id}
                                type="button"
                                disabled={isQuickAssigning}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickAssignEO(c.id, eo);
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-900 transition-colors flex items-center justify-between cursor-pointer"
                              >
                                <span className="truncate">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </td>
        );

      case "daysPending": {
        const pendingDays =
          typeof c.daysPending === "number" && c.daysPending > 0
            ? c.daysPending
            : c.createdAt
            ? Math.max(0, Math.floor((Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
            : 0;
        return (
          <td key="daysPending" className="py-3 px-4 text-center">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                pendingDays > 10
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {pendingDays}d
            </span>
          </td>
        );
      }

      default: {
        const customDef = customCols.find((col) => col.key === colKey);
        return (
          <td key={colKey} className="py-3 px-4 text-xs text-slate-700">
            <span className="font-mono text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
              {customDef?.defaultValue || "—"}
            </span>
          </td>
        );
      }
    }
  };

  return (
    <div className="cms-complaints space-y-6 animate-in fade-in-50">
      {/* Top Header */}
      <div className="cms-page-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Complaints
          </h1>
          {/* Advance Filters Toggle Button */}
          <button
            type="button"
            aria-expanded={advancedFilters}
            onClick={() => setAdvancedFilters(!advancedFilters)}
            className={`h-8 px-3 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${
              advancedFilters
                ? "bg-slate-100 border-slate-400 text-slate-800 shadow-inner"
                : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
            <span>{t("उन्नत िल्टर", "Advanced filters")}{(dateFrom || dateTo || categoryFilter !== 'ALL' || (!isAllSelected && selectedStatuses.length > 0) || searchQuery) ? ' •' : ''}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                advancedFilters ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Quick Refresh Button */}
          <button
            type="button"
            onClick={fetchComplaints}
            className="h-8 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs hover:text-slate-900 transition-colors cursor-pointer"
            title="Refresh Complaints Register"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Top Right Actions: Single High-Contrast Primary Button + Plain Secondary Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary High-Contrast Action Button */}
          {canRegisterComplaint && <Link href="/complaints/register">
            <Button
              type="button"
              className="bg-[#1e3a8a] hover:bg-[#152865] text-white font-bold text-xs h-9 px-4 rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-white" />
              <span>Register Complaint</span>
            </Button>
          </Link>}

          {/* Secondary Actions with plain light border */}
          <Button
            type="button"
            onClick={() => {
              setModalPreselectedComplaintId(undefined);
              setIsTransferModalOpen(true);
            }}
            className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs h-9 px-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>Transfer</span>
          </Button>

          <Button
            type="button"
            onClick={() => {
              setModalPreselectedComplaintId(undefined);
              setIsLinkDelinkModalOpen(true);
            }}
            className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs h-9 px-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Link2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Link / Delink</span>
          </Button>
        </div>
      </div>

      {/* Officer Persona & Assignment Scope Notice Banner */}
      {isEo ? (
        <div className="p-3.5 bg-blue-50/90 border border-blue-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-blue-950 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold flex items-center gap-2">
                <span>Personal Enquiry Docket: {currentUser.name}</span>
                <span className="text-[10px] font-semibold bg-blue-200 text-blue-900 px-2 py-0.5 rounded-full border border-blue-300">
                  Enquiry Officer View
                </span>
              </div>
              <p className="text-[11px] text-blue-800 mt-0.5">
                Showing exclusively complaints assigned to you (PNO: <strong className="font-mono">{currentUser.pno}</strong>). Other complaints are restricted to their respective officers or station supervision.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-xs font-bold bg-white text-blue-800 border border-blue-200 px-3 py-1 rounded-lg">
              {complaints.length} Assigned {complaints.length === 1 ? "Case" : "Cases"}
            </span>
          </div>
        </div>
      ) : null}

      {/* Quick Assign Success Toast */}
      {assignToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs text-emerald-950 font-bold shadow-xs animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{assignToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setAssignToast(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Unassigned Complaint Alert Banner (Directly routed to SHO) */}
      {unassignedComplaintNo && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl flex items-start justify-between gap-3 text-xs text-amber-950 animate-in fade-in-50 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-sm text-amber-950">
                Complaint #{unassignedComplaintNo} Registered — Awaiting EO Assignment
              </p>
              <p className="text-amber-800 leading-relaxed">
                {t("यह शिकायत ░ीय जिस्टर से सीधे थाना भारी को ली ╣ै। जाँच कारी ┐युक्त ░ें। युक्ति के बाद ┐कायत की ░सीद बन जाएगी।", "The central register sent this complaint directly to the SHO. Assign an enquiry officer to generate the complaint receipt.")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Controls (Toggleable via Advanced filters) */}
      {advancedFilters && (
        <Card className="cms-filter-panel border-slate-200 !overflow-visible relative z-30 shadow-xs animate-in fade-in-50 duration-200">
          <CardContent className="p-2 sm:p-2.5 space-y-2 !overflow-visible">
            {/* Main Controls: Single Row Space-Optimized Flex Bar */}
            <div className="flex flex-wrap items-center gap-3">
              {/* 1. Search Bar (Starting item from Red Box) */}
                <div className="cms-search relative flex-1 min-w-[240px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search complaint no, complainant, phone, accused, station..."
                    className="w-full h-8.5 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-[#0b192c] focus:outline-none placeholder:text-slate-400"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer text-xs font-bold"
                      title="Clear Search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 2. Status Dropdown Button with Checkboxes (Starting item from Red Box) */}
                <div className="relative z-40 shrink-0 w-full sm:w-auto sm:min-w-[150px]" ref={statusDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setStatusDropdownOpen((prev) => !prev)}
                    className={`w-full h-8.5 px-2.5 text-xs font-semibold rounded-lg border flex items-center justify-between gap-2 transition-all shadow-2xs cursor-pointer ${
                      statusDropdownOpen
                        ? "border-blue-600 ring-2 ring-blue-100 bg-white text-blue-900"
                        : !isAllSelected && selectedStatuses.length > 0
                        ? "border-blue-300 bg-blue-50/70 text-blue-900"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Filter className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">{getStatusButtonLabel()}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedStatuses.length > 0 && selectedStatuses.length < ALL_STATUS_KEYS.length && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                          {selectedStatuses.length}
                        </span>
                      )}
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${
                          statusDropdownOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {/* Status Dropdown Menu with Checkboxes */}
                  {statusDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-72 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl p-3 animate-in fade-in-50 zoom-in-95 ring-1 ring-slate-900/10">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Filter by Status
                        </span>
                        <button
                          type="button"
                          onClick={handleToggleAll}
                          className="text-[11px] font-bold text-blue-700 hover:text-blue-900 transition-colors cursor-pointer"
                        >
                          {isAllSelected ? "Deselect All" : "Select All"}
                        </button>
                      </div>

                      <div className="space-y-1">
                        {/* All Complaints Option with Checkbox */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={handleToggleAll}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleToggleAll(); }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors border select-none ${
                            isAllSelected
                              ? "bg-blue-50 border-blue-200 text-blue-950 font-bold"
                              : "hover:bg-slate-50 border-transparent text-slate-800"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isAllSelected}
                              onChange={() => {}}
                              className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 pointer-events-none"
                            />
                            <span className="text-xs">All Complaints</span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            {statusCounts.all}
                          </span>
                        </div>

                        {/* Specific Status Options with Checkboxes */}
                        {STATUS_OPTIONS.map((opt) => {
                          const isChecked = selectedStatuses.includes(opt.key);
                          const count =
                            opt.key === "NOT_ASSIGNED"
                              ? statusCounts.notAssigned
                              : opt.key === "PENDING"
                              ? statusCounts.pending
                              : opt.key === "COMPLETE"
                              ? statusCounts.complete
                              : opt.key === "FIR_RECOMMEND"
                              ? statusCounts.firRecommend
                              : opt.key === "FIR_REGISTER"
                              ? statusCounts.firRegister
                              : opt.key === "FIR_REGISTERED"
                              ? statusCounts.firRegistered
                              : statusCounts.correctionRequired;

                          return (
                            <div
                              key={opt.key}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleToggleStatus(opt.key)}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleToggleStatus(opt.key); }}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors select-none ${
                                isChecked
                                  ? "bg-slate-100 text-slate-900 font-semibold"
                                  : "hover:bg-slate-50 text-slate-700"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 pointer-events-none"
                                />
                                <span className="text-xs">{opt.label}</span>
                              </div>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isChecked
                                    ? "bg-white border border-slate-200 text-slate-800"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {count}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Dropdown Footer */}
                      <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setSelectedStatuses([...ALL_STATUS_KEYS])}
                          className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Reset Filter
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusDropdownOpen(false)}
                          className="px-3 py-1 text-xs font-bold bg-[#0b192c] hover:bg-slate-800 text-white rounded-md transition-colors shadow-2xs cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Category Filter */}
                <div className="shrink-0">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-8.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-[#0b192c] focus:outline-none font-medium cursor-pointer"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="NCR">NCR</option>
                    <option value="FIR_RECOMMEND">FIR Recommend</option>
                    <option value="CLOSURE">Closure</option>
                  </select>
                </div>

                {/* 4. Compact Date Range Filter (Single Inline Row — never stacks) */}
                <div className="cms-date-range-container flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 shrink-0 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0b192c] transition-all">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="text-[11px] font-semibold text-slate-500 shrink-0">From:</span>
                  <div className="w-[122px] shrink-0">
                    <DatePickerDDMMYYYY
                      size="sm"
                      max={getTodayIsoIST()}
                      value={dateFrom}
                      onValueChange={setDateFrom}
                      placeholder="DD/MM/YYYY"
                      title="Date from (DD/MM/YYYY)"
                    />
                  </div>
                  <span className="text-slate-300 text-xs shrink-0">-</span>
                  <span className="text-[11px] font-semibold text-slate-500 shrink-0">To:</span>
                  <div className="w-[122px] shrink-0">
                    <DatePickerDDMMYYYY
                      size="sm"
                      min={dateFrom || undefined}
                      max={getTodayIsoIST()}
                      value={dateTo}
                      onValueChange={setDateTo}
                      placeholder="DD/MM/YYYY"
                      title="Date to (DD/MM/YYYY)"
                    />
                  </div>
                  {(dateFrom || dateTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDateFrom("");
                        setDateTo("");
                      }}
                      className="p-0.5 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                      title="Clear dates"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 5. Quick Date Presets: Segmented Pill */}
                <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/80 shrink-0 h-8.5">
                  <button
                    type="button"
                    onClick={() => {
                      const today = getTodayIsoIST();
                      setDateFrom(today);
                      setDateTo(today);
                    }}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      dateFrom && dateTo && dateFrom === dateTo && dateFrom === getTodayIsoIST()
                        ? "bg-white text-blue-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Today's complaints"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom(getDateDaysAgoIsoIST(7));
                      setDateTo(getTodayIsoIST());
                    }}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      dateFrom === getDateDaysAgoIsoIST(7) && dateTo === getTodayIsoIST()
                        ? "bg-white text-blue-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Last 7 days"
                  >
                    7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom(getMonthStartIsoIST());
                      setDateTo(getTodayIsoIST());
                    }}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      dateFrom === getMonthStartIsoIST() && dateTo === getTodayIsoIST()
                        ? "bg-white text-blue-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="This month"
                  >
                    Month
                  </button>
                </div>

                {/* 6. Column Visibility Dropdown (Last item from Green Box) */}
                <div className="relative shrink-0" ref={columnDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setColumnDropdownOpen((prev) => !prev)}
                    className="h-8.5 px-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                    title="Select which columns are visible in the register table"
                  >
                    <Columns3 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Columns</span>
                    <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${columnDropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {columnDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-60 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 animate-in fade-in-50 zoom-in-95 ring-1 ring-slate-900/10">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Visible Columns
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={resetColumnOrder}
                            className="text-[10px] font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                            title={t("कॉलम का ░म ░ीसेट ░ें", "Reset column order")}
                          >
                            Reset Order
                          </button>
                          <button
                            type="button"
                            onClick={resetColumns}
                            className="text-[10px] font-bold text-blue-700 hover:text-blue-900 cursor-pointer"
                          >
                            Reset All
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5 text-xs text-slate-700 max-h-72 overflow-y-auto">
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={visibleColumns.srNo}
                            onChange={() => toggleColumn("srNo")}
                            className="w-3.5 h-3.5 rounded text-blue-600"
                          />
                          <span>Sr No.</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={visibleColumns.complaintId}
                            onChange={() => toggleColumn("complaintId")}
                            className="w-3.5 h-3.5 rounded text-blue-600"
                          />
                          <span>Complaint ID</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={visibleColumns.dateTime}
                            onChange={() => toggleColumn("dateTime")}
                            className="w-3.5 h-3.5 rounded text-blue-600"
                          />
                          <span>Date &amp; Time</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={visibleColumns.complainant}
                            onChange={() => toggleColumn("complainant")}
                            className="w-3.5 h-3.5 rounded text-blue-600"
                          />
                          <span>Complainant</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={visibleColumns.categoryLocation}
                            onChange={() => toggleColumn("categoryLocation")}
                            className="w-3.5 h-3.5 rounded text-blue-600"
                          />
                          <span>Category &amp; Location</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={visibleColumns.status}
                            onChange={() => toggleColumn("status")}
                            className="w-3.5 h-3.5 rounded text-blue-600"
                          />
                          <span>Enquiry Status</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={visibleColumns.assignedEo}
                            onChange={() => toggleColumn("assignedEo")}
                            className="w-3.5 h-3.5 rounded text-blue-600"
                          />
                          <span>Enquiry Officer</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={visibleColumns.daysPending}
                            onChange={() => toggleColumn("daysPending")}
                            className="w-3.5 h-3.5 rounded text-blue-600"
                          />
                          <span>Days Registered</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={visibleColumns.action}
                            onChange={() => toggleColumn("action")}
                            className="w-3.5 h-3.5 rounded text-blue-600"
                          />
                          <span>Action</span>
                        </label>

                        {customCols.length > 0 && (
                          <div className="pt-2 border-t border-slate-100">
                            <span className="text-[10px] font-bold text-indigo-700 uppercase px-1">
                              Custom Columns (Table Manager)
                            </span>
                            <div className="space-y-1 mt-1">
                              {customCols.map((c) => {
                                const isChecked = visibleColumns[c.key] ?? c.isActive;
                                return (
                                  <label
                                    key={c.key}
                                    className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-indigo-50/50 cursor-pointer text-slate-700 select-none text-[11px]"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleColumn(c.key)}
                                      className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                                    />
                                    <span className="truncate">{c.label}</span>
                                    <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-700 px-1 rounded ml-auto">
                                      Custom
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="pt-2 mt-2 border-t border-slate-100 space-y-1">
                        <div className="text-[10px] text-slate-500">
                          💡 <em>{t("▓म का ░म ▓ने के िए उसका ░्षक खींचें।", "Drag column headers to reorder them.")}</em>
                        </div>
                        <Link
                          href="/settings?tab=table-manager"
                          className="flex items-center justify-between text-[11px] font-bold text-indigo-600 hover:text-indigo-800 pt-1"
                        >
                          <span>{t("+ कॉलम ╝ें या बéधित ░ें", "+ Add/Manage Columns")}</span>
                          <span>&rarr;</span>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
            </div>

            {/* Active Status & Date Badges / Filter Summary */}
            {((!isAllSelected && selectedStatuses.length > 0) || dateFrom || dateTo || searchQuery || Object.values(columnSearch).some(Boolean)) && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Filters:</span>
                {/* Search Badge */}
                {searchQuery && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-300 text-slate-800 rounded-md text-[11px] font-medium">
                    <Search className="w-3 h-3 text-slate-600" />
                    <span className="font-mono">&ldquo;{searchQuery}&rdquo;</span>
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="p-0.5 text-slate-500 hover:text-red-600 rounded transition-colors cursor-pointer flex items-center justify-center"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
                {/* Date Filter Badge */}
                {(dateFrom || dateTo) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-md text-[11px] font-medium">
                    <Calendar className="w-3 h-3 text-amber-700" />
                    <span>
                      {dateFrom && dateTo
                        ? `${formatDate(dateFrom)} to ${formatDate(dateTo)}`
                        : dateFrom
                        ? `From: ${formatDate(dateFrom)}`
                        : `To: ${formatDate(dateTo)}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDateFrom("");
                        setDateTo("");
                      }}
                      className="p-0.5 text-amber-700 hover:text-red-600 rounded transition-colors cursor-pointer flex items-center justify-center"
                      title="Remove date filter"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
                {!isAllSelected && selectedStatuses.map((k) => {
                  const opt = STATUS_OPTIONS.find((o) => o.key === k);
                  return (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-md text-[11px] font-medium"
                    >
                      <span>{opt?.label}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(k)}
                        className="p-0.5 text-blue-700 hover:text-red-600 rounded transition-colors cursor-pointer flex items-center justify-center"
                        title="Remove status filter"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  );
                })}
                {/* Column Specific Search Badges */}
                {Object.entries(columnSearch).map(([col, term]) => {
                  if (!term) return null;
                  let colLabel = col;
                  for (const [k, v] of Object.entries(COMPLAINT_COL_TO_SORT_FIELD)) {
                    if (v === col) {
                      colLabel = COMPLAINT_COL_LABELS[k] || k;
                      break;
                    }
                  }
                  return (
                    <span
                      key={col}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-md text-[11px] font-medium"
                    >
                      <span className="font-semibold text-blue-700">{colLabel}:</span>
                      <span className="font-mono">&ldquo;{term}&rdquo;</span>
                      <button
                        type="button"
                        onClick={() =>
                          setColumnSearch((prev) => {
                            const next = { ...prev };
                            delete next[col];
                            return next;
                          })
                        }
                        className="p-0.5 text-blue-600 hover:text-red-600 rounded transition-colors cursor-pointer flex items-center justify-center"
                        title={`Remove ${colLabel} filter`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatuses([...ALL_STATUS_KEYS]);
                    setDateFrom("");
                    setDateTo("");
                    setSearchQuery("");
                    setColumnSearch({});
                  }}
                  className="text-[11px] text-blue-700 hover:text-blue-900 underline font-semibold ml-1 cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results Count & Wide-Table Hint */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 px-1">
        <div className="flex items-center gap-3">
          <span>
            Showing <strong className="text-slate-800">{sortedComplaints.length}</strong>{" "}
            {isEo ? "complaint(s) assigned to your docket" : "complaints in register"}
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] text-slate-500">
            Use horizontal scroll <span className="font-mono">↔</span> for wide columns
          </span>
        </div>
      </div>

      {/* Main Content: Table on Desktop, Cards on Mobile */}
      {loading ? (
        <LoadingSkeleton count={4} />
      ) : fetchError ? (
        <Card className="border-red-200 bg-red-50/70">
          <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-red-950">Failed to load complaints register</h3>
                <p className="text-xs text-red-800 mt-1">{fetchError}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={fetchComplaints} className="border-red-300 bg-white text-red-900 hover:bg-red-100 shrink-0 cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : complaints.length === 0 ? (
        <EmptyState
          title={isEo ? `No complaints assigned to ${currentUser.name}` : "No complaints found"}
          description={
            isEo
              ? "You currently have no complaints marked to your PNO/Name matching the filters. Any complaint assigned to you by SHO will appear here automatically."
              : "Try clearing your search query or selecting different statuses from the status dropdown."
          }
          actionLabel="Clear Filters"
          onAction={() => {
            setSearchQuery("");
            setSelectedStatuses([...ALL_STATUS_KEYS]);
            setPriorityFilter("ALL");
            setCategoryFilter("ALL");
            setDateFrom("");
            setDateTo("");
          }}
        />
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View with Horizontal Scrolling & Column Customization */}
          <div className="cms-register-table hidden md:block bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden max-h-[calc(100vh-16rem)] overflow-y-auto">
            <div className="overflow-x-auto min-w-full">
              <table className="min-w-[1050px] w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
                  <tr>
                    {columnOrder.map((col) => {
                      if (!visibleColumns[col]) return null;
                      const isDragging = draggedCol === col;
                      const isOver = dragOverCol === col;

                      return (
                        <th
                          key={col}
                          draggable={!activeSearchCol}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", col);
                            setDraggedCol(col);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDragEnter={() => {
                            if (draggedCol && draggedCol !== col) {
                              setDragOverCol(col);
                            }
                          }}
                          onDragLeave={(e) => {
                            if (e.currentTarget === e.target) {
                              setDragOverCol(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            handleColumnDrop(col);
                          }}
                          onDragEnd={() => {
                            setDraggedCol(null);
                            setDragOverCol(null);
                          }}
                          className={`transition-all select-none ${
                            col === "srNo"
                              ? "py-3 px-2 w-14 max-w-[56px] text-center"
                              : `py-3 px-4 cursor-grab active:cursor-grabbing ${
                                  col === "dateTime" ? "whitespace-nowrap" : ""
                                } ${
                                  isDragging ? "opacity-30 bg-slate-200" : ""
                                } ${
                                  isOver ? "border-l-4 border-l-blue-600 bg-blue-50/80 shadow-inner" : ""
                                }`
                          }`}
                        >
                          {renderComplaintColumnHeader(col)}
                        </th>
                      );
                    })}

                    {visibleColumns.action && (
                      <th className="py-3 px-4 text-right align-top pt-3.5">Next action</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sortedComplaints.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(1, visibleColumnCount)}>
                        {emptyComplaints}
                      </td>
                    </tr>
                  )}
                  {pageComplaints.map((c, idx) => (
                    <tr
                      key={c.id}
                      onClick={(e) => {
                        const target = e.target as HTMLElement | null;
                        if (target?.closest("a, button, input, select, textarea, [role='button']")) {
                          return;
                        }
                        router.push(`/complaints/${c.id}`);
                      }}
                      className="hover:bg-slate-50/90 transition-colors cursor-pointer"
                    >
                      {columnOrder.map((col) => {
                        if (!visibleColumns[col]) return null;
                        return renderComplaintCell(col, c, (page-1)*20+idx);
                      })}

                      {visibleColumns.action && (
                        <td
                          className="py-2.5 px-4 text-right align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-col items-end gap-1.5 min-w-[130px]">
<Link href={`/complaints/${c.id}`} className="cms-open-case">Open case <Eye className="w-3.5 h-3.5"/></Link>
{isSho && !isMhc && !c.isFirRegistered && (c.directSendToFir || c.status === "FIR_REGISTER" || c.workflowState === "FIR_REGISTER") && (
                              <Link href={`/fir/register?complaintId=${c.id}`} className="w-full">
                                <Button
                                  size="sm"
                                  className="w-full text-xs font-bold gap-1 justify-center bg-red-600 hover:bg-red-700 text-white cursor-pointer shadow-2xs animate-pulse"
                                >
                                  <Scale className="w-3.5 h-3.5" />
                                  <span>Register FIR</span>
                                </Button>
                              </Link>
                            )}
{isSho && !isMhc && (
                              c.isFirApprovedBySho ||
                              c.workflowState === "FIR_REGISTRATION_PENDING" ||
                              c.finalCategory === "FIR Recommend" ||
                              c.status === "FIR Recommend"
                            ) && !c.isFirRegistered && !c.directSendToFir && (
                              <Button
                                size="sm"
                                onClick={() => handleOpenFirRegisterModal(c)}
                                className="w-full text-xs font-bold gap-1 justify-center bg-red-600 hover:bg-red-700 text-white cursor-pointer shadow-2xs animate-pulse"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Register FIR</span>
                              </Button>
                            )}
<ActionsDropdown label="Complaint actions">
<Link href={`/complaints/${c.id}`} className="w-full">
                              <Button
                                size="sm"
                                variant="primary"
                                className="w-full text-xs font-semibold gap-1 justify-center"
                              >
                                <Eye className="w-3.5 h-3.5" /> View Profile
                              </Button>
                            </Link>
{/* Direct FIR for SHO account: Show "Register FIR" button */}
{/* If FIR registered, show link to FIR Register */}
{(c.isFirRegistered || c.firNumber) && (
                              <Link href="/fir" className="w-full">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full text-[11px] font-bold gap-1 justify-center border-red-300 text-red-700 hover:bg-red-50 cursor-pointer shadow-2xs"
                                >
                                  <Scale className="w-3.5 h-3.5" />
                                  <span>FIR: {c.firNumber || "Registered"}</span>
                                </Button>
                              </Link>
                            )}
{/* EO: If Report prepared with Complete or FIR Recommend and not yet sent - strictly only assigned EO */}
{isUserAssignedEo(currentUser, c) && (c.eoOutcome === "Complete" || c.eoOutcome === "FIR Recommend" || c.isRecommendedForFir) && !c.isSentToSho && c.status !== "COMPLETE" && c.workflowState !== "CORRECTION_REQUIRED" && (
                              <Button
                                size="sm"
                                onClick={() => setEoSendToShoModalComplaint(c)}
                                className="w-full text-xs font-bold gap-1 justify-center bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-2xs"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Send to SHO</span>
                              </Button>
                            )}
{/* EO: Display Rejection Reason & Correct Button if rejected by SHO */}
{isEo && (c.workflowState === "CORRECTION_REQUIRED" || c.shoDecision === "REJECT" || c.status === "CORRECTION_REQUIRED") && (
                              <div className="w-full text-left bg-amber-50 border border-amber-300 rounded p-1.5 text-[11px] text-amber-900 space-y-1">
                                <div className="font-bold flex items-center gap-1 text-amber-800">
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>Correction Required</span>
                                </div>
                                <p className="line-clamp-2 text-[10px] text-amber-950 font-medium bg-white/80 p-1 rounded border border-amber-200">
                                  <strong>Reason:</strong> {c.rejectionReason || "Report rejected by SHO. Correction required."}
                                </p>
                                <Link href={`/complaints/${c.id}`} className="block">
                                  <Button
                                    size="sm"
                                    className="w-full text-[11px] font-bold justify-center bg-amber-600 hover:bg-amber-700 text-white cursor-pointer h-6 px-1"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Correct &amp; Resubmit</span>
                                  </Button>
                                </Link>
                              </div>
                            )}
{/* SHO: Action on Completed EO Report -> View Report first, then Approve / Reject */}
{isSho && !isMhc && !c.isFirRegistered && !c.directSendToFir && c.status !== "FIR_REGISTER" && (
                              c.isSentToSho ||
                              c.status === "COMPLETE" ||
                              c.workflowState === "COMPLETE" ||
                              c.status === "REPORT_SUBMITTED" ||
                              c.status === "RECOMMENDED_FOR_FIR" ||
                              c.workflowState === "SENT_TO_SHO" ||
                              c.workflowState === "FIR_RECOMMENDED" ||
                              c.eoOutcome === "Complete" ||
                              c.eoOutcome === "FIR Recommend" ||
                              Boolean(c.eoRecommendedCategory) ||
                              (c.reports && c.reports.some((r) => r.sentToSho || r.isSentToSho))
                            ) && !c.isFirApprovedBySho && c.workflowState !== "CORRECTION_REQUIRED" && c.status !== "CORRECTION_REQUIRED" && c.shoDecision !== "REJECT" && c.shoDecision !== "APPROVE" && (
                              !c.isReportViewedBySho ? (
                                <Link
                                  href={`/complaints/${c.id}?tab=reports`}
                                  className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-md h-7 px-2 shadow-2xs transition-colors cursor-pointer"
                                  title="View enquiry report before approving or rejecting"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View Report</span>
                                </Link>
                              ) : (
                                <div className="flex items-center gap-1 w-full">
                                  <Button
                                    size="sm"
                                    onClick={() => setShoApproveModalComplaint(c)}
                                    className="flex-1 text-[11px] font-bold justify-center bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer h-7 px-1.5"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span>Approve</span>
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setShoRejectModalComplaint(c);
                                      setRejectionReason("");
                                    }}
                                    className="flex-1 text-[11px] font-bold justify-center bg-rose-600 hover:bg-rose-700 text-white cursor-pointer h-7 px-1.5"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Reject</span>
                                  </Button>
                                </div>
                              )
                            )}
{/* SHO: Regular FIR Registration when recommended & approved */}
{/* Receipt Button */}
{c.assignedEoName && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setReceiptComplaint(c);
                                  setShowReceiptModal(true);
                                }}
                                className="w-full text-xs font-semibold gap-1 justify-center text-emerald-800 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 cursor-pointer shadow-2xs"
                                title="Official Receipt of registered complaints"
                              >
                                <Printer className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Receipt</span>
                              </Button>
                            )}
</ActionsDropdown>
</div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {sortedComplaints.length > 0 && (
            <div className="cms-pagination"><span>Showing {(page-1)*20+1}–{Math.min(page*20,sortedComplaints.length)} of {sortedComplaints.length} complaints</span><div className="flex gap-2 items-center"><button disabled={page===1} onClick={()=>setRegisterPage({key:pageKey,page:page-1})}>Previous</button><span>Page {page} of {pageCount}</span><button disabled={page===pageCount} onClick={()=>setRegisterPage({key:pageKey,page:page+1})}>Next</button></div></div>
          )}
          {/* Mobile Card-Based View */}
          <div className="md:hidden space-y-3">
            {sortedComplaints.length === 0 && emptyComplaints}
            {pageComplaints.map((c) => (
              <Card key={c.id} className="border-slate-200 shadow-xs">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link
                      href={`/complaints/${c.id}`}
                      className="font-mono text-xs font-bold text-[#0b192c] hover:underline"
                    >
                      {c.complaintNumber}
                    </Link>
                    {c.fivePNumber && (
                      <span className="text-[9px] font-mono font-bold px-1 rounded bg-purple-100 text-purple-900 border border-purple-300">
                        5-P: {c.fivePNumber}
                      </span>
                    )}
                  </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-blue-600" />
                      {formatDate(c.createdAt)}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {new Date(c.createdAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <Link
                      href={`/complaints/${c.id}`}
                      className="text-sm font-bold text-slate-900 hover:underline block"
                    >
                      {c.complainantName}
                    </Link>
                    <div className="flex items-center gap-3 text-xs text-slate-600">
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {c.complainantMobile}
                      </span>
                      <span>•</span>
                      <span>{c.categoryDisplay}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-700">
                    <p className="line-clamp-2">{c.incidentDetails}</p>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <StatusBadge status={getMainComplaintStatus(c)} />
                    <span className="text-[11px] text-slate-500 font-medium">
                      {c.directSendToFir || c.status === "FIR_REGISTER" || c.workflowState === "FIR_REGISTER"
                        ? "Direct to FIR"
                        : `EO: ${c.assignedEoName || "Not Assigned"}`}
                    </span>
                  </div>

                  <div className="pt-2 flex flex-col gap-2 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-2">
                      <Link href={`/complaints/${c.id}`} className="block">
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full text-xs font-semibold gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> View Profile
                        </Button>
                      </Link>
                      {c.assignedEoName ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setReceiptComplaint(c);
                              setShowReceiptModal(true);
                            }}
                            className="w-full text-xs font-semibold gap-1 text-emerald-800 border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                          >
                            <Printer className="w-3.5 h-3.5 text-emerald-700" /> Receipt
                          </Button>
                        </>
                      ) : (
                        isSho && !isMhc && !c.directSendToFir && c.status !== "FIR_REGISTER" && c.workflowState !== "FIR_REGISTER" && (
                          <div className="relative w-full" data-assign-dropdown>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setAssignDropdownComplaintId((prev) => prev === c.id ? null : c.id)}
                              className="w-full text-xs font-bold gap-1 bg-[#0b192c] text-white hover:bg-slate-800"
                            >
                              <UserCheck className="w-3.5 h-3.5 text-amber-300" /> Assign EO ▾
                            </Button>
                            {assignDropdownComplaintId === c.id && (
                              <div className="absolute left-0 bottom-full mb-1 z-50 w-full bg-white border border-slate-200 rounded-xl shadow-xl py-1 text-left animate-in fade-in-50">
                                <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                                  <span>Select EO / IO</span>
                                  <span className="text-slate-400 font-mono text-[9px]">Rank &amp; Name</span>
                                </div>
                                <div className="max-h-56 overflow-y-auto py-0.5">
                                  {eoRoster.length === 0 && (
                            <p role="status" className="px-3 py-2 text-xs text-slate-600">
                              {eoRosterLoading ? "Loading station officers…" : eoRosterError || "No active EO/IO at this station."}
                            </p>
                          )}
                          {eoRoster.map((eo) => {
                                    const label = eo.name.startsWith(eo.rank) ? eo.name : `${eo.rank} ${eo.name}`;
                                    const isSelected = c.assignedEoId === eo.id || c.assignedEoName?.toLowerCase().includes(eo.name.toLowerCase());
                                    return (
                                      <button
                                        key={eo.id}
                                        type="button"
                                        disabled={isQuickAssigning}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleQuickAssignEO(c.id, eo);
                                        }}
                                        className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                                          isSelected ? "bg-blue-50 text-blue-900 font-bold" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                        }`}
                                      >
                                        <span className="truncate">{label}</span>
                                        {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>

                    {/* Direct FIR on mobile for SHO */}
                    {isSho && !isMhc && !c.isFirRegistered && (c.directSendToFir || c.status === "FIR_REGISTER" || c.workflowState === "FIR_REGISTER") && (
                      <Button
                        size="sm"
                        onClick={() => handleOpenFirRegisterModal(c)}
                        className="w-full text-xs font-bold gap-1 bg-red-600 hover:bg-red-700 text-white animate-pulse"
                      >
                        <FileText className="w-3.5 h-3.5" /> Register FIR
                      </Button>
                    )}

                    {/* EO Rejection Banner & Correct Button on mobile */}
                    {isEo && (c.workflowState === "CORRECTION_REQUIRED" || c.shoDecision === "REJECT" || c.status === "CORRECTION_REQUIRED") && (
                      <div className="w-full text-left bg-amber-50 border border-amber-300 rounded p-2 text-xs text-amber-900 space-y-1">
                        <div className="font-bold flex items-center gap-1 text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Correction Required</span>
                        </div>
                        <p className="text-[11px] text-amber-950 font-medium bg-white/80 p-1.5 rounded border border-amber-200">
                          <strong>Reason:</strong> {c.rejectionReason || "Report rejected by SHO. Correction required."}
                        </p>
                        <Link href={`/complaints/${c.id}`} className="block">
                          <Button
                            size="sm"
                            className="w-full text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white mt-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Correct &amp; Resubmit
                          </Button>
                        </Link>
                      </div>
                    )}

                    {/* Additional action buttons on mobile - strictly only assigned EO */}
                    {isUserAssignedEo(currentUser, c) && (c.eoOutcome === "Complete" || c.eoOutcome === "FIR Recommend" || c.isRecommendedForFir) && !c.isSentToSho && c.status !== "COMPLETE" && c.workflowState !== "CORRECTION_REQUIRED" && (
                      <Button
                        size="sm"
                        onClick={() => setEoSendToShoModalComplaint(c)}
                        className="w-full text-xs font-bold gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Send className="w-3.5 h-3.5" /> Send to SHO
                      </Button>
                    )}

                    {/* SHO: Approve / Reject buttons on Mobile */}
                    {isSho && !isMhc && !c.isFirRegistered && !c.directSendToFir && c.status !== "FIR_REGISTER" && (
                      c.isSentToSho ||
                      c.status === "COMPLETE" ||
                      c.workflowState === "COMPLETE" ||
                      c.status === "REPORT_SUBMITTED" ||
                      c.status === "RECOMMENDED_FOR_FIR" ||
                      c.workflowState === "SENT_TO_SHO" ||
                      c.workflowState === "FIR_RECOMMENDED" ||
                      c.eoOutcome === "Complete" ||
                      c.eoOutcome === "FIR Recommend" ||
                      Boolean(c.eoRecommendedCategory) ||
                      (c.reports && c.reports.some((r) => r.sentToSho || r.isSentToSho))
                    ) && !c.isFirApprovedBySho && c.workflowState !== "CORRECTION_REQUIRED" && c.status !== "CORRECTION_REQUIRED" && c.shoDecision !== "REJECT" && c.shoDecision !== "APPROVE" && (
                      !c.isReportViewedBySho ? (
                        <Link
                          href={`/complaints/${c.id}?tab=reports`}
                          className="w-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-1.5 px-3 flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                        >
                          <Eye className="w-3.5 h-3.5 inline" /> View Report
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => setShoApproveModalComplaint(c)}
                            className="flex-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1 inline" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setShoRejectModalComplaint(c);
                              setRejectionReason("");
                            }}
                            className="flex-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
                          >
                            <X className="w-3.5 h-3.5 mr-1 inline" /> Reject
                          </Button>
                        </div>
                      )
                    )}

                    {isSho && !isMhc && (
                      c.isFirApprovedBySho ||
                      c.workflowState === "FIR_REGISTRATION_PENDING" ||
                      c.finalCategory === "FIR Recommend" ||
                      c.status === "FIR Recommend"
                    ) && !c.isFirRegistered && !c.directSendToFir && (
                      <Button
                        size="sm"
                        onClick={() => handleOpenFirRegisterModal(c)}
                        className="w-full text-xs font-bold bg-red-600 hover:bg-red-700 text-white animate-pulse"
                      >
                        <FileText className="w-3.5 h-3.5" /> Register FIR
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Complaint Detail Inspection Modal / Drawer */}
      {selectedComplaint && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedComplaint(null)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col z-10 overflow-hidden animate-in fade-in-0 zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-[#081225] text-white flex items-center justify-between border-b border-slate-800">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-amber-400">
                    {selectedComplaint.complaintNumber}
                  </span>
                  <PriorityBadge priority={selectedComplaint.priority} />
                </div>
                <h3 className="text-base font-bold text-white">
                  Complaint Case File • {selectedComplaint.policeStation}
                </h3>
              </div>
              <button
                onClick={() => setSelectedComplaint(null)}
                className="p-1 rounded-md text-white hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs sm:text-sm">
              {/* Status and Officer Bar */}
              {/* Status and Officer Bar */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] text-slate-500 block">Current Status</span>
                  <StatusBadge status={selectedComplaint.status} />
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Assigned Enquiry Officer</span>
                  <p className="font-bold text-slate-900">
                    {selectedComplaint.assignedEoName ? (
                      <span>
                        {selectedComplaint.assignedEoName}{" "}
                        <span className="text-xs font-normal text-slate-500">
                          ({selectedComplaint.assignedEoRank}, PNO: {selectedComplaint.assignedEoPno})
                        </span>
                      </span>
                    ) : (
                      "Not yet assigned"
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Intake Date</span>
                  <p className="font-semibold text-slate-700 font-mono">
                    {formatDate(selectedComplaint.createdAt)}
                  </p>
                </div>
              </div>

              {/* If assigned, show duty roster and directions box */}
              {selectedComplaint.assignedEoName && (
                <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-blue-200/60 pb-1.5">
                    <span className="font-bold text-blue-950 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-blue-700" />
                      <span>Enquiry Officer Assignment & Roster Duty Details</span>
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-200/70 text-blue-900">
                      Active Investigation
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                    <div>
                      <span className="text-slate-500 font-medium">Assigned Officer:</span>{" "}
                      <span className="font-semibold text-slate-900">{selectedComplaint.assignedEoName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Roster Duty:</span>{" "}
                      <span className="font-semibold text-blue-900">{selectedComplaint.assignedRosterDuty || "Beat Patrolling & Enquiries"}</span>
                    </div>
                    {selectedComplaint.targetResolutionDate && (
                      <div>
                        <span className="text-slate-500 font-medium">Target Completion:</span>{" "}
                        <span className="font-semibold text-slate-900">{formatDate(selectedComplaint.targetResolutionDate)}</span>
                      </div>
                    )}
                  </div>
                  {selectedComplaint.assignedDirections && (
                    <div className="pt-1">
                      <span className="text-slate-500 font-medium block mb-1">Supervisory Directions Transmitted:</span>
                      <div className="p-2 bg-white rounded border border-blue-200 text-slate-800 text-xs">
                        {selectedComplaint.assignedDirections}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Complainant Particulars */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="font-bold text-slate-900 uppercase text-xs tracking-wider border-b border-slate-100 pb-1 text-[#0b192c]">
                  1. Complainant Particulars
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Full Name:</span>{" "}
                    <span className="font-bold text-slate-900">{selectedComplaint.complainantName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Father/Spouse:</span>{" "}
                    <span className="font-medium text-slate-800">
                      {selectedComplaint.complainantFatherSpouse || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Contact Mobile:</span>{" "}
                    <span className="font-bold text-slate-900 font-mono">
                      {selectedComplaint.complainantMobile}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Gender / Age:</span>{" "}
                    <span className="font-medium text-slate-800">
                      {selectedComplaint.complainantGender} • {selectedComplaint.complainantAge ? `${selectedComplaint.complainantAge} Yrs` : "Age not specified"}
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">Residential Address:</span>{" "}
                    <span className="font-medium text-slate-800">
                      {selectedComplaint.complainantAddress}, {selectedComplaint.complainantCity},{" "}
                      {selectedComplaint.complainantDistrict}
                    </span>
                  </div>
                </div>
              </div>

              {/* Incident Facts */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="font-bold text-slate-900 uppercase text-xs tracking-wider border-b border-slate-100 pb-1 text-[#0b192c]">
                  2. Incident Facts & Allegations
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-4 text-slate-600">
                    <span>
                      <strong>Date of Incident:</strong> {selectedComplaint.incidentDate ? formatDate(selectedComplaint.incidentDate) : "Not specified"}
                    </span>
                    <span>
                      <strong>Location:</strong> {selectedComplaint.incidentPlace}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-slate-800 leading-relaxed font-sans text-xs sm:text-sm">
                    {selectedComplaint.incidentDetails}
                  </div>
                </div>
              </div>

              {/* Attached Evidence Files (If Any) */}
              {selectedComplaint.attachments && selectedComplaint.attachments.length > 0 && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                    <h4 className="font-bold text-slate-900 uppercase text-xs tracking-wider text-[#0b192c] flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                      <span>Attached Evidence ({selectedComplaint.attachments.length})</span>
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      Digitally Sealed
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {selectedComplaint.attachments.map((file) => (
                      <div
                        key={file.id}
                        className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {file.category === "video" && <Video className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                            {file.category === "audio" && <Music className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                            {file.category === "image" && <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                            {file.category === "document" && <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                            {file.category === "other" && <Paperclip className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                            <span className="font-semibold text-slate-900 truncate">{file.name}</span>
                          </div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 shrink-0">
                            {file.category}
                          </span>
                        </div>

                        {file.category === "audio" && file.dataUrl && (
                          <audio controls src={file.dataUrl} className="w-full h-7 pt-1" />
                        )}

                        {file.category === "video" && file.dataUrl && (
                          <video controls src={file.dataUrl} className="w-full rounded max-h-36 bg-black" />
                        )}

                        {file.category === "image" && file.dataUrl && (
                          <img
                            src={file.dataUrl}
                            alt={file.name}
                            className="max-h-28 rounded object-contain border border-slate-200"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Accused Suspects */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="font-bold text-slate-900 uppercase text-xs tracking-wider border-b border-slate-100 pb-1 text-[#0b192c]">
                  3. Accused / Suspect Information
                </h4>
                {selectedComplaint.accusedList && selectedComplaint.accusedList.length > 0 ? (
                  <div className="space-y-2">
                    {selectedComplaint.accusedList.map((acc, i) => (
                      <div key={i} className="p-2.5 bg-slate-50 rounded-lg text-xs space-y-1 border border-slate-100">
                        <p className="font-bold text-slate-900">{acc.name}</p>
                        {acc.address && <p className="text-slate-600">Address: {acc.address}</p>}
                        {acc.phone && <p className="text-slate-600 font-mono">Contact: {acc.phone}</p>}
                        {acc.relationWithComplainant && (
                          <p className="text-slate-600">Relation: {acc.relationWithComplainant}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No specific suspect named or unknown offender.</p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">
                Registered by: {selectedComplaint.registeredBy}
              </span>
              <div className="flex items-center gap-2">
                <Link href={`/complaints/${selectedComplaint.id}`}>
                  <Button size="sm" variant="primary" className="bg-[#0b192c] text-white hover:bg-slate-800 gap-1 text-xs">
                    <Eye className="w-3.5 h-3.5" /> Open Full Profile
                  </Button>
                </Link>
                {selectedComplaint.assignedEoName && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReceiptComplaint(selectedComplaint);
                      setShowReceiptModal(true);
                    }}
                    className="text-xs font-semibold gap-1 text-emerald-800 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-700" /> Print Receipt
                  </Button>
                )}
                {isSho && !isMhc && !selectedComplaint.directSendToFir && selectedComplaint.status !== "FIR_REGISTER" && selectedComplaint.workflowState !== "FIR_REGISTER" && (
                  <div className="relative" data-assign-dropdown>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setAssignDropdownComplaintId((prev) => prev === selectedComplaint.id ? null : selectedComplaint.id)}
                      className="text-xs font-bold gap-1 bg-[#0b192c] text-white hover:bg-slate-800 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-amber-300" />
                      <span>{selectedComplaint.assignedEoName ? "Reassign EO ▾" : "Assign Enquiry Officer ▾"}</span>
                    </Button>
                    {assignDropdownComplaintId === selectedComplaint.id && (
                      <div className="absolute right-0 bottom-full mb-1.5 z-50 w-72 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-2xl py-1 text-left animate-in fade-in-50">
                        <div className="px-3 py-2 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between bg-slate-50/70 rounded-t-xl">
                          <span>Select EO / IO</span>
                          <span className="text-slate-400 font-mono text-[9px]">Rank &amp; Name</span>
                        </div>
                        <div className="max-h-64 overflow-y-auto py-1 divide-y divide-slate-100">
                          {eoRoster.length === 0 && (
                            <p role="status" className="px-3 py-2 text-xs text-slate-600">
                              {eoRosterLoading ? "Loading station officers…" : eoRosterError || "No active EO/IO at this station."}
                            </p>
                          )}
                          {eoRoster.map((eo) => {
                            const label = eo.name.startsWith(eo.rank) ? eo.name : `${eo.rank} ${eo.name}`;
                            const isSelected = selectedComplaint.assignedEoId === eo.id || selectedComplaint.assignedEoName?.toLowerCase().includes(eo.name.toLowerCase());
                            return (
                              <button
                                key={eo.id}
                                type="button"
                                disabled={isQuickAssigning}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickAssignEO(selectedComplaint.id, eo);
                                  setSelectedComplaint((prev) => prev ? { ...prev, assignedEoId: eo.id, assignedEoName: eo.name, assignedEoPno: eo.pno, status: "ENQUIRY_IN_PROGRESS" } : null);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                                  isSelected
                                    ? "bg-blue-50 text-blue-900 font-bold"
                                    : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate font-semibold text-slate-900">{label}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-normal">
                                    <span>PNO: {eo.pno}</span>
                                  </div>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <Button size="sm" variant="outline" onClick={() => setSelectedComplaint(null)} className="text-xs">
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SHO Assign EO Modal removed: SHO uses instant inline dropdown showing Rank & Name only (no dialogue box) */}

      {/* SHO Approve Modal with 3 Categories */}
      <ShoApproveCategoryModal
        complaint={shoApproveModalComplaint}
        isOpen={Boolean(shoApproveModalComplaint)}
        onClose={() => setShoApproveModalComplaint(null)}
        onSubmit={handleShoApprove}
        isLoading={isApproving}
      />

      {/* SHO Re-Enquiry Modal */}
      {shoReEnquiryModalComplaint && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-sm">Order Re-Enquiry by SHO</h3>
              </div>
              <button onClick={() => setShoReEnquiryModalComplaint(null)} className="text-white hover:opacity-80">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p><strong>Complaint No:</strong> {shoReEnquiryModalComplaint.complaintNumber}</p>
                <p><strong>Complainant:</strong> {shoReEnquiryModalComplaint.complainantName}</p>
                <p><strong>Enquiry Officer:</strong> {shoReEnquiryModalComplaint.assignedEoName}</p>
                <p className="text-amber-800 font-semibold pt-1">
                  This complaint will be returned to the SAME Enquiry Officer ({shoReEnquiryModalComplaint.assignedEoName}), status will remain &quot;Pending&quot;, and the EO will be notified immediately.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Re-Enquiry Reason &amp; Specific Directions <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={reEnquiryReason}
                  onChange={(e) => setReEnquiryReason(e.target.value)}
                  placeholder="Explain why re-enquiry is required (e.g. key witnesses not examined, site plan missing, clarification required)..."
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShoReEnquiryModalComplaint(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleShoReEnquiry}
                disabled={isSubmittingReEnquiry || !reEnquiryReason.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                {isSubmittingReEnquiry ? "Submitting..." : "Order Re-Enquiry & Notify EO"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SHO Reject Report Modal */}
      {shoRejectModalComplaint && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-sm">Reject Enquiry Report &amp; Return to EO</h3>
              </div>
              <button onClick={() => setShoRejectModalComplaint(null)} className="text-white hover:opacity-80">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p><strong>Complaint No:</strong> {shoRejectModalComplaint.complaintNumber}</p>
                <p><strong>Complainant:</strong> {shoRejectModalComplaint.complainantName}</p>
                <p><strong>Assigned EO:</strong> {shoRejectModalComplaint.assignedEoName} (PNO: {shoRejectModalComplaint.assignedEoPno})</p>
                <p className="text-rose-800 font-semibold pt-1">
                  On rejection submission, this complaint will be returned to the same assigned EO ({shoRejectModalComplaint.assignedEoName}) for correction and resubmission.
                  The complaint status will change to <strong>&ldquo;Correction Required&rdquo;</strong>, and the rejection reason will be clearly displayed in the EO account.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Rejection Reason &amp; Specific Corrections Required <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter mandatory rejection reason and required corrections (e.g. statements incomplete, site plan missing, clarification required on suspect version)..."
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-sans text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShoRejectModalComplaint(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleShoReject}
                disabled={isSubmittingReject || !rejectionReason.trim()}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
              >
                {isSubmittingReject ? "Submitting..." : "Submit Rejection & Return to EO"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SHO Register FIR Modal: Roznamcha Criminal Case GD Entry */}
      {firRegisterModalComplaint && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5" />
                <div>
                  <h3 className="font-bold text-sm">Roznamcha GD Auto-Suggestion &amp; Register FIR</h3>
                  <p className="text-[11px] text-red-100">Criminal Case GD auto-suggestion will be sent to Auto-Suggestions &amp; Drafts</p>
                </div>
              </div>
              <button onClick={() => setFirRegisterModalComplaint(null)} className="text-white hover:opacity-80">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p><strong>Complaint No:</strong> <span className="font-mono text-red-950 font-bold">{firRegisterModalComplaint.complaintNumber}</span></p>
                <p><strong>Complainant:</strong> {firRegisterModalComplaint.complainantName} ({firRegisterModalComplaint.complainantMobile || "N/A"})</p>
                <p><strong>Police Station:</strong> {firRegisterModalComplaint.policeStation}</p>
                <p>
                  <strong>Enquiry/Investigating Officer:</strong>{" "}
                  {firRegisterModalComplaint.assignedEoName ? `${firRegisterModalComplaint.assignedEoName} (${firRegisterModalComplaint.assignedEoRank || "EO"}, PNO: ${firRegisterModalComplaint.assignedEoPno || "HR-04291882"})` : `${currentUser.name} (SHO)`}
                </p>
              </div>

              {/* 1. Case Type dropdown */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  1. Case Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={firCaseTypeInput}
                  onChange={(e) => setFirCaseTypeInput(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 bg-white"
                >
                  <option value="">Select</option>
                  <option value="ADULT">ADULT</option>
                  <option value="JUVENILE & ADULT">JUVENILE & ADULT</option>
                  <option value="ONLY JUVENILE">ONLY JUVENILE</option>
                </select>
                <span className="text-[10px] text-slate-500">Classification of accused/offenders in Roznamcha entry.</span>
              </div>

              {/* 2. Acts & Sections Applicable (mirroring FIR register form) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">
                    2. Acts &amp; Sections Applicable <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-red-600 font-mono">BNS, 2023</span>
                </div>
                <input
                  type="text"
                  value={firSectionsInput}
                  onChange={(e) => setFirSectionsInput(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  placeholder="e.g. Section 303(2), 115(2), 3(5) BNS, 2023"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[10px] text-slate-500">Quick add:</span>
                  {["Sec 303(2) BNS", "Sec 115(2) BNS", "Sec 351(2) BNS", "Sec 3(5) BNS", "Sec 305 BNS", "Sec 316 BNS"].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        setFirSectionsInput((prev) => {
                          if (!prev.trim()) return sec;
                          if (prev.includes(sec)) return prev;
                          return `${prev}, ${sec}`;
                        });
                      }}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-red-50 hover:border-red-300 border border-slate-200 text-[10px] rounded font-mono text-slate-700 cursor-pointer"
                    >
                      + {sec}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 leading-relaxed text-[11px]">
                A <strong>Criminal case</strong> GD auto-suggestion will be generated in Roznamcha <strong>Auto-Suggestions &amp; Drafts</strong> with Complaint No., EO/IO details, and these sections. Then the FIR Register Form will open with all details auto-filled.
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setFirRegisterModalComplaint(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRegisterFirSubmit}
                disabled={isRegisteringFir || !firCaseTypeInput}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
              >
                {isRegisteringFir ? "Creating Suggestion & Opening FIR Form..." : "Create GD Auto-Suggestion & Register FIR"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* EO Send to SHO Modal with 3 Categories */}
      <EoSendingToShoModal
        complaint={eoSendToShoModalComplaint}
        isOpen={Boolean(eoSendToShoModalComplaint)}
        onClose={() => setEoSendToShoModalComplaint(null)}
        onSubmit={handleEoSendToShoSubmit}
        isLoading={isSendingToSho}
      />

      {/* Official Receipt of Registered Complaints Modal */}
      <ComplaintReceiptModal
        complaint={receiptComplaint}
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
      />

      {/* Transfer Complaint Modal */}
      <TransferComplaintModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        complaints={complaints}
        onTransferSuccess={() => {
          fetchComplaints();
        }}
        preSelectedComplaintId={modalPreselectedComplaintId}
      />

      {/* Link & Delink Complaints Modal */}
      <LinkDelinkComplaintsModal
        isOpen={isLinkDelinkModalOpen}
        onClose={() => setIsLinkDelinkModalOpen(false)}
        complaints={complaints}
        onSuccess={() => {
          fetchComplaints();
        }}
        preSelectedComplaintId={modalPreselectedComplaintId}
      />
    </div>
  );
}

export default function ComplaintListPage() {
  return (
    <React.Suspense fallback={<LoadingSkeleton count={4} />}>
      <ComplaintListContent />
    </React.Suspense>
  );
}
