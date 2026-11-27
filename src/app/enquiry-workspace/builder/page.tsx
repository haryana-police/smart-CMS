"use client";
import { useUnsavedDocument } from "@/hooks/useUnsavedDocument";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { registerOperatorAdapter, type OperatorReceipt } from "@/services/agent/operatorAdapters";
import { useSearchParams } from "next/navigation";
import { useGuardedRouter as useRouter } from "@/hooks/useGuardedRouter";
import {
  FileText,
  FileCheck2,
  ScrollText,
  Save,
  Plus,
  Trash2,
  Copy,
  Edit3,
  Search,
  Printer,
  Download,
  ArrowLeft,
  Check,
  X,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Table as TableIcon,
  Image as ImageIcon,
  CheckSquare,
  Sparkles,
  Calendar,
  Clock,
  Minus,
  RotateCcw,
  RotateCw,
  FolderPlus,
  Bookmark,
  Share2,
  Shield,
  User,
  Sliders,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  HelpCircle,
  FileType,
} from "lucide-react";
import { HindiSuggestionChip, VerbatimSelectionButton } from "@/components/editor/VerbatimSelectionButton";
import { useHindiReportAutocorrect } from "@/hooks/useHindiAutocorrect";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/utils";
import { printA4Element } from "@/utils/printElement";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Button } from "@/components/ui/button";
import { ComplaintService } from "@/services/complaintService";
import { ComplaintItem } from "@/types";
import { EnquiryWorkspaceNav } from "@/components/enquiry-workspace/EnquiryWorkspaceNav";
import { ComplaintAnalysisHeader } from "@/components/enquiry-workspace/ComplaintAnalysisHeader";
import { IdentifiedPerson, ComplaintAnalysisReport } from "@/services/complaintDocumentAnalysisService";
import { VoiceInputButton } from "@/components/ui/voice-input-button";
import {
  BuilderService,
  BuilderTemplateItem,
  BuilderDraftItem,
  CMS_DYNAMIC_FIELDS,
  resolveDynamicPlaceholders,
} from "@/services/builderService";

export interface StandardReportTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const STANDARD_REPORT_TEMPLATES: StandardReportTemplate[] = [
  {
    id: "std_general_enquiry",
    name: "General Police Enquiry Report (प्राथमिक जांच आख्या)",
    description: "Comprehensive police enquiry report with facts, complainant statements, opposite party examination, and recommendations.",
    content: `<div style="text-align: center; font-weight: bold; font-size: 14pt; margin-bottom: 4px;">POLICE DEPARTMENT, HARYANA</div>
<div style="text-align: center; font-weight: bold; font-size: 12pt; margin-bottom: 16px;">{{POLICE_STATION}}, DISTRICT {{DISTRICT}}</div>
<div style="border-bottom: 2px solid #000; margin-bottom: 16px;"></div>
<div style="text-align: center; font-weight: bold; font-size: 13pt; text-decoration: underline; margin-bottom: 16px;">
  PRELIMINARY POLICE ENQUIRY REPORT (प्राथमिक जांच आख्या)
</div>
<p><strong>Complaint / Case Reference:</strong> {{CASE_NUMBER}} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Date:</strong> {{DATE}}</p>
<p><strong>Subject / Allegation:</strong> Preliminary enquiry into complaint lodged regarding dispute between parties.</p>
<br/>
<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1.5px solid #000;">
  <tr style="background-color: #f1f5f9;">
    <th style="border: 1px solid #000; padding: 6px 10px; width: 28%; text-align: left;">Particulars</th>
    <th style="border: 1px solid #000; padding: 6px 10px; text-align: left;">Details on Record</th>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">Complainant Details:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">{{COMPLAINANT_NAME}}, Mob: {{COMPLAINANT_MOBILE}}, r/o {{COMPLAINANT_ADDRESS}}</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">Opposite Party / Accused:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">{{ACCUSED_NAME}}, r/o {{ACCUSED_ADDRESS}}</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">Selected Person for Report:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">{{PERSON_NAME}} (Role: {{PERSON_ROLE}}), Contact: {{PERSON_MOBILE}}, r/o {{PERSON_ADDRESS}}</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">Date & Spot of Occurrence:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">{{INCIDENT_DATE}} at {{INCIDENT_PLACE}}</td>
  </tr>
</table>
<h3 style="font-size: 11pt; font-weight: bold; margin-top: 12px;">1. Gist of Allegations:</h3>
<p>An enquiry was marked into complaint number {{CASE_NUMBER}} wherein allegations were leveled by the complainant party. [Enter proceedings actually undertaken.]</p>
<h3 style="font-size: 11pt; font-weight: bold; margin-top: 12px;">2. Enquiry Proceedings & Examination:</h3>
<p>[Enter persons actually examined, dates, and documents verified, with references.]</p>
<h3 style="font-size: 11pt; font-weight: bold; margin-top: 12px;">3. Findings & Recommendation:</h3>
<p>[Enter verified findings, supporting evidence and recommendation.]</p>
<br/><br/>
<div style="text-align: right;">
  <p><strong>({{OFFICER_NAME}})</strong><br/>{{OFFICER_RANK}}<br/>{{POLICE_STATION}}, {{DISTRICT}}<br/>Belt/PNO: {{OFFICER_BELT_NUMBER}}</p>
</div>`,
  },
  {
    id: "std_spot_inspection",
    name: "Spot Inspection & Verification Memo (मौका मुआयना फर्द)",
    description: "Inspection proforma for spot verification, local witness statements, and physical observations.",
    content: `<div style="text-align: center; font-weight: bold; font-size: 14pt; margin-bottom: 4px;">POLICE DEPARTMENT, HARYANA</div>
<div style="text-align: center; font-weight: bold; font-size: 12pt; margin-bottom: 16px;">{{POLICE_STATION}}, DISTRICT {{DISTRICT}}</div>
<div style="border-bottom: 2px solid #000; margin-bottom: 16px;"></div>
<div style="text-align: center; font-weight: bold; font-size: 13pt; text-decoration: underline; margin-bottom: 16px;">
  MEMO OF SPOT INSPECTION &amp; VERIFICATION (मौका मुआयना व तस्दीक फर्द)
</div>
<p><strong>Case Reference:</strong> {{CASE_NUMBER}} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Date:</strong> {{DATE}} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Time:</strong> {{TIME}}</p>
<p><strong>Inspected Location:</strong> {{INCIDENT_PLACE}}</p>
<p><strong>Subject Person Examined on Spot:</strong> {{PERSON_NAME}} (Role: {{PERSON_ROLE}}, Mobile: {{PERSON_MOBILE}}, Address: {{PERSON_ADDRESS}})</p>
<br/>
<p>[Enter actual inspection date, location, attending officers and case reference.]</p>
<h3 style="font-size: 11pt; font-weight: bold; margin-top: 12px;">Observations at Spot:</h3>
<p>1. [Record actual spot observations and persons present.]</p>
<p>2. [Record witnesses examined and statement references.]</p>
<p>3. [Record findings supported by the inspection.]</p>
<br/><br/>
<table style="width: 100%; border: none;">
  <tr>
    <td style="width: 50%; vertical-align: top;">
      <p><strong>Witness on Spot:</strong><br/>Name: {{PERSON_NAME}}<br/>Role: {{PERSON_ROLE}}<br/>Signature: _________________</p>
    </td>
    <td style="width: 50%; vertical-align: top; text-align: right;">
      <p><strong>({{OFFICER_NAME}})</strong><br/>{{OFFICER_RANK}}<br/>{{POLICE_STATION}}, {{DISTRICT}}</p>
    </td>
  </tr>
</table>`,
  },
  {
    id: "std_witness_statement",
    name: "Statement of Witness / Citizen (बयान साक्षी u/s 180 BNSS)",
    description: "Formal recorded examination of complainant, witness, or opposite party.",
    content: `<div style="text-align: center; font-weight: bold; font-size: 14pt; margin-bottom: 4px;">POLICE DEPARTMENT, HARYANA</div>
<div style="text-align: center; font-weight: bold; font-size: 12pt; margin-bottom: 16px;">{{POLICE_STATION}}, DISTRICT {{DISTRICT}}</div>
<div style="border-bottom: 2px solid #000; margin-bottom: 16px;"></div>
<div style="text-align: center; font-weight: bold; font-size: 13pt; text-decoration: underline; margin-bottom: 16px;">
  STATEMENT RECORDED UNDER SECTION 180 BNSS, 2023 (बयान साक्षी / नागरिक कथन)
</div>
<p><strong>Complaint Docket:</strong> {{CASE_NUMBER}} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Date:</strong> {{DATE}} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Place:</strong> {{POLICE_STATION}}</p>
<br/>
<div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
  <p><strong>Statement of:</strong> {{PERSON_NAME}}</p>
  <p><strong>Father / Husband:</strong> {{PERSON_FATHER}}</p>
  <p><strong>Role in Complaint:</strong> {{PERSON_ROLE}}</p>
  <p><strong>Mobile Number:</strong> {{PERSON_MOBILE}}</p>
  <p><strong>Residential Address:</strong> {{PERSON_ADDRESS}}</p>
</div>
<p>I, <strong>{{PERSON_NAME}}</strong>, state on solemn affirmation that regarding the complaint lodged by {{COMPLAINANT_NAME}} against {{ACCUSED_NAME}}, I state the true facts as known to me:</p>
<p style="min-height: 80px; padding: 8px; border: 1px dashed #94a3b8; background: #fff; margin: 12px 0;">
  [यहाँ व्यक्ति का विस्तृत कथन / बयान दर्ज करें... Record statement verbatim without alteration...]
</p>
<p>The above statement has been read over and explained to me in Hindi, which I admit as correct and true to my knowledge.</p>
<br/><br/>
<table style="width: 100%; border: none;">
  <tr>
    <td style="width: 50%; vertical-align: top;">
      <p><strong>Signature / Thumb Impression:</strong><br/>({{PERSON_NAME}})<br/>Role: {{PERSON_ROLE}}</p>
    </td>
    <td style="width: 50%; vertical-align: top; text-align: right;">
      <p><strong>Recorded By:</strong><br/>({{OFFICER_NAME}})<br/>{{OFFICER_RANK}}<br/>{{POLICE_STATION}}</p>
    </td>
  </tr>
</table>`,
  },
  {
    id: "std_closure_report",
    name: "Final Enquiry & Disposal Report (अंतिम निस्तारण रिपोर्ट)",
    description: "Final enquiry findings for supervisory approval or filing in record.",
    content: `<div style="text-align: center; font-weight: bold; font-size: 14pt; margin-bottom: 4px;">POLICE DEPARTMENT, HARYANA</div>
<div style="text-align: center; font-weight: bold; font-size: 12pt; margin-bottom: 16px;">{{POLICE_STATION}}, DISTRICT {{DISTRICT}}</div>
<div style="border-bottom: 2px solid #000; margin-bottom: 16px;"></div>
<div style="text-align: center; font-weight: bold; font-size: 13pt; text-decoration: underline; margin-bottom: 16px;">
  FINAL ENQUIRY DISPOSAL REPORT (अंतिम निस्तारण जांच रिपोर्ट)
</div>
<p><strong>Complaint Number:</strong> {{CASE_NUMBER}} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Date:</strong> {{DATE}}</p>
<p><strong>Complainant:</strong> {{COMPLAINANT_NAME}} (Mob: {{COMPLAINANT_MOBILE}}, Address: {{COMPLAINANT_ADDRESS}})</p>
<p><strong>Opposite Party:</strong> {{ACCUSED_NAME}} (Address: {{ACCUSED_ADDRESS}})</p>
<p><strong>Examined Person / Witness:</strong> {{PERSON_NAME}} (Role: {{PERSON_ROLE}})</p>
<br/>
<h3 style="font-size: 11pt; font-weight: bold;">Brief Background:</h3>
<p>Complaint {{CASE_NUMBER}} was received regarding matter occurring on {{INCIDENT_DATE}} at {{INCIDENT_PLACE}}. [Record parties who actually joined and documents produced.]</p>
<h3 style="font-size: 11pt; font-weight: bold; margin-top: 12px;">Enquiry Outcome & Conclusions:</h3>
<p>[Enter verified findings, statements actually recorded, and supporting evidence.]</p>
<h3 style="font-size: 11pt; font-weight: bold; margin-top: 12px;">Recommended Action:</h3>
<p>[Enter the reasoned recommendation for complaint {{CASE_NUMBER}} based on verified findings.]</p>
<br/><br/>
<div style="text-align: right;">
  <p><strong>({{OFFICER_NAME}})</strong><br/>{{OFFICER_RANK}}<br/>{{POLICE_STATION}}, {{DISTRICT}}<br/>PNO: {{OFFICER_BELT_NUMBER}}</p>
</div>`,
  },
];

