// Guideline anchor data derived from the treatment-planning axes in the
// NCCN Guidelines for Patients: Invasive Breast Cancer, Version 2.2026
// (Feb 27, 2026). Treatment planning is driven by clinical stage, hormone
// receptor (ER/PR) status, and HER2 status (see Chapters 2–4 of the guide).
//
// These summaries are intentionally high-level standard-of-care descriptions
// used as the *static anchor* in the demo. Exa supplies the live, cited
// evidence that has emerged since the guideline's publication cutoff.

export const GUIDELINE_META = {
  title: "NCCN Guidelines for Patients®: Invasive Breast Cancer",
  version: "Version 2.2026",
  cutoff: "February 27, 2026",
  source: "https://www.nccn.org/patientguidelines",
};

export type ReceptorStatus = "positive" | "negative";

export type SubtypeKey = "HR+/HER2-" | "HER2+" | "TNBC";

export interface Subtype {
  key: SubtypeKey;
  label: string;
  descriptor: string;
  // What the guideline anchor says about the treatment class.
  guideline: string[];
  // Seed angles used to build the live-evidence query.
  evidenceAngles: string[];
}

export const STAGES = [
  { key: "I", label: "Stage I", note: "Early, node-negative" },
  { key: "II", label: "Stage II", note: "Early / locally advanced" },
  { key: "III", label: "Stage III", note: "Locally advanced" },
  { key: "IV", label: "Stage IV", note: "Metastatic" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export const SUBTYPES: Record<SubtypeKey, Subtype> = {
  "HR+/HER2-": {
    key: "HR+/HER2-",
    label: "HR-positive / HER2-negative",
    descriptor: "ER and/or PR positive, HER2 negative — the most common subtype",
    guideline: [
      "Endocrine (hormone) therapy is the backbone of treatment — e.g. tamoxifen or an aromatase inhibitor.",
      "Surgery (lumpectomy or mastectomy) with radiation as indicated; sentinel node evaluation.",
      "CDK4/6 inhibitors are added to endocrine therapy in higher-risk and metastatic disease.",
      "Chemotherapy is guided by recurrence-risk genomic assays (e.g. 21-gene recurrence score).",
    ],
    evidenceAngles: [
      "CDK4/6 inhibitor endocrine therapy",
      "genomic recurrence score chemotherapy decision",
      "adjuvant endocrine therapy duration",
    ],
  },
  "HER2+": {
    key: "HER2+",
    label: "HER2-positive",
    descriptor: "HER2 protein over-expressed or amplified (ER/PR may be + or -)",
    guideline: [
      "HER2-targeted therapy (trastuzumab ± pertuzumab) added to chemotherapy.",
      "Neoadjuvant (pre-surgery) therapy is common; residual disease directs adjuvant escalation.",
      "Antibody-drug conjugates (e.g. T-DM1, trastuzumab deruxtecan) for residual or metastatic disease.",
      "Surgery and radiation per stage; endocrine therapy added if also HR-positive.",
    ],
    evidenceAngles: [
      "trastuzumab deruxtecan antibody drug conjugate",
      "neoadjuvant HER2 dual blockade pathologic complete response",
      "adjuvant T-DM1 residual disease",
    ],
  },
  TNBC: {
    key: "TNBC",
    label: "Triple-negative (TNBC)",
    descriptor: "ER negative, PR negative, HER2 negative",
    guideline: [
      "Chemotherapy is central; often given neoadjuvantly.",
      "Immunotherapy (PD-1/PD-L1 inhibitor, e.g. pembrolizumab) added for eligible stage II–III and PD-L1+ metastatic disease.",
      "Germline BRCA testing recommended; PARP inhibitors for BRCA-mutated disease.",
      "Sacituzumab govitecan and other ADCs in the metastatic setting.",
    ],
    evidenceAngles: [
      "pembrolizumab immunotherapy neoadjuvant",
      "PARP inhibitor BRCA mutation",
      "sacituzumab govitecan metastatic triple negative",
    ],
  },
};

// Derive the subtype from the three receptor axes the clinician sets.
export function deriveSubtype(
  er: ReceptorStatus,
  pr: ReceptorStatus,
  her2: ReceptorStatus
): SubtypeKey {
  if (her2 === "positive") return "HER2+";
  if (er === "positive" || pr === "positive") return "HR+/HER2-";
  return "TNBC";
}

// ---------------------------------------------------------------------------
// NCCN treatment recommendation engine
// Maps (stage, subtype) to a concrete suggested regimen with the treatment
// attributes the customer cares about (modality, regimen, intent, line,
// preferred status) and an NCCN Evidence & Consensus category.
// ---------------------------------------------------------------------------

export interface Recommendation {
  headline: string;
  modality: string;
  regimen: string;
  intent: string;
  lineOfTherapy: string;
  evidenceCategory: string; // NCCN Category 1 / 2A / 2B / 3
  preferredStatus: string;
  notes: string[];
}

export function recommendTreatment(
  stage: StageKey,
  subtype: SubtypeKey
): Recommendation {
  const metastatic = stage === "IV";
  const earlyHighRisk = stage === "II" || stage === "III";

  if (subtype === "HER2+") {
    if (metastatic) {
      return {
        headline: "Trastuzumab + pertuzumab + taxane (first-line)",
        modality: "Systemic therapy",
        regimen: "Docetaxel + trastuzumab + pertuzumab (THP)",
        intent: "Palliative / disease control",
        lineOfTherapy: "1L",
        evidenceCategory: "Category 1",
        preferredStatus: "Preferred",
        notes: [
          "Trastuzumab deruxtecan is preferred in the second-line setting.",
          "Add endocrine therapy if also HR-positive.",
        ],
      };
    }
    if (earlyHighRisk) {
      return {
        headline: "Neoadjuvant TCHP → surgery → adjuvant HER2 therapy",
        modality: "Systemic therapy + surgery + radiation",
        regimen: "TCHP (docetaxel, carboplatin, trastuzumab, pertuzumab) ×6",
        intent: "Curative (neoadjuvant)",
        lineOfTherapy: "Neoadjuvant",
        evidenceCategory: "Category 1",
        preferredStatus: "Preferred",
        notes: [
          "If residual invasive disease at surgery, switch adjuvant therapy to T-DM1 (per KATHERINE).",
          "If pathologic complete response, complete one year of HER2-directed therapy.",
          "Post-mastectomy / regional nodal radiation as indicated; add endocrine therapy if HR-positive.",
        ],
      };
    }
    return {
      headline: "Adjuvant paclitaxel + trastuzumab (small, node-negative)",
      modality: "Systemic therapy + surgery",
      regimen: "Paclitaxel + trastuzumab (APT regimen)",
      intent: "Curative (adjuvant)",
      lineOfTherapy: "Adjuvant",
      evidenceCategory: "Category 2A",
      preferredStatus: "Preferred",
      notes: ["Consider for stage I HER2-positive disease."],
    };
  }

  if (subtype === "HR+/HER2-") {
    if (metastatic) {
      return {
        headline: "CDK4/6 inhibitor + aromatase inhibitor (first-line)",
        modality: "Systemic therapy",
        regimen: "Ribociclib / palbociclib / abemaciclib + aromatase inhibitor",
        intent: "Palliative / disease control",
        lineOfTherapy: "1L",
        evidenceCategory: "Category 1",
        preferredStatus: "Preferred",
        notes: [
          "Test for ESR1, PIK3CA, BRCA to guide later-line targeted therapy.",
        ],
      };
    }
    return {
      headline: "Surgery + endocrine therapy ± chemo (per genomic risk)",
      modality: "Surgery + radiation + systemic therapy",
      regimen: "Aromatase inhibitor or tamoxifen; add chemo if high recurrence score",
      intent: "Curative (adjuvant)",
      lineOfTherapy: "Adjuvant",
      evidenceCategory: "Category 1",
      preferredStatus: "Preferred",
      notes: [
        "Use a 21-gene recurrence assay to decide on chemotherapy.",
        "Add adjuvant abemaciclib for high-risk, node-positive disease.",
      ],
    };
  }

  // TNBC
  if (metastatic) {
    return {
      headline: "Pembrolizumab + chemo if PD-L1+ (first-line); else chemo",
      modality: "Systemic therapy",
      regimen: "Pembrolizumab + chemotherapy (PD-L1 CPS ≥10)",
      intent: "Palliative / disease control",
      lineOfTherapy: "1L",
      evidenceCategory: "Category 1",
      preferredStatus: "Preferred",
      notes: [
        "Sacituzumab govitecan and other ADCs in later lines.",
        "PARP inhibitor if germline BRCA-mutated.",
      ],
    };
  }
  if (earlyHighRisk) {
    return {
      headline: "Neoadjuvant pembrolizumab + chemotherapy → surgery",
      modality: "Systemic therapy + surgery + radiation",
      regimen: "Pembrolizumab + carboplatin/taxane then AC (KEYNOTE-522)",
      intent: "Curative (neoadjuvant)",
      lineOfTherapy: "Neoadjuvant",
      evidenceCategory: "Category 1",
      preferredStatus: "Preferred",
      notes: ["Continue adjuvant pembrolizumab regardless of pathologic response."],
    };
  }
  return {
    headline: "Adjuvant chemotherapy",
    modality: "Surgery + systemic therapy",
    regimen: "Anthracycline/taxane-based chemotherapy",
    intent: "Curative (adjuvant)",
    lineOfTherapy: "Adjuvant",
    evidenceCategory: "Category 2A",
    preferredStatus: "Preferred",
    notes: ["Germline BRCA testing; consider PARP inhibitor if mutated."],
  };
}

// ---------------------------------------------------------------------------
// End-user personas — WHO uses this tool (from the customer's Provider/Clinical
// Personas framing). Shown on-screen so the end user + problem are explicit.
// ---------------------------------------------------------------------------

export const END_USER_PERSONAS = [
  "Oncologists",
  "Tumor-board coordinators",
  "Quality managers",
];

// ---------------------------------------------------------------------------
// Patient personas — representative patients spanning a broad range of
// characteristics (subtype × stage × biomarkers). Let a user load any persona
// to instantly drive the profile, pathway, and evidence panels.
// ---------------------------------------------------------------------------

export interface PatientPersona {
  id: string;
  name: string;
  blurb: string;
  stage: StageKey;
  er: ReceptorStatus;
  pr: ReceptorStatus;
  her2: ReceptorStatus;
  caseText?: string;
}

export const PATIENT_PERSONAS: PatientPersona[] = [
  {
    id: "jane-her2",
    name: "Jane D., 52",
    blurb: "Stage IIIA · HER2+ (ER-low)",
    stage: "III",
    er: "positive",
    pr: "negative",
    her2: "positive",
  },
  {
    id: "maria-hrpos",
    name: "Maria R., 61",
    blurb: "Stage II · HR+/HER2− postmenopausal",
    stage: "II",
    er: "positive",
    pr: "positive",
    her2: "negative",
  },
  {
    id: "aisha-tnbc",
    name: "Aisha K., 44",
    blurb: "Metastatic · TNBC (PD-L1+)",
    stage: "IV",
    er: "negative",
    pr: "negative",
    her2: "negative",
  },
  {
    id: "chen-her2-early",
    name: "Chen L., 58",
    blurb: "Stage I · HER2+ node-negative",
    stage: "I",
    er: "negative",
    pr: "negative",
    her2: "positive",
  },
  {
    id: "sofia-mbc",
    name: "Sofia M., 67",
    blurb: "Metastatic · HR+/HER2−",
    stage: "IV",
    er: "positive",
    pr: "positive",
    her2: "negative",
  },
];

// ---------------------------------------------------------------------------
// NCCN treatment PATHWAY engine
// NCCN guidelines are decision-tree algorithms: at each phase of care there are
// multiple options ranked by preference (Preferred / Other recommended / Useful
// in certain circumstances), each with an Evidence & Consensus category. This
// builds the full multi-phase pathway so the clinician can see every option
// available to the patient — not just one answer.
// ---------------------------------------------------------------------------

export type OptionTier =
  | "Preferred"
  | "Other recommended"
  | "Certain circumstances";

export interface TxOption {
  name: string;
  regimen?: string;
  tier: OptionTier;
  category: string; // NCCN Category 1 / 2A / 2B
  note?: string;
}

export interface PathwayPhase {
  phase: string;
  decisionPoint?: string;
  options: TxOption[];
}

export interface Pathway {
  setting: string;
  summary: string;
  phases: PathwayPhase[];
}

const surveillancePhase: PathwayPhase = {
  phase: "Surveillance & survivorship",
  options: [
    {
      name: "Follow-up per NCCN",
      regimen:
        "H&P every 3–6 months (yrs 1–3), annual mammography, survivorship care",
      tier: "Preferred",
      category: "Category 2A",
    },
  ],
};

export function buildPathway(stage: StageKey, subtype: SubtypeKey): Pathway {
  const metastatic = stage === "IV";
  const earlyHighRisk = stage === "II" || stage === "III";
  const setting = metastatic
    ? "Metastatic — disease control"
    : "Early-stage — curative intent";

  if (subtype === "HER2+") {
    if (metastatic) {
      return {
        setting,
        summary:
          "Sequential HER2-directed therapy; add endocrine therapy if also HR-positive.",
        phases: [
          {
            phase: "First-line systemic therapy",
            options: [
              {
                name: "THP",
                regimen: "Docetaxel + trastuzumab + pertuzumab",
                tier: "Preferred",
                category: "Category 1",
              },
              {
                name: "Paclitaxel + trastuzumab + pertuzumab",
                tier: "Other recommended",
                category: "Category 2A",
                note: "Lower-toxicity taxane alternative.",
              },
            ],
          },
          {
            phase: "Second-line systemic therapy",
            options: [
              {
                name: "Trastuzumab deruxtecan (T-DXd)",
                tier: "Preferred",
                category: "Category 1",
                note: "Monitor for interstitial lung disease.",
              },
            ],
          },
          {
            phase: "Third-line and beyond",
            options: [
              {
                name: "Tucatinib + trastuzumab + capecitabine",
                tier: "Preferred",
                category: "Category 1",
                note: "Active against brain metastases.",
              },
              {
                name: "T-DM1",
                tier: "Other recommended",
                category: "Category 1",
              },
              {
                name: "Trastuzumab + other chemo / margetuximab",
                tier: "Other recommended",
                category: "Category 2A",
              },
            ],
          },
          {
            phase: "If HR-positive",
            options: [
              {
                name: "Add endocrine therapy",
                tier: "Other recommended",
                category: "Category 2A",
              },
            ],
          },
          surveillancePhase,
        ],
      };
    }
    if (earlyHighRisk) {
      return {
        setting,
        summary:
          "Neoadjuvant HER2-directed chemo → surgery → response-adapted adjuvant therapy.",
        phases: [
          {
            phase: "Neoadjuvant systemic therapy",
            options: [
              {
                name: "TCHP ×6",
                regimen: "Docetaxel + carboplatin + trastuzumab + pertuzumab",
                tier: "Preferred",
                category: "Category 1",
              },
              {
                name: "AC → THP",
                regimen: "Doxorubicin/cyclophosphamide then taxane + HP",
                tier: "Other recommended",
                category: "Category 1",
              },
              {
                name: "TCH",
                regimen: "Docetaxel + carboplatin + trastuzumab (omit pertuzumab)",
                tier: "Certain circumstances",
                category: "Category 1",
                note: "If pertuzumab unavailable / lower-risk.",
              },
            ],
          },
          {
            phase: "Locoregional therapy (surgery)",
            options: [
              {
                name: "Breast-conserving surgery + SLNB",
                tier: "Preferred",
                category: "Category 1",
                note: "If adequately downstaged.",
              },
              {
                name: "Total mastectomy ± reconstruction",
                tier: "Other recommended",
                category: "Category 1",
              },
            ],
          },
          {
            phase: "Adjuvant systemic therapy",
            decisionPoint: "Based on pathologic response at surgery",
            options: [
              {
                name: "If pCR → complete trastuzumab ± pertuzumab to 1 year",
                tier: "Preferred",
                category: "Category 1",
              },
              {
                name: "If residual disease → T-DM1 ×14 cycles",
                tier: "Preferred",
                category: "Category 1",
                note: "KATHERINE trial.",
              },
              {
                name: "If HR+ → add endocrine therapy ± neratinib",
                tier: "Other recommended",
                category: "Category 2A",
              },
            ],
          },
          {
            phase: "Adjuvant radiation",
            options: [
              {
                name: "Post-mastectomy chest wall + regional nodal RT",
                tier: "Preferred",
                category: "Category 1",
                note: "As indicated by stage / nodal status.",
              },
            ],
          },
          surveillancePhase,
        ],
      };
    }
    // Stage I HER2+
    return {
      setting,
      summary: "Surgery first, then adjuvant HER2-directed therapy.",
      phases: [
        {
          phase: "Surgery",
          options: [
            {
              name: "BCS + SLNB or mastectomy",
              tier: "Preferred",
              category: "Category 1",
            },
          ],
        },
        {
          phase: "Adjuvant systemic therapy",
          options: [
            {
              name: "Paclitaxel + trastuzumab (APT)",
              tier: "Preferred",
              category: "Category 2A",
              note: "For small, node-negative tumors.",
            },
            {
              name: "TCH",
              tier: "Other recommended",
              category: "Category 1",
            },
          ],
        },
        surveillancePhase,
      ],
    };
  }

  if (subtype === "HR+/HER2-") {
    if (metastatic) {
      return {
        setting,
        summary:
          "Endocrine-based therapy with CDK4/6 inhibition first; biomarker-directed later lines.",
        phases: [
          {
            phase: "First-line systemic therapy",
            options: [
              {
                name: "CDK4/6 inhibitor + aromatase inhibitor",
                regimen: "Ribociclib / abemaciclib / palbociclib + AI",
                tier: "Preferred",
                category: "Category 1",
              },
              {
                name: "CDK4/6 inhibitor + fulvestrant",
                tier: "Other recommended",
                category: "Category 1",
              },
            ],
          },
          {
            phase: "Second-line systemic therapy",
            decisionPoint: "Directed by biomarker testing (ESR1, PIK3CA, BRCA)",
            options: [
              {
                name: "PIK3CA+ → alpelisib + fulvestrant",
                tier: "Preferred",
                category: "Category 1",
              },
              {
                name: "ESR1+ → elacestrant",
                tier: "Preferred",
                category: "Category 1",
              },
              {
                name: "gBRCA+ → olaparib or talazoparib",
                tier: "Preferred",
                category: "Category 1",
              },
              {
                name: "Otherwise → capivasertib + fulvestrant / everolimus + endocrine",
                tier: "Other recommended",
                category: "Category 1",
              },
            ],
          },
          {
            phase: "Later lines",
            options: [
              {
                name: "Trastuzumab deruxtecan (if HER2-low)",
                tier: "Preferred",
                category: "Category 1",
              },
              {
                name: "Sacituzumab govitecan / sequential chemo",
                tier: "Other recommended",
                category: "Category 1",
              },
            ],
          },
          surveillancePhase,
        ],
      };
    }
    return {
      setting,
      summary:
        "Surgery + endocrine therapy backbone; chemo and escalation are risk-adapted.",
      phases: [
        {
          phase: "Locoregional therapy",
          options: [
            {
              name: "Breast-conserving surgery + radiation",
              tier: "Preferred",
              category: "Category 1",
            },
            {
              name: "Total mastectomy ± reconstruction",
              tier: "Other recommended",
              category: "Category 1",
            },
          ],
        },
        {
          phase: "Adjuvant endocrine therapy",
          options: [
            {
              name: "Aromatase inhibitor ×5–10 yr (postmenopausal)",
              tier: "Preferred",
              category: "Category 1",
            },
            {
              name: "Tamoxifen ± ovarian suppression (premenopausal)",
              tier: "Preferred",
              category: "Category 1",
            },
          ],
        },
        {
          phase: "Adjuvant chemotherapy",
          decisionPoint: "Directed by 21-gene recurrence score",
          options: [
            {
              name: "Low score → omit chemotherapy",
              tier: "Preferred",
              category: "Category 1",
            },
            {
              name: "High score → add TC or AC→T",
              tier: "Preferred",
              category: "Category 1",
            },
          ],
        },
        {
          phase: "Risk-adapted escalation",
          options: [
            {
              name: "High-risk node+ → adjuvant abemaciclib ×2 yr",
              tier: "Preferred",
              category: "Category 1",
            },
            {
              name: "gBRCA+ → olaparib ×1 yr",
              tier: "Other recommended",
              category: "Category 1",
            },
          ],
        },
        surveillancePhase,
      ],
    };
  }

  // TNBC
  if (metastatic) {
    return {
      setting,
      summary: "Immunotherapy or PARP inhibition first-line where eligible; ADCs next.",
      phases: [
        {
          phase: "First-line systemic therapy",
          decisionPoint: "Directed by PD-L1 CPS and germline BRCA",
          options: [
            {
              name: "PD-L1 CPS ≥10 → pembrolizumab + chemotherapy",
              tier: "Preferred",
              category: "Category 1",
            },
            {
              name: "gBRCA+ → PARP inhibitor (olaparib / talazoparib)",
              tier: "Preferred",
              category: "Category 1",
            },
            {
              name: "PD-L1 negative → single-agent chemotherapy",
              tier: "Other recommended",
              category: "Category 2A",
            },
          ],
        },
        {
          phase: "Second-line systemic therapy",
          options: [
            {
              name: "Sacituzumab govitecan",
              tier: "Preferred",
              category: "Category 1",
            },
            {
              name: "Trastuzumab deruxtecan (if HER2-low)",
              tier: "Other recommended",
              category: "Category 1",
            },
          ],
        },
        {
          phase: "Later lines",
          options: [
            {
              name: "Sequential single-agent chemotherapy",
              tier: "Other recommended",
              category: "Category 2A",
            },
          ],
        },
        surveillancePhase,
      ],
    };
  }
  if (earlyHighRisk) {
    return {
      setting,
      summary: "Neoadjuvant chemo-immunotherapy → surgery → response/BRCA-adapted adjuvant.",
      phases: [
        {
          phase: "Neoadjuvant systemic therapy",
          options: [
            {
              name: "Pembrolizumab + carboplatin/taxane → AC",
              regimen: "KEYNOTE-522 regimen",
              tier: "Preferred",
              category: "Category 1",
            },
          ],
        },
        {
          phase: "Surgery + radiation",
          options: [
            {
              name: "BCS + RT or mastectomy",
              tier: "Preferred",
              category: "Category 1",
            },
          ],
        },
        {
          phase: "Adjuvant systemic therapy",
          decisionPoint: "Based on pathologic response and germline BRCA",
          options: [
            {
              name: "Pembrolizumab to complete 1 year",
              tier: "Preferred",
              category: "Category 1",
            },
            {
              name: "Residual disease → add capecitabine",
              tier: "Other recommended",
              category: "Category 1",
            },
            {
              name: "gBRCA+ → olaparib ×1 yr",
              tier: "Other recommended",
              category: "Category 1",
            },
          ],
        },
        surveillancePhase,
      ],
    };
  }
  // Stage I TNBC
  return {
    setting,
    summary: "Surgery then adjuvant chemotherapy.",
    phases: [
      {
        phase: "Surgery + radiation",
        options: [
          {
            name: "BCS + RT or mastectomy",
            tier: "Preferred",
            category: "Category 1",
          },
        ],
      },
      {
        phase: "Adjuvant systemic therapy",
        options: [
          {
            name: "Anthracycline/taxane chemotherapy",
            tier: "Preferred",
            category: "Category 2A",
          },
          {
            name: "gBRCA+ → consider olaparib",
            tier: "Other recommended",
            category: "Category 1",
          },
        ],
      },
      surveillancePhase,
    ],
  };
}

// ---------------------------------------------------------------------------
// Clinical-case extractor
// Deterministic parsing of the labeled fields in a clinical note. Runs
// locally (no API) and populates the profile toggles; a clinician can correct
// any value. Mirrors the customer's "Key Clinical Entities" extraction.
// ---------------------------------------------------------------------------

export interface ExtractedCase {
  stage: StageKey;
  er: ReceptorStatus;
  pr: ReceptorStatus;
  her2: ReceptorStatus;
  entities: { label: string; value: string }[];
  warnings: string[];
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function classifyReceptor(context: string | null): ReceptorStatus | null {
  if (!context) return null;
  const c = context.toLowerCase();
  if (/(^|[^a-z])negative|<\s*1\s*%|\bnot\b/.test(c) && !/positive/.test(c))
    return "negative";
  if (/positive|amplified|\b([1-9]\d?|100)\s*%/.test(c)) return "positive";
  return null;
}

export function extractCaseProfile(raw: string): ExtractedCase {
  const text = raw.replace(/\r/g, "");
  const warnings: string[] = [];

  // --- Receptor status ---
  const erCtx = firstMatch(text, /\bER\b(?:\s*status)?\s*[:\-]?\s*([^\n.]{0,40})/i);
  const prCtx = firstMatch(text, /\bPR\b(?:\s*status)?\s*[:\-]?\s*([^\n.]{0,40})/i);
  const her2Ctx = firstMatch(
    text,
    /HER2[^\n]*?(?:IHC|FISH|status)?\s*[:\-]?\s*([^\n.]{0,40})/i
  );

  let er = classifyReceptor(erCtx);
  let pr = classifyReceptor(prCtx);
  let her2 = classifyReceptor(her2Ctx);

  // HER2 special cases: 3+ / amplified => positive; 0 or 1+ or "not amplified" => negative
  if (/her2[^\n]*(3\+|amplified)/i.test(text) && !/not amplified/i.test(text))
    her2 = "positive";
  if (/her2[^\n]*(not amplified|negative|\b0\b|1\+)/i.test(text) && her2 !== "positive")
    her2 = "negative";

  if (er === null) {
    er = "positive";
    warnings.push("ER status not confidently parsed — defaulted to positive.");
  }
  if (pr === null) {
    pr = "negative";
    warnings.push("PR status not confidently parsed — defaulted to negative.");
  }
  if (her2 === null) {
    her2 = "negative";
    warnings.push("HER2 status not confidently parsed — defaulted to negative.");
  }

  // --- Stage ---
  let stage: StageKey = "II";
  if (/stage\s*IV|metastatic|\bM1\b/i.test(text)) stage = "IV";
  else if (/stage\s*III/i.test(text)) stage = "III";
  else if (/stage\s*II/i.test(text)) stage = "II";
  else if (/stage\s*I\b/i.test(text)) stage = "I";
  else warnings.push("Stage not found — defaulted to Stage II.");

  // --- Entities for display ---
  const labels: [string, RegExp][] = [
    ["Histology", /Histology\s*[:\-]?\s*([^\n]{0,60})/i],
    ["Grade", /Grade\s*([0-9IVX]+)/i],
    ["Clinical stage", /(c?T\d\s*N\d\s*M\d[^\n]{0,20})/i],
    ["ER", /\bER\b\s*[:\-]?\s*([^\n.]{0,30})/i],
    ["PR", /\bPR\b\s*[:\-]?\s*([^\n.]{0,30})/i],
    ["HER2 IHC", /HER2\s*IHC\s*[:\-]?\s*([^\n.]{0,20})/i],
    ["HER2 FISH", /HER2\s*FISH\s*[:\-]?\s*([^\n.]{0,30})/i],
    ["Ki-67", /Ki-?67\s*[:\-]?\s*([^\n.]{0,15})/i],
    ["PD-L1", /PD-?L1[^\n]*?[:\-]?\s*([^\n.]{0,20})/i],
    ["TMB", /(?:Tumor Mutational Burden|TMB)\s*[:\-]?\s*([^\n.]{0,20})/i],
    ["ECOG", /ECOG\s*[:\-]?\s*([^\n.]{0,10})/i],
  ];
  const entities: { label: string; value: string }[] = [];
  for (const [label, re] of labels) {
    const v = firstMatch(text, re);
    if (v) entities.push({ label, value: v });
  }

  return { stage, er, pr, her2, entities, warnings };
}

export const SAMPLE_CASE = `Fictional Educational Case — Stage III HER2-Positive Breast Cancer
Patient: Jane Doe (fictional), 52F, ECOG 0, postmenopausal.

History: 5.8 cm irregular spiculated left breast mass with abnormal axillary nodes.
Core biopsy: invasive ductal carcinoma. Initial clinical stage cT3N1M0.

Pathology:
Histology: Invasive ductal carcinoma, Nottingham Grade 3.
Lymphovascular invasion: Present.

Biomarkers:
ER: 10% weak positive
PR: <1% negative
HER2 IHC: 3+ positive
HER2 FISH: Amplified (ratio 5.8)
Ki-67: 65%
PD-L1 CPS: 5
Tumor Mutational Burden: 3 mut/Mb

Clinical Stage: AJCC 8th Edition cT3N1M0, Stage IIIA.
Germline: negative for BRCA1, BRCA2, PALB2, ATM, CHEK2, TP53.

Clinical questions for NCCN review: neoadjuvant systemic therapy? HER2-targeted regimen?
Management of residual disease? Post-mastectomy radiation? Role of endocrine therapy in ER-low disease?`;

// Authoritative domains Exa is scoped to — oncology guideline bodies,
// primary literature, trials registry, and the FDA.
export const AUTHORITATIVE_DOMAINS = [
  "nccn.org",
  "fda.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "ascopubs.org",
  "clinicaltrials.gov",
  "cancer.gov",
  "nejm.org",
  "thelancet.com",
];

// Build a focused evidence query from the selected clinical profile.
export function buildEvidenceQuery(
  stage: StageKey,
  subtype: SubtypeKey
): string {
  const s = SUBTYPES[subtype];
  const setting = stage === "IV" ? "metastatic" : `stage ${stage} early-stage`;
  return `Latest practice-changing evidence and FDA approvals for ${setting} ${s.label} invasive breast cancer: ${s.evidenceAngles.join(", ")}`;
}

// Guideline-source domains for grounding the NCCN decision tree via Exa —
// the guideline bodies and NCI PDQ where the actual algorithms live.
export const GUIDELINE_DOMAINS = [
  "nccn.org",
  "cancer.gov",
  "ncbi.nlm.nih.gov",
  "ascopubs.org",
];

// Build the query that asks Exa for the NCCN decision algorithm for a profile.
export function buildPathwayQuery(stage: StageKey, subtype: SubtypeKey): string {
  const s = SUBTYPES[subtype];
  const setting = stage === "IV" ? "metastatic" : `stage ${stage} early-stage`;
  return `NCCN treatment decision algorithm and recommended treatment options for ${setting} ${s.label} invasive breast cancer, including preferred versus other recommended regimens and NCCN evidence and consensus categories`;
}
