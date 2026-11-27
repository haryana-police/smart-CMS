/**
 * Roznamcha (General Diary) Auto-Suggest Engine
 * ----------------------------------------------------
 * Inline "ghost text" prediction, modelled exactly on the Android Google Keyboard
 * (Gboard) suggestion strip:
 *
 *  1. Every TAB press accepts exactly ONE small fragment - not the whole sentence.
 *     Sequence example:
 *       empty field   TAB -> "At "
 *       TAB           -> "a general occurrence took place at "
 *       TAB           -> "and the same was reported to the Station House Officer by "
 *  2. The accepted fragment is written into the field for real, so the officer can
 *     edit it, keep typing over it, or ignore it.
 *  3. If the officer types anything else, THEIR word wins - the ghost text updates
 *     to match what they actually typed.
 *  4. ESC dismisses the current prediction.
 *
 * A "fragment" is the unit of acceptance. Long sentences are stored as ordered
 * fragment lists so TAB can walk through them piece by piece.
 *
 * This module is pure (no React) so it stays unit-testable.
 *
 * v2 (Gboard-style strip): the engine now returns RANKED CANDIDATES via
 * getGDSuggestions() - prefix + fuzzy (typo-tolerant) word completions,
 * mined next-word predictions, personal-dictionary phrases, and English
 * AND Hindi openers - re-ranked live by learned accept/reject weights.
 *
 * NOTE: Devanagari text below uses \uXXXX escapes on purpose. The tooling used to
 * edit this file does not write UTF-8 safely, and raw Devanagari literals get
 * corrupted (mojibake) when written that way. The escapes guarantee correctness.
 */

export type SuggestionSource =
  | "opening"
  | "chain"
  | "word"
  | "phrase"
  | "next"
  | "dict";

export interface GDSuggestion {
  /** The fragment that TAB will insert. */
  text: string;
  /**
   * How many trailing characters of the current field value must be replaced.
   * 0 -> pure insertion at the caret.
   */
  replaceLength: number;
  source: SuggestionSource;
  /**
   * Index of the sequence that produced this fragment. The UI feeds this back on
   * the next keystroke so TAB can continue to the following fragment.
   * -1 when the prediction did not come from a sequence.
   */
  sequenceIndex: number;
  /**
   * Stable learning key fed back to the telemetry store on accept/reject.
   * Either `seq:<sequence-id>` (openers/continuations) or the normalized
   * token itself (word/dict/next suggestions).
   */
  key: string;
}

/* --------------------------------------------------------------------------
 *  Police vocabulary - single words
 * ----------------------------------------------------------------------- */

