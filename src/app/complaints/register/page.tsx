"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield,
  User,
  MapPin,
  FileText,
  AlertCircle,
  CheckCircle2,
  Upload,
  Printer,
  ArrowRight,
  ArrowLeft,
  Users,
  Building,
  Calendar,
  Phone,
  FileCheck,
  BookOpen,
  Mic,
  Search,
  ChevronDown,
  ShieldAlert,
  RotateCcw,
  Sparkles,
  X,
  Link2,
  FileCheck2,
  Clock,
  ExternalLink,
  Trash2,
  Video,
  Music,
  Image as ImageIcon,
  Paperclip,
  File,
  Plus,
  Check,
  Info,
  UserCheck,
  Download,
  Eye,
  Scale,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ComplaintService } from "@/services/complaintService";
import { complaintAutoFillService, ProcessedComplaintDocumentRecord } from "@/services/complaintAutoFillService";
import { universalEvidenceService } from "@/services/universalEvidenceService";
import { MOCK_ENQUIRY_OFFICERS } from "@/lib/mockData";
import {
  ComplaintItem,
  IntelligenceCheckResult,
  ComplaintEvidenceAttachment,
  ComplaintDocumentItem,
  RelativeRelation,
  AccusedPerson,
} from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePickerDDMMYYYY } from "@/components/ui/date-picker-ddmmyyyy";
import { VoiceInputButton } from "@/components/ui/voice-input-button";
import { ComplaintReceiptModal } from "@/components/complaints/ComplaintReceiptModal";
import {
  ComplaintVerificationModal,
  ComplaintPreviewData,
} from "@/components/complaints/ComplaintVerificationModal";
import { generateComplaintIntakeHtml } from "@/utils/complaintIntakeHtmlGenerator";
import {
  DropdownManagerService,
  DropdownItem,
} from "@/services/dropdownManagerService";

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

interface ComplainantFormItem {
  id: string;
  name: string;
  relationType?: RelativeRelation | string;
  relativeName?: string;
  gender?: "MALE" | "FEMALE" | "TRANSGENDER" | string;
  age?: string;
  nationalityChoice: "Indian" | "Other";
  otherNationality: string;
  nationality: string;
  countryCode: string;
  presentAddress: string;
  presentCity: string;
  presentDistrict: string;
  presentState: string;
  presentCountry: string;
  isPermanentSameAsPresent: boolean;
  permanentAddress: string;
  permanentCity: string;
  permanentDistrict: string;
  permanentState: string;
  permanentCountry: string;
  mobile: string;
}

interface AccusedFormItem {
  id: string;
  name: string;
  address: string;
  phone?: string;
  alias?: string;
  relationWithComplainant?: string;
}

// Intelligent extractor for multiple accused from police complaint text (e.g. बरखिलाफ:- 1. ... 2. ... 3. ... 4. ...)
function extractAccusedFromComplaintText(fullText: string, fallbackAddress?: string): AccusedFormItem[] {
  if (!fullText) return [];
  const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let commonAddr = fallbackAddress || "";
  for (const line of lines) {
    const addrMatch = line.match(/(?:सभी|दोनो|दोनों)?\s*निवासी(?:गण)?\s*[:\-]?\s*(.+)/i);
    if (addrMatch && addrMatch[1]) {
      const extractedAddr = addrMatch[1].replace(/[।.]*$/, "").trim();
      if (extractedAddr.length > 3) {
        commonAddr = extractedAddr;
        break;
      }
    }
  }

  const results: AccusedFormItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const numMatch = line.match(/^([1-9]|10)[.)]\s*(.+)/);
    if (numMatch && numMatch[2]) {
      const content = numMatch[2].trim();
      if (
        content.startsWith("यह कि") ||
        content.startsWith("प्राथिया") ||
        content.startsWith("प्रार्थिया") ||
        content.startsWith("श्रीमान") ||
        content.length > 150
      ) {
        continue;
      }

      let phone = "";
      const phoneMatch = content.match(/(?:मो[0o०\.]*\s*नं[0o०\.]*|mob|phone|mobile)?\s*[:\-]?\s*([6-9]\d{9})/i);
      if (phoneMatch) {
        phone = phoneMatch[1];
      }

      let alias = "";
      let relation = "";
      const roleMatch = content.match(/\(([^)]+)\)/);
      if (roleMatch) {
        alias = roleMatch[1].trim();
        relation = roleMatch[1].trim();
      }

      let cleanName = content
        .replace(/(?:मो[0o०\.]*\s*नं[0o०\.]*|mob|phone|mobile)?\s*[:\-]?\s*[6-9]\d{9}/gi, "")
        .replace(/\([^)]+\)/g, "")
        .replace(/निवासी.*$/i, "")
        .replace(/[,\-–|।.]+$/, "")
        .trim();

      if (cleanName.length > 1 && cleanName.length < 80) {
        results.push({
          id: `acc_${Date.now()}_${results.length + 1}`,
          name: cleanName,
          address: commonAddr || "",
          phone,
          alias,
          relationWithComplainant: relation,
        });
      }
    }
  }

  return results;
}

/**
 * Generates a concise synopsis / summary (संक्षिप्त सार) from the full complaint text
 * so that `complaintDescription` holds a concise summary rather than duplicating the entire complaint.
 */
