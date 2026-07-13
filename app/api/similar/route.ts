import { NextRequest, NextResponse } from "next/server";

// "Find similar studies" — Exa's /findSimilar endpoint. Given one source URL
// (e.g. a pivotal trial), return semantically related papers/trials. This is
// the uniquely-Exa capability: embedding similarity from a link, which keyword
// search cannot do.

const cache = new Map<string, unknown>();

export async function POST(req: NextRequest) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "EXA_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "A source URL is required." }, { status: 400 });
  }

  if (cache.has(url)) {
    return NextResponse.json({ ...(cache.get(url) as object), cached: true });
  }

  interface ExaResult {
    title?: string;
    url?: string;
    publishedDate?: string;
    highlights?: string[];
  }

  try {
    const res = await fetch("https://api.exa.ai/findSimilar", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        url,
        numResults: 5,
        excludeSourceDomain: true,
        contents: { highlights: true },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Exa /findSimilar error (${res.status}): ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const json: { results?: ExaResult[] } = await res.json();
    const payload = {
      results: (json.results ?? []).map((r) => ({
        title: r.title ?? "Untitled",
        url: r.url ?? "",
        publishedDate: r.publishedDate ?? null,
        highlight: r.highlights?.[0] ?? null,
      })),
      cached: false,
    };
    cache.set(url, payload);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach Exa /findSimilar: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