const WORD_BANK: string[] = [
  // Hindi core
  "\u092a\u094d\u0930\u092d\u093e\u0930\u0940", // prabhari (SHO)
  "\u0925\u093e\u0928\u093e", // thana (station)
  "\u0928\u093f\u0930\u0940\u0915\u094d\u0937\u0923", // nirikshan (inspection)
  "\u0924\u0932\u093e\u0936", // talash (search)
  "\u092a\u094d\u0930\u0924:", // prat: (verified)
  "\u092a\u0941\u0932\u093f\u0938", // police
  "\u0915\u0930\u094d\u092e\u091a\u093e\u0930\u0940", // karmchari (staff)
  "\u0917\u0936\u094d\u0924", // gashth (patrol)
  "\u0930\u093f\u092a\u094b\u0930\u094d\u091f", // report
  "\u0936\u093f\u0915\u093e\u092f\u0924", // shikayat (complaint)
  "\u092e\u0941\u0939\u0930\u094d\u0930\u092e", // muhrram
  "\u092e\u093e\u0932\u0916\u093e\u0928\u093e", // malkhana
  "\u0917\u093f\u0930\u092b\u094d\u0924\u093e\u0930\u0940", // girdaftari (arrest)
  "\u0935\u093e\u0939\u0928", // vahan (vehicle)
  "\u0917\u094b\u0932\u0940", // goli (ammunition)
  "\u0906\u0930\u094b\u092a", // arop (accusation)
  "\u0938\u093e\u0915\u094d\u0937\u094d\u092f", // sakshy (evidence)
  "\u0905\u092d\u093f\u092f\u0941\u0915\u094d\u0924", // abhiyukt (accused)
  "\u092a\u0940\u0921\u093f\u0924", // peedit (victim)
  "\u092a\u094d\u0930\u093e\u0925\u093e\u092e\u093f\u0915\u0940", // prathamiki (FIR)
  "\u0917\u0935\u093e\u0939", // gavah (witness)
  "\u091c\u093e\u0901\u091a", // jaanch (investigation)
  "\u092c\u0941\u0932\u0947\u091f\u093f\u0928", // bulletin
  "\u0938\u094d\u092a\u0947\u0938", // spot / nakka
  "\u092a\u0930\u093f\u0935\u0947\u0936\u0928", // parishthan (leave)
  "\u0939\u093f\u0926\u093e\u090f", // hidae (confession)
  "\u0907\u0915\u094d\u0915\u0930", // ikkar (interrogation)
  "\u092e\u0941\u0916\u094d\u092f", // mukhya (chief)
  "\u0905\u0928\u0941\u0936\u093e\u0938\u0928", // anusasan (search warrant)
  "\u092a\u094d\u0930\u093e\u0930\u094d\u0925\u0940", // prarthi
  "\u0924\u0939\u0930\u0940\u0930", // tehreer
  "\u0935\u093f\u0935\u0947\u091a\u0928\u093e", // vivechna
  "\u092c\u0930\u093e\u092e\u0926\u0917\u0940", // baramadgi
  "\u0928\u0915\u094d\u0936\u093e", // naksha
  "\u0905\u0938\u094d\u092a\u0924\u093e\u0932", // aspatal
  "\u091a\u094b\u091f\u093f\u0932", // chotil
  "\u092b\u0930\u093e\u0930", // farar
  "\u0926\u092c\u093f\u0936", // dabish
  "\u092a\u0902\u091a\u0928\u093e\u092e\u093e", // panchnama
  "\u092c\u0940\u090f\u0928\u090f\u0938", // BNS
  "\u092c\u0940\u090f\u0928\u090f\u0938\u090f\u0938", // BNSS
  "\u0927\u093e\u0930\u093e", // dhara
  "\u0935\u093f\u0932\u0902\u092c", // vilamb
  // English core
  "Patrol",
  "Raiding",
  "Verification",
  "Complaint",
  "Register",
  "Seizure",
  "Malkhana",
  "Arrest",
  "Vehicle",
  "Arms",
  "Ammunition",
  "Duty",
  "Officer",
  "Constable",
  "Inspector",
  "Station",
  "FIR",
  "Magistrate",
  "Search",
  "Investigation",
  "Report",
  "Statement",
  "Witness",
  "Accused",
  "Victim",
  "Domination",
  "Round",
  "Shift",
  "Relief",
  "BULLETIN",
  "Spot",
  "Snapshot",
  "Inquest",
  "Panchayat",
  "Notice",
  "Summons",
  "Remand",
  "BNS",
  "BNSS",
  "BSA",
  "IPC",
  "CrPC",
  "Complainant",
  "Informant",
  "Hospitalization",
  "Medical",
  "Assault",
  "Threat",
  "Delay",
  "Zimni",
  "Chargesheet",
  "Absconding",
  "Recovery",
  "Fard",
  "Tehreer",

  /* --------------------------------------------------------------
   *  Land & civil vocabulary - harvested from scanned land/civil
   *  petitions (the "zameeni" / "deewani" matter documents officers
   *  transcribe into complaint narratives).
   * ------------------------------------------------------------ */
  // English - land & civil
  "Land Dispute",
  "Civil Suit",
  "Civil Case",
  "Khasra",
  "Khatauni",
  "Sale Deed",
  "Possession",
  "Encroachment",
  "Mutation",
  "Demarcation",
  "Tehsil",
  "Patwari",
  "Revenue Record",
  "Land Record",
  "Court",
  "Plaintiff",
  "Defendant",
  "Judgment",
  "Decree",
  "Affidavit",
  "Settlement",
  "Registry",
  "Lease",
  "Rent",
  "Boundary",
  "Survey",
  // Hindi - land & civil (escapes, see header NOTE)
  "\u092d\u0942\u092e\u093f", // bhumi (land)
  "\u092d\u0942\u092e\u093f \u0935\u093f\u0935\u093e\u0926", // bhumi vivad
  "\u0926\u0940\u0935\u093e\u0928\u0940 \u092e\u093e\u092e\u0932\u093e", // deewani mamla
  "\u0916\u0938\u0930\u093e", // khasra
  "\u0916\u0924\u094c\u0928\u0940", // khatauni
  "\u092c\u0948\u0928\u093e\u092e\u093e", // bainama
  "\u092a\u091f\u094d\u091f\u093e", // patta
  "\u0915\u092c\u094d\u091c\u093e", // kabja
  "\u0930\u0915\u092c\u093e", // rakba
  "\u0939\u0926\u092c\u0902\u0926\u0940", // hadbandi
  "\u0928\u093e\u0932\u093e", // nala
  "\u0924\u0939\u0938\u0940\u0932", // tehsil
  "\u092a\u091f\u0935\u093e\u0930\u0940", // patwari
  "\u0930\u093e\u091c\u0938\u094d\u0935", // rajsva (revenue)
  "\u0928\u094d\u092f\u093e\u092f\u093e\u0932\u092f", // nyayalay (court)
  "\u0935\u093e\u0926", // vad (suit)
  "\u0935\u093e\u0926\u0940", // vadi (plaintiff)
  "\u092a\u094d\u0930\u0924\u093f\u0935\u093e\u0926\u0940", // prativadi (defendant)
  "\u092e\u0941\u0915\u0926\u092e\u093e", // mukadma (lawsuit)
  "\u0938\u092e\u091d\u094c\u0924\u093e", // samjhauta (settlement)
  "\u0936\u092a\u0925 \u092a\u0924\u094d\u0930", // shapat patra (affidavit)
  "\u092b\u0948\u0938\u0932\u093e", // faisla (judgment)
  "\u0921\u093f\u0915\u094d\u0930\u0940", // decree
  "\u0915\u094b\u0930\u094d\u091f", // court
  "\u091c\u092e\u0940\u0928", // zameen (land)
  "\u0935\u093f\u0935\u093e\u0926", // vivad (dispute)
  "\u0916\u0947\u0924", // khet (field)
  "\u0905\u0924\u093f\u0915\u094d\u0930\u092e\u0923", // atikraman (encroachment)
  "\u0938\u0941\u0932\u0939", // sulha (compromise)
  "\u0926\u093e\u0935\u093e", // dava (claim)
  "\u0930\u091c\u093f\u0938\u094d\u091f\u094d\u0930\u0940", // registry
  "\u0915\u093f\u0930\u093e\u092f\u093e", // kiraya (rent)
  "\u092e\u093e\u0932\u093f\u0915", // malik (owner)
  "\u0938\u0940\u092e\u093e", // sima (boundary)
  "\u0917\u093f\u0930\u0926\u093e\u0935\u0930\u0940", // girdavari (survey)
  "\u0939\u0938\u094d\u0924\u093e\u0902\u0924\u0930\u0923", // hastantaran (transfer)

  /* --------------------------------------------------------------
   *  Common Police & Citizen Sentence Openers, Pronouns & Connectives
   * ------------------------------------------------------------ */
  "Today",
  "Yesterday",
  "Tomorrow",
  "Morning",
  "Evening",
  "Night",
  "Date",
  "Dated",
  "Time",
  "Hours",
  "Place",
  "Occurrence",
  "Incident",
  "Spot",
  "Sir",
  "Respected Sir",
  "Police Station",
  "Police Chowki",
  "District",
  "Sector",
  "Village",
  "Kurukshetra",
  "Haryana",
  "Sub-Inspector",
  "Assistant Sub-Inspector",
  "Head Constable",
  "Constable",
  "Investigating Officer",
  "Station House Officer",
  "SHO",
  "Enquiry Officer",
  "Investigating Officer",
  "Complainant",
  "Informant",
  "Victim",
  "Injured",
  "Accused",
  "Suspect",
  "Witness",
  "Independent Witness",
  "Public Witness",
  "Doctor",
  "Medical Officer",
  "Civil Hospital",
  "Injury",
  "Simple Hurt",
  "Grievous Hurt",
  "Fracture",
  "Weapon",
  "Lathi",
  "Danda",
  "Knife",
  "Iron Rod",
  "Firearm",
  "Cartridge",
  "Assault",
  "Beating",
  "Scuffle",
  "Abuse",
  "Threat",
  "Criminal Intimidation",
  "Cheating",
  "Fraud",
  "Cyber Crime",
  "Theft",
  "Burglary",
  "Snatching",
  "Vehicle Theft",
  "Accident",
  "Rash Driving",
  "Bail",
  "Remand",
  "Custody",
  "Site Plan",
  "Naksha Mauka",
  "Seizure Memo",
  "Fard Makboozgi",
  "Panchnama",
  "Inquest Report",
  "MLR",
  "Post Mortem",
  "CCTV Footage",
  "Call Detail Record",
  "CDR",
  "Mobile Number",
  "Bank Account",
  "Transaction",
  "Tehreer",
  "Rukka",
  "Challan",
  "Final Report",
  "NCR",
  "Section 103 BNS",
  "Section 115 BNS",
  "Section 126 BNS",
  "Section 303 BNS",
  "Section 316 BNS",
  "Section 318 BNS",
  "Section 324 BNS",
  "Section 351 BNS",
  "Section 352 BNS",
  "Section 35(3) BNSS",
  "Section 173 BNSS",
  "Section 174 BNSS",
  "Section 176 BNSS",
  "Section 180 BNSS",
  "Section 187 BNSS",
  "Section 223 BNSS",

  /* --------------------------------------------------------------
   *  Romanized Hinglish Vocabulary (Used by Officers typing phonetically)
   * ------------------------------------------------------------ */
  "Thana",
  "Prabhari",
  "Nirikshan",
  "Shikayat",
  "Giraftari",
  "Gashth",
  "Baramadgi",
  "Mauka",
  "Naksha",
  "Bayanaat",
  "Gawah",
  "Vadi",
  "Prarthi",
  "Abhiyukt",
  "Aropi",
  "Muqaddama",
  "Dhara",
  "Darj",
  "Karyavahi",
  "Puchhtachh",
  "Dabish",
  "Farar",
  "Malkhana",
  "Roznamcha",
  "Rapat",
  "Ittila",
  "Haziri",
  "Ravangi",
  "Wapsi",
  "Hirasat",
  "Tahqiqat",
  "Tafteesh",
  "Vivechna",
  "Darkhwast",
  "Marpeet",
  "Gali Galoj",
  "Dhamki",
  "Zameeni Vivad",
  "Ranjish",
  "Purani Ranjish",
  "Samjhauta",
  "Raazinama",
  "Aspatal",
  "Chotil",
  "Ilaaj",
  "Dastavez",
  "Hawalat",
  "Chori",
  "Vikram",
  "Malkeet",
  "Ramesh",
  "Suresh",
  "Devinder",
  "Pooja",

  /* --------------------------------------------------------------
   *  Common Hindi (Devanagari) Vocabulary & Phrases
   * ------------------------------------------------------------ */
  "\u0906\u091c", // Aaj (Today)
  "\u0915\u0932", // Kal (Yesterday)
  "\u0926\u093f\u0928\u093e\u0902\u0915", // Dinank (Date)
  "\u0938\u092e\u092f", // Samay (Time)
  "\u092c\u091c\u0947", // Baje (O'clock)
  "\u092a\u094d\u0930\u093e\u0924\u0903", // Pratah (Morning)
  "\u0938\u093e\u092f\u0902", // Saayam (Evening)
  "\u0930\u093e\u0924\u094d\u0930\u093f", // Raatri (Night)
  "\u0936\u094d\u0930\u0940\u092e\u093e\u0928", // Shriman (Sir)
  "\u092e\u0939\u094b\u0926\u092f", // Mahoday
  "\u0938\u0947\u0935\u093e \u092e\u0947\u0902", // Seva mein
  "\u0938\u0935\u093f\u0928\u092f \u0928\u093f\u0935\u0947\u0926\u0928", // Savinay nivedan
  "\u0906\u092e\u0926", // Aamad (Arrival)
  "\u0930\u0935\u093e\u0928\u0917\u0940", // Ravangi (Departure)
  "\u0939\u093e\u091c\u093f\u0930\u0940", // Haziri (Attendance)
  "\u0930\u092a\u091f", // Rapat
  "\u0930\u094b\u091c\u0928\u093e\u092e\u091a\u093e", // Roznamcha
  "\u092e\u094c\u0915\u093e \u092e\u0941\u0906\u092f\u0928\u093e", // Mauka muayana
  "\u092c\u092f\u093e\u0928 \u0926\u0930\u094d\u091c", // Bayan darj
  "\u0930\u093e\u091c\u0940\u0928\u093e\u092e\u093e", // Raazinama
  "\u0938\u094d\u0935\u0924\u0902\u0924\u094d\u0930 \u0938\u093e\u0915\u094d\u0937\u0940", // Swatantra sakshi
  "\u092e\u093e\u0930\u092a\u0940\u091f \u0935 \u0917\u093e\u0932\u0940-\u0917\u0932\u094c\u091c", // Marpeet wa gali-galoj
  "\u091c\u093e\u0928 \u0938\u0947 \u092e\u093e\u0930\u0928\u0947 \u0915\u0940 \u0927\u092e\u0915\u0940", // Jaan se marne ki dhamki
  "\u0915\u093e\u0928\u0942\u0928\u0940 \u0915\u093e\u0930\u094d\u0930\u0935\u093e\u0939\u0940" // Kanooni karyavahi
];

