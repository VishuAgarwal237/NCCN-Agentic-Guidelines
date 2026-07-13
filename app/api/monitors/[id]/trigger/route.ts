import { NextRequest, NextResponse } from "next/server";

// Manually trigger a monitor run (so the demo doesn't wait for the schedule).

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "EXA_API_KEY not set." }, { status: 500 });

  try {
    const res = await fetch(
      `https://api.exa.ai/monitors/${params.id}/trigger`,
      { method: "POST", headers: { "x-api-key": apiKey } }
    );
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Exa error (${res.status}): ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }
    return NextResponse.json(await res.json());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
