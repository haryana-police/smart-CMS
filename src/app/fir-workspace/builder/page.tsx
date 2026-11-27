"use client";

import { useLanguage } from "@/context/LanguageContext";
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
  Layers,
  Scale,
  BadgeAlert,
  Eye,
  FileSignature,
} from "lucide-react";
import { HindiSuggestionChip, VerbatimSelectionButton } from "@/components/editor/VerbatimSelectionButton";
import { useHindiReportAutocorrect } from "@/hooks/useHindiAutocorrect";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/utils";
import { printA4Element, downloadA4DocumentAsHtml } from "@/utils/printElement";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FIRWorkspaceNav } from "@/components/fir-workspace/FIRWorkspaceNav";
import { persistentFirService as firService } from "@/services/persistentFirService";
import { FIRItem } from "@/types";
import { VoiceInputButton } from "@/components/ui/voice-input-button";
import {
  BuilderService,
  BuilderTemplateItem,
} from "@/services/builderService";

// Storage key for custom FIR templates
const FIR_CUSTOM_TEMPLATES_STORAGE_KEY = "haryana_police_fir_custom_templates_v2";

export interface FIRInvestigationTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  content: string;
  isCustom?: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

// Preloaded Standard Legal FIR Investigation Templates
export const STANDARD_FIR_INVESTIGATION_TEMPLATES: FIRInvestigationTemplate[] = [
  {
    id: "std_fir_180_bnss",
    name: "बयान गवाहान - धारा 180 BNSS (Statement of Witness)",
    category: "Witness Statement",
    description: "भारतीय नागरिक सुरक्षा संहिता (BNSS) 2023 की धारा 180 के अंतर्गत साक्षी/गवाह का विधिवत अभिलिखित बयान।",
    content: `<div style="text-align: center; font-family: 'Nirmala UI', Arial, sans-serif; margin-bottom: 14px;">
  <div style="font-weight: bold; font-size: 14pt;">पुलिस विभाग, हरियाणा / POLICE DEPARTMENT, HARYANA</div>
  <div style="font-weight: bold; font-size: 11pt; color: #334155;">थाना: {{POLICE_STATION}}, जिला: {{DISTRICT}}</div>
  <div style="font-size: 10pt; color: #475569; margin-top: 2px;">मुकदमा नंबर / FIR No.: <strong>{{FIR_NUMBER}}</strong> &nbsp;|&nbsp; धाराएं: <strong>{{ACTS_AND_SECTIONS}}</strong></div>
  <hr style="border: 1px solid #000; margin: 10px 0 16px 0;" />
  <div style="font-weight: bold; font-size: 13pt; text-decoration: underline; letter-spacing: 0.5px;">
    बयान गवाहान अंतर्गत धारा 180 भारतीय नागरिक सुरक्षा संहिता (BNSS), 2023
  </div>
</div>

<p><strong>दिनांक / Date:</strong> {{DATE}} &nbsp;&nbsp;&nbsp;&nbsp; <strong>समय / Time:</strong> {{TIME}} &nbsp;&nbsp;&nbsp;&nbsp; <strong>स्थान / Place:</strong> {{ENQUIRY_LOCATION}}</p>

<table style="width: 100%; border-collapse: collapse; margin: 14px 0; border: 1.5px solid #000; font-size: 10.5pt;">
  <tr style="background-color: #f1f5f9;">
    <th style="border: 1px solid #000; padding: 7px 10px; text-align: left; width: 30%;">विवरण (Particulars)</th>
    <th style="border: 1px solid #000; padding: 7px 10px; text-align: left;">रिकॉर्ड अनुसार प्रविष्टि (Entry on Record)</th>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">गवाह का नाम व पहचान:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">{{WITNESS_NAME}}<br/> उम्र लगभग: ...... वर्ष</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">पिता/पति का नाम:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">श्री ....................................................</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">निवास स्थान / पता:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">मकान नं. ...................., ग्राम/वार्ड ...................., थाना {{POLICE_STATION}}, जिला {{DISTRICT}}</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">मोबाइल नंबर / आधार:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">मो. ....................................., आधार नं: .....................................</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">व्यवसाय:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">....................................................</td>
  </tr>
</table>

<h3 style="font-size: 11pt; font-weight: bold; margin-top: 14px;">गवाह का मौखिक कथन (Statement of Witness):</h3>
<p style="text-align: justify; line-height: 1.6;">[Record the actual statement / proceedings here, with date, place and supporting references. Do not infer facts from the case summary.]</p>
<p style="text-align: justify; line-height: 1.6;">[Record the actual statement / proceedings here, with date, place and supporting references. Do not infer facts from the case summary.]</p>
<p style="text-align: justify; line-height: 1.6;">[Record the actual statement / proceedings here, with date, place and supporting references. Do not infer facts from the case summary.]</p>

<p style="line-height: 1.6; margin-top: 14px;">
  <em>[Record whether the statement was read back and confirmed.]</em>
</p>

<br/><br/>
<table style="width: 100%; border: none; margin-top: 20px;">
  <tr>
    <td style="width: 50%; vertical-align: top; text-align: left;">
      <strong>हस्ताक्षर / अंगूठा निशान गवाह:</strong><br/><br/>
      (....................................................)<br/>
      नाम: {{WITNESS_NAME}}<br/>
      दिनांक: {{DATE}}
    </td>
    <td style="width: 50%; vertical-align: top; text-align: right;">
      <strong>हस्ताक्षर तफ्तीश अधिकारी (IO):</strong><br/><br/>
      <strong>({{OFFICER_NAME}})</strong><br/>
      {{OFFICER_RANK}}<br/>
      PNO/Belt No: {{OFFICER_BELT_NUMBER}}<br/>
      थाना: {{POLICE_STATION}}, {{DISTRICT}}
    </td>
  </tr>
</table>`,
  },
  {
    id: "std_fir_recovery_memo",
    name: "फर्द बरामदगी / जब्तीनामा (Seizure & Recovery Memo)",
    category: "Seizure / Recovery",
    description: "अभियुक्त की निशानदेही या मौके से मशरूका/हथियार/सामान बरामदगी व जप्ती की आधिकारिक फर्द।",
    content: `<div style="text-align: center; font-family: 'Nirmala UI', Arial, sans-serif; margin-bottom: 14px;">
  <div style="font-weight: bold; font-size: 14pt;">पुलिस विभाग, हरियाणा</div>
  <div style="font-weight: bold; font-size: 11pt; color: #334155;">थाना: {{POLICE_STATION}}, जिला: {{DISTRICT}}</div>
  <div style="font-size: 10pt; color: #475569; margin-top: 2px;">मुकदमा नंबर: <strong>{{FIR_NUMBER}}</strong> &nbsp;|&nbsp; दिनांक: <strong>{{DATE}}</strong> &nbsp;|&nbsp; धाराएं: <strong>{{ACTS_AND_SECTIONS}}</strong></div>
  <hr style="border: 1px solid #000; margin: 10px 0 16px 0;" />
  <div style="font-weight: bold; font-size: 13pt; text-decoration: underline;">
    फर्द बरामदगी / जब्तीनामा (SEIZURE & RECOVERY MEMO)
  </div>
</div>

<p><strong>स्थान बरामदगी:</strong> {{INCIDENT_PLACE}} &nbsp;&nbsp;&nbsp;&nbsp; <strong>दिनांक व समय:</strong> {{DATE}} वक्ता {{TIME}} बजे</p>

<p style="text-align: justify; line-height: 1.6;">[Record the actual statement / proceedings here, with date, place and supporting references. Do not infer facts from the case summary.]</p>

<table style="width: 100%; border-collapse: collapse; margin: 12px 0; border: 1.5px solid #000; font-size: 10pt;">
  <thead>
    <tr style="background-color: #f8fafc; border-bottom: 1.5px solid #000;">
      <th style="border: 1px solid #000; padding: 6px 8px; width: 8%; text-align: center;">क्र.सं.</th>
      <th style="border: 1px solid #000; padding: 6px 8px; width: 45%; text-align: left;">बरामद शुदा माल / संपत्ति का पूर्ण विवरण</th>
      <th style="border: 1px solid #000; padding: 6px 8px; width: 15%; text-align: center;">तादाद / मात्रा</th>
      <th style="border: 1px solid #000; padding: 6px 8px; width: 32%; text-align: left;">मार्का / सील का विवरण</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">1</td>
      <td style="border: 1px solid #000; padding: 6px 8px;">[माल/हथियार/वाहन का विवरण, रंग, मेक, मॉडल, पहचान चिह्न]</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">[Quantity]</td>
      <td style="border: 1px solid #000; padding: 6px 8px;">[Enter actual packaging and seal details]</td>
    </tr>
    <tr>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">2</td>
      <td style="border: 1px solid #000; padding: 6px 8px;">नगद धनराशि / सिम कार्ड / इलेक्ट्रॉनिक उपकरण</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">-</td>
      <td style="border: 1px solid #000; padding: 6px 8px;">[Enter verified seizure details]</td>
    </tr>
  </tbody>
</table>

<h3 style="font-size: 11pt; font-weight: bold; margin-top: 14px;">कार्रवाई जब्ती व सीलबंदी:</h3>
<p style="text-align: justify; line-height: 1.6;">[Record the actual statement / proceedings here, with date, place and supporting references. Do not infer facts from the case summary.]</p>

<br/><br/>
<table style="width: 100%; border: none; margin-top: 20px;">
  <tr>
    <td style="width: 50%; vertical-align: top; text-align: left;">
      <strong>हाजिर गवाहान (Witnesses):</strong><br/><br/>
      1. हस्ताक्षर: .......................................<br/>
      नाम: {{COMPLAINANT_NAME}}<br/>
      पता: {{COMPLAINANT_ADDRESS}}<br/><br/>
      2. हस्ताक्षर: .......................................<br/>
      नाम: {{WITNESS_NAME}}<br/>
      पता: ....................................................
    </td>
    <td style="width: 50%; vertical-align: top; text-align: right;">
      <strong>हस्ताक्षर तफ्तीश अधिकारी (IO):</strong><br/><br/>
      <strong>({{OFFICER_NAME}})</strong><br/>
      {{OFFICER_RANK}}<br/>
      PNO/Belt: {{OFFICER_BELT_NUMBER}}<br/>
      थाना: {{POLICE_STATION}}
    </td>
  </tr>
</table>`,
  },
  {
    id: "std_fir_scene_inspection",
    name: "मौका मुआयना व नजरी नक्शा टिप्पणी (Crime Scene Inspection)",
    category: "Scene Inspection",
    description: "घटनास्थल का गहन मुआयना, दिशा-वार चौहद्दी व नजरी नक्शा विवरण।",
    content: `<div style="text-align: center; font-family: 'Nirmala UI', Arial, sans-serif; margin-bottom: 14px;">
  <div style="font-weight: bold; font-size: 14pt;">पुलिस विभाग, हरियाणा</div>
  <div style="font-weight: bold; font-size: 11pt; color: #334155;">थाना: {{POLICE_STATION}}, जिला: {{DISTRICT}}</div>
  <div style="font-size: 10pt; color: #475569; margin-top: 2px;">FIR No.: <strong>{{FIR_NUMBER}}</strong> &nbsp;|&nbsp; धाराएं: <strong>{{ACTS_AND_SECTIONS}}</strong></div>
  <hr style="border: 1px solid #000; margin: 10px 0 16px 0;" />
  <div style="font-weight: bold; font-size: 13pt; text-decoration: underline;">
    मौका मुआयना आख्या व नजरी नक्शा टिप्पणी (CRIME SCENE INSPECTION NOTE)
  </div>
</div>

<p><strong>घटनास्थल का नाम व पता:</strong> {{INCIDENT_PLACE}}</p>
<p><strong>मुआयना दिनांक व समय:</strong> {{DATE}} को वक्ता {{TIME}} बजे</p>
<p><strong>दूरी थाना से:</strong> लगभग ..... किमी (दिशा: ............)</p>

<h3 style="font-size: 11pt; font-weight: bold; margin-top: 14px;">1. चौहद्दी घटनास्थल (Boundaries of Spot):</h3>
<table style="width: 100%; border-collapse: collapse; margin: 10px 0; border: 1.5px solid #000; font-size: 10pt;">
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; width: 25%; font-weight: bold; background-color: #f8fafc;">पूर्व दिशा (East):</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">[पूर्व दिशा में स्थित मकान, दुकान, रास्ता या खेत]</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background-color: #f8fafc;">पश्चिम दिशा (West):</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">[पश्चिम दिशा में स्थित सड़क/मकान]</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background-color: #f8fafc;">उत्तर दिशा (North):</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">[उत्तर दिशा की सीमा]</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background-color: #f8fafc;">दक्षिण दिशा (South):</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">[दक्षिण दिशा की सीमा]</td>
  </tr>
</table>

<h3 style="font-size: 11pt; font-weight: bold; margin-top: 14px;">2. मौके की भौतिक स्थिति व निरीक्षण बिंदु:</h3>
<p style="text-align: justify; line-height: 1.6;">[Record the actual statement / proceedings here, with date, place and supporting references. Do not infer facts from the case summary.]</p>
<ul>
  <li><strong>बिंदु 'A':</strong> वह स्थान जहाँ घटना कारित हुई।</li>
  <li><strong>बिंदु 'B':</strong> वह स्थान जहाँ अभियुक्त <strong>{{ACCUSED_NAME}}</strong> वाहन लेकर खड़ा था।</li>
  <li><strong>बिंदु 'C':</strong> वह स्थान जहाँ से गवाह <strong>{{WITNESS_NAME}}</strong> ने घटना को प्रत्यक्ष रूप से देखा।</li>
</ul>

<h3 style="font-size: 11pt; font-weight: bold; margin-top: 14px;">3. फॉरेंसिक व वैज्ञानिक साक्ष्य संकलन:</h3>
<p style="text-align: justify; line-height: 1.6;">[Record the actual statement / proceedings here, with date, place and supporting references. Do not infer facts from the case summary.]</p>

<br/><br/>
<div style="text-align: right;">
  <p><strong>({{OFFICER_NAME}})</strong><br/>{{OFFICER_RANK}}<br/>थाना {{POLICE_STATION}}, जिला {{DISTRICT}}<br/>PNO: {{OFFICER_BELT_NUMBER}}</p>
</div>`,
  },
  {
    id: "std_fir_interrogation_report",
    name: "पूछताछ ज्ञापन व बयान मुलजिम (Accused Interrogation Report)",
    category: "Interrogation Memo",
    description: "अभियुक्त से पूछताछ, व्यक्तिगत विवरण, जुर्म स्वीकारोक्ति/इंकार व खुलासा बयान।",
    content: `<div style="text-align: center; font-family: 'Nirmala UI', Arial, sans-serif; margin-bottom: 14px;">
  <div style="font-weight: bold; font-size: 14pt;">पुलिस विभाग, हरियाणा</div>
  <div style="font-weight: bold; font-size: 11pt; color: #334155;">थाना: {{POLICE_STATION}}, जिला: {{DISTRICT}}</div>
  <div style="font-size: 10pt; color: #475569; margin-top: 2px;">FIR No.: <strong>{{FIR_NUMBER}}</strong> &nbsp;|&nbsp; दिनांक: <strong>{{DATE}}</strong> &nbsp;|&nbsp; धाराएं: <strong>{{ACTS_AND_SECTIONS}}</strong></div>
  <hr style="border: 1px solid #000; margin: 10px 0 16px 0;" />
  <div style="font-weight: bold; font-size: 13pt; text-decoration: underline;">
    पूछताछ ज्ञापन / बयान मुलजिम (ACCUSED INTERROGATION MEMO)
  </div>
</div>

<table style="width: 100%; border-collapse: collapse; margin: 12px 0; border: 1.5px solid #000; font-size: 10pt;">
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; width: 30%; font-weight: bold; background-color: #f8fafc;">अभियुक्त का नाम:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">{{ACCUSED_NAME}}</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background-color: #f8fafc;">पिता का नाम:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">श्री ....................................................</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background-color: #f8fafc;">उम्र व लिंग:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">लगभग ..... वर्ष, पुरुष / महिला</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background-color: #f8fafc;">पता:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">{{ACCUSED_ADDRESS}}</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background-color: #f8fafc;">पहचान चिह्न (Mole/Scar):</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">....................................................</td>
  </tr>
</table>

<h3 style="font-size: 11pt; font-weight: bold; margin-top: 14px;">खुलासा बयान व जुर्म सम्बंधी कथन:</h3>
<p style="text-align: justify; line-height: 1.6;">[Record the actual statement / proceedings here, with date, place and supporting references. Do not infer facts from the case summary.]</p>
<p style="text-align: justify; line-height: 1.6;">[Record the actual statement / proceedings here, with date, place and supporting references. Do not infer facts from the case summary.]</p>

<br/><br/>
<table style="width: 100%; border: none;">
  <tr>
    <td style="width: 50%; text-align: left;">
      <strong>हस्ताक्षर / अंगूठा अभियुक्त:</strong><br/><br/>
      (....................................................)<br/>
      नाम: {{ACCUSED_NAME}}
    </td>
    <td style="width: 50%; text-align: right;">
      <strong>हस्ताक्षर तफ्तीश अधिकारी:</strong><br/><br/>
      <strong>({{OFFICER_NAME}})</strong><br/>
      {{OFFICER_RANK}}<br/>
      थाना {{POLICE_STATION}}
    </td>
  </tr>
</table>`,
  },
  {
    id: "std_fir_arrest_memo",
    name: "गिरफ्तारी ज्ञापन व सूचना पत्र - धारा 35 BNSS (Arrest Memo)",
    category: "Arrest Memo",
    description: "BNSS धारा 35(3)/35(7) व डीके बसु दिशानिर्देशों के अनुरूप गिरफ्तारी, जामातलाशी व परिजनों को सूचना पत्र।",
    content: `<div style="text-align: center; font-family: 'Nirmala UI', Arial, sans-serif; margin-bottom: 14px;">
  <div style="font-weight: bold; font-size: 14pt;">पुलिस विभाग, हरियाणा</div>
  <div style="font-weight: bold; font-size: 11pt; color: #334155;">थाना: {{POLICE_STATION}}, जिला: {{DISTRICT}}</div>
  <div style="font-size: 10pt; color: #475569; margin-top: 2px;">FIR No.: <strong>{{FIR_NUMBER}}</strong> &nbsp;|&nbsp; धाराएं: <strong>{{ACTS_AND_SECTIONS}}</strong></div>
  <hr style="border: 1px solid #000; margin: 10px 0 16px 0;" />
  <div style="font-weight: bold; font-size: 13pt; text-decoration: underline;">
    गिरफ्तारी ज्ञापन व सूचना प्रपत्र (ARREST & INTIMATION MEMO - SEC 35 BNSS)
  </div>
</div>

<p><strong>गिरफ्तारी दिनांक व समय:</strong> {{DATE}} को वक्ता {{TIME}} बजे &nbsp;&nbsp;&nbsp;&nbsp; <strong>स्थान:</strong> {{INCIDENT_PLACE}}</p>

<table style="width: 100%; border-collapse: collapse; margin: 12px 0; border: 1.5px solid #000; font-size: 10pt;">
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; width: 35%; font-weight: bold;">गिरफ्तार व्यक्ति का नाम:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">{{ACCUSED_NAME}}</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">पिता/पति का नाम:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">श्री ....................................................</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">पता:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">{{ACCUSED_ADDRESS}}</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">गिरफ्तारी का आधार व कारण:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">मुकदमा संख्या {{FIR_NUMBER}} धाराएं {{ACTS_AND_SECTIONS}} में पर्याप्त दस्तावेजी व प्रत्यक्ष साक्ष्य पाए जाने पर।</td>
  </tr>
  <tr>
    <td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold;">परिजनों को दी गई सूचना:</td>
    <td style="border: 1px solid #000; padding: 6px 10px;">श्री/श्रीमती ................................. (संबंध: ..............) को मो. नं. ................. पर दिनांक {{DATE}} समय {{TIME}} बजे सूचित किया गया।</td>
  </tr>
</table>

<h3 style="font-size: 11pt; font-weight: bold; margin-top: 14px;">जामातलाशी फर्द (Personal Search Memo):</h3>
<p style="text-align: justify; line-height: 1.6;">[Record the actual statement / proceedings here, with date, place and supporting references. Do not infer facts from the case summary.]</p>

<br/><br/>
<table style="width: 100%; border: none;">
  <tr>
    <td style="width: 50%; text-align: left;">
      <strong>हस्ताक्षर गिरफ्तार व्यक्ति:</strong><br/><br/>
      (....................................................)<br/>
      नाम: {{ACCUSED_NAME}}
    </td>
    <td style="width: 50%; text-align: right;">
      <strong>हस्ताक्षर अनुसंधान अधिकारी:</strong><br/><br/>
      <strong>({{OFFICER_NAME}})</strong><br/>
      {{OFFICER_RANK}}<br/>
      थाना {{POLICE_STATION}}
    </td>
  </tr>
</table>`,
  },
  {
    id: "std_fir_blank",
    name: "कोरा कानूनी दस्तावेज़ (Blank Investigation Document)",
    category: "General",
    description: "शून्य से नया जांच दस्तावेज़ या आदेश तैयार करने हेतु कोरा प्रारूप।",
    content: `<div style="text-align: center; font-family: 'Nirmala UI', Arial, sans-serif; margin-bottom: 14px;">
  <div style="font-weight: bold; font-size: 14pt;">पुलिस विभाग, हरियाणा / POLICE DEPARTMENT, HARYANA</div>
  <div style="font-weight: bold; font-size: 11pt; color: #334155;">थाना: {{POLICE_STATION}}, जिला: {{DISTRICT}}</div>
  <div style="font-size: 10pt; color: #475569; margin-top: 2px;">मुकदमा नंबर / FIR No.: <strong>{{FIR_NUMBER}}</strong> &nbsp;|&nbsp; धाराएं: <strong>{{ACTS_AND_SECTIONS}}</strong></div>
  <hr style="border: 1px solid #000; margin: 10px 0 16px 0;" />
  <div style="font-weight: bold; font-size: 13pt; text-decoration: underline;">
    दस्तावेज़ का शीर्षक / DOCUMENT TITLE
  </div>
</div>

<p><strong>दिनांक / Date:</strong> {{DATE}} &nbsp;&nbsp;&nbsp;&nbsp; <strong>स्थान / Place:</strong> {{POLICE_STATION}}</p>

<p>यहाँ से अपना कस्टम अनुसंधान दस्तावेज़ या कानूनी प्रपत्र लिखना प्रारंभ करें...</p>

<br/><br/>
<div style="text-align: right; margin-top: 30px;">
  <p><strong>({{OFFICER_NAME}})</strong><br/>{{OFFICER_RANK}}<br/>PNO: {{OFFICER_BELT_NUMBER}}<br/>थाना: {{POLICE_STATION}}, {{DISTRICT}}</p>
</div>`,
  },
];