/* --------------------------------------------------------------------------
 *  Fragment sequences  (the unit TAB accepts - Gboard style)
 * ----------------------------------------------------------------------- */

/**
 * A sequence is an ordered list of fragments. TAB walks them one at a time.
 *
 * - `trigger`: text the officer must ALREADY have typed for the sequence to
 *   become eligible. An empty trigger means "offer this on an empty field".
 * - `fragments`: what TAB inserts, one press at a time.
 *
 * Fragments are deliberately SHORT. That is the whole point - TAB should feel
 * like tapping a word on the Gboard suggestion strip, not like pasting a
 * paragraph.
 */
interface GDSequence {
  id: string;
  /** Entry types this opener is tailored for. Empty = generic. */
  entryTypes?: string[];
  /** Script this sequence is written in; used to pick the right opener. */
  lang?: "hi" | "en";
  trigger: string[];
  fragments: string[];
}

const SEQUENCES: GDSequence[] = [
  /* ===================== Complaint Registration Openers ===================== */
  {
    id: "en-open-complaint-desc",
    entryTypes: ["COMPLAINT_DESCRIPTION", "COMPLAINT", "COMPLAINTS"],
    trigger: [],
    fragments: [
      "To, The Station House Officer, ",
      "Police Station ____________. ",
      "Sir, it is humbly submitted that on ____ at about ____ hours, ",
      "the complainant was present at ____________ when the accused persons namely ",
      "____________ arrived and intentionally caused dispute, quarrel and criminal intimidation. ",
      "It is therefore requested that prompt legal action be taken and justice be rendered.",
    ],
  },
  {
    id: "hi-open-complaint-desc",
    entryTypes: ["COMPLAINT_DESCRIPTION", "COMPLAINT", "COMPLAINTS"],
    lang: "hi",
    trigger: [],
    fragments: [
      "सेवा में, श्रीमान थाना प्रभारी महोदय, ",
      "थाना ____________। ",
      "महोदय, सविनय निवेदन है कि प्रार्थी दिनांक ____ को समय करीब ____ बजे ",
      "अपने घर/दुकान पर मौजूद था कि तभी नामजद अभियुक्तगण ने ",
      "गाली-गलौज व मारपीट कर जान से मारने की धमकी दी। ",
      "अतः कानूनी कार्रवाही कर न्याय दिलाया जाए।",
    ],
  },
  {
    id: "en-open-complaint-summary",
    entryTypes: ["COMPLAINT_SUMMARY", "SUMMARY"],
    trigger: [],
    fragments: [
      "Dispute and altercation between parties at ____________ ",
      "involving allegations of assault, cheating and intimidation; ",
      "preliminary police enquiry and verification required.",
    ],
  },
  {
    id: "hi-open-complaint-summary",
    entryTypes: ["COMPLAINT_SUMMARY", "SUMMARY"],
    lang: "hi",
    trigger: [],
    fragments: [
      "पक्षकारों के मध्य विवाद, मारपीट व धमकी के संबंध में ",
      "प्राथमिक जाँच व विधिक कार्रवाही हेतु संक्षिप्त सार।",
    ],
  },
  {
    id: "en-open-injury-desc",
    entryTypes: ["INJURY", "INJURIES"],
    trigger: [],
    fragments: [
      "Physical assault injuries observed on victim, ",
      "including contusion and lacerated wound, ",
      "referred to Civil Hospital for Medico-Legal Examination (MLR).",
    ],
  },
  {
    id: "hi-open-injury-desc",
    entryTypes: ["INJURY", "INJURIES"],
    lang: "hi",
    trigger: [],
    fragments: [
      "पीड़ित के शरीर पर चोट के निशान, ",
      "डाक्टरी मुआय\u0928\u093e व ए\u092e\u090f\u0932\u0906\u0930 हे\u0924\u0941 स\u0930\u0915\u093e\u0930\u0940 अ\u0938\u094d\u092a\u0924\u093e\u0932 भ\u0947\u091c\u093e ग\u092f\u093e\u0964",
    ],
  },
  {
    id: "en-open-enquiry-report",
    entryTypes: ["ENQUIRY_REPORT", "ENQUIRY"],
    trigger: [],
    fragments: [
      "Enquiry conducted on the spot in presence of respectables; ",
      "statements of complainant and respondent recorded; ",
      "matter enquired and report submitted for supervisory perusal.",
    ],
  },
  {
    id: "hi-open-enquiry-report",
    entryTypes: ["ENQUIRY_REPORT", "ENQUIRY"],
    lang: "hi",
    trigger: [],
    fragments: [
      "मौका पर पह\u0941ँ\u091a\u0915\u0930 जाँ\u091a क\u0940 ग\u092f\u0940 त\u0925\u093e द\u094b\u0928\u094b\u0902 प\u0915\u094d\u0937\u094b\u0902 क\u0947 ब\u092f\u093e\u0928 ल\u093f\u090f ग\u090f, ",
      "जाँ\u091a र\u093f\u092a\u094b\u0930\u094d\u091f अ\u0917\u094d\u0930\u093f\u092e क\u093e\u0930\u094d\u0930\u0935\u093e\u0939\u0940 ह\u0947\u0924\u0941 प\u0947\u0936 ह\u0948\u0964",
    ],
  },
  /* ===================== English GD openers ===================== */
  {
    id: "en-misc",
    entryTypes: ["MISCELLANEOUS_EVENT"],
    trigger: [],
    fragments: [
      "At ",
      "____ hours, ",
      "a general occurrence took place at ",
      "____________ and ",
      "the same was reported to the Station House Officer by ",
      "____________.",
    ],
  },
  {
    id: "en-departure",
    entryTypes: ["OFFICER_DEPARTURE"],
    trigger: [],
    fragments: [
      "At ____ hours, ",
      "SI ____________ departed from the station for ",
      "____________ along with ____________ constables ",
      "in vehicle no. ____________ ",
      "carrying arms and ammunition vide receipt.",
    ],
  },
  {
    id: "en-arrival",
    entryTypes: ["OFFICER_ARRIVAL"],
    trigger: [],
    fragments: [
      "At ____ hours, ",
      "SI ____________ arrived back at the station from ",
      "____________ and deposited the arms ",
      "and ammunition in the Malkhana.",
    ],
  },
  {
    id: "en-patrol",
    entryTypes: ["PATROL_DEPARTURE_RETURN"],
    trigger: [],
    fragments: [
      "At ____ hours, ",
      "the patrol party consisting of ____________ ",
      "proceeded for night patrol/domination of ",
      "____________ and returned at ____ hours.",
    ],
  },
  {
    id: "en-relief",
    entryTypes: ["SHIFT_RELIEF_TURNOVER"],
    trigger: [],
    fragments: [
      "Duty was relieved from ____________ ",
      "to ____________ at ____ hours. ",
      "Arms, ammunition and Malkhana were verified ",
      "and the nakka bandi was installed by ____________.",
    ],
  },
  {
    id: "en-complaint-receipt",
    entryTypes: ["COMPLAINT_RECEIPT"],
    trigger: [],
    fragments: [
      "At ____ hours, ",
      "a complaint petition was received from ____________ ",
      "regarding ____________ and the same was entered ",
      "in the station diary vide serial no. ____________.",
    ],
  },
  {
    id: "en-seizure",
    entryTypes: ["SEIZURE_MUDDMAL"],
    trigger: [],
    fragments: [
      "At ____ hours, ",
      "____________ articles were seized from ____________ ",
      "and deposited in the Malkhana ",
      "vide receipt no. ____________.",
    ],
  },
  {
    id: "en-inspection",
    entryTypes: ["SUPERVISORY_INSPECTION"],
    trigger: [],
    fragments: [
      "At ____ hours, ",
      "____________ (Rank/Name) of ____________ unit ",
      "inspected the station premises ",
      "and recorded the following observations: ____________.",
    ],
  },

  /* ===================== Hindi openers ===================== */
  {
    id: "hi-open-misc",
    entryTypes: ["MISCELLANEOUS_EVENT"],
    lang: "hi",
    trigger: [],
    fragments: [
      "\u0926\u093f\u0928\u093e\u0902\u0915 ____ \u0938\u092e\u092f ____ \u092c\u091c\u0947, ",
      "\u0925\u093e\u0928\u093e \u0915\u094d\u0937\u0947\u0924\u094d\u0930 \u092e\u0947\u0902 \u090f\u0915 \u0938\u093e\u092e\u093e\u0928\u094d\u092f \u0918\u091f\u0928\u093e \u0918\u091f\u093f\u0924 \u0939\u0941\u0908, ",
      "\u091c\u093f\u0938\u0915\u0940 \u0938\u0942\u091a\u0928\u093e \u0938\u094d\u0935\u092f\u0902 \u0936\u093f\u0915\u093e\u092f\u0924\u0915\u0930\u094d\u0924\u093e \u0926\u094d\u0935\u093e\u0930\u093e \u0925\u093e\u0928\u093e \u092a\u094d\u0930\u092d\u093e\u0930\u0940 \u0915\u094b ",
      "\u0926\u0940 \u0917\u0908 \u090f\u0935\u0902 \u0909\u0915\u094d\u0924 \u0938\u0942\u091a\u0928\u093e \u0915\u093e \u0935\u093f\u0935\u0930\u0923 \u0930\u091c\u093f\u0938\u094d\u091f\u0930 \u092e\u0947\u0902 \u0926\u0930\u094d\u091c \u0915\u093f\u092f\u093e \u0917\u092f\u093e\u0964",
    ],
  },
  {
    id: "hi-open-departure",
    entryTypes: ["OFFICER_DEPARTURE"],
    lang: "hi",
    trigger: [],
    fragments: [
      "____ \u092c\u091c\u0947, ",
      "\u0909\u092a\u0928\u093f\u0930\u0940\u0915\u094d\u0937\u0915 ____________ \u0905\u092a\u0928\u0947 \u0915\u0930\u094d\u092e\u091a\u093e\u0930\u093f\u092f\u094b\u0902 \u0938\u0939\u093f\u0924 ",
      "____________ \u0915\u0947 \u0932\u093f\u090f \u0930\u0935\u093e\u0928\u093e \u0939\u0941\u090f, ",
      "\u0935\u093e\u0939\u0928 \u0915\u094d\u0930\u092e\u093e\u0902\u0915 ____________ \u092e\u0947\u0902 \u0939\u0925\u093f\u092f\u093e\u0930 \u0935 \u0917\u094b\u0932\u093e-\u092c\u093e\u0930\u0942\u0926 \u0930\u0938\u0940\u0926 \u0938\u0939\u093f\u0924 \u0932\u0947 \u091c\u093e\u092f\u093e \u0917\u092f\u093e\u0964",
    ],
  },
  {
    id: "hi-open-arrival",
    entryTypes: ["OFFICER_ARRIVAL"],
    lang: "hi",
    trigger: [],
    fragments: [
      "____ \u092c\u091c\u0947, ",
      "\u0909\u092a\u0928\u093f\u0930\u0940\u0915\u094d\u0937\u0915 ____________ ____________ \u0938\u0947 \u0935\u093e\u092a\u0938 \u0906\u0915\u0930 ",
      "\u0939\u0925\u093f\u092f\u093e\u0930 \u0935 \u0917\u094b\u0932\u093e-\u092c\u093e\u0930\u0942\u0926 \u092e\u093e\u0932\u0916\u093e\u0928\u093e \u092e\u0947\u0902 \u091c\u092e\u093e \u0915\u093f\u092f\u093e\u0964",
    ],
  },
  {
    id: "hi-open-patrol",
    entryTypes: ["PATROL_DEPARTURE_RETURN"],
    lang: "hi",
    trigger: [],
    fragments: [
      "____ \u092c\u091c\u0947, ",
      "\u0917\u0936\u094d\u0924\u0940 \u0926\u0932 ____________ \u0938\u0926\u0938\u094d\u092f\u094b\u0902 \u0915\u0947 \u0938\u093e\u0925 ",
      "____________ \u0915\u094d\u0937\u0947\u0924\u094d\u0930 \u092e\u0947\u0902 \u0930\u093e\u0924\u094d\u0930\u093f \u0917\u0936\u094d\u0924/\u0926\u092c\u0926\u092c\u093e \u0939\u0947\u0924\u0941 \u0930\u0935\u093e\u0928\u093e \u0939\u0941\u0906 ",
      "\u0914\u0930 ____ \u092c\u091c\u0947 \u0935\u093e\u092a\u0938 \u0906\u092f\u093e\u0964",
    ],
  },
  {
    id: "hi-open-relief",
    entryTypes: ["SHIFT_RELIEF_TURNOVER"],
    lang: "hi",
    trigger: [],
    fragments: [
      "____________ \u0938\u0947 \u0921\u094d\u092f\u0942\u091f\u0940 \u092a\u094d\u0930\u093e\u092a\u094d\u0924 \u0915\u0940 \u0917\u0908 ",
      "\u0914\u0930 ____ \u092c\u091c\u0947 \u0921\u094d\u092f\u0942\u091f\u0940 \u0905\u0917\u0932\u0947 \u0915\u0930\u094d\u092e\u091a\u093e\u0930\u0940 \u0915\u094b \u0938\u094c\u0902\u092a\u0940 \u0917\u0908\u0964 ",
      "\u0939\u0925\u093f\u092f\u093e\u0930, \u0917\u094b\u0932\u093e-\u092c\u093e\u0930\u0942\u0926 \u0935 \u092e\u093e\u0932\u0916\u093e\u0928\u093e \u0938\u0924\u094d\u092f\u093e\u092a\u093f\u0924 \u0915\u0930 ",
      "\u0928\u0915\u094d\u0915\u093e \u092c\u0902\u0926\u0940 \u091a\u093e\u0932\u0942 \u0915\u0940 \u0917\u0908\u0964",
    ],
  },
  {
    id: "hi-open-complaint",
    entryTypes: ["COMPLAINT_RECEIPT"],
    lang: "hi",
    trigger: [],
    fragments: [
      "____ \u092c\u091c\u0947, ",
      "\u0936\u093f\u0915\u093e\u092f\u0924\u0915\u0930\u094d\u0924\u093e ____________ \u0926\u094d\u0935\u093e\u0930\u093e ____________ \u0915\u0947 \u0938\u0902\u092c\u0902\u0927 \u092e\u0947\u0902 ",
      "\u0924\u0939\u0930\u0940\u0930 \u092a\u094d\u0930\u093e\u092a\u094d\u0924 \u0939\u0941\u0908 \u090f\u0935\u0902 \u0909\u092a\u0930\u094b\u0915\u094d\u0924 \u0924\u0939\u0930\u0940\u0930 \u0938\u094d\u091f\u0947\u0936\u0928 \u0921\u093e\u092f\u0930\u0940 \u092e\u0947\u0902 ",
      "\u0915\u094d\u0930\u092e\u093e\u0902\u0915 ____________ \u092a\u0930 \u0926\u0930\u094d\u091c \u0915\u0940 \u0917\u0908\u0964",
    ],
  },
  {
    id: "hi-open-seizure",
    entryTypes: ["SEIZURE_MUDDMAL"],
    lang: "hi",
    trigger: [],
    fragments: [
      "____ \u092c\u091c\u0947, ",
      "____________ \u0938\u093e\u092e\u0917\u094d\u0930\u0940 ____________ \u0938\u0947 \u092c\u0930\u093e\u092e\u0926 \u0915\u0930 ",
      "\u092e\u093e\u0932\u0916\u093e\u0928\u093e \u092e\u0947\u0902 \u0930\u0938\u0940\u0926 \u0915\u094d\u0930\u092e\u093e\u0902\u0915 ____________ \u092a\u0930 \u091c\u092e\u093e \u0915\u0940 \u0917\u0908\u0964",
    ],
  },
  {
    id: "hi-open-inspection",
    entryTypes: ["SUPERVISORY_INSPECTION"],
    lang: "hi",
    trigger: [],
    fragments: [
      "____ \u092c\u091c\u0947, ",
      "____________ (\u092a\u0926\u0928\u093e\u092e/\u0928\u093e\u092e) \u0926\u094d\u0935\u093e\u0930\u093e \u0925\u093e\u0928\u093e \u092a\u0930\u093f\u0938\u0930 \u0915\u093e \u0928\u093f\u0930\u0940\u0915\u094d\u0937\u0923 \u0915\u093f\u092f\u093e \u0917\u092f\u093e ",
      "\u0914\u0930 \u0928\u093f\u092e\u094d\u0928\u0932\u093f\u0916\u093f\u0924 \u091f\u093f\u092a\u094d\u092a\u0923\u093f\u092f\u093e\u0901 \u0926\u0930\u094d\u091c \u0915\u0940 \u0917\u0908\u0902: ____________\u0964",
    ],
  },

  /* ===================== English continuations ===================== */
  {
    id: "en-cont-complaint",
    trigger: ["A complaint was received at the station regarding"],
    fragments: [
      "____________ and the same was registered ",
      "in the station diary vide serial no. ____________.",
    ],
  },
  {
    id: "en-cont-nakka",
    trigger: ["A nakka bandi was imposed at the place of occurrence and"],
    fragments: ["the same was intimated to the supervisory authority."],
  },
  {
    id: "en-cont-legal",
    trigger: ["Necessary legal action was taken at the spot and"],
    fragments: ["a report was submitted to the higher authorities."],
  },
  {
    id: "en-cont-malkhana",
    trigger: ["The seized articles were deposited in Malkhana vide receipt number"],
    fragments: ["____________ and intimation was sent to the court."],
  },
  {
    id: "en-cont-bulletin",
    trigger: ["A daily bulletin was sent to the higher authorities and"],
    fragments: ["the same was uploaded on the portal."],
  },
  {
    id: "en-cont-duty",
    trigger: ["The duty officer informed the station house officer about"],
    fragments: ["____________ and necessary action was taken."],
  },
  {
    id: "en-cont-map",
    trigger: ["The place of occurrence was mapped and photographed and"],
    fragments: ["the same was annexed with the case file."],
  },
  {
    id: "en-cont-statement",
    trigger: ["The accused was summoned to the station and recorded his statement under Section"],
    fragments: ["____________ and the same was placed on record."],
  },
  {
    id: "en-cont-investigation",
    trigger: ["Investigation was handed over to"],
    fragments: ["SI ____________ vide GD entry no. ____________."],
  },

  /* ===================== Hindi continuations ===================== */
  {
    id: "hi-cont-sho-aantar",
    trigger: ["\u092a\u094d\u0930\u092d\u093e\u0930\u0940 \u0905\u0902\u0924\u0930"],
    fragments: [
      "\u0938\u093e\u0924 \u092c\u091c\u0947 \u0915\u0930\u094d\u0924\u0935\u094d\u092f \u0938\u094d\u0925\u0932 \u092a\u0930 ",
      "\u092a\u0939\u0941\u0901\u091a\u0915\u0930 \u092a\u094d\u0930\u0924: \u0915\u093f\u092f\u093e \u0917\u092f\u093e\u0964",
    ],
  },
  {
    id: "hi-cont-sho-gashth",
    trigger: ["\u092a\u094d\u0930\u092b\u093e\u0930\u0940 \u0905\u0902\u0924\u0930 \u0917\u0936\u094d\u0924"],
    fragments: [
      "\u0939\u0947\u0924\u0941 \u0928\u093f\u0915\u0932\u0915\u0930 \u0928\u093f\u091c\u0940 \u0935\u093e\u0939\u0928 ",
      "\u0938\u0947 \u0928\u093f\u0915\u0932\u0947\u0964",
    ],
  },
  {
    id: "hi-cont-sho-return",
    trigger: ["\u092a\u094d\u0930\u092d\u093e\u0930\u0940 \u0905\u0902\u0924\u0930 \u0926\u0938 \u092c\u091c\u0947"],
    fragments: [
      "\u0938\u094d\u091f\u0947\u0936\u0928 \u0935\u093e\u092a\u0938 \u0932\u094c\u091f\u0915\u0930 ",
      "\u0909\u092a\u0938\u094d\u0925\u093f\u0924 \u0939\u0941\u090f\u0964",
    ],
  },
  {
    id: "hi-cont-thana-dwara",
    trigger: ["\u0925\u093e\u0928\u093e \u092a\u094d\u0930\u092d\u093e\u0930\u0940 \u0926\u094d\u0935\u093e\u0930\u093e \u092e\u094c\u0915\u0947 \u092a\u0930"],
    fragments: [
      "\u092a\u0939\u0941\u0901\u091a\u0915\u0930 \u0935\u093f\u0927\u093f\u0915 \u0915\u093e\u0930\u094d\u0930\u0935\u093e\u0939\u0940 ",
      "\u0915\u0940\u0964",
    ],
  },
  {
    id: "hi-cont-mauke",
    trigger: ["\u092e\u094c\u0915\u0947 \u092a\u0930"],
    fragments: [
      "\u092a\u0939\u0941\u0901\u091a\u0915\u0930 \u0938\u094d\u0925\u093f\u0924\u093f \u0915\u093e ",
      "\u091c\u093e\u092f\u091c\u093e \u0932\u093f\u092f\u093e \u0917\u092f\u093e\u0964",
    ],
  },
  {
    id: "hi-cont-abhiyukt-thana",
    trigger: ["\u0905\u092d\u093f\u092f\u0941\u0915\u094d\u0924 \u0915\u094b \u0925\u093e\u0928\u093e"],
    fragments: ["\u092c\u0941\u0932\u093e\u092f\u093e \u0917\u092f\u093e\u0964"],
  },
  {
    id: "hi-cont-abhiyukt-by",
    trigger: ["\u0905\u092d\u093f\u092f\u0941\u0915\u094d\u0924 \u0926\u094d\u0935\u093e\u0930\u093e"],
    fragments: ["\u092a\u0942\u091b\u0924\u093e\u091b \u0915\u0940 \u0917\u0908\u0964"],
  },
  {
    id: "hi-cont-gavah",
    trigger: ["\u0917\u0935\u093e\u0939 \u0915\u094b"],
    fragments: ["\u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924 \u0915\u0930 \u0926\u093f\u092f\u093e \u0917\u092f\u093e\u0964"],
  },
  {
    id: "hi-cont-nakali",
    trigger: ["\u0928\u0915\u0932\u0940 \u0926\u0938\u094d\u0924\u093e\u0935\u0947\u091c \u092e\u093e\u0932\u0916\u093e\u0928\u093e \u092e\u0947\u0902"],
    fragments: [
      "\u091c\u092e\u093e \u0915\u0930 \u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924 \u0930\u0916\u0947 ",
      "\u0917\u090f\u0964",
    ],
  },
  {
    id: "hi-cont-vehicle",
    trigger: ["\u0935\u093e\u0939\u0928 \u0915\u0940 \u091c\u093e\u0902\u091a \u0939\u0947\u0924\u0941"],
    fragments: ["\u0928\u093f\u0930\u0940\u0915\u094d\u0937\u0923 \u0915\u093f\u092f\u093e \u0917\u092f\u093e\u0964"],
  },
  {
    id: "hi-cont-prativedan",
    trigger: ["\u092a\u094d\u0930\u0924\u093f\u0935\u0947\u0926\u0928"],
    fragments: ["\u0938\u0902\u0932\u0917\u0928 \u0939\u0948\u0964"],
  },
  {
    id: "hi-cont-aarambhiki",
    trigger: ["\u0938\u0941\u092c\u0939 \u0915\u0940 \u0906\u0930\u0902\u092d\u093f\u0915\u0940 \u0915\u0940 \u0917\u0908"],
    fragments: ["\u0924\u0925\u093e \u0938\u093e\u092f\u0902\u0915\u093e\u0932\u0940\u0928 \u0930\u093f\u092a\u094b\u0930\u094d\u091f \u0915\u0940 \u0917\u0908\u0964"],
  },
  {
    id: "hi-open-fir",
    entryTypes: ["FIR_CONTENT","FIR","TEHREER"],
    lang: "hi",
    trigger: [],
    fragments: [
      "सेवा में, श्रीमान थाना प्रभारी महोदय, ",
      "थाना ____________। ",
      "महोदय, सविनय निवेदन है कि प्रार्थी दिनांक ____ को समय करीब ____ बजे ",
      "अपने घर पर मौजूद था कि तभी नामजद अभियुक्तगण द्वारा पुरानी रंजिश को लेकर ",
      "वादी के साथ गाली-गलौज व लाठी-डंडों से मारपीट की गई तथा जान से मारने की धमकी दी गई। ",
      "अतः श्रीमान जी से प्रार्थना है कि रिपोर्ट दर्ज कर कानूनी कार्यवाही करने की कृपा करें।",
    ],
  },
  {
    id: "en-open-fir",
    entryTypes: ["FIR_CONTENT","FIR","TEHREER"],
    trigger: [],
    fragments: [
          "To, The Station House Officer, ",
          "Police Station ____________. ",
          "Sir, it is submitted that on ____ at about ____ hours, ",
          "the accused persons namely ____________ ",
          "unlawfully restrained and assaulted the complainant with weapons, causing injuries, ",
          "and threatened with dire consequences. Necessary legal action may kindly be taken."
    ],
  },
  {
    id: "hi-open-delay",
    entryTypes: ["DELAY_REASONS","DELAY"],
    lang: "hi",
    trigger: [],
    fragments: [
          "चोटिल/पीड़ित के गंभीर रूप से घायल होने व अस्पताल में उपचाराधीन रहने के कारण ",
          "तहरीर देने में विलंब हुआ है।"
    ],
  },
  {
    id: "hi-cont-delay-treatment",
    trigger: ["चोटिल के उपचार","अस्पताल में भर्ती"],
    fragments: [
          "रहने एवं चिकित्सीय देखभाल के कारण थाने पर सूचना देने में विलंब हुआ।"
    ],
  },
  {
    id: "hi-cont-delay-compromise",
    trigger: ["सुलह समझौते","आपसी समझौते के प्रयास"],
    fragments: [
          "पारिवारिक एवं सामाजिक स्तर पर किए जाने के कारण एफआईआर दर्ज कराने में स्वाभाविक विलंब हुआ।"
    ],
  },
  {
    id: "hi-cont-delay-fear",
    trigger: ["अभियुक्तों के डर","जान से मारने की धमकी के कारण"],
    fragments: [
          "वादी व परिजन अत्यधिक भयभीत थे, जिससे तहरीर देने में विलंब हुआ।"
    ],
  },
  {
    id: "en-open-delay",
    entryTypes: ["DELAY_REASONS","DELAY"],
    trigger: [],
    fragments: [
          "Delay occurred due to medical treatment and hospitalization of the injured victim ",
          "and the matter was reported promptly upon stabilization."
    ],
  },
  {
    id: "en-cont-delay-settlement",
    trigger: ["efforts for compromise","settlement between parties"],
    fragments: [
          "were being explored by family elders, causing bona fide delay in reporting."
    ],
  },
  {
    id: "hi-open-brief-facts",
    entryTypes: ["BRIEF_FACTS"],
    lang: "hi",
    trigger: [],
    fragments: [
          "वादी के साथ अभियुक्तों द्वारा किए गए विवाद, ",
          "मारपीट एवं गाली-गलौज व धमकी के संबंध में।"
    ],
  },
  {
    id: "en-open-brief-facts",
    entryTypes: ["BRIEF_FACTS"],
    trigger: [],
    fragments: [
          "Assault and criminal intimidation committed against the complainant ",
          "by identified accused persons over prior dispute."
    ],
  },
  {
    id: "hi-open-zimni",
    entryTypes: ["ZIMNI","CASE_DIARY"],
    lang: "hi",
    trigger: [],
    fragments: [
          "दौराने विवेचना मय हमराही मुलाजमान ",
          "घटनास्थल पर पहुंचे और स्वतंत्र साक्षियों के समक्ष ",
          "घटनास्थल का निरीक्षण किया गया तथा नजरी नक्शा तैयार किया गया।"
    ],
  },
  {
    id: "en-open-zimni",
    entryTypes: ["ZIMNI","CASE_DIARY"],
    trigger: [],
    fragments: [
          "During investigation, visited the spot of occurrence along with staff, ",
          "conducted site inspection in presence of independent witnesses ",
          "and prepared site plan (naksha nazri)."
    ],
  },
  {
    id: "hi-cont-zimni-statement",
    trigger: ["वादी का बयान","बयान धारा 180"],
    fragments: [
          "दर्ज किया गया, जिसने अपनी पूर्व तहरीर की पुष्टि करते हुए घटना का पूर्ण समर्थन किया।"
    ],
  },
  {
    id: "hi-cont-zimni-witness",
    trigger: ["गवाहों के बयान","साक्षियों से पूछताछ"],
    fragments: [
          "अंतर्गत धारा 180 बीएनएसएस (161 सीआरपीसी) कलमबंद किए गए।"
    ],
  },
  {
    id: "hi-cont-zimni-raid",
    trigger: ["दबिश दी गई","गिरफ्तारी हेतु दबिश"],
    fragments: [
          "किंतु अभियुक्तगण अपने आवास से फरार पाए गए, तलाश जारी है।"
    ],
  },
  {
    id: "hi-cont-zimni-recovery",
    trigger: ["फर्द बरामदगी","माल बरामदगी"],
    fragments: [
          "साक्षियों के समक्ष तैयार की गई तथा बरामदशुदा वस्तु को नियमानुसार सीलबंद किया गया।"
    ],
  },
  {
    id: "en-cont-zimni-witness",
    trigger: ["statement under section 180","examined witness under section 161"],
    fragments: [
          "was recorded verbatim and verified to be correct."
    ],
  },
  {
    id: "en-cont-zimni-raid",
    trigger: ["raided the suspected hideouts","sincere efforts were made to arrest"],
    fragments: [
          "the accused persons, but they were found absconding from their residence."
    ],
  },
  {
    id: "hi-cont-fir-prarthi",
    trigger: ["प्रार्थी ने","वादी ने"],
    fragments: [
          "थाने पर उपस्थित होकर एक तहरीरी सूचना पेश की कि ",
          "दिनांक ____ को समय करीब ____ बजे ",
          "नामित अभियुक्तगण द्वारा अकारण गाली-गलौज व मारपीट की गई तथा ",
          "जान से मारने की धमकी दी गई। अतः कानूनी कार्यवाही की जाए।"
    ],
  },
  {
    id: "hi-cont-fir-tehreer",
    trigger: ["तहरीर के आधार पर","प्राप्त तहरीर के आधार पर"],
    fragments: [
          "मुकदमा पंजीकृत कर विवेचना प्रारंभ की गई।"
    ],
  },
  {
    id: "en-cont-fir-complainant",
    trigger: ["The complainant approached","The complainant stated"],
    fragments: [
          "the Police Station and lodged a complaint stating that on ",
          "____ at about ____ hours, the accused persons unlawfully ",
          "assaulted and threatened the complainant. Necessary action be taken."
    ],
  },
];

