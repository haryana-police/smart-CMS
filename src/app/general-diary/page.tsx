"use client";

import { useLanguage } from "@/context/LanguageContext";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { getTodayIsoIST, getDateDaysAgoIsoIST } from "@/lib/utils";
import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useGuardedRouter as useRouter } from "@/hooks/useGuardedRouter";
import {
  BookOpen,
  Search,
  Eye,
  FileText,
  Printer,
  PlusCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  User,
  Filter,
  RotateCcw,
  ShieldAlert,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Trash2,
  X,
  Copy,
  Check,
  Paperclip,
  FileDown,
  Image as ImageIcon,
  Loader2,
  ChevronDown,
  Pencil,
  Clock,
} from "lucide-react";
import { VoiceInputButton } from "@/components/ui/voice-input-button";
import { useAuth } from "@/context/AuthContext";
import { GeneralDiaryService, cleanGdNarrative } from "@/services/generalDiaryService";
import {
  GeneralDiaryRecord,
  GDSearchFilter,
  GDPaginatedResponse,
  GDEntryTypeConfig,
  GDStatus,
  GDUploadedDocument,
} from "@/types/generalDiary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingSkeleton } from "@/components/ui/state-views";
import { GDRecordModal } from "@/components/general-diary/GDRecordModal";
import { GDVerificationModal } from "@/components/general-diary/GDVerificationModal";
import { TableManagerService, ManagedColumn } from "@/services/tableManagerService";
import { GDPrintModal } from "@/components/general-diary/GDPrintModal";
import { DatePickerDDMMYYYY } from "@/components/ui/date-picker-ddmmyyyy";
import { toDDMMYYYY, parseGDActivityDateTimeToMs, getGdRecordRemainingTime, isGdRecordExpired } from "@/lib/gdDateTime";

type ActiveTab = "REGISTER" | "SUGGESTIONS_DRAFTS";

function getGdDisplayNumber(record: GeneralDiaryRecord): string {
  if (!record.isLocked) return "—";
  if (record.sequencePerDay) return String(record.sequencePerDay).padStart(2, "0");

  const sequence = record.gdNumber?.match(/-(\d+)$/)?.[1];
  return sequence ? String(parseInt(sequence, 10)).padStart(2, "0") : (record.gdNumber || "—");
}

function GeneralDiaryContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();
  const printRegisterFromNav = searchParams.get("printRegister") === "1";
  const initialType = searchParams.get("type") || "ALL";
  const initialSearch = searchParams.get("search") || "";
  const tabParam = searchParams.get("tab") as ActiveTab | null;
  const activeTab: ActiveTab = tabParam === "SUGGESTIONS_DRAFTS" ? "SUGGESTIONS_DRAFTS" : "REGISTER";
  const [types, setTypes] = useState<GDEntryTypeConfig[]>([]);
  const [mobileRegisterView, setMobileRegisterView] = useState<"table" | "list">("table");
  const showMobileList = activeTab === "REGISTER" && mobileRegisterView === "list";

  // Reset pagination to page 1 when switching tabs
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      prevTabRef.current = activeTab;
      setPage(1);
    }
  }, [activeTab]);

  // Dates helpers (IST Today & Yesterday)
  const todayISO = useMemo(() => getTodayIsoIST(), []);
  const yesterdayISO = useMemo(() => getDateDaysAgoIsoIST(1), []);

  // Search & Filter State — defaults strictly to TODAY so only current date entries show by default
  const [keyword, setKeyword] = useState(initialSearch);
  const [debouncedKeyword, setDebouncedKeyword] = useState(initialSearch);
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);
  const [officerQuery, setOfficerQuery] = useState("");
  const [debouncedOfficerQuery, setDebouncedOfficerQuery] = useState("");

  useEffect(() => {
    const tType = searchParams.get("type");
    const tSearch = searchParams.get("search");
    if (tType !== null) {
      setTypeFilter(tType || "ALL");
      setPage(1);
    }
    if (tSearch !== null) {
      setKeyword(tSearch);
      setDebouncedKeyword(tSearch);
      setPage(1);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!keyword.trim()) {
      setDebouncedKeyword("");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedKeyword(keyword), 250);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    if (!officerQuery.trim()) {
      setDebouncedOfficerQuery("");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedOfficerQuery(officerQuery), 250);
    return () => window.clearTimeout(timer);
  }, [officerQuery]);

  // Column Sort & Column Search State
  type GDSortField = string;
  type SortOrder = "asc" | "desc";
  const [sortField, setSortField] = useState<GDSortField>("gdNumber");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [activeSearchCol, setActiveSearchCol] = useState<string | null>(null);

  // Custom columns from Table Manager
  const [customCols, setCustomCols] = useState<ManagedColumn[]>(() => {
    return TableManagerService.getCustomColumns("general-diary");
  });

  useEffect(() => {
    const handleUpdate = () => {
      setCustomCols(TableManagerService.getCustomColumns("general-diary"));
    };
    window.addEventListener("cms_table_columns_changed", handleUpdate);
    return () => window.removeEventListener("cms_table_columns_changed", handleUpdate);
  }, []);

  // Column Reordering (Grab & Drag)
  type GDColKey = string;
  const DEFAULT_GD_COLUMN_ORDER: GDColKey[] = [
    "gdNumber",
    "officer",
    "gdType",
    "subject",
    "activityDateTime",
    "narrative",
  ];

  const GD_COLUMN_LABELS: Record<string, string> = {
    gdNumber: "GD No",
    officer: "Entry for officer",
    gdType: "GD Type",
    subject: "Subject",
    activityDateTime: "Date & time",
    narrative: "Brief description",
  };

  const getGDColLabel = (field: string) => {
    if (GD_COLUMN_LABELS[field]) return GD_COLUMN_LABELS[field];
    const custom = customCols.find((c) => c.key === field);
    return custom ? custom.label : field;
  };

  const GD_COLUMN_WIDTHS: Record<string, string> = {
    gdNumber: "w-24 min-w-[85px]",
    officer: "w-48 min-w-[180px]",
    gdType: "w-36 min-w-[140px]",
    subject: "w-56 min-w-[180px] max-w-[220px]",
    activityDateTime: "w-40 min-w-[145px]",
    narrative: "min-w-[260px]",
  };

  const [columnOrder, setColumnOrder] = useState<GDColKey[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("cms_gd_column_order");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length >= DEFAULT_GD_COLUMN_ORDER.length) {
            return parsed;
          }
        }
      } catch {}
    }
    return DEFAULT_GD_COLUMN_ORDER;
  });

  // Keep columnOrder in sync with custom columns
  useEffect(() => {
    if (customCols.length > 0) {
      setColumnOrder((prev) => {
        const activeKeys = customCols.filter((c) => c.isActive).map((c) => c.key);
        const missing = activeKeys.filter((k) => !prev.includes(k));
        if (missing.length > 0) {
          const next = [...prev, ...missing];
          try {
            localStorage.setItem("cms_gd_column_order", JSON.stringify(next));
          } catch {}
          return next;
        }
        return prev;
      });
    }
  }, [customCols]);

  const [draggedCol, setDraggedCol] = useState<GDColKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<GDColKey | null>(null);

  const handleColumnDrop = (targetCol: GDColKey) => {
    if (!draggedCol || draggedCol === targetCol) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const srcIdx = next.indexOf(draggedCol);
      const tgtIdx = next.indexOf(targetCol);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, draggedCol);
      try {
        localStorage.setItem("cms_gd_column_order", JSON.stringify(next));
      } catch {}
      return next;
    });
    setDraggedCol(null);
    setDragOverCol(null);
  };

  const resetColumnOrder = () => {
    const fullOrder = [
      ...DEFAULT_GD_COLUMN_ORDER,
      ...customCols.filter((c) => c.isActive).map((c) => c.key),
    ];
    setColumnOrder(fullOrder);
    try {
      localStorage.removeItem("cms_gd_column_order");
    } catch {}
  };

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [paginatedData, setPaginatedData] = useState<GDPaginatedResponse>({
    records: [],
    total: 0,
    page: 1,
    pageSize: 15,
    totalPages: 1,
    todayCount: 0,
    lockedCount: 0,
    verifiedCount: 0,
    draftCount: 0,
    suggestedCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [persistentRegisterCount, setPersistentRegisterCount] = useState<number | null>(null);
  const [persistentSuggestionsCount, setPersistentSuggestionsCount] = useState<number | null>(null);

  // Modals State
  const [selectedRecord, setSelectedRecord] = useState<GeneralDiaryRecord | null>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [inspectAutoPrint, setInspectAutoPrint] = useState(false);
  const [printDailyRegisterOpen, setPrintDailyRegisterOpen] = useState(false);
  const [selectedPrintDate, setSelectedPrintDate] = useState<string>("");

  // Document Modal State
  const [docModalRecord, setDocModalRecord] = useState<GeneralDiaryRecord | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  useEscapeKey(Boolean(docModalRecord), () => setDocModalRecord(null));

  // Draft/Suggestion row actions state
  const [addingRecordId, setAddingRecordId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState<string | null>(null);

  // Load types config
  useEffect(() => {
    const loadedTypes = GeneralDiaryService.getTypes();
    setTypes(loadedTypes);
  }, []);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch entries (strictly filters by selectedDate for the Register)
  const fetchEntries = async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setFetchError(null);

    const filter: GDSearchFilter = {
      keyword: debouncedKeyword.trim() || undefined,
      typeCode: typeFilter !== "ALL" ? typeFilter : undefined,
      startDate: selectedDate || undefined,
      endDate: selectedDate || undefined,
      officerQuery: debouncedOfficerQuery.trim() || undefined,
      policeStation: (currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'SP_DISTRICT' || currentUser?.role === 'DSP_SUBDIV') ? undefined : (currentUser?.stationName || undefined),
    };

    if (activeTab === "REGISTER") {
      filter.isLocked = true;
    } else if (activeTab === "SUGGESTIONS_DRAFTS") {
      // Tab shows both auto-suggestions and saved drafts
      filter.status = "SUGGESTED,DRAFT";
    }

    try {
      const res = await GeneralDiaryService.getPaginatedEntries(filter, page, pageSize, controller.signal);
      setPaginatedData(res);
      if (activeTab === "REGISTER") {
        setPersistentRegisterCount(res.total);
        if (res.suggestionsCount !== undefined) {
          setPersistentSuggestionsCount(res.suggestionsCount);
        } else if (res.suggestedCount !== undefined || res.draftCount !== undefined) {
          setPersistentSuggestionsCount((res.suggestedCount || 0) + (res.draftCount || 0));
        }
      } else {
        setPersistentSuggestionsCount(res.total);
        if (res.registerCount !== undefined) {
          setPersistentRegisterCount(res.registerCount);
        } else if (res.todayCount !== undefined && persistentRegisterCount === null) {
          setPersistentRegisterCount(res.todayCount);
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      console.error(e);
      setFetchError(e?.message || "Failed to load General Diary entries. Please retry.");
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchEntries();
    return () => abortControllerRef.current?.abort();
  }, [page, pageSize, typeFilter, selectedDate, debouncedKeyword, debouncedOfficerQuery, activeTab, currentUser?.stationName]);

  useEffect(() => {
    const handleGdUpdated = () => {
      fetchEntries();
    };
    window.addEventListener("cms-gd-updated", handleGdUpdated);
    return () => window.removeEventListener("cms-gd-updated", handleGdUpdated);
  }, [page, pageSize, typeFilter, selectedDate, debouncedKeyword, debouncedOfficerQuery, activeTab, currentUser?.stationName]);

  // Brief description dialog modal state (opens popup dialog on click)
  const [briefModalRecord, setBriefModalRecord] = useState<GeneralDiaryRecord | null>(null);
  const [briefModalOpen, setBriefModalOpen] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);

  const openBriefModal = (rec: GeneralDiaryRecord) => {
    setBriefModalRecord(rec);
    setBriefModalOpen(true);
    setBriefCopied(false);
  };

  const closeBriefModal = () => {
    setBriefModalOpen(false);
    setBriefModalRecord(null);
    setBriefCopied(false);
  };

  const copyBriefNarrative = async () => {
    if (!briefModalRecord?.narrative) return;
    try {
      await navigator.clipboard.writeText(cleanGdNarrative(briefModalRecord.narrative));
      setBriefCopied(true);
      setTimeout(() => setBriefCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && briefModalOpen) {
        closeBriefModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [briefModalOpen]);

  // Add a draft/suggestion to the official GD register —
  // the server assigns the next unique GD number and locks it permanently
  const handleAddToGd = async (rec: GeneralDiaryRecord) => {
    setAddingRecordId(rec.id);
    try {
      const locked = await GeneralDiaryService.verifyAndLockEntry(
        rec.id,
        {
          name: currentUser.name || "HC Devinder Kumar",
          rank: currentUser.rankDisplay || "Head Constable (MHC)",
          beltNumber: (currentUser as any).beltNumber || `${currentUser.pno ? currentUser.pno.slice(-3) : '889'}/${currentUser.district ? currentUser.district.slice(0,3).toUpperCase() : 'PNP'}`,
          pno: currentUser.pno || "05192834",
        },
        "Added to General Diary from draft/suggestion"
      );
      setSuccessFlash(`Added to General Diary as ${locked.gdNumber}.`);
      setPaginatedData((prev) => ({
        ...prev,
        records: prev.records.filter((r) => r.id !== rec.id),
        total: Math.max(0, prev.total - 1),
        suggestedCount: rec.status === "SUGGESTED" ? Math.max(0, prev.suggestedCount - 1) : prev.suggestedCount,
        draftCount: rec.status === "DRAFT" ? Math.max(0, prev.draftCount - 1) : prev.draftCount,
        lockedCount: prev.lockedCount + 1,
        todayCount: prev.todayCount + 1,
      }));
      await fetchEntries();
      setTimeout(() => setSuccessFlash(null), 4000);
    } catch (err: any) {
      alert(err?.message || "Failed to add entry to General Diary.");
    } finally {
      setAddingRecordId(null);
    }
  };

  // Delete a draft/suggestion permanently (locked entries are never deletable)
  const handleDeleteDraftRow = async (rec: GeneralDiaryRecord) => {
    if (!window.confirm(`Delete "${rec.subject}"? This action cannot be undone.`)) return;
    setDeletingRecordId(rec.id);
    try {
      await GeneralDiaryService.deleteDraft(rec.id);
      setPaginatedData((prev) => ({
        ...prev,
        records: prev.records.filter((r) => r.id !== rec.id),
        total: Math.max(0, prev.total - 1),
        suggestedCount: rec.status === "SUGGESTED" ? Math.max(0, prev.suggestedCount - 1) : prev.suggestedCount,
        draftCount: rec.status === "DRAFT" ? Math.max(0, prev.draftCount - 1) : prev.draftCount,
      }));
      await fetchEntries();
    } catch (err: any) {
      alert(err?.message || "Failed to delete draft.");
    } finally {
      setDeletingRecordId(null);
    }
  };

  // Delete an uploaded attachment from a GD record
  const handleDeleteAttachment = async (recordId: string, attachmentId: string) => {
    if (!window.confirm("Are you sure you want to delete this uploaded document?")) return;
    setDeletingDocId(attachmentId);
    try {
      const updated = await GeneralDiaryService.deleteAttachment(recordId, attachmentId);
      // Update local modal record
      setDocModalRecord(updated);
      // Update in paginated data list
      setPaginatedData((prev) => ({
        ...prev,
        records: prev.records.map((r) => (r.id === updated.id ? updated : r)),
      }));
    } catch (err: any) {
      alert(err?.message || "Failed to delete attachment.");
    } finally {
      setDeletingDocId(null);
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setKeyword("");
    setTypeFilter("ALL");
    setSelectedDate(todayISO);
    setOfficerQuery("");
    setColumnSearch({});
    setActiveSearchCol(null);
    setPage(1);
  };

  const handleSort = (field: GDSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const hasColumnFilters = useMemo(
    () => Object.values(columnSearch).some((term) => term && term.trim().length > 0),
    [columnSearch]
  );

  const displayedRecords = useMemo(() => {
    let list = paginatedData.records.filter((rec) => rec.isLocked || !isGdRecordExpired(rec));

    // Column-specific search filter
    for (const [col, term] of Object.entries(columnSearch)) {
      if (!term || !term.trim()) continue;
      const q = term.toLowerCase().trim();
      list = list.filter((rec) => {
        if (col === "gdNumber") {
          const seq2Digit = rec.sequencePerDay ? String(rec.sequencePerDay).padStart(2, "0") : "";
          return (
            rec.gdNumber.toLowerCase().includes(q) ||
            String(rec.sequencePerDay || "").includes(q) ||
            seq2Digit.includes(q)
          );
        } else if (col === "officer") {
          return (
            rec.entryForOfficer.name.toLowerCase().includes(q) ||
            rec.entryForOfficer.rank.toLowerCase().includes(q) ||
            rec.entryForOfficer.beltNumber.toLowerCase().includes(q)
          );
        } else if (col === "gdType") {
          return rec.typeDisplay.toLowerCase().includes(q);
        } else if (col === "subject") {
          return rec.subject.toLowerCase().includes(q);
        } else if (col === "activityDateTime") {
          return rec.activityDateTime.toLowerCase().includes(q);
        } else if (col === "narrative") {
          return rec.narrative.toLowerCase().includes(q);
        }
        return true;
      });
    }

    // Sorting
    return list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "gdNumber") {
        const aSeq = a.sequencePerDay || 0;
        const bSeq = b.sequencePerDay || 0;
        if (a.isLocked && b.isLocked) {
          cmp = (a.gdNumber || "").localeCompare(b.gdNumber || "");
        } else if (a.isLocked) {
          cmp = 1;
        } else if (b.isLocked) {
          cmp = -1;
        } else {
          cmp = aSeq - bSeq;
        }
      } else if (sortField === "activityDateTime") {
        const aMs = parseGDActivityDateTimeToMs(a.activityDateTime);
        const bMs = parseGDActivityDateTimeToMs(b.activityDateTime);
        cmp = aMs - bMs;
        if (cmp === 0) {
          cmp = (a.sequencePerDay || 0) - (b.sequencePerDay || 0);
        }
      } else if (sortField === "officer") {
        cmp = (a.entryForOfficer.name || "").toLowerCase().localeCompare((b.entryForOfficer.name || "").toLowerCase());
      } else if (sortField === "gdType") {
        cmp = (a.typeDisplay || "").toLowerCase().localeCompare((b.typeDisplay || "").toLowerCase());
      } else if (sortField === "subject") {
        cmp = (a.subject || "").toLowerCase().localeCompare((b.subject || "").toLowerCase());
      } else if (sortField === "narrative") {
        cmp = (a.narrative || "").toLowerCase().localeCompare((b.narrative || "").toLowerCase());
      } else {
        const aVal = String((a as any)[sortField] || "").toLowerCase();
        const bVal = String((b as any)[sortField] || "").toLowerCase();
        cmp = aVal.localeCompare(bVal);
      }

      if (cmp !== 0) {
        return sortOrder === "asc" ? cmp : -cmp;
      }
      return sortOrder === "asc"
        ? (a.sequencePerDay || 0) - (b.sequencePerDay || 0)
        : (b.sequencePerDay || 0) - (a.sequencePerDay || 0);
    });

  }, [paginatedData.records, columnSearch, sortField, sortOrder]);

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

  const renderGDColumnHeader = (field: GDColKey) => {
    const label = getGDColLabel(field);
    const isSearching = activeSearchCol === field;
    const filterValue = columnSearch[field] || "";
    const isSorted = sortField === field;
    const isGdNum = field === "gdNumber";

    return (
      <div className={`space-y-1 relative ${isGdNum ? "text-center" : ""}`} data-column-search-box="true">
        <div className={`flex items-center ${isGdNum ? "justify-center" : "justify-between"} gap-1`}>
          {/* Grab Handle + Column Name */}
          <div className="flex items-center gap-1 min-w-0">
            <span
              className="text-slate-400 hover:text-white cursor-grab active:cursor-grabbing p-0.5 rounded shrink-0 transition-colors"
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
              className="flex items-center gap-1 font-bold text-white hover:text-cyan-200 transition-colors text-left uppercase text-[11px] tracking-wider cursor-pointer group truncate"
            >
              <span className="truncate">{label}</span>
              {filterValue ? (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
              ) : (
                <Search className="w-2.5 h-2.5 text-slate-400 opacity-40 group-hover:opacity-100 group-hover:text-cyan-300 transition-opacity shrink-0" />
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
            className={`p-1 rounded hover:bg-white/10 transition-colors cursor-pointer shrink-0 ${
              isSorted ? "text-cyan-300 bg-white/15" : "text-slate-400 hover:text-white"
            }`}
          >
            {isSorted ? (
              sortOrder === "asc" ? (
                <ArrowUp className="w-3.5 h-3.5 font-bold text-cyan-300" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5 font-bold text-cyan-300" />
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
            <div className="relative flex items-center gap-1">
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
                className="w-full text-[11px] px-2 py-1 bg-white border border-cyan-400 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500 font-normal pr-5 text-slate-900 shadow-2xs normal-case"
              />
              <VoiceInputButton
                onTranscript={(text) =>
                  setColumnSearch((prev) => ({ ...prev, [field]: text }))
                }
                fieldLabel={label}
                iconOnly={true}
                className="bg-white/90 border-cyan-300"
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
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        ) : filterValue ? (
          <div className="flex items-center gap-1 text-[10px] text-cyan-200 bg-cyan-950/80 px-1.5 py-0.5 rounded font-mono border border-cyan-700">
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
              className="text-slate-400 hover:text-red-400 ml-auto"
            >
              &times;
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  function openRecordPreview(record: GeneralDiaryRecord) {
    setSelectedRecord(record);
    setInspectAutoPrint(false);
    setInspectModalOpen(true);
  }

  const renderGDCell = (col: GDColKey, rec: GeneralDiaryRecord) => {
    switch (col) {
      case "gdNumber": {
        const remTime = !rec.isLocked ? getGdRecordRemainingTime(rec) : null;
        return (
          <td key="gdNumber" className="py-3 px-2 align-top w-24 min-w-[85px] text-center">
            <div className="flex flex-col items-center justify-center gap-0.5 font-mono text-center leading-tight">
              {/* Daily GD Rapat Sequence: 01, 02, 03... 10... 100 */}
              <span
                className="font-black text-xs text-blue-950 block whitespace-nowrap text-center"
                title={rec.isLocked ? rec.gdNumber : "No GD No. (not added)"}
              >
                {getGdDisplayNumber(rec)}
              </span>

              {/* 24-Hour Expiration Indicator for Unlocked Entries */}
              {remTime && (
                <span
                  className="inline-flex items-center justify-center gap-1 text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded mt-0.5 whitespace-nowrap"
                  title="Auto-deletes if no action is taken within 24 hours of creation/edit"
                >
                  <Clock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                  <span>{remTime.displayTextEn}</span>
                </span>
              )}
            </div>
          </td>
        );
      }

      case "officer":
        return (
          <td key="officer" className="py-3.5 px-3.5 align-top w-48 min-w-[180px]">
            <div className="space-y-0.5">
              <p className="font-bold text-slate-900 text-xs">
                {rec.entryForOfficer.name}
              </p>
              <p className="text-[11px] text-slate-500">
                {rec.entryForOfficer.rank} • {rec.entryForOfficer.beltNumber}
              </p>
            </div>
          </td>
        );

      case "gdType": {
        const caseTypeVal = rec.caseType || rec.relatedRecords?.caseType;
        const actsVal = rec.actsAndSections || rec.relatedRecords?.actsAndSections;
        return (
          <td key="gdType" className="py-3.5 px-3.5 align-top w-44 min-w-[150px]">
            <div className="space-y-1">
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                  rec.typeCode === "CRIMINAL_CASE" || rec.typeDisplay.toLowerCase().includes("criminal")
                    ? "bg-red-100 text-red-900 border border-red-300"
                    : "bg-slate-100 text-slate-800 border border-slate-200"
                }`}
              >
                {rec.typeDisplay}
              </span>
              {caseTypeVal && (
                <div className="text-[10px] text-red-700 font-bold bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                  {t("प्रकरण:", "Case:")} {caseTypeVal}
                </div>
              )}
              {actsVal && (
                <div className="text-[10px] text-slate-700 font-mono line-clamp-1" title={actsVal}>
                  {t("धारा:", "Section:")} {actsVal}
                </div>
              )}
            </div>
          </td>
        );
      }

      case "subject":
        return (
          <td key="subject" className="py-3.5 px-3.5 align-top w-56 min-w-[180px] max-w-[220px]">
            <p className="font-bold text-slate-950 text-xs break-words [overflow-wrap:anywhere] whitespace-normal leading-relaxed">
              {rec.subject}
            </p>
          </td>
        );

      case "activityDateTime":
        return (
          <td key="activityDateTime" className="py-3.5 px-3.5 align-top font-mono whitespace-nowrap w-40 min-w-[145px]">
            <div className="space-y-0.5 text-xs text-slate-800">
              <p className="font-bold">
                {toDDMMYYYY(
                  rec.activityDateTime.includes(" ")
                    ? rec.activityDateTime.split(" ")[0]
                    : rec.activityDateTime
                )}
              </p>
              <p className="text-[11px] text-slate-500">
                Time: {rec.activityDateTime.includes(" ")
                  ? rec.activityDateTime.split(" ").slice(1).join(" ")
                  : ""}
              </p>
            </div>
          </td>
        );

      case "narrative":
        return (
          <td key="narrative" className="py-3.5 px-3.5 align-top min-w-[300px]">
            <p className="text-slate-700 text-xs leading-relaxed line-clamp-3">
              {cleanGdNarrative(rec.narrative)}
            </p>
            {rec.narrative && (
              <span className="text-[10px] font-bold text-blue-600 mt-1 inline-block">
                Click to view full preview
              </span>
            )}
          </td>
        );

      default: {
        const customDef = customCols.find((c) => c.key === col);
        return (
          <td key={col} className="py-3.5 px-3.5 align-top text-xs text-slate-700 w-36 min-w-[130px]">
            <span className="font-mono text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
              {customDef?.defaultValue || "—"}
            </span>
          </td>
        );
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">
      {/* Top Banner Header (compact stack on <640px mobile per UI-01) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 border-b border-slate-200 pb-2.5 sm:pb-4">
        <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 sm:gap-6">
          <div className="flex w-full items-center justify-between gap-2 lg:contents">
            <h1 className="text-lg sm:text-2xl font-bold text-[#0b192c] tracking-tight">
              General Diary
            </h1>
            {activeTab === "REGISTER" && (
              <div role="group" aria-label="GD register view" className="flex shrink-0 rounded-md border border-slate-200 bg-slate-100 p-0.5 lg:hidden">
                {(["table", "list"] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    aria-pressed={mobileRegisterView === view}
                    onClick={() => setMobileRegisterView(view)}
                    className={`min-h-8 rounded px-2.5 text-xs font-semibold ${
                      mobileRegisterView === view ? "bg-[#203c88] text-white" : "text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {view === "table" ? "Table" : "List"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tabs Navigation next to Title */}
          <div className="w-full sm:w-auto grid grid-cols-2 sm:flex items-stretch sm:items-center text-xs sm:text-sm font-semibold gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200 sm:overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setPage(1);
                router.push("/general-diary");
              }}
              className={`min-w-0 min-h-[40px] sm:min-h-0 px-2 sm:px-3 py-1.5 rounded-lg transition-all flex items-center justify-center sm:justify-start gap-1 sm:gap-2 cursor-pointer leading-tight sm:leading-normal sm:whitespace-nowrap ${
                activeTab === "REGISTER"
                  ? "bg-white text-blue-950 font-bold shadow-xs border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <span>General Diary Register</span>
              <span className="shrink-0 text-[11px] font-mono bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full font-bold">
                {activeTab === "REGISTER"
                  ? paginatedData.total
                  : (persistentRegisterCount ?? paginatedData.registerCount ?? paginatedData.todayCount ?? paginatedData.lockedCount)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPage(1);
                router.push("/general-diary?tab=SUGGESTIONS_DRAFTS");
              }}
              className={`min-w-0 min-h-[40px] sm:min-h-0 px-2 sm:px-3 py-1.5 rounded-lg transition-all flex items-center justify-center sm:justify-start gap-1 sm:gap-2 cursor-pointer leading-tight sm:leading-normal sm:whitespace-nowrap ${
                activeTab === "SUGGESTIONS_DRAFTS"
                  ? "bg-white text-purple-950 font-bold shadow-xs border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <span>Auto-Suggestions &amp; Drafts</span>
              <span className="shrink-0 text-[11px] font-mono bg-purple-200 text-purple-900 px-2 py-0.5 rounded-full font-bold">
                {activeTab === "SUGGESTIONS_DRAFTS"
                  ? paginatedData.total
                  : (persistentSuggestionsCount ?? paginatedData.suggestionsCount ?? (paginatedData.suggestedCount + paginatedData.draftCount))}
              </span>
            </button>
          </div>
        </div>

        {/* Register tools and desktop create action */}
        <div className="hidden lg:flex flex-wrap items-center gap-2.5">
          <Link href="/general-diary/new" className="inline-flex">
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="text-xs font-bold gap-1.5 cursor-pointer shadow-md px-[39.375px]"
              title="Create a new General Diary entry"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>New Entry</span>
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedPrintDate("");
              setPrintDailyRegisterOpen(true);
            }}
            className="text-xs font-bold gap-1.5 border-slate-300 bg-white hover:bg-slate-50 cursor-pointer shadow-2xs"
            title={t("View, Search, Print & Download Roznamcha General Diary Register (सभी दिनों की प्रविष्टियाँ - नवीनतम से पूर्व)", "View, search, print and download General Diary entries, newest first")}
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-700" />
            <span>Register</span>
          </Button>
        </div>
      </div>

      {/* Success flash for row actions (Add to GD etc.) */}
      {successFlash && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm font-semibold animate-in fade-in-50">
          <span>{successFlash}</span>
        </div>
      )}

      {/* 24-Hour Auto-Purge Policy Notice for Auto-Suggestions & Drafts */}
      {activeTab === "SUGGESTIONS_DRAFTS" && (
        <div className="bg-gradient-to-r from-purple-50 via-purple-50/80 to-amber-50/50 border border-purple-200/80 rounded-xl p-3 flex items-start gap-3 text-xs text-purple-950 shadow-2xs">
          <Clock className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900">
                24-Hour Auto-Purge Rule - Any suggested or draft General Diary entry on which no action is taken for 24 hours is automatically removed.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Friendly Search & Filter Bar (No outer card/border) */}
      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 sm:gap-3 items-center">
        {/* 1. Keyword Search */}
        <div className="col-span-2 sm:col-span-5 min-w-0">
          <div className="relative flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setPage(1);
                }}
                placeholder="Search GD by officer, subject, keyword, GD no..."
                className="peer w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#0b192c] max-sm:h-9 max-sm:placeholder:opacity-0"
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-8 hidden items-center text-xs text-slate-500 max-sm:peer-placeholder-shown:flex">
                Search GD entries
              </span>
            </div>
            <VoiceInputButton
              onTranscript={(text) => {
                setKeyword((prev) => (prev ? `${prev} ${text}` : text));
                setPage(1);
              }}
              fieldLabel="GD Search"
              preferredLang="hi-IN"
              iconOnly={true}
            />
          </div>
        </div>

        {/* 2. Type Filter */}
        <div className="min-w-0 sm:col-span-3">
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold max-sm:h-8"
          >
            <option value="ALL">All GD Types</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.nameEn}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Entry Date — Small Compact Box */}
        <div className="sm:col-span-4 flex min-w-0 items-center gap-2 sm:justify-self-end w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setSelectedDate("");
              setPage(1);
            }}
            className={`max-sm:sr-only max-sm:focus:not-sr-only px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer shrink-0 ${
              !selectedDate
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            title="Show entries from all dates"
          >
            All
          </button>
          <div className="min-w-0 w-full sm:w-[145px]">
            <DatePickerDDMMYYYY
              value={selectedDate}
              max={todayISO}
              size="sm"
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setPage(1);
              }}
              title="Filter entries by date (DD/MM/YYYY)"
            />
          </div>
        </div>
      </div>

      {/* Main Smart GD Register */}
      {fetchError ? (
        <div role="alert" className="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3">
          <p className="text-sm font-bold text-red-800">{fetchError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchEntries()}
            className="gap-1.5 text-xs font-bold cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry Loading GD Register</span>
          </Button>
        </div>
      ) : loading ? (
        <LoadingSkeleton count={5} />
      ) : paginatedData.total === 0 && !hasColumnFilters && !keyword.trim() && typeFilter === "ALL" ? (
        <EmptyState
          title={t("कोई रोजनामचा प्रविष्टि नहीं मिली", "No General Diary entries match the criteria")}
          description={t("प्रविष्टियां देखने हेतु दिनांक या फ़िल्टर बदलें।", "Try broadening your search or filter.")}
        />
      ) : (
        <div className="space-y-4">
          {showMobileList && (
            <div className="lg:hidden">
              {displayedRecords.length ? (
                <ul aria-label="Compact General Diary list" className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
                  {displayedRecords.map((record) => {
                    const [date, ...timeParts] = record.activityDateTime.split(" ");
                    return (
                      <li key={record.id}>
                        <button
                          type="button"
                          onClick={() => openRecordPreview(record)}
                          className="grid w-full grid-cols-[minmax(2.25rem,auto)_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2.5 text-left transition-colors hover:bg-blue-50/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 dark:hover:bg-slate-800"
                        >
                          <span title={record.gdNumber} className="max-w-16 border-r border-slate-200 pr-2 font-mono text-xs font-bold leading-tight text-blue-950 dark:border-slate-700 dark:text-blue-200">
                            <span className="block">GD</span>
                            <span className="block break-all">{getGdDisplayNumber(record)}</span>
                          </span>
                          <span className="min-w-0 space-y-0.5 [overflow-wrap:anywhere]">
                            <span className="block text-[11px] font-semibold leading-snug text-[#203c88] dark:text-blue-300">{record.typeDisplay || "—"}</span>
                            <span className="block text-xs font-bold leading-snug text-slate-950 dark:text-slate-100">{record.subject || "—"}</span>
                            <span className="block text-[11px] leading-snug text-slate-600 dark:text-slate-400">{record.entryForOfficer.name}</span>
                          </span>
                          <span className="flex items-center gap-1 text-right">
                            <span className="whitespace-nowrap text-[11px] leading-tight text-slate-600 dark:text-slate-300">
                              <span className="block font-semibold">{timeParts.join(" ")}</span>
                              <span className="block">{toDDMMYYYY(date)}</span>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-[#203c88] dark:text-blue-300" aria-hidden="true" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  title="No matching GD entries found"
                  description="Clear your search or column filter to view all entries."
                  actionLabel="Clear Filter & Show All"
                  onAction={() => {
                    setColumnSearch({});
                    setActiveSearchCol(null);
                    setKeyword("");
                  }}
                />
              )}
            </div>
          )}
          <div className={`rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden ${showMobileList ? "hidden lg:block" : ""}`}>
            <div className="overflow-x-auto w-full">
              <table className="min-w-[1100px] w-full text-xs text-left">
              <thead className="bg-[#0b192c] text-white uppercase text-[11px] tracking-wider font-sans">
                <tr>
                  {columnOrder.map((col) => {
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
                        className={`py-3 ${col === "gdNumber" ? "px-2 text-center" : "px-3.5"} align-top transition-all select-none cursor-grab active:cursor-grabbing ${
                          GD_COLUMN_WIDTHS[col] || ""
                        } ${
                          isDragging ? "opacity-30 bg-slate-800" : ""
                        } ${
                          isOver ? "border-l-4 border-l-cyan-400 bg-cyan-950/90 shadow-inner" : ""
                        }`}
                      >
                        {renderGDColumnHeader(col)}
                      </th>
                    );
                  })}
                  {activeTab === "SUGGESTIONS_DRAFTS" && (
                    <th className="py-3 px-2.5 w-24 min-w-[88px] text-right align-top pt-3.5 whitespace-nowrap">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={columnOrder.length + (activeTab === "SUGGESTIONS_DRAFTS" ? 1 : 0)} className="text-center py-12 text-slate-500 bg-slate-50/50">
                      <div className="flex flex-col items-center justify-center gap-2.5 max-w-md mx-auto">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                          <Filter className="w-5 h-5" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-800 text-sm">
                            {t("कोई रिकॉर्ड नहीं मिला (No matching records)", "No matching GD entries found")}
                          </p>
                          <p className="text-xs text-slate-500">
                            {t("खोजे गए शब्द या कॉलम फ़िल्टर को साफ़ करने हेतु नीचे क्लिक करें।", "Clear your search or column filter to view all entries.")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setColumnSearch({});
                            setActiveSearchCol(null);
                            setKeyword("");
                          }}
                          className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold cursor-pointer transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{t("फ़िल्टर साफ़ करें (Clear Filter)", "Clear Filter & Show All")}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedRecords.map((rec) => {
                  const isLocked = rec.isLocked;
                  const isSuggested = rec.status === "SUGGESTED";
                  const isDraft = rec.status === "DRAFT";

                  return (
                    <tr
                      key={rec.id}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button, a, input, select")) return;
                        openRecordPreview(rec);
                      }}
                      className={`cursor-pointer hover:bg-blue-50/50 transition-colors ${
                        isSuggested ? "bg-purple-50/30" : isDraft ? "bg-amber-50/30" : ""
                      }`}
                      title="Click anywhere on row to preview"
                    >
                      {columnOrder.map((col) => renderGDCell(col, rec))}

                      {/* Actions (Only on Suggestions & Drafts for edit/delete; on Register, clicking any row opens full preview) */}
                      {activeTab === "SUGGESTIONS_DRAFTS" && (
                        <td className="py-3.5 px-2.5 align-top text-right w-24 min-w-[88px]">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link href={`/general-diary/new?editDraft=${rec.id}`}>
                              <button
                                type="button"
                                className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 transition-colors shadow-2xs cursor-pointer flex items-center justify-center"
                                title="Edit suggestion / draft"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </Link>
                            <button
                              type="button"
                              disabled={deletingRecordId === rec.id}
                              onClick={() => handleDeleteDraftRow(rec)}
                              className="p-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600 hover:text-red-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 flex items-center justify-center"
                              title="Delete suggestion / draft"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </div>

          {/* Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-2">
            <span>
              Showing Page <strong>{paginatedData.page}</strong> of <strong>{paginatedData.totalPages}</strong> (Total <strong>{paginatedData.total}</strong> records)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="gap-1 text-xs px-2.5 py-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </Button>

              {/* Numbered Page Buttons like 1, 2, 3... */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.max(1, paginatedData.totalPages) }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setPage(pageNum)}
                    className={`min-w-[28px] h-7 px-1.5 rounded text-xs font-bold transition-colors cursor-pointer flex items-center justify-center ${
                      page === pageNum
                        ? "bg-[#0b192c] text-white shadow-xs"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= paginatedData.totalPages}
                onClick={() => setPage((p) => Math.min(paginatedData.totalPages, p + 1))}
                className="gap-1 text-xs px-2.5 py-1 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Record Inspection & Print Modal */}
      {selectedRecord && (
        <GDRecordModal
          record={selectedRecord}
          isOpen={inspectModalOpen}
          autoPrint={inspectAutoPrint}
          onClose={() => {
            setInspectModalOpen(false);
            setSelectedRecord(null);
            setInspectAutoPrint(false);
          }}
        />
      )}

      {/* Print Daily Register Modal (print preview + window.print) */}
      <GDPrintModal
        isOpen={printDailyRegisterOpen || printRegisterFromNav}
        onClose={() => {
          setPrintDailyRegisterOpen(false);
          if (printRegisterFromNav) {
            const url = new URL(window.location.href);
            url.searchParams.delete("printRegister");
            window.history.replaceState(null, "", url);
          }
        }}
        initialDate={selectedPrintDate}
      />

      {/* Brief Description Popup Dialog Modal */}
      {briefModalOpen && briefModalRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in-50"
          onClick={closeBriefModal}
        >
          <div
            className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[90vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#0b192c] text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/40 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm leading-tight text-white">
                      {briefModalRecord.isLocked
                        ? `GD ${briefModalRecord.sequencePerDay ? String(briefModalRecord.sequencePerDay).padStart(2, "0") : briefModalRecord.gdNumber}`
                        : briefModalRecord.status === "SUGGESTED"
                        ? "Auto-Suggestion"
                        : "Draft Record"}
                    </h3>
                    {(briefModalRecord.typeDisplayHi || briefModalRecord.typeDisplay) && (
                      <span className="text-[10px] bg-white/10 text-slate-200 border border-white/20 px-2 py-0.5 rounded font-mono">
                        {briefModalRecord.typeDisplayHi || briefModalRecord.typeDisplay}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {t("Brief Description • सम्पूर्ण विवरण", "Brief description")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeBriefModal}
                className="text-white hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors cursor-pointer"
                title="Close (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-header / Metadata */}
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 text-xs text-slate-700 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-slate-500 font-medium">Subject: </span>
                  <span className="font-bold text-slate-900">{briefModalRecord.subject}</span>
                </div>
                <div className="font-mono text-[11px] text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                  📅 {toDDMMYYYY(briefModalRecord.activityDateTime)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
                <div>
                  <span className="text-slate-500">Officer: </span>
                  <span className="font-semibold text-slate-800">{briefModalRecord.entryForOfficer?.name || "N/A"}</span>
                  {briefModalRecord.entryForOfficer?.rank && (
                    <span className="text-slate-500">
                      {" "}
                      ({briefModalRecord.entryForOfficer.rank}
                      {briefModalRecord.entryForOfficer.beltNumber ? ` • ${briefModalRecord.entryForOfficer.beltNumber}` : ""})
                    </span>
                  )}
                </div>
                {briefModalRecord.policeStation && (
                  <div>
                    <span className="text-slate-500">Police Station: </span>
                    <span className="font-medium text-slate-700">{briefModalRecord.policeStation}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Narrative Body */}
            <div className="p-5 overflow-y-auto max-h-[50vh] flex-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                {t("Complete Narrative (दर्ज विवरण):", "Complete narrative:")}
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm leading-relaxed whitespace-pre-wrap font-sans select-text">
                {cleanGdNarrative(briefModalRecord.narrative) || "(No description recorded)"}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyBriefNarrative}
                className="gap-1.5 text-xs text-slate-700 hover:text-slate-900 cursor-pointer"
              >
                {briefCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-medium">Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Text</span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={closeBriefModal}
                className="bg-[#0b192c] hover:bg-slate-900 text-white text-xs px-4 cursor-pointer"
              >
                {t("Close (बंद करें)", "Close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Uploaded Documents Modal */}
      {docModalRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Uploaded Documents"
          onClick={() => setDocModalRecord(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#0b192c] text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center">
                  <Paperclip className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <h3 className="font-bold text-sm leading-tight text-white flex items-center gap-2">
                    <span>Uploaded Documents</span>
                    <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded font-mono">
                      {docModalRecord.gdNumber}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Subject: {docModalRecord.subject}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDocModalRecord(null)}
                className="text-slate-300 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: List of documents */}
            <div className="p-5 overflow-y-auto max-h-[65vh] space-y-4 bg-slate-50/50">
              {(() => {
                const docs =
                  (docModalRecord.attachments && docModalRecord.attachments.length > 0)
                    ? docModalRecord.attachments
                    : docModalRecord.relatedRecords?.attachments || [];

                if (docs.length === 0) {
                  return (
                    <div className="text-center py-10 text-slate-500 text-sm">
                      No documents attached to this GD entry.
                    </div>
                  );
                }

                return docs.map((doc, idx) => {
                  const isImg = doc.type?.startsWith("image/");
                  const isPdf = doc.type === "application/pdf";

                  return (
                    <div
                      key={doc.id || idx}
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {isImg ? (
                            <ImageIcon className="w-4 h-4 text-blue-600 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                          )}
                          <span className="font-bold text-xs sm:text-sm text-slate-900">
                            {doc.name}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            ({(doc.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {doc.dataUrl && (
                            <a
                              href={doc.dataUrl}
                              download={doc.name}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-2.5 py-1 rounded cursor-pointer transition-colors"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                              <span>Download</span>
                            </a>
                          )}
                          {!docModalRecord.isLocked && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={deletingDocId === doc.id}
                              onClick={() => handleDeleteAttachment(docModalRecord.id, doc.id)}
                              className="text-[11px] font-bold text-red-700 border-red-300 hover:bg-red-50 px-2.5 py-1 h-auto cursor-pointer gap-1"
                            >
                              {deletingDocId === doc.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              <span>{deletingDocId === doc.id ? "Deleting…" : "Delete"}</span>
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Document Preview (Image / PDF embed) */}
                      {doc.dataUrl && (
                        <div className="mt-2 bg-slate-100 rounded-lg p-2 flex items-center justify-center max-h-[400px] overflow-hidden border border-slate-200">
                          {isImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={doc.dataUrl}
                              alt={doc.name}
                              className="max-h-[380px] max-w-full object-contain rounded"
                            />
                          ) : isPdf ? (
                            <iframe
                              src={doc.dataUrl}
                              title={doc.name}
                              className="w-full h-[380px] rounded border border-slate-300"
                            />
                          ) : (
                            <div className="text-xs text-slate-500 py-6">
                              Preview not supported. Please click Download above to view.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDocModalRecord(null)}
                className="text-xs px-4 cursor-pointer"
              >
                {t("Close (बंद करें)", "Close")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GeneralDiaryPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading Smart General Diary Register...
        </div>
      }
    >
      <GeneralDiaryContent />
    </Suspense>
  );
}
