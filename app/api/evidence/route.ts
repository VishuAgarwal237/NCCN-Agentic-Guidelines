import { NextRequest, NextResponse } from "next/server";
import {
  AUTHORITATIVE_DOMAINS,
  buildEvidenceQuery,
  deriveSubtype,
  SUBTYPES,
  type ReceptorStatus,
  type StageKey,
} from "@/lib/nccn";

// Simple in-process cache so repeated identical profiles during a demo
// do not re-hit the Exa API. Keyed on the derived query.
const cache = new Map<string, unknown>();

interface Grounding {
  field: string;
  citations?: { url: string; title?: string }[];
  confidence?: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "EXA_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let body: {
    stage?: StageKey;
    er?: ReceptorStatus;
    pr?: ReceptorStatus;
    her2?: ReceptorStatus;
    monthsBack?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { stage = "II", er = "positive", pr = "positive", her2 = "negative" } = body;
  const monthsBack = body.monthsBack ?? 18;

  const subtype = deriveSubtype(er, pr, her2);
  const query = buildEvidenceQuery(stage, subtype);
  const cacheKey = `${query}::${monthsBack}`;

  if (cache.has(cacheKey)) {
    return NextResponse.json({ ...(cache.get(cacheKey) as object), cached: true });
  }

  const startPublishedDate = new Date();
  startPublishedDate.setMonth(startPublishedDate.getMonth() - monthsBack);

  // Guideline-delta prompt: give Exa the exact recommendations the guideline
  // currently makes, and task it with finding what UPDATES/CONTRADICTS/EXTENDS
  // them — so the output is reasoned against our source of truth, not a
  // free-floating literature dump.
  const guidelineBullets = SUBTYPES[subtype].guideline
    .map((g, i) => `  (${i + 1}) ${g}`)
    .join("\n");

  const systemPrompt =
    "You are briefing a practicing oncologist.\n\n" +
    `The NCCN Guidelines for Patients (Invasive Breast Cancer, v2.2026, published ` +
    `Feb 27 2026) currently recommend the following for ${SUBTYPES[subtype].label} ` +
    `breast cancer:\n${guidelineBullets}\n\n` +
    "Your job: surface the 3 to 6 most important developments published after that " +
    "guideline for this subtype. Prioritise evidence that UPDATES, CONTRADICTS, or " +
    "EXTENDS one of the numbered recommendations, but also include notable new FDA " +
    "approvals, label changes, and practice-changing trial readouts even if they add " +
    "to (rather than overturn) current care. For each development, name the numbered " +
    "guideline point it most affects (e.g. 'Point 2'); if it introduces something new " +
    "rather than changing an existing point, use 'New'. Make 'whatChanged' specific and " +
    "detailed — name the drug/regimen, the trial, and key figures (median PFS/OS, " +
    "hazard ratios, pCR rates) when available. Prefer FDA, NCCN, NEJM/Lancet/JCO and " +
    "trial registries. Collapse duplicate reporting. Aim for at least 3 developments " +
    "when the evidence exists. Keep every statement grounded in the retrieved sources.";

  const exaRequest = {
    query,
    type: "auto",
    numResults: 12,
    includeDomains: AUTHORITATIVE_DOMAINS,
    startPublishedDate: startPublishedDate.toISOString(),
    contents: { highlights: true },
    systemPrompt,
    outputSchema: {
      type: "object",
      required: ["headline", "developments"],
      properties: {
        headline: {
          type: "string",
          description:
            "One-sentence summary of what has changed for this subtype since early 2026",
        },
        developments: {
          type: "array",
          description:
            "The 3–6 most important practice-relevant developments, most important first",
          items: {
            type: "object",
            required: ["title", "affectsGuidelinePoint", "whatChanged", "relevance"],
            properties: {
              title: { type: "string", description: "Short title of the development" },
              affectsGuidelinePoint: {
                type: "string",
                description:
                  "Numbered guideline point it most affects, e.g. 'Point 2', or 'New' if it introduces something not in the guideline",
              },
              whatChanged: {
                type: "string",
                description:
                  "Detailed, specific summary — name the drug/regimen, the trial, and key figures (median PFS/OS, hazard ratio, pCR rate) when available",
              },
              relevance: {
                type: "string",
                description: "Why it matters for this patient's treatment decision",
              },
            },
          },
        },
      },
    },
  };

  let exaJson: {
    results?: {
      title?: string;
      url?: string;
      publishedDate?: string;
      author?: string;
      highlights?: string[];
    }[];
    output?: { content?: unknown; grounding?: Grounding[] };
  };

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(exaRequest),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Exa API error (${res.status}): ${text.slice(0, 400)}` },
        { status: 502 }
      );
    }
    exaJson = await res.json();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach Exa API: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  const payload = {
    query,
    subtype,
    subtypeLabel: SUBTYPES[subtype].label,
    guideline: SUBTYPES[subtype].guideline,
    monthsBack,
    brief: exaJson.output?.content ?? null,
    grounding: exaJson.output?.grounding ?? [],
    sources: (exaJson.results ?? []).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      publishedDate: r.publishedDate ?? null,
      author: r.author ?? null,
      highlight: r.highlights?.[0] ?? null,
    })),
    cached: false,
  };

  cache.set(cacheKey, payload);
  return NextResponse.json(payload);
}