/* --------------------------------------------------------------------------
 *  Matching helpers
 * ----------------------------------------------------------------------- */

/**
 * Lower-cases, turns punctuation into spaces and collapses whitespace so
 * triggers compare cleanly. Punctuation becomes a SPACE (not simply deleted)
 * so a danda/comma still counts as a word boundary - this is what lets
 * text ending in "...gai. mauke par" match the trigger "mauke par" too.
 */
function normalize(token: string): string {
  return token
    .toLowerCase()
    .replace(/[\u0964.!?,;:()"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * True when the tail of `value` is exactly the given trigger
 * (case and punctuation agnostic).
 *
 * Trailing whitespace the officer typed is ignored first, so both
 * "प्रभारी अंतर" and "प्रभारी अंतर " match the trigger "प्रभारी अंतर".
 */
function endsWithTrigger(value: string, trigger: string): boolean {
  const v = normalize(value);
  const t = normalize(trigger);
  if (!t || !v.endsWith(t)) return false;

  // Whatever precedes the trigger must be empty or end on a word boundary,
  // so "मौके परX" never matches the trigger "मौके पर".
  // The slice happens on the NORMALIZED pair (bug fix: the old code sliced
  // the raw string by the raw trigger length, which drifted apart whenever
  // punctuation differed between the two - e.g. a trailing danda).
  const head = v.slice(0, v.length - t.length);
  return head.length === 0 || head.endsWith(" ");
}

export type TextScript = "hi" | "en" | "none";

/**
 * Detects the script a piece of text is written in (Devanagari vs Latin).
 * Used to keep the strip monolingual: a Hindi sentence never completes with
 * an English word, and vice versa. Empty input returns "none" (no filtering).
 */
export function detectScript(text: string): TextScript {
  let dev = 0;
  let lat = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0900 && cp <= 0x097f) dev++;
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) lat++;
  }
  if (dev === 0 || lat === 0) return dev > 0 ? "hi" : lat > 0 ? "en" : "none";
  return dev >= lat ? "hi" : "en";
}

