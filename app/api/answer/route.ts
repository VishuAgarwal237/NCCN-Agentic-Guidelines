import { NextRequest, NextResponse } from "next/server";
import { SUBTYPES, STAGES, type StageKey, type SubtypeKey } from "@/lib/nccn";

// Question-first workflow: an oncologist types a free-text clinical question
// about the current patient. We hit Exa's /answer endpoint, which returns a
// grounded natural-language answer with inline citations.

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
  const stageLabel =
    STAGES.find((s) => s.key === body.stage)?.label ?? "invasive";
  const subtypeLabel = body.subtype ? SUBTYPES[body.subtype].label : "";
  const context =
    subtypeLabel || body.stage
      ? ` (patient context: ${stageLabel} ${subtypeLabel} breast cancer)`
      : "";

  const query = `${question}${context}. Answer for a practicing oncologist, citing recent primary literature, FDA labels, or guideline sources.`;

  interface Citation {
    url?: string;
    title?: string;
    publishedDate?: string;
    author?: string;
  }

  try {
    const res = await fetch("https://api.exa.ai/answer", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ query, text: false }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Exa /answer error (${res.status}): ${text.slice(0, 400)}` },
        { status: 502 }
      );
    }

    const json: { answer?: string; citations?: Citation[] } = await res.json();
    return NextResponse.json({
      answer: json.answer ?? "",
      citations: (json.citations ?? []).map((c) => ({
        title: c.title ?? "Untitled",
        url: c.url ?? "",
        publishedDate: c.publishedDate ?? null,
        author: c.author ?? null,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach Exa /answer: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
