import { NextRequest, NextResponse } from "next/server";
import {
  buildTrialsQuery,
  deriveSubtype,
  SUBTYPES,
  type ReceptorStatus,
  type StageKey,
} from "@/lib/nccn";

// Recruiting trials — Exa /search scoped to ClinicalTrials.gov for the patient
// profile. Raw results so links point to the actual trial pages.

const cache = new Map<string, unknown>();

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

  const { stage = "II", er = "positive", pr = "positive", her2 = "negative" } = body;
  const subtype = deriveSubtype(er, pr, her2);
  const query = buildTrialsQuery(stage, subtype);
  if (cache.has(query)) {
    return NextResponse.json({ ...(cache.get(query) as object), cached: true });
  }

  interface ExaResult {
    title?: string;
    url?: string;
    publishedDate?: string;
    highlights?: string[];
  }

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: 24,
        includeDomains: ["clinicaltrials.gov"],
        contents: { highlights: true },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Exa error (${res.status}): ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }
    // NCT IDs are assigned sequentially, so a higher number ≈ more recently
    // registered — a good "newest first" proxy when pages carry no date.
    const nctNum = (url: string) => {
      const m = url.match(/NCT0*(\d+)/i);
      return m ? parseInt(m[1], 10) : -Infinity;
    };
    const json: { results?: ExaResult[] } = await res.json();
    const seen = new Set<string>();
    const trials = (json.results ?? [])
      .map((r) => {
        const url = r.url ?? "";
        return {
          title: r.title ?? "Untitled trial",
          url,
          nct: (url.match(/NCT\d+/i)?.[0] ?? "").toUpperCase(),
          publishedDate: r.publishedDate ?? null,
          highlight: r.highlights?.[0] ?? null,
        };
      })
      // Keep only individual trial pages, de-duplicated by NCT id.
      .filter((t) => {
        if (!t.nct || seen.has(t.nct)) return false;
        seen.add(t.nct);
        return true;
      })
      .sort((a, b) => nctNum(b.url) - nctNum(a.url));
    const payload = { subtypeLabel: SUBTYPES[subtype].label, trials, cached: false };
    cache.set(query, payload);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach Exa: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
