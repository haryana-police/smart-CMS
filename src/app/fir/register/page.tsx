"use client";

import { isMhcOrMmRole } from "@/lib/officerRoles";
import React, { useState, useEffect, useRef, Suspense, useMemo, useCallback } from "react";
import Link from "next/link";
import { canRegisterFir } from "@/lib/firIntegrity";
import { useSearchParams } from "next/navigation";
import { useGuardedRouter as useRouter } from "@/hooks/useGuardedRouter";
import {
  Shield,
  ShieldAlert,
  User,
  MapPin,
  FileText,
  AlertCircle,
  CheckCircle2,
  Printer,
  ArrowRight,
  ArrowLeft,
  Users,
  Building,
  Calendar,
  Phone,
  BookOpen,
  Clock,
  Trash2,
  Edit2,
  Plus,
  Scale,
  Sparkles,
  UserCheck,
  Eye,
  Save,
  PenTool,
  Crosshair,
  Package,
  Activity,
  Layers,
  X,
  RotateCcw,
  Upload,
  Search,
  Check,
  CheckSquare,
  Square,
  ChevronDown,
  RefreshCw,
  Info,
  UploadCloud,
  Database,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { persistentFirService as firService } from "@/services/persistentFirService";
import { ComplaintService } from "@/services/complaintService";
import { GeneralDiaryService } from "@/services/generalDiaryService";
import { ActsService } from "@/services/actsService";
import {
  firAutoFillService,
  ProcessedFIRDocumentRecord,
} from "@/services/firAutoFillService";
import { FIRUploadAutoFillModal } from "@/components/fir/FIRUploadAutoFillModal";
import {
  getUnifiedActsCatalog,
  UnifiedActOption,
  UnifiedSectionOption,
} from "@/lib/cctnsActsData";
import {
  ComplaintItem,
  AccusedPerson,
  FIRItem,
  FIRActSectionEntry,
  FIRMajorMinorHeadEntry,
  FIROccurrenceItem,
  FIRAliasEntry,
  FIRIdentificationEntry,
  FIRPropertyItem,
  FIRDepartmentEntry,
  FIRUidbEntry,
  FIRHurtDetails,
  FIRSignatureData,
} from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePickerDDMMYYYY } from "@/components/ui/date-picker-ddmmyyyy";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { getTodayIsoIST, toIsoDateString, parseTimeTo24Hour, parseGdActivityDateTime } from "@/lib/utils";
import { getFirTimePeriod } from "@/lib/firOccurrence";
import { VoiceInputButton } from "@/components/ui/voice-input-button";
import { AutoSuggestField } from "@/components/ui/auto-suggest-field";
import { useFirIoRoster } from "@/hooks/useFirIoRoster";
import { MOCK_GD_ENTRIES } from "@/lib/mockData";
import { FIRReceiptModal } from "@/components/fir/FIRReceiptModal";
import {
  getStatesList,
  getDistrictsForState,
  getPoliceStationsForDistrict,
} from "@/lib/jurisdictionData";

// Sub-dialogs and Inline Form Sections
import { GDLookupDialog, GDLookupResult } from "@/components/fir/dialogs/GDLookupDialog";
import { ConfirmActionDialog } from "@/components/fir/dialogs/ConfirmActionDialog";
import { InlineOccurrenceSection, ExtendedFIROccurrenceItem } from "@/components/fir/sections/InlineOccurrenceSection";
import { InlineVictimSection, VictimItemData } from "@/components/fir/sections/InlineVictimSection";
import { InlineAccusedSection, ExtendedAccusedPerson } from "@/components/fir/sections/InlineAccusedSection";
import {
  SOURCE_OF_COMPLAINT_OPTIONS,
  DIRECTION_FROM_PS_OPTIONS,
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  RELATION_TYPE_OPTIONS,
  CASTE_CATEGORY_OPTIONS,
  IDENTIFICATION_TYPE_OPTIONS,
  ACTION_TAKEN_OPTIONS,
  PROPERTY_CATEGORIES,
  PROPERTY_TYPES_BY_CATEGORY,
  NATURE_OF_PROPERTY_OPTIONS,
  getDynamicSourceOfComplaint,
  getDynamicDirectionFromPs,
  getDynamicActionTakenOptions,
  getDynamicCasteCategories,
  getDynamicMajorHeads,
} from "@/components/fir/firDropdownConstants";

// Exactly 7 Main Tabs in strict order — Tag FIR is excluded
export type MainTabKey =
  | "act_section"
  | "occurrence"
  | "complainant"
  | "fir_content"
  | "accused"
  | "property";

const TAB_CONFIG: { key: MainTabKey; label: string; icon: any; shortTitle: string }[] = [
  { key: "act_section", label: "1. Act & Section", shortTitle: "Act & Section", icon: Scale },
  { key: "occurrence", label: "2. Occurrence", shortTitle: "Occurrence", icon: MapPin },
  { key: "complainant", label: "3. Complainant & Victim Details", shortTitle: "Complainant & Victim", icon: Users },
  { key: "fir_content", label: "4. FIR Content & Action Taken", shortTitle: "Content & Action", icon: FileText },
  { key: "accused", label: "5. Accused", shortTitle: "Accused", icon: Crosshair },
  { key: "property", label: "6. Property, Hurt Details & Signature", shortTitle: "Property & Signature", icon: Package },
];

const MAJOR_HEADS = [
  "Crime Against Property",
  "Crime Against Body",
  "Crime Against Women",
  "Economic Offences",
  "Cyber Crime",
  "Narcotic Drugs",
  "Public Peace & Order",
  "Special & Local Laws",
  "Traffic & Motor Vehicles",
];

const MINOR_HEADS: Record<string, string[]> = {
  "Crime Against Property": ["Theft", "Burglary", "Robbery", "Dacoity", "Extortion", "Criminal Trespass", "Mischief"],
  "Crime Against Body": ["Murder", "Attempt to Murder", "Culpable Homicide", "Grievous Hurt", "Simple Hurt", "Kidnapping", "Abduction"],
  "Crime Against Women": ["Rape", "Molestation / Outraging Modesty", "Dowry Harassment", "Cruelty by Husband/Relatives", "Stalking"],
  "Economic Offences": ["Cheating", "Criminal Breach of Trust", "Forgery", "Counterfeiting", "Bank Fraud"],
  "Cyber Crime": ["Financial Cyber Fraud", "Identity Theft", "Hacking", "Cyber Stalking", "Obscene Content"],
  "Narcotic Drugs": ["Possession of Commercial Quantity", "Intermediate Quantity", "Small Quantity", "Trafficking"],
  "Public Peace & Order": ["Rioting", "Unlawful Assembly", "Affray", "Obstruction of Public Servant"],
  "Special & Local Laws": ["Arms Act Violation", "Excise Act Violation", "Gambling Act Violation"],
  "Traffic & Motor Vehicles": ["Rash and Negligent Driving", "Fatal Accident", "Hit and Run"],
};

function weekdayForDate(date: string) {
  const parsed = new Date(toIsoDateString(date) + "T00:00:00Z");
  return Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(parsed);
}

function getNowLocal() {
  const date = getTodayIsoIST();
  try {
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    return { date, time };
  } catch {
    const now = new Date();
    return {
      date,
      time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    };
  }
}