/** Keeps candidates in the same script as the text around the caret. */
function matchesContextScript(candidate: string, contextScript: TextScript): boolean {
  if (contextScript === "none") return true;
  const s = detectScript(candidate);
  if (s === "none" || s === contextScript) return true;
  // Allow common English police legal acronyms / codes / names in Hindi context
  if (contextScript === "hi" && /^[A-Za-z0-9\s()_\-./]+$/.test(candidate)) return true;
  return false;
}

/**
 * Bounded Damerau-Levenshtein distance (insert/delete/substitute/transpose).
 * Returns `max + 1` as soon as the distance provably exceeds `max`, so a full
 * word-bank sweep stays well under a millisecond - this is the fuzzy layer
 * that lets a one-typo word still find its suggestion (Gboard behaviour).
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  let prevPrev: number[] = [];
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, prevPrev[j - 2] + 1);
      }
      cur.push(val);
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = cur;
  }
  const d = prev[n];
  return d > max ? max + 1 : d;
}

/* --------------------------------------------------------------------------
 *  Public API
 * ----------------------------------------------------------------------- */

/** Bookkeeping the UI hands back in so TAB can advance through a sequence. */
export interface GDChainState {
  /** Index into SEQUENCES. */
  sequenceIndex: number;
  /** Index of the NEXT fragment to offer. */
  next: number;
}

