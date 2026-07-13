import { NextResponse } from "next/server";

// No-op receiver so monitors have a valid HTTPS webhook target. Results are
// read via the runs API; this endpoint only needs to accept deliveries.

export async function POST() {
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
