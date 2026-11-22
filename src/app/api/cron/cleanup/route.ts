import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { handleError } from "@/lib/api";
import { serverEnv } from "@/lib/env";
import { runCleanup } from "@/services/cleanup-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${serverEnv("CRON_SECRET")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Retention job – scheduled by Vercel Cron (vercel.json) or pg_cron + pg_net */
export async function GET(req: Request) {
  try {
    if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const result = await runCleanup();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err, "GET /api/cron/cleanup");
  }
}