/**
 * Ranked multi-candidate prediction - the engine behind the Gboard-style
 * suggestion strip.
 *
 * Resolution order:
 *  1. Continue an in-progress sequence (TAB/Enter walks fragments one at a time).
 *  2. Empty field -> entry-type openers, offered in BOTH English and Hindi.
 *  3. Officer just finished a trigger phrase -> that sequence's first fragment.
 *  4. Officer mid-word -> ranked completions (personal dictionary, word bank,
 *     mined next-words, length-gated harvested terms, then fuzzy typo matches).
 *  5. Officer after a space -> mined next-word predictions.
 *
 * Candidates are ranked by learned weight (accepts up, rejects down), so the
 * strip re-orders itself exactly like Gboard does as an officer types.
 *
 * @param value      Text before the caret (the engine never guesses past it).
 * @param entryType  Optional GD entry type, used to pick a smarter opener.
 * @param chain      Chain state returned by the previous call.
 * @param options    Learned weights, personal phrases and mined next-words.
 */
export interface GDSuggestionOptions {
  /** Ranked next-word candidates mined from the station corpus (plain words). */
  nextWords?: string[];
  /** The officer's saved dictionary phrases (words or short phrases). */
  personalPhrases?: string[];
  /**
   * Raw multi-word phrases extracted from uploaded documents. These may carry
   * OCR noise, so they are used ONLY as after-space phrase continuations
   * (anchored on a completed word) - never as mid-word completions.
   */
  harvestedPhrases?: string[];
  /**
   * Raw single tokens extracted from uploaded documents. They may contain OCR
   * noise, so mid-word completions from this tier need a longer typed prefix
   * and always rank below the curated word bank at equal learning.
   */
  harvestedWords?: string[];
  /**
   * Learned weight per key. Keys are normalized tokens (word/next/dict
   * suggestions) or `seq:<sequence-id>` (openers/continuations).
   * Accepts raise the weight, rejections lower it - unknown keys default to 1.
   */
  weights?: Record<string, number>;
}

