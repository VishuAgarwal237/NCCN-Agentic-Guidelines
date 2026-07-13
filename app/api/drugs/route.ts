import { NextRequest, NextResponse } from "next/server";
import {
  FDA_DOMAINS,
  buildDrugsQuery,
  deriveSubtype,
  SUBTYPES,
  type ReceptorStatus,
  type StageKey,
} from "@/lib/nccn";

// Deep drug landscape — Exa /search with type="deep" + outputSchema.
// Enrichment use case: recently FDA-approved drugs for the subtype, structured
// into drug / sponsor / indication with field-level citations.

export const maxDuration = 60;

const cache = new Map<string, unknown>();

interface Grounding {
  field: string;
  citations?: { url: string; title?: string }[];
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "EXA_API_KEY not set." }, { status: 500 });
  }

  let body: { stage?: StageKey; er?: ReceptorStatus; pr?: ReceptorStatus; her2?: ReceptorStatus };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { er = "positive", pr = "positive", her2 = "negative" } = body;
  const subtype = deriveSubtype(er, pr, her2);
  const query = buildDrugsQuery(subtype);
  if (cache.has(query)) {
    return NextResponse.json({ ...(cache.get(query) as object), cached: true });
  }

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const exaRequest = {
    query,
    type: "deep",
    numResults: 10,
    includeDomains: FDA_DOMAINS,
    startPublishedDate: twoYearsAgo.toISOString(),
    contents: { highlights: true },
    systemPrompt:
      "List only drugs with an FDA approval or new indication in breast cancer within " +
      "the last two years. For each, give the generic/brand name, the sponsor company, " +
      "and the approved indication. Prefer FDA sources. Keep everything grounded.",
    outputSchema: {
      type: "object",
      required: ["drugs"],
      properties: {
        drugs: {
          type: "array",
          description: "Recently FDA-approved breast-cancer drugs",
          items: {
            type: "object",
            required: ["name", "sponsor", "indication"],
            properties: {
              name: { type: "string", description: "Drug name (generic / brand)" },
              sponsor: { type: "string", description: "Sponsor / manufacturer" },
              indication: { type: "string", description: "Approved indication" },
              approvalDate: { type: "string", description: "Approval date if known" },
            },
          },
        },
      },
    },
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
        { error: `Exa error (${res.status}): ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }
    const json: {
      output?: { content?: { drugs?: unknown[] }; grounding?: Grounding[] };
    } = await res.json();

    const seen = new Set<string>();
    const citations: { url: string }[] = [];
    for (const g of json.output?.grounding ?? []) {
      for (const c of g.citations ?? []) {
        if (c.url && !seen.has(c.url)) {
          seen.add(c.url);
          citations.push(c);
        }
      }
    }

    const payload = {
      subtypeLabel: SUBTYPES[subtype].label,
      drugs: json.output?.content?.drugs ?? [],
      citations,
      cached: false,
    };
    cache.set(query, payload);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach Exa: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
