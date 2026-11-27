"use client";

import { isMhcOrMmRole } from "@/lib/officerRoles";
import { useLanguage } from "@/context/LanguageContext";

import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
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
  Copy,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { persistentFirService as firService } from "@/services/persistentFirService";
import { FIRItem, MainFIRStatus, getMainFIRStatus } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/ui/badge";
import { EmptyState, LoadingSkeleton } from "@/components/ui/state-views";
import { useFirIoRoster } from "@/hooks/useFirIoRoster";
import { formatDate, formatDateTime, getTodayIsoIST } from "@/lib/utils";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { FIRReceiptModal } from "@/components/fir/FIRReceiptModal";
import { TransferFIRModal } from "@/components/fir/TransferFIRModal";
import { LinkDuplicateFIRModal } from "@/components/fir/LinkDuplicateFIRModal";
import { TableManagerService, ManagedColumn } from "@/services/tableManagerService";
import { canRegisterFir, isUserAssignedIo, isFirVisibleToUser, getAuthoritativeTrackingState } from "@/lib/firIntegrity";
import { DatePickerDDMMYYYY } from "@/components/ui/date-picker-ddmmyyyy";
import { BnssChallanCountdown } from "@/components/fir/BnssChallanCountdown";
import { LawSectionTooltip } from "@/components/common/LawSectionTooltip";

type FIRSortField =
  | "firNumber"
  | "policeStation"
  | "firDate"
  | "complainantName"
  | "actsAndSections"
  | "status"
  | "assignedIoName"
  | "daysPending";

const FIR_STATUS_OPTIONS = [
  { key: "UNDER_INVESTIGATION", label: "Under Investigation" },
  { key: "PENDING_SUPERVISORY_REVIEW", label: "Pending Review" },
  { key: "CHARGESHEET_FILED", label: "Chargesheet Filed" },
  { key: "CLOSURE_REPORT_FILED", label: "Closure Filed" },
  { key: "UNTRACED", label: "Untraced" },
  { key: "CANCELLED", label: "Cancelled" },
];

const ALL_FIR_STATUS_KEYS = FIR_STATUS_OPTIONS.map((o) => o.key);

function FIRRegisterPageContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();

  const [firs, setFirs] = useState<FIRItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Date Range Search Filter (From - To)
  const [dateFrom, setDateFrom] = useState<string>(
    () => searchParams.get("dateFrom") || searchParams.get("from") || ""
  );
  const [dateTo, setDateTo] = useState<string>(
    () => searchParams.get("dateTo") || searchParams.get("to") || ""
  );

  // Status Filter with Dropdown and Checkboxes
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(ALL_FIR_STATUS_KEYS);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
  const [showAdvanceFilters, setShowAdvanceFilters] = useState(false);

  const [statusCounts, setStatusCounts] = useState({
    all: 0,
    underInvestigation: 0,
    chargesheetFiled: 0,
    closureFiled: 0,
    untracedCancelled: 0,
    pendingReview: 0,
  });

  const isAllSelected = selectedStatuses.length === ALL_FIR_STATUS_KEYS.length;

  const isSho = currentUser.role === "SHO" || currentUser.id === "usr_sho_1";
  const isSuperior =
    currentUser.role === "DSP_SUBDIV" ||
    currentUser.role === "SP_DISTRICT" ||
    currentUser.role === "SUPER_ADMIN";
  const isMhc = isMhcOrMmRole(currentUser.role);
  const isIo = currentUser.role === "ENQUIRY_OFFICER" || (!isSho && !isMhc && !isSuperior);

  // Column visibility
  const [columnDropdownOpen, setColumnDropdownOpen] = useState(false);
  const columnDropdownRef = useRef<HTMLDivElement | null>(null);
  // Custom columns from Table Manager
  const [customCols, setCustomCols] = useState<ManagedColumn[]>(() => {
    return TableManagerService.getCustomColumns("fir");
  });

  useEffect(() => {
    const handleUpdate = () => {
      setCustomCols(TableManagerService.getCustomColumns("fir"));
    };
    window.addEventListener("cms_table_columns_changed", handleUpdate);
    return () => window.removeEventListener("cms_table_columns_changed", handleUpdate);
  }, []);

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    firNumber: true,
    policeStation: true,
    dateTime: true,
    complainant: true,
    actsPlace: true,
    status: true,
    assignedIo: true,
    daysPending: true,
    action: true,
  });

  // Column Reordering (Grab & Drag)
  type FIRColKey = string;
  const DEFAULT_FIR_COLUMN_ORDER: FIRColKey[] = [
    "firNumber",
    "policeStation",
    "dateTime",
    "complainant",
    "actsPlace",
    "status",
    "assignedIo",
    "daysPending",
  ];

  const FIR_COL_TO_SORT_FIELD: Record<string, FIRSortField> = {
    firNumber: "firNumber",
    policeStation: "policeStation",
    dateTime: "firDate",
    complainant: "complainantName",
    actsPlace: "actsAndSections",
    status: "status",
    assignedIo: "assignedIoName",
    daysPending: "daysPending",
  };

  const FIR_COL_LABELS: Record<string, string> = {
    firNumber: "FIR No. & Reference",
    policeStation: "Police Station",
    dateTime: "Date & Time",
    complainant: "Complainant / Informant",
    actsPlace: "Acts, Sections & Place",
    status: "Status",
    assignedIo: "Investigating Officer (IO)",
    daysPending: "Days",
  };

  const getColLabel = (colKey: string) => {
    if (FIR_COL_LABELS[colKey]) return FIR_COL_LABELS[colKey];
    const found = customCols.find((c) => c.key === colKey);
    return found ? found.label : colKey;
  };

  const [columnOrder, setColumnOrder] = useState<FIRColKey[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("cms_fir_column_order");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length >= DEFAULT_FIR_COLUMN_ORDER.length) {
            return parsed;
          }
        }
      } catch {}
    }
    return DEFAULT_FIR_COLUMN_ORDER;
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
            localStorage.setItem("cms_fir_column_order", JSON.stringify(next));
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

  const [draggedCol, setDraggedCol] = useState<FIRColKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<FIRColKey | null>(null);

  const handleColumnDrop = (targetCol: FIRColKey) => {
    if (!draggedCol || draggedCol === targetCol) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const srcIdx = next.indexOf(draggedCol);
      const tgtIdx = next.indexOf(targetCol);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, draggedCol);
      try {
        localStorage.setItem("cms_fir_column_order", JSON.stringify(next));
      } catch {}
      return next;
    });
    setDraggedCol(null);
    setDragOverCol(null);
  };

  const resetColumnOrder = () => {
    const fullOrder = [
      ...DEFAULT_FIR_COLUMN_ORDER,
      ...customCols.filter((c) => c.isActive).map((c) => c.key),
    ];
    setColumnOrder(fullOrder);
    try {
      localStorage.removeItem("cms_fir_column_order");
    } catch {}
  };

  // Column-specific search states (click column name to search, click arrow to sort)
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [activeSearchCol, setActiveSearchCol] = useState<string | null>(null);

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetColumns = () => {
    const base: Record<string, boolean> = {
      firNumber: true,
      dateTime: true,
      complainant: true,
      actsPlace: true,
      status: true,
      assignedIo: true,
      daysPending: true,
      action: true,
    };
    customCols.forEach((c) => {
      base[c.key] = c.isActive;
    });
    setVisibleColumns(base);
    resetColumnOrder();
  };

  // Master Filter Tabs
  const [masterFilterTab, setMasterFilterTab] = useState<string>("ALL");

  const handleMasterTabChange = (tab: string) => {
    setMasterFilterTab(tab);
    if (tab === "ALL") {
      setSelectedStatuses(ALL_FIR_STATUS_KEYS);
    } else if (tab === "UNDER_INVESTIGATION") {
      setSelectedStatuses(["UNDER_INVESTIGATION"]);
    } else if (tab === "PENDING_REVIEW") {
      setSelectedStatuses(["PENDING_SUPERVISORY_REVIEW"]);
    } else if (tab === "CHARGESHEET") {
      setSelectedStatuses(["CHARGESHEET_FILED"]);
    } else if (tab === "CLOSURE") {
      setSelectedStatuses(["CLOSURE_REPORT_FILED"]);
    } else if (tab === "UNTRACED_CANCELLED") {
      setSelectedStatuses(["UNTRACED", "CANCELLED"]);
    }
  };

  useEffect(() => {
    if (selectedStatuses.length === ALL_FIR_STATUS_KEYS.length) {
      setMasterFilterTab("ALL");
    } else if (selectedStatuses.length === 1 && selectedStatuses[0] === "UNDER_INVESTIGATION") {
      setMasterFilterTab("UNDER_INVESTIGATION");
    } else if (selectedStatuses.length === 1 && selectedStatuses[0] === "PENDING_SUPERVISORY_REVIEW") {
      setMasterFilterTab("PENDING_REVIEW");
    } else if (selectedStatuses.length === 1 && selectedStatuses[0] === "CHARGESHEET_FILED") {
      setMasterFilterTab("CHARGESHEET");
    } else if (selectedStatuses.length === 1 && selectedStatuses[0] === "CLOSURE_REPORT_FILED") {
      setMasterFilterTab("CLOSURE");
    } else if (
      selectedStatuses.length === 2 &&
      selectedStatuses.includes("UNTRACED") &&
      selectedStatuses.includes("CANCELLED")
    ) {
      setMasterFilterTab("UNTRACED_CANCELLED");
    }
  }, [selectedStatuses]);

  // Sorting
  const [sortField, setSortField] = useState<FIRSortField>("firDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Receipt Modal
  const [receiptFir, setReceiptFir] = useState<FIRItem | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // IO Assignment Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedFirForAssign, setSelectedFirForAssign] = useState<FIRItem | null>(null);
  const [selectedIoId, setSelectedIoId] = useState("");
  const { officers: ioRoster, loading: ioRosterLoading, error: ioRosterError } = useFirIoRoster(selectedFirForAssign?.policeStation, selectedFirForAssign?.district);
  const [assignmentDirections, setAssignmentDirections] = useState("");
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);

  // Transfer FIR & Link/Duplicate FIR Modals
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isLinkDuplicateModalOpen, setIsLinkDuplicateModalOpen] = useState(false);
  const [selectedFirForAction, setSelectedFirForAction] = useState<string | undefined>(undefined);

  useEscapeKey(isAssignModalOpen, () => setIsAssignModalOpen(false));
  useEscapeKey(statusDropdownOpen, () => setStatusDropdownOpen(false));
  useEscapeKey(columnDropdownOpen, () => setColumnDropdownOpen(false));
  useEscapeKey(Boolean(activeSearchCol), () => setActiveSearchCol(null));

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(event.target as Node)) {
        setColumnDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch FIRs
  const fetchFirs = () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = firService.getAllFirs();
      setFirs(data);

      // Section 1 & 2 Specification: FIR Register is Part A.
      // Displays exclusively cases whose authoritative trackingState is PART_A_FRESH.
      // Cases moved to Part B (Partial, Under checking, Reopen) or Complete cases are excluded from Part A.
      const partAFirs = data.filter((f) => (f.trackingState || getAuthoritativeTrackingState(f)) === "PART_A_FRESH");
      const relevantData = partAFirs.filter((f) => isFirVisibleToUser(currentUser, f));

      const underInvestigation = relevantData.filter((f) => f.status === "UNDER_INVESTIGATION").length;
      const chargesheetFiled = relevantData.filter((f) => f.status === "CHARGESHEET_FILED").length;
      const closureFiled = relevantData.filter((f) => f.status === "CLOSURE_REPORT_FILED").length;
      const untracedCancelled = relevantData.filter((f) => f.status === "UNTRACED" || f.status === "CANCELLED").length;
      const pendingReview = relevantData.filter((f) => f.status === "PENDING_SUPERVISORY_REVIEW").length;

      setStatusCounts({
        all: relevantData.length,
        underInvestigation,
        chargesheetFiled,
        closureFiled,
        untracedCancelled,
        pendingReview,
      });
    } catch (err) {
      console.error("Failed to load FIRs:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to load FIR records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFirs();
    const unsubscribe = firService.subscribe(() => {
      fetchFirs();
    });
    return unsubscribe;
  }, []);

  // Close column search input on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-column-search-box]")) {
        setActiveSearchCol(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered FIRs
  const filteredFirs = useMemo(() => {
    return firs.filter((fir) => {
      // Status Check
      if (!selectedStatuses.includes(fir.status)) {
        return false;
      }

      // Active tracking state: FIR Register / Part A displays only PART_A_FRESH
      const trackState = fir.trackingState || getAuthoritativeTrackingState(fir);
      if (trackState !== "PART_A_FRESH") {
        return false;
      }

      // Role and Police Station Visibility Check:
      // SHO & MHC see all FIRs of their police station.
      // Superior Officers (SP, DSP, ASP) see all FIRs across the district.
      // IO sees only FIRs assigned to them.
      if (!isFirVisibleToUser(currentUser, fir)) {
        return false;
      }

      // Search Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesNo = fir.firNumber.toLowerCase().includes(query);
        const matchesCctns = fir.cctnsFirNumber?.toLowerCase().includes(query) ?? false;
        const matchesComplaint = fir.sourceComplaintNumber?.toLowerCase().includes(query) ?? false;
        const matchesComplainant = fir.complainantName.toLowerCase().includes(query);
        const matchesPhone = fir.complainantMobile?.includes(query) ?? false;
        const matchesActs = fir.actsAndSections.toLowerCase().includes(query);
        const matchesPlace = fir.incidentPlace.toLowerCase().includes(query);
        const matchesIoName = fir.assignedIoName?.toLowerCase().includes(query) ?? false;
        const matchesAccused = fir.accusedList?.some((acc) => acc.name.toLowerCase().includes(query)) ?? false;

        if (
          !matchesNo &&
          !matchesCctns &&
          !matchesComplaint &&
          !matchesComplainant &&
          !matchesPhone &&
          !matchesActs &&
          !matchesPlace &&
          !matchesIoName &&
          !matchesAccused
        ) {
          return false;
        }
      }

      // Column-specific search filters
      for (const [col, term] of Object.entries(columnSearch)) {
        if (!term || !term.trim()) continue;
        const q = term.toLowerCase().trim();
        if (col === "firNumber") {
          const match =
            fir.firNumber.toLowerCase().includes(q) ||
            (fir.cctnsFirNumber?.toLowerCase().includes(q) ?? false) ||
            (fir.sourceComplaintNumber?.toLowerCase().includes(q) ?? false);
          if (!match) return false;
        } else if (col === "firDate") {
          const formatted = formatDate(fir.firDate);
          const match =
            fir.firDate.includes(q) ||
            formatted.includes(q) ||
            (fir.firTime?.includes(q) ?? false);
          if (!match) return false;
        } else if (col === "policeStation") {
          const match =
            fir.policeStation?.toLowerCase().includes(q) ||
            (fir.district?.toLowerCase().includes(q) ?? false);
          if (!match) return false;
        } else if (col === "complainantName") {
          const match =
            fir.complainantName.toLowerCase().includes(q) ||
            (fir.complainantMobile?.includes(q) ?? false);
          if (!match) return false;
        } else if (col === "actsAndSections") {
          const match =
            fir.actsAndSections.toLowerCase().includes(q) ||
            (fir.incidentPlace?.toLowerCase().includes(q) ?? false);
          if (!match) return false;
        } else if (col === "status") {
          const match =
            fir.status.toLowerCase().includes(q) ||
            (fir.mainStatus?.toLowerCase().includes(q) ?? false);
          if (!match) return false;
        } else if (col === "assignedIoName") {
          const match = fir.assignedIoName?.toLowerCase().includes(q) ?? false;
          if (!match) return false;
        } else if (col === "daysPending") {
          const match = String(fir.daysPending || 0).includes(q);
          if (!match) return false;
        }
      }

      // Date Range Filter (From - To)
      if (dateFrom || dateTo) {
        const firDateStr = (fir.firDate || fir.incidentDateFrom || "").slice(0, 10);
        if (dateFrom && firDateStr && firDateStr < dateFrom) {
          return false;
        }
        if (dateTo && firDateStr && firDateStr > dateTo) {
          return false;
        }
      }

      return true;
    });
  }, [firs, selectedStatuses, searchQuery, dateFrom, dateTo, columnSearch, isIo, isSho, isSuperior, isMhc, currentUser]);

  // Sorted FIRs
  const sortedFirs = useMemo(() => {
    return [...filteredFirs].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === "daysPending") {
        aVal = a.daysPending || 0;
        bVal = b.daysPending || 0;
      }

      if (aVal === undefined || aVal === null) aVal = "";
      if (bVal === undefined || bVal === null) bVal = "";

      if (typeof aVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [filteredFirs, sortField, sortDirection]);

  const handleSort = (field: FIRSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderColumnHeader = (colKey: FIRColKey) => {
    const field = (FIR_COL_TO_SORT_FIELD[colKey] || colKey) as any;
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
              title={t("कॉलम पकड़कर इधर-उधर खींचें (Grab & drag to reorder position)", "Drag the column header to reorder it")}
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
              title={t("कॉलम में खोजने हेतु क्लिक करें (Click to Search Column)", "Search this column")}
              className="flex items-center gap-1 font-bold text-slate-700 hover:text-blue-700 transition-colors text-left uppercase text-[11px] tracking-wider group cursor-pointer truncate"
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
            title={t(`${t(label)} के अनुसार क्रम लगाएँ`, `Sort by ${label}`)}
            className={`p-1 rounded hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0 ${
              isSorted ? "text-blue-700 bg-blue-50" : "text-slate-400 hover:text-slate-700"
            }`}
          >
            {isSorted ? (
              sortDirection === "asc" ? (
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
            className="pt-1 animate-in fade-in-50"
          >
            <div className="relative">
              <input
                type="text"
                autoFocus
                value={filterValue}
                onChange={(e) =>
                  setColumnSearch((prev) => ({ ...prev, [field]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Escape" || e.key === "Enter") {
                    setActiveSearchCol(null);
                  }
                }}
                placeholder={t(`${t(label)} खोजें…`, `Search ${label}…`)}
                className="w-full text-[11px] px-2 py-1 bg-white border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-600 font-normal pr-5 text-slate-800 shadow-2xs normal-case"
              />
              {filterValue && (
                <button
                  type="button"
                  onClick={() =>
                    setColumnSearch((prev) => {
                      const next = { ...prev };
                      delete next[field];
                      return next;
                    })
                  }
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        ) : filterValue ? (
          <div className="flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-mono border border-blue-200">
            <span className="truncate max-w-[90px] normal-case">&ldquo;{filterValue}&rdquo;</span>
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
              className="text-slate-400 hover:text-red-600 ml-auto"
            >
              &times;
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderFirCell = (colKey: FIRColKey, fir: FIRItem) => {
    switch (colKey) {
      case "firNumber":
        return (
          <td key="firNumber" className="py-2.5 px-2.5 align-top">
            <div className="space-y-1">
              <Link
                href={`/fir/${fir.id}`}
                className="font-mono font-bold text-red-700 hover:text-red-900 hover:underline flex items-center gap-1 text-xs"
              >
                <span>{fir.firNumber}</span>
              </Link>

              <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded">
                  {fir.cctnsFirNumber || "LOCAL"}
                </span>
                {fir.cctnsSyncStatus === "SYNCED" && (
                  <span className="text-emerald-600 font-bold" title="CCTNS Synced">
                    ✓
                  </span>
                )}
              </div>

              {fir.sourceComplaintNumber && (
                <div className="pt-0.5">
                  <Link
                    href={`/complaints/${fir.sourceComplaintId || ""}`}
                    className="inline-flex items-center gap-1 text-[10px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100"
                    title="View Linked Complaint"
                  >
                    <span>Comp: {fir.sourceComplaintNumber}</span>
                  </Link>
                </div>
              )}

              {fir.isTransferred && (
                <div className="pt-0.5">
                  <span
                    className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300"
                    title={`Transferred to ${fir.transferredToPoliceStation || ""}, ${fir.transferredToDistrict || ""}, ${fir.transferredToState || ""}`}
                  >
                    <ArrowRightLeft className="w-2.5 h-2.5 text-amber-600" />
                    <span>Transferred ({fir.transferredToState || "Inter-State"})</span>
                  </span>
                </div>
              )}

              {fir.isDuplicate && (
                <div className="pt-0.5">
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-purple-800 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-300">
                    <Copy className="w-2.5 h-2.5 text-purple-600" />
                    <span>Duplicate FIR</span>
                  </span>
                </div>
              )}

              {fir.isCrossFir && (
                <div className="pt-0.5">
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-800 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-300">
                    <span>Cross-FIR</span>
                  </span>
                </div>
              )}

              {!fir.isDuplicate && !fir.isCrossFir && (fir.linkedFirsList?.length ?? 0) > 0 && (
                <div className="pt-0.5">
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-300">
                    <Link2 className="w-2.5 h-2.5 text-blue-600" />
                    <span>Linked ({fir.linkedFirsList?.length})</span>
                  </span>
                </div>
              )}
            </div>
          </td>
        );

      case "policeStation":
        return (
          <td key="policeStation" className="py-2.5 px-2.5 align-top">
            <div className="text-xs font-semibold text-slate-800 leading-tight">
              {fir.policeStation || "—"}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {fir.district || ""}
              {fir.state ? `, ${fir.state}` : ""}
            </div>
          </td>
        );

      case "dateTime":
        return (
          <td key="dateTime" className="py-2.5 px-2.5 align-top whitespace-nowrap">
            <div className="text-slate-800 font-semibold">{formatDate(fir.firDate)}</div>
            <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{fir.firTime || "10:00"} hrs</span>
            </div>
          </td>
        );

      case "complainant":
        return (
          <td key="complainant" className="py-2.5 px-2.5 align-top max-w-[165px]">
            <div className="font-bold text-slate-900">{fir.complainantName}</div>
            {fir.complainantFatherSpouse && (
              <div className="text-[10px] text-slate-500">
                {/* CMP-05 fix: the stored value already carries its own marker
                    ("W/o …" / "Sh. …") — printing a hardcoded S/o before it
                    produced "S/o W/o …" for female complainants. */}
                {fir.complainantFatherSpouse}
              </div>
            )}
            <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3 text-slate-400" />
              <span>{fir.complainantMobile || "—"}</span>
            </div>
          </td>
        );

      case "actsPlace":
        return (
          <td key="actsPlace" className="py-2.5 px-2.5 align-top max-w-[210px]">
            <div className="font-bold text-slate-800 text-xs">
              <LawSectionTooltip sectionText={fir.actsAndSections} />
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-1 truncate">
              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{fir.incidentPlace}</span>
            </div>
          </td>
        );

      case "status":
        return (
          <td key="status" className="py-2.5 px-2 align-top whitespace-nowrap">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
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
          </td>
        );

      case "assignedIo":
        return (
          <td key="assignedIo" className="py-2.5 px-2.5 align-top max-w-[160px]">
            {fir.assignedIoName ? (
              <div>
                <div className="font-bold text-slate-800 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>{fir.assignedIoName}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {fir.assignedIoRank || "IO"} {fir.assignedIoBeltNumber ? `(${fir.assignedIoBeltNumber})` : ""}
                </div>
              </div>
            ) : (
              <span className="inline-block text-[11px] text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Not Assigned
              </span>
            )}
          </td>
        );

      case "daysPending":
        return (
          <td key="daysPending" className="py-3 px-2 align-top text-center">
            <span className="font-mono font-bold text-slate-700">
              {fir.daysPending || 0}d
            </span>
          </td>
        );

      default: {
        const customDef = customCols.find((c) => c.key === colKey);
        return (
          <td key={colKey} className="py-3 px-3.5 align-top text-xs text-slate-700">
            <span className="font-mono text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
              {customDef?.defaultValue || "—"}
            </span>
          </td>
        );
      }
    }
  };

  const handleOpenAssign = (fir: FIRItem) => {
    setSelectedFirForAssign(fir);
    setSelectedIoId(fir.assignedIoId || "");
    setAssignmentDirections(fir.assignedDirections || "");
    setIsAssignModalOpen(true);
  };

  const handleConfirmAssign = async () => {
    if (!isSho) {
      alert("Access Denied: Investigating Officer must be assigned by SHO only (PPR Rule 22.48).");
      return;
    }
    if (!selectedFirForAssign || !selectedIoId) return;
    const selectedOfficer = ioRoster.find((eo) => eo.id === selectedIoId);
    if (!selectedOfficer) return;

    setAssignmentSubmitting(true);
    try {
      await firService.assignIo(
        selectedFirForAssign.id,
        selectedOfficer.id,
        selectedOfficer.name,
        selectedOfficer.rank,
        assignmentDirections,
        currentUser.name,
        selectedOfficer
      );
      setIsAssignModalOpen(false);
      setSelectedFirForAssign(null);
    } catch (err) {
      console.error("Failed to assign IO:", err);
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in-50">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-700">
              <Scale className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-[#0b192c] tracking-tight">
                FIR Register
              </h1>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAdvanceFilters((prev) => !prev)}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all border ${
                  showAdvanceFilters
                    ? "bg-slate-100 border-slate-400 text-slate-800 shadow-inner"
                    : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs"
                }`}
                title="Toggle Advance Filters"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
                <span>Advance Filters</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                    showAdvanceFilters ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </div>
          </div>
        </div>

        {/* Top Right Actions: Transfer FIR & Link / Duplicate FIR */}
        <div className="flex flex-wrap items-center gap-2.5">
          {canRegisterFir(currentUser.role) && <Link href="/fir/register" className="cms-register-fir-action inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-bold"><PlusCircle className="w-3.5 h-3.5" />Register FIR</Link>}
          <Button
            type="button"
            onClick={() => {
              setSelectedFirForAction(undefined);
              setIsTransferModalOpen(true);
            }}
            className="bg-[#0b192c] hover:bg-slate-800 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer border border-slate-700"
            title="Transfer FIR to another Police Station / District / State under BNSS"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
            <span>Transfer FIR</span>
          </Button>

          <Button
            type="button"
            onClick={() => {
              setSelectedFirForAction(undefined);
              setIsLinkDuplicateModalOpen(true);
            }}
            className="bg-[#0b192c] hover:bg-slate-800 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer border border-slate-700"
            title="Link two FIRs (Duplicate / Cross-FIR / Connected)"
          >
            <Link2 className="w-3.5 h-3.5 text-purple-400" />
            <span>Link / Duplicate FIR</span>
          </Button>
        </div>
      </div>

      {/* Search & Table Filter Controls (Toggleable via Advance Filters) */}
      {showAdvanceFilters && (
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 animate-in fade-in-50 duration-200">
          {/* Left: Search Bar & Date Range Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
            {/* Search Bar */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search FIR No., Complainant, Accused, Section, Place, IO..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Clear Search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Date Range Search: From - To */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">From:</span>
                <div className="w-[128px]">
                  <DatePickerDDMMYYYY
                    size="sm"
                    value={dateFrom}
                    max={dateTo || getTodayIsoIST()}
                    onValueChange={(val) => setDateFrom(val)}
                    title="Date From (DD/MM/YYYY)"
                    className="bg-white border-slate-200 shadow-2xs hover:border-slate-300"
                  />
                </div>
              </div>

              <span className="text-slate-300 font-light">|</span>

              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">To:</span>
                <div className="w-[128px]">
                  <DatePickerDDMMYYYY
                    size="sm"
                    value={dateTo}
                    min={dateFrom || undefined}
                    max={getTodayIsoIST()}
                    onValueChange={(val) => setDateTo(val)}
                    title="Date To (DD/MM/YYYY)"
                    className="bg-white border-slate-200 shadow-2xs hover:border-slate-300"
                  />
                </div>
              </div>

              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                  title={t("Clear Date Filter (दिनांक फ़िल्टर हटाएं)", "Clear date filter")}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded-md transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right Tools: Master FIR Category Dropdown, Status Dropdown, Columns Dropdown, Refresh */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Master Stage / Category Filter Dropdown */}
            <div className="relative">
              <div className="relative flex items-center">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
                <select
                  value={masterFilterTab}
                  onChange={(e) => handleMasterTabChange(e.target.value)}
                  className="pl-8 pr-7 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:outline-hidden transition-colors shadow-2xs cursor-pointer appearance-none"
                  title="Filter by Stage / Category"
                >
                  <option value="ALL">All FIRs ({statusCounts.all})</option>
                  <option value="UNDER_INVESTIGATION">Under Investigation ({statusCounts.underInvestigation})</option>
                  <option value="CHARGESHEET">Chargesheet Filed ({statusCounts.chargesheetFiled})</option>
                  <option value="CLOSURE">Closure Filed ({statusCounts.closureFiled})</option>
                  <option value="UNTRACED_CANCELLED">Untraced / Cancelled ({statusCounts.untracedCancelled})</option>
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
              </div>
            </div>

            {/* Status Multi-select */}
            <div className="relative" ref={statusDropdownRef}>
              <button
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <span>Status Filter</span>
                <span className="w-5 h-5 rounded-full bg-slate-100 text-[10px] flex items-center justify-center font-bold">
                  {selectedStatuses.length}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {statusDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2 text-xs animate-in fade-in-50">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 px-1">
                    <span className="font-bold text-slate-800">Filter by Status</span>
                    <button
                      onClick={() =>
                        setSelectedStatuses(
                          isAllSelected ? [] : ALL_FIR_STATUS_KEYS
                        )
                      }
                      className="text-[11px] text-red-600 hover:underline font-medium"
                    >
                      {isAllSelected ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                  <div className="space-y-1 py-1 max-h-56 overflow-y-auto">
                    {FIR_STATUS_OPTIONS.map((opt) => {
                      const isChecked = selectedStatuses.includes(opt.key);
                      return (
                        <label
                          key={opt.key}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-slate-700 select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedStatuses(selectedStatuses.filter((k) => k !== opt.key));
                              } else {
                                setSelectedStatuses([...selectedStatuses, opt.key]);
                              }
                            }}
                            className="w-3.5 h-3.5 rounded text-red-600 focus:ring-red-500 border-slate-300"
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Columns Selector */}
            <div className="relative" ref={columnDropdownRef}>
              <button
                onClick={() => setColumnDropdownOpen(!columnDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
                title="Configure Table Columns"
              >
                <Columns3 className="w-3.5 h-3.5 text-slate-500" />
                <span>Columns</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {columnDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2 text-xs animate-in fade-in-50">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 px-1">
                    <span className="font-bold text-slate-800">Toggle Columns</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={resetColumnOrder}
                        className="text-[11px] text-slate-600 hover:text-slate-900 hover:underline font-medium cursor-pointer"
                        title={t("कॉलम क्रम रीसेट करें", "Reset column order")}
                      >
                        Reset Order
                      </button>
                      <button
                        onClick={resetColumns}
                        className="text-[11px] text-red-600 hover:underline font-medium cursor-pointer"
                      >
                        Reset All
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 py-1">
                    {Object.entries({
                      firNumber: "FIR Number",
                      dateTime: "Date & Time",
                      complainant: "Complainant",
                      actsPlace: "Acts & Occurrence",
                      status: "Status",
                      assignedIo: "Investigating Officer",
                      daysPending: "Days in Progress",
                      action: "Actions",
                    }).map(([key, label]) => {
                      const isChecked = visibleColumns[key as keyof typeof visibleColumns];
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 cursor-pointer text-slate-700 select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleColumn(key as keyof typeof visibleColumns)}
                            className="w-3.5 h-3.5 rounded text-red-600 focus:ring-red-500 border-slate-300"
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}

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
                  <div className="pt-2 border-t border-slate-100 space-y-1 px-1">
                    <div className="text-[10px] text-slate-500">
                      💡 <em>{t("कॉलम का क्रम बदलने के लिए उसका शीर्षक खींचें।", "Drag column headers to reorder them.")}</em>
                    </div>
                    <Link
                      href="/settings?tab=table-manager"
                      className="flex items-center justify-between text-[11px] font-bold text-indigo-600 hover:text-indigo-800 pt-1"
                    >
                      <span>{t("+ कॉलम जोड़ें या प्रबंधित करें", "+ Add/Manage Columns")}</span>
                      <span>&rarr;</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchFirs}
              className="border-slate-200 text-slate-700 shadow-2xs"
              title="Refresh FIR Register"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      )}

      {/* Main FIR Table */}
      <Card className="border-slate-200 shadow-xs overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className={`w-full text-left border-collapse text-xs ${customCols.filter((c) => c.isActive).length === 0 ? "lg:table-fixed" : ""}`}>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                {columnOrder.map((col) => {
                  if (!visibleColumns[col]) return null;
                  const isDragging = draggedCol === col;
                  const isOver = dragOverCol === col;
                  const widthClass =
                    customCols.filter((c) => c.isActive).length === 0
                      ? col === "firNumber"
                        ? "lg:w-[12%]"
                        : col === "policeStation"
                        ? "lg:w-[12%]"
                        : col === "dateTime"
                        ? "lg:w-[10%]"
                        : col === "complainant"
                        ? "lg:w-[13%]"
                        : col === "actsPlace"
                        ? "lg:w-[17%]"
                        : col === "status"
                        ? "lg:w-[11%]"
                        : col === "assignedIo"
                        ? "lg:w-[11%]"
                        : col === "daysPending"
                        ? "lg:w-[6%]"
                        : ""
                      : "";

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
                      className={`py-2.5 px-2 transition-all select-none cursor-grab active:cursor-grabbing ${widthClass} ${
                        col === "daysPending" ? "text-center" : ""
                      } ${
                        isDragging ? "opacity-30 bg-slate-200" : ""
                      } ${
                        isOver ? "border-l-4 border-l-blue-600 bg-blue-50/80 shadow-inner" : ""
                      }`}
                    >
                      {renderColumnHeader(col)}
                    </th>
                  );
                })}

                {visibleColumns.action && (
                  <th className="py-2.5 px-2 text-right align-top pt-3 lg:w-[8%]">Actions</th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <LoadingSkeleton count={3} />
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="inline-flex flex-col items-center gap-2 p-6 bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl">
                      <AlertCircle className="w-6 h-6 text-red-600" />
                      <p className="text-xs font-semibold text-red-800 dark:text-red-300">{loadError}</p>
                      <Button size="sm" variant="outline" onClick={fetchFirs} className="text-xs">
                        Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : sortedFirs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <EmptyState
                      title={isIo ? `No FIRs Assigned to ${currentUser.name}` : "No FIRs Found"}
                      description={
                        searchQuery || dateFrom || dateTo || Object.values(columnSearch).some((term) => term.trim())
                          ? "No FIR records matched your search terms or date filter."
                          : isIo
                          ? "You currently have no First Information Reports assigned for investigation."
                          : "No First Information Reports in the selected category."
                      }
                    />
                  </td>
                </tr>
              ) : (
                sortedFirs.map((fir) => {
                  return (
                    <tr
                      key={fir.id}
                      onClick={(e) => {
                        const target = e.target as HTMLElement | null;
                        if (target?.closest("a, button, input, select, textarea, [role='button']")) {
                          return;
                        }
                        router.push(`/fir/${fir.id}`);
                      }}
                      className="fir-register-row hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    >
                      {columnOrder.map((col) => {
                        if (!visibleColumns[col]) return null;
                        return renderFirCell(col, fir);
                      })}

                      {/* Actions */}
                      {visibleColumns.action && (
                        <td
                          className="py-2.5 px-2 align-top text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {/* View Profile */}
                            <Link href={`/fir/${fir.id}`}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px] border-slate-200 text-slate-700 hover:text-red-700"
                                title="Open Complete FIR Dossier"
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                View
                              </Button>
                            </Link>

                            {/* Print / Statutory Copy */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReceiptFir(fir);
                                setIsReceiptOpen(true);
                              }}
                              className="h-7 w-7 p-0 border-slate-200 text-slate-600 hover:text-blue-600"
                              title="Print Statutory FIR Copy"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>

                            {/* Assign / Change IO (SHO only) */}
                            {isSho && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenAssign(fir)}
                                className="h-7 w-7 p-0 border-slate-200 text-slate-600 hover:text-amber-700 cursor-pointer"
                                title={fir.assignedIoId ? "Change IO" : "Assign IO"}
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Statutory Receipt Print Modal */}
      {isReceiptOpen && receiptFir && (
        <FIRReceiptModal
          fir={receiptFir}
          isOpen={isReceiptOpen}
          onClose={() => {
            setIsReceiptOpen(false);
            setReceiptFir(null);
          }}
        />
      )}

      {/* Assign IO Modal */}
      {isAssignModalOpen && selectedFirForAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-50">
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="p-4 bg-[#0b192c] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">
                  {selectedFirForAssign?.assignedIoId ? "Change Investigating Officer (IO)" : "Assign Investigating Officer (IO)"}
                </h3>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="text-white hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-500">
                  FIR Number
                </label>
                <p className="font-mono font-bold text-red-900 text-sm">
                  {selectedFirForAssign.firNumber}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {selectedFirForAssign.actsAndSections}
                </p>
              </div>

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
                  {selectedFirForAssign.assignedIoId && !ioRoster.some(officer => officer.id === selectedFirForAssign.assignedIoId) && <option value={selectedFirForAssign.assignedIoId} disabled>Current IO: {selectedFirForAssign.assignedIoName || selectedFirForAssign.assignedIoId}</option>}
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
                  value={assignmentDirections}
                  onChange={(e) => setAssignmentDirections(e.target.value)}
                  placeholder="E.g. Visit spot immediately, examine CCTV footage, record statements under BNSS 180, and file Zimni within 24 hours."
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
                  {assignmentSubmitting ? "Saving..." : (selectedFirForAssign?.assignedIoId ? "Confirm Change IO" : "Confirm IO Assignment")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer FIR Modal (Inter-State Only) */}
      <TransferFIRModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        firs={firs}
        onSuccess={() => {
          fetchFirs();
        }}
        preSelectedFirId={selectedFirForAction}
      />

      {/* Link / Duplicate FIR Modal */}
      <LinkDuplicateFIRModal
        isOpen={isLinkDuplicateModalOpen}
        onClose={() => setIsLinkDuplicateModalOpen(false)}
        firs={firs}
        onSuccess={() => {
          fetchFirs();
        }}
        preSelectedFirId={selectedFirForAction}
      />
    </div>
  );
}

export default function FIRRegisterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading FIR Register...</div>}>
      <FIRRegisterPageContent />
    </Suspense>
  );
}
