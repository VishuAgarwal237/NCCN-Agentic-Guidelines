import { NextRequest, NextResponse } from "next/server";
import {
  SUBTYPES,
  STAGES,
  AUTHORITATIVE_DOMAINS,
  type StageKey,
  type SubtypeKey,
} from "@/lib/nccn";

// Question-first workflow: an oncologist types a free-text clinical question
// about the current patient. We use Exa /search with type="deep" + a text
// outputSchema for a thorough, grounded answer with field-level citations —
// higher quality than /answer for quantitative or multi-step clinical questions.

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "EXA_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let body: { question?: string; stage?: StageKey; subtype?: SubtypeKey };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const question = (body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "Please enter a question." }, { status: 400 });
  }

  // Ground the question in the current patient profile so the answer is scoped.
  const stageLabel = STAGES.find((s) => s.key === body.stage)?.label ?? "invasive";
  const subtypeLabel = body.subtype ? SUBTYPES[body.subtype].label : "";
  const context =
    subtypeLabel || body.stage
      ? ` (patient context: ${stageLabel} ${subtypeLabel} breast cancer)`
      : "";
  const query = `${question}${context}`;

  interface Grounding {
    field: string;
    citations?: { url: string; title?: string; publishedDate?: string }[];
  }

  const exaRequest = {
    query,
    type: "deep",
    numResults: 12,
    includeDomains: AUTHORITATIVE_DOMAINS,
    contents: { highlights: true },
    systemPrompt:
      "You are answering a practicing oncologist's question about breast cancer. " +
      "Give a substantive, specific, clinically useful answer grounded in the retrieved " +
      "sources — not a one-line definition. When the question involves quantitative " +
      "outcomes (e.g. progression-free survival, overall survival, response rate), report " +
      "concrete figures: median PFS/OS in months, hazard ratios with confidence intervals, " +
      "and the trial names and drugs they belong to, comparing the most relevant recent " +
      "agents. If the user asks for a chart or Kaplan–Meier curve, state briefly that you " +
      "cannot render an image, then summarize the underlying PFS data in a compact table or " +
      "list and cite the trial publications that contain the curves. Prefer FDA labels, " +
      "NEJM / Lancet / JCO, and NCCN. Keep every statement grounded in a source.",
    outputSchema: {
      type: "text",
      description:
        "A thorough, grounded answer for an oncologist, with concrete figures and trial names where relevant",
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
        { error: `Exa error (${res.status}): ${text.slice(0, 400)}` },
        { status: 502 }
      );
    }

    const json: {
      output?: { content?: unknown; grounding?: Grounding[] };
      results?: { title?: string; url?: string; publishedDate?: string }[];
    } = await res.json();

    const answer =
      typeof json.output?.content === "string"
        ? json.output.content
        : JSON.stringify(json.output?.content ?? "");

    // Prefer grounded citations; fall back to retrieved sources.
    const seen = new Set<string>();
    const citations: { title: string; url: string; publishedDate: string | null }[] = [];
    for (const g of json.output?.grounding ?? []) {
      for (const c of g.citations ?? []) {
        if (c.url && !seen.has(c.url)) {
          seen.add(c.url);
          citations.push({
            title: c.title ?? "Source",
            url: c.url,
            publishedDate: c.publishedDate ?? null,
          });
        }
      }
    }
    if (citations.length === 0) {
      for (const r of json.results ?? []) {
        if (r.url && !seen.has(r.url)) {
          seen.add(r.url);
          citations.push({
            title: r.title ?? "Source",
            url: r.url,
            publishedDate: r.publishedDate ?? null,
          });
        }
      }
    }

    return NextResponse.json({ answer, citations: citations.slice(0, 10) });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach Exa: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
