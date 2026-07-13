import { NextRequest, NextResponse } from "next/server";

// Monitor run history. Without ?runId → list of runs (the "history").
// With ?runId → that run's full detail, including output.results / grounding.

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "EXA_API_KEY not set." }, { status: 500 });

  const runId = req.nextUrl.searchParams.get("runId");
  const url = runId
    ? `https://api.exa.ai/monitors/${params.id}/runs/${runId}`
    : `https://api.exa.ai/monitors/${params.id}/runs`;

  try {
    const res = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Exa error (${res.status}): ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }
    const json = await res.json();
    if (runId) return NextResponse.json({ run: json });
    return NextResponse.json({ runs: json.data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
