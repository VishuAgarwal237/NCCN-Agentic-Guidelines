import { NextRequest, NextResponse } from "next/server";
import { MONITOR_PRESETS, MONITOR_DOMAINS } from "@/lib/nccn";

// Exa Monitors — scheduled recurring searches that watch the web for change
// (new NCCN versions, FDA approvals, regulatory/competitor news). Proxies the
// Exa Monitors API. GET lists monitors; POST creates one from a preset.

const EXA = "https://api.exa.ai/monitors";

export async function GET() {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "EXA_API_KEY not set." }, { status: 500 });

  try {
    const res = await fetch(EXA, { headers: { "x-api-key": apiKey } });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Exa error (${res.status}): ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }
    const json = await res.json();
    return NextResponse.json({ monitors: json.data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "EXA_API_KEY not set." }, { status: 500 });

  let body: { presetId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const preset = MONITOR_PRESETS.find((p) => p.id === body.presetId);
  if (!preset) return NextResponse.json({ error: "Unknown preset." }, { status: 400 });

  // Webhook must be a real, reachable HTTPS URL (Exa rejects localhost and
  // placeholder hosts). We use this deployment's own no-op receiver and read
  // results via the runs API. Only works when served over HTTPS (production).
  const base = process.env.MONITOR_WEBHOOK_BASE?.replace(/\/$/, "") || req.nextUrl.origin;
  const webhookUrl = `${base}/api/monitor-webhook`;
  if (!webhookUrl.startsWith("https")) {
    return NextResponse.json(
      {
        error:
          "Monitors need a public HTTPS URL for the webhook — create them on the deployed site, not localhost.",
      },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(EXA, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        name: preset.name,
        search: {
          query: preset.query,
          numResults: 8,
          includeDomains: MONITOR_DOMAINS,
          contents: { highlights: true },
        },
        trigger: { type: "interval", period: "1d" },
        webhook: { url: webhookUrl, events: ["monitor.run.completed"] },
        metadata: { presetId: preset.id },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Exa error (${res.status}): ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }
    const json = await res.json();
    // Never return the webhookSecret to the client.
    delete json.webhookSecret;
    return NextResponse.json({ monitor: json });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