/** How many candidates the engine will ever return (the strip shows 3). */
const MAX_CANDIDATES = 6;

/** Suggestions whose learned weight fell below this are suppressed entirely. */
const SUPPRESS_BELOW = 0.45;

/** Learned weight for a key, defaulting to 1 when never seen before. */
function weightOf(options: GDSuggestionOptions | undefined, key: string): number {
  const w = options?.weights?.[key];
  return typeof w === "number" && Number.isFinite(w) ? w : 1;
}

/** Internal record used to sort mid-word completions. */
interface RankedCandidate {
  sug: GDSuggestion;
  weight: number;
  exact: boolean;
  extraChars: number;
}

/**
 * Strip ordering: learned weight first, then fully-typed exact matches,
 * then the shortest completion, alphabetically as a stable tie-break.
 */
function compareRanked(a: RankedCandidate, b: RankedCandidate): number {
  if (b.weight !== a.weight) return b.weight - a.weight;
  if (a.exact !== b.exact) return a.exact ? -1 : 1;
  if (a.extraChars !== b.extraChars) return a.extraChars - b.extraChars;
  return a.sug.text.localeCompare(b.sug.text);
}
export function getGDSuggestions(
  value: string,
  entryType?: string,
  chain?: GDChainState | null,
  options: GDSuggestionOptions = {}
): GDSuggestion[] {
  if (value == null) return [];
  const out: GDSuggestion[] = [];
  const push = (s: GDSuggestion) => {
    if (!out.some((o) => o.text === s.text)) out.push(s);
  };

  /* --- 1. Continue an in-progress sequence (never suppressed). --- */
  if (chain && chain.sequenceIndex >= 0 && SEQUENCES[chain.sequenceIndex]) {
    const seq = SEQUENCES[chain.sequenceIndex];
    const frag = seq.fragments[chain.next];
    if (frag !== undefined) {
      push({
        text: frag,
        replaceLength: 0,
        source: "chain",
        sequenceIndex: chain.sequenceIndex,
        key: `seq:${seq.id}`,
      });
    }
  }

  /* --- 2. Empty field: entry-type openers, BOTH scripts on the strip. --- */
  if (value.trim().length === 0) {
    const fallback: { s: GDSequence; i: number }[] = [];
    for (const id of ["en-misc", "hi-open-misc"]) {
      const i = SEQUENCES.findIndex((x) => x.id === id);
      if (i !== -1) fallback.push({ s: SEQUENCES[i], i });
    }
    const matching = SEQUENCES.map((s, i) => ({ s, i })).filter(
      ({ s }) =>
        !!entryType &&
        !!s.entryTypes &&
        s.entryTypes.includes(entryType) &&
        s.fragments.length > 0
    );
    const usable = (matching.length ? matching : fallback).filter(
      ({ s }) => weightOf(options, `seq:${s.id}`) >= SUPPRESS_BELOW
    );
    for (const { s, i } of usable) {
      push({
        text: s.fragments[0],
        replaceLength: 0,
        source: "opening",
        sequenceIndex: i,
        key: `seq:${s.id}`,
      });
    }
    return out.slice(0, MAX_CANDIDATES);
  }

  /* --- Split the tail into the token being typed (if any). --- */
  // The token starts AFTER the whole trailing whitespace run. search() only
  // reports where the run BEGINS, so slice(lastSpace + 1) leaked a leading
  // space into the fragment whenever the officer double-spaced (dictation and
  // fast typing do this constantly). That corrupted replaceLength, which made
  // the ghost preview position itself as if it replaced characters the field
  // still displays - the grey preview was painted over the typed word. The
  // \S* capture group keeps the fragment clean for one OR many spaces.
  const endsWithSpace = /\s$/.test(value);
  const tailMatch = endsWithSpace ? null : /\s+(\S*)$/.exec(value);
  const fragment = endsWithSpace ? "" : tailMatch ? tailMatch[1] : value;
  const typedHead = value.slice(0, value.length - fragment.length);
  // Script filter anchors on the token being typed (or, right after a space,
  // on everything before it) so the strip stays monolingual.
  const contextScript = detectScript(fragment.length > 0 ? fragment : typedHead);

  /* --- 3. Just finished a trigger phrase: start its sequence. --- */
  // Longest trigger wins so the most specific continuation is chosen, and
  // repeatedly-rejected openers are suppressed via their learned weight.
  let bestIndex = -1;
  let bestTrigger = "";
  for (let i = 0; i < SEQUENCES.length; i++) {
    if (weightOf(options, `seq:${SEQUENCES[i].id}`) < SUPPRESS_BELOW) continue;
    for (const trig of SEQUENCES[i].trigger) {
      if (endsWithTrigger(value, trig) && trig.length > bestTrigger.length) {
        bestTrigger = trig;
        bestIndex = i;
      }
    }
  }
  if (bestIndex !== -1) {
    push({
      text: SEQUENCES[bestIndex].fragments[0],
      replaceLength: 0,
      source: "phrase",
      sequenceIndex: bestIndex,
      key: `seq:${SEQUENCES[bestIndex].id}`,
    });
  }

  /* --- 4a. After a space: predicted NEXT words & multi-word phrase continuations. --- */
  if (endsWithSpace) {
    const rawTokens = value.trim().split(/\s+/).filter(Boolean);
    const lastWord = rawTokens[rawTokens.length - 1] || "";
    const normLast = normalize(lastWord);

    // Look for multi-word phrases starting with the completed word. Both the
    // officer's saved dictionary and phrases harvested from uploaded documents
    // feed this tier: the anchor is a WHOLE completed word, so noisy harvested
    // entries only surface when the officer actually typed that word.
    if (normLast.length >= 2) {
      for (const p of [...(options.personalPhrases ?? []), ...(options.harvestedPhrases ?? [])]) {
        if (out.length >= MAX_CANDIDATES) break;
        const normP = normalize(p);
        if (normP.startsWith(normLast + " ") && normP !== normLast) {
          const remainder = p.slice(lastWord.length).trim();
          if (remainder && !out.some((o) => o.text.trim() === remainder)) {
            push({
              text: remainder + " ",
              replaceLength: 0,
              source: "phrase",
              sequenceIndex: -1,
              key: normP,
            });
          }
        }
      }
    }

    for (const w of options.nextWords ?? []) {
      if (out.length >= MAX_CANDIDATES) break;
      const norm = normalize(w);
      if (!norm || out.some((o) => o.text === w + " ")) continue;
      if (!matchesContextScript(w, contextScript)) continue;
      push({ text: w + " ", replaceLength: 0, source: "next", sequenceIndex: -1, key: norm });
    }

    if (out.length > 0) {
      return out.slice(0, MAX_CANDIDATES);
    }
  }

  /* --- 4b. Mid-word: ranked completions (dictionary > bank > mined > harvested > fuzzy). --- */
  const normFrag = normalize(fragment);
  if (fragment.length > 0 && normFrag.length > 0) {
    const ranked: RankedCandidate[] = [];
    const seen = new Set<string>();

    /**
     * Mid-word completions are offered by TIER, each with its own quality gate
     * and weight boost. Text harvested from uploaded documents can carry OCR
     * noise ("aonsignment" for "a consignment"), so that vocabulary needs a
     * longer typed prefix before it may surface and always ranks below the
     * curated bank at equal learning. The officer's own saved dictionary keeps
     * the full Gboard-style boost at any fragment length.
     */
    const addWord = (word: string, source: "word" | "dict", boost: number, minFrag: number) => {
      if (normFrag.length < minFrag) return;
      const norm = normalize(word);
      if (!norm || seen.has(norm)) return;
      if (!matchesContextScript(word, contextScript)) return;
      const firstWord = norm.split(" ")[0];
      if (!firstWord.startsWith(normFrag) && !norm.startsWith(normFrag)) return;
      seen.add(norm);
      ranked.push({
        sug: {
          text: word,
          replaceLength: fragment.length,
          source,
          sequenceIndex: -1,
          key: norm,
        },
        weight: weightOf(options, norm) * boost,
        exact: firstWord === normFrag || norm === normFrag,
        extraChars: firstWord.length - normFrag.length,
      });
    };

    // 1) The officer's own saved dictionary (Gboard personal-dictionary boost),
    // 2) the curated police vocabulary,
    // 3) mined next-words from the corpus model, then
    // 4) raw terms harvested from uploaded documents (noisier -> gated + demoted).
    for (const p of options.personalPhrases ?? []) addWord(p, "dict", 2.0, 1);
    for (const w of WORD_BANK) addWord(w, "word", 1.0, 1);
    for (const w of options.nextWords ?? []) addWord(w, "word", 1.0, 1);
    for (const w of options.harvestedWords ?? []) addWord(w, "word", 0.6, 4);

    // Fuzzy tier (Gboard-style typo tolerance): one edit away, same script.
    if (ranked.length < 3 && normFrag.length >= 4) {
      for (const w of WORD_BANK) {
        const norm = normalize(w);
        if (seen.has(norm) || norm.includes(" ") || norm.length < 4) continue;
        if (!matchesContextScript(w, contextScript)) continue;
        if (editDistance(norm, normFrag, 1) !== 1) continue;
        seen.add(norm);
        ranked.push({
          sug: {
            text: w,
            replaceLength: fragment.length,
            source: "word",
            sequenceIndex: -1,
            key: norm,
          },
          weight: weightOf(options, norm),
          exact: false,
          // Demote below every exact-prefix candidate at equal weight.
          extraChars: Math.abs(norm.length - normFrag.length) + 1,
        });
      }
    }

    ranked.sort(compareRanked);
    for (const r of ranked) {
      if (out.length >= MAX_CANDIDATES) break;
      push(r.sug);
    }
  }

  return out.slice(0, MAX_CANDIDATES);
}

/**
 * Single-candidate wrapper kept for backwards compatibility: returns the
 * primary (ghost text) suggestion, or null when there is nothing sensible.
 */
export function getGDSuggestion(
  value: string,
  entryType?: string,
  chain?: GDChainState | null
): GDSuggestion | null {
  return getGDSuggestions(value, entryType, chain)[0] ?? null;
}

/** Exposed for tests / a future admin phrase-bank editor. */
export const __testing = {
  WORD_BANK,
  SEQUENCES,
  normalize,
  endsWithTrigger,
  detectScript,
  editDistance,
  getGDSuggestions,
  getGDSuggestion,
};