// Helper to replace dynamic placeholders using FIRItem
export function resolveFIRPlaceholders(content: string, fir?: FIRItem | null, customValues?: Record<string, string>): string {
  if (!content) return "";
  let resolved = content;

  const todayStr = formatDate(new Date());
  const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const values: Record<string, string> = {
    "{{FIR_NUMBER}}": fir?.firNumber || "",
    "{{POLICE_STATION}}": fir?.policeStation || "",
    "{{DISTRICT}}": fir?.district || "",
    "{{STATE}}": fir?.state || "",
    "{{DATE}}": todayStr,
    "{{TIME}}": timeStr,
    "{{ACTS_AND_SECTIONS}}": fir?.actsAndSections || "",
    "{{MAJOR_ACT}}": fir?.majorAct || "",
    "{{INCIDENT_DATE}}": fir?.incidentDateFrom || todayStr,
    "{{INCIDENT_TIME}}": fir?.incidentTimeFrom || "",
    "{{INCIDENT_PLACE}}": fir?.incidentPlace || "",
    "{{COMPLAINANT_NAME}}": fir?.complainantName || "",
    "{{COMPLAINANT_FATHER}}": fir?.complainantFatherSpouse || "",
    "{{COMPLAINANT_MOBILE}}": fir?.complainantMobile || "",
    "{{COMPLAINANT_ADDRESS}}": fir?.complainantAddress || "",
    "{{ACCUSED_NAME}}": fir?.accusedList?.[0]?.name || "",
    "{{ACCUSED_ADDRESS}}": fir?.accusedList?.[0]?.address || "",
    "{{ACCUSED_PHONE}}": fir?.accusedList?.[0]?.phone || "",
    "{{OFFICER_NAME}}": fir?.assignedIoName || "",
    "{{OFFICER_RANK}}": fir?.assignedIoRank || "",
    "{{OFFICER_BELT_NUMBER}}": fir?.assignedIoBeltNumber || "",
    "{{WITNESS_NAME}}": "",
    "{{CCTNS_FIR_NUMBER}}": fir?.cctnsFirNumber || "",
    "{{GD_ENTRY_NUMBER}}": fir?.gdEntryNumber || "",
    "{{ENQUIRY_LOCATION}}": fir?.policeStation || "",
  };

  if (customValues) {
    for (const [k, v] of Object.entries(customValues)) {
      const tokenKey = k.startsWith("{{") ? k : `{{${k}}}`;
      values[tokenKey] = v;
    }
  }

  for (const [token, val] of Object.entries(values)) {
    const reg = new RegExp(token.replace(/([{}])/g, "\\$1"), "g");
    resolved = resolved.replace(reg, () => val.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  }

  return resolved;
}

function FIRTemplateBuilderContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const templateStorageKey = currentUser?.id ? `${FIR_CUSTOM_TEMPLATES_STORAGE_KEY}:${currentUser.id}` : null;

  const queryFirId = searchParams.get("firId");
  const queryTemplateId = searchParams.get("templateId");

  // State
  const [activeTab, setActiveTab] = useState<"editor" | "my_templates">("editor");
  const [firsList, setFirsList] = useState<FIRItem[]>([]);
  const [selectedFirId, setSelectedFirId] = useState("");
  const selectedFir = firsList.find(fir => fir.id === selectedFirId) || null;

  // Template lists
  const [savedTemplates, setSavedTemplates] = useState<FIRInvestigationTemplate[]>([]);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState("ALL");

  // Editor State
  const editorRef = useRef<HTMLDivElement>(null);
  const operatorReceiptRef = useRef<OperatorReceipt | undefined>(undefined);
  useEffect(() => registerOperatorAdapter({
    id: '/fir-workspace/builder', matches: path => path.split('?')[0] === '/fir-workspace/builder', receipt: () => operatorReceiptRef.current,
  }), []);
  const [editingDefinition, setEditingDefinition] = useState(false);
  const rawTemplateRef = useRef(STANDARD_FIR_INVESTIGATION_TEMPLATES[0].content);
  const [docName, setDocName] = useState("Witness Statement Memo");
  const [docCategory, setDocCategory] = useState("Witness Statement");
  const [docDescription, setDocDescription] = useState("Statement recorded under Section 180 BNSS");
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [libraryError,setLibraryError]=useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  useUnsavedDocument(hasUnsavedChanges);
  const [saveStatus, setSaveStatus] = useState<string>("Ready");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Formatting state
  const [currentFont, setCurrentFont] = useState("Arial");
  const [currentSize, setCurrentSize] = useState("11pt");
  const [textColor, setTextColor] = useState("#000000");
  const [highlightColor, setHighlightColor] = useState("#ffffff");

  // Modals
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const [saveModalDesc, setSaveModalDesc] = useState("");
  const [saveModalCategory, setSaveModalCategory] = useState("General Investigation");

  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const [customTokenModalOpen, setCustomTokenModalOpen] = useState(false);
  const [customTokenName, setCustomTokenName] = useState("");

  // Load FIRs on Mount
  useEffect(() => {
    const refresh = () => setFirsList(firService.getAllFirs());
    refresh();
    return firService.subscribe(refresh);
  }, [currentUser]);

  const linkedFirs = queryFirId ? firsList.filter(fir => fir.id === queryFirId || fir.firNumber === queryFirId) : [];
  const linkedFirId = linkedFirs.length === 1 ? linkedFirs[0].id : "";

  useEffect(() => {
    setSelectedFirId(linkedFirId);
  }, [queryFirId, linkedFirId]);

  // Load Saved Custom Templates from localStorage and API
  const loadSavedTemplates = useCallback(async () => {
    setLibraryError("");
    let localCustom: FIRInvestigationTemplate[] = [];
    try {
      const raw = templateStorageKey ? localStorage.getItem(templateStorageKey) : null;
      if (raw) {
        localCustom = JSON.parse(raw);
      }
    } catch (e) {
      console.warn("Failed to parse local templates", e);
    }

    // Try fetching from API builder service as well
    try {
      const apiTemplates = await BuilderService.getTemplates();
      if (apiTemplates && apiTemplates.length > 0) {
        const converted: FIRInvestigationTemplate[] = apiTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.description?.split(" - ")?.[0] || "Custom Template",
          description: t.description || "",
          content: t.content,
          isCustom: true,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          createdBy: t.createdByName || t.createdBy,
        }));

        // Merge with local without duplicates
        const map = new Map<string, FIRInvestigationTemplate>();
        localCustom.forEach((item) => map.set(item.id, item));
        converted.forEach((item) => map.set(item.id, item));
        localCustom = Array.from(map.values());
      }
    } catch (e) {
      console.warn("BuilderService fetch failed, using local", e);
      setLibraryError("Server template library unavailable. Only locally available templates are shown.");
    }

    setSavedTemplates(localCustom);
  }, [templateStorageKey]);

  useEffect(() => {
    loadSavedTemplates();
  }, [loadSavedTemplates]);

  // Resolve a definition only once the selected FIR has loaded.
  useEffect(() => {
    if (!editorRef.current || !selectedFir) return;
    const initial = STANDARD_FIR_INVESTIGATION_TEMPLATES.find((t) => t.id === queryTemplateId)
      || STANDARD_FIR_INVESTIGATION_TEMPLATES[0];
    if (!currentTemplateId) {
      rawTemplateRef.current = initial.content;
      setDocName(initial.name);
      setDocDescription(initial.description);
      setDocCategory(initial.category);
      setCurrentTemplateId(initial.id);
    }
    editorRef.current.innerHTML = resolveFIRPlaceholders(rawTemplateRef.current, selectedFir);
    setEditingDefinition(false);
    setHasUnsavedChanges(false);
    setSaveStatus("Draft — not saved");
  }, [selectedFir?.id]);

  // When selected FIR changes, prompt to re-resolve placeholders if wanted
  const handleFirChange = (firId: string) => {
    const f = firsList.find((item) => item.id === firId);
    if (!f) return;
    if (hasUnsavedChanges && !confirm("Discard unsaved document changes and switch FIR?")) return;
    setSelectedFirId(f?.id || "");
  };

  const handleApplyFirDataToEditor = () => {
    if (!editorRef.current || !selectedFir) return;
    if (hasUnsavedChanges && !confirm("Regenerate from the template? Unsaved document edits will be replaced.")) return;
    const resolved = resolveFIRPlaceholders(rawTemplateRef.current, selectedFir);
    editorRef.current.innerHTML = resolved;
    setSaveStatus("FIR Data Applied");
    setHasUnsavedChanges(true);
  };

  // Editor Change
  const hindiAutocorrect = useHindiReportAutocorrect(editingDefinition || !["General", "Scene Inspection", "Seizure / Recovery"].includes(docCategory));

  const handleContentChange = () => {
    setHasUnsavedChanges(true);
    setSaveStatus("Unsaved changes");
  };

  // Rich Text Exec Command
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
    const pbHtml = `<div class="page-break my-6 py-2 border-b-2 border-dashed border-slate-300 text-center text-[10px] text-slate-400 font-mono select-none" contenteditable="false">--- [PAGE BREAK / पृष्ठ विभाजन] ---</div><p><br/></p>`;
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
              नाम / Name: ${selectedFir?.assignedIoName || currentUser?.name || "..........................................."}<br/>
              रैंक / Rank: ${selectedFir?.assignedIoRank || currentUser?.rankDisplay || "............................................"}<br/>
              PNO / Belt No: ${selectedFir?.assignedIoBeltNumber || currentUser?.pno || "...................................."}<br/>
              थाना / Police Station: ${selectedFir?.policeStation || "............................"}<br/>
              दिनांक / Date: ${formatDate(new Date())}
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
          const imgHtml = `<div class="my-3 text-center"><img src="${dataUrl}" alt="Crime Scene Photo / Asset" style="max-width: 90%; max-height: 400px; border: 1px solid #cbd5e1; border-radius: 4px; display: inline-block;" /></div><p><br/></p>`;
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
      html += `<th style="border: 1px solid #000; padding: 6px 8px; text-align: center; font-weight: bold;">स्तंभ / Column ${c}</th>`;
    }
    html += `</tr></thead><tbody>`;
    for (let r = 1; r <= tableRows; r++) {
      html += `<tr>`;
      for (let c = 1; c <= tableCols; c++) {
        html += `<td style="border: 1px solid #000; padding: 6px 8px; vertical-align: top;">प्रविष्टि ${r}.${c}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table><p><br/></p>`;
    execCmd("insertHTML", html);
    setTableModalOpen(false);
  };

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

  // Insert Token
  const insertPlaceholderToken = (token: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const tokenHtml = `<span class="cms-placeholder inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-blue-50 text-blue-900 border border-blue-300 select-all" data-placeholder="${token}">${token}</span>&nbsp;`;
    execCmd("insertHTML", tokenHtml);
    setTokenDropdownOpen(false);
  };

  const handleAddCustomToken = () => {
    if (!customTokenName.trim()) return;
    const clean = customTokenName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const token = `{{${clean}}}`;
    insertPlaceholderToken(token);
    setCustomTokenName("");
    setCustomTokenModalOpen(false);
  };

  // ================= SAVE TEMPLATE =================
  const openSaveModal = () => {
    setSaveModalName(docName);
    setSaveModalDesc(docDescription);
    setSaveModalCategory(docCategory);
    setSaveModalOpen(true);
  };

  const handleSaveTemplateSubmit = async () => {
    if (!saveModalName.trim() || !editorRef.current) return;

    // A case-filled document is not a reusable definition. Keep the original tokens.
    if (!editingDefinition) { alert("Open Edit Template Definition to save a reusable template. Case-specific edits belong in the case document."); return; }
    const content = editorRef.current.innerHTML;
    rawTemplateRef.current = content;
    const data = {
      name: saveModalName.trim(),
      description: `${saveModalCategory.trim()} - ${saveModalDesc.trim()}`,
      content,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdByRank: currentUser.rankDisplay,
    };
    let newTemplateId: string;
    try {
      const isServerTemplate = currentTemplateId && !currentTemplateId.startsWith("std_") && !currentTemplateId.startsWith("fir-tpl-");
      const saved = isServerTemplate
        ? await BuilderService.updateTemplate(currentTemplateId!, data)
        : await BuilderService.createTemplate(data);
      newTemplateId = saved.id;
      setCurrentTemplateId(saved.id);
      // Discard only the matching legacy local entry after the server confirms success.
      const remaining = savedTemplates.filter((t) => t.id !== currentTemplateId && t.id.startsWith("fir-tpl-"));
      try { if (templateStorageKey) localStorage.setItem(templateStorageKey, JSON.stringify(remaining)); } catch { /* The server remains authoritative. */ }
      await loadSavedTemplates();
    } catch (error) {
      setSaveStatus("Save failed — changes pending");
      alert("Template could not be saved. Your document remains open; please retry.");
      return;
    }

    setDocName(saveModalName.trim());
    setDocCategory(saveModalCategory.trim());
    setDocDescription(saveModalDesc.trim());
    setCurrentTemplateId(newTemplateId);
    operatorReceiptRef.current = {id:newTemplateId,label:"Template saved",revision:(operatorReceiptRef.current?.revision || 0)+1};
    setSaveStatus("Saved to My Templates");
    setLastSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
    setHasUnsavedChanges(false);
    setSaveModalOpen(false);
  };

  // ================= LOAD & DELETE TEMPLATES =================
  const handleUseTemplate = (tpl: FIRInvestigationTemplate) => {
    if (hasUnsavedChanges && !confirm("आपके पास बिना सहेजे बदलाव हैं। क्या आप नया टेम्पलेट लोड करना चाहते हैं?")) {
      return;
    }
    setCurrentTemplateId(tpl.id);
    setDocName(tpl.name);
    setDocDescription(tpl.description);
    setDocCategory(tpl.category);

    rawTemplateRef.current = tpl.content;
    setEditingDefinition(false);
    const populated = resolveFIRPlaceholders(tpl.content, selectedFir);
    if (editorRef.current) {
      editorRef.current.innerHTML = populated;
    }
    setActiveTab("editor");
    setHasUnsavedChanges(false);
    setSaveStatus("Template Loaded");
  };

  const handleEditTemplateDefinition = (tpl: FIRInvestigationTemplate) => {
    setEditingDefinition(true);
    if (hasUnsavedChanges && !confirm("आपके पास बिना सहेजे बदलाव हैं। क्या आप टेम्पलेट एडिट करना चाहते हैं?")) {
      return;
    }
    setCurrentTemplateId(tpl.id);
    setDocName(tpl.name);
    setDocDescription(tpl.description);
    setDocCategory(tpl.category);

    if (editorRef.current) {
      rawTemplateRef.current = tpl.content;
      editorRef.current.innerHTML = tpl.content; // Load raw without resolving tokens
    }
    setActiveTab("editor");
    setHasUnsavedChanges(false);
    setSaveStatus("Editing Template Definition");
  };

  const handleDuplicateTemplate = (tpl: FIRInvestigationTemplate) => {
    const cloned: FIRInvestigationTemplate = {
      ...tpl,
      id: `fir-tpl-${Date.now()}`,
      name: `${tpl.name} (Copy)`,
      isCustom: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: currentUser?.name || "IO Officer",
    };
    const updated = [cloned, ...savedTemplates];
    setSavedTemplates(updated);
    if (templateStorageKey) localStorage.setItem(templateStorageKey, JSON.stringify(updated));
    alert(`टेम्पलेट की प्रतिलिपि बनाई गई: ${cloned.name}`);
  };

  const handleDeleteTemplate = async (tplId: string, tplName: string) => {
    if (!confirm(`क्या आप निश्चित रूप से टेम्पलेट "${tplName}" को हटाना चाहते हैं?`)) {
      return;
    }
    try {
      if (!tplId.startsWith("fir-tpl-")) await BuilderService.deleteTemplate(tplId);
      const filtered = savedTemplates.filter((t) => t.id !== tplId);
      if (templateStorageKey) localStorage.setItem(templateStorageKey, JSON.stringify(filtered.filter((t) => t.id.startsWith("fir-tpl-"))));
      setSavedTemplates(filtered);
    } catch {
      alert("Template could not be deleted. Please retry.");
      return;
    }

    if (currentTemplateId === tplId) {
      setCurrentTemplateId(null);
    }
  };

  const handleCreateNewBlank = () => {
    if (hasUnsavedChanges && !confirm("क्या आप नए कोरे दस्तावेज़ पर जाना चाहते हैं?")) return;
    setCurrentTemplateId(null);
    setDocName("नया जांच प्रपत्र (New Investigation Document)");
    setDocCategory("General");
    setDocDescription("");
    setEditingDefinition(true);
    rawTemplateRef.current = "";
    if (editorRef.current) editorRef.current.innerHTML = "";
    setActiveTab("editor");
    setHasUnsavedChanges(false);
    setSaveStatus("Blank Document Ready");
  };

  // ================= EXPORT & PRINT =================
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
      printA4Element(editorRef.current, docName || "FIR_Document");
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

  // Filter templates for "My Templates" Tab
  const allDisplayTemplates = [...savedTemplates, ...STANDARD_FIR_INVESTIGATION_TEMPLATES];
  const filteredTemplates = allDisplayTemplates.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.description.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.category.toLowerCase().includes(templateSearch.toLowerCase());

    if (!matchesSearch) return false;
    if (templateCategoryFilter === "ALL") return true;
    if (templateCategoryFilter === "CUSTOM") return t.isCustom === true;
    if (templateCategoryFilter === "STANDARD") return !t.isCustom;
    return t.category.toLowerCase() === templateCategoryFilter.toLowerCase();
  });

  return (
    <div className="space-y-4 animate-in fade-in-50 pb-20">
      {libraryError && <p role="alert" className="p-3 text-sm text-red-700 bg-red-50">{libraryError}<button type="button" className="ml-3 underline" onClick={()=>void loadSavedTemplates()}>Retry</button></p>}
      {/* 1. Sub-navigation tabs */}
      <FIRWorkspaceNav
        firId={selectedFir?.id}
        rightAction={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="text-xs h-8 gap-1.5 border-slate-300 hover:bg-slate-100"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>प्रिंट (Print)</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadWord}
              className="text-xs h-8 gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Word (.doc)</span>
            </Button>
          </div>
        }
      />

      {/* 2. Top Header Bar with FIR Selector & Main Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
                <FileSignature className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span>FIR Investigation Template Builder</span>
                  <Badge variant="info" className="text-[10px] bg-blue-50 text-blue-800 border-blue-200">
                    वर्ड फीचर्स व कस्टम टेम्पलेट्स
                  </Badge>
                </h1>

              </div>
            </div>
          </div>

          {/* Active FIR Selector */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 w-full md:w-auto">
            <span className="text-xs font-bold text-slate-600 shrink-0 px-2 flex items-center gap-1">
              <Scale className="w-3.5 h-3.5 text-red-600" />
              <span>संबद्ध FIR:</span>
            </span>
            <select
              value={selectedFir?.id || ""}
              onChange={(e) => handleFirChange(e.target.value)}
              className="text-xs font-semibold bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-xs"
            >
              <option value="">-- सक्रिय अभियोग (FIR) चुनें --</option>
              {firsList.map((fir) => (
                <option key={fir.id} value={fir.id}>
                  {fir.firNumber} — {fir.complainantName} ({fir.policeStation})
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleApplyFirDataToEditor}
              title="वर्तमान FIR का डेटा एडिटर में भरें"
              className="text-[11px] h-7 px-2 text-blue-700 hover:bg-blue-100"
            >
              डेटा लागू करें
            </Button>
          </div>
        </div>

        {/* Tab Switcher & Status Bar */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-200 pt-3 gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("editor")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "editor"
                  ? "bg-[#0b192c] text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>टेम्पलेट एडिटर (Template Editor)</span>
            </button>

            <button
              onClick={() => setActiveTab("my_templates")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "my_templates"
                  ? "bg-[#0b192c] text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>मेरे टेम्पलेट्स (My Templates)</span>
              <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-900">
                {savedTemplates.length}
              </span>
            </button>
          </div>

          {activeTab === "editor" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${hasUnsavedChanges ? "bg-amber-500" : "bg-emerald-500"}`} />
                <span>{saveStatus}</span>
                {lastSavedAt && <span className="text-[10px] text-slate-400">({lastSavedAt})</span>}
              </span>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCreateNewBlank}
                className="text-xs h-8 border-slate-300 hover:bg-slate-100 gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>कोरा प्रपत्र (Blank)</span>
              </Button>

              <Button type="button" size="sm" variant="outline" onClick={() => {
                if (!editorRef.current) return;
                if (hasUnsavedChanges && !confirm("Switch document mode? Unsaved edits will be replaced.")) return;
                if (editingDefinition) rawTemplateRef.current = editorRef.current.innerHTML;
                editorRef.current.innerHTML = editingDefinition ? resolveFIRPlaceholders(rawTemplateRef.current, selectedFir) : rawTemplateRef.current;
                setEditingDefinition(!editingDefinition);
                setHasUnsavedChanges(false);
              }}>{editingDefinition ? "Preview Case Document" : "Edit Template Definition"}</Button>
              {editingDefinition && (
              <Button
                type="button"
                size="sm"
                data-agent-operation="read"
                onClick={openSaveModal}
                className="text-xs h-8 bg-blue-700 hover:bg-blue-800 text-white gap-1.5 font-bold shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save to My Templates (सहेजें)</span>
              </Button>
              )}
            </div>
          )}

          {activeTab === "my_templates" && (
            <Button
              type="button"
              size="sm"
              onClick={handleCreateNewBlank}
              className="text-xs h-8 bg-blue-700 hover:bg-blue-800 text-white gap-1.5 font-bold shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ नया टेम्पलेट बनाएं</span>
            </Button>
          )}
        </div>
      </div>

      {/* ================= TAB 1: WORD-LIKE TEMPLATE EDITOR ================= */}
      {activeTab === "editor" && (
        <div className="space-y-3">
          {/* Document Header Name input */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2 flex-1 min-w-[260px]">
              <span className="text-xs font-bold text-slate-600 shrink-0">टेम्पलेट नाम:</span>
              <div className="flex items-center gap-1.5 w-full">
                <input
                  type="text"
                  value={docName}
                  onChange={(e) => {
                    setDocName(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="उदा. धारा 180 बीएनएसएस बयान प्रारूप..."
                  className="text-sm font-bold text-slate-900 border border-slate-300 rounded-lg px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <VoiceInputButton
                  onTranscript={(t) => setDocName(t)}
                  currentValue={docName}
                  fieldLabel="टेम्पलेट नाम"
                  iconOnly
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 shrink-0">श्रेणी:</span>
              <select
                value={docCategory}
                onChange={(e) => {
                  setDocCategory(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-slate-50 font-medium text-slate-700"
              >
                <option value="Witness Statement">Witness Statement (बयान गवाहान)</option>
                <option value="Seizure / Recovery">Seizure / Recovery (जब्ती फर्द)</option>
                <option value="Scene Inspection">Scene Inspection (मौका मुआयना)</option>
                <option value="Interrogation Memo">Interrogation Memo (पूछताछ ज्ञापन)</option>
                <option value="Arrest Memo">Arrest Memo (गिरफ्तारी ज्ञापन)</option>
                <option value="General Investigation">General Investigation (सामान्य जांच)</option>
                <option value="Court Application">Court Application (न्यायालय आवेदन)</option>
              </select>
            </div>
          </div>

          {/* MS Word-like Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs flex flex-wrap items-center gap-1.5 text-slate-700 sticky top-2 z-20">
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
            <div className="flex items-center border-r border-slate-200 pr-1.5 mr-0.5">
              <button
                type="button"
                onClick={() => execCmd("undo")}
                title="पूर्ववत करें (Undo - Ctrl+Z)"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCmd("redo")}
                title="फिर से करें (Redo - Ctrl+Y)"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            {/* Font Family */}
            <select
              value={currentFont}
              onChange={(e) => handleFontChange(e.target.value)}
              className="text-xs font-medium border border-slate-300 rounded px-2 py-1 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 w-32"
            >
              <option value="Arial">Arial</option>
              <option value="'Nirmala UI', Arial, sans-serif">Nirmala UI (हिंदी/English)</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="Calibri, sans-serif">Calibri</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="'Courier New', monospace">Courier New</option>
              <option value="Mangal, sans-serif">Mangal (हिंदी देवनागरी)</option>
            </select>

            {/* Font Size */}
            <select
              value={currentSize}
              onChange={(e) => handleFontSizeChange(e.target.value)}
              className="text-xs font-medium border border-slate-300 rounded px-1.5 py-1 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 w-16"
            >
              <option value="9pt">9pt</option>
              <option value="10pt">10pt</option>
              <option value="11pt">11pt</option>
              <option value="12pt">12pt</option>
              <option value="13pt">13pt</option>
              <option value="14pt">14pt</option>
              <option value="16pt">16pt</option>
              <option value="18pt">18pt</option>
              <option value="20pt">20pt</option>
              <option value="24pt">24pt</option>
            </select>

            {/* Headings */}
            <select
              onChange={(e) => {
                if (e.target.value) insertHeading(e.target.value as any);
                e.target.value = "";
              }}
              defaultValue=""
              className="text-xs font-medium border border-slate-300 rounded px-2 py-1 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="" disabled>शीर्षक (Headings)</option>
              <option value="h1">Heading 1 (बड़ा शीर्षक)</option>
              <option value="h2">Heading 2 (मध्यम शीर्षक)</option>
              <option value="h3">Heading 3 (उप-शीर्षक)</option>
              <option value="p">सामान्य पैराग्राफ (Normal)</option>
            </select>

            {/* Basic Formatting */}
            <div className="flex items-center border-l border-r border-slate-200 px-1.5">
              <button
                type="button"
                onClick={() => execCmd("bold")}
                title="Bold (Ctrl+B)"
                className="p-1.5 rounded hover:bg-slate-100 font-bold text-slate-800"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCmd("italic")}
                title="Italic (Ctrl+I)"
                className="p-1.5 rounded hover:bg-slate-100 italic text-slate-800"
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCmd("underline")}
                title="Underline (Ctrl+U)"
                className="p-1.5 rounded hover:bg-slate-100 underline text-slate-800"
              >
                <Underline className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCmd("strikeThrough")}
                title="Strikethrough"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
              >
                <Strikethrough className="w-4 h-4" />
              </button>
            </div>

            {/* Text Color & Highlight */}
            <div className="flex items-center gap-1 border-r border-slate-200 pr-1.5">
              <label title="Text Color" className="flex items-center gap-0.5 cursor-pointer p-1 rounded hover:bg-slate-100">
                <span className="text-xs font-bold underline" style={{ color: textColor }}>A</span>
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => handleTextColor(e.target.value)}
                  className="w-4 h-4 p-0 border-0 cursor-pointer opacity-0 absolute"
                />
              </label>

              <label title="Highlight Color" className="flex items-center gap-0.5 cursor-pointer p-1 rounded hover:bg-slate-100">
                <span className="text-xs px-1 rounded font-bold" style={{ backgroundColor: highlightColor === "#ffffff" ? "#fef08a" : highlightColor }}>H</span>
                <input
                  type="color"
                  value={highlightColor}
                  onChange={(e) => handleHighlightColor(e.target.value)}
                  className="w-4 h-4 p-0 border-0 cursor-pointer opacity-0 absolute"
                />
              </label>
            </div>

            {/* Alignment */}
            <div className="flex items-center border-r border-slate-200 pr-1.5">
              <button
                type="button"
                onClick={() => execCmd("justifyLeft")}
                title="Align Left"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
              >
                <AlignLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCmd("justifyCenter")}
                title="Align Center"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
              >
                <AlignCenter className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCmd("justifyRight")}
                title="Align Right"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
              >
                <AlignRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCmd("justifyFull")}
                title="Justify"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
              >
                <AlignJustify className="w-4 h-4" />
              </button>
            </div>

            {/* Lists & Indent */}
            <div className="flex items-center border-r border-slate-200 pr-1.5">
              <button
                type="button"
                onClick={() => execCmd("insertUnorderedList")}
                title="बुलेट सूची (Bullet List)"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCmd("insertOrderedList")}
                title="क्रमांकित सूची (Numbered List)"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
              >
                <ListOrdered className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCmd("outdent")}
                title="Outdent"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
              >
                <Outdent className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCmd("indent")}
                title="Indent"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
              >
                <Indent className="w-4 h-4" />
              </button>
            </div>

            {/* Tables & Structure */}
            <div className="flex items-center gap-1 border-r border-slate-200 pr-1.5">
              <button
                type="button"
                onClick={() => setTableModalOpen(true)}
                title="तालिका डालें (Insert Table)"
                className="px-2 py-1 rounded text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1"
              >
                <TableIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>तालिका</span>
              </button>

              <button
                type="button"
                onClick={addTableRow}
                title="तालिका में पंक्ति जोड़ें (+ Row)"
                className="px-1.5 py-1 rounded text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                + पं
              </button>
              <button
                type="button"
                onClick={deleteTableRow}
                title="पंक्ति हटाएं (- Row)"
                className="px-1.5 py-1 rounded text-[11px] font-bold bg-slate-100 hover:bg-red-50 text-red-600"
              >
                - पं
              </button>
              <button
                type="button"
                onClick={addTableCol}
                title="तालिका में स्तंभ जोड़ें (+ Col)"
                className="px-1.5 py-1 rounded text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                + स्त
              </button>
              <button
                type="button"
                onClick={deleteTableCol}
                title="स्तंभ हटाएं (- Col)"
                className="px-1.5 py-1 rounded text-[11px] font-bold bg-slate-100 hover:bg-red-50 text-red-600"
              >
                - स्त
              </button>
            </div>

            {/* Special Inserters */}
            <div className="flex items-center gap-1 border-r border-slate-200 pr-1.5">
              <button
                type="button"
                onClick={insertCheckbox}
                title="चेकबॉक्स डालें (Checklist Item)"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
              >
                <CheckSquare className="w-4 h-4 text-emerald-600" />
              </button>
              <button
                type="button"
                onClick={insertHorizontalLine}
                title="क्षैतिज रेखा (Horizontal Divider)"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={insertPageBreak}
                title="पृष्ठ विभाजन (Page Break for Print)"
                className="px-1.5 py-1 rounded text-[10px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                [पृष्ठ ब्रेक]
              </button>
              <button
                type="button"
                onClick={insertSignatureArea}
                title="हस्ताक्षर ब्लॉक डालें (IO Signature Area)"
                className="px-2 py-1 rounded text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1"
              >
                <span>हस्ताक्षर ब्लॉक</span>
              </button>
              <button
                type="button"
                onClick={insertImage}
                title="तस्वीर / फोटो डालें (Insert Image)"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
              >
                <ImageIcon className="w-4 h-4 text-blue-600" />
              </button>
            </div>

            {/* Voice Dictation (बोलकर टाइप करें) */}
            <div className="border-r border-slate-200 pr-1.5 flex items-center">
              <VoiceInputButton
                onTranscript={(text) => {
                  if (editorRef.current) {
                    editorRef.current.focus();
                    document.execCommand("insertText", false, text + " ");
                    handleContentChange();
                  }
                }}
                fieldLabel="बोलकर टाइप करें (Voice Dictation)"
                preferredLang="hi-IN"
              />
            </div>

            {/* Dynamic Placeholder Tokens Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setTokenDropdownOpen(!tokenDropdownOpen)}
                className="px-2.5 py-1 rounded text-xs font-bold bg-blue-50 text-blue-800 border border-blue-300 hover:bg-blue-100 flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>FIR टोकन डालें (Tokens)</span>
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {tokenDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-300 rounded-xl shadow-xl z-50 p-2 text-xs space-y-2 max-h-96 overflow-y-auto animate-in fade-in-50">
                  <div className="font-bold text-slate-700 pb-1 border-b border-slate-100 flex items-center justify-between">
                    <span>अनुसंधान टोकन (Placeholders)</span>
                    <button
                      onClick={() => setTokenDropdownOpen(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">मुकदमा व थाना (Case Details)</p>
                    <button
                      onClick={() => insertPlaceholderToken("{{FIR_NUMBER}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{FIR_NUMBER}}"}</span>
                      <span className="text-slate-500">मुकदमा नंबर</span>
                    </button>
                    <button
                      onClick={() => insertPlaceholderToken("{{POLICE_STATION}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{POLICE_STATION}}"}</span>
                      <span className="text-slate-500">थाना नाम</span>
                    </button>
                    <button
                      onClick={() => insertPlaceholderToken("{{DISTRICT}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{DISTRICT}}"}</span>
                      <span className="text-slate-500">जिला</span>
                    </button>
                    <button
                      onClick={() => insertPlaceholderToken("{{ACTS_AND_SECTIONS}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{ACTS_AND_SECTIONS}}"}</span>
                      <span className="text-slate-500">धाराएं</span>
                    </button>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">वादी व अभियुक्त (Parties)</p>
                    <button
                      onClick={() => insertPlaceholderToken("{{COMPLAINANT_NAME}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{COMPLAINANT_NAME}}"}</span>
                      <span className="text-slate-500">शिकायतकर्ता नाम</span>
                    </button>
                    <button
                      onClick={() => insertPlaceholderToken("{{COMPLAINANT_ADDRESS}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{COMPLAINANT_ADDRESS}}"}</span>
                      <span className="text-slate-500">शिकायतकर्ता पता</span>
                    </button>
                    <button
                      onClick={() => insertPlaceholderToken("{{ACCUSED_NAME}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{ACCUSED_NAME}}"}</span>
                      <span className="text-slate-500">आरोपी / अभियुक्त</span>
                    </button>
                    <button
                      onClick={() => insertPlaceholderToken("{{ACCUSED_ADDRESS}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{ACCUSED_ADDRESS}}"}</span>
                      <span className="text-slate-500">अभियुक्त पता</span>
                    </button>
                    <button
                      onClick={() => insertPlaceholderToken("{{WITNESS_NAME}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{WITNESS_NAME}}"}</span>
                      <span className="text-slate-500">गवाह का नाम</span>
                    </button>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">घटना व अधिकारी (Spot & Officer)</p>
                    <button
                      onClick={() => insertPlaceholderToken("{{INCIDENT_DATE}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{INCIDENT_DATE}}"}</span>
                      <span className="text-slate-500">घटना दिनांक</span>
                    </button>
                    <button
                      onClick={() => insertPlaceholderToken("{{INCIDENT_PLACE}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{INCIDENT_PLACE}}"}</span>
                      <span className="text-slate-500">घटना स्थल</span>
                    </button>
                    <button
                      onClick={() => insertPlaceholderToken("{{OFFICER_NAME}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{OFFICER_NAME}}"}</span>
                      <span className="text-slate-500">IO अधिकारी नाम</span>
                    </button>
                    <button
                      onClick={() => insertPlaceholderToken("{{OFFICER_RANK}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{OFFICER_RANK}}"}</span>
                      <span className="text-slate-500">IO पद / रैंक</span>
                    </button>
                    <button
                      onClick={() => insertPlaceholderToken("{{DATE}}")}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 flex justify-between"
                    >
                      <span className="font-mono text-blue-700">{"{{DATE}}"}</span>
                      <span className="text-slate-500">वर्तमान दिनांक</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setTokenDropdownOpen(false);
                        setCustomTokenModalOpen(true);
                      }}
                      className="w-full text-center py-1 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
                    >
                      + कस्टम टोकन बनाएं
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Clear Formatting */}
            <button
              type="button"
              onClick={() => execCmd("removeFormat")}
              title="फॉर्मेटिंग हटाएं (Clear Formatting)"
              className="p-1.5 rounded hover:bg-slate-100 text-slate-500 ml-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Preset Templates Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="font-bold text-slate-600 shrink-0 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>मानक प्रारूप (Quick Templates):</span>
            </span>
            {STANDARD_FIR_INVESTIGATION_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleUseTemplate(tpl)}
                className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                  currentTemplateId === tpl.id
                    ? "bg-blue-100 text-blue-900 border-blue-400 font-bold"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {tpl.name.split(" - ")[0]}
              </button>
            ))}
          </div>

          {/* Editor Paper Canvas (A4 Simulated Page) */}
          <div className="bg-slate-200/60 p-4 md:p-8 rounded-xl flex justify-center overflow-x-auto min-h-[700px]">
            <div
              ref={editorRef}
              aria-label="Document body"
              contentEditable
              onInput={(event) => {
                hindiAutocorrect.onInput(event);
                handleContentChange();
              }}
              className="bg-white text-slate-900 shadow-md p-8 md:p-14 min-h-[1050px] w-full max-w-[850px] outline-none rounded-sm border border-slate-300 transition-shadow focus:shadow-lg"
              style={{
                fontFamily: currentFont,
                fontSize: currentSize,
                lineHeight: "1.6",
              }}
              suppressContentEditableWarning
            />
          </div>
        </div>
      )}

      {/* ================= TAB 2: MY TEMPLATES (मेरे टेम्पलेट्स) ================= */}
      {activeTab === "my_templates" && (
        <div className="space-y-4">
          {/* Search & Category Filter */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder={t("टेम्पलेट नाम, धारा या विवरण से खोजें...", "Search by template name, section, or description")}
                className="w-full text-xs font-medium border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-500">फ़िल्टर:</span>
              <button
                onClick={() => setTemplateCategoryFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  templateCategoryFilter === "ALL"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                सभी ({allDisplayTemplates.length})
              </button>
              <button
                onClick={() => setTemplateCategoryFilter("CUSTOM")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  templateCategoryFilter === "CUSTOM"
                    ? "bg-blue-700 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                मेरे सहेजे गए ({savedTemplates.length})
              </button>
              <button
                onClick={() => setTemplateCategoryFilter("STANDARD")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  templateCategoryFilter === "STANDARD"
                    ? "bg-purple-700 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                स्टैंडर्ड प्रारूप ({STANDARD_FIR_INVESTIGATION_TEMPLATES.length})
              </button>
            </div>
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((tpl) => (
              <Card
                key={tpl.id}
                className={`border transition-all hover:shadow-md bg-white flex flex-col justify-between ${
                  tpl.isCustom
                    ? "border-blue-200 hover:border-blue-400"
                    : "border-slate-200 hover:border-purple-300"
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-slate-900 text-sm tracking-tight leading-snug">
                        {tpl.name}
                      </h3>
                      {tpl.isCustom ? (
                        <Badge className="bg-blue-100 text-blue-900 hover:bg-blue-100 border-blue-200 text-[10px] shrink-0">
                          कस्टम टेम्पलेट
                        </Badge>
                      ) : (
                        <Badge variant="neutral" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px] shrink-0">
                          मानक प्रारूप
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                      {tpl.description || "अनुसंधान अधिकारी द्वारा सहेजा गया कस्टम कानूनी प्रपत्र।"}
                    </p>

                    <div className="flex items-center gap-2 mt-3 text-[11px] text-slate-400 font-medium">
                      <span>श्रेणी: <strong className="text-slate-600">{tpl.category}</strong></span>
                      {tpl.createdAt && (
                        <span>• {formatDate(tpl.createdAt)}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-1 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleUseTemplate(tpl)}
                        className="text-xs h-7 bg-blue-700 hover:bg-blue-800 text-white font-bold gap-1 px-2.5"
                      >
                        <Eye className="w-3 h-3" />
                        <span>उपयोग करें (Use)</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditTemplateDefinition(tpl)}
                        title="टेम्पलेट प्रारूप संपादित करें"
                        className="text-xs h-7 border-slate-300 text-slate-700 hover:bg-slate-100 px-2"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>एडिट</span>
                      </Button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDuplicateTemplate(tpl)}
                        title="प्रतिलिपि बनाएं (Duplicate)"
                        className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {tpl.isCustom && (
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(tpl.id, tpl.name)}
                          title="हटाएं (Delete Template)"
                          className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredTemplates.length === 0 && (
              <div className="col-span-full bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-2">
                <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="font-bold text-slate-700 text-sm">कोई टेम्पलेट नहीं मिला</h4>
                <p className="text-xs text-slate-500">
                  खोज मापदंड बदलें या ऊपर दिए गए बटन से नया टेम्पलेट बनाएं।
                </p>
                <Button
                  size="sm"
                  onClick={handleCreateNewBlank}
                  className="mt-2 text-xs bg-blue-700 hover:bg-blue-800 text-white font-bold"
                >
                  + नया टेम्पलेट बनाएं
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: SAVE TO MY TEMPLATES ================= */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-blue-600" />
                <span>Save to My Templates (टेम्पलेट सहेजें)</span>
              </h3>
              <button
                onClick={() => setSaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  टेम्पलेट का नाम (Template Name) *
                </label>
                <input
                  type="text"
                  value={saveModalName}
                  onChange={(e) => setSaveModalName(e.target.value)}
                  placeholder="उदा. धारा 180 बीएनएसएस बयान, चोरी जब्ती फर्द..."
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  श्रेणी (Category)
                </label>
                <select
                  value={saveModalCategory}
                  onChange={(e) => setSaveModalCategory(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 bg-slate-50 font-medium text-slate-800"
                >
                  <option value="Witness Statement">Witness Statement (बयान गवाहान)</option>
                  <option value="Seizure / Recovery">Seizure / Recovery (जब्ती फर्द)</option>
                  <option value="Scene Inspection">Scene Inspection (मौका मुआयना)</option>
                  <option value="Interrogation Memo">Interrogation Memo (पूछताछ ज्ञापन)</option>
                  <option value="Arrest Memo">Arrest Memo (गिरफ्तारी ज्ञापन)</option>
                  <option value="General Investigation">General Investigation (सामान्य जांच)</option>
                  <option value="Court Application">Court Application (न्यायालय आवेदन)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  संक्षिप्त विवरण (Description)
                </label>
                <textarea
                  value={saveModalDesc}
                  onChange={(e) => setSaveModalDesc(e.target.value)}
                  rows={3}
                  placeholder="इस टेम्पलेट का उद्देश्य व उपयोग के निर्देश..."
                  className="w-full border border-slate-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-blue-900 text-[11px] space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-blue-700" />
                  <span>यह टेम्पलेट "My Templates" टैब में सुरक्षित रहेगा।</span>
                </p>
                <p className="text-blue-700">
                  आप भविष्य में किसी भी FIR में इस टेम्पलेट को लोड करके एक क्लिक में उपयोग कर सकेंगे।
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSaveModalOpen(false)}
                className="text-xs"
              >
                रद्द करें
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveTemplateSubmit}
                disabled={!saveModalName.trim()}
                className="text-xs bg-blue-700 hover:bg-blue-800 text-white font-bold"
              >
                सहेजें (Save)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: INSERT TABLE ================= */}
      {tableModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-sm w-full p-5 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-blue-600" />
                <span>तालिका डालें (Insert Table)</span>
              </h3>
              <button
                onClick={() => setTableModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  पंक्तियाँ (Rows)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={tableRows}
                  onChange={(e) => setTableRows(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  स्तंभ (Columns)
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={tableCols}
                  onChange={(e) => setTableCols(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTableModalOpen(false)}
                className="text-xs"
              >
                रद्द करें
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={insertTable}
                className="text-xs bg-blue-700 hover:bg-blue-800 text-white font-bold"
              >
                तालिका डालें
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREATE CUSTOM TOKEN ================= */}
      {customTokenModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-sm w-full p-5 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>कस्टम टोकन बनाएं (Custom Placeholder)</span>
              </h3>
              <button
                onClick={() => setCustomTokenModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  टोकन का नाम / वैरिएबल
                </label>
                <input
                  type="text"
                  value={customTokenName}
                  onChange={(e) => setCustomTokenName(e.target.value)}
                  placeholder="उदा. VEHICLE_NUMBER या PROPERTY_VALUE"
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  यह <code className="bg-slate-100 px-1 rounded font-bold">{"{{" + (customTokenName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_") || "VARIABLE") + "}}"}</code> के रूप में एडिटर में दर्ज होगा।
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCustomTokenModalOpen(false)}
                className="text-xs"
              >
                रद्द करें
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAddCustomToken}
                disabled={!customTokenName.trim()}
                className="text-xs bg-blue-700 hover:bg-blue-800 text-white font-bold"
              >
                टोकन जोड़ें
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FIRTemplateBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-slate-500">
          लोड हो रहा है (Loading FIR Template Builder)...
        </div>
      }
    >
      <FIRTemplateBuilderContent />
    </Suspense>
  );
}
