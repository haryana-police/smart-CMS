import { z } from "zod";

export const complaintRegistrationSchema = z.object({
  source: z.enum([
    "WALK_IN_STATION",
    "CM_WINDOW_HARYANA",
    "CITIZEN_PORTAL_HARPATH",
    "EMERGENCY_112",
    "SP_OFFICE_REFERENCE",
    "POSTAL_APPLICATION",
  ]),
  category: z.enum([
    "CYBER_CRIME",
    "PROPERTY_THEFT_BURGLARY",
    "FINANCIAL_FRAUD_CHEATING",
    "LAND_PROPERTY_DISPUTE",
    "PHYSICAL_ASSAULT_AFFRAY",
    "DOMESTIC_VIOLENCE_DOWRY",
    "PUBLIC_NUISANCE",
    "MISSING_PERSON",
    "NARCOTICS_DRUGS_INFO",
    "HARASSMENT_STALKING",
    "OTHER_GENERAL",
  ]),
  subCategory: z.string().max(120).optional(),
  priority: z.enum(["ROUTINE", "URGENT", "CRITICAL_SENSITIVE", "CM_WINDOW_VIP"]),
  
  // Incident Info
  incidentDate: z.string().min(1, "Incident date is required"),
  incidentTime: z.string().optional(),
  isIncidentDateTimeKnown: z.boolean().optional(),
  incidentPlace: z.string().min(3, "Incident location is required"),
  incidentLandmark: z.string().optional(),
  incidentDetails: z.string().optional(),
    
  // Complainant Details
  complainantName: z.string().min(2, "Complainant name is required"),
  complainantRelationType: z.preprocess(value => typeof value === "string" ? value.trim().toUpperCase() || undefined : value, z.enum(["S/O", "D/O", "W/O", "C/O"], { error: "Select a valid relation or leave it blank." }).optional()),
  complainantRelativeName: z.string().optional(),
  complainantFatherSpouse: z.string().optional(),
  complainantGender: z.enum(["MALE", "FEMALE", "TRANSGENDER", "OTHER"]).optional().default("MALE"),
  complainantNationality: z.string().optional(),
  complainantAge: z.coerce.number().min(10).max(120).optional(),
  complainantMobile: z
    .string()
    .min(5, "Please enter a valid mobile number"),
  complainantAltPhone: z.string().optional(),
  complainantAddress: z.string().min(3, "Complete address is required"),
  complainantCity: z.string().min(2, "City / Town is required"),
  complainantDistrict: z.string().min(2, "District is required"),
  complainantState: z.string().optional(),
  complainantCountry: z.string().optional(),
  isPermanentSameAsPresent: z.boolean().optional(),
  complainantPermanentAddress: z.string().optional(),
  complainantPermanentCity: z.string().optional(),
  complainantPermanentDistrict: z.string().optional(),
  complainantPermanentState: z.string().optional(),
  complainantPermanentCountry: z.string().optional(),
  additionalComplainants: z.array(z.any()).optional(),

  // 4. Complaint Details
  intakeMode: z.string().optional(),
  complaintSubject: z.string().optional(),
  subject: z.string().optional(),
  complaintDescription: z.string().optional(),
  isFirRegistered: z.boolean().optional(),
  firNumber: z.string().optional(),
  firDate: z.string().optional(),
  complaintAgeType: z.enum(["FRESH", "OLD"]).optional(),
  complaintClassification: z.string().optional(),
  complaintPurpose: z.string().optional(),
  directSendToFir: z.boolean().optional(),
  directSendToFirChoice: z.enum(["YES", "NO"]).optional(),
  
  // Accused / Suspects
  isAccusedKnown: z.boolean().optional(),
  accusedList: z.array(z.any()).optional(),
  accusedName: z.string().optional(),
  accusedFatherName: z.string().optional(),
  accusedAddress: z.string().optional(),
  accusedPhone: z.string().optional(),
  relationWithComplainant: z.string().optional(),
  fivePNumber: z.string().optional(),
  officeReferenceNumber: z.string().optional(),
  sourceOffice: z.string().optional(),
  linkedComplaintNumber: z.string().optional(),
  isCrossComplaint: z.boolean().optional(),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        size: z.number(),
        type: z.string(),
        category: z.enum(["document", "video", "audio", "image", "other"]),
        dataUrl: z.string().optional(),
        uploadedAt: z.string(),
        description: z.string().optional(),
      })
    )
    .optional(),
});

export type ComplaintRegistrationInput = z.infer<typeof complaintRegistrationSchema>;