function TemplateDraftBuilderContent() {
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const templateIdParam = searchParams.get("templateId");
  const draftIdParam = searchParams.get("draftId");
  const complaintIdParam = searchParams.get("complaintId");

  // Navigation Tabs: 'editor' | 'templates' | 'drafts'
  const [activeTab, setActiveTab] = useState<"editor" | "templates" | "drafts">("editor");

  // Document Editor State
  const [docName, setDocName] = useState<string>("Untitled Document");
  const [docDescription, setDocDescription] = useState<string>("");
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<Array<{ name: string; token: string }>>([]);

  // Complaint Linking
  const [complaint, setComplaint] = useState<ComplaintItem | null>(null);
  const [availableComplaints, setAvailableComplaints] = useState<ComplaintItem[]>([]);
  const [selectComplaintModalOpen, setSelectComplaintModalOpen] = useState(false);

  // Person & Standard Report Template selection
  const [selectedPerson, setSelectedPerson] = useState<IdentifiedPerson | null>(null);
  const [selectedReportTemplateId, setSelectedReportTemplateId] = useState<string>("std_general_enquiry");
  const [activeTemplateRawContent, setActiveTemplateRawContent] = useState<string>(STANDARD_REPORT_TEMPLATES[0].content);
  const [savingToComplaint, setSavingToComplaint] = useState(false);
  const [saveToComplaintSuccess, setSaveToComplaintSuccess] = useState(false);

  // Handle Complaint selection from ComplaintAnalysisHeader
  const handleComplaintSelected = (comp: ComplaintItem | null, report: ComplaintAnalysisReport | null) => {
    if (!comp) {
      setComplaint(null);
      setSelectedPerson(null);
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setCurrentDraftId(null);
    setEditingDefinition(false);
    setSaveStatus("Unsaved changes");
    setComplaint(comp);
    setSaveModalCaseId(comp.id);

    const tmplContent = activeTemplateRawContent || STANDARD_REPORT_TEMPLATES[0].content;
    setSelectedPerson(null);
    const resolved = resolveDynamicPlaceholders(tmplContent, comp);
    if (editorRef.current) {
      editorRef.current.innerHTML = resolved;
    }
    const currentTmplObj = STANDARD_REPORT_TEMPLATES.find((s) => s.id === selectedReportTemplateId) || templatesList.find((t) => t.id === selectedReportTemplateId);
    setDocName(`${currentTmplObj?.name || "Enquiry Report"} - ${comp.complaintNumber}`);
  };

  // Handle Person selection from ComplaintAnalysisHeader
  const handlePersonSelected = (person: IdentifiedPerson | null) => {
    setSelectedPerson(person);
    if (!complaint) return;

    if (editingDefinition) return;
    const tmplContent = activeTemplateRawContent || STANDARD_REPORT_TEMPLATES[0].content;
    const resolved = resolveDynamicPlaceholders(tmplContent, complaint, undefined, person);
    if (editorRef.current) {
      editorRef.current.innerHTML = resolved;
    }
  };

  // Switch available report template
  const handleSelectReportTemplate = (tmplId: string) => {
    let chosenContent = "";
    let chosenName = "Enquiry Report";

    const std = STANDARD_REPORT_TEMPLATES.find((s) => s.id === tmplId);
    if (std) {
      chosenContent = std.content;
      chosenName = std.name;
    } else {
      const dbTmpl = templatesList.find((t) => t.id === tmplId);
      if (dbTmpl) {
        chosenContent = dbTmpl.content;
        chosenName = dbTmpl.name;
      }
    }

    if (chosenContent) {
      if (hasUnsavedChanges && !confirm("Discard unsaved changes and load another template?")) return;
      setSelectedReportTemplateId(tmplId);
      setEditingDefinition(false);
      setCurrentTemplateId(std ? null : tmplId);
      setCurrentDraftId(null);
      setActiveTemplateRawContent(chosenContent);
      setDocName(`${chosenName}${complaint ? ` - ${complaint.complaintNumber}` : ""}`);
      const resolved = resolveDynamicPlaceholders(chosenContent, complaint, undefined, selectedPerson);
      if (editorRef.current) {
        editorRef.current.innerHTML = resolved;
      }
      setHasUnsavedChanges(false);
    }
  };

  // Save directly to Complaint Documents Docket
  const handleSaveReportToComplaintDocket = async () => {
    if (!validateCaseDocument()) return;
    if (!complaint) {
      alert("Please select a complaint first.");
      return;
    }
    if (!editorRef.current) return;

    setSavingToComplaint(true);
    try {
      const contentHtml = editorRef.current.innerHTML;
      const fileName = `${docName || "Enquiry_Report"}.html`;

      await ComplaintService.addDocument(complaint.id, {
        fileName,
        fileCategory: "REPORT",
        fileSize: `${Math.round(contentHtml.length / 1024) || 2} KB`,
        dataUrl: `data:text/html;charset=utf-8,${encodeURIComponent(contentHtml)}`,
        contentHtml,
        uploadedBy: currentUser.name || "Enquiry Officer",
      });

      setSaveToComplaintSuccess(true);
      setTimeout(() => setSaveToComplaintSuccess(false), 5000);
    } catch (err: any) {
      console.error("Failed to save report to complaint:", err);
      alert(`Error saving report to complaint docket: ${err.message || "Please try again."}`);
    } finally {
      setSavingToComplaint(false);
    }
  };

  // Auto-save & Status
  const [saveStatus, setSaveStatus] = useState<"Saved" | "Saving..." | "Unsaved changes">("Unsaved changes");
  const [lastSavedAt, setLastSavedAt] = useState<string>("");
  const [libraryError,setLibraryError]=useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  useUnsavedDocument(hasUnsavedChanges);

  // Modals
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveMode, setSaveMode] = useState<"TEMPLATE" | "DRAFT">("TEMPLATE");
  const [saveModalName, setSaveModalName] = useState("");
  const [saveModalDesc, setSaveModalDesc] = useState("");
  const [saveModalCaseId, setSaveModalCaseId] = useState<string>("");
  const [customFieldModalOpen, setCustomFieldModalOpen] = useState(false);
  const [newCustomFieldName, setNewCustomFieldName] = useState("");
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  useEscapeKey(selectComplaintModalOpen, () => setSelectComplaintModalOpen(false));
  useEscapeKey(saveModalOpen, () => setSaveModalOpen(false));
  useEscapeKey(customFieldModalOpen, () => setCustomFieldModalOpen(false));
  useEscapeKey(tableModalOpen, () => setTableModalOpen(false));

  // Template / Draft Management state
  const [templatesList, setTemplatesList] = useState<BuilderTemplateItem[]>([]);
  const [draftsList, setDraftsList] = useState<BuilderDraftItem[]>([]);
  const [managementLoading, setManagementLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "updatedAt">("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Editor reference
  const editorRef = useRef<HTMLDivElement>(null);
  const operatorReceiptRef = useRef<OperatorReceipt | undefined>(undefined);
  useEffect(() => registerOperatorAdapter({
    id: '/enquiry-workspace/builder', matches: path => path.split('?')[0] === '/enquiry-workspace/builder', receipt: () => operatorReceiptRef.current,
  }), []);
  const [editingDefinition, setEditingDefinition] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Formatting state trackers
  const [currentFont, setCurrentFont] = useState("Nirmala UI, sans-serif");
  const [currentSize, setCurrentSize] = useState("11pt");
  const [textColor, setTextColor] = useState("#000000");
  const [highlightColor, setHighlightColor] = useState("#ffffff");

  // 1. Initial Load of complaints for case linking
  useEffect(() => {
    async function initComplaints() {
      try {
        const all = await ComplaintService.getComplaints();
        setAvailableComplaints(all || []);

        if (complaintIdParam) {
          const found = (all || []).find((c) => c.id === complaintIdParam);
          if (found) {
            setComplaint(found);
            setSaveModalCaseId(found.id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch complaints:", err);
      }
    }
    initComplaints();
  }, [complaintIdParam]);

  // 2. Fetch Templates & Drafts list
  const fetchTemplatesAndDrafts = useCallback(async () => {
    setManagementLoading(true);
    setLibraryError("");
    try {
      const [tList, dList] = await Promise.all([
        BuilderService.getTemplates({ search: searchQuery, sortBy, sortOrder }),
        BuilderService.getDrafts({ search: searchQuery, sortBy, sortOrder }),
      ]);
      setTemplatesList(tList);
      setDraftsList(dList);
    } catch (err) {
      console.error("Failed to load templates/drafts list:", err);
      setLibraryError("Templates/drafts could not be loaded. Retry when the connection is restored.");
    } finally {
      setManagementLoading(false);
    }
  }, [searchQuery, sortBy, sortOrder]);

  useEffect(() => {
    fetchTemplatesAndDrafts();
  }, [fetchTemplatesAndDrafts]);

  // 3. Load specific template or draft if URL parameters are passed
  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      if (templateIdParam) {
        try {
          const t = await BuilderService.getTemplateById(templateIdParam);
          if (cancelled || !t || !editorRef.current) return;
          setCurrentTemplateId(t.id);
          setDocName(t.name);
          setDocDescription(t.description || "");

          setActiveTemplateRawContent(t.content);
          let templateHtml = t.content;
          let activeCase = complaint;
          if (!activeCase && complaintIdParam) {
            const foundCase = await ComplaintService.getComplaintById(complaintIdParam);
            if (cancelled) return;
            if (foundCase) {
              activeCase = foundCase;
              setComplaint(foundCase);
            }
          }
          if (activeCase) {
            templateHtml = resolveDynamicPlaceholders(templateHtml, activeCase);
          }
          if (cancelled || !editorRef.current) return;
          editorRef.current.innerHTML = templateHtml;

          if (t.customFields) {
            try {
              setCustomFields(JSON.parse(t.customFields));
            } catch {}
          }
          setActiveTab("editor");
        } catch (e) {
          console.error("Error loading template:", e);
        }
      } else if (draftIdParam) {
        try {
          const d = await BuilderService.getDraftById(draftIdParam);
          if (cancelled || !d || !editorRef.current) return;
          setCurrentDraftId(d.id);
          setCurrentTemplateId(d.templateId || null);
          setDocName(d.name);
          setDocDescription(d.description || "");
          editorRef.current.innerHTML = d.content;
          if (d.caseId) {
            setSaveModalCaseId(d.caseId);
            const comp = await ComplaintService.getComplaintById(d.caseId);
            if (!cancelled && comp) setComplaint(comp);
          }
          if (!cancelled && d.customFields) {
            try {
              setCustomFields(JSON.parse(d.customFields));
            } catch {}
          }
          if (!cancelled) setActiveTab("editor");
        } catch (e) {
          console.error("Error loading draft:", e);
        }
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [templateIdParam, draftIdParam, complaintIdParam]);

  // 4. Auto-save trigger
  const witnessStatement = STANDARD_REPORT_TEMPLATES.find((template) => template.id === "std_witness_statement");
  const hindiAutocorrect = useHindiReportAutocorrect(
    editingDefinition || activeTemplateRawContent === witnessStatement?.content ||
    /verbatim|witness statement|बयान साक्षी/i.test(docName),
  );

  const handleContentChange = () => {
    setHasUnsavedChanges(true);
    setSaveStatus("Unsaved changes");

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      if (!editorRef.current || !currentDraftId || editingDefinition) return;
      setSaveStatus("Saving...");
      try {
        const content = editorRef.current.innerHTML;
        if (currentDraftId) {
          await BuilderService.updateDraft(currentDraftId, {
            content,
            name: docName,
            description: docDescription,
            customFields: JSON.stringify(customFields),
          });
        }
        setSaveStatus("Saved");
        setLastSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
        setHasUnsavedChanges(false);
      } catch (err) {
        console.warn("Auto-save skipped/pending save modal:", err);
        setSaveStatus("Unsaved changes");
      }
    }, 4000);
  };

  useEffect(() => () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
  }, []);

  // 5. Unsaved changes protection on page navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ================= TEXT FORMATTING COMMANDS =================
  const execCmd = (cmd: string, val: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(cmd, false, val);
    handleContentChange();
  };

  const handleFontChange = (font: string) => {
    setCurrentFont(font);
    execCmd("fontName", font);
  };

  const handleFontSizeChange = (size: string) => {
    setCurrentSize(size);
    // Wrap selection in span with custom font size
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const span = document.createElement("span");
    span.style.fontSize = size;
    try {
      range.surroundContents(span);
    } catch {
      execCmd("fontSize", "3");
    }
    handleContentChange();
  };

  const handleTextColor = (color: string) => {
    setTextColor(color);
    execCmd("foreColor", color);
  };

  const handleHighlightColor = (color: string) => {
    setHighlightColor(color);
    execCmd("hiliteColor", color);
  };

  // ================= DOCUMENT ELEMENT INSERTERS =================
  const insertHeading = (level: "h1" | "h2" | "h3" | "p") => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    execCmd("formatBlock", `<${level}>`);
  };

  const insertHorizontalLine = () => {
    execCmd("insertHorizontalRule");
  };

  const insertDate = () => {
    const today = formatDate(new Date());
    execCmd("insertText", today);
  };

  const insertTime = () => {
    const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    execCmd("insertText", time);
  };

  const insertPageBreak = () => {
    const pbHtml = `<div class="page-break my-6 py-2 border-b-2 border-dashed border-slate-300 text-center text-[10px] text-slate-400 font-mono select-none" contenteditable="false">--- [PAGE BREAK / प्रिंट पृष्ठ विभाजन] ---</div><p><br/></p>`;
    execCmd("insertHTML", pbHtml);
  };

  const insertCheckbox = () => {
    const cbHtml = `<span contenteditable="false" class="inline-block mr-1.5"><input type="checkbox" class="w-3.5 h-3.5 align-middle cursor-pointer" /></span>&nbsp;`;
    execCmd("insertHTML", cbHtml);
  };

  const insertSignatureArea = () => {
    const sigHtml = `
      <div class="sig-block my-6 pt-4 text-xs select-none" contenteditable="false">
        <table style="width: 100%; border: none;">
          <tr>
            <td style="width: 50%; vertical-align: top; padding: 4px;"></td>
            <td style="width: 50%; vertical-align: top; text-align: left; padding: 4px; padding-left: 40px;">
              <b>हस्ताक्षर अनुसंधान अधिकारी / IO Signature</b><br/>
              नाम / Name: ...........................................<br/>
              रैंक / Rank: ............................................<br/>
              PNO / Belt No: ....................................<br/>
              थाना / Police Station: ............................<br/>
              दिनांक / Date: .......................................
            </td>
          </tr>
        </table>
      </div>
      <p><br/></p>
    `;
    execCmd("insertHTML", sigHtml);
  };

  const insertImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        const dataUrl = re.target?.result as string;
        if (dataUrl) {
          const imgHtml = `<div class="my-3 text-center"><img src="${dataUrl}" alt="Inserted Asset" style="max-width: 90%; max-height: 400px; border: 1px solid #cbd5e1; border-radius: 4px; display: inline-block;" /></div><p><br/></p>`;
          execCmd("insertHTML", imgHtml);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const insertTable = () => {
    let html = `<table style="width: 100%; border-collapse: collapse; margin: 12px 0; border: 1.5px solid #000; font-size: 10pt;">`;
    html += `<thead><tr style="background-color: #f8fafc; border-bottom: 1.5px solid #000;">`;
    for (let c = 1; c <= tableCols; c++) {
      html += `<th style="border: 1px solid #000; padding: 6px 8px; text-align: center; font-weight: bold;">शीर्षक ${c}</th>`;
    }
    html += `</tr></thead><tbody>`;
    for (let r = 1; r <= tableRows; r++) {
      html += `<tr>`;
      for (let c = 1; c <= tableCols; c++) {
        html += `<td style="border: 1px solid #000; padding: 6px 8px; vertical-align: top;">विवरण ${r}.${c}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table><p><br/></p>`;
    execCmd("insertHTML", html);
    setTableModalOpen(false);
  };

  // Table Structure Editing Handlers
  const addTableRow = () => {
    if (!editorRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode;
    const row = node instanceof Element ? node.closest("tr") : node?.parentElement?.closest("tr");
    if (row && row.parentElement) {
      const colCount = row.children.length;
      const newRow = document.createElement("tr");
      for (let i = 0; i < colCount; i++) {
        const td = document.createElement("td");
        td.style.border = "1px solid #000";
        td.style.padding = "6px 8px";
        td.innerHTML = "&nbsp;";
        newRow.appendChild(td);
      }
      row.after(newRow);
      handleContentChange();
    }
  };

  const deleteTableRow = () => {
    if (!editorRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode;
    const row = node instanceof Element ? node.closest("tr") : node?.parentElement?.closest("tr");
    if (row) {
      row.remove();
      handleContentChange();
    }
  };

  const addTableCol = () => {
    if (!editorRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode;
    const cell = node instanceof Element ? node.closest("td, th") : node?.parentElement?.closest("td, th");
    const table = node instanceof Element ? node.closest("table") : node?.parentElement?.closest("table");
    if (table && cell) {
      const cellIndex = (cell as HTMLTableCellElement).cellIndex;
      Array.from(table.rows).forEach((r) => {
        const isHeader = r.parentElement?.tagName.toLowerCase() === "thead";
        const newCell = document.createElement(isHeader ? "th" : "td");
        newCell.style.border = "1px solid #000";
        newCell.style.padding = "6px 8px";
        newCell.innerHTML = isHeader ? "स्तंभ" : "&nbsp;";
        if (cellIndex >= 0 && cellIndex < r.cells.length) {
          r.cells[cellIndex].after(newCell);
        } else {
          r.appendChild(newCell);
        }
      });
      handleContentChange();
    }
  };

  const deleteTableCol = () => {
    if (!editorRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode;
    const cell = node instanceof Element ? node.closest("td, th") : node?.parentElement?.closest("td, th");
    const table = node instanceof Element ? node.closest("table") : node?.parentElement?.closest("table");
    if (table && cell) {
      const cellIndex = (cell as HTMLTableCellElement).cellIndex;
      Array.from(table.rows).forEach((r) => {
        if (cellIndex >= 0 && cellIndex < r.cells.length) {
          r.deleteCell(cellIndex);
        }
      });
      handleContentChange();
    }
  };

  // ================= INSERT DYNAMIC PLACEHOLDER =================
  const insertPlaceholderToken = (token: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const tokenHtml = `<span class="cms-placeholder inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-blue-50 text-blue-900 border border-blue-300 select-all" data-placeholder="${token}">${token}</span>&nbsp;`;
    execCmd("insertHTML", tokenHtml);
  };

  const handleCreateCustomField = () => {
    if (!newCustomFieldName.trim()) return;
    const cleanKey = newCustomFieldName
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_");
    const token = `{{${cleanKey}}}`;
    const newField = { name: newCustomFieldName.trim(), token };
    setCustomFields((prev) => [...prev, newField]);
    insertPlaceholderToken(token);
    setNewCustomFieldName("");
    setCustomFieldModalOpen(false);
  };

  // ================= SAVE ACTIONS =================
  const openSaveModal = (mode: "TEMPLATE" | "DRAFT") => {
    setSaveMode(mode);
    setSaveModalName(docName === "Untitled Document" ? "" : docName);
    setSaveModalDesc(docDescription);
    setSaveModalOpen(true);
  };

  const handleSaveModalSubmit = async () => {
    if (!saveModalName.trim() || !editorRef.current) return;

    if (saveMode === "TEMPLATE" && !editingDefinition) { alert("Open Edit Template Definition before saving a reusable template. Use Save as Draft for case-specific edits."); return; }
    const content = editorRef.current.innerHTML;
    if (saveMode === "TEMPLATE") setActiveTemplateRawContent(content);
    const customFieldsJson = JSON.stringify(customFields);

    let savedRecordId = saveMode === "TEMPLATE" ? currentTemplateId : currentDraftId;
    try {
      if (saveMode === "TEMPLATE") {
        if (currentTemplateId) {
          // Update existing template
          await BuilderService.updateTemplate(currentTemplateId, {
            name: saveModalName.trim(),
            description: saveModalDesc.trim(),
            content,
            customFields: customFieldsJson,
          });
        } else {
          // Create new template
          const created = await BuilderService.createTemplate({
            name: saveModalName.trim(),
            description: saveModalDesc.trim(),
            content,
            customFields: customFieldsJson,
            createdBy: currentUser.id,
            createdByName: currentUser.name,
            createdByRank: currentUser.rankDisplay,
          });
          setCurrentTemplateId(created.id);
          savedRecordId = created.id;
        }
      } else {
        // DRAFT
        const chosenCase = availableComplaints.find((c) => c.id === saveModalCaseId);
        if (currentDraftId) {
          // Update draft
          await BuilderService.updateDraft(currentDraftId, {
            name: saveModalName.trim(),
            description: saveModalDesc.trim(),
            content,
            customFields: customFieldsJson,
            caseId: saveModalCaseId || undefined,
            complaintNumber: chosenCase?.complaintNumber || undefined,
          });
        } else {
          // Create new draft
          const created = await BuilderService.createDraft({
            name: saveModalName.trim(),
            description: saveModalDesc.trim(),
            content,
            customFields: customFieldsJson,
            caseId: saveModalCaseId || undefined,
            complaintNumber: chosenCase?.complaintNumber || undefined,
            templateId: currentTemplateId || undefined,
            createdBy: currentUser.id,
            createdByName: currentUser.name,
            createdByRank: currentUser.rankDisplay,
          });
          setCurrentDraftId(created.id);
          savedRecordId = created.id;
        }
      }

      if (savedRecordId) operatorReceiptRef.current = {id:savedRecordId,label:saveMode === "TEMPLATE" ? "Template saved" : "Draft saved",revision:(operatorReceiptRef.current?.revision || 0)+1};
      setDocName(saveModalName.trim());
      setDocDescription(saveModalDesc.trim());
      setSaveStatus("Saved");
      setLastSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
      setHasUnsavedChanges(false);
      setSaveModalOpen(false);

      // Refresh management lists so it immediately appears in My Templates & My Drafts
      await fetchTemplatesAndDrafts();
    } catch (err: any) {
      alert(`Save failed: ${err.message || "Please check inputs"}`);
    }
  };

  // ================= OPEN TEMPLATE OR DRAFT =================
  const handleOpenTemplate = (t: BuilderTemplateItem) => {
    if (hasUnsavedChanges && !confirm("You have unsaved changes. Continue opening another template?")) return;
    setEditingDefinition(false);
    setActiveTemplateRawContent(t.content);
    setCurrentTemplateId(t.id);
    setCurrentDraftId(null); // Fresh working document based on template
    setDocName(`${t.name} (Working Document)`);
    setDocDescription(t.description || "");

    // Populate with complaint data if available
    const populated = resolveDynamicPlaceholders(t.content, complaint);
    if (editorRef.current) {
      editorRef.current.innerHTML = populated;
    }
    if (t.customFields) {
      try {
        setCustomFields(JSON.parse(t.customFields));
      } catch {}
    }
    setActiveTab("editor");
    setHasUnsavedChanges(false);
  };

  const handleOpenDraft = (d: BuilderDraftItem) => {
    setEditingDefinition(false);
    if (hasUnsavedChanges && !confirm("You have unsaved changes. Continue opening another draft?")) return;
    setCurrentDraftId(d.id);
    setCurrentTemplateId(d.templateId || null);
    setDocName(d.name);
    setDocDescription(d.description || "");
    if (editorRef.current) {
      editorRef.current.innerHTML = d.content;
    }
    if (d.caseId) {
      const matchCase = availableComplaints.find((c) => c.id === d.caseId);
      if (matchCase) setComplaint(matchCase);
    }
    if (d.customFields) {
      try {
        setCustomFields(JSON.parse(d.customFields));
      } catch {}
    }
    setActiveTab("editor");
    setHasUnsavedChanges(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("templateId");
    params.set("draftId", d.id);
    if (d.caseId) params.set("complaintId", d.caseId);
    router.replace(`/enquiry-workspace/builder?${params.toString()}`, { scroll: false });
  };

  const handleCreateNewBlank = () => {
    if (hasUnsavedChanges && !confirm("You have unsaved changes. Discard and create blank document?")) return;
    setCurrentTemplateId(null);
    setCurrentDraftId(null);
    setEditingDefinition(true);
    setActiveTemplateRawContent("<p></p>");
    setDocName("Untitled Document");
    setDocDescription("");
    setCustomFields([]);
    if (editorRef.current) {
      editorRef.current.innerHTML = "<p>Start writing your document / report here...</p>";
    }
    setActiveTab("editor");
    setHasUnsavedChanges(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("draftId");
    params.delete("templateId");
    const qs = params.toString();
    router.replace(qs ? `/enquiry-workspace/builder?${qs}` : "/enquiry-workspace/builder", { scroll: false });
  };

  // ================= PRINT & EXPORT =================
  const validateCaseDocument = () => {
    const text = editorRef.current?.innerText || "";
    if (editingDefinition || /\{\{[^}]+\}\}|\[(?:Enter|Record|Quantity|यहाँ)/i.test(text)) {
      alert("Complete the case document and replace all template prompts before exporting or filing it.");
      return false;
    }
    return Boolean(text.trim());
  };

  const handlePrint = () => {
    if (!validateCaseDocument()) return;
    if (editorRef.current) {
      printA4Element(editorRef.current, docName || "Enquiry_Document");
    } else {
      window.print();
    }
  };

  const handleDownloadWord = () => {
    if (!validateCaseDocument()) return;
    if (!editorRef.current) return;
    const content = editorRef.current.innerHTML;
    const html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>${docName}</title>
      <style>
        body { font-family: 'Nirmala UI', Arial, sans-serif; font-size: 11pt; line-height: 1.5; padding: 20mm; }
        table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        td, th { border: 1px solid #000; padding: 6px 8px; }
      </style>
      </head>
      <body>${content}</body>
      </html>
    `;
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docName.replace(/\s+/g, "_")}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-in fade-in-50 pb-20">
      {libraryError && <p role="alert" className="p-3 text-sm text-red-700 bg-red-50">{libraryError}<button type="button" className="ml-3 underline" onClick={()=>void fetchTemplatesAndDrafts()}>Retry</button></p>}
      {/* ================= 1. FIELD ENQUIRY WORKSPACE SUB-NAVIGATION TABS ================= */}
      <EnquiryWorkspaceNav
        complaintId={complaint?.id}
        rightAction={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCreateNewBlank}
            className="text-xs font-bold border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Create Blank Document</span>
            <span className="sm:hidden">Blank</span>
          </Button>
        }
      />

      {/* 1. REQUIRED COMPLAINT & PERSON SELECTION ANALYSIS HEADER */}
      <ComplaintAnalysisHeader
        beforeSelectionChange={() => !hasUnsavedChanges || confirm("Discard unsaved document edits and change selection?")}
        initialComplaintId={draftIdParam || templateIdParam ? null : complaintIdParam}
        showPersonDropdown={true}
        onComplaintSelect={handleComplaintSelected}
        onPersonSelect={handlePersonSelected}
        selectedComplaintId={complaint?.id}
        selectedPersonId={selectedPerson?.id}
      />

      {/* ================= 2. PAGE HEADER & SECTION TABS (EDITOR / MY TEMPLATES / MY DRAFTS) ================= */}
      <div className="no-print bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-xs">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-[#0b192c] tracking-tight flex items-center gap-2">
              <span>Template &amp; Draft Builder</span>
              {currentDraftId && (
                <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  Editing Draft
                </span>
              )}
              {currentTemplateId && !currentDraftId && (
                <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                  Based on Template
                </span>
              )}
            </h1>

          </div>
        </div>

        {/* Builder View Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab("editor")}
            className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
              activeTab === "editor"
                ? "bg-white text-blue-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📝 Document Editor
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("templates");
              fetchTemplatesAndDrafts();
            }}
            className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
              activeTab === "templates"
                ? "bg-white text-blue-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📁 My Templates ({templatesList.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("drafts");
              fetchTemplatesAndDrafts();
            }}
            className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
              activeTab === "drafts"
                ? "bg-white text-blue-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📄 My Drafts ({draftsList.length})
          </button>
        </div>
      </div>

      {/* ================= 3. TAB VIEW: DOCUMENT EDITOR ================= */}
      {activeTab === "editor" && !complaint && (
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center space-y-3">
          <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto text-blue-700">
            <FileText className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold text-slate-800">
            Select a Complaint to Generate Report Template
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Choose any complaint from your Complaint Register in the required dropdown above. The system will analyze all facts from the Overview and Documents subtabs, extract identified persons (complainant, accused, witnesses), and populate live dynamic template placeholders.
          </p>
        </div>
      )}

      {activeTab === "editor" && complaint && (
        <div className="space-y-4">
          {/* TOP ACTION & STATUS BAR */}
          <div className="no-print bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={docName}
                  onChange={(e) => {
                    setDocName(e.target.value);
                    handleContentChange();
                  }}
                  className="text-sm font-black text-slate-900 bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-2 py-1 outline-none min-w-[200px] max-w-[320px]"
                  placeholder="Document Title (e.g. Field Enquiry Preliminary Report)"
                />
                <VoiceInputButton
                  onTranscript={(t) => {
                    setDocName(t);
                    handleContentChange();
                  }}
                  currentValue={docName}
                  fieldLabel="दस्तावेज़ शीर्षक"
                  iconOnly
                />
              </div>

              {/* Case Link Pill */}
              {complaint ? (
                <div className="flex items-center gap-1.5 text-xs bg-purple-50 text-purple-900 px-2.5 py-1 rounded-md border border-purple-200">
                  <span className="font-semibold">Case:</span>
                  <span className="font-mono font-bold">{complaint.complaintNumber}</span>
                  <button
                    type="button"
                    onClick={() => setComplaint(null)}
                    className="hover:text-red-700 ml-1 cursor-pointer"
                    title="Unlink case"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectComplaintModalOpen(true)}
                  className="text-xs text-slate-600 hover:text-slate-900 border-dashed border-slate-300"
                >
                  <span>+ Link Case Data</span>
                </Button>
              )}
            </div>

            {/* Auto-save & Primary Save Actions */}
            <div className="flex items-center gap-2.5">
              {/* Report Template Selector */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1">
                <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Template:</span>
                <select
                  value={selectedReportTemplateId}
                  onChange={(e) => handleSelectReportTemplate(e.target.value)}
                  className="text-xs font-bold bg-transparent border-0 outline-none cursor-pointer text-slate-900 max-w-[210px] truncate"
                >
                  <optgroup label="Standard Enquiry Templates">
                    {STANDARD_REPORT_TEMPLATES.map((tmpl) => (
                      <option key={tmpl.id} value={tmpl.id}>
                        {tmpl.name}
                      </option>
                    ))}
                  </optgroup>
                  {templatesList.length > 0 && (
                    <optgroup label="Custom Saved Templates">
                      {templatesList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Save in Complaint Docket */}
              <Button
                type="button"
                onClick={handleSaveReportToComplaintDocket}
                disabled={savingToComplaint}
                className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 cursor-pointer shadow-xs"
                title="Save generated report directly into selected complaint docket"
              >
                {saveToComplaintSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>Saved in Docket!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingToComplaint ? "Saving..." : "Save in Complaint Docket"}</span>
                  </>
                )}
              </Button>

              <span className="text-[11px] font-semibold text-slate-500">
                {saveStatus === "Saving..." && <span className="text-amber-600 animate-pulse">Saving...</span>}
                {saveStatus === "Saved" && (
                  <span className="text-emerald-700 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Saved {lastSavedAt && `at ${lastSavedAt}`}
                  </span>
                )}
                {saveStatus === "Unsaved changes" && <span className="text-amber-700">Unsaved changes</span>}
              </span>

              {/* Save As Draft */}
              <Button
                type="button"
                data-agent-operation="read"
                onClick={() => openSaveModal("DRAFT")}
                className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white gap-1.5 cursor-pointer shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save as Draft</span>
              </Button>

              <Button type="button" variant="outline" onClick={() => {
                if (!editorRef.current) return;
                if (hasUnsavedChanges && !confirm("Switch document mode? Unsaved edits will be replaced.")) return;
                const raw = editingDefinition ? editorRef.current.innerHTML : activeTemplateRawContent;
                setActiveTemplateRawContent(raw);
                editorRef.current.innerHTML = editingDefinition ? resolveDynamicPlaceholders(raw, complaint, undefined, selectedPerson) : raw;
                setEditingDefinition(!editingDefinition);
                setHasUnsavedChanges(false);
              }}>{editingDefinition ? "Preview Case Document" : "Edit Template Definition"}</Button>
              {/* Save As Template */}
              <Button
                type="button"
                data-agent-operation="read"
                onClick={() => openSaveModal("TEMPLATE")}
                className="text-xs font-bold bg-[#0b192c] hover:bg-slate-800 text-white gap-1.5 cursor-pointer shadow-xs"
              >
                <Bookmark className="w-3.5 h-3.5 text-blue-400" />
                <span>Save as Template</span>
              </Button>

              {/* Print & Export Menu */}
              <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  className="text-xs p-2 text-slate-700 hover:text-slate-900"
                  title="Print / Print Preview"
                >
                  <Printer className="w-3.5 h-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadWord}
                  className="text-xs p-2 text-slate-700 hover:text-slate-900"
                  title="Download Word Document (.doc)"
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* ================= STICKY WORD-STYLE FORMATTING TOOLBAR ================= */}
          <div className="no-print sticky top-2 z-30 bg-white border border-slate-300 rounded-xl shadow-md p-2 flex flex-wrap items-center gap-1.5 text-slate-800">
            <VerbatimSelectionButton editorRef={editorRef} onChange={() => {
              hindiAutocorrect.dismissSuggestion();
              handleContentChange();
            }} />
            {hindiAutocorrect.suggestion && (
              <HindiSuggestionChip
                word={hindiAutocorrect.suggestion.replacement}
                wrong={hindiAutocorrect.suggestion.word}
                position={hindiAutocorrect.suggestion.rect}
                onAccept={hindiAutocorrect.acceptSuggestion}
                onReject={hindiAutocorrect.rejectSuggestion}
              />
            )}

            {/* Undo / Redo */}
            <button
              type="button"
              onClick={() => execCmd("undo")}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="Undo (Ctrl+Z)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execCmd("redo")}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="Redo (Ctrl+Y)"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <span className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* Font Family Selector */}
            <select
              value={currentFont}
              onChange={(e) => handleFontChange(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none font-semibold text-slate-800 cursor-pointer"
              title="Font Family"
            >
              <option value="Nirmala UI, sans-serif">Nirmala UI (Hindi/English)</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="'Courier New', monospace">Courier New</option>
              <option value="'Kruti Dev 010', sans-serif">Kruti Dev 010</option>
            </select>

            {/* Font Size Selector */}
            <select
              value={currentSize}
              onChange={(e) => handleFontSizeChange(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded px-1.5 py-1 outline-none font-semibold text-slate-800 cursor-pointer w-16"
              title="Font Size"
            >
              <option value="9pt">9 pt</option>
              <option value="10pt">10 pt</option>
              <option value="11pt">11 pt</option>
              <option value="12pt">12 pt</option>
              <option value="14pt">14 pt</option>
              <option value="16pt">16 pt</option>
              <option value="18pt">18 pt</option>
              <option value="20pt">20 pt</option>
              <option value="24pt">24 pt</option>
            </select>

            <span className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* Bold, Italic, Underline, Strikethrough */}
            <button
              type="button"
              onClick={() => execCmd("bold")}
              className="p-1.5 rounded hover:bg-slate-100 font-bold text-slate-800 cursor-pointer"
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execCmd("italic")}
              className="p-1.5 rounded hover:bg-slate-100 italic text-slate-800 cursor-pointer"
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execCmd("underline")}
              className="p-1.5 rounded hover:bg-slate-100 underline text-slate-800 cursor-pointer"
              title="Underline (Ctrl+U)"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execCmd("strikeThrough")}
              className="p-1.5 rounded hover:bg-slate-100 line-through text-slate-800 cursor-pointer"
              title="Strikethrough"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>

            <span className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* Text Color & Highlight */}
            <div className="flex items-center gap-0.5">
              <label className="relative cursor-pointer p-1 rounded hover:bg-slate-100 text-xs font-bold" title="Text Color">
                <span>A</span>
                <span className="block h-1 w-full rounded" style={{ backgroundColor: textColor }} />
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => handleTextColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              <label className="relative cursor-pointer p-1 rounded hover:bg-slate-100 text-xs font-bold" title="Highlight Color">
                <span className="bg-yellow-200 px-1 rounded text-[10px]">H</span>
                <span className="block h-1 w-full rounded" style={{ backgroundColor: highlightColor }} />
                <input
                  type="color"
                  value={highlightColor}
                  onChange={(e) => handleHighlightColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
            </div>

            <span className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* Alignments: Left, Center, Right, Justify */}
            <button
              type="button"
              onClick={() => execCmd("justifyLeft")}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="Align Left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execCmd("justifyCenter")}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="Align Center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execCmd("justifyRight")}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="Align Right"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execCmd("justifyFull")}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="Justify"
            >
              <AlignJustify className="w-3.5 h-3.5" />
            </button>

            <span className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* Lists: Bullets, Numbered */}
            <button
              type="button"
              onClick={() => execCmd("insertUnorderedList")}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="Bulleted List"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execCmd("insertOrderedList")}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="Numbered List"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execCmd("indent")}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="Increase Indent"
            >
              <Indent className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => execCmd("outdent")}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="Decrease Indent"
            >
              <Outdent className="w-3.5 h-3.5" />
            </button>

            <span className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* Document Elements Menu */}
            <div className="relative group">
              <button
                type="button"
                className="px-2.5 py-1 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded flex items-center gap-1 cursor-pointer"
                title="Insert Document Elements"
              >
                <span>Insert Element</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              <div className="hidden group-hover:block absolute left-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 divide-y divide-slate-100">
                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => insertHeading("h1")}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 font-bold"
                  >
                    Heading 1 (H1)
                  </button>
                  <button
                    type="button"
                    onClick={() => insertHeading("h2")}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 font-bold"
                  >
                    Heading 2 (H2)
                  </button>
                  <button
                    type="button"
                    onClick={() => insertHeading("p")}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50"
                  >
                    Paragraph (Normal Text)
                  </button>
                </div>
                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => setTableModalOpen(true)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <TableIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>Table (तालिका)</span>
                  </button>
                  <button
                    type="button"
                    onClick={insertImage}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Image / Scan Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={insertSignatureArea}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-purple-600" />
                    <span>IO Signature Block</span>
                  </button>
                  <button
                    type="button"
                    onClick={insertHorizontalLine}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <Minus className="w-3.5 h-3.5" />
                    <span>Horizontal Divider Line</span>
                  </button>
                  <button
                    type="button"
                    onClick={insertCheckbox}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-amber-600" />
                    <span>Interactive Checkbox</span>
                  </button>
                  <button
                    type="button"
                    onClick={insertPageBreak}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50"
                  >
                    Page Break (पृष्ठ विभाजन)
                  </button>
                </div>
              </div>
            </div>

            {/* Table Tools (Active when inside a table) */}
            <div className="relative group">
              <button
                type="button"
                className="px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded flex items-center gap-1 cursor-pointer"
                title="Table Quick Actions"
              >
                <TableIcon className="w-3 h-3 text-slate-500" />
                <span>Table Tools</span>
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
              <div className="hidden group-hover:block absolute left-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 text-xs">
                <button type="button" onClick={addTableRow} className="w-full text-left px-3 py-1.5 hover:bg-slate-50">
                  + Add Row Below
                </button>
                <button type="button" onClick={deleteTableRow} className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-700">
                  - Delete Row
                </button>
                <button type="button" onClick={addTableCol} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 border-t border-slate-100">
                  + Add Column
                </button>
                <button type="button" onClick={deleteTableCol} className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-700">
                  - Delete Column
                </button>
              </div>
            </div>

            <span className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* Voice Dictation (बोलकर लिखें) */}
            <div className="flex items-center">
              <VoiceInputButton
                onTranscript={(text) => {
                  if (editorRef.current) {
                    editorRef.current.focus();
                    document.execCommand("insertText", false, text + " ");
                    handleContentChange();
                  }
                }}
                fieldLabel="बोलकर लिखें (Voice Typing)"
                preferredLang="hi-IN"
              />
            </div>

            <span className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* ================= CMS DYNAMIC PLACEHOLDERS MENU ================= */}
            <div className="relative group">
              <button
                type="button"
                className="px-3 py-1 text-xs font-black text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Insert dynamic Case Management System variables"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>+ Insert CMS Field</span>
                <ChevronDown className="w-3 h-3 text-blue-600" />
              </button>

              <div className="hidden group-hover:block absolute left-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-2 max-h-96 overflow-y-auto">
                <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50 rounded">
                  Dynamic Case Placeholders
                </div>
                <div className="mt-1 divide-y divide-slate-100">
                  {CMS_DYNAMIC_FIELDS.map((field) => (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => insertPlaceholderToken(field.token)}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50/70 rounded transition-colors group/item"
                    >
                      <div className="text-xs font-bold text-slate-900 group-hover/item:text-blue-900">
                        {field.label}
                      </div>
                      <div className="text-[10px] font-mono text-blue-600 font-semibold flex items-center justify-between">
                        <span>{field.token}</span>
                        <span className="text-slate-400 font-sans italic text-[9px] truncate max-w-[100px]">
                          e.g. {field.example}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Custom Fields section */}
                {customFields.length > 0 && (
                  <div className="mt-2 pt-1 border-t border-slate-200">
                    <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-50 rounded">
                      User Custom Fields ({customFields.length})
                    </div>
                    {customFields.map((cf) => (
                      <button
                        key={cf.token}
                        type="button"
                        onClick={() => insertPlaceholderToken(cf.token)}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-purple-50 rounded transition-colors"
                      >
                        <div className="text-xs font-bold text-slate-900">{cf.name}</div>
                        <div className="text-[10px] font-mono text-purple-700 font-bold">{cf.token}</div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 mt-2">
                  <button
                    type="button"
                    onClick={() => setCustomFieldModalOpen(true)}
                    className="w-full py-1.5 text-xs font-bold text-center text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                  >
                    + Add New Custom Field
                  </button>
                </div>
              </div>
            </div>

            {/* Clear Formatting */}
            <button
              type="button"
              onClick={() => execCmd("removeFormat")}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900 cursor-pointer text-xs font-semibold ml-auto"
              title="Clear Formatting"
            >
              Clear Format
            </button>
          </div>

          {/* ================= 4. A4 WHITE DOCUMENT CANVAS ================= */}
          <div className="bg-slate-100 p-4 sm:p-8 rounded-2xl border border-slate-200 shadow-inner flex justify-center overflow-x-auto min-h-[900px]">
            <div
              ref={editorRef}
              aria-label="Document body"
              contentEditable
              suppressContentEditableWarning
              onInput={(event) => {
                hindiAutocorrect.onInput(event);
                handleContentChange();
              }}
              className="cms-paper-sheet bg-white text-slate-950 shadow-xl rounded-sm p-10 sm:p-14 border border-slate-200 outline-none w-full max-w-[850px] min-h-[1100px] leading-relaxed transition-all focus:ring-2 focus:ring-blue-500/20"
              style={{
                fontFamily: currentFont,
                fontSize: currentSize,
              }}
            >
              <h2 className="text-center font-bold text-base uppercase mb-4 tracking-wider">
                हरियाणा पुलिस - केस दस्तावेज़ / प्रारूप
              </h2>
              <p>
                यहाँ से अपना नया प्रारूप, नोटिस, रिपोर्ट या पत्र बनाना शुरू करें...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================= 5. TAB VIEW: MY TEMPLATES ================= */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search templates by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium outline-none"
              >
                <option value="updatedAt">Last Modified</option>
                <option value="createdAt">Created Date</option>
                <option value="name">Template Name</option>
              </select>

              <Button
                type="button"
                size="sm"
                onClick={handleCreateNewBlank}
                className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Create Template</span>
              </Button>
            </div>
          </div>

          {/* Templates Table / List */}
          {managementLoading ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
              Loading templates...
            </div>
          ) : templatesList.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-3">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                <Bookmark className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No templates created yet</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Create your first template to reuse documents across Field Enquiry, Notices, and Case Reports.
              </p>
              <Button
                type="button"
                onClick={handleCreateNewBlank}
                className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Create Template</span>
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Template Name</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Created By</th>
                      <th className="p-3">Version</th>
                      <th className="p-3">Last Modified</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {templatesList.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-slate-900 text-sm">{t.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">ID: {t.id}</div>
                        </td>
                        <td className="p-3 text-slate-600 max-w-xs truncate">
                          {t.description || "—"}
                        </td>
                        <td className="p-3 text-slate-700">
                          <div>{t.createdByName || t.createdBy}</div>
                          {t.createdByRank && <div className="text-[10px] text-slate-400">{t.createdByRank}</div>}
                        </td>
                        <td className="p-3 font-mono font-bold text-blue-700">
                          v{t.version}
                        </td>
                        <td className="p-3 text-slate-500">
                          {formatDate(t.updatedAt)}
                        </td>
                        <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenTemplate(t)}
                            className="text-xs font-bold text-blue-700 border-blue-200 hover:bg-blue-50"
                          >
                            Use Template
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                await BuilderService.duplicateTemplate(t.id);
                                fetchTemplatesAndDrafts();
                              } catch (e) {
                                alert("Duplicate failed");
                              }
                            }}
                            className="text-xs text-slate-600 hover:text-slate-900"
                            title="Duplicate"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              if (!confirm(`Are you sure you want to delete template "${t.name}"?`)) return;
                              try {
                                await BuilderService.deleteTemplate(t.id);
                                fetchTemplatesAndDrafts();
                              } catch (e) {
                                alert("Delete failed");
                              }
                            }}
                            className="text-xs text-red-600 hover:bg-red-50 hover:text-red-800"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= 6. TAB VIEW: MY DRAFTS ================= */}
      {activeTab === "drafts" && (
        <div className="space-y-4">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search drafts by name, case number or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium outline-none"
              >
                <option value="updatedAt">Last Modified</option>
                <option value="createdAt">Created Date</option>
                <option value="name">Draft Name</option>
              </select>

              <Button
                type="button"
                size="sm"
                onClick={handleCreateNewBlank}
                className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Create Draft</span>
              </Button>
            </div>
          </div>

          {managementLoading ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
              Loading drafts...
            </div>
          ) : draftsList.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-3">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                <FileCheck2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No drafts available</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Create and save a document as a draft to continue working later.
              </p>
              <Button
                type="button"
                onClick={handleCreateNewBlank}
                className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Create Draft</span>
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Draft Name</th>
                      <th className="p-3">Related Case</th>
                      <th className="p-3">Base Template</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Last Modified</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draftsList.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-slate-900 text-sm">{d.name}</div>
                          {d.description && <div className="text-[11px] text-slate-500">{d.description}</div>}
                        </td>
                        <td className="p-3">
                          {d.complaintNumber ? (
                            <span className="font-mono font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                              {d.complaintNumber}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-600">
                          {d.template?.name ? `📁 ${d.template.name}` : "—"}
                        </td>
                        <td className="p-3">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                            {d.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500">
                          {formatDate(d.updatedAt)}
                        </td>
                        <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenDraft(d)}
                            className="text-xs font-bold text-amber-700 border-amber-200 hover:bg-amber-50"
                          >
                            Continue Editing
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                await BuilderService.duplicateDraft(d.id);
                                fetchTemplatesAndDrafts();
                              } catch (e) {
                                alert("Duplicate failed");
                              }
                            }}
                            className="text-xs text-slate-600 hover:text-slate-900"
                            title="Duplicate"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              if (!confirm(`Are you sure you want to delete draft "${d.name}"?`)) return;
                              try {
                                await BuilderService.deleteDraft(d.id);
                                fetchTemplatesAndDrafts();
                              } catch (e) {
                                alert("Delete failed");
                              }
                            }}
                            className="text-xs text-red-600 hover:bg-red-50 hover:text-red-800"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL: SAVE AS TEMPLATE OR DRAFT ================= */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {saveMode === "TEMPLATE" ? (
                  <Bookmark className="w-5 h-5 text-blue-600" />
                ) : (
                  <Save className="w-5 h-5 text-amber-600" />
                )}
                <h3 className="font-bold text-slate-900 text-sm">
                  {saveMode === "TEMPLATE" ? "Save as Reusable Template" : "Save as Working Draft"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  Document Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={saveModalName}
                  onChange={(e) => setSaveModalName(e.target.value)}
                  placeholder={
                    saveMode === "TEMPLATE"
                      ? "e.g. Field Enquiry Preliminary Report Template"
                      : "e.g. Enquiry Report – Case 102"
                  }
                  className="w-full text-xs font-semibold p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={saveModalDesc}
                  onChange={(e) => setSaveModalDesc(e.target.value)}
                  placeholder="Purpose, applicable sections, or usage notes..."
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              {saveMode === "DRAFT" && (
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Link to Case (Optional)</label>
                  <select
                    value={saveModalCaseId}
                    onChange={(e) => setSaveModalCaseId(e.target.value)}
                    className="w-full text-xs font-semibold p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- No specific case (General Draft) --</option>
                    {availableComplaints.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.complaintNumber} - {c.complainantName} ({c.policeStation})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSaveModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!saveModalName.trim()}
                onClick={handleSaveModalSubmit}
                className={`text-xs font-bold text-white ${
                  saveMode === "TEMPLATE"
                    ? "bg-[#0b192c] hover:bg-slate-800"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {saveMode === "TEMPLATE" ? "Save Template" : "Save Draft"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD CUSTOM FIELD ================= */}
      {customFieldModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>Add Custom Dynamic Field</span>
              </h3>
              <button
                type="button"
                onClick={() => setCustomFieldModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1">Field Name</label>
                <input
                  type="text"
                  value={newCustomFieldName}
                  onChange={(e) => setNewCustomFieldName(e.target.value)}
                  placeholder="e.g. Enquiry Officer Remarks"
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              {newCustomFieldName.trim() && (
                <div className="p-2 bg-purple-50 text-purple-900 rounded border border-purple-200 text-[11px] font-mono">
                  Generated Placeholder:{" "}
                  <b>{`{{${newCustomFieldName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_")}}}`}</b>
                </div>
              )}
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCustomFieldModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!newCustomFieldName.trim()}
                onClick={handleCreateCustomField}
                className="text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white"
              >
                Insert Field
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: INSERT TABLE ================= */}
      {tableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="bg-white rounded-2xl max-w-xs w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <TableIcon className="w-4 h-4 text-blue-600" />
                <span>Insert Table (तालिका बनाएँ)</span>
              </h3>
              <button
                type="button"
                onClick={() => setTableModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Rows (पंक्तियाँ)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={tableRows}
                    onChange={(e) => setTableRows(parseInt(e.target.value) || 1)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Columns (स्तंभ)</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={tableCols}
                    onChange={(e) => setTableCols(parseInt(e.target.value) || 1)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTableModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={insertTable}
                className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
              >
                Insert Table
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: SELECT COMPLAINT DATA ================= */}
      {selectComplaintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-600" />
                <span>Link Case Data to Document</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectComplaintModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto space-y-2">
              {availableComplaints.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setComplaint(c);
                    setSaveModalCaseId(c.id);
                    if (editorRef.current) {
                      const resolved = resolveDynamicPlaceholders(editorRef.current.innerHTML, c);
                      editorRef.current.innerHTML = resolved;
                    }
                    setSelectComplaintModalOpen(false);
                  }}
                  className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-purple-400 hover:bg-purple-50/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-purple-900 text-xs">
                      {c.complaintNumber}
                    </span>
                    <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                      {c.policeStation}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-800 mt-1">{c.complainantName}</div>
                  <div className="text-[11px] text-slate-500 truncate">{c.incidentDetails}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TemplateDraftBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-slate-500">
          Loading Document Builder...
        </div>
      }
    >
      <TemplateDraftBuilderContent />
    </Suspense>
  );
}