function RegisterFIRForm({ onReset }: { onReset: () => void }) {
  const { currentUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const complaintIdParam = searchParams.get("complaintId");
  const gdNumberParam = searchParams.get("gdNumber");

  const isMhc = isMhcOrMmRole(currentUser.role);
  const isSuperior = currentUser ? (currentUser.role === "DSP_SUBDIV" || currentUser.role === "SP_DISTRICT" || currentUser.role === "SUPER_ADMIN") : false;
  const isSho = currentUser ? ((currentUser.role === "SHO" || currentUser.id === "usr_sho_1" || isSuperior) && !isMhc) : false;

  const [activeTab, setActiveTab] = useState<MainTabKey>("act_section");
  const [visitedTabs, setVisitedTabs] = useState<MainTabKey[]>([]);

  // Dynamic real-time clock state for maximum allowable limits
  const [currentNow, setCurrentNow] = useState(() => getNowLocal());

  // Periodically refresh currentNow every 15s to ensure dynamic boundary check
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentNow(getNowLocal());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Linked Complaint & Status
  const [linkedComplaint, setLinkedComplaint] = useState<ComplaintItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registeredFir, setRegisteredFir] = useState<FIRItem | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  // Distinguishes the read-only Preview (IIF-I) from the post-registration receipt.
  const [receiptMode, setReceiptMode] = useState<"preview" | "registered" | null>(null);
  const draftKey = useMemo(() => {
    const owner = JSON.stringify([currentUser?.id, currentUser?.stationName, currentUser?.district]);
    if (complaintIdParam) return `${owner}:complaint_${complaintIdParam}`;
    if (gdNumberParam) return `${owner}:gd_${gdNumberParam}`;
    return `${owner}:general`;
  }, [complaintIdParam, gdNumberParam, currentUser?.id, currentUser?.stationName, currentUser?.district]);
  const draftFinalized = useRef(false);
  const discardDraft = () => {
    draftFinalized.current = true;
    firService.clearFirDraft(draftKey);
  };
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState("");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [draftRestoredNotice, setDraftRestoredNotice] = useState<string | null>(null);
  const [saveDraftFeedback, setSaveDraftFeedback] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Jurisdiction & Header
  const [state, setState] = useState("Haryana");
  const [district, setDistrict] = useState(() => currentUser?.district || "Panipat");
  const [policeStation, setPoliceStation] = useState(() => currentUser?.stationName || "PS City Panipat");
  const { officers: ioRoster, loading: ioRosterLoading, error: ioRosterError } = useFirIoRoster(policeStation, district, isSho);

  // Auto-populate latest local date & time
  const [firDate, setFirDate] = useState(() => getNowLocal().date);
  const [firTime, setFirTime] = useState(() => getNowLocal().time);

  // Generated FIR Number for display (Strictly per Police Station and Year)
  const [autoFirNumber, setAutoFirNumber] = useState<{ firNumber: string; firYear: number }>(() => {
    return firService.generateNextFirNumber(currentUser?.stationName || "PS City Panipat", getNowLocal().date);
  });

  // Keep FIR number reactive to policeStation or firDate changes
  useEffect(() => {
    const next = firService.generateNextFirNumber(policeStation, firDate);
    setAutoFirNumber(next);
  }, [policeStation, firDate]);

  // Auto-populate latest date and time on initial mount
  useEffect(() => {
    const latest = getNowLocal();
    setFirDate(latest.date);
    setFirTime(latest.time);
  }, []);

  const maxAllowedFirDate = currentNow.date;
  const maxAllowedFirTime = firDate >= maxAllowedFirDate ? currentNow.time : undefined;

  const handleFirDateChange = (newDate: string) => {
    const now = getNowLocal();
    let clampedDate = newDate;
    if (clampedDate && clampedDate > now.date) {
      clampedDate = now.date;
    }
    setFirDate(clampedDate);

    // If date is today, clamp time if it exceeds current time
    if (clampedDate >= now.date && firTime > now.time) {
      setFirTime(now.time);
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next.firDate;
      return next;
    });
  };

  const handleFirTimeChange = (newTime: string, targetEl?: HTMLInputElement | null) => {
    const now = getNowLocal();
    let clampedTime = newTime;
    if (firDate >= now.date && clampedTime > now.time) {
      clampedTime = now.time;
      if (targetEl) targetEl.value = clampedTime;
    }
    setFirTime(clampedTime);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.firTime;
      return next;
    });
  };

  // Cascading Jurisdiction Lists and Handlers
  const availableStates = useMemo(() => getStatesList(), []);
  const availableDistricts = useMemo(() => getDistrictsForState(state), [state]);
  const availablePoliceStations = useMemo(
    () => getPoliceStationsForDistrict(state, district),
    [state, district]
  );

  const handleStateChange = (newState: string) => {
    setState(newState);
    const districts = getDistrictsForState(newState);
    const nextDistrict = districts.includes(district) ? district : (districts[0] || "");
    setDistrict(nextDistrict);
    const pss = getPoliceStationsForDistrict(newState, nextDistrict);
    const nextPs = pss.includes(policeStation) ? policeStation : (pss[0] || "");
    setPoliceStation(nextPs);
  };

  const handleDistrictChange = (newDistrict: string) => {
    setDistrict(newDistrict);
    const pss = getPoliceStationsForDistrict(state, newDistrict);
    const nextPs = pss.includes(policeStation) ? policeStation : (pss[0] || "");
    setPoliceStation(nextPs);
  };

  const handlePoliceStationChange = (newPs: string) => {
    setPoliceStation(newPs);
  };

  // Dialog Visibility & Edit States
  const [showGDLookupDialog, setShowGDLookupDialog] = useState(false);
  const [showUploadAutoFillModal, setShowUploadAutoFillModal] = useState(false);
  const [hasProcessedDocument, setHasProcessedDocument] = useState(false);

  useEffect(() => {
    const checkDocument = () => {
      if (autoFirNumber?.firNumber) {
        const rec = firAutoFillService.getByFirNumber(autoFirNumber.firNumber);
        setHasProcessedDocument(!!rec);
      }
    };
    checkDocument();
    window.addEventListener("cms-fir-autofill-updated", checkDocument);
    return () => window.removeEventListener("cms-fir-autofill-updated", checkDocument);
  }, [autoFirNumber?.firNumber]);

  // Occurrence Inline Handlers
  const handleAddOccurrence = (item: ExtendedFIROccurrenceItem) => {
    setOccurrencesList((prev) => [...prev, item]);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.occurrence;
      return next;
    });
  };
  const handleUpdateOccurrence = (item: ExtendedFIROccurrenceItem) => {
    setOccurrencesList((prev) => prev.map((it) => (it.id === item.id ? item : it)));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.occurrence;
      return next;
    });
  };
  const handleDeleteOccurrence = (id: string) => {
    setOccurrencesList((prev) => prev.filter((it) => it.id !== id));
  };

  // Victim Inline Handlers
  const handleAddVictim = (item: VictimItemData) => {
    setVictimsList((prev) => [...prev, item]);
  };
  const handleUpdateVictim = (item: VictimItemData) => {
    setVictimsList((prev) => prev.map((it) => (it.id === item.id ? item : it)));
  };
  const handleDeleteVictim = (id: string) => {
    setVictimsList((prev) => prev.filter((it) => it.id !== id));
  };

  // Accused Inline Handlers
  const handleAddAccused = (item: ExtendedAccusedPerson) => {
    setAccusedList((prev) => [...prev, item]);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.accused;
      return next;
    });
  };
  const handleUpdateAccused = (item: ExtendedAccusedPerson) => {
    setAccusedList((prev) => prev.map((it) => (it.id === item.id ? item : it)));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.accused;
      return next;
    });
  };
  const handleDeleteAccused = (id: string) => {
    setAccusedList((prev) => prev.filter((it) => it.id !== id));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.accused;
      return next;
    });
  };

  // Common Action Confirmation Modal
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "primary";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  // TAB 1: Act & Section
  const [gdEntryNumber, setGdEntryNumber] = useState("");
  const [caseType, setCaseType] = useState<string>("ADULT");
  const [gdDate, setGdDate] = useState(() => getNowLocal().date);
  const [gdTime, setGdTime] = useState(() => getNowLocal().time);

  const maxAllowedGdTime = gdDate >= currentNow.date ? currentNow.time : undefined;

  const handleGdDateChange = (newDate: string) => {
    const now = getNowLocal();
    let clampedDate = newDate;
    if (clampedDate && clampedDate > now.date) {
      clampedDate = now.date;
    }
    setGdDate(clampedDate);
    if (clampedDate >= now.date && gdTime > now.time) {
      setGdTime(now.time);
    }
  };

  const handleGdTimeChange = (newTime: string, targetEl?: HTMLInputElement | null) => {
    const now = getNowLocal();
    let clampedTime = newTime;
    if (gdDate >= now.date && clampedTime > now.time) {
      clampedTime = now.time;
      if (targetEl) targetEl.value = clampedTime;
    }
    setGdTime(clampedTime);
  };

  const [sourceOfComplaint, setSourceOfComplaint] = useState("Citizen/General Public");
  const [complaintNumber, setComplaintNumber] = useState("");
  const [isHeinousCrime, setIsHeinousCrime] = useState(false);
  const [isSensitiveFIR, setIsSensitiveFIR] = useState(false);
  const [originalDateTime, setOriginalDateTime] = useState("");

  // Zero FIR Transferred-In States
  const [isZeroFirTransferIn, setIsZeroFirTransferIn] = useState(false);
  const [originalZeroFirNumber, setOriginalZeroFirNumber] = useState("");
  const [originalZeroFirPs, setOriginalZeroFirPs] = useState("");
  const [originalZeroFirDistrict, setOriginalZeroFirDistrict] = useState("");
  const [originalZeroFirDate, setOriginalZeroFirDate] = useState("");

  const handleOriginalDateTimeChange = (newVal: string, targetEl?: HTMLInputElement | null) => {
    const now = getNowLocal();
    const maxVal = `${now.date}T${now.time}`;
    let clamped = newVal;
    if (clamped && clamped > maxVal) {
      clamped = maxVal;
      if (targetEl) targetEl.value = clamped;
    }
    setOriginalDateTime(clamped);
    if (errors.originalDateTime) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.originalDateTime;
        return next;
      });
    }
  };

  const [actRemarks, setActRemarks] = useState("");
  const [typeOfInfo, setTypeOfInfo] = useState<"WRITTEN" | "ORAL">("WRITTEN");

  // Act & Section list
  const [unifiedActs, setUnifiedActs] = useState<UnifiedActOption[]>(() => {
    return getUnifiedActsCatalog(ActsService.getAllActs());
  });
  const [selectedActId, setSelectedActId] = useState<string>("act_bns_2023");
  const [currentAct, setCurrentAct] = useState("Bharatiya Nyaya Sanhita, 2023 (BNS)");
  const [actSearchQuery, setActSearchQuery] = useState("");
  const [isActDropdownOpen, setIsActDropdownOpen] = useState(false);
  const actDropdownRef = useRef<HTMLDivElement | null>(null);
  const actSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [sectionSearchQuery, setSectionSearchQuery] = useState("");
  const [currentSection, setCurrentSection] = useState("");
  const [isSectionDropdownOpen, setIsSectionDropdownOpen] = useState(false);
  const sectionDropdownRef = useRef<HTMLDivElement | null>(null);
  const [actsAndSectionsList, setActsAndSectionsList] = useState<FIRActSectionEntry[]>([]);

  // Major / Minor Head list
  const [currentMajorHead, setCurrentMajorHead] = useState(MAJOR_HEADS[0]);
  const [currentMinorHead, setCurrentMinorHead] = useState(MINOR_HEADS[MAJOR_HEADS[0]][0] || "");
  const [majorMinorHeadsList, setMajorMinorHeadsList] = useState<FIRMajorMinorHeadEntry[]>([]);

  // Dynamic Options from DropdownManagerService
  const [sourceOfComplaintList, setSourceOfComplaintList] = useState<string[]>(getDynamicSourceOfComplaint);
  const [actionTakenList, setActionTakenList] = useState<string[]>(getDynamicActionTakenOptions);
  const [casteCategoryList, setCasteCategoryList] = useState<string[]>(getDynamicCasteCategories);
  const [majorHeadsOptions, setMajorHeadsOptions] = useState<string[]>(() => getDynamicMajorHeads(MAJOR_HEADS));

  useEffect(() => {
    const refreshDropdowns = () => {
      setSourceOfComplaintList(getDynamicSourceOfComplaint());
      setActionTakenList(getDynamicActionTakenOptions());
      setCasteCategoryList(getDynamicCasteCategories());
      setMajorHeadsOptions(getDynamicMajorHeads(MAJOR_HEADS));
    };
    window.addEventListener("cms-dropdowns-updated", refreshDropdowns);
    return () => window.removeEventListener("cms-dropdowns-updated", refreshDropdowns);
  }, []);

  // Track fields that were auto-filled to highlight them distinctly in green
  const [autoFilledFields, setAutoFilledFields] = useState<Record<string, boolean>>({});

  const getFieldHighlightClass = (fieldName: string) => {
    if (
      errors[fieldName] ||
      (fieldName === "firContentText" && errors.fir_content) ||
      (fieldName === "complainantFirstName" && errors.complainant)
    ) {
      return "mandatory-glow-error";
    }
    if (autoFilledFields[fieldName]) {
      return "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100 transition-all";
    }
    return "";
  };

  // TAB 2: Occurrence
  const [occurrencesList, setOccurrencesList] = useState<ExtendedFIROccurrenceItem[]>([]);


  // TAB 3: Complainant (3 Subtabs)
  // 3.1 Personal
  const [complainantUid, setComplainantUid] = useState("");
  const [complainantFirstName, setComplainantFirstName] = useState("");
  const [complainantMiddleName, setComplainantMiddleName] = useState("");
  const [complainantLastName, setComplainantLastName] = useState("");
  const [complainantAliases, setComplainantAliases] = useState<FIRAliasEntry[]>([]);
  const [tempAlias, setTempAlias] = useState("");
  const [complainantGender, setComplainantGender] = useState<string>("");
  const [complainantMaritalStatus, setComplainantMaritalStatus] = useState<string>("");
  const [complainantCategory, setComplainantCategory] = useState<string>("GENERAL");
  const [complainantMobile, setComplainantMobile] = useState("");
  const [complainantLandline, setComplainantLandline] = useState("");
  const [complainantEmail, setComplainantEmail] = useState("");
  const [complainantRelationType, setComplainantRelationType] = useState<string>("Father");
  const [complainantRelativeName, setComplainantRelativeName] = useState("");
  const [complainantRelativeAlias, setComplainantRelativeAlias] = useState("");
  const [complainantSameAsVictim, setComplainantSameAsVictim] = useState(false);
  const [victimAutofillData, setVictimAutofillData] = useState<any>(null);
  const [victimAutofillTrigger, setVictimAutofillTrigger] = useState<number>(0);
  const [complainantDob, setComplainantDob] = useState("");
  const [complainantYearOfBirth, setComplainantYearOfBirth] = useState("");
  const [complainantAge, setComplainantAge] = useState<string>("");
  const [complainantAgeMonths, setComplainantAgeMonths] = useState<string>("");
  const [complainantAgeRange, setComplainantAgeRange] = useState<string>("Not Specified");

  const YEAR_OPTIONS = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 110 }, (_, i) => current - i);
  }, []);

  // 3.2 Address
  const [permHouseNo, setPermHouseNo] = useState("");
  const [permStreet, setPermStreet] = useState("");
  const [permColony, setPermColony] = useState("");
  const [permCity, setPermCity] = useState("Panipat");
  const [permTehsil, setPermTehsil] = useState("Panipat");
  const [permCountry, setPermCountry] = useState("India");
  const [permState, setPermState] = useState("Haryana");
  const [permDistrict, setPermDistrict] = useState("Panipat");
  const [permPs, setPermPs] = useState("PS City Panipat");
  const [permPincode, setPermPincode] = useState("");
  const [presentSameAsPerm, setPresentSameAsPerm] = useState(true);
  const [presHouseNo, setPresHouseNo] = useState("");
  const [presStreet, setPresStreet] = useState("");
  const [presColony, setPresColony] = useState("");
  const [presCity, setPresCity] = useState("Panipat");
  const [presTehsil, setPresTehsil] = useState("Panipat");
  const [presPs, setPresPs] = useState("PS City Panipat");
  const [presDistrict, setPresDistrict] = useState("Panipat");
  const [presState, setPresState] = useState("Haryana");
  const [presPincode, setPresPincode] = useState("");
  const [presAddressFull, setPresAddressFull] = useState("");

  // 3.3 Other Info
  const [complainantOccupation, setComplainantOccupation] = useState("Private Service");
  const [complainantNationality, setComplainantNationality] = useState("Indian");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportIssueDate, setPassportIssueDate] = useState("");
  const [passportIssuePlace, setPassportIssuePlace] = useState("");
  const [identificationsList, setIdentificationsList] = useState<FIRIdentificationEntry[]>([]);
  const [tempIdType, setTempIdType] = useState<string>("Aadhar Card");
  const [tempIdNumber, setTempIdNumber] = useState("");

  // TAB 4: FIR Content (No voice buttons, 10,000 char counter)
  const [firContentText, setFirContentText] = useState("");
  const [briefFacts, setBriefFacts] = useState("");
  const [reasonsForDelay, setReasonsForDelay] = useState("");
  const [uploadedContentFiles, setUploadedContentFiles] = useState<string[]>([]);

  // TAB 5: Action Taken
  const [isSecretFir, setIsSecretFir] = useState(false);
  const [actionType, setActionType] = useState<string>("");
  const [assignedIoId, setAssignedIoId] = useState("");
  const [refusedReason, setRefusedReason] = useState("");
  const [transferredPs, setTransferredPs] = useState("");
  const [transferredDistrict, setTransferredDistrict] = useState("");
  const [assignedDirections, setAssignedDirections] = useState("");
  const [departmentList, setDepartmentList] = useState<FIRDepartmentEntry[]>([]);
  const [tempDeptName, setTempDeptName] = useState("");
  const [tempDeptEmail, setTempDeptEmail] = useState("");
  const [inquestReportNo, setInquestReportNo] = useState("");
  const [courtDispatchDateTime, setCourtDispatchDateTime] = useState(() => {
    const now = getNowLocal();
    return `${now.date}T${now.time}`;
  });
  const [roacConfirmed, setRoacConfirmed] = useState(true);
  const [freeCopyGiven, setFreeCopyGiven] = useState(true);

  // TAB 6: Victim Information
  const [victimsList, setVictimsList] = useState<any[]>([]);

  // TAB 7: Accused
  const [isAccusedKnown, setIsAccusedKnown] = useState(true);
  const [accusedMoreThan, setAccusedMoreThan] = useState("");
  const [accusedList, setAccusedList] = useState<ExtendedAccusedPerson[]>([]);

  // TAB 8: Property of Interest & Hurt Case Details
  const [propertiesList, setPropertiesList] = useState<FIRPropertyItem[]>([]);
  const [showAddPropertyForm, setShowAddPropertyForm] = useState(false);
  const [tempPropCategory, setTempPropCategory] = useState<string>(PROPERTY_CATEGORIES[0]);
  const [tempPropType, setTempPropType] = useState<string>(PROPERTY_TYPES_BY_CATEGORY[PROPERTY_CATEGORIES[0]][0]);
  const [tempPropNature, setTempPropNature] = useState<string>(NATURE_OF_PROPERTY_OPTIONS[0]);
  const [tempPropDescription, setTempPropDescription] = useState("");
  const [tempPropValue, setTempPropValue] = useState("");

  // Hurt Case Details (Merged in Tab 8)
  const [countDeceased, setCountDeceased] = useState("0");
  const [countSeriouslyHurt, setCountSeriouslyHurt] = useState("0");
  const [countSimpleHurt, setCountSimpleHurt] = useState("0");
  const [countNonInjured, setCountNonInjured] = useState("0");
  const [injuryDescription, setInjuryDescription] = useState("");
  const [weaponUsed, setWeaponUsed] = useState("Physical assault / Blunt");
  const [videoFootageAvailable, setVideoFootageAvailable] = useState(false);
  const [uploadedMedicalDocs, setUploadedMedicalDocs] = useState<string[]>([]);

  // TAB 9: Signature
  const [signatureCanvasDrawn, setSignatureCanvasDrawn] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hardwareOfflineNotice, setHardwareOfflineNotice] = useState(false);
  const [officerName, setOfficerName] = useState(() => currentUser?.name || "");
  const [officerRank, setOfficerRank] = useState(() => currentUser?.rankDisplay || currentUser?.roleDisplay || "");
  const [officerNumber, setOfficerNumber] = useState(() => currentUser?.pno || "");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (currentUser) {
      setOfficerName(currentUser.name || "");
      setOfficerRank(currentUser.rankDisplay || currentUser.roleDisplay || "");
      setOfficerNumber(currentUser.pno || "");
    }
  }, [currentUser]);

  // Dropdown click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sectionDropdownRef.current && !sectionDropdownRef.current.contains(event.target as Node)) {
        setIsSectionDropdownOpen(false);
      }
      if (actDropdownRef.current && !actDropdownRef.current.contains(event.target as Node)) {
        setIsActDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Update dependent Property Types when category changes
  useEffect(() => {
    const types = PROPERTY_TYPES_BY_CATEGORY[tempPropCategory] || [];
    if (types.length > 0) {
      setTempPropType(types[0]);
    } else {
      setTempPropType("");
    }
  }, [tempPropCategory]);

  // Comprehensive helper to populate FIR form from a linked Complaint
  const applyComplaintToFir = useCallback((c: any, preserveSections = false) => {
    if (!c) return;
    setLinkedComplaint(c);
    setComplaintNumber(c.complaintNumber);
    setSourceOfComplaint("Haryana Police Grievance Portal");

    const names = (c.complainantName || "").trim().split(/\s+/);
    setComplainantFirstName(names[0] || "");
    setComplainantLastName(names.slice(1).join(" ") || "");
    setComplainantRelativeName(c.complainantFatherSpouse || c.complainantRelativeName || "");
    setComplainantGender((c.complainantGender as any) || "MALE");
    if (c.complainantAge) setComplainantAge(String(c.complainantAge));
    setComplainantMobile(c.complainantMobile || "");
    setPermHouseNo(c.complainantAddress || "");
    setPermCity(c.complainantCity || "Panipat");
    setPermDistrict(c.complainantDistrict || "Panipat");
    setFirContentText(c.incidentDetails || "");
    setBriefFacts(c.incidentDetails?.slice(0, 300) || "");
    if ((c as any).gdEntryNumber) setGdEntryNumber((c as any).gdEntryNumber);
    if (c.assignedEoId && (isSho || isSuperior) && !isMhc) setAssignedIoId(c.assignedEoId);

    // Legal analysis prefill (only if not preserving already found sections)
    if (!preserveSections) {
      if (c.legalAnalysis?.suggestedSections && c.legalAnalysis.suggestedSections.length > 0) {
        // STRICT FILTER: Keep ONLY substantive penal offenses (PRIMARY_OFFENCE / CORROBORATING_OFFENCE)
        // EXCLUDE procedural provisions (PROCEDURAL_MANDATE, EVIDENTIARY_RULE) and procedural acts (BNSS, BSA)
        const substantiveSections = c.legalAnalysis.suggestedSections.filter((s: any) => {
          const recType = s.recommendationType || "";
          const act = (s.actShortName || s.actTitle || "").toUpperCase();
          if (recType === "PROCEDURAL_MANDATE" || recType === "EVIDENTIARY_RULE") return false;
          if (act.includes("BNSS") || act.includes("NAGARIK SURAKSHA") || act.includes("BSA") || act.includes("SAKSHYA")) return false;
          return true;
        });

        if (substantiveSections.length > 0) {
          const acts: FIRActSectionEntry[] = substantiveSections.map((s: any, idx: number) => {
            let actName = s.actTitle || s.actShortName || "Bharatiya Nyaya Sanhita, 2023 (BNS)";
            if (actName.toUpperCase().includes("BNS")) actName = "BHARATIYA NYAYA SANHITA, 2023";
            const rawSec = (s.sectionNumber || "").replace(/^Sec(tion)?\.?\s*/i, "").trim();
            return {
              id: `act-pre-${idx}`,
              srNo: idx + 1,
              act: actName,
              sections: rawSec,
            };
          });
          setActsAndSectionsList(acts);
        } else if (c.firSections) {
          const cleanSections = c.firSections
            .replace(/BNSS\s*\d+(\(\d+\))?/gi, "")
            .replace(/^Sec(tion)?\.?\s*/i, "")
            .split(/[,;]/)
            .map((s: string) => s.trim().replace(/^Sec(tion)?\.?\s*/i, ""))
            .filter(Boolean);
          const sectionsList = cleanSections.length ? cleanSections : ["351(3)", "331(4)", "191(2)", "352", "3(5)"];
          setActsAndSectionsList(sectionsList.map((sec: string, idx: number) => ({
            id: `act-${idx + 1}`,
            srNo: idx + 1,
            act: "BHARATIYA NYAYA SANHITA, 2023",
            sections: sec,
          })));
        } else {
          const defaultSections = ["351(3)", "331(4)", "191(2)", "352", "3(5)"];
          setActsAndSectionsList(defaultSections.map((sec, idx) => ({
            id: `act-${idx + 1}`,
            srNo: idx + 1,
            act: "BHARATIYA NYAYA SANHITA, 2023",
            sections: sec,
          })));
        }
      } else if (c.firSections) {
        const cleanSections = c.firSections
          .replace(/BNSS\s*\d+(\(\d+\))?/gi, "")
          .replace(/^Sec(tion)?\.?\s*/i, "")
          .split(/[,;]/)
          .map((s: string) => s.trim().replace(/^Sec(tion)?\.?\s*/i, ""))
          .filter(Boolean);
        const sectionsList = cleanSections.length ? cleanSections : ["351(3)", "331(4)", "191(2)", "352", "3(5)"];
        setActsAndSectionsList(sectionsList.map((sec: string, idx: number) => ({
          id: `act-${idx + 1}`,
          srNo: idx + 1,
          act: "BHARATIYA NYAYA SANHITA, 2023",
          sections: sec,
        })));
      } else {
        const defaultSections = ["351(3)", "331(4)", "191(2)", "352", "3(5)"];
        setActsAndSectionsList(defaultSections.map((sec, idx) => ({
          id: `act-${idx + 1}`,
          srNo: idx + 1,
          act: "BHARATIYA NYAYA SANHITA, 2023",
          sections: sec,
        })));
      }
    }

    // Occurrence prefill
    setOccurrencesList([
      {
        id: "occ-1",
        srNo: 1,
        day: weekdayForDate(c.incidentDate || getTodayIsoIST()),
        dateFrom: c.incidentDate || getTodayIsoIST(),
        dateTo: c.incidentDate || getTodayIsoIST(),
        timeFrom: c.incidentTime || "10:00",
        timeTo: "12:00",
        timePeriod: getFirTimePeriod(c.incidentTime || "10:00"),
        infoReceivedDate: getTodayIsoIST(),
        infoReceivedTime: new Date().toTimeString().slice(0, 5),
        directionFromPs: "",
        distanceKm: "",
        area: c.incidentPlace || "Commercial Area",
        city: c.complainantCity || "Panipat",
        beatNo: "",
        isKnownDate: true,
        isForestPlace: false,
      },
    ]);

    // Accused details mapping
    const rawAccused: any[] = Array.isArray(c.accusedList) && c.accusedList.length > 0
      ? c.accusedList
      : c.accusedName
      ? [{ name: c.accusedName, address: c.accusedAddress, phone: c.accusedPhone, alias: c.accusedAlias }]
      : [];

    if (rawAccused.length > 0) {
      const mappedAccused: ExtendedAccusedPerson[] = rawAccused.map((acc: any, index: number) => {
        const accName = (acc.name || "").trim();
        const nameParts = accName ? accName.split(/\s+/) : [];
        const isKnownAccused =
          c.isAccusedKnown !== false &&
          accName !== "Unknown Accused" &&
          accName !== "Accused is not known" &&
          acc.isKnown !== false;

        return {
          id: acc.id || `accused-cmp-${index + 1}-${Date.now()}`,
          name: accName || "Unknown Accused",
          firstName: nameParts[0] || "",
          middleName: nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : "",
          lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : "",
          alias: acc.alias || "",
          aliases: acc.alias ? [{ id: `alias-${index}`, aliasName: acc.alias }] : [],
          fatherName: acc.fatherName || acc.relativeName || (acc.alias && (acc.alias.includes("पुत्र") || acc.alias.includes("पत्नी") || acc.alias.includes("पुत्री")) ? acc.alias : ""),
          relativeName: acc.relativeName || acc.fatherName || "",
          relationType: acc.relationType || acc.relationWithComplainant || "Father",
          relationWithComplainant: acc.relationWithComplainant || "",
          gender: acc.gender || "Male",
          age: acc.age || "",
          mobile: acc.phone || acc.mobile || "",
          address: acc.address || "",
          addressesList: acc.address
            ? [{ id: `addr-${index}`, colony: acc.address, city: c.complainantCity || "Panipat", district: c.complainantDistrict || "Panipat", state: "Haryana", country: "India" }]
            : [],
          city: c.complainantCity || "Panipat",
          district: c.complainantDistrict || "Panipat",
          state: "Haryana",
          country: "India",
          isKnown: isKnownAccused,
          isIdentified: isKnownAccused,
          accusedType: isKnownAccused ? "Known" : "Unknown-Seen",
          status: "SUSPECT",
          custodyStatus: "SUSPECT",
        };
      });

      setAccusedList(mappedAccused);
      const anyKnown = mappedAccused.some((a) => a.isKnown !== false && a.accusedType !== "Unknown-Seen");
      setIsAccusedKnown(anyKnown);
    } else if (c.isAccusedKnown === false) {
      setIsAccusedKnown(false);
    }

    setAutoFilledFields((prev) => ({
      ...prev,
      complaintNumber: true,
      sourceOfComplaint: true,
      complainantFirstName: Boolean(names[0]),
      complainantLastName: Boolean(names.slice(1).join(" ")),
      complainantRelativeName: Boolean(c.complainantFatherSpouse || c.complainantRelativeName),
      complainantGender: true,
      complainantAge: Boolean(c.complainantAge),
      complainantMobile: Boolean(c.complainantMobile),
      permHouseNo: Boolean(c.complainantAddress),
      permCity: true,
      permDistrict: true,
      firContentText: Boolean(c.incidentDetails),
      briefFacts: Boolean(c.incidentDetails),
      actsAndSections: true,
      occurrence: true,
      occurrenceDate: Boolean(c.incidentDate),
      occurrenceTime: Boolean(c.incidentTime),
      occurrencePlace: Boolean(c.incidentPlace),
      occurrenceCity: true,
      accused: rawAccused.length > 0,
      ...(Boolean((c as any).gdEntryNumber) ? { gdEntryNumber: true } : {}),
    }));
  }, [isSho, isSuperior, isMhc]);

  // Search and auto-fill details from General Diary (Roznamcha Rukka / Criminal Case Entry)
  const handleSearchAndAutofillGD = async (targetGdNumber?: string) => {
    const query = (targetGdNumber || gdEntryNumber || "").trim();
    if (!query) {
      setShowGDLookupDialog(true);
      return;
    }

    try {
      const allGd = await GeneralDiaryService.getEntries();
      const cleanQ = query.toLowerCase();
      const found = allGd.find(
        (g) =>
          g.gdNumber.toLowerCase() === cleanQ ||
          g.id.toLowerCase() === cleanQ ||
          g.gdNumber.toLowerCase().includes(cleanQ)
      );

      if (!found) {
        const mockFound = MOCK_GD_ENTRIES.find((g) => g.gdNumber.toLowerCase().includes(cleanQ));
        if (!mockFound) {
          setShowGDLookupDialog(true);
          return;
        }
        setGdEntryNumber(mockFound.gdNumber);
        const parsedMock = parseGdActivityDateTime(`${mockFound.entryDate || ""} ${mockFound.entryTime || ""}`);
        if (parsedMock.dateIso) setGdDate(parsedMock.dateIso);
        if (parsedMock.time24) setGdTime(parsedMock.time24);
        if (mockFound.subject) {
          setActRemarks((prev) => (prev ? `${prev}; GD Ref: ${mockFound.subject}` : `GD Ref: ${mockFound.subject}`));
        }
        return;
      }

      // Found in General Diary
      setGdEntryNumber(found.gdNumber);
      const parsedGd = parseGdActivityDateTime(found.activityDateTime);
      if (parsedGd.dateIso) setGdDate(parsedGd.dateIso);
      if (parsedGd.time24) setGdTime(parsedGd.time24);

      const foundCaseType = found.caseType || found.relatedRecords?.caseType;
      if (foundCaseType) {
        setCaseType(foundCaseType);
      }

      const foundSectionsList = found.actsAndSectionsList || found.relatedRecords?.actsAndSectionsList;
      const foundSections = found.actsAndSections || found.relatedRecords?.actsAndSections;
      const foundMajorAct = found.majorAct || found.relatedRecords?.majorAct || "Bharatiya Nyaya Sanhita, 2023 (BNS)";
      if (foundSectionsList && Array.isArray(foundSectionsList) && foundSectionsList.length > 0) {
        setActsAndSectionsList(foundSectionsList);
        setActRemarks((prev) =>
          prev
            ? `${prev}; GD: ${found.gdNumber} (${found.typeDisplay})`
            : `GD: ${found.gdNumber} (${found.typeDisplay})`
        );
      } else if (foundSections) {
        setActsAndSectionsList([
          {
            id: `act-gd-${Date.now()}`,
            srNo: 1,
            act: foundMajorAct,
            sections: foundSections,
          },
        ]);
        setActRemarks((prev) =>
          prev
            ? `${prev}; GD: ${found.gdNumber} (${found.typeDisplay})`
            : `GD: ${found.gdNumber} (${found.typeDisplay})`
        );
      }

      // Resolve linked complaint
      let linkedCompNo = found.relatedRecords?.complaintNumber || complaintIdParam;
      if (!linkedCompNo) {
        const fullText = `${found.narrative} ${found.subject}`;
        const match = fullText.match(/(?:CMP-[A-Za-z0-9-]+|COMP\/[A-Za-z0-9/-]+|COMP-[A-Za-z0-9-]+)/i);
        if (match) {
          linkedCompNo = match[0];
        }
      }

      if (linkedCompNo) {
        let c = null;
        try {
          if (complaintIdParam) {
            c = await ComplaintService.getComplaintById(complaintIdParam);
          }
          if (!c) {
            c = await ComplaintService.getComplaintByNumber(linkedCompNo);
          }
          if (!c) {
            const allC = await ComplaintService.getComplaints();
            c =
              allC.find(
                (item) =>
                  item.id === linkedCompNo ||
                  item.complaintNumber === linkedCompNo ||
                  item.complaintNumber.toLowerCase().includes(linkedCompNo.toLowerCase())
              ) || null;
          }
        } catch {
          // ignore
        }

        if (c) {
          applyComplaintToFir(c, Boolean(foundSections || foundSectionsList));
          setAutoFilledFields((prev) => ({
            ...prev,
            gdEntryNumber: true,
            gdDate: true,
            gdTime: true,
          }));
        }
      } else {
        setFirContentText(found.narrative);
        setBriefFacts(found.narrative?.slice(0, 300) || "");
        setAutoFilledFields((prev) => ({
          ...prev,
          gdEntryNumber: true,
          gdDate: true,
          gdTime: true,
          actsAndSections: true,
        }));
      }
    } catch (err) {
      console.warn("GD Lookup error:", err);
    }
  };

  // Load Draft or Linked Complaint on Mount
  useEffect(() => {
    ActsService.getAllActsAsync()
      .then((acts) => {
        setUnifiedActs(getUnifiedActsCatalog(acts));
      })
      .catch(() => {});

    const initData = async () => {
      if (complaintIdParam) {
        try {
          const c = await ComplaintService.getComplaintById(complaintIdParam);
          if (c) {
            applyComplaintToFir(c);
          }
        } catch (e) {
          console.warn("Prefill error:", e);
        }
      }

      if (gdNumberParam) {
        await handleSearchAndAutofillGD(gdNumberParam);
      }

      // Auto-restore draft on mount if available (for current complaint, GD, or general)
      const savedDraft = typeof firService?.getFirDraft === "function" ? firService.getFirDraft(draftKey) : null;

      if (savedDraft && savedDraft.savedAt) {
        applyDraftData(savedDraft);
      }

      setIsDraftLoaded(true);
    };

    initData();
  }, [complaintIdParam, gdNumberParam, draftKey, applyComplaintToFir]);

  const hasData = Boolean(
      gdEntryNumber ||
      complaintNumber ||
      complainantFirstName ||
      complainantLastName ||
      complainantMobile ||
      firContentText ||
      briefFacts ||
      actsAndSectionsList.length > 0 ||
      occurrencesList.length > 0 ||
      victimsList.length > 0 ||
      accusedList.length > 0 ||
      propertiesList.length > 0
    );

  // Synchronous auto-save right before page unload (preserves data even on hard refresh Ctrl+F5)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isDraftLoaded && hasData && !draftFinalized.current && latestDraftRef.current) {
        try {
          firService.saveFirDraft(latestDraftRef.current, draftKey);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDraftLoaded, draftKey, hasData]);

  // Continuous auto-save with 700ms debounce whenever any field is filled or updated
  useEffect(() => {
    if (!isDraftLoaded) return;

    if (!hasData) return;

    const timer = setTimeout(() => {
      handleSaveDraft(true);
    }, 700);

    return () => clearTimeout(timer);
  }, [
    isDraftLoaded,
    state,
    district,
    policeStation,
    firDate,
    firTime,
    activeTab,
    gdEntryNumber,
    caseType,
    gdDate,
    gdTime,
    sourceOfComplaint,
    complaintNumber,
    isHeinousCrime,
    isSensitiveFIR,
    originalDateTime,
    actRemarks,
    typeOfInfo,
    selectedActId,
    currentAct,
    actsAndSectionsList,
    majorMinorHeadsList,
    autoFilledFields,
    occurrencesList,
    complainantUid,
    complainantFirstName,
    complainantMiddleName,
    complainantLastName,
    complainantAliases,
    complainantGender,
    complainantMaritalStatus,
    complainantCategory,
    complainantMobile,
    complainantLandline,
    complainantEmail,
    complainantRelationType,
    complainantRelativeName,
    complainantRelativeAlias,
    complainantSameAsVictim,
    complainantDob,
    complainantYearOfBirth,
    complainantAge,
    complainantAgeMonths,
    complainantAgeRange,
    permHouseNo,
    permStreet,
    permColony,
    permCity,
    permTehsil,
    permCountry,
    permState,
    permDistrict,
    permPs,
    permPincode,
    presentSameAsPerm,
    presHouseNo,
    presStreet,
    presColony,
    presCity,
    presTehsil,
    presPs,
    presDistrict,
    presState,
    presPincode,
    presAddressFull,
    complainantOccupation,
    complainantNationality,
    passportNumber,
    passportIssueDate,
    passportIssuePlace,
    identificationsList,
    firContentText,
    briefFacts,
    reasonsForDelay,
    uploadedContentFiles,
    isSecretFir,
    actionType,
    assignedIoId,
    refusedReason,
    transferredPs,
    transferredDistrict,
    assignedDirections,
    departmentList,
    inquestReportNo,
    courtDispatchDateTime,
    roacConfirmed,
    freeCopyGiven,
    victimsList,
    isAccusedKnown,
    accusedMoreThan,
    accusedList,
    propertiesList,
    countDeceased,
    countSeriouslyHurt,
    countSimpleHurt,
    countNonInjured,
    injuryDescription,
    weaponUsed,
    videoFootageAvailable,
    uploadedMedicalDocs,
    signatureCanvasDrawn,
    officerName,
    officerRank,
    officerNumber,
  ]);

  // Construct complete snapshot of all fields across all 10 tabs
  const buildCurrentDraft = () => {
    return {
      state,
      district,
      policeStation,
      firDate,
      firTime,
      activeTab,
      gdEntryNumber,
      caseType,
      gdDate,
      gdTime,
      sourceOfComplaint,
      complaintNumber,
      isHeinousCrime,
      isSensitiveFIR,
      originalDateTime,
      actRemarks,
      typeOfInfo,
      selectedActId,
      currentAct,
      actsAndSectionsList,
      majorMinorHeadsList,
      autoFilledFields,
      occurrencesList,
      complainantUid,
      complainantFirstName,
      complainantMiddleName,
      complainantLastName,
      complainantAliases,
      complainantGender,
      complainantMaritalStatus,
      complainantCategory,
      complainantMobile,
      complainantLandline,
      complainantEmail,
      complainantRelationType,
      complainantRelativeName,
      complainantRelativeAlias,
      complainantSameAsVictim,
      complainantDob,
      complainantYearOfBirth,
      complainantAge,
      complainantAgeMonths,
      complainantAgeRange,
      permHouseNo,
      permStreet,
      permColony,
      permCity,
      permTehsil,
      permCountry,
      permState,
      permDistrict,
      permPs,
      permPincode,
      presentSameAsPerm,
      presHouseNo,
      presStreet,
      presColony,
      presCity,
      presTehsil,
      presPs,
      presDistrict,
      presState,
      presPincode,
      presAddressFull,
      complainantOccupation,
      complainantNationality,
      passportNumber,
      passportIssueDate,
      passportIssuePlace,
      identificationsList,
      firContentText,
      briefFacts,
      reasonsForDelay,
      uploadedContentFiles,
      isSecretFir,
      actionType,
      assignedIoId,
      refusedReason,
      transferredPs,
      transferredDistrict,
      assignedDirections,
      departmentList,
      inquestReportNo,
      courtDispatchDateTime,
      roacConfirmed,
      freeCopyGiven,
      victimsList,
      isAccusedKnown,
      accusedMoreThan,
      accusedList,
      propertiesList,
      countDeceased,
      countSeriouslyHurt,
      countSimpleHurt,
      countNonInjured,
      injuryDescription,
      weaponUsed,
      videoFootageAvailable,
      uploadedMedicalDocs,
      signatureCanvasDrawn,
      officerName,
      officerRank,
      officerNumber,
      savedAt: new Date().toISOString(),
    };
  };

  // Keep a reference to latest draft object so auto-save & beforeunload never suffer from stale closures
  const latestDraftRef = useRef<any>(null);
  latestDraftRef.current = buildCurrentDraft();

  // Comprehensively apply saved draft fields to states
  const applyDraftData = (draft: any) => {
    if (!draft) return;
    try {
      if (draft.state) setState(draft.state);
      if (draft.district) setDistrict(draft.district);
      if (draft.policeStation) setPoliceStation(draft.policeStation);
      if (draft.firDate) setFirDate(draft.firDate);
      if (draft.firTime) setFirTime(draft.firTime);
      if (draft.gdEntryNumber !== undefined) setGdEntryNumber(draft.gdEntryNumber);
      if (draft.caseType) setCaseType(draft.caseType);
      if (draft.gdDate) setGdDate(draft.gdDate);
      if (draft.gdTime) setGdTime(draft.gdTime);
      if (draft.sourceOfComplaint) setSourceOfComplaint(draft.sourceOfComplaint);
      if (draft.complaintNumber !== undefined) setComplaintNumber(draft.complaintNumber);
      if (draft.isHeinousCrime !== undefined) setIsHeinousCrime(draft.isHeinousCrime);
      if (draft.isSensitiveFIR !== undefined) setIsSensitiveFIR(draft.isSensitiveFIR);
      if (draft.originalDateTime !== undefined) setOriginalDateTime(draft.originalDateTime);
      if (draft.actRemarks !== undefined) setActRemarks(draft.actRemarks);
      if (draft.typeOfInfo) setTypeOfInfo(draft.typeOfInfo);
      if (draft.selectedActId) setSelectedActId(draft.selectedActId);
      if (draft.currentAct) setCurrentAct(draft.currentAct);
      if (Array.isArray(draft.actsAndSectionsList)) setActsAndSectionsList(draft.actsAndSectionsList);
      if (Array.isArray(draft.majorMinorHeadsList)) setMajorMinorHeadsList(draft.majorMinorHeadsList);
      if (draft.autoFilledFields) setAutoFilledFields(draft.autoFilledFields);

      if (Array.isArray(draft.occurrencesList)) setOccurrencesList(draft.occurrencesList);

      if (draft.complainantUid !== undefined) setComplainantUid(draft.complainantUid);
      if (draft.complainantFirstName !== undefined) setComplainantFirstName(draft.complainantFirstName);
      if (draft.complainantMiddleName !== undefined) setComplainantMiddleName(draft.complainantMiddleName);
      if (draft.complainantLastName !== undefined) setComplainantLastName(draft.complainantLastName);
      if (Array.isArray(draft.complainantAliases)) setComplainantAliases(draft.complainantAliases);
      if (draft.complainantGender !== undefined) setComplainantGender(draft.complainantGender);
      if (draft.complainantMaritalStatus !== undefined) setComplainantMaritalStatus(draft.complainantMaritalStatus);
      if (draft.complainantCategory !== undefined) setComplainantCategory(draft.complainantCategory);
      if (draft.complainantMobile !== undefined) setComplainantMobile(draft.complainantMobile);
      if (draft.complainantLandline !== undefined) setComplainantLandline(draft.complainantLandline);
      if (draft.complainantEmail !== undefined) setComplainantEmail(draft.complainantEmail);
      if (draft.complainantRelationType !== undefined) setComplainantRelationType(draft.complainantRelationType);
      if (draft.complainantRelativeName !== undefined) setComplainantRelativeName(draft.complainantRelativeName);
      if (draft.complainantRelativeAlias !== undefined) setComplainantRelativeAlias(draft.complainantRelativeAlias);
      if (draft.complainantSameAsVictim !== undefined) setComplainantSameAsVictim(draft.complainantSameAsVictim);
      if (draft.complainantDob !== undefined) setComplainantDob(draft.complainantDob);
      if (draft.complainantYearOfBirth !== undefined) setComplainantYearOfBirth(draft.complainantYearOfBirth);
      if (draft.complainantAge !== undefined) setComplainantAge(draft.complainantAge);
      if (draft.complainantAgeMonths !== undefined) setComplainantAgeMonths(draft.complainantAgeMonths);
      if (draft.complainantAgeRange !== undefined) setComplainantAgeRange(draft.complainantAgeRange);

      if (draft.permHouseNo !== undefined) setPermHouseNo(draft.permHouseNo);
      if (draft.permStreet !== undefined) setPermStreet(draft.permStreet);
      if (draft.permColony !== undefined) setPermColony(draft.permColony);
      if (draft.permCity !== undefined) setPermCity(draft.permCity);
      if (draft.permTehsil !== undefined) setPermTehsil(draft.permTehsil);
      if (draft.permCountry !== undefined) setPermCountry(draft.permCountry);
      if (draft.permState !== undefined) setPermState(draft.permState);
      if (draft.permDistrict !== undefined) setPermDistrict(draft.permDistrict);
      if (draft.permPs !== undefined) setPermPs(draft.permPs);
      if (draft.permPincode !== undefined) setPermPincode(draft.permPincode);
      if (draft.presentSameAsPerm !== undefined) setPresentSameAsPerm(draft.presentSameAsPerm);
      if (draft.presHouseNo !== undefined) setPresHouseNo(draft.presHouseNo);
      if (draft.presStreet !== undefined) setPresStreet(draft.presStreet);
      if (draft.presColony !== undefined) setPresColony(draft.presColony);
      if (draft.presCity !== undefined) setPresCity(draft.presCity);
      if (draft.presTehsil !== undefined) setPresTehsil(draft.presTehsil);
      if (draft.presPs !== undefined) setPresPs(draft.presPs);
      if (draft.presDistrict !== undefined) setPresDistrict(draft.presDistrict);
      if (draft.presState !== undefined) setPresState(draft.presState);
      if (draft.presPincode !== undefined) setPresPincode(draft.presPincode);
      if (draft.presAddressFull !== undefined) setPresAddressFull(draft.presAddressFull);

      if (draft.complainantOccupation !== undefined) setComplainantOccupation(draft.complainantOccupation);
      if (draft.complainantNationality !== undefined) setComplainantNationality(draft.complainantNationality);
      if (draft.passportNumber !== undefined) setPassportNumber(draft.passportNumber);
      if (draft.passportIssueDate !== undefined) setPassportIssueDate(draft.passportIssueDate);
      if (draft.passportIssuePlace !== undefined) setPassportIssuePlace(draft.passportIssuePlace);
      if (Array.isArray(draft.identificationsList)) setIdentificationsList(draft.identificationsList);

      if (draft.firContentText !== undefined) setFirContentText(draft.firContentText);
      if (draft.briefFacts !== undefined) setBriefFacts(draft.briefFacts);
      if (draft.reasonsForDelay !== undefined) setReasonsForDelay(draft.reasonsForDelay);
      if (Array.isArray(draft.uploadedContentFiles)) setUploadedContentFiles(draft.uploadedContentFiles);

      if (draft.isSecretFir !== undefined) setIsSecretFir(draft.isSecretFir);
      if (draft.actionType !== undefined) setActionType(draft.actionType);
      if (draft.assignedIoId !== undefined) setAssignedIoId(draft.assignedIoId);
      if (draft.refusedReason !== undefined) setRefusedReason(draft.refusedReason);
      if (draft.transferredPs !== undefined) setTransferredPs(draft.transferredPs);
      if (draft.transferredDistrict !== undefined) setTransferredDistrict(draft.transferredDistrict);
      if (draft.assignedDirections !== undefined) setAssignedDirections(draft.assignedDirections);
      if (Array.isArray(draft.departmentList)) setDepartmentList(draft.departmentList);
      if (draft.inquestReportNo !== undefined) setInquestReportNo(draft.inquestReportNo);
      if (draft.courtDispatchDateTime !== undefined) setCourtDispatchDateTime(draft.courtDispatchDateTime);
      if (draft.roacConfirmed !== undefined) setRoacConfirmed(draft.roacConfirmed);
      if (draft.freeCopyGiven !== undefined) setFreeCopyGiven(draft.freeCopyGiven);

      if (Array.isArray(draft.victimsList)) setVictimsList(draft.victimsList);

      if (draft.isAccusedKnown !== undefined) setIsAccusedKnown(draft.isAccusedKnown);
      if (draft.accusedMoreThan !== undefined) setAccusedMoreThan(draft.accusedMoreThan);
      if (Array.isArray(draft.accusedList) && draft.accusedList.length > 0) {
        setAccusedList(draft.accusedList);
      }

      if (Array.isArray(draft.propertiesList)) setPropertiesList(draft.propertiesList);
      if (draft.countDeceased !== undefined) setCountDeceased(draft.countDeceased);
      if (draft.countSeriouslyHurt !== undefined) setCountSeriouslyHurt(draft.countSeriouslyHurt);
      if (draft.countSimpleHurt !== undefined) setCountSimpleHurt(draft.countSimpleHurt);
      if (draft.countNonInjured !== undefined) setCountNonInjured(draft.countNonInjured);
      if (draft.injuryDescription !== undefined) setInjuryDescription(draft.injuryDescription);
      if (draft.weaponUsed !== undefined) setWeaponUsed(draft.weaponUsed);
      if (draft.videoFootageAvailable !== undefined) setVideoFootageAvailable(draft.videoFootageAvailable);
      if (Array.isArray(draft.uploadedMedicalDocs)) setUploadedMedicalDocs(draft.uploadedMedicalDocs);

      if (draft.signatureCanvasDrawn !== undefined) setSignatureCanvasDrawn(draft.signatureCanvasDrawn);
      if (draft.officerName) setOfficerName(draft.officerName);
      if (draft.officerRank) setOfficerRank(draft.officerRank);
      if (draft.officerNumber) setOfficerNumber(draft.officerNumber);

      if (draft.activeTab) setActiveTab((draft.activeTab as string) === "signature" ? "property" : draft.activeTab);

      if (draft.savedAt) {
        const timeStr = new Date(draft.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setLastSavedTime(timeStr);
        setDraftRestoredNotice(`Draft automatically restored from ${timeStr}`);
      }
    } catch (e) {
      console.error("Failed to apply draft data:", e);
    }
  };

  // Save draft action (silent for auto-save, with notification for manual button)
  const handleSaveDraft = (isAuto: boolean | React.MouseEvent = false) => {
    if (draftFinalized.current) return;
    const isAutoSave = typeof isAuto === "boolean" ? isAuto : false;
    try {
      const snap = latestDraftRef.current || buildCurrentDraft();
      firService.saveFirDraft(snap, draftKey);
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setLastSavedTime(timeStr);
      setDraftSaveError("");
      if (!isAutoSave) {
        setSaveDraftFeedback(`Draft saved at ${timeStr}`);
        setTimeout(() => setSaveDraftFeedback(null), 3000);
      }
    } catch {
      setSaveDraftFeedback(null);
      setLastSavedTime(null);
      setDraftSaveError("Draft could not be saved on this device. Keep this page open and retry Save Draft.");
    }
  };

  // Restore draft action (manual button trigger)
  const handleRestoreDraft = () => {
    const draft = typeof firService?.getFirDraft === "function" ? firService.getFirDraft(draftKey) : null;
    if (draft) {
      applyDraftData(draft);
      setSaveDraftFeedback("Draft restored successfully!");
      setTimeout(() => setSaveDraftFeedback(null), 3000);
    }
  };

  // Discard draft action
  const handleDiscardDraft = () => {
    handleClearAll();
  };

  // Apply auto-fill from uploaded and processed complaint document
  const handleApplyAutoFill = (record: ProcessedFIRDocumentRecord) => {
    const data = record.processedData;
    if (!data) return;

    const newlyFilled: Record<string, boolean> = {};

    if (data.state?.trim()) { setState(data.state.trim()); newlyFilled.state = true; }
    if (data.district?.trim()) { setDistrict(data.district.trim()); newlyFilled.district = true; }
    if (data.policeStation?.trim()) { setPoliceStation(data.policeStation.trim()); newlyFilled.policeStation = true; }

    if (data.gdEntryNumber?.trim()) { setGdEntryNumber(data.gdEntryNumber.trim()); newlyFilled.gdEntryNumber = true; }
    if (data.gdDate?.trim()) { setGdDate(data.gdDate.trim()); newlyFilled.gdDate = true; }
    if (data.gdTime?.trim()) { setGdTime(data.gdTime.trim()); newlyFilled.gdTime = true; }
    if (data.sourceOfComplaint?.trim()) { setSourceOfComplaint(data.sourceOfComplaint.trim()); newlyFilled.sourceOfComplaint = true; }
    if (data.complaintNumber?.trim()) { setComplaintNumber(data.complaintNumber.trim()); newlyFilled.complaintNumber = true; }

    // Complainant - only set fields explicitly extracted
    if (data.complainant) {
      if (data.complainant.firstName?.trim()) { setComplainantFirstName(data.complainant.firstName.trim()); newlyFilled.complainantFirstName = true; }
      if (data.complainant.middleName?.trim()) { setComplainantMiddleName(data.complainant.middleName.trim()); newlyFilled.complainantMiddleName = true; }
      if (data.complainant.lastName?.trim()) { setComplainantLastName(data.complainant.lastName.trim()); newlyFilled.complainantLastName = true; }
      if (data.complainant.fatherOrSpouse?.trim()) { setComplainantRelativeName(data.complainant.fatherOrSpouse.trim()); newlyFilled.complainantRelativeName = true; }
      if (data.complainant.relationType?.trim()) { setComplainantRelationType(data.complainant.relationType.trim()); newlyFilled.complainantRelationType = true; }
      if (data.complainant.mobile?.trim()) { setComplainantMobile(data.complainant.mobile.trim()); newlyFilled.complainantMobile = true; }
      if (data.complainant.gender?.trim()) { setComplainantGender(data.complainant.gender.trim()); newlyFilled.complainantGender = true; }
      if (data.complainant.age?.trim()) { setComplainantAge(data.complainant.age.trim()); newlyFilled.complainantAge = true; }
      if (data.complainant.houseNo?.trim()) { setPermHouseNo(data.complainant.houseNo.trim()); newlyFilled.permHouseNo = true; }
      if (data.complainant.city?.trim()) { setPermCity(data.complainant.city.trim()); newlyFilled.permCity = true; }
      if (data.complainant.district?.trim()) { setPermDistrict(data.complainant.district.trim()); newlyFilled.permDistrict = true; }
      if (data.complainant.state?.trim()) { setPermState(data.complainant.state.trim()); newlyFilled.permState = true; }
    }

    // Incident / Occurrence - strictly populate only what is present in document
    if (data.occurrence) {
      const hasOccurrenceData = Boolean(
        data.occurrence.place?.trim() ||
        data.occurrence.dateFrom?.trim() ||
        data.occurrence.timeFrom?.trim() ||
        data.occurrence.distanceKm?.trim() ||
        data.occurrence.directionFromPs?.trim() ||
        data.occurrence.landmark?.trim() ||
        data.occurrence.beatNo?.trim()
      );

      if (hasOccurrenceData) {
        const occItem: ExtendedFIROccurrenceItem = {
          id: `occ-${Date.now()}`,
          dateFrom: data.occurrence.dateFrom?.trim() || "",
          dateTo: data.occurrence.dateTo?.trim() || data.occurrence.dateFrom?.trim() || "",
          timeFrom: data.occurrence.timeFrom?.trim() || "",
          timeTo: data.occurrence.timeTo?.trim() || "",
          day: "",
          directionFromPs: data.occurrence.directionFromPs?.trim() || "",
          distanceKm: data.occurrence.distanceKm?.trim() || "",
          area: data.occurrence.place?.trim() || "",
          city: data.district?.trim() || district,
          beatNo: data.occurrence.beatNo?.trim() || "",
          landmark: data.occurrence.landmark?.trim() || "",
        };
        setOccurrencesList([occItem]);
        newlyFilled.occurrence = true;
        if (data.occurrence.dateFrom?.trim()) newlyFilled.occurrenceDate = true;
        if (data.occurrence.timeFrom?.trim()) newlyFilled.occurrenceTime = true;
        if (data.occurrence.place?.trim()) newlyFilled.occurrencePlace = true;
        newlyFilled.occurrenceCity = true;
        if (data.occurrence.directionFromPs?.trim()) newlyFilled.directionFromPs = true;
        if (data.occurrence.distanceKm?.trim()) newlyFilled.distanceKm = true;
        if (data.occurrence.beatNo?.trim()) newlyFilled.beatNo = true;
        if (data.occurrence.landmark?.trim()) newlyFilled.landmark = true;
      }
    }

    // Accused - strictly populate only named/identified accused from document
    if (data.accusedList && data.accusedList.length > 0) {
      const validAccused = data.accusedList.filter((a) => a.name && a.name.trim().length > 0);
      if (validAccused.length > 0) {
        const formattedAccused: ExtendedAccusedPerson[] = validAccused.map((a, idx) => ({
          id: a.id || `acc-${Date.now()}-${idx}`,
          name: a.name.trim(),
          relativeName: a.relativeName?.trim() || "",
          gender: (a.gender as any) || "Unknown",
          age: a.age?.trim() || "",
          address: a.address?.trim() || "",
          phone: a.phone?.trim() || "",
          physicalDescription: a.physicalDescription?.trim() || "",
          isKnown: Boolean(a.isIdentified),
          isIdentified: Boolean(a.isIdentified),
          status: "Suspect",
        }));
        setAccusedList(formattedAccused);
        setIsAccusedKnown(validAccused.some((a) => a.isIdentified));
        newlyFilled.accused = true;
      }
    }

    // FIR Content & Facts
    if (data.firContentText?.trim()) { setFirContentText(data.firContentText.trim()); newlyFilled.firContentText = true; }
    if (data.briefFacts?.trim()) { setBriefFacts(data.briefFacts.trim()); newlyFilled.briefFacts = true; }

    // Acts & Sections
    if (data.actsAndSections && data.actsAndSections.length > 0) {
      const formattedActs: FIRActSectionEntry[] = data.actsAndSections.map((item, idx) => ({
        id: `act-${Date.now()}-${idx}`,
        act: item.act.trim(),
        sections: item.sections.trim(),
      }));
      setActsAndSectionsList(formattedActs);
      newlyFilled.actsAndSections = true;
    }

    // Major / Minor Head
    if (data.majorHead?.trim()) { setCurrentMajorHead(data.majorHead.trim()); newlyFilled.majorHead = true; }
    if (data.minorHead?.trim()) { setCurrentMinorHead(data.minorHead.trim()); newlyFilled.minorHead = true; }

    setAutoFilledFields((prev) => ({ ...prev, ...newlyFilled }));

    setSaveDraftFeedback(
      `Document "${record.rawDocument.fileName}" processed & FIR Form auto-filled successfully! (Database Record Linked)`
    );
    setTimeout(() => setSaveDraftFeedback(null), 5000);
  };

  // Clear All Form Fields
  const handleClearAll = () => {
    setConfirmConfig({
      isOpen: true,
      title: "Clear All FIR Data?",
      description: `This will reset all ${TAB_CONFIG.length} tabs and erase all entered acts, occurrences, complainant details, and facts. This action cannot be reversed.`,
      variant: "danger",
      confirmLabel: "Yes, Clear All Fields",
      onConfirm: () => {
        discardDraft();
        onReset();
      },
    });
  };

  // Close / Exit Confirmation
  const handleCloseForm = () => {
    if (hasData) {
      setConfirmConfig({
        isOpen: true,
        title: "Discard Unsaved FIR Changes?",
        description: "You have unsaved information entered in this FIR registration form. Are you sure you want to close and return to the FIR list?",
        variant: "warning",
        confirmLabel: "Discard & Exit",
        onConfirm: () => {
          discardDraft();
          router.push("/fir");
        },
      });
    } else {
      discardDraft();
      router.push("/fir");
    }
  };

  // Reset Age Details
  const handleResetAge = () => {
    setComplainantDob("");
    setComplainantYearOfBirth("");
    setComplainantAge("");
    setComplainantAgeMonths("");
    setComplainantAgeRange("Not Specified");
  };

  const updateComplainantAgeRange = (calcAge: number) => {
    if (calcAge < 18) setComplainantAgeRange("Under 18 (Minor / Child)");
    else if (calcAge <= 30) setComplainantAgeRange("18 - 30 Years (Young Adult)");
    else if (calcAge <= 50) setComplainantAgeRange("31 - 50 Years (Middle Age)");
    else if (calcAge <= 60) setComplainantAgeRange("51 - 60 Years (Senior)");
    else setComplainantAgeRange("Above 60 Years (Elderly / Senior Citizen)");
  };

  const handleComplainantDobChange = (newDobIso: string) => {
    const todayIso = getNowLocal().date;
    let clampedDate = newDobIso;
    if (clampedDate && clampedDate > todayIso) {
      clampedDate = todayIso;
    }
    setComplainantDob(clampedDate);

    if (errors.complainantAge) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.complainantAge;
        return next;
      });
    }

    if (clampedDate) {
      const bDate = new Date(clampedDate);
      if (!isNaN(bDate.getTime())) {
        const birthYear = bDate.getFullYear();
        setComplainantYearOfBirth(String(birthYear));
        const today = new Date();
        let calcAge = today.getFullYear() - birthYear;
        const m = today.getMonth() - bDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) {
          calcAge--;
        }
        calcAge = Math.max(0, calcAge);
        setComplainantAge(String(calcAge));
        updateComplainantAgeRange(calcAge);
      }
    }
  };

  const handleComplainantYearChange = (yearStr: string) => {
    const cleanYear = yearStr.replace(/\D/g, "").slice(0, 4);
    const currentYear = new Date().getFullYear();
    let validYear = cleanYear;
    if (cleanYear.length === 4) {
      const numY = Number(cleanYear);
      if (numY > currentYear) {
        validYear = String(currentYear);
      } else if (numY < 1900) {
        validYear = "1900";
      }
    }
    setComplainantYearOfBirth(validYear);

    if (errors.complainantAge) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.complainantAge;
        return next;
      });
    }

    if (validYear.length === 4) {
      const yNum = Number(validYear);
      const today = new Date();
      const calcAge = Math.max(0, today.getFullYear() - yNum);
      setComplainantAge(String(calcAge));
      updateComplainantAgeRange(calcAge);

      if (complainantDob) {
        const parts = complainantDob.split("-");
        if (parts.length === 3) {
          const updatedDob = `${validYear}-${parts[1]}-${parts[2]}`;
          const todayIso = getNowLocal().date;
          setComplainantDob(updatedDob > todayIso ? todayIso : updatedDob);
        }
      } else {
        const defaultDob = `${validYear}-01-01`;
        const todayIso = getNowLocal().date;
        setComplainantDob(defaultDob > todayIso ? todayIso : defaultDob);
      }
    }
  };

  // Helper to compile all known complainant fields for autofilling victim info
  const getComplainantAsVictimData = () => {
    return {
      firstName: complainantFirstName,
      middleName: complainantMiddleName,
      lastName: complainantLastName,
      aliases: complainantAliases,
      gender: complainantGender,
      maritalStatus: complainantMaritalStatus,
      relationType: complainantRelationType,
      relativeName: complainantRelativeName,
      relativeAliasName: complainantRelativeAlias,
      mobile: complainantMobile,
      landline: complainantLandline,
      email: complainantEmail,
      category: complainantCategory,
      uid: complainantUid,
      dob: complainantDob,
      yearOfBirth: complainantYearOfBirth,
      ageYears: complainantAge,
      ageMonths: complainantAgeMonths,
      permHouseNo: permHouseNo,
      permStreet: permStreet,
      permColony: permColony,
      permCity: permCity,
      permTehsil: permTehsil,
      permCountry: permCountry,
      permState: permState,
      permDistrict: permDistrict,
      permPs: permPs,
      permPincode: permPincode,
      presentSameAsPerm: presentSameAsPerm,
      presHouseNo: presentSameAsPerm ? permHouseNo : presHouseNo,
      presStreet: presentSameAsPerm ? permStreet : presStreet,
      presColony: presentSameAsPerm ? permColony : presColony,
      presCity: presentSameAsPerm ? permCity : presCity,
      presTehsil: presentSameAsPerm ? permTehsil : presTehsil,
      presPs: presentSameAsPerm ? permPs : presPs,
      presDistrict: presentSameAsPerm ? permDistrict : presDistrict,
      presState: presentSameAsPerm ? permState : presState,
      presPincode: presentSameAsPerm ? permPincode : presPincode,
      occupation: complainantOccupation,
      nationality: complainantNationality,
    };
  };

  const handleToggleComplainantSameAsVictim = (checked: boolean) => {
    setComplainantSameAsVictim(checked);
    if (checked) {
      setVictimAutofillData(getComplainantAsVictimData());
      setVictimAutofillTrigger(Date.now());
    }
  };

  // Automatically keep Present Address in sync when presentSameAsPerm is checked
  useEffect(() => {
    if (presentSameAsPerm) {
      setPresHouseNo(permHouseNo);
      setPresStreet(permStreet);
      setPresColony(permColony);
      setPresCity(permCity);
      setPresTehsil(permTehsil);
      setPresPs(permPs);
      setPresDistrict(permDistrict);
      setPresState(permState);
      setPresPincode(permPincode);
    }
  }, [
    presentSameAsPerm,
    permHouseNo,
    permStreet,
    permColony,
    permCity,
    permTehsil,
    permPs,
    permDistrict,
    permState,
    permPincode,
  ]);

  // Keep Victim info updated when complainantSameAsVictim is active
  useEffect(() => {
    if (complainantSameAsVictim) {
      setVictimAutofillData(getComplainantAsVictimData());
      setVictimAutofillTrigger(Date.now());
    }
  }, [
    complainantSameAsVictim,
    complainantFirstName,
    complainantMiddleName,
    complainantLastName,
    complainantGender,
    complainantMobile,
    complainantDob,
    complainantAge,
    complainantAgeMonths,
    complainantYearOfBirth,
    complainantUid,
    permHouseNo,
    permStreet,
    permColony,
    permCity,
    permTehsil,
    permPs,
    permDistrict,
    permState,
    permPincode,
    presHouseNo,
    presStreet,
    presColony,
    presCity,
    presTehsil,
    presPs,
    presDistrict,
    presState,
    presPincode,
    presentSameAsPerm,
    complainantOccupation,
    complainantNationality,
    complainantRelationType,
    complainantRelativeName,
    complainantRelativeAlias,
    complainantCategory,
    complainantMaritalStatus,
    complainantLandline,
    complainantEmail,
  ]);

  // Validate Integer Hurt Count
  const handleHurtCountChange = (setter: (v: string) => void, val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) {
      setter("0");
    } else {
      setter(String(num));
    }
  };

  // Canvas Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.strokeStyle = "#0b192c";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
    setSignatureCanvasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureCanvasDrawn(false);
  };

  // Tab 1 Inline Act & Section Helpers
  const handleSelectAct = (actId: string) => {
    setSelectedActId(actId);
    const found = unifiedActs.find((a) => a.id === actId);
    if (found) setCurrentAct(found.name);
    setSelectedSections([]);
    setSectionSearchQuery("");
  };

  const handleToggleSection = (secNum: string) => {
    setSelectedSections((prev) =>
      prev.includes(secNum) ? prev.filter((s) => s !== secNum) : [...prev, secNum]
    );
  };

  const handleAddCustomSection = (rawInput: string) => {
    const trimmed = rawInput.trim().replace(/^Sec(tion)?\.?\s*/i, "");
    if (!trimmed) return;
    if (!selectedSections.includes(trimmed)) {
      setSelectedSections((prev) => [...prev, trimmed]);
    }
    setSectionSearchQuery("");
  };

  const handleAddActSectionInline = () => {
    const finalSections = [...selectedSections];
    if (sectionSearchQuery.trim()) {
      const typed = sectionSearchQuery.trim().replace(/^Sec(tion)?\.?\s*/i, "");
      if (typed && !finalSections.includes(typed)) finalSections.push(typed);
    } else if (currentSection.trim()) {
      const parts = currentSection
        .split(",")
        .map((s) => s.trim().replace(/^Sec(tion)?\.?\s*/i, ""))
        .filter(Boolean);
      for (const p of parts) {
        if (!finalSections.includes(p)) finalSections.push(p);
      }
    }

    if (finalSections.length === 0) {
      alert("Please select or type at least one section number for this Act.");
      return;
    }

    const currentActObj = unifiedActs.find((a) => a.id === selectedActId);
    const actName = currentActObj?.name || currentAct;

    const newEntry: FIRActSectionEntry = {
      id: `act-${Date.now()}`,
      srNo: actsAndSectionsList.length + 1,
      act: actName,
      sections: finalSections.join(", "),
    };
    setActsAndSectionsList([...actsAndSectionsList, newEntry]);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.act_section;
      return next;
    });
    setSelectedSections([]);
    setSectionSearchQuery("");
    setCurrentSection("");
    setIsSectionDropdownOpen(false);
  };

  // Major / Minor Head helpers
  const handleAddMajorMinorHead = () => {
    if (!currentMinorHead) return;
    const newEntry: FIRMajorMinorHeadEntry = {
      id: `head-${Date.now()}`,
      srNo: majorMinorHeadsList.length + 1,
      majorHead: currentMajorHead,
      minorHead: currentMinorHead,
    };
    setMajorMinorHeadsList([...majorMinorHeadsList, newEntry]);
  };

  // Complainant Aliases & IDs helpers
  const handleAddAlias = () => {
    if (!tempAlias.trim()) return;
    setComplainantAliases([
      ...complainantAliases,
      { id: `alias-${Date.now()}`, aliasName: tempAlias.trim() },
    ]);
    setTempAlias("");
  };

  const handleAddIdentification = () => {
    if (!tempIdNumber.trim()) return;
    setIdentificationsList([
      ...identificationsList,
      { id: `id-${Date.now()}`, idType: tempIdType, idNumber: tempIdNumber.trim() },
    ]);
    setTempIdNumber("");
  };

  // Department Table helpers (Tab 5)
  const handleAddDepartment = () => {
    if (!tempDeptName.trim()) return;
    setDepartmentList([
      ...departmentList,
      {
        id: `dept-${Date.now()}`,
        departmentName: tempDeptName.trim(),
        departmentEmail: tempDeptEmail.trim(),
      },
    ]);
    setTempDeptName("");
    setTempDeptEmail("");
  };

  // Link Complainant as Victim (Tab 6 / Tab 3)
  const handleLinkComplainantAsVictim = () => {
    handleToggleComplainantSameAsVictim(true);
    const compVictim: VictimItemData = {
      id: `vic-${Date.now()}`,
      srNo: victimsList.length + 1,
      name: `${complainantFirstName} ${complainantLastName}`.trim() || "Complainant",
      fullName: `${complainantFirstName} ${complainantLastName}`.trim() || "Complainant",
      firstName: complainantFirstName || "Complainant",
      lastName: complainantLastName || undefined,
      gender: complainantGender || "Male",
      victimClassification: "Adult",
      medicalExamRequiredForAge: false,
      permCity: permCity || "Panipat",
      permDistrict: permDistrict || "Panipat",
      permState: permState || "Haryana",
      permCountry: permCountry || "India",
      nationality: complainantNationality || "Indian",
      age: complainantAge || "Adult",
      victimType: "Complainant",
      address: permHouseNo ? `${permHouseNo}, ${permCity}, ${permDistrict}` : "As per Complainant Record",
      mobile: complainantMobile,
      relativeName: complainantRelativeName,
      statements: [],
    };
    setVictimsList([...victimsList, compVictim]);
  };

  // Property of Interest helpers (Tab 8)
  const handleAddProperty = () => {
    if (!tempPropDescription.trim()) {
      alert("Please enter property description.");
      return;
    }
    const newProp: FIRPropertyItem = {
      id: `prop-${Date.now()}`,
      srNo: propertiesList.length + 1,
      propertyCategory: tempPropCategory,
      propertyType: tempPropType || "Miscellaneous",
      natureOfProperty: tempPropNature === "select" ? "" : tempPropNature,
      description: tempPropDescription.trim(),
      estimatedValue: tempPropValue ? Number(tempPropValue) : 0,
    };
    setPropertiesList([...propertiesList, newProp]);
    setTempPropNature(NATURE_OF_PROPERTY_OPTIONS[0]);
    setTempPropDescription("");
    setTempPropValue("");
    setShowAddPropertyForm(false);
  };

  // Build full FIR object for Draft / Submit / Preview
  const buildCurrentFirItem = (forPreview = false): FIRItem => {
    const canAssignIo = (isSho || isSuperior) && !isMhc;
    const actsStr = actsAndSectionsList.map((a) => `${a.act}: ${a.sections}`).join("; ") || (forPreview ? "" : "Bharatiya Nyaya Sanhita, 2023 (BNS): 351(3), 331(4), 191(2), 352, 3(5)");
    const selectedOfficer = canAssignIo ? ioRoster.find((eo) => eo.id === assignedIoId) : undefined;

    const primaryOcc = occurrencesList[0] || (forPreview
      ? {
          dateFrom: "",
          dateTo: "",
          timeFrom: "",
          timeTo: "",
          day: "",
          timePeriod: "",
          directionFromPs: "",
          distanceKm: "",
          area: "",
          city: district,
          beatNo: "",
        }
      : {
          dateFrom: firDate,
          dateTo: firDate,
          timeFrom: "10:00",
          timeTo: "12:00",
          day: weekdayForDate(firDate),
          directionFromPs: "",
          distanceKm: "",
          area: "",
          city: district,
          beatNo: "",
        });

    const unitSlug = `${district || "haryana"}-${policeStation || "station"}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    return {
      id: `fir-${unitSlug}-${autoFirNumber.firNumber.replace(/\//g, "-")}`,
      firNumber: autoFirNumber.firNumber,
      firYear: autoFirNumber.firYear,
      firDate,
      firTime,
      policeStation,
      district,
      state,
      sourceComplaintId: linkedComplaint?.id,
      sourceComplaintNumber: linkedComplaint?.complaintNumber || complaintNumber,
      category: "GENERAL",
      categoryDisplay: majorMinorHeadsList[0]?.majorHead || (forPreview ? "" : "Cognizable Offence"),
      priority: isHeinousCrime ? "URGENT" : isSensitiveFIR ? "HIGH" : "NORMAL",
      status: "UNDER_INVESTIGATION",
      mainStatus: "Under Investigation",
      gdNumber: gdEntryNumber,
      gdEntryNumber,
      gdDate,
      gdTime,
      sourceOfComplaint,
      complaintNumber,
      isHeinousCrime,
      isSensitiveFIR,
      originalDateTime,
      isZeroFirTransferIn,
      originalZeroFirNumber: isZeroFirTransferIn ? originalZeroFirNumber : undefined,
      originalZeroFirPs: isZeroFirTransferIn ? originalZeroFirPs : undefined,
      originalZeroFirDistrict: isZeroFirTransferIn ? originalZeroFirDistrict : undefined,
      originalZeroFirDate: isZeroFirTransferIn ? originalZeroFirDate : undefined,
      remarks: isZeroFirTransferIn && originalZeroFirNumber
        ? `${actRemarks ? actRemarks + " | " : ""}Re-registered upon transfer from Zero FIR No. ${originalZeroFirNumber} (${originalZeroFirPs || "Other PS"}, ${originalZeroFirDistrict || ""})`
        : actRemarks,
      typeOfInformation: typeOfInfo,
      caseType,
      actsAndSections: actsStr,
      actsAndSectionsList,
      majorMinorHeadsList,
      occurrencesList,
      incidentDateFrom: primaryOcc.dateFrom,
      incidentDateTo: primaryOcc.dateTo,
      incidentTimeFrom: primaryOcc.timeFrom,
      incidentTimeTo: primaryOcc.timeTo,
      incidentDay: primaryOcc.day,
      incidentTimePeriod: getFirTimePeriod(primaryOcc.timeFrom),
      distanceFromPs: primaryOcc.distanceKm
        ? `${primaryOcc.distanceKm} KM ${primaryOcc.directionFromPs || ""}`.trim()
        : (primaryOcc.directionFromPs || ""),
      incidentPlace: primaryOcc.area || primaryOcc.city || "",
      incidentLandmark: primaryOcc.landmark,
      beatNumber: primaryOcc.beatNo,
      complainantName: `${complainantFirstName} ${complainantLastName}`.trim() || (forPreview ? "" : "Complainant"),
      complainantFatherSpouse: complainantRelativeName,
      complainantRelationType,
      complainantDob,
      complainantYearOfBirth,
      complainantAge: complainantAge ? Number(complainantAge) : undefined,
      complainantGender,
      complainantMaritalStatus,
      complainantCategory,
      complainantMobile,
      complainantEmail,
      complainantAddress: permHouseNo
        ? `${permHouseNo}, ${permStreet ? permStreet + ", " : ""}${permColony ? permColony + ", " : ""}${permCity}`
        : (forPreview ? "" : "Address on file"),
      complainantCity: permCity,
      complainantDistrict: permDistrict,
      complainantState: permState,
      complainantUid,
      complainantOccupation,
      complainantNationality,
      complainantPincode: permPincode,
      isAccusedKnown,
      accusedList,
      victimsList,
      propertiesList,
      totalPropertyEstimatedValue: propertiesList.reduce(
        (acc, p) => acc + (Number(p.estimatedValue) || 0),
        0
      ),
      firContentText: firContentText || briefFacts,
      incidentDetails: firContentText || briefFacts,
      reasonsForDelay,
      registeredBy: `${officerName} (${officerRank})`,
      assignedIoId: canAssignIo && actionType === "Investigation/Assign IO" ? selectedOfficer?.id : undefined,
      assignedIoPno: selectedOfficer?.pno,
      assignedIoName: canAssignIo
        ? (actionType === "Investigation/Assign IO"
            ? selectedOfficer?.name
            : actionType === "Self Investigation"
            ? officerName
            : undefined)
        : undefined,
      assignedIoRank: canAssignIo
        ? (actionType === "Investigation/Assign IO"
            ? selectedOfficer?.rank
            : actionType === "Self Investigation"
            ? officerRank
            : undefined)
        : undefined,
      assignedIoBeltNumber: canAssignIo
        ? (actionType === "Investigation/Assign IO"
            ? selectedOfficer?.beltNumber || selectedOfficer?.pno
            : actionType === "Self Investigation"
            ? officerNumber
            : undefined)
        : undefined,
      assignedIoPhone: canAssignIo && actionType === "Investigation/Assign IO" ? selectedOfficer?.phone : undefined,
      assignedDirections: canAssignIo ? assignedDirections : "",
      actionTakenData: {
        actionType,
        isSecretFir,
        directedIoId: actionType === "Investigation/Assign IO" ? selectedOfficer?.id : undefined,
        directedIoName:
          actionType === "Investigation/Assign IO"
            ? selectedOfficer?.name
            : actionType === "Self Investigation"
            ? officerName
            : undefined,
        directedIoRank:
          actionType === "Investigation/Assign IO"
            ? selectedOfficer?.rank
            : actionType === "Self Investigation"
            ? officerRank
            : undefined,
        directedIoBelt:
          actionType === "Investigation/Assign IO"
            ? selectedOfficer?.beltNumber || selectedOfficer?.pno
            : actionType === "Self Investigation"
            ? officerNumber
            : undefined,
        refusedReason,
        transferredPs,
        transferredDistrict,
        inquestReportNo,
        courtDispatchDateTime,
        roacConfirmed,
        freeCopyGiven,
      },
      signatureData: {
        officerInChargeName: officerName,
        officerInChargeRank: officerRank,
        officerInChargeNumber: officerNumber,
      },
      inquestReportNo,
      courtDispatchDateTime,
      daysPending: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };


  // Centralized Tab Validation Errors
  const getTabValidationErrors = (tabKey: MainTabKey): Record<string, string> => {
    const tabErrors: Record<string, string> = {};

    if (tabKey === "act_section") {
      const nowValidation = getNowLocal();
      if (!firDate) {
        tabErrors.firDate = "FIR Registration date is mandatory.";
      } else if (firDate > nowValidation.date) {
        tabErrors.firDate = "Registration date cannot be in the future.";
      }
      if (!firTime) {
        tabErrors.firTime = "FIR Registration time is mandatory.";
      } else if (firDate === nowValidation.date && firTime > nowValidation.time) {
        tabErrors.firTime = "Registration time cannot be ahead of current time.";
      }
      if (!gdDate) {
        tabErrors.gdDate = "GD Entry date is mandatory.";
      } else if (gdDate > nowValidation.date) {
        tabErrors.gdDate = "GD Entry date cannot be in the future.";
      }
      if (gdTime && gdDate >= nowValidation.date && gdTime > nowValidation.time) {
        tabErrors.gdTime = "GD Entry time cannot be ahead of current time.";
      }
      if (originalDateTime && originalDateTime > `${nowValidation.date}T${nowValidation.time}`) {
        tabErrors.originalDateTime = "Original Date & Time cannot be ahead of current time.";
      }
      if (!gdEntryNumber || !gdEntryNumber.trim()) {
        tabErrors.gdEntryNumber = "GD / SD / DD Number is mandatory.";
      }
      if (!sourceOfComplaint || !sourceOfComplaint.trim()) {
        tabErrors.sourceOfComplaint = "Source of Complaint is mandatory.";
      }
      if (!actRemarks.trim()) {
        tabErrors.actRemarks = "Remarks in Act & Section panel are mandatory.";
      }
      if (actsAndSectionsList.length === 0) {
        tabErrors.act_section = "At least one Act and Section must be added.";
      }
    }

    if (tabKey === "occurrence") {
      if (occurrencesList.length === 0) {
        tabErrors.occurrence = "At least one Occurrence entry must be recorded in the Occurrence list. (कृपया घटना स्थल फॉर्म भरकर 'Save / Record Occurrence' पर क्लिक करें।)";
      } else {
        const invalidOcc = occurrencesList.find(
          (occ) =>
            !occ.dateFrom?.trim() ||
            !occ.timeFrom?.trim() ||
            !occ.dateTo?.trim() ||
            !occ.timeTo?.trim() ||
            !occ.infoReceivedDate?.trim() ||
            !occ.infoReceivedTime?.trim() ||
            !occ.city?.trim() ||
            !occ.directionFromPs?.trim() ||
            !String(occ.distanceKm ?? "").trim() ||
            Number(occ.distanceKm) < 0
        );
        if (invalidOcc) {
          tabErrors.occurrence = "In Occurrence panel: Date/Time (From & To), Information Receipt Date/Time, Village/Town/City, Direction, and non-negative Distance from PS are mandatory.";
        } else {
          const todayStr = getNowLocal().date;
          const invertedDateOcc = occurrencesList.find(
            (occ) => occ.dateFrom && occ.dateTo && occ.dateFrom > occ.dateTo
          );
          if (invertedDateOcc) {
            tabErrors.occurrence = "Occurrence Date (From) cannot be after Date (To).";
          } else {
            const futureOcc = occurrencesList.find(
              (occ) => (occ.dateFrom && occ.dateFrom > todayStr) || (occ.dateTo && occ.dateTo > todayStr) || (occ.infoReceivedDate && occ.infoReceivedDate > todayStr)
            );
            if (futureOcc) {
              tabErrors.occurrence = "Occurrence dates and Information receipt date cannot be in the future.";
            }
          }
        }
      }
    }

    if (tabKey === "complainant") {
      if (!complainantFirstName.trim()) {
        tabErrors.complainant = "Complainant First Name is mandatory.";
        tabErrors.complainantFirstName = "Complainant First Name is mandatory.";
      }
      if (!complainantGender || !complainantGender.trim()) {
        tabErrors.complainantGender = "Complainant Gender is mandatory.";
      }
      if (!complainantDob?.trim() && !complainantAge?.trim() && !complainantYearOfBirth?.trim()) {
        tabErrors.complainantAge = "Age & Date of Birth Particulars (DOB or Age in Years) is mandatory.";
      }
      if (complainantDob && complainantDob > getNowLocal().date) {
        tabErrors.complainantAge = "Date of Birth cannot be in the future.";
      }
      if (complainantAge && Number(complainantAge) < 0) {
        tabErrors.complainantAge = "Age cannot be negative.";
      }
      if (!complainantMobile.trim()) {
        tabErrors.complainantMobile = "Complainant Mobile number is mandatory.";
      } else if (complainantMobile.trim().length !== 10) {
        tabErrors.complainantMobile = "Complainant Mobile number must be exactly 10 digits.";
      }
      if (!permDistrict || !permDistrict.trim()) {
        tabErrors.permDistrict = "Complainant District is mandatory in Address Details.";
      }
      if (!permState || !permState.trim()) {
        tabErrors.permState = "Complainant State is mandatory in Address Details.";
      }
      if (!complainantNationality || !complainantNationality.trim()) {
        tabErrors.complainantNationality = "Complainant Nationality is mandatory.";
      }
    }

    if (tabKey === "fir_content") {
      if (!firContentText.trim() && !briefFacts.trim()) {
        tabErrors.fir_content = "FIR Contents text is mandatory.";
        tabErrors.firContentText = "FIR Contents text is mandatory.";
      }
      if (isSho && actionType === "Investigation/Assign IO" && !ioRoster.some(officer => officer.id === assignedIoId)) {
        tabErrors.assignedIoId = "Select an eligible investigating officer.";
      }
      if (!actionType || !actionType.trim()) {
        tabErrors.actionType = "Action Taken by Station House Officer (SHO) is mandatory.";
      }
    }

    if (tabKey === "accused") {
      if (isAccusedKnown && accusedList.length > 0) {
        const invalidAccused = accusedList.find((acc) => {
          const isKnownAcc =
            acc.isKnown !== false &&
            acc.name !== "Accused is not known" &&
            acc.name !== "Unknown Accused" &&
            acc.accusedType !== "Unknown-Seen";
          if (!isKnownAcc) return false;
          const hasName = Boolean(acc.name?.trim());
          const hasGender = Boolean(acc.gender?.trim());
          const hasAge = Boolean(
            (acc.dob && acc.dob.trim()) ||
            (acc.yearOfBirth && acc.yearOfBirth.trim()) ||
            (acc.ageYears && acc.ageYears.trim()) ||
            (acc.ageRangeFrom && acc.ageRangeFrom.trim()) ||
            acc.age
          );
          const firstAddr = acc.addressesList?.[0];
          const hasCity = Boolean((acc.city && acc.city.trim()) || (firstAddr?.city && firstAddr.city.trim()));
          const hasDistrict = Boolean((acc.district && acc.district.trim()) || (firstAddr?.district && firstAddr.district.trim()));
          const hasState = Boolean((acc.state && acc.state.trim()) || (firstAddr?.state && firstAddr.state.trim()));
          const hasCountry = Boolean((acc.country && acc.country.trim()) || (firstAddr?.country && firstAddr.country.trim()));
          const hasNationality = Boolean(acc.nationality && acc.nationality.trim());
          return !hasName || !hasGender || !hasAge || !hasCity || !hasDistrict || !hasState || !hasCountry || !hasNationality;
        });
        if (invalidAccused) {
          tabErrors.accused = "In Accused panel: First Name, Gender, Age Determination, Village/Town/City, District, State, Country, and Country of Nationality are mandatory for known accused.";
        }
      }
    }

    return tabErrors;
  };

  // Full form validator (checks all tabs)
  const validateForm = (): boolean => {
    const combinedErrors: Record<string, string> = {};
    for (const tab of TAB_CONFIG) {
      const tabErrors = getTabValidationErrors(tab.key);
      Object.assign(combinedErrors, tabErrors);
    }

    setErrors(combinedErrors);

    if (Object.keys(combinedErrors).length > 0) {
      // Navigate to the first tab that has an error
      for (const tab of TAB_CONFIG) {
        const tabErrors = getTabValidationErrors(tab.key);
        if (Object.keys(tabErrors).length > 0) {
          setActiveTab(tab.key);
          break;
        }
      }
      return false;
    }
    return true;
  };

  // Final Submit Handler with Confirmation Dialog
  const handleInitiateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Only allow submission from the final tab
    if (currentTabIndex !== TAB_CONFIG.length - 1) {
      handleNextTab();
      return;
    }
    if (!validateForm()) return;

    setConfirmConfig({
      isOpen: true,
      title: "Confirm Statutory FIR Registration",
      description: `You are about to register FIR No. ${autoFirNumber.firNumber} under Section 173 BNSS at ${policeStation}, ${district}. Once registered, statutory notifications will be issued to the Court and supervisory officers.`,
      variant: "primary",
      confirmLabel: "Yes, Register FIR",
      onConfirm: () => {
        setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
        executeRegistration();
      },
    });
  };

  const executeRegistration = async () => {
    setSubmitting(true);
    try {
      const liveItem = buildCurrentFirItem();
      let created = await firService.registerFir(liveItem);
      created = await firService.synchronizeSourceComplaint(created.id);

      draftFinalized.current = true;
      firService.clearFirDraft(draftKey);
      setDraftRestoredNotice(null);
      setLastSavedTime(null);
      setRegisteredFir(created);
      setReceiptMode("registered");
      setShowReceiptModal(true);
    } catch (err: any) {
      console.error("Failed to register FIR:", err);
      alert("Failed to register FIR: " + (err.message || "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  // Tab Navigation Helpers
  const currentTabIndex = TAB_CONFIG.findIndex((t) => t.key === activeTab);

  // Registration is allowed only when every panel's mandatory fields are complete.
  const allMandatoryFieldsFilled = TAB_CONFIG.every(
    (tab) => Object.keys(getTabValidationErrors(tab.key)).length === 0
  );

  // Tab navigation is always free; mandatory fields are enforced only by the Register FIR button.
  const markTabVisited = (tabKey: MainTabKey) => {
    setVisitedTabs((prev) => (prev.includes(tabKey) ? prev : [...prev, tabKey]));
  };

  const handleNextTab = () => {
    if (currentTabIndex < TAB_CONFIG.length - 1) {
      markTabVisited(activeTab);
      setActiveTab(TAB_CONFIG[currentTabIndex + 1].key);
    }
  };

  const handlePrevTab = () => {
    if (currentTabIndex > 0) {
      markTabVisited(activeTab);
      setActiveTab(TAB_CONFIG[currentTabIndex - 1].key);
    }
  };

  // Any panel can be opened directly without completing earlier panels.
  const handleTabClick = (targetTabKey: MainTabKey) => {
    if (targetTabKey !== activeTab) {
      markTabVisited(activeTab);
    }
    setActiveTab(targetTabKey);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-16 animate-in fade-in-50 text-slate-800">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCloseForm}
            className="h-9 w-9 p-0 text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-700 shadow-xs">
                <Scale className="w-4 h-4" />
              </div>
              <h1 className="text-xl font-black text-[#0b192c] tracking-tight">
                Register First Information Report (FIR)
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {draftSaveError && <span role="alert" className="text-xs text-red-700">{draftSaveError}</span>}
          {lastSavedTime && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-in fade-in">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Auto-saved ({lastSavedTime})
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="text-xs text-red-700 border-red-200 hover:bg-red-50 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Clear All
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowUploadAutoFillModal(true)}
            className="text-xs text-blue-800 border-blue-300 bg-blue-50/80 hover:bg-blue-100 flex items-center gap-1.5 font-semibold shadow-xs transition-all"
            title="Upload complaint document to auto-fill FIR fields and cache raw document in database"
          >
            <UploadCloud className="w-3.5 h-3.5 text-blue-600" />
            <span>Upload &amp; Auto Fill FIR Form</span>
            {hasProcessedDocument && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Database record linked" />
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCloseForm}
            className="text-xs text-slate-700 hover:bg-slate-100"
          >
            Close
          </Button>
        </div>
      </div>

      {/* Special Report (SR) Alert Banner */}
      {(isHeinousCrime || isSensitiveFIR) && (
        <div className="bg-red-50 border-2 border-red-400 rounded-xl p-3.5 flex items-start gap-3 shadow-xs animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-red-900 uppercase tracking-wide flex items-center gap-1.5">
              <span>Special Report (SR) Mandatory Alert</span>
              <span className="bg-red-200 text-red-800 text-[10px] px-1.5 py-0.5 rounded font-mono">
                {isHeinousCrime && isSensitiveFIR ? "HEINOUS & SENSITIVE" : isHeinousCrime ? "HEINOUS CRIME" : "SENSITIVE FIR"}
              </span>
            </p>
            <p className="text-red-800 mt-0.5 leading-relaxed">
              Under Punjab Police Rules (PPR) as applicable to Haryana and Section 173 BNSS, a formal Special Report must be dispatched to the Superintendent of Police (SP), Deputy Commissioner / District Magistrate (DM), and Range IG within 24 hours.
            </p>
          </div>
        </div>
      )}

      {/* Draft Restored Banner */}
      {draftRestoredNotice && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2 text-amber-900 font-medium">
            <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{draftRestoredNotice}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDiscardDraft}
              className="text-xs bg-white border-amber-300 text-red-700 hover:bg-red-50"
            >
              Discard Draft
            </Button>
            <button
              onClick={() => setDraftRestoredNotice(null)}
              className="p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {saveDraftFeedback && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-2.5 flex items-center gap-2 text-xs text-emerald-900 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveDraftFeedback}</span>
        </div>
      )}

      {/* Linked Complaint Banner */}
      {linkedComplaint && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-900">
                Registering FIR from Linked Complaint #{linkedComplaint.complaintNumber}
              </p>
              <p className="text-[11px] text-blue-700 mt-0.5">
                Complainant: {linkedComplaint.complainantName} • Category: {linkedComplaint.categoryDisplay || linkedComplaint.category} • IO: {linkedComplaint.assignedEoName || "Unassigned"}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono bg-blue-200/80 text-blue-900 px-2.5 py-1 rounded-md font-bold">
            Synchronized Mode
          </span>
        </div>
      )}

      {/* A. FIR HEADER / BASIC DETAILS PANEL */}
      <Card className="border-slate-200 shadow-xs bg-white">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 text-xs bg-slate-50/70 border-b border-slate-200">
          <div className="lg:col-span-2">
            <label className="text-[10px] uppercase font-bold text-slate-500 block">State</label>
            <select
              value={state}
              onChange={(e) => handleStateChange(e.target.value)}
              className={`w-full mt-0.5 p-1.5 rounded border border-slate-300 bg-white font-medium text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${getFieldHighlightClass("state")}`}
            >
              {availableStates.map((st: string) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="text-[10px] uppercase font-bold text-slate-500 block">District</label>
            <select
              value={district}
              onChange={(e) => handleDistrictChange(e.target.value)}
              className={`w-full mt-0.5 p-1.5 rounded border border-slate-300 bg-white font-medium text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${getFieldHighlightClass("district")}`}
            >
              {district && !availableDistricts.includes(district) && (
                <option value={district}>{district}</option>
              )}
              {availableDistricts.map((dst: string) => (
                <option key={dst} value={dst}>
                  {dst}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-3">
            <label className="text-[10px] uppercase font-bold text-slate-500 block">Police Station</label>
            <select
              value={policeStation}
              onChange={(e) => handlePoliceStationChange(e.target.value)}
              className={`w-full mt-0.5 p-1.5 rounded border border-slate-300 bg-white font-semibold text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${getFieldHighlightClass("policeStation")}`}
            >
              {policeStation && !availablePoliceStations.includes(policeStation) && (
                <option value={policeStation}>{policeStation}</option>
              )}
              {availablePoliceStations.map((ps: string) => (
                <option key={ps} value={ps}>
                  {ps}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="text-[10px] uppercase font-bold text-slate-500 block">FIR Number</label>
            <input
              type="text"
              value={autoFirNumber.firNumber}
              disabled
              className="w-full mt-0.5 p-1.5 rounded border border-slate-200 bg-slate-100 font-mono font-bold text-red-900 text-xs"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="text-[10px] uppercase font-bold text-slate-500 block">Reg. Date &amp; Time</label>
            <div className="flex gap-1.5 mt-0.5">
              <div className="flex-1">
                <DatePickerDDMMYYYY
                  value={firDate}
                  max={maxAllowedFirDate}
                  onChange={(e) => handleFirDateChange(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  size="sm"
                  className={getFieldHighlightClass("firDate")}
                />
              </div>
              <input
                type="time"
                value={firTime}
                max={maxAllowedFirTime}
                onChange={(e) => handleFirTimeChange(e.target.value, e.target)}
                onInput={(e) => {
                  const now = getNowLocal();
                  if (firDate >= now.date && e.currentTarget.value > now.time) {
                    e.currentTarget.value = now.time;
                    setFirTime(now.time);
                  }
                }}
                onBlur={(e) => {
                  const now = getNowLocal();
                  if (firDate >= now.date && (e.currentTarget.value > now.time || firTime > now.time)) {
                    e.currentTarget.value = now.time;
                    setFirTime(now.time);
                  }
                }}
                className={`w-24 sm:w-28 p-1.5 rounded border border-slate-300 bg-white text-xs font-mono ${getFieldHighlightClass("firTime")}`}
                title={firDate >= maxAllowedFirDate ? `Latest allowed time: ${currentNow.time}` : undefined}
              />
            </div>
            {(errors.firDate || errors.firTime) && (
              <p className="text-[10px] text-red-600 mt-1 font-medium">{errors.firDate || errors.firTime}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* B. MAIN 7 TABS NAVIGATION BAR */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {TAB_CONFIG.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            const tabErrors = getTabValidationErrors(tab.key);
            const hasError = Object.keys(tabErrors).length > 0 && Object.keys(errors).some((k) => k in tabErrors);
            const hasVisitedIncomplete = !isActive && !hasError && visitedTabs.includes(tab.key) && Object.keys(tabErrors).length > 0;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabClick(tab.key)}
                title={
                  hasVisitedIncomplete
                    ? `Missing required field(s): ${Object.values(tabErrors).slice(0, 2).join(" • ")}`
                    : undefined
                }
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-[#0b192c] text-white shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-950 hover:bg-slate-100"
                } ${hasError ? "ring-2 ring-red-500" : hasVisitedIncomplete ? "ring-1 ring-amber-400 bg-amber-50/60" : ""}`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-red-400" : "text-slate-400"}`} />
                <span>{tab.label}</span>
                {hasError ? (
                  <span className="w-2 h-2 rounded-full bg-red-500" title="Validation error" />
                ) : hasVisitedIncomplete ? (
                  <span className="w-2 h-2 rounded-full bg-amber-500" title="Required fields pending" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* FORM BODY */}
      <form
        onSubmit={handleInitiateSubmit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement)?.tagName === "INPUT") {
            const inputType = (e.target as HTMLInputElement).type;
            if (inputType !== "submit" && inputType !== "button") {
              e.preventDefault();
            }
          }
        }}
        className="space-y-6"
      >
        {/* ========================================================================= */}
        {/* TAB 1: ACT & SECTION */}
        {/* ========================================================================= */}
        {activeTab === "act_section" && (
          <div className="space-y-5 animate-in fade-in-30">
            {/* GD & General Details Panel */}
            <Card className="border-slate-200">
              <CardHeader className="py-2.5 px-4 bg-slate-50 border-b border-slate-200">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  General &amp; General Diary (GD) Details
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* GD Number with Lookup Button */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 block">
                      GD / SD / DD Number <span className="text-red-600">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <VoiceInputButton
                        onTranscript={(t) => setGdEntryNumber(t)}
                        currentValue={gdEntryNumber}
                        fieldLabel="GD Number"
                        iconOnly={true}
                      />
                      <button
                        type="button"
                        onClick={() => setShowGDLookupDialog(true)}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <Search className="w-3 h-3" />
                        Lookup GD
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. GD-0042/28-03-2026"
                      value={gdEntryNumber}
                      onChange={(e) => setGdEntryNumber(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSearchAndAutofillGD(gdEntryNumber);
                        }
                      }}
                      className={`flex-1 p-2 rounded-lg border border-slate-300 font-mono text-xs focus:ring-1 focus:ring-blue-600 ${getFieldHighlightClass("gdEntryNumber")}`}
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSearchAndAutofillGD(gdEntryNumber)}
                      className="text-xs text-blue-700 border-blue-300 hover:bg-blue-50 shrink-0 font-bold"
                    >
                      Search
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Case Type (केस प्रकार) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={caseType}
                    onChange={(e) => setCaseType(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                  >
                    <option value="Select">Select</option>
                    <option value="ADULT">ADULT</option>
                    <option value="JUVENILE & ADULT">JUVENILE & ADULT</option>
                    <option value="ONLY JUVENILE">ONLY JUVENILE</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">GD Entry Date &amp; Time</label>
                  <div className="flex gap-2">
                    <div className="w-1/2">
                      <DatePickerDDMMYYYY
                        value={gdDate}
                        max={maxAllowedFirDate}
                        onChange={(e) => handleGdDateChange(e.target.value)}
                        placeholder="DD/MM/YYYY"
                        size="sm"
                        className={getFieldHighlightClass("gdDate")}
                      />
                    </div>
                    <input
                      type="time"
                      value={gdTime}
                      max={maxAllowedGdTime}
                      onChange={(e) => handleGdTimeChange(e.target.value, e.target)}
                      onInput={(e) => {
                        const now = getNowLocal();
                        if (gdDate >= now.date && e.currentTarget.value > now.time) {
                          e.currentTarget.value = now.time;
                          setGdTime(now.time);
                        }
                      }}
                      onBlur={(e) => {
                        const now = getNowLocal();
                        if (gdDate >= now.date && (e.currentTarget.value > now.time || gdTime > now.time)) {
                          e.currentTarget.value = now.time;
                          setGdTime(now.time);
                        }
                      }}
                      className={`w-1/2 p-2 rounded-lg border border-slate-300 font-mono text-xs ${getFieldHighlightClass("gdTime")}`}
                      title={gdDate >= maxAllowedFirDate ? `Latest allowed time: ${currentNow.time}` : undefined}
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Source of Complaint <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={sourceOfComplaint}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSourceOfComplaint(val);
                      if (val.toLowerCase().includes("zero") || val === "Other Police Stations") {
                        setIsZeroFirTransferIn(true);
                      }
                      if (errors.sourceOfComplaint) {
                        setErrors((prev) => {
                          const n = { ...prev };
                          delete n.sourceOfComplaint;
                          return n;
                        });
                      }
                    }}
                    className={`w-full p-2 rounded-lg border text-xs ${
                      errors.sourceOfComplaint ? "border-red-500 bg-red-50/50" : "border-slate-300"
                    } ${getFieldHighlightClass("sourceOfComplaint")}`}
                    required
                  >
                    <option value="">-- Select Source of Complaint --</option>
                    {sourceOfComplaintList.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                    {!sourceOfComplaintList.includes("Zero FIR Transfer In (u/s 173(1) BNSS)") && (
                      <option value="Zero FIR Transfer In (u/s 173(1) BNSS)">
                        Zero FIR Transfer In (u/s 173(1) BNSS)
                      </option>
                    )}
                  </select>
                  {errors.sourceOfComplaint && (
                    <p className="text-red-600 text-[11px] font-bold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {errors.sourceOfComplaint}
                    </p>
                  )}
                </div>

                {/* Zero FIR Transferred-In Banner & Cross-Reference Box */}
                {(isZeroFirTransferIn || sourceOfComplaint.toLowerCase().includes("zero") || sourceOfComplaint === "Other Police Stations") && (
                  <div className="md:col-span-2 bg-amber-50/80 border border-amber-300 p-3.5 rounded-xl space-y-3 animate-in fade-in-40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-600 animate-pulse" />
                        <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                          Zero FIR Transfer-In (प्राथमिकी स्थानान्तरण रसीद व नया नियमित नंबर)
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                        Auto Sequential Number Assigned: {autoFirNumber.firNumber}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      इस पुलिस स्टेशन के अधिकार क्षेत्र में ट्रांसफर होकर आई Zero FIR को थाने के <strong>FIR रजिस्टर के अगले अनुक्रमिक नंबर ({autoFirNumber.firNumber})</strong> के तहत नियमित FIR के रूप में दर्ज किया जा रहा है। मूल Zero FIR का विवरण नीचे दर्ज करें:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-amber-900 block mb-0.5">Original Zero FIR No.</label>
                        <input
                          type="text"
                          placeholder="e.g. 0/2026 or 004/2026"
                          value={originalZeroFirNumber}
                          onChange={(e) => setOriginalZeroFirNumber(e.target.value)}
                          className="w-full p-2 rounded border border-amber-300 bg-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-amber-900 block mb-0.5">Original Police Station</label>
                        <input
                          type="text"
                          placeholder="e.g. PS City Sonipat"
                          value={originalZeroFirPs}
                          onChange={(e) => setOriginalZeroFirPs(e.target.value)}
                          className="w-full p-2 rounded border border-amber-300 bg-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-amber-900 block mb-0.5">Original District</label>
                        <input
                          type="text"
                          placeholder="e.g. Sonipat"
                          value={originalZeroFirDistrict}
                          onChange={(e) => setOriginalZeroFirDistrict(e.target.value)}
                          className="w-full p-2 rounded border border-amber-300 bg-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-amber-900 block mb-0.5">Transfer Dispatch Date</label>
                        <DatePickerDDMMYYYY
                          value={originalZeroFirDate}
                          max={maxAllowedFirDate}
                          onChange={(e) => setOriginalZeroFirDate(e.target.value)}
                          placeholder="DD/MM/YYYY"
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 block">Complaint / Docket No.</label>
                    <VoiceInputButton
                      onTranscript={(t) => setComplaintNumber(t)}
                      currentValue={complaintNumber}
                      fieldLabel="Complaint Docket No"
                      iconOnly={true}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. COMP/2026/00142"
                    value={complaintNumber}
                    onChange={(e) => setComplaintNumber(e.target.value)}
                    className={`w-full p-2 rounded-lg border border-slate-300 font-mono text-xs ${getFieldHighlightClass("complaintNumber")}`}
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Original Date &amp; Time (Offence/Info)</label>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1/2">
                      <DatePickerDDMMYYYY
                        value={toIsoDateString(originalDateTime.split("T")[0] || "")}
                        max={currentNow.date}
                        onValueChange={(newDate) => {
                          if (!newDate) {
                            handleOriginalDateTimeChange("");
                            return;
                          }
                          const existingTime = parseTimeTo24Hour(originalDateTime.split("T")[1] || "") || currentNow.time;
                          const clampedTime = newDate >= currentNow.date && existingTime > currentNow.time ? currentNow.time : existingTime;
                          handleOriginalDateTimeChange(`${newDate}T${clampedTime}`);
                        }}
                        placeholder="DD/MM/YYYY"
                        size="sm"
                        className={errors.originalDateTime ? "border-red-500 bg-red-50/40" : ""}
                      />
                    </div>
                    <input
                      type="time"
                      value={parseTimeTo24Hour(originalDateTime.split("T")[1] || "") || (originalDateTime.split("T")[1] || "").slice(0, 5)}
                      max={originalDateTime.split("T")[0] >= currentNow.date ? currentNow.time : undefined}
                      onChange={(e) => {
                        const datePart = toIsoDateString(originalDateTime.split("T")[0] || "") || currentNow.date;
                        const timeVal = e.target.value || "00:00";
                        handleOriginalDateTimeChange(`${datePart}T${timeVal}`, e.target);
                      }}
                      className={`w-1/2 p-2 rounded-lg border text-xs font-mono ${
                        errors.originalDateTime ? "border-red-500 bg-red-50/40" : "border-slate-300"
                      }`}
                      title={`Latest allowed date & time: ${currentNow.date} ${currentNow.time}`}
                    />
                  </div>
                  {errors.originalDateTime && (
                    <p className="text-[11px] text-red-600 font-semibold mt-1">{errors.originalDateTime}</p>
                  )}
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Type of Information</label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="typeOfInfo"
                        checked={typeOfInfo === "WRITTEN"}
                        onChange={() => setTypeOfInfo("WRITTEN")}
                        className="text-blue-600"
                      />
                      <span className="font-semibold text-slate-800">Written (लिखित)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="typeOfInfo"
                        checked={typeOfInfo === "ORAL"}
                        onChange={() => setTypeOfInfo("ORAL")}
                        className="text-blue-600"
                      />
                      <span className="font-semibold text-slate-800">Oral (मौखिक)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">FIR Classification / Category</label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={isHeinousCrime}
                        onChange={(e) => setIsHeinousCrime(e.target.checked)}
                        className="rounded text-red-600"
                      />
                      <span className="font-bold text-red-800">Heinous Crime</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={isSensitiveFIR}
                        onChange={(e) => setIsSensitiveFIR(e.target.checked)}
                        className="rounded text-purple-600"
                      />
                      <span className="font-bold text-purple-800">Sensitive FIR</span>
                    </label>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 block">
                      Remarks <span className="text-red-600">*</span>
                    </label>
                    <VoiceInputButton
                      onTranscript={(t) => {
                        setActRemarks((prev) => (prev ? prev + " " + t : t));
                        if (errors.actRemarks) {
                          setErrors((prev) => {
                            const n = { ...prev };
                            delete n.actRemarks;
                            return n;
                          });
                        }
                      }}
                      currentValue={actRemarks}
                      fieldLabel="GD Remarks"
                      iconOnly={true}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="GD reference or administrative remarks (Mandatory)"
                    value={actRemarks}
                    onChange={(e) => {
                      setActRemarks(e.target.value);
                      if (errors.actRemarks) {
                        setErrors((prev) => {
                          const n = { ...prev };
                          delete n.actRemarks;
                          return n;
                        });
                      }
                    }}
                    className={`w-full p-2 rounded-lg border text-xs ${
                      errors.actRemarks ? "border-red-500 bg-red-50/50" : "border-slate-300"
                    }`}
                    required
                  />
                  {errors.actRemarks && (
                    <p className="text-red-600 text-[11px] font-bold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {errors.actRemarks}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Acts and Sections Repeatable Panel */}
            <Card className="border-slate-200 overflow-visible relative z-20">
              <CardHeader className="py-2.5 px-4 bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Scale className="w-4 h-4 text-red-600" />
                  Acts and Sections Applicable <span className="text-red-600">*</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded border border-red-200">
                    Mandatory *
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {actsAndSectionsList.length} Act(s) Added
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs overflow-visible">
                {/* Inline Acts and Sections Selection */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-end relative overflow-visible z-20">
                  <div className="md:col-span-5 relative z-50" ref={actDropdownRef}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 block">Select Act</label>
                      {selectedActId && (
                        <span className="text-[10px] text-slate-500 font-medium">
                          {(() => {
                            const act = unifiedActs.find((a) => a.id === selectedActId);
                            return act ? `${act.sections.length} Sections available` : "";
                          })()}
                        </span>
                      )}
                    </div>

                    <div
                      onClick={() => {
                        setIsActDropdownOpen((prev) => {
                          const nextState = !prev;
                          if (nextState) {
                            setIsSectionDropdownOpen(false);
                            setTimeout(() => actSearchInputRef.current?.focus(), 50);
                          }
                          return nextState;
                        });
                      }}
                      className="w-full min-h-[38px] p-2 rounded-lg border border-slate-300 bg-white text-xs cursor-pointer flex items-center justify-between gap-1 shadow-2xs hover:border-slate-400 focus-within:ring-2 focus-within:ring-[#0b192c]"
                    >
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {(() => {
                          const act = unifiedActs.find((a) => a.id === selectedActId) || unifiedActs[0];
                          if (!act) return <span className="text-slate-400">Select an Act...</span>;
                          return (
                            <div className="flex items-center gap-1.5 min-w-0 truncate">
                              <span className="font-semibold text-slate-800 truncate">
                                {act.name}
                              </span>
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0">
                                {act.sections.length} Sec
                              </span>
                              {act.isCustom && (
                                <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0">
                                  Custom
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                          isActDropdownOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>

                    {isActDropdownOpen && (
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 w-full sm:min-w-[420px] md:min-w-[480px] max-w-[calc(100vw-2.5rem)] top-full mt-1.5 bg-white border border-slate-300 rounded-xl shadow-2xl z-50 p-2.5 space-y-2.5"
                      >
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                          <input
                            ref={actSearchInputRef}
                            type="text"
                            placeholder="Type to search Act name or category..."
                            value={actSearchQuery}
                            onChange={(e) => setActSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setIsActDropdownOpen(false);
                              }
                            }}
                            className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-[#0b192c]"
                          />
                          {actSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setActSearchQuery("")}
                              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {(() => {
                          const q = actSearchQuery.toLowerCase().trim();
                          const filtered = unifiedActs.filter((a) => {
                            if (!q) return true;
                            return (
                              a.name.toLowerCase().includes(q) ||
                              a.title.toLowerCase().includes(q) ||
                              a.category.toLowerCase().includes(q) ||
                              a.id.toLowerCase().includes(q)
                            );
                          });

                          if (filtered.length === 0) {
                            return (
                              <div className="p-4 text-center text-xs text-slate-500">
                                No matching acts found for &quot;{actSearchQuery}&quot;
                              </div>
                            );
                          }

                          const categories = Array.from(new Set(filtered.map((a) => a.category)));

                          return (
                            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white">
                              {categories.map((cat) => {
                                const actsInCat = filtered.filter((a) => a.category === cat);
                                return (
                                  <div key={cat} className="p-1">
                                    <div className="px-2 py-1 text-[10px] font-bold tracking-wider uppercase text-slate-400 bg-slate-50/80 rounded">
                                      {cat}
                                    </div>
                                    <div className="space-y-0.5 mt-0.5">
                                      {actsInCat.map((act) => {
                                        const isSelected = selectedActId === act.id;
                                        return (
                                          <div
                                            key={act.id}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSelectAct(act.id);
                                              setIsActDropdownOpen(false);
                                              setActSearchQuery("");
                                            }}
                                            className={`p-2 flex items-center justify-between cursor-pointer text-xs rounded-md transition-colors ${
                                              isSelected
                                                ? "bg-blue-50 text-blue-950 font-semibold border border-blue-200"
                                                : "hover:bg-slate-50 text-slate-700"
                                            }`}
                                          >
                                            <div className="min-w-0 pr-2">
                                              <div className="font-semibold text-slate-800 leading-tight">
                                                {act.name}
                                              </div>
                                              <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                                <span className="font-mono text-blue-700 font-bold">
                                                  {act.sections.length} Sections
                                                </span>
                                                {act.isCustom && (
                                                  <span className="text-amber-700 font-medium">
                                                    • [Custom Bare Act]
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            {isSelected && (
                                              <Check className="w-4 h-4 text-blue-600 shrink-0 font-bold" />
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-5 relative z-40" ref={sectionDropdownRef}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 block">Select Section &amp; Sub Section</label>
                      {selectedSections.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSections([]);
                          }}
                          className="text-[10px] text-red-600 hover:underline font-semibold"
                        >
                          Clear ({selectedSections.length})
                        </button>
                      )}
                    </div>

                    <div
                      onClick={() => {
                        setIsSectionDropdownOpen((prev) => {
                          if (!prev) setIsActDropdownOpen(false);
                          return !prev;
                        });
                      }}
                      className="w-full min-h-[38px] p-1.5 rounded-lg border border-slate-300 bg-white text-xs cursor-pointer flex items-center justify-between gap-1 shadow-2xs hover:border-slate-400 focus-within:ring-2 focus-within:ring-[#0b192c]"
                    >
                      <div className="flex flex-wrap gap-1 items-center flex-1 min-w-0">
                        {selectedSections.length > 0 ? (
                          selectedSections.map((sec) => (
                            <span
                              key={sec}
                              className="inline-flex items-center gap-1 bg-[#0b192c] text-white px-2 py-0.5 rounded text-[11px] font-mono font-bold shrink-0"
                            >
                              <span>Sec {sec}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleSection(sec);
                                }}
                                className="hover:text-red-300 ml-0.5"
                              >
                                ×
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400">Click to select sections...</span>
                        )}
                      </div>
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>

                    {isSectionDropdownOpen && (
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 w-full sm:min-w-[420px] md:min-w-[480px] max-w-[calc(100vw-2.5rem)] top-full mt-1.5 bg-white border border-slate-300 rounded-xl shadow-2xl z-50 p-2.5 space-y-2.5"
                      >
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                          <input
                            type="text"
                            placeholder="Type to filter or add custom section..."
                            value={sectionSearchQuery}
                            onChange={(e) => setSectionSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (sectionSearchQuery.trim()) {
                                  handleAddCustomSection(sectionSearchQuery);
                                }
                              }
                            }}
                            className="w-full pl-8 pr-16 py-1.5 rounded-lg border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-[#0b192c]"
                          />
                          {sectionSearchQuery.trim() && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddCustomSection(sectionSearchQuery);
                              }}
                              className="absolute right-1 top-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold"
                            >
                              + Add
                            </button>
                          )}
                        </div>

                        {(() => {
                          const activeObj = unifiedActs.find((a) => a.id === selectedActId) || unifiedActs[0];
                          const secList = activeObj?.sections || [];
                          const q = sectionSearchQuery.toLowerCase().trim();
                          const filtered = secList.filter((s) => {
                            if (!q) return true;
                            return (
                              s.sectionNumber.toLowerCase().includes(q) ||
                              (s.title && s.title.toLowerCase().includes(q))
                            );
                          });

                          return (
                            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white">
                              {filtered.length > 0 ? (
                                filtered.map((sec, secIdx) => {
                                  const isSelected = selectedSections.includes(sec.sectionNumber);
                                  return (
                                    <div
                                      key={`${sec.sectionNumber}-${secIdx}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleSection(sec.sectionNumber);
                                      }}
                                      className={`p-2 flex items-center justify-between cursor-pointer text-xs rounded-md transition-colors ${
                                        isSelected
                                          ? "bg-blue-50 text-blue-950 font-semibold border border-blue-200"
                                          : "hover:bg-slate-50 text-slate-700"
                                      }`}
                                    >
                                      <div className="flex items-start gap-2 min-w-0">
                                        <div
                                          className={`w-3.5 h-3.5 mt-0.5 rounded flex items-center justify-center shrink-0 text-[10px] border ${
                                            isSelected
                                              ? "bg-blue-600 text-white border-blue-600 font-bold"
                                              : "border-slate-300"
                                          }`}
                                        >
                                          {isSelected ? "✓" : ""}
                                        </div>
                                        <div className="min-w-0 leading-tight">
                                          <span className="font-mono font-bold text-blue-900 mr-1.5">
                                            {sec.sectionNumber}
                                          </span>
                                          {sec.title && (
                                            <span className="text-[11px] text-slate-600 font-normal">
                                              — {sec.title}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="p-3 text-center text-slate-500 text-xs">
                                  <p>No section found for &ldquo;{sectionSearchQuery}&rdquo;.</p>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div className="pt-1.5 flex items-center justify-between border-t border-slate-100 text-[11px]">
                          <span className="text-slate-600 font-medium">
                            {selectedSections.length} section(s) selected
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsSectionDropdownOpen(false);
                            }}
                            className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold shadow-xs"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <Button
                      type="button"
                      onClick={handleAddActSectionInline}
                      className="w-full bg-[#0b192c] hover:bg-slate-800 text-white text-xs flex items-center justify-center gap-1 h-[38px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Act
                    </Button>
                  </div>
                </div>

                {/* Table */}
                {actsAndSectionsList.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5 w-14">S.No.</th>
                          <th className="p-2.5">Acts</th>
                          <th className="p-2.5">Sections</th>
                          <th className="p-2.5 w-20 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {actsAndSectionsList.map((row, idx) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-500">{row.srNo || idx + 1}</td>
                            <td className="p-2.5 font-semibold text-slate-900">{row.act}</td>
                            <td className="p-2.5 font-mono text-blue-900 font-bold">{row.sections}</td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setActsAndSectionsList(
                                    actsAndSectionsList.filter((_, i) => i !== idx).map((it, i) => ({ ...it, srNo: i + 1 }))
                                  )
                                }
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={`text-center py-4 rounded-lg border border-dashed ${
                    errors.act_section
                      ? "mandatory-glow-error text-red-700 bg-red-50/70 border-red-300 font-semibold"
                      : "text-slate-400 bg-slate-50/50 border-slate-200"
                  }`}>
                    No acts &amp; sections added yet. Please select an Act and Section(s) above and click &quot;Add Act&quot;.
                  </div>
                )}
                {errors.act_section && (
                  <p className="text-red-600 text-[11px] font-bold flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.act_section}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Major Head & Minor Head Panel */}
            <Card className="border-slate-200">
              <CardHeader className="py-2.5 px-4 bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-600" />
                  Major &amp; Minor Heads (Crime Classification)
                </CardTitle>
                <span className="text-[11px] font-semibold text-slate-500">
                  {majorMinorHeadsList.length} Head(s) Added
                </span>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5">
                    <label className="font-bold text-slate-700 block mb-1">Major Head</label>
                    <select
                      value={currentMajorHead}
                      onChange={(e) => {
                        setCurrentMajorHead(e.target.value);
                        setCurrentMinorHead(MINOR_HEADS[e.target.value]?.[0] || "");
                      }}
                      className={`w-full p-2 rounded-lg border border-slate-300 bg-white text-xs font-medium ${getFieldHighlightClass("majorHead")}`}
                    >
                      {majorHeadsOptions.map((mh) => (
                        <option key={mh} value={mh}>
                          {mh}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-5">
                    <label className="font-bold text-slate-700 block mb-1">Minor Head</label>
                    <select
                      value={currentMinorHead}
                      onChange={(e) => setCurrentMinorHead(e.target.value)}
                      className={`w-full p-2 rounded-lg border border-slate-300 bg-white text-xs font-medium ${getFieldHighlightClass("minorHead")}`}
                    >
                      {(MINOR_HEADS[currentMajorHead] || []).map((min) => (
                        <option key={min} value={min}>
                          {min}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <Button
                      type="button"
                      onClick={handleAddMajorMinorHead}
                      className="w-full bg-[#0b192c] hover:bg-slate-800 text-white text-xs flex items-center justify-center gap-1 h-[38px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Head
                    </Button>
                  </div>
                </div>

                {majorMinorHeadsList.length > 0 && (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5 w-14">S.No.</th>
                          <th className="p-2.5">Major Heads</th>
                          <th className="p-2.5">Minor Heads</th>
                          <th className="p-2.5 w-20 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {majorMinorHeadsList.map((row, idx) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-500">{row.srNo || idx + 1}</td>
                            <td className="p-2.5 font-semibold text-slate-900">{row.majorHead}</td>
                            <td className="p-2.5 font-medium text-slate-700">{row.minorHead}</td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setMajorMinorHeadsList(
                                    majorMinorHeadsList.filter((_, i) => i !== idx).map((it, i) => ({ ...it, srNo: i + 1 }))
                                  )
                                }
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: OCCURRENCE */}
        {/* ========================================================================= */}
        {/* TAB 2: OCCURRENCE (DIRECT INLINE ENTRY & RECORDED LIST) */}
        {/* ========================================================================= */}
        {activeTab === "occurrence" && (
          <div className="space-y-5 animate-in fade-in-30">
            {errors.occurrence && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-red-700 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errors.occurrence}</span>
              </div>
            )}
            <InlineOccurrenceSection
              occurrencesList={occurrencesList}
              onAddOccurrence={handleAddOccurrence}
              onUpdateOccurrence={handleUpdateOccurrence}
              onDeleteOccurrence={handleDeleteOccurrence}
              autoFilledFields={autoFilledFields}
              hasValidationErrors={Boolean(errors.occurrence)}
              validationErrorMsg={errors.occurrence}
            />
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: COMPLAINANT & VICTIM INFORMATION (ALL DETAILS IN SINGLE PANEL) */}
        {/* ========================================================================= */}
        {activeTab === "complainant" && (
          <div className="space-y-4 animate-in fade-in-30">
            {/* Unified Complainant Details Card */}
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="py-2.5 px-4 bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  Complainant Details (शिकायतकर्ता का विवरण)
                </CardTitle>
                <span className="text-[11px] text-slate-500 font-medium">
                  Fields marked with <span className="text-red-600 font-bold">*</span> are mandatory
                </span>
              </CardHeader>
              <CardContent className="p-4 space-y-6 text-xs">
                {/* 1. Personal Information */}
                <div>
                  <h4 className="font-bold text-slate-800 uppercase text-xs mb-3 flex items-center gap-2 border-b border-slate-200 pb-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    Personal Information (व्यक्तिगत विवरण)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 block">
                          First Name <span className="text-red-600">*</span>
                        </label>
                        <VoiceInputButton
                          onTranscript={(t) => {
                            setComplainantFirstName(t);
                            if (errors.complainant) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.complainant;
                                return next;
                              });
                            }
                          }}
                          currentValue={complainantFirstName}
                          fieldLabel="Complainant First Name"
                          iconOnly={true}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Complainant First Name"
                        value={complainantFirstName}
                        onChange={(e) => {
                          setComplainantFirstName(e.target.value);
                          if (errors.complainant) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.complainant;
                              return next;
                            });
                          }
                        }}
                        className={`w-full p-2.5 rounded-lg border font-semibold ${
                          errors.complainant ? "border-red-500 bg-red-50 ring-1 ring-red-400" : "border-slate-300"
                        } ${getFieldHighlightClass("complainantFirstName")}`}
                        required
                      />
                      {errors.complainant && (
                        <p className="text-red-600 text-[10px] mt-0.5">{errors.complainant}</p>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 block">Middle Name</label>
                        <VoiceInputButton
                          onTranscript={(t) => setComplainantMiddleName(t)}
                          currentValue={complainantMiddleName}
                          fieldLabel="Complainant Middle Name"
                          iconOnly={true}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Middle Name"
                        value={complainantMiddleName}
                        onChange={(e) => setComplainantMiddleName(e.target.value)}
                        className={`w-full p-2.5 rounded-lg border border-slate-300 ${getFieldHighlightClass("complainantMiddleName")}`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 block">Last Name</label>
                        <VoiceInputButton
                          onTranscript={(t) => setComplainantLastName(t)}
                          currentValue={complainantLastName}
                          fieldLabel="Complainant Last Name"
                          iconOnly={true}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Last Name"
                        value={complainantLastName}
                        onChange={(e) => setComplainantLastName(e.target.value)}
                        className={`w-full p-2.5 rounded-lg border border-slate-300 font-semibold ${getFieldHighlightClass("complainantLastName")}`}
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Gender <span className="text-red-600">*</span>
                      </label>
                      <select
                        value={complainantGender}
                        onChange={(e) => {
                          setComplainantGender(e.target.value);
                          if (errors.complainantGender) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.complainantGender;
                              return next;
                            });
                          }
                        }}
                        className={`w-full p-2.5 rounded-lg border font-medium ${
                          errors.complainantGender ? "border-red-500 bg-red-50 ring-1 ring-red-400" : "border-slate-300"
                        } ${getFieldHighlightClass("complainantGender")}`}
                        required
                      >
                        <option value="">-- Select Gender --</option>
                        {GENDER_OPTIONS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                      {errors.complainantGender && (
                        <p className="text-red-600 text-[10px] mt-0.5">{errors.complainantGender}</p>
                      )}
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Marital Status</label>
                      <select
                        value={complainantMaritalStatus}
                        onChange={(e) => setComplainantMaritalStatus(e.target.value)}
                        className={`w-full p-2.5 rounded-lg border border-slate-300 font-medium ${getFieldHighlightClass("complainantMaritalStatus")}`}
                      >
                        <option value="">Select</option>
                        {MARITAL_STATUS_OPTIONS.map((ms) => (
                          <option key={ms} value={ms}>
                            {ms}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Category</label>
                      <select
                        value={complainantCategory}
                        onChange={(e) => setComplainantCategory(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                      >
                        {casteCategoryList.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Mobile Number (+91) <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="10-digit mobile number"
                        value={complainantMobile}
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 10);
                          setComplainantMobile(digitsOnly);
                          if (errors.complainantMobile && digitsOnly.length === 10) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.complainantMobile;
                              return next;
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (
                            !/^\d$/.test(e.key) &&
                            !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"].includes(e.key) &&
                            !e.ctrlKey &&
                            !e.metaKey
                          ) {
                            e.preventDefault();
                          }
                        }}
                        className={`w-full p-2.5 rounded-lg border border-slate-300 font-mono ${getFieldHighlightClass("complainantMobile")}`}
                        required
                      />
                      {errors.complainantMobile && (
                        <p className="text-red-600 text-[10px] mt-0.5">{errors.complainantMobile}</p>
                      )}
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Relation Type</label>
                      <select
                        value={complainantRelationType}
                        onChange={(e) => setComplainantRelationType(e.target.value)}
                        className={`w-full p-2.5 rounded-lg border border-slate-300 ${getFieldHighlightClass("complainantRelationType")}`}
                      >
                        {RELATION_TYPE_OPTIONS.map((rt) => (
                          <option key={rt} value={rt}>
                            {rt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 block">Relative Name</label>
                        <VoiceInputButton
                          onTranscript={(t) => setComplainantRelativeName(t)}
                          currentValue={complainantRelativeName}
                          fieldLabel="Relative Name"
                          iconOnly={true}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Father's or Husband's Full Name"
                        value={complainantRelativeName}
                        onChange={(e) => setComplainantRelativeName(e.target.value)}
                        className={`w-full p-2.5 rounded-lg border border-slate-300 ${getFieldHighlightClass("complainantRelativeName")}`}
                      />
                    </div>
                  </div>

                  {/* Comprehensive Age Panel with Reset */}
                  <div className={`p-3.5 rounded-xl border space-y-3 transition-colors ${
                    errors.complainantAge ? "bg-red-50/50 border-red-500 ring-1 ring-red-400" : "bg-slate-50 border-slate-200"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 uppercase text-[11px] flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                        Age &amp; Date of Birth Particulars <span className="text-red-600">*</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleResetAge}
                        className="text-[11px] font-bold text-red-600 hover:text-red-800 flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset Age
                      </button>
                    </div>
                    {errors.complainantAge && (
                      <p className="text-red-600 text-[11px] font-bold flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{errors.complainantAge}</span>
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      {/* Date of Birth */}
                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500 block">Date of Birth (DOB)</span>
                          <span className="text-[10px] text-slate-400 font-semibold">(Max: Today)</span>
                        </div>
                        <div className="mt-1">
                          <DatePickerDDMMYYYY
                            value={complainantDob}
                            max={maxAllowedFirDate}
                            onChange={(e) => handleComplainantDobChange(e.target.value)}
                            placeholder="DD/MM/YYYY"
                            size="sm"
                          />
                        </div>
                      </div>

                      {/* Year of Birth */}
                      <div className="sm:col-span-2">
                        <span className="text-[11px] text-slate-500 block">Year of Birth</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1900}
                          max={new Date().getFullYear()}
                          placeholder="YYYY"
                          value={complainantYearOfBirth}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) => handleComplainantYearChange(e.target.value)}
                          className="w-full mt-1 p-2 rounded border border-slate-300 font-mono text-xs"
                        />
                      </div>

                      {/* Age in Years - 1/3 size */}
                      <div className="sm:col-span-1">
                        <span className="text-[11px] text-slate-500 block truncate" title="Age in Years">
                          Age in Years
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max="125"
                          placeholder="Yrs"
                          value={complainantAge}
                          onKeyDown={(e) => {
                            if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") e.preventDefault();
                          }}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            if (!val) {
                              setComplainantAge("");
                              return;
                            }
                            const num = Math.max(0, parseInt(val, 10));
                            setComplainantAge(String(num));
                            if (errors.complainantAge) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.complainantAge;
                                return next;
                              });
                            }
                            const curYear = new Date().getFullYear();
                            const calcYear = curYear - num;
                            if (calcYear >= 1900) {
                              setComplainantYearOfBirth(String(calcYear));
                              if (complainantDob) {
                                const parts = complainantDob.split("-");
                                if (parts.length === 3) {
                                  const updatedDob = `${calcYear}-${parts[1]}-${parts[2]}`;
                                  const todayIso = getNowLocal().date;
                                  setComplainantDob(updatedDob > todayIso ? todayIso : updatedDob);
                                }
                              }
                            }
                            updateComplainantAgeRange(num);
                          }}
                          className={`w-full mt-1 p-2 rounded border border-slate-300 font-mono text-xs text-center ${getFieldHighlightClass("complainantAge")}`}
                        />
                      </div>

                      {/* Age in Months - 1/3 size */}
                      <div className="sm:col-span-1">
                        <span className="text-[11px] text-slate-500 block truncate" title="Age in Months">
                          Age in Months
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max="11"
                          placeholder="0-11"
                          value={complainantAgeMonths}
                          onKeyDown={(e) => {
                            if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") e.preventDefault();
                          }}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            setComplainantAgeMonths(val ? String(Math.max(0, Math.min(11, parseInt(val, 10)))) : "");
                          }}
                          className="w-full mt-1 p-2 rounded border border-slate-300 font-mono text-xs text-center"
                        />
                      </div>

                      {/* Age Range */}
                      <div className="sm:col-span-2">
                        <span className="text-[11px] text-slate-500 block">Age Range</span>
                        <select
                          value={complainantAgeRange}
                          onChange={(e) => setComplainantAgeRange(e.target.value)}
                          className="w-full mt-1 p-2 rounded border border-slate-300 text-xs font-medium"
                        >
                          <option value="Not Specified">Not Specified</option>
                          <option value="Under 18 (Minor / Child)">Under 18 (Minor / Child)</option>
                          <option value="18 - 30 Years (Young Adult)">18 - 30 Years (Young Adult)</option>
                          <option value="31 - 50 Years (Middle Age)">31 - 50 Years (Middle Age)</option>
                          <option value="51 - 60 Years (Senior)">51 - 60 Years (Senior)</option>
                          <option value="Above 60 Years (Elderly / Senior Citizen)">
                            Above 60 Years (Elderly)
                          </option>
                        </select>
                      </div>

                      {/* Aliases / Nicknames */}
                      <div className="sm:col-span-4">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 uppercase text-[11px]">
                            Aliases / Nicknames (उपनाम)
                          </span>
                          <VoiceInputButton
                            onTranscript={(t) => setTempAlias(t)}
                            currentValue={tempAlias}
                            fieldLabel="Alias / Nickname"
                            iconOnly={true}
                          />
                        </div>
                        <div className="mt-1 flex gap-2">
                          <input
                            type="text"
                            placeholder="Alias / Nickname"
                            value={tempAlias}
                            onChange={(e) => setTempAlias(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddAlias();
                              }
                            }}
                            className="flex-1 p-2 rounded border border-slate-300 text-xs"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleAddAlias}
                            className="text-xs bg-slate-700 text-white shrink-0 px-3"
                          >
                            Add Alias
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Added Aliases List */}
                    {complainantAliases.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-600 uppercase">
                          Added Aliases ({complainantAliases.length}):
                        </span>
                        {complainantAliases.map((a, idx) => (
                          <span
                            key={a.id || idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs font-semibold text-slate-800 shadow-sm"
                          >
                            <span className="text-slate-400 font-mono text-[10px]">#{idx + 1}</span>
                            <span>{a.aliasName}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setComplainantAliases(complainantAliases.filter((_, i) => i !== idx))
                              }
                              className="text-slate-400 hover:text-red-600 transition-colors ml-1 p-0.5 rounded hover:bg-slate-100"
                              title="Remove alias"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 pt-1">
                    <input
                      type="checkbox"
                      checked={complainantSameAsVictim}
                      onChange={(e) => handleToggleComplainantSameAsVictim(e.target.checked)}
                      className="rounded text-blue-600 w-4 h-4"
                    />
                    <span>Complainant is also the Victim in this offence (शिकायतकर्ता ही इस अपराध में पीड़ित है)</span>
                  </label>
                </div>

                {/* 2. Address Details */}
                <div className="pt-4 border-t border-slate-200">
                  <h4 className="font-bold text-slate-800 uppercase text-xs mb-3 flex items-center gap-2 border-b border-slate-200 pb-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    Address Details (पते का विवरण)
                  </h4>
                  <div>
                    <h5 className="font-bold text-slate-800 uppercase text-[11px] mb-2 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      Permanent Address (स्थाई पता)
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 block">House / Flat No.</label>
                          <VoiceInputButton
                            onTranscript={(t) => setPermHouseNo(t)}
                            currentValue={permHouseNo}
                            fieldLabel="House No"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="House No."
                          value={permHouseNo}
                          onChange={(e) => setPermHouseNo(e.target.value)}
                          className={`w-full p-2 rounded border border-slate-300 ${getFieldHighlightClass("permHouseNo")}`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 block">Street / Gali</label>
                          <VoiceInputButton
                            onTranscript={(t) => setPermStreet(t)}
                            currentValue={permStreet}
                            fieldLabel="Street"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Street Name"
                          value={permStreet}
                          onChange={(e) => setPermStreet(e.target.value)}
                          className="w-full p-2 rounded border border-slate-300"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 block">Colony / Area</label>
                          <VoiceInputButton
                            onTranscript={(t) => setPermColony(t)}
                            currentValue={permColony}
                            fieldLabel="Colony / Sector"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Colony / Sector"
                          value={permColony}
                          onChange={(e) => setPermColony(e.target.value)}
                          className="w-full p-2 rounded border border-slate-300"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 block">Village / City *</label>
                          <VoiceInputButton
                            onTranscript={(t) => setPermCity(t)}
                            currentValue={permCity}
                            fieldLabel="Village / City"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          value={permCity}
                          onChange={(e) => setPermCity(e.target.value)}
                          className={`w-full p-2 rounded border border-slate-300 ${getFieldHighlightClass("permCity")}`}
                          required
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 block">Tehsil / Sub-Division</label>
                          <VoiceInputButton
                            onTranscript={(t) => setPermTehsil(t)}
                            currentValue={permTehsil}
                            fieldLabel="Tehsil"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          value={permTehsil}
                          onChange={(e) => setPermTehsil(e.target.value)}
                          className="w-full p-2 rounded border border-slate-300"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 block">Police Station</label>
                          <VoiceInputButton
                            onTranscript={(t) => setPermPs(t)}
                            currentValue={permPs}
                            fieldLabel="Police Station"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          value={permPs}
                          onChange={(e) => setPermPs(e.target.value)}
                          className="w-full p-2 rounded border border-slate-300"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 block">
                            District <span className="text-red-600">*</span>
                          </label>
                          <VoiceInputButton
                            onTranscript={(t) => {
                              setPermDistrict(t);
                              if (errors.permDistrict) {
                                setErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.permDistrict;
                                  return next;
                                });
                              }
                            }}
                            currentValue={permDistrict}
                            fieldLabel="District"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          value={permDistrict}
                          onChange={(e) => {
                            setPermDistrict(e.target.value);
                            if (errors.permDistrict) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.permDistrict;
                                return next;
                              });
                            }
                          }}
                          className={`w-full p-2 rounded border font-semibold ${
                            errors.permDistrict ? "border-red-500 bg-red-50 ring-1 ring-red-400" : "border-slate-300"
                          } ${getFieldHighlightClass("permDistrict")}`}
                          required
                        />
                        {errors.permDistrict && (
                          <p className="text-red-600 text-[10px] mt-0.5">{errors.permDistrict}</p>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 block">
                            State <span className="text-red-600">*</span>
                          </label>
                          <VoiceInputButton
                            onTranscript={(t) => {
                              setPermState(t);
                              if (errors.permState) {
                                setErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.permState;
                                  return next;
                                });
                              }
                            }}
                            currentValue={permState}
                            fieldLabel="State"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          value={permState}
                          onChange={(e) => {
                            setPermState(e.target.value);
                            if (errors.permState) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.permState;
                                return next;
                              });
                            }
                          }}
                          className={`w-full p-2 rounded border font-semibold ${
                            errors.permState ? "border-red-500 bg-red-50 ring-1 ring-red-400" : "border-slate-300"
                          } ${getFieldHighlightClass("permState")}`}
                          required
                        />
                        {errors.permState && (
                          <p className="text-red-600 text-[10px] mt-0.5">{errors.permState}</p>
                        )}
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Pincode</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="6-digit pincode"
                          value={permPincode}
                          onChange={(e) => setPermPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          onKeyDown={(e) => {
                            if (
                              !/^\d$/.test(e.key) &&
                              !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"].includes(e.key) &&
                              !e.ctrlKey &&
                              !e.metaKey
                            ) {
                              e.preventDefault();
                            }
                          }}
                          className="w-full p-2 rounded border border-slate-300 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 text-xs">
                      <input
                        type="checkbox"
                        checked={presentSameAsPerm}
                        onChange={(e) => setPresentSameAsPerm(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span>Present Address is same as Permanent Address</span>
                    </label>

                    {!presentSameAsPerm && (
                      <div className="mt-3 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                        <h5 className="font-bold text-slate-700 uppercase text-[10px]">Present Address Details</h5>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="font-bold text-slate-700 block">House / Flat No.</label>
                              <VoiceInputButton
                                onTranscript={(t) => setPresHouseNo(t)}
                                currentValue={presHouseNo}
                                fieldLabel="Present House No"
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="House No."
                              value={presHouseNo}
                              onChange={(e) => setPresHouseNo(e.target.value)}
                              className="w-full p-2 rounded border border-slate-300 bg-white"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="font-bold text-slate-700 block">Street / Gali</label>
                              <VoiceInputButton
                                onTranscript={(t) => setPresStreet(t)}
                                currentValue={presStreet}
                                fieldLabel="Present Street"
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Street Name"
                              value={presStreet}
                              onChange={(e) => setPresStreet(e.target.value)}
                              className="w-full p-2 rounded border border-slate-300 bg-white"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="font-bold text-slate-700 block">Colony / Area</label>
                              <VoiceInputButton
                                onTranscript={(t) => setPresColony(t)}
                                currentValue={presColony}
                                fieldLabel="Present Colony"
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Colony / Sector"
                              value={presColony}
                              onChange={(e) => setPresColony(e.target.value)}
                              className="w-full p-2 rounded border border-slate-300 bg-white"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="font-bold text-slate-700 block">Village / City</label>
                              <VoiceInputButton
                                onTranscript={(t) => setPresCity(t)}
                                currentValue={presCity}
                                fieldLabel="Present City"
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="City / Village"
                              value={presCity}
                              onChange={(e) => setPresCity(e.target.value)}
                              className="w-full p-2 rounded border border-slate-300 bg-white"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="font-bold text-slate-700 block">Tehsil / Sub-Division</label>
                              <VoiceInputButton
                                onTranscript={(t) => setPresTehsil(t)}
                                currentValue={presTehsil}
                                fieldLabel="Present Tehsil"
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Tehsil"
                              value={presTehsil}
                              onChange={(e) => setPresTehsil(e.target.value)}
                              className="w-full p-2 rounded border border-slate-300 bg-white"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="font-bold text-slate-700 block">Police Station</label>
                              <VoiceInputButton
                                onTranscript={(t) => setPresPs(t)}
                                currentValue={presPs}
                                fieldLabel="Present Police Station"
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Police Station"
                              value={presPs}
                              onChange={(e) => setPresPs(e.target.value)}
                              className="w-full p-2 rounded border border-slate-300 bg-white"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="font-bold text-slate-700 block">District</label>
                              <VoiceInputButton
                                onTranscript={(t) => setPresDistrict(t)}
                                currentValue={presDistrict}
                                fieldLabel="Present District"
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="District"
                              value={presDistrict}
                              onChange={(e) => setPresDistrict(e.target.value)}
                              className="w-full p-2 rounded border border-slate-300 bg-white"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="font-bold text-slate-700 block">State</label>
                              <VoiceInputButton
                                onTranscript={(t) => setPresState(t)}
                                currentValue={presState}
                                fieldLabel="Present State"
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="State"
                              value={presState}
                              onChange={(e) => setPresState(e.target.value)}
                              className="w-full p-2 rounded border border-slate-300 bg-white"
                            />
                          </div>
                          <div>
                            <label className="font-bold text-slate-700 block mb-1">Pincode</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              placeholder="6-digit pincode"
                              value={presPincode}
                              onChange={(e) => setPresPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              onKeyDown={(e) => {
                                if (
                                  !/^\d$/.test(e.key) &&
                                  !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"].includes(e.key) &&
                                  !e.ctrlKey &&
                                  !e.metaKey
                                ) {
                                  e.preventDefault();
                                }
                              }}
                              className="w-full p-2 rounded border border-slate-300 bg-white font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Other Information & Identification */}
                <div className="pt-4 border-t border-slate-200">
                  <h4 className="font-bold text-slate-800 uppercase text-xs mb-3 flex items-center gap-2 border-b border-slate-200 pb-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    Other Information &amp; Identification (अन्य विवरण एवं पहचान पत्र)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Occupation</label>
                      <select
                        value={complainantOccupation}
                        onChange={(e) => setComplainantOccupation(e.target.value)}
                        className="w-full p-2 rounded border border-slate-300"
                      >
                        <option value="Private Service">Private Service</option>
                        <option value="Government Employee">Government Employee</option>
                        <option value="Business / Trader">Business / Trader</option>
                        <option value="Farmer / Agriculture">Farmer / Agriculture</option>
                        <option value="Student">Student</option>
                        <option value="Homemaker">Homemaker</option>
                        <option value="Advocate / Legal">Advocate / Legal</option>
                        <option value="Doctor / Healthcare">Doctor / Healthcare</option>
                        <option value="Daily Wage / Worker">Daily Wage / Worker</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 block">
                          Nationality <span className="text-red-600">*</span>
                        </label>
                        <VoiceInputButton
                          onTranscript={(t) => {
                            setComplainantNationality(t);
                            if (errors.complainantNationality) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.complainantNationality;
                                return next;
                              });
                            }
                          }}
                          currentValue={complainantNationality}
                          fieldLabel="Nationality"
                          iconOnly={true}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. Indian"
                        value={complainantNationality}
                        onChange={(e) => {
                          setComplainantNationality(e.target.value);
                          if (errors.complainantNationality) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.complainantNationality;
                              return next;
                            });
                          }
                        }}
                        className={`w-full p-2 rounded border font-semibold ${
                          errors.complainantNationality ? "border-red-500 bg-red-50 ring-1 ring-red-400" : "border-slate-300"
                        } ${getFieldHighlightClass("complainantNationality")}`}
                        required
                      />
                      {errors.complainantNationality && (
                        <p className="text-red-600 text-[10px] mt-0.5">{errors.complainantNationality}</p>
                      )}
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Aadhaar (UID) Number</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={12}
                        placeholder="12-digit Aadhaar Number"
                        value={complainantUid}
                        onChange={(e) => setComplainantUid(e.target.value.replace(/\D/g, "").slice(0, 12))}
                        onKeyDown={(e) => {
                          if (
                            !/^\d$/.test(e.key) &&
                            !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"].includes(e.key) &&
                            !e.ctrlKey &&
                            !e.metaKey
                          ) {
                            e.preventDefault();
                          }
                        }}
                        className="w-full p-2 rounded border border-slate-300 font-mono"
                      />
                    </div>
                  </div>

                  {/* Passport Details */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="font-bold text-slate-800 uppercase text-[11px] block mb-2">
                      Passport Details (if applicable)
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-slate-500 block">Passport Number</span>
                          <VoiceInputButton
                            onTranscript={(t) => setPassportNumber(t)}
                            currentValue={passportNumber}
                            fieldLabel="Passport Number"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. Z1234567"
                          value={passportNumber}
                          onChange={(e) => setPassportNumber(e.target.value)}
                          className="w-full p-1.5 rounded border border-slate-300 bg-white font-mono"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Date of Issue</span>
                        <DatePickerDDMMYYYY
                          value={passportIssueDate}
                          max={maxAllowedFirDate}
                          onChange={(e) => setPassportIssueDate(e.target.value)}
                          placeholder="DD/MM/YYYY"
                          size="sm"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-slate-500 block">Place of Issue</span>
                          <VoiceInputButton
                            onTranscript={(t) => setPassportIssuePlace(t)}
                            currentValue={passportIssuePlace}
                            fieldLabel="Place of Issue"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. Delhi"
                          value={passportIssuePlace}
                          onChange={(e) => setPassportIssuePlace(e.target.value)}
                          className="w-full p-1.5 rounded border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Identification Documents Repeatable Table */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                    <label className="font-bold text-slate-800 block text-[11px] uppercase">
                      Identification Documents
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                      <div className="md:col-span-5">
                        <span className="text-[10px] text-slate-500 block mb-0.5">ID Type</span>
                        <select
                          value={tempIdType}
                          onChange={(e) => setTempIdType(e.target.value)}
                          className="w-full p-1.5 rounded border border-slate-300 bg-white"
                        >
                          {IDENTIFICATION_TYPE_OPTIONS.map((idType) => (
                            <option key={idType} value={idType}>
                              {idType}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-5">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-slate-500 block">ID Number</span>
                          <VoiceInputButton
                            onTranscript={(t) => setTempIdNumber(t)}
                            currentValue={tempIdNumber}
                            fieldLabel="ID Number"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          inputMode={tempIdType === "Aadhar Card" ? "numeric" : "text"}
                          maxLength={tempIdType === "Aadhar Card" ? 12 : undefined}
                          placeholder={tempIdType === "Aadhar Card" ? "12-digit Aadhaar Number" : "e.g. DL-04201100234"}
                          value={tempIdNumber}
                          onChange={(e) => {
                            if (tempIdType === "Aadhar Card") {
                              setTempIdNumber(e.target.value.replace(/\D/g, "").slice(0, 12));
                            } else {
                              setTempIdNumber(e.target.value);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (
                              tempIdType === "Aadhar Card" &&
                              !/^\d$/.test(e.key) &&
                              !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"].includes(e.key) &&
                              !e.ctrlKey &&
                              !e.metaKey
                            ) {
                              e.preventDefault();
                            }
                          }}
                          className="w-full p-1.5 rounded border border-slate-300 bg-white font-mono"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAddIdentification}
                          className="w-full text-xs bg-slate-800 text-white"
                        >
                          Add ID
                        </Button>
                      </div>
                    </div>

                    {identificationsList.length > 0 && (
                      <div className="overflow-x-auto border border-slate-200 rounded">
                        <table className="w-full text-left text-xs bg-white">
                          <thead className="bg-slate-100 font-bold border-b border-slate-200">
                            <tr>
                              <th className="p-2 w-12">S.No.</th>
                              <th className="p-2">ID Type</th>
                              <th className="p-2">ID Number</th>
                              <th className="p-2 w-16 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {identificationsList.map((idItem, idx) => (
                              <tr key={idItem.id}>
                                <td className="p-2 font-bold text-slate-500">{idx + 1}</td>
                                <td className="p-2 font-semibold">{idItem.idType}</td>
                                <td className="p-2 font-mono">{idItem.idNumber}</td>
                                <td className="p-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setIdentificationsList(identificationsList.filter((_, i) => i !== idx))
                                    }
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Victim Information Section (Merged into Tab 3) */}
            <InlineVictimSection
              victimsList={victimsList}
              onAddVictim={handleAddVictim}
              onUpdateVictim={handleUpdateVictim}
              onDeleteVictim={handleDeleteVictim}
              onLinkComplainantAsVictim={handleLinkComplainantAsVictim}
              autofillComplainantData={victimAutofillData}
              autofillTrigger={victimAutofillTrigger}
            />
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: FIR CONTENT (10,000 CHAR LIMIT & COUNTER - NO VOICE BUTTONS) */}
        {/* ========================================================================= */}
        {activeTab === "fir_content" && (
          <div className="space-y-4 animate-in fade-in-30">
            <Card className="border-slate-200">
              <CardHeader className="py-2.5 px-4 bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  FIR Contents <span className="text-red-600">*</span>
                </CardTitle>
                <div className="flex items-center gap-3">
                  <VoiceInputButton
                    onTranscript={(t) =>
                      setFirContentText((prev) => (prev ? prev + " " + t : t))
                    }
                    currentValue={firContentText}
                    fieldLabel="FIR Contents"
                  />
                  <span
                    className={`text-[11px] font-mono font-bold ${
                      firContentText.length > 9500 ? "text-red-600" : "text-slate-500"
                    }`}
                  >
                    {firContentText.length} / 10,000 characters
                  </span>
                  {firContentText.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFirContentText("")}
                      className="text-[11px] text-red-600 hover:underline font-semibold"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                <div>
                  <AutoSuggestField
                    as="textarea"
                    rows={12}
                    entryType="FIR_CONTENT"
                    maxLength={10000}
                    placeholder="Enter verbatim complaint statement / written complaint contents as received from complainant. FIR content is statutory and mandatory u/s 173 BNSS."
                    value={firContentText}
                    onChange={(val) => setFirContentText(val)}
                    inputClassName={`font-serif leading-relaxed text-xs focus:ring-2 focus:ring-blue-500 ${getFieldHighlightClass("firContentText")}`}
                    enableGhost={false}
                    showAcceptBadge={false}
                    required
                  />
                  {errors.fir_content && (
                    <p className="text-red-600 text-[11px] font-bold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {errors.fir_content}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 block">
                      Brief Facts / Case Summary (For Police Records)
                    </label>
                    <div className="flex items-center gap-2">
                      <VoiceInputButton
                        onTranscript={(t) =>
                          setBriefFacts((prev) => (prev ? prev + " " + t : t))
                        }
                        currentValue={briefFacts}
                        fieldLabel="Brief Facts"
                        iconOnly={true}
                      />
                      <span className="text-[10px] font-mono text-slate-400">
                        {briefFacts.length} chars
                      </span>
                    </div>
                  </div>
                  <AutoSuggestField
                    as="textarea"
                    rows={3}
                    entryType="BRIEF_FACTS"
                    placeholder="Short summary of facts for investigation assignment and monitoring"
                    value={briefFacts}
                    onChange={(val) => setBriefFacts(val)}
                    inputClassName={`text-xs ${getFieldHighlightClass("briefFacts")}`}
                    enableGhost={false}
                    showAcceptBadge={false}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 block">
                      Reasons for Delay in reporting by Complainant / Informant (Printed Section 8)
                    </label>
                    <VoiceInputButton
                      onTranscript={(t) =>
                        setReasonsForDelay((prev) => (prev ? prev + " " + t : t))
                      }
                      currentValue={reasonsForDelay}
                      fieldLabel="Reasons for Delay"
                      iconOnly={true}
                    />
                  </div>
                  <AutoSuggestField
                    as="textarea"
                    rows={2}
                    entryType="DELAY_REASONS"
                    placeholder="If any delay occurred in reporting, record the specific reason here (e.g. hospitalization, medical examination, threat by accused, delay in discovering theft)"
                    value={reasonsForDelay}
                    onChange={(val) => setReasonsForDelay(val)}
                    inputClassName="text-xs"
                    enableGhost={false}
                    showAcceptBadge={false}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Action Taken Card (Merged from former Tab 5) */}
            <Card className="border-slate-200">
              <CardHeader className="py-2.5 px-4 bg-slate-50 border-b border-slate-200">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-600" />
                  Statutory Action Taken u/s 173 BNSS
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                {/* Secret / Invisible FIR Toggle */}
                <div className="flex items-center justify-between p-3 bg-purple-50/70 border border-purple-200 rounded-lg">
                  <div>
                    <span className="font-bold text-purple-900 block">Do you need to keep FIR Secret / Invisible?</span>
                    <span className="text-[11px] text-purple-700">
                      For POCSO, sexual offences, national security, or sensitive organized crime
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer font-bold">
                      <input
                        type="radio"
                        name="secretFir"
                        checked={isSecretFir}
                        onChange={() => setIsSecretFir(true)}
                        className="text-purple-600"
                      />
                      <span>Yes</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer font-bold">
                      <input
                        type="radio"
                        name="secretFir"
                        checked={!isSecretFir}
                        onChange={() => setIsSecretFir(false)}
                        className="text-purple-600"
                      />
                      <span>No</span>
                    </label>
                  </div>
                </div>

                {/* Action Taken Options */}
                <div>
                  <label className="font-bold text-slate-700 block mb-2">
                    Action Taken by Station House Officer (SHO) <span className="text-red-600">*</span>
                  </label>
                  <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-1 rounded-xl transition-all ${
                    errors.actionType ? "mandatory-glow-error border border-red-500 bg-red-50/40 ring-1 ring-red-400 p-2" : ""
                  }`}>
                    {actionTakenList.map((opt) => (
                      <label
                        key={opt}
                        className={`flex items-center gap-2.5 cursor-pointer p-3 rounded-lg border transition-all ${
                          actionType === opt
                            ? "border-blue-500 bg-blue-50/50 text-blue-950 font-bold shadow-xs"
                            : errors.actionType
                            ? "border-red-300 hover:bg-red-50/50 text-slate-800"
                            : "border-slate-200 hover:bg-slate-50 text-slate-800"
                        }`}
                      >
                        <input
                          type="radio"
                          name="actionType"
                          value={opt}
                          checked={actionType === opt}
                          onChange={() => {
                            setActionType(opt);
                            if (errors.actionType) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.actionType;
                                return next;
                              });
                            }
                          }}
                          className="text-blue-600"
                          required
                        />
                        <span className="text-xs">{opt}</span>
                      </label>
                    ))}
                  </div>
                  {errors.actionType && (
                    <p className="text-red-600 text-xs font-bold mt-1.5 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errors.actionType}</span>
                    </p>
                  )}
                </div>

                {/* IO Assignment Box */}
                {actionType === "Investigation/Assign IO" && (
                  (isSho || isSuperior) && !isMhc ? (
                    <div className="bg-blue-50/60 p-3 rounded-lg border border-blue-200 space-y-3 animate-in fade-in-30">
                      <label className="font-bold text-blue-900 block text-xs">
                        Select Investigating Officer (IO)
                      </label>
                      {/* FIR-03 fix: empty-station-roster guidance. Without this the
                          Register FIR button stays disabled with no visible reason. */}
                      {!ioRosterLoading && !ioRosterError && ioRoster.length === 0 && (
                        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 animate-in fade-in-30">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                          <div className="text-xs leading-relaxed">
                            <p className="font-bold">No eligible investigating officer in this station&apos;s roster.</p>
                            <p className="mt-0.5">
                              Registration cannot proceed with &quot;Investigation/Assign IO&quot; until an eligible officer is seeded in the
                              roster. Choose{" "}
                              <button
                                type="button"
                                onClick={() => {
                                  setActionType("Self Investigation");
                                  setErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.assignedIoId;
                                    return next;
                                  });
                                }}
                                className="underline font-bold hover:text-amber-950"
                              >
                                &quot;Self Investigation&quot;
                              </button>{" "}
                              to register the FIR under your own supervision.
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <select
                            value={assignedIoId}
                            onChange={(e) => setAssignedIoId(e.target.value)}
                            className="w-full p-2.5 rounded-lg border border-blue-300 bg-white font-semibold text-xs"
                          >
                            <option value="">-- Select Investigating Officer --</option>
                            {ioRosterLoading && <option disabled>Loading officers…</option>}
                            {ioRosterError && <option disabled>{ioRosterError}</option>}
                            {!ioRosterLoading && !ioRosterError && ioRoster.length === 0 && <option disabled>No eligible officers</option>}
                            {ioRoster.map((eo) => (
                              <option key={eo.id} value={eo.id}>
                                {eo.name} ({eo.rank}) - PNO: {eo.pno}
                              </option>
                            ))}
                          </select>
                          {errors.assignedIoId && <p role="alert" className="text-xs text-red-700">{errors.assignedIoId}</p>}
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-slate-600 font-medium">Directions / Guidelines to IO</span>
                            <VoiceInputButton
                              onTranscript={(t) => setAssignedDirections((prev) => (prev ? prev + " " + t : t))}
                              currentValue={assignedDirections}
                              fieldLabel="Directions to IO"
                              iconOnly={true}
                            />
                          </div>
                          <input
                            type="text"
                            placeholder="Directions / Guidelines to IO"
                            value={assignedDirections}
                            onChange={(e) => setAssignedDirections(e.target.value)}
                            className="w-full p-2.5 rounded-lg border border-blue-300 bg-white text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50/90 border border-amber-300 p-3.5 rounded-lg space-y-2 animate-in fade-in-30">
                      <div className="flex items-start gap-2.5">
                        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-amber-900">
                              Statutory Authority (PPR Rule 22.48 / 22.49)
                            </h4>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-200 text-amber-900">
                              Pending SHO Assignment
                            </span>
                          </div>
                          <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                            The <strong>Station House Officer (SHO)</strong> or a superior officer assigns the Investigating Officer (IO) after review.
                          </p>
                          <p className="text-[11px] text-amber-700 italic mt-1">
                            This FIR will be registered with IO pending allocation and placed in the SHO&apos;s supervisory queue.
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                )}

                {/* Refused Reason Box */}
                {actionType === "Refused" && (
                  <div className="bg-amber-50/70 p-3 rounded-lg border border-amber-200 space-y-2 animate-in fade-in-30">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-amber-900 block text-xs">
                        Reason for Refusal of Investigation u/s 173(1) BNSS
                      </label>
                      <VoiceInputButton
                        onTranscript={(t) => setRefusedReason((prev) => (prev ? prev + " " + t : t))}
                        currentValue={refusedReason}
                        fieldLabel="Reason for Refusal"
                        iconOnly={true}
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. Offence purely of non-cognizable civil dispute / No sufficient ground..."
                      value={refusedReason}
                      onChange={(e) => setRefusedReason(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-amber-300 bg-white text-xs"
                    />
                  </div>
                )}

                {/* Transferred PS Details Box */}
                {actionType === "Transferred" && (
                  <div className="bg-amber-50/70 p-3 rounded-lg border border-amber-200 space-y-2 animate-in fade-in-30">
                    <label className="font-bold text-amber-900 block text-xs">
                      Transferred Police Station &amp; District (Zero FIR)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-500">Transferred Police Station</span>
                          <VoiceInputButton
                            onTranscript={(t) => setTransferredPs(t)}
                            currentValue={transferredPs}
                            fieldLabel="Transferred Police Station"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Transferred Police Station Name"
                          value={transferredPs}
                          onChange={(e) => setTransferredPs(e.target.value)}
                          className="w-full p-2.5 rounded-lg border border-amber-300 bg-white text-xs"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-500">Transferred District</span>
                          <VoiceInputButton
                            onTranscript={(t) => setTransferredDistrict(t)}
                            currentValue={transferredDistrict}
                            fieldLabel="Transferred District"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Transferred District"
                          value={transferredDistrict}
                          onChange={(e) => setTransferredDistrict(e.target.value)}
                          className="w-full p-2.5 rounded-lg border border-amber-300 bg-white text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: ACCUSED (DIRECT INLINE ENTRY & RECORDED LIST) */}
        {/* ========================================================================= */}
        {activeTab === "accused" && (
          <div className="space-y-4 animate-in fade-in-30">
            {errors.accused && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-700 flex items-center gap-2 font-semibold text-xs shadow-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{errors.accused}</span>
              </div>
            )}
            <InlineAccusedSection
              accusedList={accusedList}
              isAccusedKnown={isAccusedKnown}
              setIsAccusedKnown={setIsAccusedKnown}
              accusedMoreThan={accusedMoreThan}
              setAccusedMoreThan={setAccusedMoreThan}
              onAddAccused={handleAddAccused}
              onUpdateAccused={handleUpdateAccused}
              onDeleteAccused={handleDeleteAccused}
              hasValidationErrors={Boolean(errors.accused)}
              validationErrorMsg={errors.accused}
            />
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: PROPERTY, HURT DETAILS & SIGNATURE (MERGED PANEL) */}
        {/* ========================================================================= */}
        {(activeTab === "property" || (activeTab as string) === "signature") && (
          <div className="space-y-4 animate-in fade-in-30">
            <Card className="border-slate-200">
              <CardHeader className="py-2.5 px-4 bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-600" />
                  Particulars of Properties of Interest (Printed Sections 9 &amp; 10)
                </CardTitle>
                <div className="flex items-center gap-3">
                  <div className="font-mono text-xs font-bold text-red-900 bg-red-50 border border-red-200 px-2.5 py-1 rounded">
                    Total Value: ₹{propertiesList.reduce((acc, p) => acc + (Number(p.estimatedValue) || 0), 0).toLocaleString("en-IN")}/-
                  </div>
                  {!showAddPropertyForm && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setShowAddPropertyForm(true)}
                      className="bg-[#0b192c] hover:bg-slate-800 text-white text-xs h-7 px-3 flex items-center gap-1 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5 mr-0.5" />
                      Add New
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                {/* Properties Table - with Nature of Property column */}
                {propertiesList.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5 w-12">S.No.</th>
                          <th className="p-2.5">Category</th>
                          <th className="p-2.5">Type</th>
                          <th className="p-2.5">Nature of Property</th>
                          <th className="p-2.5">Description</th>
                          <th className="p-2.5 text-right">Est. Value (₹)</th>
                          <th className="p-2.5 w-16 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {propertiesList.map((prop, idx) => (
                          <tr key={prop.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-500">{prop.srNo || idx + 1}</td>
                            <td className="p-2.5 font-semibold text-slate-900">{prop.propertyCategory}</td>
                            <td className="p-2.5 font-medium text-slate-700">{prop.propertyType}</td>
                            <td className="p-2.5 font-medium text-slate-700">{prop.natureOfProperty || ""}</td>
                            <td className="p-2.5 text-slate-700">{prop.description}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-red-900">
                              ₹{Number(prop.estimatedValue || 0).toLocaleString("en-IN")}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => setPropertiesList(propertiesList.filter((_, i) => i !== idx))}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 bg-slate-50/50 rounded-lg border border-dashed border-slate-200 space-y-2.5">
                    <p className="text-xs">No property added. If any property was involved, stolen, or recovered, click Add New below.</p>
                    {!showAddPropertyForm && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setShowAddPropertyForm(true)}
                        className="bg-[#0b192c] hover:bg-slate-800 text-white text-xs inline-flex items-center gap-1.5 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add New
                      </Button>
                    )}
                  </div>
                )}

                {/* Bottom Add New button when properties exist and form is hidden */}
                {!showAddPropertyForm && propertiesList.length > 0 && (
                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setShowAddPropertyForm(true)}
                      className="bg-[#0b192c] hover:bg-slate-800 text-white text-xs px-3.5 py-1.5 flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add New
                    </Button>
                  </div>
                )}

                {/* Add Property Form - Dependent Type Mapping, visible only when showAddPropertyForm is true */}
                {showAddPropertyForm && (
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3.5 animate-in fade-in-50">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="font-bold text-slate-800 block text-xs uppercase flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-amber-600" />
                        Add Property Particulars
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowAddPropertyForm(false);
                          setTempPropNature(NATURE_OF_PROPERTY_OPTIONS[0]);
                          setTempPropDescription("");
                          setTempPropValue("");
                        }}
                        className="h-6 px-2 text-slate-500 hover:text-slate-800 text-[11px]"
                      >
                        Cancel
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Property Category</span>
                        <select
                          value={tempPropCategory}
                          onChange={(e) => setTempPropCategory(e.target.value)}
                          className="w-full p-2 rounded border border-slate-300 bg-white font-medium text-xs"
                        >
                          {PROPERTY_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Property Type</span>
                        <select
                          value={tempPropType}
                          onChange={(e) => setTempPropType(e.target.value)}
                          className="w-full p-2 rounded border border-slate-300 bg-white font-medium text-xs"
                        >
                          {(PROPERTY_TYPES_BY_CATEGORY[tempPropCategory] || []).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Nature of Property</span>
                        <select
                          value={tempPropNature}
                          onChange={(e) => setTempPropNature(e.target.value)}
                          className="w-full p-2 rounded border border-slate-300 bg-white font-medium text-xs"
                        >
                          {NATURE_OF_PROPERTY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 block mb-0.5">Estimated Value (₹)</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="e.g. 45000"
                          value={tempPropValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "" || Number(val) >= 0) setTempPropValue(val);
                          }}
                          className="w-full p-2 rounded border border-slate-300 bg-white font-mono text-xs"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-slate-500 block">
                            Description (Make, Model, Serial, Specs, Registration)
                          </span>
                          <VoiceInputButton
                            onTranscript={(t) => setTempPropDescription((prev) => (prev ? prev + " " + t : t))}
                            currentValue={tempPropDescription}
                            fieldLabel="Property Description"
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. Samsung Galaxy S23 Ultra, IMEI 3589410291..., Black Color"
                          value={tempPropDescription}
                          onChange={(e) => setTempPropDescription(e.target.value)}
                          className="w-full p-2 rounded border border-slate-300 bg-white text-xs"
                        />
                      </div>

                      <div className="flex items-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAddProperty}
                          className="flex-1 bg-[#0b192c] hover:bg-slate-800 text-white text-xs h-[38px]"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Add Property
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowAddPropertyForm(false);
                            setTempPropDescription("");
                            setTempPropValue("");
                          }}
                          className="h-[38px] px-3 text-slate-600 border-slate-300 hover:bg-slate-100 text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Hurt & Injury Details Card (Merged from former Tab 9) */}
            <Card className="border-slate-200">
              <CardHeader className="py-2.5 px-4 bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-red-600" />
                  Hurt &amp; Injury Details
                </CardTitle>
                <button
                  type="button"
                  onClick={() => {
                    setCountDeceased("0");
                    setCountSeriouslyHurt("0");
                    setCountSimpleHurt("0");
                    setCountNonInjured("0");
                    setInjuryDescription("");
                  }}
                  className="text-[11px] text-red-600 hover:underline font-semibold cursor-pointer"
                >
                  Clear Hurt Details
                </button>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                {/* Counts - Validated non-negative integers */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <label className="text-[11px] font-bold text-red-900 block">Deceased Count</label>
                    <input
                      type="number"
                      min={0}
                      value={countDeceased}
                      onChange={(e) => handleHurtCountChange(setCountDeceased, e.target.value)}
                      className="w-full mt-1 p-2 rounded border border-slate-300 font-mono text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-amber-900 block">Seriously Hurt</label>
                    <input
                      type="number"
                      min={0}
                      value={countSeriouslyHurt}
                      onChange={(e) => handleHurtCountChange(setCountSeriouslyHurt, e.target.value)}
                      className="w-full mt-1 p-2 rounded border border-slate-300 font-mono text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-blue-900 block">Simple Hurt</label>
                    <input
                      type="number"
                      min={0}
                      value={countSimpleHurt}
                      onChange={(e) => handleHurtCountChange(setCountSimpleHurt, e.target.value)}
                      className="w-full mt-1 p-2 rounded border border-slate-300 font-mono text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block">Non-Injured</label>
                    <input
                      type="number"
                      min={0}
                      value={countNonInjured}
                      onChange={(e) => handleHurtCountChange(setCountNonInjured, e.target.value)}
                      className="w-full mt-1 p-2 rounded border border-slate-300 font-mono text-center font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 block">Injury Description</label>
                      <VoiceInputButton
                        onTranscript={(t) => setInjuryDescription((prev) => (prev ? prev + " " + t : t))}
                        currentValue={injuryDescription}
                        fieldLabel="Injury Description"
                        iconOnly={true}
                      />
                    </div>
                    <AutoSuggestField
                      as="textarea"
                      rows={3}
                      entryType="INJURY"
                      placeholder="Details of physical injuries, wounds, fractures, MLR number, Hospital admitted"
                      value={injuryDescription}
                      onChange={(val) => setInjuryDescription(val)}
                      inputClassName="w-full p-2.5 rounded border border-slate-300 text-xs overflow-hidden transition-[height] duration-75"
                      enableGhost={false}
                      showAcceptBadge={false}
                    />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Means / Weapon of Causing Injury
                      </label>
                      <select
                        value={weaponUsed}
                        onChange={(e) => setWeaponUsed(e.target.value)}
                        className="w-full p-2.5 rounded border border-slate-300 text-xs mb-3"
                      >
                        <option value="Physical assault / Blunt">Physical assault / Blunt object</option>
                        <option value="Sharp weapon / Knife / Dagger">Sharp weapon / Knife / Dagger</option>
                        <option value="Firearm / Gun">Firearm / Gun</option>
                        <option value="Vehicular impact / Accident">Vehicular impact / Accident</option>
                        <option value="Poison / Chemical">Poison / Chemical</option>
                        <option value="Fire / Burns">Fire / Burns</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                      <span className="font-bold text-slate-800">Whether CCTV / Video Footage Available?</span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1 cursor-pointer font-bold">
                          <input
                            type="radio"
                            name="footage"
                            checked={videoFootageAvailable}
                            onChange={() => setVideoFootageAvailable(true)}
                          />
                          <span>Yes</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer font-bold">
                          <input
                            type="radio"
                            name="footage"
                            checked={!videoFootageAvailable}
                            onChange={() => setVideoFootageAvailable(false)}
                          />
                          <span>No</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Signature & Authentication Section (Merged into Tab 6) */}
            <Card className="border-slate-200">
              <CardHeader className="py-2.5 px-4 bg-slate-50 border-b border-slate-200">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-blue-600" />
                  Signature &amp; Authentication
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Complainant Signature Note */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <span className="font-bold text-slate-800 block text-xs uppercase">
                      Informant / Complainant Verification
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Physical signature / thumb impression captured and verified on original Tehreer sheet.
                    </p>
                    <div className="h-36 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center bg-white p-2">
                      <CheckCircle2 className="w-7 h-7 text-emerald-600 mb-1" />
                      <span className="text-xs font-semibold text-slate-700">
                        {complainantFirstName} {complainantLastName || ""}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        Verified via Grievance Portal / Written Complaint Endorsement
                      </span>
                    </div>
                  </div>

                  {/* Officer Signature Canvas & Details */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 block text-xs uppercase">
                        Station House Officer (SHO) Digital Signature Pad
                      </span>
                      <button
                        type="button"
                        onClick={handleClearSignature}
                        className="text-[11px] text-red-600 hover:underline font-semibold"
                      >
                        Clear Canvas
                      </button>
                    </div>

                    {/* Hardware Offline Indicator */}
                    <div className="flex items-center justify-between p-2 rounded bg-amber-50 border border-amber-200 text-[11px]">
                      <div className="flex items-center gap-1.5 text-amber-900 font-medium">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        <span>Hardware Digitizer Pad: <strong>OFFLINE</strong></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHardwareOfflineNotice(!hardwareOfflineNotice)}
                        className="text-[10px] text-amber-800 underline font-semibold"
                      >
                        Connect / Retry
                      </button>
                    </div>

                    {hardwareOfflineNotice && (
                      <div className="text-[10px] text-amber-800 bg-amber-100/60 p-2 rounded border border-amber-200">
                        External USB signature pad device not detected on COM port. Please use on-screen canvas pad below or touchscreen stylus.
                      </div>
                    )}

                    {/* Canvas Signature Pad */}
                    <div className="border border-slate-300 rounded-lg bg-white overflow-hidden shadow-2xs">
                      <canvas
                        ref={canvasRef}
                        width={460}
                        height={120}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className="w-full h-28 cursor-crosshair block bg-white"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 text-center">
                      Draw signature above using mouse, touchpad, or touchscreen stylus
                    </p>

                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Officer Name</span>
                        <input
                          type="text"
                          value={officerName}
                          onChange={(e) => setOfficerName(e.target.value)}
                          className="w-full p-2 rounded border border-slate-300 bg-white font-semibold text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Rank</span>
                          <input
                            type="text"
                            value={officerRank}
                            onChange={(e) => setOfficerRank(e.target.value)}
                            className="w-full p-2 rounded border border-slate-300 bg-white text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Belt / PNO No.</span>
                          <input
                            type="text"
                            value={officerNumber}
                            onChange={(e) => setOfficerNumber(e.target.value)}
                            className="w-full p-2 rounded border border-slate-300 bg-white font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Validation Error Notice if active tab has missing mandatory fields */}
        {Object.keys(errors).length > 0 &&
          Object.keys(getTabValidationErrors(activeTab)).some((k) => k in errors) && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2 shadow-xs animate-in fade-in-20">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                आगे बढ़ने से पहले कृपया इस पैनल के सभी अनिवार्य फ़ील्ड (*) भरें (Please fill all mandatory fields marked with * in this panel before proceeding).
              </span>
            </div>
          )}

        {/* BOTTOM NAVIGATION FOOTER */}
        {/* Keep the mobile actions above the bottom nav and its safe area. */}
        <div className="sticky bottom-[calc(var(--cms-mobile-nav-height)+env(safe-area-inset-bottom,0px)+0.75rem+1px)] lg:bottom-0 z-20 bg-white/95 backdrop-blur-xs border-t border-slate-200 p-3.5 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Step Indicator on Left */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">
              Step {currentTabIndex + 1} of {TAB_CONFIG.length}: <span className="text-slate-800 font-bold">{TAB_CONFIG[currentTabIndex].label}</span>
            </span>
          </div>

          {/* Action Buttons on Right */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentTabIndex === 0}
              onClick={handlePrevTab}
              className="text-xs flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Previous Tab
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentTabIndex === TAB_CONFIG.length - 1}
              onClick={handleNextTab}
              className="text-xs flex items-center gap-1"
            >
              Next Tab
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSaveDraft(false)}
              className="text-xs text-slate-700 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5 text-blue-600" />
              Save Draft
            </Button>

            {/* Preview (IIF-I) - ONLY visible on the last panel */}
            {currentTabIndex === TAB_CONFIG.length - 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRegisteredFir(buildCurrentFirItem(true));
                  setReceiptMode("preview");
                  setShowReceiptModal(true);
                }}
                className="text-xs text-slate-700 flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5 text-purple-600" />
                Preview (IIF-I)
              </Button>
            )}

            {/* Register FIR button - ONLY visible on the last panel */}
            {currentTabIndex === TAB_CONFIG.length - 1 && (
              <Button
                type="submit"
                disabled={submitting || !allMandatoryFieldsFilled}
                title={!allMandatoryFieldsFilled ? "Please fill all mandatory fields (*) in every panel before registering the FIR." : undefined}
                className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-md px-5 py-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Scale className="w-4 h-4" />
                {submitting ? "Registering..." : "Register FIR"}
              </Button>
            )}
          </div>
        </div>
      </form>

      {/* ========================================================================= */}
      {/* DIALOG COMPONENTS */}
      {/* ========================================================================= */}

      {/* 1. GD Lookup Dialog */}
      <GDLookupDialog
        isOpen={showGDLookupDialog}
        onClose={() => setShowGDLookupDialog(false)}
        onSelectEntry={(entry: GDLookupResult) => {
          handleSearchAndAutofillGD(entry.diaryNumber);
        }}
      />


      {/* 6. Action Confirmation Dialog (Clear All, Discard/Close, Register FIR) */}
      <ConfirmActionDialog
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        confirmLabel={confirmConfig.confirmLabel}
        cancelLabel={confirmConfig.cancelLabel}
        variant={confirmConfig.variant}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Official IIF-I Modal */}
      {showReceiptModal && (
        <FIRReceiptModal
          fir={registeredFir}
          isOpen={showReceiptModal}
          onClose={() => {
            setShowReceiptModal(false);
            setRegisteredFir(null);
            if (receiptMode === "registered") {
              setReceiptMode(null);
              router.push("/fir");
              return;
            }
            // Preview (IIF-I): stay on the registration form with all data intact.
            setReceiptMode(null);
          }}
        />
      )}

      {/* Upload & Auto Fill FIR Modal */}
      <FIRUploadAutoFillModal
        isOpen={showUploadAutoFillModal}
        onClose={() => setShowUploadAutoFillModal(false)}
        targetFirNumber={autoFirNumber.firNumber}
        targetFirYear={autoFirNumber.firYear}
        currentStation={policeStation}
        currentDistrict={district}
        onApplyAutoFill={handleApplyAutoFill}
      />
    </div>
  );
}

export default function RegisterFIRPage() {
  const { currentUser, isAuthenticated } = useAuth();
  const [resetCount, setResetCount] = useState(0);
  if (isAuthenticated && !canRegisterFir(currentUser.role)) {
    return <div className="mx-auto max-w-xl p-8 text-center"><p>Your account can work on assigned FIRs. FIR registration requires an intake role.</p><Link className="mt-3 inline-block underline" href="/fir">Open FIR Register</Link></div>;
  }
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto p-12 text-center text-slate-400 text-sm">
          Loading FIR Registration Form...
        </div>
      }
    >
      {isAuthenticated && currentUser && <RegisterFIRForm key={JSON.stringify([currentUser.id, currentUser.stationName, currentUser.district, resetCount])} onReset={() => setResetCount(count => count + 1)} />}
    </Suspense>
  );
}
