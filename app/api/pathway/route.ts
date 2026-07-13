import { NextRequest, NextResponse } from "next/server";
import {
  GUIDELINE_DOMAINS,
  buildPathwayQuery,
  deriveSubtype,
  SUBTYPES,
  type ReceptorStatus,
  type StageKey,
} from "@/lib/nccn";

// Grounds the NCCN treatment decision tree in REAL guideline content via Exa.
// This is where Exa is uniquely beneficial: it retrieves the current NCCN /
// NCI algorithm from authoritative sources and returns it as structured,
// cited steps — rather than relying on a hardcoded local tree.

const cache = new Map<string, unknown>();

interface Grounding {
  field: string;
  citations?: { url: string; title?: string }[];
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
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { stage = "II", er = "positive", pr = "positive", her2 = "negative" } = body;
  const subtype = deriveSubtype(er, pr, her2);
  const query = buildPathwayQuery(stage, subtype);

  if (cache.has(query)) {
    return NextResponse.json({ ...(cache.get(query) as object), cached: true });
  }

  const exaRequest = {
    query,
    type: "auto",
    numResults: 8,
    includeDomains: GUIDELINE_DOMAINS,
    contents: { highlights: true },
    systemPrompt:
      "You are extracting the NCCN treatment decision algorithm for a specific " +
      "breast-cancer patient profile. Return it as an ordered list of steps. Each " +
      "step is ONE phase of care (e.g. neoadjuvant systemic therapy, surgery, " +
      "adjuvant therapy, radiation, surveillance) paired with ONE treatment option " +
      "in that phase. Tag each option with its NCCN preference tier (Preferred, " +
      "Other recommended, or Useful in certain circumstances) and its NCCN Evidence " +
      "and Consensus category (Category 1, 2A, or 2B). Order steps by the sequence of " +
      "care. Ground every step in NCCN or NCI guideline sources.",
    outputSchema: {
      type: "object",
      required: ["steps"],
      properties: {
        steps: {
          type: "array",
          description: "Ordered NCCN decision-tree steps for this patient profile",
          items: {
            type: "object",
            required: ["phase", "option", "tier", "category"],
            properties: {
              phase: {
                type: "string",
                description: "Phase of care, e.g. 'Neoadjuvant systemic therapy'",
              },
              option: {
                type: "string",
                description: "One treatment option within this phase",
              },
              tier: {
                type: "string",
                description:
                  "Preferred | Other recommended | Useful in certain circumstances",
              },
              category: {
                type: "string",
                description: "NCCN Evidence & Consensus category, e.g. 'Category 1'",
              },
            },
          },
        },
      },
    },
  };

  let exaJson: {
    results?: { title?: string; url?: string; publishedDate?: string }[];
    output?: { content?: { steps?: unknown[] }; grounding?: Grounding[] };
  };

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
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

  // Collect unique citation URLs across all grounded fields.
  const seen = new Set<string>();
  const citations: { url: string; title?: string }[] = [];
  for (const g of exaJson.output?.grounding ?? []) {
    for (const c of g.citations ?? []) {
      if (c.url && !seen.has(c.url)) {
        seen.add(c.url);
        citations.push(c);
      }
    }
  }

  const payload = {
    query,
    subtypeLabel: SUBTYPES[subtype].label,
    steps: exaJson.output?.content?.steps ?? [],
    citations,
    cached: false,
  };

  cache.set(query, payload);
  return NextResponse.json(payload);
}