function summarizeComplaintText(
  fullText: string,
  subject?: string,
  complainantName?: string,
  accusedNames?: string[]
): string {
  if (!fullText || !fullText.trim()) return subject || "";

  const clean = fullText.replace(/\r\n/g, "\n").trim();
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);

  // Filter out formal header/salutations and footer signatures
  const substantiveLines = lines.filter((line) => {
    const l = line.toLowerCase();
    if (/^(सेवा में|श्रीमान|थाना प्रभारी|महोदय|सादर प्रणाम|निवेदन है|to,|the sho|sir,|विषय[:\s]|sub[:\s])/i.test(l)) {
      return false;
    }
    if (/^(प्रार्थी|भवदीय|हस्ताक्षर|applicant|yours faithfully|sd\/-|धन्यवाद|दिनांक)/i.test(l)) {
      return false;
    }
    return true;
  });

  const bodyText = substantiveLines.join(" ").trim();
  // If short already (<= 250 chars), return it directly
  if (bodyText.length <= 250) {
    return bodyText;
  }

  // Split into sentences (by purna viram '।', question mark, exclamation, or period)
  const sentences = bodyText
    .split(/(?<=[।!?.\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  if (sentences.length <= 3) {
    return sentences.join(" ");
  }

  // Take the key initial 2-3 substantive allegations + concluding prayer sentence
  const opening = sentences.slice(0, 2).join(" ");
  const closing = sentences[sentences.length - 1];
  const summary = `${opening} ${closing}`.trim();

  // If summary is reasonably sized, return it, otherwise trim to ~450 chars cleanly
  if (summary.length > 480) {
    return summary.slice(0, 460).replace(/\s+\S*$/, "") + "...";
  }
  return summary;
}

export default function RegisterComplaintPage() {
  const router = useRouter();
  const { currentUser } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdComplaint, setCreatedComplaint] = useState<ComplaintItem | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [isReadOnlyPreview, setIsReadOnlyPreview] = useState(false);
  const [previewVerificationData, setPreviewVerificationData] = useState<ComplaintPreviewData | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [voiceLang, setVoiceLang] = useState<"hi-IN" | "en-IN">("hi-IN");

  // Permissions: Only MHC, SHO, and Superior officers can register complaints
  const isMhc = currentUser ? (currentUser.role === "MHC_GD_INCHARGE" || currentUser.role === "DUTY_OFFICER") : false;
  const isSho = currentUser ? (currentUser.role === "SHO" || currentUser.id === "usr_sho_1") : false;
  const isSuperior = currentUser ? (currentUser.role === "DSP_SUBDIV" || currentUser.role === "SP_DISTRICT" || currentUser.role === "SUPER_ADMIN") : false;
  const canRegisterComplaint = isMhc || isSho || isSuperior;
  const [shouldAssignEoNow, setShouldAssignEoNow] = useState(false);
  const [selectedEoId, setSelectedEoId] = useState("");
  const [directionTemplate, setDirectionTemplate] = useState("SPOT_VERIFY");
  const [assignedDirections, setAssignedDirections] = useState(DIRECTION_TEMPLATES[0].text);
  const [targetDays, setTargetDays] = useState(14);

  const handleTemplateChange = (tmplKey: string) => {
    setDirectionTemplate(tmplKey);
    const tmpl = DIRECTION_TEMPLATES.find((t) => t.key === tmplKey);
    if (tmpl) {
      if (tmpl.text) {
        setAssignedDirections(tmpl.text);
      }
      setTargetDays(tmpl.recommendedDays);
    }
  };

  // Top Section: Autofill from Uploaded Complaint Document
  const autofillFileInputRef = useRef<HTMLInputElement>(null);
  const [isAutofilling, setIsAutofilling] = useState(false);
  const [autofillProgress, setAutofillProgress] = useState(0);
  const [autofillStepText, setAutofillStepText] = useState("");
  const [processingFileInfo, setProcessingFileInfo] = useState<{
    name: string;
    size: number;
    category: string;
    typeLabel: string;
  } | null>(null);
  const [autofillSuccessNotice, setAutofillSuccessNotice] = useState<{
    fileName: string;
    category: string;
    typeLabel: string;
    dataUrl?: string;
    complainantName: string;
    complainantRelative: string;
    complainantMobile: string;
    accusedInfo: string;
    incidentPlace: string;
    categoryName: string;
    subject: string;
  } | null>(null);
  const [currentProcessedRecord, setCurrentProcessedRecord] = useState<ProcessedComplaintDocumentRecord | null>(null);

  // Common Header Configuration
  const [sourceChannel, setSourceChannel] = useState<
    "WALK_IN_STATION" | "CM_WINDOW_HARYANA" | "CITIZEN_PORTAL_HARPATH" | "EMERGENCY_112" | "SP_OFFICE_REFERENCE"
  >("WALK_IN_STATION");
  const [priorityLevel, setPriorityLevel] = useState<"ROUTINE" | "URGENT" | "CRITICAL_SENSITIVE" | "CM_WINDOW_VIP">("ROUTINE");

  // 1. Complainant Details (Supports multiple complainants)
  const [complainants, setComplainants] = useState<ComplainantFormItem[]>([
    {
      id: "comp_1",
      name: "",
      relationType: "S/O",
      relativeName: "",
      gender: "MALE",
      age: "",
      nationalityChoice: "Indian",
      otherNationality: "",
      nationality: "Indian",
      countryCode: "+91",
      presentAddress: "",
      presentCity: "Kurukshetra",
      presentDistrict: "Kurukshetra",
      presentState: "Haryana",
      presentCountry: "India",
      isPermanentSameAsPresent: true,
      permanentAddress: "",
      permanentCity: "Kurukshetra",
      permanentDistrict: "Kurukshetra",
      permanentState: "Haryana",
      permanentCountry: "India",
      mobile: "",
    },
  ]);

  // 2. Accused Details (Default: NO)
  const [isAccusedKnown, setIsAccusedKnown] = useState<boolean>(false);
  const [accusedList, setAccusedList] = useState<AccusedFormItem[]>([
    {
      id: "acc_1",
      name: "",
      address: "",
      phone: "",
      alias: "",
      relationWithComplainant: "",
    },
  ]);

  // 3. Incident Details
  const [incidentPlace, setIncidentPlace] = useState("");
  const [incidentLandmark, setIncidentLandmark] = useState("");
  const [isDateTimeKnown, setIsDateTimeKnown] = useState<boolean>(true);
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().split("T")[0]);
  const [incidentTime, setIncidentTime] = useState("11:30");
  const [incidentApproxPeriod, setIncidentApproxPeriod] = useState("");
  const [incidentCategory, setIncidentCategory] = useState<
    | "CYBER_CRIME"
    | "PROPERTY_THEFT_BURGLARY"
    | "FINANCIAL_FRAUD_CHEATING"
    | "LAND_PROPERTY_DISPUTE"
    | "PHYSICAL_ASSAULT_AFFRAY"
    | "DOMESTIC_VIOLENCE_DOWRY"
    | "PUBLIC_NUISANCE"
    | "MISSING_PERSON"
    | "NARCOTICS_DRUGS_INFO"
    | "HARASSMENT_STALKING"
    | "OTHER_GENERAL"
  >("FINANCIAL_FRAUD_CHEATING");
  const [incidentDetails, setIncidentDetails] = useState("");
  const [attachments, setAttachments] = useState<ComplaintEvidenceAttachment[]>([]);

  // 4. Complaint Details
  const [intakeMode, setIntakeMode] = useState<string>("WALK_IN_STATION");
  const [complaintSubject, setComplaintSubject] = useState<string>("");
  const [complaintDescription, setComplaintDescription] = useState<string>("");
  const [isFirRegistered, setIsFirRegistered] = useState<boolean>(false);
  const [firNumber, setFirNumber] = useState<string>("");
  const [firDate, setFirDate] = useState<string>("");
  const [complaintAgeType, setComplaintAgeType] = useState<"FRESH" | "OLD">("FRESH");
  const [complaintClassification, setComplaintClassification] = useState<string>("COGNIZABLE_OFFENCE");
  const [complaintPurpose, setComplaintPurpose] = useState<string>("PRELIMINARY_ENQUIRY_BNSS_173");


  // 4. Intelligence Check States
  const [intelDropdownOpen, setIntelDropdownOpen] = useState(false);
  const [showIntelModal, setShowIntelModal] = useState(false);
  const [activeIntelTab, setActiveIntelTab] = useState<"all" | "cross" | "repeat" | "linked" | "fir">("all");
  const [intelResult, setIntelResult] = useState<IntelligenceCheckResult | null>(null);
  const [linkedComplaintNo, setLinkedComplaintNo] = useState<string>("");
  const [isCrossCaseTagged, setIsCrossCaseTagged] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Evidence File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isDraggingEvidence, setIsDraggingEvidence] = useState(false);
  const [isDraggingAutofill, setIsDraggingAutofill] = useState(false);
  const [previewModalFile, setPreviewModalFile] = useState<{
    name: string;
    category: string;
    dataUrl?: string;
    size?: number | string;
  } | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  // Dynamic Dropdown Options from Dropdown Manager
  const [dynamicCategories, setDynamicCategories] = useState<DropdownItem[]>([]);
  const [dynamicRelations, setDynamicRelations] = useState<DropdownItem[]>([]);

  useEffect(() => {
    const cats = DropdownManagerService.getItems("complaint_categories", true);
    if (cats && cats.length > 0) setDynamicCategories(cats);
    const rels = DropdownManagerService.getItems("relation_types", true);
    if (rels && rels.length > 0) setDynamicRelations(rels);

    const handleUpdate = () => {
      const updatedCats = DropdownManagerService.getItems("complaint_categories", true);
      if (updatedCats && updatedCats.length > 0) setDynamicCategories(updatedCats);
      const updatedRels = DropdownManagerService.getItems("relation_types", true);
      if (updatedRels && updatedRels.length > 0) setDynamicRelations(updatedRels);
    };
    window.addEventListener("cms-dropdowns-updated", handleUpdate);
    return () => window.removeEventListener("cms-dropdowns-updated", handleUpdate);
  }, []);

  // Convert base64 dataUrl into Blob Object URL for reliable native PDF rendering
  useEffect(() => {
    if (!previewModalFile?.dataUrl) {
      setPreviewBlobUrl(null);
      return;
    }

    const isPdf =
      previewModalFile.name.toLowerCase().endsWith(".pdf") ||
      previewModalFile.dataUrl.startsWith("data:application/pdf");

    if (isPdf && previewModalFile.dataUrl.startsWith("data:")) {
      try {
        const parts = previewModalFile.dataUrl.split(",");
        const byteCharacters = atob(parts[1] || "");
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const blobUrl = URL.createObjectURL(blob);
        setPreviewBlobUrl(blobUrl);

        return () => {
          URL.revokeObjectURL(blobUrl);
        };
      } catch (e) {
        console.warn("Could not create Blob URL for PDF:", e);
        setPreviewBlobUrl(previewModalFile.dataUrl);
      }
    } else {
      setPreviewBlobUrl(previewModalFile.dataUrl);
    }
  }, [previewModalFile]);

  // FORM DRAFT STORAGE KEY: Prevents losing filled data on page navigation / refresh
  const FORM_DRAFT_KEY = "haryana_police_cms_register_form_draft_v1";

  // DRAFT MANAGEMENT STATE
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [hasStoredDraft, setHasStoredDraft] = useState<boolean>(false);
  const [draftBannerDismissed, setDraftBannerDismissed] = useState<boolean>(false);
  const [draftToast, setDraftToast] = useState<string | null>(null);

  // AUTOFILL HIGHLIGHT TRACKING
  const [autofilledFieldKeys, setAutofilledFieldKeys] = useState<Set<string>>(new Set());

  // EVIDENCE UPLOAD ENHANCEMENTS
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const isAutofilled = (key: string) => autofilledFieldKeys.has(key);
  const getAutofillGreenClass = (key: string) =>
    isAutofilled(key)
      ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100 transition-all"
      : "";
  const markFieldAsEdited = (key: string) => {
    setAutofilledFieldKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  // Helper: check if data has genuine user entries (not all blank/empty)
  const hasFormContent = (data: any): boolean => {
    if (!data) return false;
    const hasComp = Array.isArray(data.complainants) && data.complainants.some(
      (c: any) => Boolean(
        c.name?.trim() ||
        c.relativeName?.trim() ||
        c.mobile?.trim() ||
        c.presentAddress?.trim() ||
        (c.age && String(c.age).trim())
      )
    );
    const hasInc = Boolean(
      data.incidentPlace?.trim() ||
      data.incidentLandmark?.trim() ||
      data.incidentDetails?.trim() ||
      data.complaintSubject?.trim() ||
      data.complaintDescription?.trim() ||
      data.firNumber?.trim() ||
      data.assignedDirections?.trim()
    );
    const hasAcc = Array.isArray(data.accusedList) && data.accusedList.some(
      (a: any) => Boolean(a.name?.trim() || a.address?.trim() || a.phone?.trim() || a.alias?.trim())
    );
    const hasAttach = Array.isArray(data.attachments) && data.attachments.length > 0;
    return Boolean(hasComp || hasInc || hasAcc || hasAttach);
  };

  // Helper: apply all draft fields to React state
  const applyDraftData = (draft: any) => {
    if (!draft) return;
    if (draft.sourceChannel) setSourceChannel(draft.sourceChannel);
    if (draft.priorityLevel) setPriorityLevel(draft.priorityLevel);
    if (Array.isArray(draft.complainants) && draft.complainants.length > 0) setComplainants(draft.complainants);
    if (typeof draft.isAccusedKnown === "boolean") setIsAccusedKnown(draft.isAccusedKnown);
    if (Array.isArray(draft.accusedList) && draft.accusedList.length > 0) setAccusedList(draft.accusedList);
    if (draft.incidentPlace !== undefined) setIncidentPlace(draft.incidentPlace);
    if (draft.incidentLandmark !== undefined) setIncidentLandmark(draft.incidentLandmark);
    if (typeof draft.isDateTimeKnown === "boolean") setIsDateTimeKnown(draft.isDateTimeKnown);
    if (draft.incidentDate !== undefined) setIncidentDate(draft.incidentDate);
    if (draft.incidentTime !== undefined) setIncidentTime(draft.incidentTime);
    if (draft.incidentApproxPeriod !== undefined) setIncidentApproxPeriod(draft.incidentApproxPeriod);
    if (draft.incidentCategory !== undefined) setIncidentCategory(draft.incidentCategory);
    if (draft.incidentDetails !== undefined) setIncidentDetails(draft.incidentDetails);
    if (Array.isArray(draft.attachments)) setAttachments(draft.attachments);
    if (draft.intakeMode !== undefined) setIntakeMode(draft.intakeMode);
    if (draft.complaintSubject !== undefined) setComplaintSubject(draft.complaintSubject);
    if (draft.complaintDescription !== undefined) setComplaintDescription(draft.complaintDescription);
    if (typeof draft.isFirRegistered === "boolean") setIsFirRegistered(draft.isFirRegistered);
    if (draft.firNumber !== undefined) setFirNumber(draft.firNumber);
    if (draft.firDate !== undefined) setFirDate(draft.firDate);
    if (draft.complaintAgeType !== undefined) setComplaintAgeType(draft.complaintAgeType);
    if (draft.complaintClassification !== undefined) setComplaintClassification(draft.complaintClassification);
    if (draft.complaintPurpose !== undefined) setComplaintPurpose(draft.complaintPurpose);
    if (draft.selectedEoId !== undefined) {
      setSelectedEoId(draft.selectedEoId);
      setShouldAssignEoNow(Boolean(draft.selectedEoId));
    }
    if (draft.directionTemplate !== undefined) setDirectionTemplate(draft.directionTemplate);
    if (draft.assignedDirections !== undefined) setAssignedDirections(draft.assignedDirections);
    if (draft.targetDays !== undefined) setTargetDays(draft.targetDays);
    if (Array.isArray(draft.autofilledFieldKeys) && draft.autofilledFieldKeys.length > 0) {
      setAutofilledFieldKeys(new Set(draft.autofilledFieldKeys));
    }
  };

  // 1. Check and restore saved form draft on page mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(FORM_DRAFT_KEY);
      if (!saved) {
        setHasStoredDraft(false);
        return;
      }
      const draft = JSON.parse(saved);
      if (!draft || !hasFormContent(draft)) {
        return;
      }

      setHasStoredDraft(true);
      if (draft.savedAt) setDraftSavedAt(draft.savedAt);

      // Auto-restore so user never loses work when returning to this page
      applyDraftData(draft);
    } catch (e) {
      console.warn("Could not restore form draft from localStorage:", e);
    }
  }, []);

  // 2. Automatically save filled form values to localStorage whenever valid content is entered (debounced)
  useEffect(() => {
    if (typeof window === "undefined" || createdComplaint) return;

    const timer = setTimeout(() => {
      const currentData = {
        sourceChannel,
        priorityLevel,
        complainants,
        isAccusedKnown,
        accusedList,
        incidentPlace,
        incidentLandmark,
        isDateTimeKnown,
        incidentDate,
        incidentTime,
        incidentApproxPeriod,
        incidentCategory,
        incidentDetails,
        attachments: attachments.map((a: any) => ({ ...a, dataUrl: undefined })),
        intakeMode,
        complaintSubject,
        complaintDescription,
        isFirRegistered,
        firNumber,
        firDate,
        complaintAgeType,
        complaintClassification,
        complaintPurpose,
        selectedEoId,
        directionTemplate,
        assignedDirections,
        targetDays,
        autofilledFieldKeys: Array.from(autofilledFieldKeys),
      };

      if (!hasFormContent(currentData)) {
        return;
      }

      try {
        const nowStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const draft = {
          ...currentData,
          savedAt: nowStr,
        };
        window.localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draft));
        setDraftSavedAt(nowStr);
        setHasStoredDraft(true);
      } catch (e) {
        // Silently ignore quota warning for draft
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [
    sourceChannel,
    priorityLevel,
    complainants,
    isAccusedKnown,
    accusedList,
    incidentPlace,
    incidentLandmark,
    isDateTimeKnown,
    incidentDate,
    incidentTime,
    incidentApproxPeriod,
    incidentCategory,
    incidentDetails,
    attachments,
    intakeMode,
    complaintSubject,
    complaintDescription,
    isFirRegistered,
    firNumber,
    firDate,
    complaintAgeType,
    complaintClassification,
    complaintPurpose,
    selectedEoId,
    directionTemplate,
    assignedDirections,
    targetDays,
    autofilledFieldKeys,
    createdComplaint,
  ]);

  const handleRestoreDraft = () => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(FORM_DRAFT_KEY);
      if (!saved) {
        setDraftToast("No saved draft found in local storage.");
        setTimeout(() => setDraftToast(null), 3000);
        return;
      }
      const draft = JSON.parse(saved);
      applyDraftData(draft);
      setDraftSavedAt(draft.savedAt || new Date().toLocaleTimeString("en-IN"));
      setDraftToast("Last filled draft restored successfully! / सुरक्षित ड्राफ्ट पुनः लोड हो गया!");
      setDraftBannerDismissed(true);
      setTimeout(() => setDraftToast(null), 4000);
    } catch (e) {
      setDraftToast("Failed to restore draft.");
      setTimeout(() => setDraftToast(null), 3000);
    }
  };

  const handleManualSaveDraft = () => {
    if (typeof window === "undefined") return;
    try {
      const nowStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const draft = {
        sourceChannel,
        priorityLevel,
        complainants,
        isAccusedKnown,
        accusedList,
        incidentPlace,
        incidentLandmark,
        isDateTimeKnown,
        incidentDate,
        incidentTime,
        incidentApproxPeriod,
        incidentCategory,
        incidentDetails,
        attachments: attachments.map((a: any) => ({ ...a, dataUrl: undefined })),
        intakeMode,
        complaintSubject,
        complaintDescription,
        isFirRegistered,
        firNumber,
        firDate,
        complaintAgeType,
        complaintClassification,
        complaintPurpose,
        selectedEoId,
        directionTemplate,
        assignedDirections,
        targetDays,
        autofilledFieldKeys: Array.from(autofilledFieldKeys),
        savedAt: nowStr,
      };
      window.localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draft));
      setDraftSavedAt(nowStr);
      setHasStoredDraft(true);
      setDraftToast(`Form draft saved successfully at ${nowStr}!`);
      setTimeout(() => setDraftToast(null), 3000);
    } catch {}
  };

  const handleDiscardDraft = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(FORM_DRAFT_KEY);
    }
    setHasStoredDraft(false);
    setDraftSavedAt(null);
    setDraftBannerDismissed(true);
    setDraftToast("Saved draft discarded.");
    setTimeout(() => setDraftToast(null), 3000);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIntelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Function to completely clear all fields in Register Complaint form & purge saved draft
  const handleClearForm = () => {
    // 1. Reset Complainants
    setComplainants([
      {
        id: "comp_1",
        name: "",
        relationType: "S/O",
        relativeName: "",
        gender: "MALE",
        age: "",
        nationalityChoice: "Indian",
        otherNationality: "",
        nationality: "Indian",
        countryCode: "+91",
        presentAddress: "",
        presentCity: "Kurukshetra",
        presentDistrict: currentUser.district || "Kurukshetra",
        presentState: "Haryana",
        presentCountry: "India",
        isPermanentSameAsPresent: true,
        permanentAddress: "",
        permanentCity: "Kurukshetra",
        permanentDistrict: currentUser.district || "Kurukshetra",
        permanentState: "Haryana",
        permanentCountry: "India",
        mobile: "",
      },
    ]);

    // 2. Reset Accused
    setIsAccusedKnown(false);
    setAccusedList([
      {
        id: "acc_1",
        name: "",
        address: "",
        phone: "",
        alias: "",
        relationWithComplainant: "",
      },
    ]);

    // 3. Reset Incident
    setIncidentPlace("");
    setIncidentLandmark("");
    setIsDateTimeKnown(true);
    setIncidentDate(new Date().toISOString().split("T")[0]);
    setIncidentTime("11:30");
    setIncidentApproxPeriod("");
    setIncidentCategory("FINANCIAL_FRAUD_CHEATING");
    setIncidentDetails("");
    setAttachments([]);

    // 4. Reset Complaint Details
    setIntakeMode("WALK_IN_STATION");
    setComplaintSubject("");
    setComplaintDescription("");
    setIsFirRegistered(false);
    setFirNumber("");
    setFirDate("");
    setComplaintAgeType("FRESH");
    setComplaintClassification("COGNIZABLE_OFFENCE");
    setComplaintPurpose("PRELIMINARY_ENQUIRY_BNSS_173");

    // 5. Reset Intel & Validation states
    setValidationErrors({});
    setAutofillSuccessNotice(null);
    setLinkedComplaintNo("");
    setIsCrossCaseTagged(false);
    setPreviewModalFile(null);

    // 6. Purge saved draft from localStorage & reset draft indicators
    setAutofilledFieldKeys(new Set());
    setHasStoredDraft(false);
    setDraftSavedAt(null);
    setDraftBannerDismissed(true);
    setDraftToast("Form cleared.");
    setTimeout(() => setDraftToast(null), 3000);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(FORM_DRAFT_KEY);
      }
    } catch (e) {
      console.warn("Could not clear form draft from localStorage:", e);
    }
  };

  // Complainant Handlers
  const handleAddComplainant = () => {
    setComplainants((prev) => [
      ...prev,
      {
        id: `comp_${Date.now()}`,
        name: "",
        relationType: "S/O",
        relativeName: "",
        gender: "MALE",
        age: "",
        nationalityChoice: "Indian",
        otherNationality: "",
        nationality: "Indian",
        countryCode: "+91",
        presentAddress: "",
        presentCity: "Kurukshetra",
        presentDistrict: "Kurukshetra",
        presentState: "Haryana",
        presentCountry: "India",
        isPermanentSameAsPresent: true,
        permanentAddress: "",
        permanentCity: "Kurukshetra",
        permanentDistrict: "Kurukshetra",
        permanentState: "Haryana",
        permanentCountry: "India",
        mobile: "",
      },
    ]);
  };

  const handleRemoveComplainant = (index: number) => {
    if (complainants.length <= 1) return;
    setComplainants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleComplainantChange = (index: number, field: keyof ComplainantFormItem, value: any) => {
    setComplainants((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };

      if (field === "nationalityChoice") {
        item.nationalityChoice = value;
        if (value === "Indian") {
          item.nationality = "Indian";
          item.otherNationality = "";
          item.countryCode = "+91";
          item.presentCountry = "India";
          if (item.isPermanentSameAsPresent) {
            item.permanentCountry = "India";
          }
          item.mobile = item.mobile.replace(/\D/g, "").slice(0, 10);
        } else {
          item.nationality = item.otherNationality || "";
          item.presentCountry = "";
          if (item.isPermanentSameAsPresent) {
            item.permanentCountry = "";
          }
        }
      } else if (field === "otherNationality") {
        item.otherNationality = value;
        item.nationality = value;
      } else if (field === "mobile") {
        if (item.nationalityChoice === "Indian") {
          item.mobile = String(value).replace(/\D/g, "").slice(0, 10);
        } else {
          item.mobile = String(value).replace(/[^\d\s\-]/g, "").slice(0, 15);
        }
      } else if (field === "isPermanentSameAsPresent") {
        item.isPermanentSameAsPresent = Boolean(value);
        if (value) {
          item.permanentAddress = item.presentAddress;
          item.permanentCity = item.presentCity;
          item.permanentDistrict = item.presentDistrict;
          item.permanentState = item.presentState;
          item.permanentCountry = item.presentCountry;
        }
      } else {
        (item as any)[field] = value;
        // If permanent is checked, sync address fields
        if (item.isPermanentSameAsPresent) {
          if (field === "presentAddress") item.permanentAddress = value;
          if (field === "presentCity") item.permanentCity = value;
          if (field === "presentDistrict") item.permanentDistrict = value;
          if (field === "presentState") item.permanentState = value;
          if (field === "presentCountry") item.permanentCountry = value;
        }
      }

      updated[index] = item;
      return updated;
    });

    // Clear validation error if any
    const errorKey = `comp_${index}_${field}`;
    if (validationErrors[errorKey]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[errorKey];
        return next;
      });
    }
  };

  // Accused Handlers
  const handleAddAccused = () => {
    setAccusedList((prev) => [
      ...prev,
      {
        id: `acc_${Date.now()}`,
        name: "",
        address: "",
        phone: "",
        alias: "",
        relationWithComplainant: "",
      },
    ]);
  };

  const handleRemoveAccused = (index: number) => {
    if (accusedList.length <= 1) return;
    setAccusedList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAccusedChange = (index: number, field: keyof AccusedFormItem, value: any) => {
    setAccusedList((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });

    const errorKey = `acc_${index}_${field}`;
    if (validationErrors[errorKey]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[errorKey];
        return next;
      });
    }
  };

  // File Upload Helper
  const getFileCategory = (file: File): "document" | "video" | "audio" | "image" | "other" => {
    const mime = file.type.toLowerCase();
    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    if (mime.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg", "aac", "flac"].includes(ext)) {
      return "audio";
    }
    if (mime.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm", "3gp"].includes(ext)) {
      return "video";
    }
    if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"].includes(ext)) {
      return "image";
    }
    if (
      mime.includes("pdf") ||
      mime.includes("word") ||
      mime.includes("document") ||
      mime.includes("sheet") ||
      mime.includes("excel") ||
      mime.includes("text") ||
      ["pdf", "doc", "docx", "txt", "rtf", "odt", "xls", "xlsx", "csv"].includes(ext)
    ) {
      return "document";
    }
    return "other";
  };

  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);

    const fileArray = Array.from(files);

    // Validate size limit up to 20 MB per file
    const oversized = fileArray.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setUploadError(
        `File size limit exceeded: ${oversized
          .map((f) => `"${f.name}" (${(f.size / (1024 * 1024)).toFixed(1)} MB)`)
          .join(", ")} exceeds the maximum allowed limit of 20 MB per file.`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploadingFiles(true);
    setUploadProgress(15);

    let loadedCount = 0;
    const newAttachments: ComplaintEvidenceAttachment[] = [];

    fileArray.forEach((file) => {
      const category = getFileCategory(file);
      const reader = new FileReader();

      reader.onload = (e) => {
        const attId = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const dataUrlStr = e.target?.result as string;
        newAttachments.push({
          id: attId,
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          category,
          dataUrl: dataUrlStr,
          uploadedAt: new Date().toISOString(),
          description: "",
        });

        universalEvidenceService
          .registerAndProcess({
            file,
            dataUrl: dataUrlStr,
            fileName: file.name,
            fileId: attId,
            module: "COMPLAINTS",
            uploadedBy: currentUser?.name || "Intake Officer",
          })
          .catch((err) => console.warn("Background evidence registration warning:", err));

        loadedCount++;
        const pct = Math.round((loadedCount / fileArray.length) * 100);
        setUploadProgress(pct);

        if (loadedCount === fileArray.length) {
          setAttachments((prev) => [...prev, ...newAttachments]);
          setIsUploadingFiles(false);
          setUploadProgress(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };

      reader.onerror = () => {
        loadedCount++;
        setUploadError(`Failed to process file "${file.name}". Please try uploading again.`);
        if (loadedCount === fileArray.length) {
          setIsUploadingFiles(false);
          setUploadProgress(null);
        }
      };

      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAttachment = (id: string) => {
    const target = attachments.find((a) => a.id === id);
    if (
      currentProcessedRecord &&
      (currentProcessedRecord.documentId === id ||
        currentProcessedRecord.id === id ||
        (target && (currentProcessedRecord.rawDocument?.fileName === target.name || currentProcessedRecord.processedData?.classifiedDocumentName === target.name)))
    ) {
      complaintAutoFillService.deleteByDocumentId(id);
      if (currentProcessedRecord.rawDocument?.fileName) {
        complaintAutoFillService.deleteByFileName(currentProcessedRecord.rawDocument.fileName);
      }
      setCurrentProcessedRecord(null);
      setAutofillSuccessNotice(null);
    }
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleAttachmentDescriptionChange = (id: string, desc: string) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, description: desc } : a)));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // 0. Intelligent Autofill from Uploaded Written / Scanned / Audio / Photo Complaint Document
  const handleAutofillFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    // Determine media category and human label
    const category = getFileCategory(file);
    const isAudio = category === "audio" || /\.(mp3|wav|m4a|aac|ogg|wma)$/i.test(file.name);
    const isImage = category === "image" || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

    let typeLabel = "Digital Written Petition (Text Document)";
    if (isAudio) typeLabel = "Citizen Voice / Audio Recording (Speech-to-Text)";
    else if (isImage) typeLabel = "Handwritten Application / Scanned Photo (OCR Vision)";
    else if (isPdf) typeLabel = "Scanned Police Complaint PDF (Layout Parser)";

    setIsAutofilling(true);
    setAutofillProgress(15);
    setAutofillStepText(`Scanning & reading ${file.name} (${typeLabel})...`);
    setProcessingFileInfo({
      name: file.name,
      size: file.size,
      category,
      typeLabel,
    });
    setAutofillSuccessNotice(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;

      // 1. Seal this document into the complaint docket attachments
      const attachedDoc: ComplaintEvidenceAttachment = {
        id: `ev_draft_${Date.now()}`,
        name: file.name,
        size: file.size,
        type: file.type || (isPdf ? "application/pdf" : isImage ? "image/jpeg" : isAudio ? "audio/mpeg" : "application/octet-stream"),
        category,
        dataUrl,
        uploadedAt: new Date().toISOString(),
        description: "",
      };
      setAttachments((prev) => [attachedDoc, ...prev.filter((a) => a.name !== file.name)]);

      // Check if it's a readable text file
      if (file.type.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(file.name)) {
        const textReader = new FileReader();
        textReader.onload = (te) => {
          const textContent = te.target?.result as string;
          executeExtractionPipeline(file, dataUrl, typeLabel, category, textContent, attachedDoc.id);
        };
        textReader.readAsText(file);
      } else {
        executeExtractionPipeline(file, dataUrl, typeLabel, category, undefined, attachedDoc.id);
      }
    };

    reader.readAsDataURL(file);
  };

  // Execution pipeline powered by Gemini 3.5 Flash Model
  const executeExtractionPipeline = async (
    file: File,
    dataUrl: string,
    typeLabel: string,
    category: string,
    textContent?: string,
    attachedDocId?: string
  ) => {
    try {
      setAutofillProgress(35);
      setAutofillStepText(`Analyzing document with Gemini 3.5 Flash AI model...`);

      const formData = new FormData();
      formData.append("file", file);
      if (textContent) {
        formData.append("text", textContent);
      }

      setAutofillProgress(60);
      setAutofillStepText("Verifying inner contents & classifying document name...");

      const res = await fetch("/api/complaints/autofill", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`API returned status ${res.status}`);
      }

      const resJson = await res.json();
      if (!resJson.success || !resJson.data) {
        throw new Error(resJson.error || "Failed to parse document with Gemini model");
      }

      setAutofillProgress(90);
      setAutofillStepText("Applying extracted fields & renaming evidence with verified classification...");

      const geminiData = resJson.data;

      // Automatically rename and classify the document based on verified inner contents
      const classifiedName = geminiData.classifiedDocumentName || file.name;
      const verifiedTitle = geminiData.verifiedDocumentTitle || typeLabel;

      // Update the sealed attachment with the classified, verified filename, description, and processed flags
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === attachedDocId || a.name === file.name
            ? {
                ...a,
                name: classifiedName,
                description: "",
                isAutoFilled: true,
                isProcessed: true,
                processedRecordId: attachedDocId || `proc_${Date.now()}`,
              }
            : a
        )
      );

      // Populate Form Fields from Gemini 3.5 Flash extraction
      const c = geminiData.complainant || {};
      const a = geminiData.accused || {};
      const inc = geminiData.incident || {};
      const comp = geminiData.complaint || {};

      // 1. Complainant details - STRICT: ONLY fill what was found in the document!
      const extractedName = c.name ? String(c.name).trim() : "";
      const extractedAge = c.age && String(c.age).trim() !== "" ? String(c.age).trim() : "";
      const extractedCity = c.city ? String(c.city).trim() : "";
      const extractedDistrict = c.district ? String(c.district).trim() : "";
      const extractedState = c.state ? String(c.state).trim() : "";
      const extractedAddress = c.presentAddress ? String(c.presentAddress).trim() : "";
      const extractedMobile = c.mobile ? String(c.mobile).replace(/\D/g, "").slice(0, 10) : "";
      const extractedRelativeName = c.relativeName ? String(c.relativeName).trim() : "";
      const extractedRelationType = c.relationType ? (c.relationType as RelativeRelation) : (c.gender === "FEMALE" ? "W/O" : "S/O");
      const extractedGender = c.gender === "FEMALE" ? "FEMALE" : c.gender === "TRANSGENDER" ? "TRANSGENDER" : c.gender === "MALE" ? "MALE" : "MALE";

      setComplainants([
        {
          id: "comp_1",
          name: extractedName,
          relationType: extractedRelationType,
          relativeName: extractedRelativeName,
          gender: extractedGender,
          age: extractedAge, // Never default to "20"! If not in document, leave empty!
          nationalityChoice: c.nationality === "Indian" ? "Indian" : (c.nationality ? "Other" : "Indian"),
          otherNationality: c.nationality && c.nationality !== "Indian" ? c.nationality : "",
          nationality: c.nationality || "Indian",
          countryCode: "+91",
          presentAddress: extractedAddress,
          presentCity: extractedCity, // Never default to "Kurukshetra"! If not in document, leave empty!
          presentDistrict: extractedDistrict, // Never default to "Kurukshetra"! If not in document, leave empty!
          presentState: extractedState, // Never default to "Haryana"! If not in document, leave empty!
          presentCountry: "India",
          isPermanentSameAsPresent: true,
          permanentAddress: extractedAddress,
          permanentCity: extractedCity,
          permanentDistrict: extractedDistrict,
          permanentState: extractedState,
          permanentCountry: "India",
          mobile: extractedMobile,
        },
      ]);

      // 2. Accused details (extract and populate EVERY accused into their OWN separate card)
      let candidateAccused: any[] = [];
      if (Array.isArray(geminiData.accusedList) && geminiData.accusedList.length > 0) {
        candidateAccused = geminiData.accusedList;
      } else if (Array.isArray(geminiData.accused) && geminiData.accused.length > 0) {
        candidateAccused = geminiData.accused;
      } else if (a && a.name) {
        candidateAccused = [a];
      }

      // Shared address if mentioned for all accused in document - NEVER default to dummy address
      const commonAddress =
        candidateAccused.find((item) => item.address && item.address.trim().length > 3)?.address ||
        a?.address ||
        "";

      // If an entry contains multiple names bundled together (same address or co-accused), split them into separate cards
      let expandedAccused: any[] = [];
      for (const item of candidateAccused) {
        const rawName = String(item?.name || "").trim();
        const itemAddress = item?.address && item.address.trim().length > 0 ? item.address.trim() : commonAddress;

        // Check for numbered lists: "1. Ram, 2. Shyam", "(1) Ram (2) Shyam", etc.
        const hasNumberedList = /(?:^|\n|\s+)(?:[1-9]\.|\([1-9]\)|[1-9]\))\s+/.test(rawName);
        if (hasNumberedList) {
          const splitParts = rawName
            .split(/(?:^|\n|\s+)(?:[1-9]\.|\([1-9]\)|[1-9]\))\s+/)
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 0);
          if (splitParts.length > 1) {
            for (const part of splitParts) {
              const addrMatch = part.split(/\s*(?:r\/o|w\/o|s\/o|निवासी|पता|address:)\s*/i);
              expandedAccused.push({
                name: addrMatch[0]?.replace(/[,\n]+$/, "").trim() || part,
                address: addrMatch[1] ? addrMatch[1].trim() : itemAddress,
                phone: item.phone || "",
                alias: item.alias || "",
                relationWithComplainant: item.relationWithComplainant || "",
              });
            }
            continue;
          }
        }

        // Check for newline separated names
        if (rawName.includes("\n")) {
          const lineParts = rawName.split("\n").map((p: string) => p.trim()).filter((p: string) => p.length > 0);
          if (lineParts.length > 1) {
            for (const line of lineParts) {
              expandedAccused.push({
                name: line.replace(/^[0-9\-*•.)\s]+/, "").trim(),
                address: itemAddress,
                phone: item.phone || "",
                alias: item.alias || "",
                relationWithComplainant: item.relationWithComplainant || "",
              });
            }
            continue;
          }
        }

        // Check for conjunctions joining 2 or more names e.g. "Ram Kumar aur Shyam Kumar dono niwasi..."
        const conjMatch = rawName.match(/^([^,]+?)\s+(?:aur|और|तथा|एवं|and|&)\s+([^,]+?)(?:\s+(?:dono|both|दोनो|दोनों|resident|niwasi|निवासी).*)?$/i);
        if (conjMatch && conjMatch[1] && conjMatch[2]) {
          expandedAccused.push({
            name: conjMatch[1].trim(),
            address: itemAddress,
            phone: item.phone || "",
            alias: item.alias || "",
            relationWithComplainant: item.relationWithComplainant || "",
          });
          expandedAccused.push({
            name: conjMatch[2].trim(),
            address: itemAddress,
            phone: item.phone || "",
            alias: item.alias || "",
            relationWithComplainant: item.relationWithComplainant || "",
          });
          continue;
        }

        // Standard single item with address guaranteed
        expandedAccused.push({
          ...item,
          address: itemAddress,
        });
      }

      let validAccusedCards: AccusedFormItem[] = expandedAccused
        .filter((item) => {
          if (!item || !item.name) return false;
          const n = String(item.name).trim().toLowerCase();
          return n.length > 0 && !n.includes("unknown") && !n.includes("अज्ञात");
        })
        .map((item, idx) => ({
          id: `acc_${Date.now()}_${idx + 1}`,
          name: String(item.name || "").trim(),
          address: String(item.address || commonAddress || "").trim(),
          phone: item.phone ? String(item.phone).trim() : "",
          alias: item.alias ? String(item.alias).trim() : "",
          relationWithComplainant: item.relationWithComplainant ? String(item.relationWithComplainant).trim() : "",
        }));

      // Fallback Safety Net: If AI returned only 1 or 0 accused, scan the full verbatim description for all accused
      if (validAccusedCards.length <= 1) {
        const textToScan = `${comp.description || ""} \n ${inc.details || ""} \n ${textContent || ""}`;
        const scannedFromText = extractAccusedFromComplaintText(textToScan, commonAddress || "");
        if (scannedFromText.length > validAccusedCards.length) {
          validAccusedCards = scannedFromText;
        }
      }

      const isKnown = Boolean(
        (geminiData.isAccusedKnown !== false && validAccusedCards.length > 0) ||
        (a.isKnown && validAccusedCards.length > 0)
      );

      setIsAccusedKnown(isKnown);
      if (isKnown && validAccusedCards.length > 0) {
        setAccusedList(validAccusedCards);
      } else {
        setAccusedList([
          {
            id: "acc_1",
            name: "",
            address: "",
            phone: "",
            alias: "",
            relationWithComplainant: "",
          },
        ]);
      }

      // 3. Incident details - Description of Incident holds the FULL COMPLAINT (पूरी शिकायत)
      setIncidentPlace(inc.place ? String(inc.place).trim() : "");
      setIsDateTimeKnown(Boolean(inc.isDateTimeKnown && inc.date));
      setIncidentDate(inc.date ? String(inc.date).trim() : "");
      setIncidentTime(inc.time ? String(inc.time).trim() : "");
      if (inc.category) setIncidentCategory(inc.category);
      
      const fullVerbatimComplaint = inc.details
        ? String(inc.details).trim()
        : geminiData.rawText
        ? String(geminiData.rawText).trim()
        : "";
      if (fullVerbatimComplaint) setIncidentDetails(fullVerbatimComplaint);

      // 4. Complaint details - Description of Complaint holds the CONCISE SUMMARY (शिकायत का संक्षिप्त विवरण / सारांश)
      if (comp.mode) setIntakeMode(comp.mode);
      setComplaintSubject(comp.subject ? String(comp.subject).trim() : "");
      
      // If comp.description is missing or identically duplicates the verbatim full text, generate a concise summary
      let summaryText = comp.description ? String(comp.description).trim() : "";
      if (!summaryText || summaryText === fullVerbatimComplaint) {
        summaryText = summarizeComplaintText(
          fullVerbatimComplaint,
          comp.subject,
          extractedName,
          validAccusedCards.map((a) => a.name).filter(Boolean)
        );
      }
      setComplaintDescription(summaryText);
      if (comp.type) setComplaintAgeType(comp.type);
      if (comp.isFirRegistered !== undefined) setIsFirRegistered(Boolean(comp.isFirRegistered));
      if (comp.firNumber) setFirNumber(comp.firNumber);

      setValidationErrors({});
      setAutofillProgress(100);
      setAutofillStepText("Fields successfully populated with verified data from document!");

      const filledKeys = new Set<string>();
      if (extractedName) filledKeys.add("complainantName");
      if (extractedRelativeName) filledKeys.add("complainantRelativeName");
      if (c.relationType && String(c.relationType).trim()) filledKeys.add("complainantRelationType");
      if (c.gender && String(c.gender).trim()) filledKeys.add("complainantGender");
      if (extractedAge) filledKeys.add("complainantAge");
      if (extractedMobile) filledKeys.add("complainantMobile");
      if (extractedAddress) filledKeys.add("complainantPresentAddress");
      if (extractedCity) filledKeys.add("complainantPresentCity");
      if (extractedDistrict) filledKeys.add("complainantPresentDistrict");
      if (extractedState) filledKeys.add("complainantPresentState");

      if (isKnown && validAccusedCards.length > 0) {
        filledKeys.add("isAccusedKnown");
        validAccusedCards.forEach((acc, idx) => {
          if (acc.name && acc.name.trim()) filledKeys.add(`accused_${idx}_name`);
          if (acc.address && acc.address.trim()) filledKeys.add(`accused_${idx}_address`);
          if (acc.phone && acc.phone.trim()) filledKeys.add(`accused_${idx}_phone`);
          if (acc.alias && acc.alias.trim()) filledKeys.add(`accused_${idx}_alias`);
          if (acc.relationWithComplainant && acc.relationWithComplainant.trim()) filledKeys.add(`accused_${idx}_relationWithComplainant`);
        });
      }

      if (inc.place && String(inc.place).trim()) filledKeys.add("incidentPlace");
      if (inc.landmark && String(inc.landmark).trim()) filledKeys.add("incidentLandmark");
      if (inc.category && String(inc.category).trim()) filledKeys.add("incidentCategory");
      if (inc.date && String(inc.date).trim()) filledKeys.add("incidentDate");
      if (inc.time && String(inc.time).trim()) filledKeys.add("incidentTime");
      if (fullVerbatimComplaint) filledKeys.add("incidentDetails");

      if (comp.mode && String(comp.mode).trim()) filledKeys.add("intakeMode");
      if (comp.subject && String(comp.subject).trim()) filledKeys.add("complaintSubject");
      if (summaryText) filledKeys.add("complaintDescription");
      if (comp.type && String(comp.type).trim()) filledKeys.add("complaintAgeType");
      if (comp.classification && String(comp.classification).trim()) filledKeys.add("complaintClassification");
      if (comp.purpose && String(comp.purpose).trim()) filledKeys.add("complaintPurpose");

      setAutofilledFieldKeys(filledKeys);

      // Build and save persistent processed document record in Database / localStorage
      const recId = attachedDocId || `proc_doc_${Date.now()}`;
      const rawText = geminiData.rawText || textContent || fullVerbatimComplaint || "";
      const isHindi = /[\u0900-\u097F]/.test(rawText);
      const isEnglish = /[a-zA-Z]/.test(rawText);
      const detectedLang: "hindi" | "english" | "bilingual" = isHindi && isEnglish ? "bilingual" : isHindi ? "hindi" : "english";

      const identifiedPersonsList: Array<{
        name: string;
        role: string;
        fatherOrSpouse?: string;
        phone?: string;
        address?: string;
      }> = [];

      if (extractedName) {
        identifiedPersonsList.push({
          name: extractedName,
          role: "Complainant / प्रार्थी",
          fatherOrSpouse: extractedRelativeName,
          phone: extractedMobile,
          address: extractedAddress,
        });
      }

      validAccusedCards.forEach((acc, idx) => {
        identifiedPersonsList.push({
          name: acc.name,
          role: `Accused / आरोपी #${idx + 1}`,
          phone: acc.phone,
          address: acc.address,
        });
      });

      const processedRecord: ProcessedComplaintDocumentRecord = {
        id: recId,
        documentId: attachedDocId || recId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rawDocument: {
          fileName: classifiedName,
          fileSize: file.size,
          fileType: file.type || "application/octet-stream",
          dataUrl,
          rawExtractedText: rawText,
          detectedLanguage: detectedLang,
        },
        processedData: {
          classifiedDocumentName: classifiedName,
          verifiedDocumentTitle: verifiedTitle,
          typeLabel,
          category,
          complainant: {
            name: extractedName,
            relationType: extractedRelationType,
            relativeName: extractedRelativeName,
            gender: extractedGender,
            age: extractedAge,
            mobile: extractedMobile,
            presentAddress: extractedAddress,
            city: extractedCity,
            district: extractedDistrict,
            state: extractedState,
            nationality: c.nationality || "Indian",
          },
          isAccusedKnown: isKnown,
          accusedList: validAccusedCards,
          incident: {
            place: inc.place ? String(inc.place).trim() : "",
            landmark: inc.landmark ? String(inc.landmark).trim() : "",
            date: inc.date ? String(inc.date).trim() : "",
            time: inc.time ? String(inc.time).trim() : "",
            isDateTimeKnown: Boolean(inc.isDateTimeKnown && inc.date),
            category: inc.category || incidentCategory,
            details: fullVerbatimComplaint,
          },
          complaint: {
            mode: comp.mode || intakeMode,
            subject: comp.subject ? String(comp.subject).trim() : "",
            description: summaryText,
            type: comp.type || complaintAgeType,
            isFirRegistered: Boolean(comp.isFirRegistered),
            firNumber: comp.firNumber,
            classification: comp.classification || complaintClassification,
            purpose: comp.purpose || complaintPurpose,
          },
          analysis: {
            overviewSummary: summaryText,
            allegationsBrief: summaryText,
            identifiedPersons: identifiedPersonsList,
          },
        },
      };

      complaintAutoFillService.save(processedRecord);
      setCurrentProcessedRecord(processedRecord);

      // Persistently register raw evidence and structured case data across CMS
      universalEvidenceService
        .registerAndProcess({
          file,
          dataUrl,
          text: rawText,
          fileName: classifiedName,
          fileId: recId,
          module: "COMPLAINTS",
          uploadedBy: currentUser?.name || "Intake Officer",
        })
        .catch((err) => console.warn("Universal persistent evidence registration warning:", err));

      // Set success notice
      setAutofillSuccessNotice({
        fileName: classifiedName,
        category,
        typeLabel: `${verifiedTitle} • AI Verified`,
        dataUrl,
        complainantName: extractedName || "Not Mentioned in Document",
        complainantRelative: extractedRelativeName ? `${extractedRelationType} ${extractedRelativeName}` : "Not Mentioned",
        complainantMobile: extractedMobile || "Not Mentioned",
        accusedInfo: isKnown && validAccusedCards.length > 0 ? `${validAccusedCards[0].name}${validAccusedCards[0].address ? " (" + validAccusedCards[0].address + ")" : ""}` : "Unidentified Suspect(s)",
        incidentPlace: inc.place ? String(inc.place).trim() : "Not Specified",
        categoryName: (inc.category || "GENERAL").replace(/_/g, " "),
        subject: comp.subject ? String(comp.subject).trim() : "Extracted Complaint",
      });

      setIsAutofilling(false);
      if (autofillFileInputRef.current) autofillFileInputRef.current.value = "";
    } catch (err: any) {
      console.warn("Gemini AI API Error:", err);
      // STRICT: Never fabricate fake names or addresses when document processing fails!
      if (textContent && textContent.trim().length > 20) {
        extractStrictDataFromText(textContent, file.name, category, dataUrl, typeLabel, attachedDocId);
      } else {
        alert(`Document Processing Notice: ${err?.message || "Could not extract fields from document"}. Please enter complaint details manually.`);
      }
      setIsAutofilling(false);
      if (autofillFileInputRef.current) autofillFileInputRef.current.value = "";
    }
  };

  // Strictly extract ONLY what is found in document text without inventing any fake data
  const extractStrictDataFromText = (
    textContent: string,
    fileName: string,
    category: string,
    dataUrl?: string,
    typeLabel?: string,
    attachedDocId?: string
  ) => {
    // 1. Mobile number: match 10-digit Indian mobile
    const mobMatch = textContent.match(/(?:मो[0o०\.]*\s*नं[0o०\.]*|mob|phone|mobile)?\s*[:\-]?\s*([6-9]\d{9})/i);
    const extractedMobile = mobMatch ? mobMatch[1] : "";

    // 2. Complainant Name
    let extractedName = "";
    const nameMatch = textContent.match(/(?:प्रार्थी|प्रार्थिया|complainant|applicant|दरखास्त\s*गुजार)[\s:]+([^\n,]+)/i);
    if (nameMatch && nameMatch[1]) {
      extractedName = nameMatch[1].replace(/(?:पुत्र|पुत्री|पत्नी|s\/o|d\/o|w\/o).*$/i, "").trim();
    }

    // 3. Relative Name
    let extractedRelative = "";
    let extractedRelation: RelativeRelation = "S/O";
    const relMatch = textContent.match(/(?:पुत्र|s\/o)[\s:]+([^\n,]+)/i);
    const relWMatch = textContent.match(/(?:पत्नी|w\/o)[\s:]+([^\n,]+)/i);
    const relDMatch = textContent.match(/(?:पुत्री|d\/o)[\s:]+([^\n,]+)/i);
    if (relMatch && relMatch[1]) {
      extractedRelative = relMatch[1].replace(/(?:निवासी|r\/o|मो0).*$/i, "").trim();
      extractedRelation = "S/O";
    } else if (relWMatch && relWMatch[1]) {
      extractedRelative = relWMatch[1].replace(/(?:निवासी|r\/o|मो0).*$/i, "").trim();
      extractedRelation = "W/O";
    } else if (relDMatch && relDMatch[1]) {
      extractedRelative = relDMatch[1].replace(/(?:निवासी|r\/o|मो0).*$/i, "").trim();
      extractedRelation = "D/O";
    }

    // 4. Address
    let extractedAddr = "";
    const addrMatch = textContent.match(/(?:निवासी|r\/o|address)[\s:]+([^\n]+)/i);
    if (addrMatch && addrMatch[1]) {
      extractedAddr = addrMatch[1].replace(/[।.]*$/, "").trim();
    }

    // 5. Subject
    let extractedSub = "";
    const subMatch = textContent.match(/(?:विषय|subject)[\s:]+([^\n]+)/i);
    if (subMatch && subMatch[1]) {
      extractedSub = subMatch[1].trim();
    }

    // 6. Accused list strictly from text
    const extractedAccused = extractAccusedFromComplaintText(textContent, "");

    // ONLY set fields if found in text
    setComplainants([
      {
        id: "comp_1",
        name: extractedName,
        relationType: extractedRelation,
        relativeName: extractedRelative,
        gender: extractedRelation === "W/O" || extractedRelation === "D/O" ? "FEMALE" : "MALE",
        age: "",
        nationalityChoice: "Indian",
        otherNationality: "",
        nationality: "Indian",
        countryCode: "+91",
        presentAddress: extractedAddr,
        presentCity: "",
        presentDistrict: "",
        presentState: "",
        presentCountry: "India",
        isPermanentSameAsPresent: true,
        permanentAddress: extractedAddr,
        permanentCity: "",
        permanentDistrict: "",
        permanentState: "",
        permanentCountry: "India",
        mobile: extractedMobile,
      },
    ]);

    const isKnown = extractedAccused.length > 0;
    setIsAccusedKnown(isKnown);
    if (isKnown) {
      setAccusedList(extractedAccused);
    } else {
      setAccusedList([
        {
          id: "acc_1",
          name: "",
          address: "",
          phone: "",
          alias: "",
          relationWithComplainant: "",
        },
      ]);
    }

    // Description of Incident receives the complete verbatim complaint
    setIncidentDetails(textContent);
    // Description of Complaint receives a concise summary (NOT the full duplicate complaint)
    const localSummary = summarizeComplaintText(
      textContent,
      extractedSub,
      extractedName,
      extractedAccused.map((a) => a.name).filter(Boolean)
    );
    setComplaintDescription(localSummary);
    setComplaintSubject(extractedSub);

    const filledKeys = new Set<string>();
    if (extractedName) filledKeys.add("complainantName");
    if (extractedRelative) filledKeys.add("complainantRelativeName");
    if (extractedAddr) filledKeys.add("complainantPresentAddress");
    if (extractedMobile) filledKeys.add("complainantMobile");
    if (extractedSub) filledKeys.add("complaintSubject");
    if (textContent) {
      filledKeys.add("complaintDescription");
      filledKeys.add("incidentDetails");
    }
    if (isKnown) {
      filledKeys.add("isAccusedKnown");
      extractedAccused.forEach((acc, idx) => {
        if (acc.name) filledKeys.add(`accused_${idx}_name`);
        if (acc.address) filledKeys.add(`accused_${idx}_address`);
        if (acc.phone) filledKeys.add(`accused_${idx}_phone`);
      });
    }
    setAutofilledFieldKeys(filledKeys);
    setAutofillProgress(100);
    setAutofillStepText("Fields extracted strictly from verified document text without fabrication!");

    // Build and save persistent processed document record in Database / localStorage
    const recId = attachedDocId || `proc_doc_${Date.now()}`;
    const isHindi = /[\u0900-\u097F]/.test(textContent);
    const isEnglish = /[a-zA-Z]/.test(textContent);
    const detectedLang: "hindi" | "english" | "bilingual" = isHindi && isEnglish ? "bilingual" : isHindi ? "hindi" : "english";

    const identifiedPersonsList: Array<{
      name: string;
      role: string;
      fatherOrSpouse?: string;
      phone?: string;
      address?: string;
    }> = [];

    if (extractedName) {
      identifiedPersonsList.push({
        name: extractedName,
        role: "Complainant / प्रार्थी",
        fatherOrSpouse: extractedRelative,
        phone: extractedMobile,
        address: extractedAddr,
      });
    }

    extractedAccused.forEach((acc, idx) => {
      identifiedPersonsList.push({
        name: acc.name,
        role: `Accused / आरोपी #${idx + 1}`,
        phone: acc.phone,
        address: acc.address,
      });
    });

    const processedRecord: ProcessedComplaintDocumentRecord = {
      id: recId,
      documentId: attachedDocId || recId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rawDocument: {
        fileName,
        fileSize: textContent.length,
        fileType: "text/plain",
        dataUrl: dataUrl || `data:text/plain;charset=utf-8,${encodeURIComponent(textContent)}`,
        rawExtractedText: textContent,
        detectedLanguage: detectedLang,
      },
      processedData: {
        classifiedDocumentName: fileName,
        verifiedDocumentTitle: typeLabel || "Verified Text Application",
        typeLabel: typeLabel || "Verified Document",
        category,
        complainant: {
          name: extractedName,
          relationType: extractedRelation,
          relativeName: extractedRelative,
          gender: extractedRelation === "W/O" || extractedRelation === "D/O" ? "FEMALE" : "MALE",
          mobile: extractedMobile,
          presentAddress: extractedAddr,
          nationality: "Indian",
        },
        isAccusedKnown: isKnown,
        accusedList: extractedAccused,
        incident: {
          details: textContent,
        },
        complaint: {
          subject: extractedSub,
          description: localSummary,
        },
        analysis: {
          overviewSummary: localSummary,
          allegationsBrief: localSummary,
          identifiedPersons: identifiedPersonsList,
        },
      },
    };

    complaintAutoFillService.save(processedRecord);
    setCurrentProcessedRecord(processedRecord);

    universalEvidenceService
      .registerAndProcess({
        dataUrl,
        text: textContent,
        fileName,
        fileId: processedRecord.id,
        module: "COMPLAINTS",
        uploadedBy: currentUser?.name || "Intake Officer",
      })
      .catch((err) => console.warn("Universal persistent evidence registration warning:", err));

    // Tag attachment with processed flags
    setAttachments((prev) =>
      prev.map((a) =>
        a.id === attachedDocId || a.name === fileName
          ? {
              ...a,
              isAutoFilled: true,
              isProcessed: true,
              processedRecordId: processedRecord.id,
            }
          : a
      )
    );

    // Set success banner notice - strictly truthful, explicit Not Mentioned
    setAutofillSuccessNotice({
      fileName,
      category,
      typeLabel: typeLabel || "Verified Document",
      dataUrl,
      complainantName: extractedName || "Not Mentioned in Document",
      complainantRelative: extractedRelative ? `${extractedRelation} ${extractedRelative}` : "Not Mentioned in Document",
      complainantMobile: extractedMobile || "Not Mentioned in Document",
      accusedInfo: isKnown && extractedAccused.length > 0 ? `${extractedAccused[0].name}${extractedAccused[0].address ? " (" + extractedAccused[0].address + ")" : ""}` : "Unidentified Suspect(s)",
      incidentPlace: "Not Specified in Document",
      categoryName: category.replace(/_/g, " "),
      subject: extractedSub || "Extracted Complaint",
    });
  };


  // Run Intelligence Check locally without external model by checking specific filled fields in register complaint form
  const handleRunIntelCheck = (tab: "all" | "cross" | "repeat" | "linked" | "fir" = "all") => {
    setIntelDropdownOpen(false);
    const primary = complainants[0] || {};
    const primaryAccused = isAccusedKnown && accusedList[0] ? accusedList[0] : null;

    // Check specific fields filled in this register complaint form locally
    const result = ComplaintService.checkComplaintIntelligence({
      complainantName: primary.name || "",
      complainantFatherSpouse: primary.relativeName || "",
      complainantMobile: primary.mobile || "",
      complainantAddress: primary.presentAddress || "",
      accusedName: primaryAccused?.name || undefined,
      accusedFatherName: undefined,
      accusedPhone: primaryAccused?.phone || undefined,
      accusedAddress: primaryAccused?.address || undefined,
      incidentPlace: incidentPlace || "",
      incidentDetails: incidentDetails || complaintDescription || complaintSubject || "",
    });
    setIntelResult(result);
    setActiveIntelTab(tab);
    setShowIntelModal(true);
  };

  // Unified Form Validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // 1. Validate All Complainants
    complainants.forEach((comp, idx) => {
      if (!comp.name.trim()) {
        errors[`comp_${idx}_name`] = `Complainant ${idx + 1}: Name is required`;
      }
      if (comp.age && String(comp.age).trim() && (isNaN(Number(comp.age)) || Number(comp.age) < 1 || Number(comp.age) > 120)) {
        errors[`comp_${idx}_age`] = `Complainant ${idx + 1}: Valid age (1-120 years) is required`;
      }
      if (comp.nationalityChoice === "Other" && !comp.otherNationality.trim()) {
        errors[`comp_${idx}_otherNationality`] = `Complainant ${idx + 1}: Please specify nationality`;
      }
      if (!comp.presentAddress.trim()) {
        errors[`comp_${idx}_presentAddress`] = `Complainant ${idx + 1}: Present address is required`;
      }
      if (!comp.presentCity.trim()) {
        errors[`comp_${idx}_presentCity`] = `Complainant ${idx + 1}: Village / City is required`;
      }
      if (!comp.presentDistrict.trim()) {
        errors[`comp_${idx}_presentDistrict`] = `Complainant ${idx + 1}: District is required`;
      }
      if (!comp.presentState.trim()) {
        errors[`comp_${idx}_presentState`] = `Complainant ${idx + 1}: State is required`;
      }
      if (!comp.presentCountry.trim()) {
        errors[`comp_${idx}_presentCountry`] = `Complainant ${idx + 1}: Country is required`;
      }

      // Permanent address if unchecked
      if (!comp.isPermanentSameAsPresent) {
        if (!comp.permanentAddress.trim()) {
          errors[`comp_${idx}_permanentAddress`] = `Complainant ${idx + 1}: Permanent address is required`;
        }
        if (!comp.permanentCity.trim()) {
          errors[`comp_${idx}_permanentCity`] = `Complainant ${idx + 1}: Permanent city is required`;
        }
        if (!comp.permanentDistrict.trim()) {
          errors[`comp_${idx}_permanentDistrict`] = `Complainant ${idx + 1}: Permanent district is required`;
        }
        if (!comp.permanentState.trim()) {
          errors[`comp_${idx}_permanentState`] = `Complainant ${idx + 1}: Permanent state is required`;
        }
        if (!comp.permanentCountry.trim()) {
          errors[`comp_${idx}_permanentCountry`] = `Complainant ${idx + 1}: Permanent country is required`;
        }
      }

      // Mobile validation:
      if (comp.nationalityChoice === "Indian") {
        if (!comp.mobile.trim() || !/^[6-9]\d{9}$/.test(comp.mobile)) {
          errors[`comp_${idx}_mobile`] = `Complainant ${idx + 1}: Valid 10-digit mobile number starting with 6-9 is required`;
        }
      } else {
        if (!comp.mobile.trim() || comp.mobile.length < 5) {
          errors[`comp_${idx}_mobile`] = `Complainant ${idx + 1}: Valid contact phone number is required`;
        }
      }
    });

    // 2. Validate Accused if known
    if (isAccusedKnown) {
      accusedList.forEach((acc, idx) => {
        if (!acc.name.trim()) {
          errors[`acc_${idx}_name`] = `Accused #${idx + 1}: Name is required`;
        }
        if (!acc.address.trim()) {
          errors[`acc_${idx}_address`] = `Accused #${idx + 1}: Address is required`;
        }
      });
    }

    // 3. Validate Incident Details
    if (!incidentPlace.trim()) {
      errors["incidentPlace"] = "Place of incident is required";
    }
    if (isDateTimeKnown && !incidentDate.trim()) {
      errors["incidentDate"] = "Date of incident is required";
    }

    // 4. Validate Complaint Details
    if (!complaintSubject.trim()) {
      errors["complaintSubject"] = "Subject is required";
    }
    if (!complaintDescription.trim()) {
      errors["complaintDescription"] = "Complaint brief description / synopsis is required";
    }
    if (isFirRegistered && !firNumber.trim()) {
      errors["firNumber"] = "FIR number is required when FIR registered is Yes";
    }

    setValidationErrors(errors);

    return Object.keys(errors).length === 0;
  };

  // Helper: Assemble preview data from currently filled form fields
  const buildPreviewData = (): ComplaintPreviewData => {
    const primaryComp = complainants[0];
    const selectedEo = selectedEoId ? MOCK_ENQUIRY_OFFICERS.find((o) => o.id === selectedEoId) : undefined;

    return {
      sourceChannel,
      priorityLevel,
      complainants: complainants.map((c) => ({
        name: c.name,
        relationType: c.relationType,
        relativeName: c.relativeName,
        gender: c.gender,
        age: c.age,
        nationalityChoice: c.nationalityChoice,
        otherNationality: c.otherNationality,
        mobile: c.nationalityChoice === "Indian" ? c.mobile : `${c.countryCode} ${c.mobile}`.trim(),
        presentAddress: c.presentAddress,
        presentCity: c.presentCity,
        presentDistrict: c.presentDistrict,
        presentState: c.presentState,
        presentCountry: c.presentCountry,
      })),
      isAccusedKnown,
      accusedList: isAccusedKnown ? accusedList : [],
      incidentPlace,
      incidentLandmark,
      isDateTimeKnown,
      incidentDate,
      incidentTime,
      incidentApproxPeriod,
      incidentCategory,
      incidentDetails,
      complaintSubject: complaintSubject.trim(),
      complaintDescription,
      isFirRegistered,
      firNumber: isFirRegistered ? firNumber : undefined,
      firDate: isFirRegistered ? firDate : undefined,
      complaintClassification,
      complaintPurpose,
      directSendToFir: false,
      directSendToFirChoice: "NO",
      attachmentsCount: attachments.length,
      isSho,
      shouldAssignEoNow: Boolean(selectedEoId),
      selectedEoName: selectedEo?.name,
      selectedEoRank: selectedEo?.rank,
      selectedEoPno: selectedEo?.pno,
      assignedDirections: selectedEoId ? assignedDirections : undefined,
      targetDays: selectedEoId ? targetDays : undefined,
      policeStation: currentUser.stationName,
      district: currentUser.district,
      registeredBy: currentUser.name,
    };
  };

  // Preview Button Handler: Opens clean preview modal with NO other action buttons inside
  const handleOpenPreviewOnly = (e: React.MouseEvent) => {
    e.preventDefault();
    const data = buildPreviewData();
    setPreviewVerificationData(data);
    setIsReadOnlyPreview(true);
    setShowVerificationModal(true);
  };

  // Step 1: When user clicks "Confirm & Register Complaint", validate and register directly
  const handleInitiateRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      setTimeout(() => {
        const firstErrorEl = document.querySelector(".border-red-500, [aria-invalid='true']");
        if (firstErrorEl) {
          firstErrorEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);
      return;
    }

    const previewData = buildPreviewData();
    setPreviewVerificationData(previewData);
    await handleFinalSubmit(previewData);
  };

  // Step 2: Creates the complaint and saves official registered complaint PDF document in documents subtab
  const handleFinalSubmit = async (customPreviewData?: ComplaintPreviewData) => {
    const activePreviewData = customPreviewData || previewVerificationData;
    if (!activePreviewData) return;
    setIsSubmitting(true);
    const primaryComp = complainants[0];
    const otherComplainants = complainants.slice(1);

    const formattedAccusedList: AccusedPerson[] = isAccusedKnown
      ? accusedList.map((a) => ({
          name: a.name,
          address: a.address,
          phone: a.phone,
          alias: a.alias,
          relationWithComplainant: a.relationWithComplainant,
        }))
      : [];

    try {
      // Collect all uploaded evidence attachments, drag & drop files, and autofill files into documents
      const documentsToSave: ComplaintDocumentItem[] = [
        ...attachments.map((att) => ({
          id: `doc_${att.id}`,
          complaintId: "",
          fileName: att.name,
          fileCategory: att.category.toUpperCase(),
          uploadedBy: currentUser.name,
          uploadedAt: att.uploadedAt || new Date().toISOString(),
          fileSize: typeof att.size === "number" ? `${(att.size / 1024).toFixed(1)} KB` : String(att.size || "10 KB"),
          fileUrl: att.dataUrl,
          dataUrl: att.dataUrl,
          description: att.description || "",
          isAutoFilled: att.isAutoFilled,
          isProcessed: att.isProcessed,
          processedRecordId: att.processedRecordId,
          rawExtractedText: att.isProcessed && currentProcessedRecord ? currentProcessedRecord.rawDocument?.rawExtractedText : undefined,
          detectedLanguage: att.isProcessed && currentProcessedRecord ? currentProcessedRecord.rawDocument?.detectedLanguage : undefined,
        })),
      ];

      // If an autofill document was processed and is not yet in documentsToSave, add it as application copy
      if (
        autofillSuccessNotice &&
        autofillSuccessNotice.fileName &&
        !documentsToSave.some((d) => d.fileName.toLowerCase() === autofillSuccessNotice.fileName.toLowerCase())
      ) {
        documentsToSave.unshift({
          id: `doc_autofill_${Date.now()}`,
          complaintId: "",
          fileName: autofillSuccessNotice.fileName,
          fileCategory: "APPLICATION / COMPLAINT COPY",
          uploadedBy: currentUser.name,
          uploadedAt: new Date().toISOString(),
          fileSize: "120 KB",
          fileUrl: autofillSuccessNotice.dataUrl,
          dataUrl: autofillSuccessNotice.dataUrl,
          description: "",
          isAutoFilled: true,
          isProcessed: true,
          processedRecordId: currentProcessedRecord?.id,
          rawExtractedText: currentProcessedRecord?.rawDocument?.rawExtractedText,
          detectedLanguage: currentProcessedRecord?.rawDocument?.detectedLanguage,
        });
      }

      // 1. Create Complaint
      const complaint = await ComplaintService.createComplaint(
        {
          source: sourceChannel,
          priority: priorityLevel,
          category: incidentCategory,
          incidentDate: isDateTimeKnown ? incidentDate : (incidentApproxPeriod || "Undated"),
          incidentTime: isDateTimeKnown ? incidentTime : undefined,
          isIncidentDateTimeKnown: isDateTimeKnown,
          incidentPlace,
          incidentLandmark: undefined,
          incidentDetails: incidentDetails || "Written citizen application received and attached to docket.",
          complainantName: primaryComp.name,
          complainantRelationType: primaryComp.relationType,
          complainantRelativeName: primaryComp.relativeName,
          complainantFatherSpouse: primaryComp.relativeName,
          complainantGender: primaryComp.gender,
          complainantAge: primaryComp.age ? parseInt(primaryComp.age, 10) : undefined,
          complainantNationality: primaryComp.nationalityChoice === "Indian" ? "Indian" : primaryComp.otherNationality,
          complainantMobile: primaryComp.nationalityChoice === "Indian" ? primaryComp.mobile : `${primaryComp.countryCode} ${primaryComp.mobile}`.trim(),
          complainantAddress: primaryComp.presentAddress,
          complainantCity: primaryComp.presentCity,
          complainantDistrict: primaryComp.presentDistrict,
          complainantState: primaryComp.presentState,
          complainantCountry: primaryComp.presentCountry,
          complainantPermanentAddress: primaryComp.isPermanentSameAsPresent
            ? primaryComp.presentAddress
            : primaryComp.permanentAddress,
          complainantPermanentCity: primaryComp.isPermanentSameAsPresent
            ? primaryComp.presentCity
            : primaryComp.permanentCity,
          complainantPermanentDistrict: primaryComp.isPermanentSameAsPresent
            ? primaryComp.presentDistrict
            : primaryComp.permanentDistrict,
          complainantPermanentState: primaryComp.isPermanentSameAsPresent
            ? primaryComp.presentState
            : primaryComp.permanentState,
          complainantPermanentCountry: primaryComp.isPermanentSameAsPresent
            ? primaryComp.presentCountry
            : primaryComp.permanentCountry,
          isPermanentSameAsPresent: primaryComp.isPermanentSameAsPresent,
          additionalComplainants: otherComplainants.map((c) => ({
            ...c,
            age: c.age ? parseInt(c.age, 10) : undefined,
            nationality: c.nationalityChoice === "Indian" ? "Indian" : c.otherNationality,
            mobile: c.nationalityChoice === "Indian" ? c.mobile : `${c.countryCode} ${c.mobile}`.trim(),
          })) as any,
          // 4. Complaint Details
          intakeMode,
          complaintSubject: complaintSubject.trim(),
          subject: complaintSubject.trim(),
          complaintDescription,
          isFirRegistered,
          firNumber: isFirRegistered ? firNumber : undefined,
          firDate: isFirRegistered ? firDate : undefined,
          complaintAgeType,
          complaintClassification,
          complaintPurpose,
          directSendToFir: false,
          directSendToFirChoice: "NO",
          isAccusedKnown,
          accusedList: formattedAccusedList,
          accusedName: formattedAccusedList[0]?.name,
          accusedAddress: formattedAccusedList[0]?.address,
          linkedComplaintNumber: linkedComplaintNo || undefined,
          isCrossComplaint: isCrossCaseTagged || undefined,
          attachments,
          documents: documentsToSave,
          processedDocuments: currentProcessedRecord ? [currentProcessedRecord] : [],
        } as any,
        currentUser.name,
        currentUser.stationName,
        currentUser.district,
        currentUser.pno
      );

      // Permanently bind processed document records in the database with the registered complaint ID & Number
      if (currentProcessedRecord) {
        complaintAutoFillService.bindToComplaint(
          currentProcessedRecord.id,
          complaint.id,
          complaint.complaintNumber
        );
        universalEvidenceService.bindToCase(
          currentProcessedRecord.id,
          complaint.id,
          complaint.complaintNumber
        );
        if (currentProcessedRecord.documentId) {
          complaintAutoFillService.bindToComplaint(
            currentProcessedRecord.documentId,
            complaint.id,
            complaint.complaintNumber
          );
          universalEvidenceService.bindToCase(
            currentProcessedRecord.documentId,
            complaint.id,
            complaint.complaintNumber
          );
        }
      }
      documentsToSave.forEach((doc) => {
        if (doc.isProcessed || doc.processedRecordId) {
          complaintAutoFillService.bindToComplaint(
            doc.processedRecordId || doc.id,
            complaint.id,
            complaint.complaintNumber
          );
          universalEvidenceService.bindToCase(
            doc.processedRecordId || doc.id,
            complaint.id,
            complaint.complaintNumber
          );
        }
        if (doc.id) {
          universalEvidenceService.bindToCase(
            doc.id,
            complaint.id,
            complaint.complaintNumber
          );
        }
      });

      // 2. Generate the verified registered complaint PDF document and save it in complaint.documents synchronously
      try {
        const previewHtml = generateComplaintIntakeHtml(activePreviewData, complaint.complaintNumber);
        const cleanNo = complaint.complaintNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
        const docFileName = `Registered_Complaint_${cleanNo}.pdf`;
        const previewDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(previewHtml)}`;
        const regDocRecordId = `proc_reg_${complaint.id}`;

        // Save into complaintAutoFillService so this registered complaint document is already processed and cached in DB
        const regDocProcessedRecord: ProcessedComplaintDocumentRecord = {
          id: regDocRecordId,
          documentId: `doc_reg_${complaint.id}`,
          relatedComplaintId: complaint.id,
          relatedComplaintNumber: complaint.complaintNumber,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          rawDocument: {
            fileName: docFileName,
            fileSize: previewHtml.length,
            fileType: "application/pdf",
            dataUrl: previewDataUrl,
            rawExtractedText: `${complaint.subject || ""}\n${complaint.complaintDescription || ""}\n${complaint.incidentDetails || ""}`,
            detectedLanguage: "bilingual",
          },
          processedData: {
            classifiedDocumentName: docFileName,
            verifiedDocumentTitle: "Official Registered Complaint Form (PDF)",
            typeLabel: "Official Registered Complaint Form (PDF)",
            category: "DOCUMENT",
            complainant: {
              name: primaryComp.name,
              relationType: primaryComp.relationType,
              relativeName: primaryComp.relativeName,
              gender: primaryComp.gender,
              age: primaryComp.age ? String(primaryComp.age) : undefined,
              mobile: primaryComp.mobile,
              presentAddress: primaryComp.presentAddress,
              city: primaryComp.presentCity,
              district: primaryComp.presentDistrict,
              state: primaryComp.presentState,
            },
            isAccusedKnown,
            accusedList: formattedAccusedList,
            incident: {
              place: incidentPlace,
              date: incidentDate,
              time: incidentTime,
              details: incidentDetails,
            },
            complaint: {
              subject: complaintSubject,
              description: complaintDescription,
            },
            analysis: {
              overviewSummary: complaintDescription,
              allegationsBrief: complaintDescription,
            },
          },
        };
        complaintAutoFillService.save(regDocProcessedRecord);
        universalEvidenceService
          .registerAndProcess({
            dataUrl: previewDataUrl,
            text: previewHtml,
            fileName: docFileName,
            fileId: `doc_reg_${complaint.id}`,
            caseId: complaint.id,
            caseNumber: complaint.complaintNumber,
            module: "COMPLAINTS",
            uploadedBy: currentUser.name,
          })
          .catch((e) => console.warn("Registered complaint evidence registration warning:", e));

        await ComplaintService.addDocument(complaint.id, {
          fileName: docFileName,
          fileCategory: "REGISTERED COMPLAINT DOCKET",
          uploadedBy: currentUser.name,
          fileSize: `${(previewHtml.length / 1024).toFixed(1)} KB`,
          dataUrl: previewDataUrl,
          fileUrl: previewDataUrl,
          contentHtml: previewHtml,
          description: "Permanent Official Registered Complaint Docket (PDF Form) generated upon registration",
          isAutoFilled: true,
          isProcessed: true,
          processedRecordId: regDocRecordId,
          rawExtractedText: regDocProcessedRecord.rawDocument.rawExtractedText,
          detectedLanguage: "bilingual",
          isPermanentRegistrationDoc: true,
        } as any);
      } catch (docErr) {
        console.error("Failed to auto-save registered complaint document:", docErr);
      }

      setShowVerificationModal(false);

      if (selectedEoId) {
        // If registered with an EO selected, immediately allocate to selected officer
        const eo = MOCK_ENQUIRY_OFFICERS.find((o) => o.id === selectedEoId);
        if (eo) {
          const assignRes = await ComplaintService.assignEnquiryOfficer(
            complaint.id,
            eo.id,
            eo.name,
            eo.rank,
            eo.pno,
            currentUser.name,
            assignedDirections || "Conduct preliminary spot verification & verify facts as per Section 173(3) BNSS.",
            targetDays || 14
          );
          setCreatedComplaint(assignRes.complaint);
          setShowReceiptModal(true);
        } else {
          setCreatedComplaint(complaint);
          setShowReceiptModal(true);
        }
      } else {
        // Registered without immediate EO assignment: show success view and generate official receipt with SHO supervision & IO not assigned
        setCreatedComplaint(complaint);
        setShowReceiptModal(true);
      }

      // Clear the saved draft from localStorage upon successful registration
      try {
        window.localStorage.removeItem(FORM_DRAFT_KEY);
        setHasStoredDraft(false);
        setDraftSavedAt(null);
      } catch {}
    } catch (err: any) {
      setValidationErrors({ submit: err.message || "Failed to register complaint." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // If registered, show official receipt & acknowledgement view
  if (createdComplaint) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in-50 p-4 sm:p-6">
        <Card className="border-emerald-300 shadow-lg">
          <CardContent className="p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Official Police Intake Recorded
              </span>
              <h2 className="text-2xl font-black text-slate-900">
                Complaint Successfully Registered
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                Formally entered in Central Register at {currentUser.stationName} (District: {currentUser.district})
              </p>
            </div>

            {/* Generated Complaint ID Badge */}
            <div className="p-4 bg-slate-900 text-white rounded-xl font-mono text-center space-y-1 max-w-md mx-auto shadow-md">
              <p className="text-[10px] text-amber-400 uppercase tracking-widest font-sans">
                Permanent Complaint Number
              </p>
              <p className="text-xl sm:text-2xl font-bold tracking-wider text-white">
                {createdComplaint.complaintNumber}
              </p>
            </div>


            {/* Summary Particulars */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500">Complainant:</span>
                  <p className="font-bold text-slate-900">
                    {createdComplaint.complainantName}
                    {createdComplaint.complainantFatherSpouse && (
                      <span className="text-slate-600 font-normal">
                        {" "}
                        ({createdComplaint.complainantRelationType || "S/O"}{" "}
                        {createdComplaint.complainantFatherSpouse})
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Contact Number:</span>
                  <p className="font-bold text-slate-900 font-mono">+91 {createdComplaint.complainantMobile}</p>
                </div>
                <div>
                  <span className="text-slate-500">Incident Place:</span>
                  <p className="font-bold text-slate-900">{createdComplaint.incidentPlace}</p>
                </div>
                <div>
                  <span className="text-slate-500">Crime Class:</span>
                  <p className="font-bold text-slate-900">{createdComplaint.categoryDisplay}</p>
                </div>
              </div>
            </div>

            {/* Direct EO Allocation Confirmation Card */}
            {createdComplaint.assignedEoName && (
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-left text-xs space-y-2 animate-in fade-in-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-emerald-950 font-bold">
                    <UserCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Enquiry Officer Assigned: {createdComplaint.assignedEoName} ({createdComplaint.assignedEoRank})</span>
                  </div>
                  <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded-full">
                    Target: {createdComplaint.targetResolutionDate}
                  </span>
                </div>
                <div className="text-[11px] text-emerald-900 space-y-0.5">
                  <p>
                    <strong>Officer PNO:</strong> {createdComplaint.assignedEoPno} • <strong>Status:</strong> ASSIGNED_TO_EO
                  </p>
                  {createdComplaint.assignedDirections && (
                    <p className="italic text-emerald-950 pt-1 border-t border-emerald-200/80">
                      &ldquo;{createdComplaint.assignedDirections}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Direct Send to FIR Card */}
            {createdComplaint.directSendToFir && (
              <div className="p-4 bg-purple-50 border border-purple-300 rounded-xl text-left text-xs space-y-1.5 animate-in fade-in-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-purple-950 font-bold">
                    <Scale className="w-4 h-4 text-purple-700 shrink-0" />
                    <span>Direct Send to FIR: Yes • Status: FIR Register</span>
                  </div>
                  <span className="text-[10px] bg-purple-200 text-purple-900 font-bold px-2 py-0.5 rounded-full">
                    FIR Register
                  </span>
                </div>
                <p className="text-[11px] text-purple-900">
                  यह शिकायत सीधे FIR दर्ज करने हेतु भेज दी गई है। EO असाइनमेंट की आवश्यकता नहीं है। SHO के Complaint Register में Action कॉलम में &ldquo;Register FIR&rdquo; बटन उपलब्ध रहेगा।
                </p>
              </div>
            )}

            {/* Unassigned EO SHO Desk Alert Card */}
            {!createdComplaint.assignedEoName && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-left text-xs space-y-1.5 animate-in fade-in-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-amber-950 font-bold">
                    <Shield className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Enquiry Officer Not Assigned (Pending SHO Queue)</span>
                  </div>
                  <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                    Awaiting SHO Allocation
                  </span>
                </div>
                <p className="text-[11px] text-amber-800">
                  यह शिकायत SHO की ID / Roster में भेज दी गई है। SHO Desk पर &ldquo;Assign EO&rdquo; बटन दबाते ही तुरंत अधिकृत पावती रसीद (Receipt of registered complaints) जनरेट हो जाएगी।
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
              <Link href={`/complaints/${createdComplaint.id}`}>
                <Button variant="primary" size="md" className="gap-2 bg-[#0b192c] hover:bg-slate-800 font-bold text-xs">
                  <ExternalLink className="w-4 h-4" />
                  View Complaint Profile
                </Button>
              </Link>
              <button
                type="button"
                onClick={() => setShowReceiptModal(true)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <Printer className="w-4 h-4 text-emerald-200" />
                <span>
                  Print Official Receipt of registered complaints
                  {!createdComplaint.assignedEoName ? " (SHO Supervision • IO Not Assigned)" : " (EO Assigned)"}
                </span>
              </button>
              <Link href="/complaints">
                <Button variant="outline" size="md" className="text-xs">
                  Return to Complaints Register
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Complaint Receipt Modal */}
        <ComplaintReceiptModal
          complaint={createdComplaint}
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
        />
      </div>
    );
  }

  // Access Guard: Only MHC, SHO, and Superior officers can register complaints
  if (!canRegisterComplaint) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white border border-slate-200 rounded-2xl shadow-sm text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200 shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Complaint registration is restricted to Station MHC, SHO, and Supervisory officers.
          As an Enquiry Officer ({currentUser?.name}), your role is to conduct enquiry and submit enquiry reports on assigned cases.
        </p>
        <div className="pt-2">
          <Link href="/complaints">
            <Button variant="primary" className="bg-[#0b192c] hover:bg-slate-800 text-white cursor-pointer">
              Return to Complaints Register
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0b192c] text-white flex items-center justify-center font-bold text-xs shadow-xs">
              <FileCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-black text-[#0b192c]">Register Citizen Complaint</h1>
              <p className="text-xs text-slate-500">
                Single Unified Police Station Intake Form (PPR Rule 22.48 / Section 173 BNSS)
              </p>
            </div>
          </div>
        </div>

        {/* Top Channel, Priority, Clear & Cancel Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClearForm}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-900 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            title="Reset and clear all form fields to blank"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            <span>Clear Form</span>
          </button>
          <Link href="/complaints">
            <Button variant="outline" size="sm" className="text-xs">
              Cancel
            </Button>
          </Link>
        </div>
      </div>

      {/* Hidden File Input for Autofill Document (Accepts PDF, Images, Audio, Docs) */}
      <input
        ref={autofillFileInputRef}
        type="file"
        accept="image/*,application/pdf,audio/*,.doc,.docx,.txt"
        onChange={(e) => handleAutofillFileSelect(e.target.files)}
        className="hidden"
      />

      {/* Live Document Processing Progress Bar (Shown while uploading/analyzing) */}
      {isAutofilling && processingFileInfo && (
        <div className="p-3.5 bg-white border border-blue-200 rounded-xl space-y-2.5 shadow-2xs animate-in fade-in-50">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                {processingFileInfo.category === "image" ? (
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                ) : processingFileInfo.category === "audio" ? (
                  <Music className="w-3.5 h-3.5 text-amber-600" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                )}
              </div>
              <span className="font-bold text-slate-800 truncate max-w-xs">{processingFileInfo.name}</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                {processingFileInfo.typeLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 text-blue-700 font-bold shrink-0 font-mono">
              <RotateCcw className="w-3.5 h-3.5 animate-spin text-blue-600" />
              <span>{autofillProgress}%</span>
            </div>
          </div>

          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
            <div
              className="bg-linear-to-r from-blue-600 to-indigo-600 h-full transition-all duration-300 rounded-full"
              style={{ width: `${autofillProgress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-medium text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-purple-600 shrink-0" />
              {autofillStepText}
            </span>
            <span>Local Extractor</span>
          </div>
        </div>
      )}

      {/* Autofill Success Alert & Extracted Fields Highlights */}
      {autofillSuccessNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2.5 text-xs text-emerald-950 animate-in fade-in-50">
          <div className="flex items-start justify-between gap-2 border-b border-emerald-200/60 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h4 className="font-bold text-emerald-900 text-xs sm:text-sm">
                  Document Processed &amp; Form Fields Populated
                </h4>
                <p className="text-[11px] text-emerald-700">
                  Successfully processed <strong>{autofillSuccessNotice.fileName}</strong> ({autofillSuccessNotice.typeLabel}). All fields have been filled into the form below and are <strong>100% editable</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {autofillSuccessNotice.dataUrl && (
                <button
                  type="button"
                  onClick={() =>
                    setPreviewModalFile({
                      name: autofillSuccessNotice.fileName,
                      category: autofillSuccessNotice.category,
                      dataUrl: autofillSuccessNotice.dataUrl,
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold transition-colors shadow-2xs"
                  title="Instant preview uploaded document"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Preview Document</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setAutofillSuccessNotice(null)}
                className="p-1 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 rounded-md transition-colors"
                title="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-0.5 text-[11px]">
            <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/80 space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Complainant</span>
              <p className="font-bold text-slate-900 truncate">{autofillSuccessNotice.complainantName}</p>
              <p className="text-[10px] text-slate-500 truncate">{autofillSuccessNotice.complainantRelative} • {autofillSuccessNotice.complainantMobile}</p>
            </div>

            <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/80 space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Accused / Suspect</span>
              <p className="font-bold text-slate-900 truncate">{autofillSuccessNotice.accusedInfo.split("(")[0]}</p>
              <p className="text-[10px] text-slate-500 truncate">Particulars recorded</p>
            </div>

            <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/80 space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Incident Location</span>
              <p className="font-bold text-slate-900 truncate">{autofillSuccessNotice.incidentPlace}</p>
              <p className="text-[10px] text-slate-500 truncate">{autofillSuccessNotice.categoryName}</p>
            </div>

            <div className="p-2 bg-white/80 rounded-lg border border-emerald-200/80 space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Evidence Docket</span>
              <p className="font-bold text-slate-900 truncate">Original File Sealed</p>
              <p className="text-[10px] text-slate-500 truncate">Saved in Section 3(e)</p>
            </div>
          </div>

          <div className="p-2 bg-emerald-100/60 rounded-lg text-[11px] text-emerald-900 flex items-center justify-between">
            <span>
              <strong>Subject:</strong> {autofillSuccessNotice.subject}
            </span>
            <span className="font-semibold text-emerald-800 text-[10px] uppercase bg-white px-2 py-0.5 rounded border border-emerald-200 shrink-0 ml-2">
              Ready to Review &amp; Edit
            </span>
          </div>
        </div>
      )}

      {/* Draft Notification Toast */}
      {draftToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-950 flex items-center justify-between gap-2 shadow-xs animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{draftToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setDraftToast(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Draft Restoration Alert Banner (When stored draft exists and not yet dismissed) */}
      {hasStoredDraft && !draftBannerDismissed && (
        <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in-50">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-950 text-xs sm:text-sm">
                Saved Draft Available / सुरक्षित ड्राफ्ट उपलब्ध है
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                A previously filled complaint draft is saved in this browser{draftSavedAt ? ` (Saved at: ${draftSavedAt})` : ""}. Your entered data is preserved automatically even when navigating to other pages. Click &ldquo;Restore Last Filled Draft&rdquo; anytime to recover your entries.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              onClick={handleRestoreDraft}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs gap-1.5 cursor-pointer shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Last Filled Draft</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDiscardDraft}
              className="text-xs border-amber-300 text-amber-900 hover:bg-amber-100 cursor-pointer"
            >
              Discard Draft
            </Button>
            <button
              type="button"
              onClick={() => setDraftBannerDismissed(true)}
              className="p-1 text-amber-700 hover:text-amber-950 rounded cursor-pointer"
              title="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Draft Status & Actions Control Bar + Voice Dictation Bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${hasStoredDraft ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
          <div>
            <span className="font-bold text-slate-800">
              {hasStoredDraft
                ? `Draft Auto-Saved${draftSavedAt ? ` at ${draftSavedAt}` : ""}`
                : "Auto-Save Active"}
            </span>
            <span className="text-[11px] text-slate-500 ml-1.5 hidden md:inline">
              (Form stays preserved when navigating across pages)
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Restore Last Draft Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRestoreDraft}
            disabled={!hasStoredDraft}
            className="text-xs font-bold gap-1.5 border-slate-300 hover:bg-white text-blue-900 bg-blue-50/50 cursor-pointer shadow-2xs"
            title="Restore the last auto-saved draft"
          >
            <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
            <span>Restore Last Draft</span>
          </Button>

          {/* Manual Save Draft Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleManualSaveDraft}
            className="text-xs font-semibold gap-1.5 border-slate-300 hover:bg-white text-emerald-900 bg-emerald-50/50 cursor-pointer shadow-2xs"
            title="Explicitly save form as draft now"
          >
            <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Save as Draft</span>
          </Button>

          {/* Voice Language Selector */}
          <div className="flex items-center gap-1 pl-2 border-l border-slate-300 shrink-0">
            <Mic className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <button
              type="button"
              onClick={() => setVoiceLang("en-IN")}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                voiceLang === "en-IN" ? "bg-[#0b192c] text-white" : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setVoiceLang("hi-IN")}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                voiceLang === "hi-IN" ? "bg-[#0b192c] text-white" : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              Hindi
            </button>
          </div>
        </div>
      </div>

      {/* Main Single Form Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-5 sm:p-7">
          <form onSubmit={handleInitiateRegister} className="space-y-8">

            {/* =========================================================================
                1. COMPLAINANT DETAILS
               ========================================================================= */}
            <div id="sec-complainant" className="space-y-4 p-4 sm:p-6 bg-sky-50/60 border border-sky-200 rounded-2xl shadow-2xs">
              <div className="border-b border-sky-200/80 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-[#0b192c] uppercase tracking-wide flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-600" />
                    <span>1. Complainant Details</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Particulars of citizen(s) lodging the complaint (All fields are mandatory)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => autofillFileInputRef.current?.click()}
                    disabled={isAutofilling}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingAutofill(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingAutofill(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingAutofill(false);
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleAutofillFileSelect(e.dataTransfer.files);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer ${
                      isDraggingAutofill
                        ? "bg-amber-500 text-slate-900 scale-105 ring-2 ring-amber-300"
                        : "bg-[#0b192c] hover:bg-slate-900 text-white"
                    }`}
                    title="Click or Drag & Drop handwritten photo, scanned PDF, document, or audio to autofill all fields"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {isAutofilling
                        ? "Processing..."
                        : isDraggingAutofill
                        ? "Drop File to Autofill"
                        : "Upload & Autofill Form"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddComplainant}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Another Complainant</span>
                  </button>
                </div>
              </div>

              {complainants.map((comp, idx) => (
                <div
                  key={comp.id}
                  className="p-4 sm:p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Complainant #{idx + 1} Particulars
                      </h4>
                    </div>
                    {complainants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveComplainant(idx)}
                        className="text-red-600 hover:text-red-800 text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Complainant</span>
                      </button>
                    )}
                  </div>

                  {/* (a) Name, Relation, Relative Name, Age, Gender (All Mandatory) */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-4">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700">
                          Complainant Full Name *
                        </label>
                        <VoiceInputButton
                          onTranscript={(val) => {
                            handleComplainantChange(idx, "name", val);
                            if (idx === 0) markFieldAsEdited("complainantName");
                          }}
                          currentValue={comp.name}
                          fieldLabel="Complainant Name"
                          preferredLang={voiceLang}
                          iconOnly={true}
                        />
                      </div>
                      <input
                        type="text"
                        value={comp.name}
                        onChange={(e) => {
                          handleComplainantChange(idx, "name", e.target.value);
                          if (idx === 0) markFieldAsEdited("complainantName");
                        }}
                        placeholder="e.g. Rameshwar Dass"
                        className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all font-medium ${
                          validationErrors[`comp_${idx}_name`]
                            ? "border-red-500 bg-red-50"
                            : isAutofilled("complainantName") && idx === 0
                            ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                            : "bg-slate-50 border-slate-300"
                        }`}
                      />
                      {validationErrors[`comp_${idx}_name`] && (
                        <p className="text-[11px] text-red-600 mt-0.5">{validationErrors[`comp_${idx}_name`]}</p>
                      )}
                    </div>

                    <div className="sm:col-span-1">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700 truncate" title="Relation (Optional)">
                          Relation
                        </label>
                      </div>
                      <select
                        value={comp.relationType}
                        onChange={(e) => {
                          handleComplainantChange(idx, "relationType", e.target.value);
                          if (idx === 0) markFieldAsEdited("complainantRelationType");
                        }}
                        className={`w-full px-2 py-2 text-xs sm:text-sm border rounded-lg focus:ring-2 focus:ring-[#0b192c] font-semibold text-center transition-all ${
                          isAutofilled("complainantRelationType") && idx === 0
                            ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                            : "bg-slate-50 border-slate-300"
                        }`}
                      >
                        {dynamicRelations.length > 0 ? (
                          dynamicRelations.map((r) => (
                            <option key={r.code} value={r.code}>
                              {r.label}
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="S/O">S/o</option>
                            <option value="D/O">D/o</option>
                            <option value="W/O">W/o</option>
                            <option value="C/O">C/o</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="sm:col-span-4">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700">
                          Relative Name {comp.relationType ? `(${comp.relationType})` : ""}
                        </label>
                        <VoiceInputButton
                          onTranscript={(val) => {
                            handleComplainantChange(idx, "relativeName", val);
                            if (idx === 0) markFieldAsEdited("complainantRelativeName");
                          }}
                          currentValue={comp.relativeName || ""}
                          fieldLabel="Relative Name"
                          preferredLang={voiceLang}
                          iconOnly={true}
                        />
                      </div>
                      <input
                        type="text"
                        value={comp.relativeName || ""}
                        onChange={(e) => {
                          handleComplainantChange(idx, "relativeName", e.target.value);
                          if (idx === 0) markFieldAsEdited("complainantRelativeName");
                        }}
                        placeholder="e.g. Sh. Balwant Rai (Optional)"
                        className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all ${
                          isAutofilled("complainantRelativeName") && idx === 0
                            ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                            : "bg-slate-50 border-slate-300"
                        }`}
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700 truncate" title="Age (Years, Optional)">
                          Age
                        </label>
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={comp.age || ""}
                        onChange={(e) => {
                          handleComplainantChange(idx, "age", e.target.value);
                          if (idx === 0) markFieldAsEdited("complainantAge");
                        }}
                        placeholder="35"
                        className={`w-full px-2 py-2 text-xs sm:text-sm border rounded-lg focus:ring-2 focus:ring-[#0b192c] text-center transition-all ${
                          validationErrors[`comp_${idx}_age`]
                            ? "border-red-500 bg-red-50"
                            : isAutofilled("complainantAge") && idx === 0
                            ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                            : "bg-slate-50 border-slate-300"
                        }`}
                      />
                      {validationErrors[`comp_${idx}_age`] && (
                        <p className="text-[11px] text-red-600 mt-0.5">{validationErrors[`comp_${idx}_age`]}</p>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Gender
                        </label>
                      </div>
                      <select
                        value={comp.gender || "MALE"}
                        onChange={(e: any) => {
                          handleComplainantChange(idx, "gender", e.target.value);
                          if (idx === 0) markFieldAsEdited("complainantGender");
                        }}
                        className={`w-full px-3 py-2 text-xs sm:text-sm border rounded-lg focus:ring-2 focus:ring-[#0b192c] font-semibold transition-all ${
                          isAutofilled("complainantGender") && idx === 0
                            ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                            : "bg-slate-50 border-slate-300"
                        }`}
                      >
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="TRANSGENDER">Transgender</option>
                      </select>
                    </div>
                  </div>

                  {/* (b) Address which has present and permanent and a check box if permanent same as present */}
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span>Present Residential Address (All fields mandatory) *</span>
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      {/* Nationality Dropdown */}
                      <div className="sm:col-span-3">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Nationality *
                        </label>
                        <select
                          value={comp.nationalityChoice}
                          onChange={(e: any) => handleComplainantChange(idx, "nationalityChoice", e.target.value)}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0b192c] font-semibold"
                        >
                          <option value="Indian">Indian</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      {/* If Other, column for fill opens */}
                      {comp.nationalityChoice === "Other" && (
                        <div className="sm:col-span-3 animate-in fade-in-50">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Specify Nationality *
                          </label>
                          <input
                            type="text"
                            value={comp.otherNationality}
                            onChange={(e) => handleComplainantChange(idx, "otherNationality", e.target.value)}
                            placeholder="e.g. British / American / Canadian"
                            className={`w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border rounded-lg focus:ring-2 focus:ring-[#0b192c] ${
                              validationErrors[`comp_${idx}_otherNationality`]
                                ? "border-red-500 bg-red-50"
                                : "border-slate-300"
                            }`}
                          />
                          {validationErrors[`comp_${idx}_otherNationality`] && (
                            <p className="text-[11px] text-red-600 mt-0.5">
                              {validationErrors[`comp_${idx}_otherNationality`]}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Address */}
                      <div className={comp.nationalityChoice === "Other" ? "sm:col-span-6" : "sm:col-span-9"}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-slate-700">
                            Address (House / Street / Mohalla) *
                          </label>
                          <VoiceInputButton
                            onTranscript={(val) => {
                              handleComplainantChange(idx, "presentAddress", val);
                              if (idx === 0) markFieldAsEdited("complainantPresentAddress");
                            }}
                            currentValue={comp.presentAddress}
                            fieldLabel="Present Address"
                            preferredLang={voiceLang}
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          value={comp.presentAddress}
                          onChange={(e) => {
                            handleComplainantChange(idx, "presentAddress", e.target.value);
                            if (idx === 0) markFieldAsEdited("complainantPresentAddress");
                          }}
                          placeholder="e.g. House No. 89, Gali No. 4, Mohan Nagar"
                          className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all ${
                            validationErrors[`comp_${idx}_presentAddress`]
                              ? "border-red-500 bg-red-50"
                              : isAutofilled("complainantPresentAddress") && idx === 0
                              ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                              : "bg-slate-50 border-slate-300"
                          }`}
                        />
                        {validationErrors[`comp_${idx}_presentAddress`] && (
                          <p className="text-[11px] text-red-600 mt-0.5">
                            {validationErrors[`comp_${idx}_presentAddress`]}
                          </p>
                        )}
                      </div>

                      {/* Village / City */}
                      <div className="sm:col-span-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-slate-700">
                            Village / City *
                          </label>
                          <VoiceInputButton
                            onTranscript={(val) => {
                              handleComplainantChange(idx, "presentCity", val);
                              if (idx === 0) markFieldAsEdited("complainantPresentCity");
                            }}
                            currentValue={comp.presentCity}
                            fieldLabel="Village / City"
                            preferredLang={voiceLang}
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          value={comp.presentCity}
                          onChange={(e) => {
                            handleComplainantChange(idx, "presentCity", e.target.value);
                            if (idx === 0) markFieldAsEdited("complainantPresentCity");
                          }}
                          placeholder="e.g. Kurukshetra"
                          className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all ${
                            validationErrors[`comp_${idx}_presentCity`]
                              ? "border-red-500 bg-red-50"
                              : isAutofilled("complainantPresentCity") && idx === 0
                              ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                              : "bg-slate-50 border-slate-300"
                          }`}
                        />
                        {validationErrors[`comp_${idx}_presentCity`] && (
                          <p className="text-[11px] text-red-600 mt-0.5">
                            {validationErrors[`comp_${idx}_presentCity`]}
                          </p>
                        )}
                      </div>

                      {/* District */}
                      <div className="sm:col-span-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-slate-700">
                            District *
                          </label>
                          <VoiceInputButton
                            onTranscript={(val) => {
                              handleComplainantChange(idx, "presentDistrict", val);
                              if (idx === 0) markFieldAsEdited("complainantPresentDistrict");
                            }}
                            currentValue={comp.presentDistrict}
                            fieldLabel="District"
                            preferredLang={voiceLang}
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          value={comp.presentDistrict}
                          onChange={(e) => {
                            handleComplainantChange(idx, "presentDistrict", e.target.value);
                            if (idx === 0) markFieldAsEdited("complainantPresentDistrict");
                          }}
                          placeholder="e.g. Kurukshetra"
                          className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all ${
                            validationErrors[`comp_${idx}_presentDistrict`]
                              ? "border-red-500 bg-red-50"
                              : isAutofilled("complainantPresentDistrict") && idx === 0
                              ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                              : "bg-slate-50 border-slate-300"
                          }`}
                        />
                        {validationErrors[`comp_${idx}_presentDistrict`] && (
                          <p className="text-[11px] text-red-600 mt-0.5">
                            {validationErrors[`comp_${idx}_presentDistrict`]}
                          </p>
                        )}
                      </div>

                      {/* State */}
                      <div className="sm:col-span-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-slate-700">
                            State *
                          </label>
                          <VoiceInputButton
                            onTranscript={(val) => {
                              handleComplainantChange(idx, "presentState", val);
                              if (idx === 0) markFieldAsEdited("complainantPresentState");
                            }}
                            currentValue={comp.presentState}
                            fieldLabel="State"
                            preferredLang={voiceLang}
                            iconOnly={true}
                          />
                        </div>
                        <input
                          type="text"
                          value={comp.presentState}
                          onChange={(e) => {
                            handleComplainantChange(idx, "presentState", e.target.value);
                            if (idx === 0) markFieldAsEdited("complainantPresentState");
                          }}
                          placeholder="e.g. Haryana"
                          className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all ${
                            validationErrors[`comp_${idx}_presentState`]
                              ? "border-red-500 bg-red-50"
                              : isAutofilled("complainantPresentState") && idx === 0
                              ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                              : "bg-slate-50 border-slate-300"
                          }`}
                        />
                        {validationErrors[`comp_${idx}_presentState`] && (
                          <p className="text-[11px] text-red-600 mt-0.5">
                            {validationErrors[`comp_${idx}_presentState`]}
                          </p>
                        )}
                      </div>

                      {/* Country (By default India if nationality is Indian) */}
                      <div className="sm:col-span-3">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Country *
                        </label>
                        <input
                          type="text"
                          value={comp.presentCountry}
                          onChange={(e) => handleComplainantChange(idx, "presentCountry", e.target.value)}
                          placeholder="e.g. India"
                          readOnly={comp.nationalityChoice === "Indian"}
                          className={`w-full px-3 py-2 text-xs sm:text-sm border rounded-lg focus:ring-2 focus:ring-[#0b192c] ${
                            comp.nationalityChoice === "Indian"
                              ? "bg-slate-100 text-slate-700 cursor-not-allowed font-medium"
                              : "bg-slate-50"
                          } ${
                            validationErrors[`comp_${idx}_presentCountry`]
                              ? "border-red-500 bg-red-50"
                              : "border-slate-300"
                          }`}
                        />
                        {validationErrors[`comp_${idx}_presentCountry`] && (
                          <p className="text-[11px] text-red-600 mt-0.5">
                            {validationErrors[`comp_${idx}_presentCountry`]}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Mobile No. showing Country Code: Default +91 and 10 digits if Indian, editable if other */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between max-w-md mb-1">
                        <label className="text-xs font-semibold text-slate-700">
                          Mobile Number {comp.nationalityChoice === "Indian" ? "(Strictly 10 Digits)" : "(Contact Phone)"} *
                        </label>
                        <VoiceInputButton
                          onTranscript={(val) => {
                            const cleanNum = val.replace(/\D/g, "");
                            handleComplainantChange(idx, "mobile", cleanNum || val);
                            if (idx === 0) markFieldAsEdited("complainantMobile");
                          }}
                          currentValue={comp.mobile}
                          fieldLabel="Mobile Number"
                          preferredLang={voiceLang}
                          iconOnly={true}
                        />
                      </div>
                      <div className="max-w-md flex items-center gap-2">
                        {comp.nationalityChoice === "Indian" ? (
                          <div className="w-full relative flex items-center">
                            <span className="absolute left-3 font-mono font-bold text-xs text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded">
                              +91
                            </span>
                            <input
                              type="tel"
                              maxLength={10}
                              value={comp.mobile}
                              onChange={(e) => {
                                handleComplainantChange(idx, "mobile", e.target.value);
                                if (idx === 0) markFieldAsEdited("complainantMobile");
                              }}
                              placeholder="9812000000"
                              className={`w-full pl-14 pr-3 py-2 text-xs sm:text-sm rounded-lg font-mono tracking-wider focus:ring-2 focus:ring-[#0b192c] transition-all ${
                                validationErrors[`comp_${idx}_mobile`]
                                  ? "border-red-500 bg-red-50"
                                  : isAutofilled("complainantMobile") && idx === 0
                                  ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                                  : "bg-slate-50 border-slate-300"
                              }`}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 w-full">
                            <div className="w-24 shrink-0">
                              <input
                                type="text"
                                value={comp.countryCode}
                                onChange={(e) => handleComplainantChange(idx, "countryCode", e.target.value)}
                                placeholder="+1"
                                className="w-full px-2.5 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold text-center focus:ring-2 focus:ring-[#0b192c]"
                                title="Country Code"
                              />
                            </div>
                            <input
                              type="tel"
                              maxLength={15}
                              value={comp.mobile}
                              onChange={(e) => {
                                handleComplainantChange(idx, "mobile", e.target.value);
                                if (idx === 0) markFieldAsEdited("complainantMobile");
                              }}
                              placeholder="Enter Phone Number"
                              className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg font-mono tracking-wider focus:ring-2 focus:ring-[#0b192c] transition-all ${
                                validationErrors[`comp_${idx}_mobile`]
                                  ? "border-red-500 bg-red-50"
                                  : isAutofilled("complainantMobile") && idx === 0
                                  ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                                  : "bg-slate-50 border-slate-300"
                              }`}
                            />
                          </div>
                        )}
                      </div>
                      {validationErrors[`comp_${idx}_mobile`] && (
                        <p className="text-[11px] text-red-600 mt-0.5">{validationErrors[`comp_${idx}_mobile`]}</p>
                      )}
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Official station SMS receipt and verification OTP dispatched to this number.
                      </span>
                    </div>

                    {/* Permanent Address Same Checkbox */}
                    <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`comp_same_addr_${idx}`}
                        checked={comp.isPermanentSameAsPresent}
                        onChange={(e) => handleComplainantChange(idx, "isPermanentSameAsPresent", e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                      />
                      <label htmlFor={`comp_same_addr_${idx}`} className="text-xs font-semibold text-slate-800 cursor-pointer">
                        Permanent Address is same as Present Address
                      </label>
                    </div>

                    {/* If NOT same, display separate Permanent Address columns */}
                    {!comp.isPermanentSameAsPresent && (
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-2 animate-in fade-in-50">
                        <h6 className="text-xs font-bold text-slate-800">Permanent Address (All fields mandatory) *</h6>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-12">
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-semibold text-slate-700">
                                Permanent Address (House / Street / Mohalla) *
                              </label>
                              <VoiceInputButton
                                onTranscript={(val) => handleComplainantChange(idx, "permanentAddress", val)}
                                currentValue={comp.permanentAddress}
                                fieldLabel="Permanent Address"
                                preferredLang={voiceLang}
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              value={comp.permanentAddress}
                              onChange={(e) => handleComplainantChange(idx, "permanentAddress", e.target.value)}
                              placeholder="Permanent Address Line"
                              className={`w-full px-3 py-2 text-xs sm:text-sm bg-white border rounded-lg focus:ring-2 focus:ring-[#0b192c] ${
                                validationErrors[`comp_${idx}_permanentAddress`]
                                  ? "border-red-500 bg-red-50"
                                  : "border-slate-300"
                              }`}
                            />
                            {validationErrors[`comp_${idx}_permanentAddress`] && (
                              <p className="text-[11px] text-red-600 mt-0.5">
                                {validationErrors[`comp_${idx}_permanentAddress`]}
                              </p>
                            )}
                          </div>

                          <div className="sm:col-span-3">
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-semibold text-slate-700">Permanent Village / City *</label>
                              <VoiceInputButton
                                onTranscript={(val) => handleComplainantChange(idx, "permanentCity", val)}
                                currentValue={comp.permanentCity}
                                fieldLabel="Permanent Village / City"
                                preferredLang={voiceLang}
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              value={comp.permanentCity}
                              onChange={(e) => handleComplainantChange(idx, "permanentCity", e.target.value)}
                              className={`w-full px-3 py-2 text-xs sm:text-sm bg-white border rounded-lg focus:ring-2 focus:ring-[#0b192c] ${
                                validationErrors[`comp_${idx}_permanentCity`]
                                  ? "border-red-500 bg-red-50"
                                  : "border-slate-300"
                              }`}
                            />
                            {validationErrors[`comp_${idx}_permanentCity`] && (
                              <p className="text-[11px] text-red-600 mt-0.5">
                                {validationErrors[`comp_${idx}_permanentCity`]}
                              </p>
                            )}
                          </div>
                          <div className="sm:col-span-3">
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-semibold text-slate-700">District *</label>
                              <VoiceInputButton
                                onTranscript={(val) => handleComplainantChange(idx, "permanentDistrict", val)}
                                currentValue={comp.permanentDistrict}
                                fieldLabel="Permanent District"
                                preferredLang={voiceLang}
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              value={comp.permanentDistrict}
                              onChange={(e) => handleComplainantChange(idx, "permanentDistrict", e.target.value)}
                              className={`w-full px-3 py-2 text-xs sm:text-sm bg-white border rounded-lg focus:ring-2 focus:ring-[#0b192c] ${
                                validationErrors[`comp_${idx}_permanentDistrict`]
                                  ? "border-red-500 bg-red-50"
                                  : "border-slate-300"
                              }`}
                            />
                            {validationErrors[`comp_${idx}_permanentDistrict`] && (
                              <p className="text-[11px] text-red-600 mt-0.5">
                                {validationErrors[`comp_${idx}_permanentDistrict`]}
                              </p>
                            )}
                          </div>
                          <div className="sm:col-span-3">
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-semibold text-slate-700">State *</label>
                              <VoiceInputButton
                                onTranscript={(val) => handleComplainantChange(idx, "permanentState", val)}
                                currentValue={comp.permanentState}
                                fieldLabel="Permanent State"
                                preferredLang={voiceLang}
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              value={comp.permanentState}
                              onChange={(e) => handleComplainantChange(idx, "permanentState", e.target.value)}
                              className={`w-full px-3 py-2 text-xs sm:text-sm bg-white border rounded-lg focus:ring-2 focus:ring-[#0b192c] ${
                                validationErrors[`comp_${idx}_permanentState`]
                                  ? "border-red-500 bg-red-50"
                                  : "border-slate-300"
                              }`}
                            />
                            {validationErrors[`comp_${idx}_permanentState`] && (
                              <p className="text-[11px] text-red-600 mt-0.5">
                                {validationErrors[`comp_${idx}_permanentState`]}
                              </p>
                            )}
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Country *</label>
                            <input
                              type="text"
                              value={comp.permanentCountry}
                              onChange={(e) => handleComplainantChange(idx, "permanentCountry", e.target.value)}
                              className={`w-full px-3 py-2 text-xs sm:text-sm bg-white border rounded-lg focus:ring-2 focus:ring-[#0b192c] ${
                                validationErrors[`comp_${idx}_permanentCountry`]
                                  ? "border-red-500 bg-red-50"
                                  : "border-slate-300"
                              }`}
                            />
                            {validationErrors[`comp_${idx}_permanentCountry`] && (
                              <p className="text-[11px] text-red-600 mt-0.5">
                                {validationErrors[`comp_${idx}_permanentCountry`]}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* =========================================================================
                2. ACCUSED DETAILS (Default: NO)
               ========================================================================= */}
            <div id="sec-accused" className="space-y-4 p-4 sm:p-6 bg-amber-50/60 border border-amber-200 rounded-2xl shadow-2xs">
              <div className="border-b border-amber-200/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-[#0b192c] uppercase tracking-wide flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-600" />
                    <span>2. Accused / Suspect Details</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Select whether the particulars of the suspect(s) are known at this stage
                  </p>
                </div>

                {/* Accused Known Toggle: Default NO */}
                <div className={`flex items-center gap-2 bg-white/90 p-1 rounded-lg border shadow-2xs transition-all ${
                  isAutofilled("isAccusedKnown") ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100" : "border-amber-200"
                }`}>
                  <div className="flex items-center gap-1.5 px-2">
                    <span className="text-xs font-bold text-slate-700">Accused Known?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAccusedKnown(false)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      !isAccusedKnown
                        ? "bg-[#0b192c] text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    No (Unidentified)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAccusedKnown(true)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      isAccusedKnown
                        ? "bg-amber-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Yes (Accused Known)
                  </button>
                </div>
              </div>

              {!isAccusedKnown ? (
                /* Default NO View */
                <div className="p-4 bg-white/80 border border-amber-200 rounded-xl text-center space-y-1.5 shadow-2xs">
                  <p className="text-xs font-bold text-slate-700">
                    Suspect(s) Unidentified / Unknown at this stage
                  </p>
                  <p className="text-[11px] text-slate-500">
                    The complaint will be registered against unknown persons. The designated Enquiry Officer (EO) will
                    determine the identity of the suspects during spot enquiry and evidence examination.
                  </p>
                </div>
              ) : (
                /* YES View: S. No., Name, Address */
                <div className="space-y-3 animate-in fade-in-50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Known Suspect List ({accusedList.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddAccused}
                      className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Another Accused</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {accusedList.map((acc, idx) => (
                      <div
                        key={acc.id}
                        className="p-3.5 sm:p-4 bg-white border border-amber-200 rounded-xl space-y-3 shadow-2xs"
                      >
                        <div className="flex items-center justify-between border-b border-amber-100 pb-1.5">
                          <span className="font-bold text-xs text-amber-950 font-mono">
                            S. No. {idx + 1}
                          </span>
                          {accusedList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveAccused(idx)}
                              className="text-red-600 hover:text-red-800 text-xs font-medium flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-semibold text-slate-700">
                                Accused Name *
                              </label>
                              <VoiceInputButton
                                onTranscript={(val) => {
                                  handleAccusedChange(idx, "name", val);
                                  markFieldAsEdited(`accused_${idx}_name`);
                                }}
                                currentValue={acc.name}
                                fieldLabel="Accused Name"
                                preferredLang={voiceLang}
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              value={acc.name}
                              onChange={(e) => {
                                handleAccusedChange(idx, "name", e.target.value);
                                markFieldAsEdited(`accused_${idx}_name`);
                              }}
                              placeholder="e.g. Vikas Aggarwal"
                              className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all ${
                                validationErrors[`acc_${idx}_name`]
                                  ? "border-red-500 bg-red-50"
                                  : (isAutofilled(`accused_${idx}_name`) || (idx === 0 && isAutofilled("accused_0_name")))
                                  ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                                  : "bg-slate-50 border-slate-300"
                              }`}
                            />
                            {validationErrors[`acc_${idx}_name`] && (
                              <p className="text-[11px] text-red-600 mt-0.5">
                                {validationErrors[`acc_${idx}_name`]}
                              </p>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-semibold text-slate-700">
                                Accused Address *
                              </label>
                              <VoiceInputButton
                                onTranscript={(val) => {
                                  handleAccusedChange(idx, "address", val);
                                  markFieldAsEdited(`accused_${idx}_address`);
                                }}
                                currentValue={acc.address}
                                fieldLabel="Accused Address"
                                preferredLang={voiceLang}
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              value={acc.address}
                              onChange={(e) => {
                                handleAccusedChange(idx, "address", e.target.value);
                                markFieldAsEdited(`accused_${idx}_address`);
                              }}
                              placeholder="e.g. Shop No. 12, Old Grain Market, Thanesar"
                              className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all ${
                                validationErrors[`acc_${idx}_address`]
                                  ? "border-red-500 bg-red-50"
                                  : (isAutofilled(`accused_${idx}_address`) || (idx === 0 && isAutofilled("accused_0_address")))
                                  ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                                  : "bg-slate-50 border-slate-300"
                              }`}
                            />
                            {validationErrors[`acc_${idx}_address`] && (
                              <p className="text-[11px] text-red-600 mt-0.5">
                                {validationErrors[`acc_${idx}_address`]}
                              </p>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-semibold text-slate-700">
                                Contact Phone (If Known)
                              </label>
                              <VoiceInputButton
                                onTranscript={(val) => {
                                  const cleanNum = val.replace(/\D/g, "");
                                  handleAccusedChange(idx, "phone", cleanNum || val);
                                  markFieldAsEdited(`accused_${idx}_phone`);
                                }}
                                currentValue={acc.phone || ""}
                                fieldLabel="Accused Phone"
                                preferredLang={voiceLang}
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="tel"
                              value={acc.phone || ""}
                              onChange={(e) => {
                                handleAccusedChange(idx, "phone", e.target.value);
                                markFieldAsEdited(`accused_${idx}_phone`);
                              }}
                              placeholder="e.g. 9416000000"
                              className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg font-mono focus:ring-2 focus:ring-[#0b192c] transition-all ${
                                (isAutofilled(`accused_${idx}_phone`) || (idx === 0 && isAutofilled("accused_0_phone")))
                                  ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                                  : "bg-slate-50 border-slate-300"
                              }`}
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-semibold text-slate-700">
                                Alias / Nickname / Relation (If Known)
                              </label>
                              <VoiceInputButton
                                onTranscript={(val) => {
                                  handleAccusedChange(idx, "alias", val);
                                  markFieldAsEdited(`accused_${idx}_alias`);
                                }}
                                currentValue={acc.alias || ""}
                                fieldLabel="Accused Alias / Relation"
                                preferredLang={voiceLang}
                                iconOnly={true}
                              />
                            </div>
                            <input
                              type="text"
                              value={acc.alias || ""}
                              onChange={(e) => {
                                handleAccusedChange(idx, "alias", e.target.value);
                                markFieldAsEdited(`accused_${idx}_alias`);
                              }}
                              placeholder="e.g. alias Vicky / Business Partner"
                              className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all ${
                                (isAutofilled(`accused_${idx}_alias`) || (idx === 0 && isAutofilled("accused_0_alias")))
                                  ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                                  : "bg-slate-50 border-slate-300"
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* =========================================================================
                3. INCIDENT DETAILS (COMBINED INCIDENT & COMPLAINT DETAILS)
               ========================================================================= */}
            <div id="sec-incident" className="space-y-5 p-4 sm:p-6 bg-indigo-50/50 border border-indigo-200 rounded-2xl shadow-2xs">
              <div className="border-b border-indigo-200/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-[#0b192c] uppercase tracking-wide flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>3. Incident &amp; Complaint Details</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Occurrence spot, date/time, classification of crime, brief subject, summary and comprehensive allegations
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-white px-2.5 py-1 rounded-full border border-indigo-200 self-start sm:self-auto shadow-2xs">
                  BNSS Sec 173(3) Particulars
                </span>
              </div>

              {/* Row 1: Place of Incident & Crime Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      (a) Place of Incident (Crime Spot) *
                    </label>
                    <VoiceInputButton
                      onTranscript={(val) => {
                        setIncidentPlace(val);
                        markFieldAsEdited("incidentPlace");
                        if (validationErrors.incidentPlace) {
                          setValidationErrors((prev) => {
                            const next = { ...prev };
                            delete next.incidentPlace;
                            return next;
                          });
                        }
                      }}
                      currentValue={incidentPlace}
                      fieldLabel="Place of Incident"
                      preferredLang={voiceLang}
                      iconOnly={true}
                    />
                  </div>
                  <input
                    type="text"
                    value={incidentPlace}
                    onChange={(e) => {
                      setIncidentPlace(e.target.value);
                      markFieldAsEdited("incidentPlace");
                      if (validationErrors.incidentPlace) {
                        setValidationErrors((prev) => {
                          const next = { ...prev };
                          delete next.incidentPlace;
                          return next;
                        });
                      }
                    }}
                    placeholder="e.g. Near New Bus Stand Chowk, Thanesar"
                    className={`w-full px-3 py-2 text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all ${
                      validationErrors.incidentPlace
                        ? "border-red-500 bg-red-50"
                        : isAutofilled("incidentPlace")
                        ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                        : "bg-white border-slate-300"
                    }`}
                  />
                  {validationErrors.incidentPlace && (
                    <p className="text-[11px] text-red-600 mt-0.5">{validationErrors.incidentPlace}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      (b) Class of Incident (Crime Category) *
                    </label>
                  </div>
                  <select
                    value={incidentCategory}
                    onChange={(e: any) => {
                      setIncidentCategory(e.target.value);
                      markFieldAsEdited("incidentCategory");
                    }}
                    className={`w-full px-3 py-2 text-xs sm:text-sm border rounded-lg focus:ring-2 focus:ring-[#0b192c] font-medium transition-all ${
                      isAutofilled("incidentCategory")
                        ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                        : "bg-white border-slate-300"
                    }`}
                  >
                    {dynamicCategories.length > 0 ? (
                      dynamicCategories.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="FINANCIAL_FRAUD_CHEATING">Financial Fraud / Cheating</option>
                        <option value="CYBER_CRIME">Cyber Crime / Online Fraud</option>
                        <option value="LAND_PROPERTY_DISPUTE">Land / Boundary Dispute</option>
                        <option value="PHYSICAL_ASSAULT_AFFRAY">Physical Assault / Affray</option>
                        <option value="PROPERTY_THEFT_BURGLARY">Theft / Burglary</option>
                        <option value="DOMESTIC_VIOLENCE_DOWRY">Domestic Violence / Dowry</option>
                        <option value="PUBLIC_NUISANCE">Public Nuisance / Brawl</option>
                        <option value="MISSING_PERSON">Missing Person</option>
                        <option value="NARCOTICS_DRUGS_INFO">Narcotics / Drugs Information</option>
                        <option value="HARASSMENT_STALKING">Harassment / Stalking</option>
                        <option value="OTHER_GENERAL">Other General Matter</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Row 2: Date / Time of Incident Known toggle & Inputs */}
              <div className="p-3 bg-white/90 border border-indigo-200 rounded-xl shadow-2xs">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="flex items-center gap-2.5 shrink-0">
                    <label className="text-xs font-bold text-slate-800 whitespace-nowrap">
                      (c) Date / Time of Incident Known?
                    </label>
                    <div className="flex items-center gap-1 bg-slate-50 p-0.5 rounded-lg border border-slate-200 text-xs">
                      <button
                        type="button"
                        onClick={() => setIsDateTimeKnown(true)}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          isDateTimeKnown ? "bg-[#0b192c] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsDateTimeKnown(false)}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          !isDateTimeKnown ? "bg-[#0b192c] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  {isDateTimeKnown ? (
                    <div className="flex flex-1 flex-col sm:flex-row items-center gap-2.5 min-w-0">
                      <div className="w-full sm:flex-1 flex items-center gap-2 min-w-0">
                        <div className="flex items-center gap-1 shrink-0">
                          <label className="text-xs font-semibold text-slate-600">
                            Date *
                          </label>
                        </div>
                        <DatePickerDDMMYYYY
                          value={incidentDate}
                          onChange={(e) => {
                            setIncidentDate(e.target.value);
                            markFieldAsEdited("incidentDate");
                          }}
                          placeholder="DD/MM/YYYY"
                          size="sm"
                          className={isAutofilled("incidentDate") ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100" : ""}
                        />
                      </div>
                      <div className="w-full sm:flex-1 flex items-center gap-2 min-w-0">
                        <div className="flex items-center gap-1 shrink-0">
                          <label className="text-xs font-semibold text-slate-600">
                            Time
                          </label>
                        </div>
                        <input
                          type="time"
                          value={incidentTime}
                          onChange={(e) => {
                            setIncidentTime(e.target.value);
                            markFieldAsEdited("incidentTime");
                          }}
                          className={`w-full px-2.5 py-1.5 text-xs sm:text-sm bg-white border rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all ${
                            isAutofilled("incidentTime")
                              ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                              : "border-slate-300"
                          }`}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <label className="text-xs font-semibold text-slate-600 shrink-0">
                        Approx Period
                      </label>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <input
                          type="text"
                          value={incidentApproxPeriod}
                          onChange={(e) => setIncidentApproxPeriod(e.target.value)}
                          placeholder="e.g. Occurring over past 15 days or exact date not recalled"
                          className="w-full px-2.5 py-1.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0b192c]"
                        />
                        <VoiceInputButton
                          onTranscript={(val) => setIncidentApproxPeriod(val)}
                          currentValue={incidentApproxPeriod}
                          fieldLabel="Approx Period"
                          preferredLang={voiceLang}
                          iconOnly={true}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: Intake Mode, Subject Headline, Fresh/Old, and Is FIR Registered */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-3.5 bg-white/90 border border-indigo-200 rounded-xl shadow-2xs">
                {/* Mode of Intake */}
                <div className="sm:col-span-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 truncate" title="Mode of Intake">
                      Mode of Intake *
                    </label>
                  </div>
                  <select
                    value={intakeMode}
                    onChange={(e) => {
                      setIntakeMode(e.target.value);
                      setSourceChannel(e.target.value as any);
                      markFieldAsEdited("intakeMode");
                    }}
                    className={`w-full px-2.5 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-[#0b192c] font-medium transition-all ${
                      isAutofilled("intakeMode")
                        ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                        : "bg-white border-slate-300"
                    }`}
                  >
                    <option value="WALK_IN_STATION">Walk-in Counter</option>
                    <option value="CM_WINDOW_HARYANA">CM Window (VIP)</option>
                    <option value="CITIZEN_PORTAL_HARPATH">Citizen Portal (HarPath)</option>
                    <option value="EMERGENCY_112">Emergency 112 Call</option>
                    <option value="SP_OFFICE_REFERENCE">SP Office Reference</option>
                    <option value="POSTAL_APPLICATION">Postal Application</option>
                    <option value="WOMEN_HELPDESK">Women Helpdesk</option>
                  </select>
                </div>

                {/* Subject Headline */}
                <div className="sm:col-span-4">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 truncate" title="Subject Headline">
                      Subject (Brief Headline) *
                    </label>
                    <VoiceInputButton
                      onTranscript={(val) => {
                        setComplaintSubject(val);
                        markFieldAsEdited("complaintSubject");
                        if (validationErrors.complaintSubject) {
                          setValidationErrors((prev) => {
                            const next = { ...prev };
                            delete next.complaintSubject;
                            return next;
                          });
                        }
                      }}
                      currentValue={complaintSubject}
                      fieldLabel="Subject Headline"
                      preferredLang={voiceLang}
                      iconOnly={true}
                    />
                  </div>
                  <input
                    type="text"
                    value={complaintSubject}
                    onChange={(e) => {
                      setComplaintSubject(e.target.value);
                      markFieldAsEdited("complaintSubject");
                      if (validationErrors.complaintSubject) {
                        setValidationErrors((prev) => {
                          const next = { ...prev };
                          delete next.complaintSubject;
                          return next;
                        });
                      }
                    }}
                    placeholder="e.g. Complaint regarding cheating / online fraud"
                    className={`w-full px-2.5 py-2 text-xs bg-white border rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all ${
                      validationErrors.complaintSubject
                        ? "border-red-500 bg-red-50"
                        : isAutofilled("complaintSubject")
                        ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                        : "border-slate-300"
                    }`}
                  />
                  {validationErrors.complaintSubject && (
                    <p className="text-[11px] text-red-600 mt-0.5">{validationErrors.complaintSubject}</p>
                  )}
                </div>

                {/* Type of Complaint (Fresh / Old) */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1 truncate" title="Type of Complaint">
                    Complaint Age *
                  </label>
                  <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setComplaintAgeType("FRESH")}
                      className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        complaintAgeType === "FRESH"
                          ? "bg-[#0b192c] text-white shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Fresh
                    </button>
                    <button
                      type="button"
                      onClick={() => setComplaintAgeType("OLD")}
                      className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        complaintAgeType === "OLD"
                          ? "bg-amber-600 text-white shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Old
                    </button>
                  </div>
                </div>

                {/* Is FIR Registered */}
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1 truncate" title="Is FIR Registered?">
                    Is FIR Registered? *
                  </label>
                  <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-200 text-xs w-full">
                    <button
                      type="button"
                      onClick={() => setIsFirRegistered(false)}
                      className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        !isFirRegistered ? "bg-[#0b192c] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsFirRegistered(true)}
                      className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        isFirRegistered ? "bg-red-600 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Yes
                    </button>
                  </div>
                </div>

                {/* If FIR Registered is Yes, show inputs inline */}
                {isFirRegistered && (
                  <div className="sm:col-span-12 p-3 bg-red-50/60 border border-red-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in-50">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        FIR Number *
                      </label>
                      <input
                        type="text"
                        value={firNumber}
                        onChange={(e) => setFirNumber(e.target.value)}
                        placeholder="e.g. FIR No. 104/2026"
                        className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded-lg focus:ring-2 focus:ring-[#0b192c] ${
                          validationErrors.firNumber ? "border-red-500 bg-red-50" : "border-slate-300"
                        }`}
                      />
                      {validationErrors.firNumber && (
                        <p className="text-[11px] text-red-600 mt-0.5">{validationErrors.firNumber}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        FIR Registration Date
                      </label>
                      <DatePickerDDMMYYYY
                        value={firDate}
                        onChange={(e) => setFirDate(e.target.value)}
                        placeholder="DD/MM/YYYY"
                        size="sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Row 4: Description of Incident (Full Complaint / पूरी शिकायत) */}
              <div className="space-y-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-800">
                      Description of Incident / Full Complaint (घटना का संपूर्ण विवरण / पूरी शिकायत) *
                    </label>
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px] text-slate-500">
                    <span className="italic text-slate-500">
                      Complete verbatim complaint text (पूरी शिकायत)
                    </span>
                    <span className="font-mono font-semibold px-2 py-0.5 bg-white rounded text-slate-700 border border-indigo-200">
                      {incidentDetails.trim() ? incidentDetails.trim().split(/\s+/).length : 0} words
                    </span>
                    <VoiceInputButton
                      preferredLang={voiceLang}
                      fieldLabel="Description of Incident / Full Complaint"
                      currentValue={incidentDetails}
                      onTranscript={(val) => {
                        setIncidentDetails((prev) => (prev ? `${prev} ${val}` : val));
                        markFieldAsEdited("incidentDetails");
                      }}
                    />
                  </div>
                </div>
                <textarea
                  rows={12}
                  value={incidentDetails}
                  onChange={(e) => {
                    setIncidentDetails(e.target.value);
                    markFieldAsEdited("incidentDetails");
                  }}
                  placeholder="पूरी शिकायत का संपूर्ण विवरण (Full verbatim text of the complaint / incident as received in document or verbal report)..."
                  className={`w-full min-h-[260px] px-3.5 py-2.5 text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all leading-relaxed shadow-2xs ${
                    isAutofilled("incidentDetails")
                      ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                      : "bg-white border-slate-300"
                  }`}
                />
                <p className="text-[11px] text-slate-500 flex items-center justify-between pt-0.5">
                  <span>Contains the complete, unabridged complaint as submitted by the citizen / complainant.</span>
                  <span className="font-mono text-[10px] text-slate-400">{incidentDetails.length} characters</span>
                </p>
              </div>

              {/* Row 5: Summary of Complaint (Brief Summary / संक्षिप्त सार) */}
              <div className="space-y-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-800">
                      Summary of Complaint (शिकायत का संक्षिप्त विवरण / सारांश) *
                    </label>
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px] text-slate-500">
                    <span className="italic text-slate-500">
                      Brief summary of allegations in minimum words (संक्षिप्त सार)
                    </span>
                    <span className="font-mono font-semibold px-2 py-0.5 bg-white rounded text-slate-700 border border-indigo-200">
                      {complaintDescription.trim() ? complaintDescription.trim().split(/\s+/).length : 0} words
                    </span>
                    <VoiceInputButton
                      preferredLang={voiceLang}
                      fieldLabel="Summary of Complaint"
                      currentValue={complaintDescription}
                      onTranscript={(val) => {
                        setComplaintDescription((prev) => (prev ? `${prev} ${val}` : val));
                        markFieldAsEdited("complaintDescription");
                      }}
                    />
                  </div>
                </div>
                <textarea
                  rows={8}
                  value={complaintDescription}
                  onChange={(e) => {
                    setComplaintDescription(e.target.value);
                    markFieldAsEdited("complaintDescription");
                    if (validationErrors.complaintDescription) {
                      setValidationErrors((prev) => {
                        const next = { ...prev };
                        delete next.complaintDescription;
                        return next;
                      });
                    }
                  }}
                  placeholder="शिकायत का संक्षिप्त सार (Concise structured summary of allegations against respondents, core incident facts, and prayer for police action in minimum words)..."
                  className={`w-full min-h-[180px] px-3.5 py-2.5 text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-[#0b192c] transition-all leading-relaxed shadow-2xs ${
                    validationErrors.complaintDescription
                      ? "border-red-500 bg-red-50"
                      : isAutofilled("complaintDescription")
                      ? "!border-emerald-500 !bg-emerald-50/60 ring-1 ring-emerald-400/80 shadow-xs shadow-emerald-100"
                      : "bg-white border-slate-300"
                  }`}
                />
                {validationErrors.complaintDescription && (
                  <p className="text-[11px] text-red-600 mt-0.5">{validationErrors.complaintDescription}</p>
                )}
                <p className="text-[11px] text-slate-500 flex items-center justify-between pt-0.5">
                  <span>Keep allegations succinct, actionable, and summarized in minimum words for quick review.</span>
                  <span className="font-mono text-[10px] text-slate-400">{complaintDescription.length} characters</span>
                </p>
              </div>

              {/* Row 6: Classification & Purpose */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    (d) Type of Complaint (Classification) *
                  </label>
                  <select
                    value={complaintClassification}
                    onChange={(e) => setComplaintClassification(e.target.value)}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0b192c] font-medium"
                  >
                    <option value="COGNIZABLE_OFFENCE">Cognizable Offence (Requires Investigation)</option>
                    <option value="NON_COGNIZABLE_INCIDENT">Non-Cognizable Incident (NCR Docket)</option>
                    <option value="CIVIL_LAND_DISPUTE">Civil / Land &amp; Demarcation Dispute</option>
                    <option value="DOMESTIC_FAMILY_ACCORD">Domestic / Matrimonial Discord</option>
                    <option value="CYBER_FINANCIAL_FRAUD">Cyber / Online Financial Fraud</option>
                    <option value="PUBLIC_NUISANCE">Public Nuisance / Breach of Peace</option>
                    <option value="MISSING_PERSON_REPORT">Missing Person / Lost Article</option>
                    <option value="SERVICE_VIGILANCE_PETITION">Service Vigilance / Official Petition</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    (e) Complaint Purpose *
                  </label>
                  <select
                    value={complaintPurpose}
                    onChange={(e) => setComplaintPurpose(e.target.value)}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0b192c] font-medium"
                  >
                    <option value="PRELIMINARY_ENQUIRY_BNSS_173">
                      Preliminary Enquiry as per Section 173(3) BNSS
                    </option>
                    <option value="REGISTRATION_OF_FIR">
                      Registration of FIR / Criminal Action
                    </option>
                    <option value="MEDIATION_SETTLEMENT">
                      Mediation &amp; Amicable Settlement
                    </option>
                    <option value="PREVENTIVE_ACTION_BNSS_126">
                      Preventive Action (Security Bond BNSS 126/129)
                    </option>
                    <option value="GENERAL_DIARY_RECORD">
                      Station General Diary (GD / Roznamcha) Record Entry Only
                    </option>
                    <option value="POLICE_ASSISTANCE">
                      Police Assistance &amp; Citizen Protection
                    </option>
                  </select>
                </div>
              </div>
            </div>

            {/* =========================================================================
                4. EVIDENCE & DIGITAL ATTACHMENTS (ENLARGED PANEL & 20MB LIMIT)
               ========================================================================= */}
            <div id="sec-evidence-upload" className="space-y-4 p-4 sm:p-6 bg-emerald-50/50 border border-emerald-200 rounded-2xl shadow-2xs">
              <div className="border-b border-emerald-200/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-[#0b192c] uppercase tracking-wide flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-emerald-700" />
                    <span>4. Evidence &amp; Digital Attachments</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Upload supporting case evidence up to 20 MB per file (PDF, Docs, CCTV Videos, Audio, Images, Records)
                  </p>
                </div>
                {attachments.length > 0 && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-white text-emerald-800 border border-emerald-300 self-start sm:self-auto shadow-2xs">
                    {attachments.length} {attachments.length === 1 ? "File Attached" : "Files Attached"}
                  </span>
                )}
              </div>

              {/* Upload Validation Error Alert */}
              {uploadError && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-950 flex items-center justify-between gap-2 animate-in fade-in-50">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span className="font-semibold">{uploadError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadError(null)}
                    className="text-red-700 hover:text-red-950 p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Upload Progress Bar */}
              {uploadProgress !== null && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1.5 animate-in fade-in-50">
                  <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                    <span>Processing &amp; Validating Uploads...</span>
                    <span className="font-mono">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-blue-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#0b192c] h-full transition-all duration-200 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Enlarged Evidence Upload Drag-and-Drop Panel */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingEvidence(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingEvidence(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingEvidence(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFileUpload(e.dataTransfer.files);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`relative min-h-[190px] border-2 border-dashed rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                  isDraggingEvidence
                    ? "border-blue-600 bg-blue-100/70 scale-101 shadow-md"
                    : "border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/30"
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center mb-3">
                  <Upload className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Drag and drop evidence files here, or <span className="text-blue-600 underline">browse files</span>
                </h3>
                <p className="text-xs text-slate-500 max-w-md mb-3">
                  Upload relevant proof including scanned petitions, CCTV clips, bank screenshots, audio recordings, or call transcripts
                </p>

                {/* Formats and Size Limit Badges */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-xl text-[10px]">
                  <span className="px-2 py-0.5 rounded-md font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    PDF, DOC, DOCX
                  </span>
                  <span className="px-2 py-0.5 rounded-md font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    JPG, PNG, WEBP
                  </span>
                  <span className="px-2 py-0.5 rounded-md font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    MP3, WAV, M4A
                  </span>
                  <span className="px-2 py-0.5 rounded-md font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    MP4, AVI, MOV
                  </span>
                  <span className="px-2 py-0.5 rounded-md font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    CSV, TXT
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md font-extrabold bg-red-100 text-red-800 border border-red-300">
                    Max File Size: 20 MB
                  </span>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="*/*"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
              />

              {/* Attached Files List */}
              {attachments.length > 0 && (
                <div className="space-y-2.5 pt-2">
                  <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Attached Evidence Dossier ({attachments.length} items):</span>
                    <button
                      type="button"
                      onClick={() => setAttachments([])}
                      className="text-red-600 hover:text-red-800 text-xs font-semibold underline cursor-pointer"
                    >
                      Remove All Files
                    </button>
                  </div>

                  <div className="space-y-2">
                    {attachments.map((file) => (
                      <div
                        key={file.id}
                        className="p-3 sm:p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                                file.category === "video"
                                  ? "bg-purple-100 text-purple-700"
                                  : file.category === "audio"
                                  ? "bg-amber-100 text-amber-700"
                                  : file.category === "image"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : file.category === "document"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {file.category === "video" && <Video className="w-4 h-4" />}
                              {file.category === "audio" && <Music className="w-4 h-4" />}
                              {file.category === "image" && <ImageIcon className="w-4 h-4" />}
                              {file.category === "document" && <FileText className="w-4 h-4" />}
                              {file.category === "other" && <File className="w-4 h-4" />}
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{file.name}</p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                <span className="uppercase font-bold text-slate-700">{file.category}</span>
                                <span>•</span>
                                <span>{formatFileSize(file.size)}</span>
                                {file.size > 20 * 1024 * 1024 ? (
                                  <span className="text-red-600 font-bold bg-red-50 px-1.5 py-0.2 rounded border border-red-200">
                                    Exceeds 20 MB Limit
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                    Within 20 MB Limit
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {file.dataUrl && (
                              <button
                                type="button"
                                onClick={() => setPreviewModalFile(file)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                                title="Instant preview without downloading"
                              >
                                <Eye className="w-3.5 h-3.5 text-blue-600" />
                                <span>Preview</span>
                              </button>
                            )}
                            {file.dataUrl && (
                              <a
                                href={file.dataUrl}
                                download={file.name}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg text-xs font-semibold transition-colors shadow-2xs"
                                title="Download file"
                              >
                                <Download className="w-3.5 h-3.5 text-slate-600" />
                                <span>Download</span>
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(file.id)}
                              className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg transition-colors cursor-pointer"
                              title="Remove file"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Audio Preview */}
                        {file.category === "audio" && file.dataUrl && (
                          <div className="pt-1">
                            <audio controls src={file.dataUrl} className="w-full h-8" />
                          </div>
                        )}

                        {/* Video Preview */}
                        {file.category === "video" && file.dataUrl && (
                          <div className="pt-1 max-w-sm">
                            <video controls src={file.dataUrl} className="w-full rounded-lg max-h-48 bg-black" />
                          </div>
                        )}

                        {/* Image Preview */}
                        {file.category === "image" && file.dataUrl && (
                          <div className="pt-1">
                            <img
                              src={file.dataUrl}
                              alt={file.name}
                              className="max-h-36 rounded-lg object-contain border border-slate-200"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* =========================================================================
                5. RUN INTELLIGENCE CHECK (LOCAL ENGINE WITHOUT AI MODEL)
               ========================================================================= */}
            <div id="sec-intel" className="space-y-4 p-4 sm:p-6 bg-purple-50/50 border border-purple-200 rounded-2xl shadow-2xs">
              <div className="border-b border-purple-200/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-[#0b192c] uppercase tracking-wide flex items-center gap-2">
                    <Search className="w-4 h-4 text-purple-600" />
                    <span>5. Run Intelligence Check</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Runs 100% locally by checking specific filled fields (Complainant, Mobile, Accused, Spot &amp; Facts) against station records without AI model
                  </p>
                </div>

                {/* Dropdown Format Button */}
                <div className="relative" ref={dropdownRef}>
                  <div className="inline-flex rounded-lg shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleRunIntelCheck("all")}
                      className="px-3.5 py-1.5 bg-[#0b192c] hover:bg-slate-900 text-white rounded-l-lg text-xs font-bold flex items-center gap-1.5 transition-colors border-r border-slate-700 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>{intelResult ? "Re-Run All Checks" : "Run All Checks"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntelDropdownOpen((prev) => !prev)}
                      className="px-2.5 py-1.5 bg-[#0b192c] hover:bg-slate-900 text-white rounded-r-lg text-xs transition-colors flex items-center justify-center cursor-pointer"
                      title="Select Intelligence Check"
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
                    </button>
                  </div>

                  {intelDropdownOpen && (
                    <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 animate-in fade-in-50">
                      <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Select Check Type</span>
                        <span className="text-emerald-700 font-mono text-[9px] bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">Local Only</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRunIntelCheck("all")}
                        className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-900 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0"></span>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900">Run All Checks</div>
                          <div className="text-[10px] text-slate-500 font-normal">Full local check on all filled fields</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRunIntelCheck("cross")}
                        className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-red-50 hover:text-red-900 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <span className="w-2 h-2 rounded-full bg-red-600 shrink-0"></span>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900">Cross-Complaint Check</div>
                          <div className="text-[10px] text-slate-500 font-normal">Counter complaints by accused / opposite party</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRunIntelCheck("repeat")}
                        className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-amber-50 hover:text-amber-900 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0"></span>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900">Repeat Complainant Check</div>
                          <div className="text-[10px] text-slate-500 font-normal">Scan past filings by complainant mobile &amp; name</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRunIntelCheck("linked")}
                        className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-purple-50 hover:text-purple-900 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0"></span>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900">Linked &amp; Similar Cases</div>
                          <div className="text-[10px] text-slate-500 font-normal">Match crime category, incident spot &amp; facts</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRunIntelCheck("fir")}
                        className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0"></span>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900">Prior FIR Records Check</div>
                          <div className="text-[10px] text-slate-500 font-normal">Check prior historical FIR registry</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Display if Check was executed */}
              {intelResult && (
                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2.5 animate-in fade-in-50">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveIntelTab("cross");
                        setShowIntelModal(true);
                      }}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        intelResult.crossComplaints.length > 0
                          ? "bg-red-50 border-red-200 text-red-900"
                          : "bg-slate-50 border-slate-200 text-slate-600"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase">
                        <span>Cross-Cases</span>
                        <span className={`px-1.5 py-0.2 rounded-full ${intelResult.crossComplaints.length > 0 ? "bg-red-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                          {intelResult.crossComplaints.length}
                        </span>
                      </div>
                      <p className="text-xs font-bold mt-1">
                        {intelResult.crossComplaints.length > 0 ? "Detected" : "Clean"}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveIntelTab("repeat");
                        setShowIntelModal(true);
                      }}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        intelResult.repeatHistory.totalPreviousComplaints > 0
                          ? "bg-amber-50 border-amber-200 text-amber-900"
                          : "bg-slate-50 border-slate-200 text-slate-600"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase">
                        <span>Repeat Files</span>
                        <span className={`px-1.5 py-0.2 rounded-full ${intelResult.repeatHistory.totalPreviousComplaints > 0 ? "bg-amber-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                          {intelResult.repeatHistory.totalPreviousComplaints}
                        </span>
                      </div>
                      <p className="text-xs font-bold mt-1">
                        {intelResult.repeatHistory.totalPreviousComplaints > 0 ? `${intelResult.repeatHistory.totalPreviousComplaints} Found` : "First Time"}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveIntelTab("linked");
                        setShowIntelModal(true);
                      }}
                      className="p-2 rounded-lg border bg-slate-50 border-slate-200 text-slate-600 text-left"
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase">
                        <span>Linked</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-600">
                          {intelResult.linkedComplaints.length}
                        </span>
                      </div>
                      <p className="text-xs font-bold mt-1">
                        {intelResult.linkedComplaints.length > 0 ? "Links Found" : "No Match"}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveIntelTab("fir");
                        setShowIntelModal(true);
                      }}
                      className="p-2 rounded-lg border bg-slate-50 border-slate-200 text-slate-600 text-left"
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase">
                        <span>Prior FIRs</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-700">
                          {intelResult.priorFirs.length}
                        </span>
                      </div>
                      <p className="text-xs font-bold mt-1">
                        {intelResult.priorFirs.length > 0 ? "Records Exist" : "Clean"}
                      </p>
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-[11px] text-slate-500">
                      Checked locally at: {new Date(intelResult.scannedAt).toLocaleTimeString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowIntelModal(true)}
                      className="text-xs text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <span>View Results Details</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            {isSho && (
              <div id="sec-assign-eo" className="space-y-4 p-4 sm:p-6 bg-teal-50/60 border border-teal-200 rounded-2xl shadow-2xs">
                <div className="border-b border-teal-200/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm sm:text-base font-bold text-[#0b192c] uppercase tracking-wide flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-teal-700" />
                        <span>6. Assign EO</span>
                      </h2>
                      <span className="text-[10px] font-bold bg-white text-teal-800 border border-teal-300 px-2 py-0.5 rounded-full shadow-2xs">
                        SHO Authority
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Allocate an Enquiry Officer immediately during complaint registration and issue supervisory directions (Optional)
                    </p>
                  </div>
                </div>

                <div className="p-4 sm:p-5 bg-white border border-teal-200 rounded-xl space-y-3 animate-in fade-in-50 shadow-2xs">
                  {/* Enquiry Officer Selection */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-800">
                      Select Enquiry Officer (From Active Station Roster)
                    </label>
                    <select
                      value={selectedEoId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedEoId(val);
                        setShouldAssignEoNow(Boolean(val));
                      }}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 font-semibold text-slate-800"
                    >
                      <option value="">Select EO</option>
                      {MOCK_ENQUIRY_OFFICERS.map((eo) => (
                        <option key={eo.id} value={eo.id}>
                          {eo.rank} {eo.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Officer will receive instant dispatch alert and case docket access upon submission.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================================
                7. STATUTORY CERTIFICATION & FORM SUBMISSION
               ========================================================================= */}
            <div id="sec-submission" className="space-y-4 p-4 sm:p-6 bg-slate-100/70 border border-slate-200 rounded-2xl shadow-2xs">

              {/* Validation Errors Alert Banner */}
              {Object.keys(validationErrors).length > 0 && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2.5 animate-in fade-in-50">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Please correct the highlighted mandatory fields before registering:</p>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px] text-red-700 font-medium">
                      {Object.entries(validationErrors).map(([key, msg]) => (
                        <li key={key}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Bottom Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <Link href="/complaints" className="w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    className="text-xs font-semibold gap-1.5 w-full sm:w-auto"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Cancel &amp; Return
                  </Button>
                </Link>

                <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={handleOpenPreviewOnly}
                    className="text-xs sm:text-sm font-bold gap-2 border-slate-300 text-slate-800 hover:bg-slate-100 w-full sm:w-auto px-5 py-2.5 shadow-xs transition-all active:scale-98 cursor-pointer"
                  >
                    <Eye className="w-4 h-4 text-blue-600" />
                    Preview (पूर्वावलोकन)
                  </Button>

                  <Button
                    type="submit"
                    variant="danger"
                    size="lg"
                    isLoading={isSubmitting}
                    className="text-xs sm:text-sm font-bold gap-2 bg-[#b8001f] hover:bg-[#990000] w-full sm:w-auto px-6 py-2.5 shadow-md transition-all active:scale-98 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isSho && shouldAssignEoNow
                      ? "Confirm, Register & Assign EO (PPR Rule 22.48)"
                      : "Confirm & Register Complaint (PPR Rule 22.48)"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Central Database Intelligence Check Modal */}
      {showIntelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-in fade-in-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-[#0b192c] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-bold">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-amber-300">
                      Police Database Intelligence Scan
                    </span>
                    {intelResult?.hasAlerts && (
                      <span className="px-1.5 py-0.2 text-[10px] font-bold bg-red-600 text-white rounded">
                        ALERTS FOUND
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-black text-white">
                    Cross-Complaints, Repeat Complainants &amp; Prior FIR Dossier
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIntelModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scanned Parameters Bar */}
            <div className="px-5 py-2.5 bg-slate-100 border-b border-slate-200 text-xs flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700">
              <span className="text-[10px] font-bold uppercase text-slate-500">Query Parameters:</span>
              <span>
                <strong className="text-slate-900">Complainant:</strong> {complainants[0]?.name || "—"} (
                {complainants[0]?.mobile || "No Mobile"})
              </span>
              <span>
                <strong className="text-slate-900">Accused:</strong>{" "}
                {isAccusedKnown ? accusedList[0]?.name || "—" : "Unknown / Unidentified"}
              </span>
              <span>
                <strong className="text-slate-900">Location:</strong> {incidentPlace || "—"}
              </span>
            </div>

            {/* Sub-Tabs Nav */}
            <div className="px-5 pt-3 border-b border-slate-200 flex items-center gap-2 overflow-x-auto bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveIntelTab("all")}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  activeIntelTab === "all"
                    ? "border-[#0b192c] text-[#0b192c]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Overview</span>
                {intelResult?.hasAlerts && <span className="w-2 h-2 rounded-full bg-red-600"></span>}
              </button>

              <button
                type="button"
                onClick={() => setActiveIntelTab("cross")}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  activeIntelTab === "cross"
                    ? "border-red-600 text-red-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                <span>Cross Complaints</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    (intelResult?.crossComplaints.length || 0) > 0
                      ? "bg-red-600 text-white"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {intelResult?.crossComplaints.length || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveIntelTab("repeat")}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  activeIntelTab === "repeat"
                    ? "border-amber-600 text-amber-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                <span>Repeat History</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    (intelResult?.repeatHistory.totalPreviousComplaints || 0) > 0
                      ? "bg-amber-600 text-white"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {intelResult?.repeatHistory.totalPreviousComplaints || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveIntelTab("linked")}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  activeIntelTab === "linked"
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Link2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Linked Cases</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    (intelResult?.linkedComplaints.length || 0) > 0
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {intelResult?.linkedComplaints.length || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveIntelTab("fir")}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  activeIntelTab === "fir"
                    ? "border-emerald-700 text-emerald-800"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Prior FIRs</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    (intelResult?.priorFirs.length || 0) > 0
                      ? "bg-purple-600 text-white"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {intelResult?.priorFirs.length || 0}
                </span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1 max-h-[60vh]">
              {/* CROSS COMPLAINTS VIEW */}
              {(activeIntelTab === "cross" || activeIntelTab === "all") && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-red-950 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-red-600" />
                      <span>Cross-Complaints Against Current Complainant</span>
                    </h4>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {intelResult?.crossComplaints.length || 0} found
                    </span>
                  </div>

                  {intelResult && intelResult.crossComplaints.length > 0 ? (
                    <div className="space-y-2">
                      {intelResult.crossComplaints.map((match) => (
                        <div
                          key={match.existingComplaint.id}
                          className="p-3 bg-red-50/70 border border-red-200 rounded-xl space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-red-900">
                              {match.existingComplaint.complaintNumber}
                            </span>
                            <span className="text-[10px] bg-red-200 text-red-900 px-2 py-0.5 rounded font-bold">
                              Severity: {match.severity}
                            </span>
                          </div>
                          <p className="text-slate-700 text-[11px] leading-relaxed">
                            <strong>Opposite Complainant:</strong> {match.existingComplaint.complainantName} (Mob:{" "}
                            {match.existingComplaint.complainantMobile})<br />
                            <strong>Allegation:</strong> {match.existingComplaint.incidentDetails}
                          </p>
                          <div className="flex items-center justify-between pt-1 border-t border-red-200/60">
                            <span className="text-[10px] text-slate-500">
                              Status: <strong>{match.existingComplaint.status}</strong> • EO:{" "}
                              {match.existingComplaint.assignedEoName || "Unassigned"}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setLinkedComplaintNo(match.existingComplaint.complaintNumber);
                                setIsCrossCaseTagged(true);
                                setShowIntelModal(false);
                              }}
                              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[11px] font-bold transition-colors"
                            >
                              Tag as Cross-Case
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-xs text-center">
                      No cross-complaints filed by the opposite party detected in police station archives.
                    </div>
                  )}
                </div>
              )}

              {/* REPEAT COMPLAINANT HISTORY */}
              {(activeIntelTab === "repeat" || activeIntelTab === "all") && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                      <RotateCcw className="w-4 h-4 text-amber-600" />
                      <span>Complainant Previous Registry Records</span>
                    </h4>
                  </div>

                  {intelResult && intelResult.repeatHistory.totalPreviousComplaints > 0 ? (
                    <div className="space-y-2">
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                        <p className="font-bold text-amber-900">
                          {intelResult.repeatHistory.riskLevel === "FREQUENT_COMPLAINANT"
                            ? "⚠️ Frequent Complainant Alert (3+ complaints on record)"
                            : "Prior Complaints Recorded"}
                        </p>
                        <p className="text-[11px] text-amber-800">
                          Total past complaints registered:{" "}
                          <strong>{intelResult.repeatHistory.totalPreviousComplaints}</strong>
                        </p>
                      </div>

                      {intelResult.repeatHistory.complaints?.map((c: ComplaintItem) => (
                        <div
                          key={c.id}
                          className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-slate-900">{c.complaintNumber}</span>
                            <span className="text-[10px] text-slate-500">{c.status}</span>
                          </div>
                          <p className="text-[11px] text-slate-600 line-clamp-2">{c.incidentDetails}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-xs text-center">
                      First-time complainant. No prior complaint records found for this citizen mobile or name.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                PPR Rule 22.48 / Automated Central Intelligence Dossier
              </span>
              <Button size="sm" variant="outline" onClick={() => setShowIntelModal(false)} className="text-xs">
                Close Dossier
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* INSTANT DOCUMENT & MEDIA PREVIEW MODAL (BINA DOWNLOAD KRE) */}
      {previewModalFile && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in-50"
          onClick={() => setPreviewModalFile(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-3.5 bg-[#0b192c] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-600/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Eye className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-white truncate max-w-md">
                    {previewModalFile.name}
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] text-slate-300">
                    <span className="uppercase font-semibold px-1.5 py-0.2 rounded bg-slate-800 text-amber-300">
                      {previewModalFile.category}
                    </span>
                    <span>• Instant Preview (No Download Required)</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {previewModalFile.dataUrl && (
                  <a
                    href={previewModalFile.dataUrl}
                    download={previewModalFile.name}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                    title="Download file"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewModalFile(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-3 sm:p-5 overflow-y-auto max-h-[80vh] flex flex-col items-center justify-center bg-slate-100 min-h-[420px]">
              {/* 1. Missing or Empty dataUrl Fallback */}
              {!previewModalFile.dataUrl ? (
                <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-md border border-slate-200 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                    <FileText className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-slate-900">{previewModalFile.name}</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      This document is sealed in the station evidence docket. Direct inline data stream is preserved in complaint attachments.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg text-[11px] text-slate-600 border border-slate-200">
                    Category: <span className="font-bold uppercase text-slate-800">{previewModalFile.category}</span>
                  </div>
                </div>
              ) : previewModalFile.category === "image" ||
                previewModalFile.name.toLowerCase().match(/\.(jpe?g|png|webp|gif|bmp|svg)$/) ||
                previewModalFile.dataUrl.startsWith("data:image/") ? (
                /* 2. Image Evidence Preview */
                <div className="w-full flex flex-col items-center justify-center gap-3">
                  <img
                    src={previewModalFile.dataUrl}
                    alt={previewModalFile.name}
                    className="max-h-[72vh] w-auto max-w-full rounded-xl object-contain shadow-md bg-white border border-slate-200"
                  />
                  <div className="flex items-center gap-2">
                    <a
                      href={previewModalFile.dataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Open Full Size</span>
                    </a>
                  </div>
                </div>
              ) : previewModalFile.category === "video" ||
                previewModalFile.name.toLowerCase().match(/\.(mp4|mov|avi|mkv|webm|3gp)$/) ||
                previewModalFile.dataUrl.startsWith("data:video/") ? (
                /* 3. Video Evidence Preview */
                <div className="w-full flex items-center justify-center">
                  <video
                    controls
                    autoPlay
                    src={previewModalFile.dataUrl}
                    className="max-h-[72vh] w-full rounded-xl bg-black shadow-md"
                  />
                </div>
              ) : previewModalFile.category === "audio" ||
                previewModalFile.name.toLowerCase().match(/\.(mp3|wav|m4a|ogg|aac|flac|wma)$/) ||
                previewModalFile.dataUrl.startsWith("data:audio/") ? (
                /* 4. Audio Evidence Preview */
                <div className="w-full max-w-lg p-6 bg-white rounded-2xl shadow-md border border-slate-200 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                    <Music className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">{previewModalFile.name}</h4>
                    <p className="text-xs text-slate-500">Audio Statement / Call Recording</p>
                  </div>
                  <audio controls autoPlay src={previewModalFile.dataUrl} className="w-full pt-2" />
                </div>
              ) : previewModalFile.name.toLowerCase().endsWith(".pdf") ||
                previewModalFile.dataUrl.startsWith("data:application/pdf") ? (
                /* 5. PDF Document Preview (Native Blob URL Object + Embed + Direct Tab Action) */
                <div className="w-full h-[76vh] bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col">
                  <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs text-slate-700">
                    <span className="font-bold truncate">PDF Document Viewer • {previewModalFile.name}</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={previewBlobUrl || previewModalFile.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open in New Tab</span>
                      </a>
                    </div>
                  </div>
                  <div className="w-full h-full relative bg-slate-100 flex items-center justify-center">
                    <iframe
                      src={previewBlobUrl || previewModalFile.dataUrl}
                      title={previewModalFile.name}
                      className="w-full h-full border-0 rounded-b-xl"
                    />
                  </div>
                </div>
              ) : previewModalFile.dataUrl.startsWith("data:text/") ? (
                /* 6. Text Document Preview */
                <div className="w-full h-[74vh] bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col">
                  <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 truncate">Text Document Content</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                      Plain Text
                    </span>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1 font-mono text-xs whitespace-pre-wrap text-slate-800 bg-white">
                    {(() => {
                      try {
                        const base64Index = previewModalFile.dataUrl.indexOf(";base64,");
                        if (base64Index !== -1) {
                          const base64 = previewModalFile.dataUrl.slice(base64Index + 8);
                          return decodeURIComponent(escape(atob(base64)));
                        }
                        return previewModalFile.dataUrl;
                      } catch {
                        return "Unable to decode text stream directly.";
                      }
                    })()}
                  </div>
                </div>
              ) : (
                /* 7. Office / Word / Excel / Generic Document Preview Dossier Card */
                <div className="w-full max-w-lg p-6 sm:p-8 bg-white rounded-2xl shadow-md border border-slate-200 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center mx-auto shadow-xs">
                    <FileText className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-slate-900">{previewModalFile.name}</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Official document uploaded and sealed into the complaint evidence dossier.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl text-left text-xs space-y-1.5 border border-slate-200">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">File Type:</span>
                      <span className="font-bold uppercase text-slate-800">
                        {previewModalFile.name.split(".").pop() || "Document"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Evidence Status:</span>
                      <span className="font-bold text-emerald-700">Sealed in Station Docket</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2.5 pt-2">
                    <a
                      href={previewModalFile.dataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Open in Browser</span>
                    </a>
                    <a
                      href={previewModalFile.dataUrl}
                      download={previewModalFile.name}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download File</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-2.5 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>Instant Docket Evidence Viewer • Haryana Police CMS</span>
              <button
                type="button"
                onClick={() => setPreviewModalFile(null)}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complaint Pre-Registration Verification & Auto-Preview Modal */}
      <ComplaintVerificationModal
        isOpen={showVerificationModal}
        previewData={previewVerificationData}
        isSubmitting={isSubmitting}
        onEdit={() => setShowVerificationModal(false)}
        onSubmit={handleFinalSubmit}
        readOnlyPreview={isReadOnlyPreview}
      />
    </div>
  );
}
