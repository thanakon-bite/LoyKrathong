import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConfigError } from "@/lib/env";
import { getCurrentUser, type AuthUser } from "@/lib/supabase/server";
import { logError } from "@/services/logger";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function noStore<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Maps any thrown error to a safe JSON response (internal details are logged, never leaked). */
export async function handleError(err: unknown, source: string) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "ข้อมูลไม่ถูกต้อง", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400 },
    );
  }
  if (err instanceof ConfigError) {
    console.error(`[${source}]`, err.message);
    return NextResponse.json({ error: { code: "not_configured", message: "ระบบยังไม่ได้ตั้งค่าบริการภายนอก กรุณาติดต่อผู้ดูแล" } }, { status: 503 });
  }
  await logError(source, err);
  return NextResponse.json({ error: { code: "internal", message: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" } }, { status: 500 });
}

export function getClientIp(req: Request) {
  // set by Netlify's edge from the TCP connection – not spoofable by the client
  const nf = req.headers.get("x-nf-client-connection-ip");
  if (nf) return nf.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "unauthorized", "กรุณาเริ่มเซสชันก่อนใช้งาน");
  return user;
}

/** Reject cross-site form posts for state-changing JSON endpoints. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (host && new URL(origin).host !== host) throw new ApiError(403, "forbidden_origin", "คำขอไม่ได้มาจากเว็บไซต์นี้");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(403, "forbidden_origin", "คำขอไม่ได้มาจากเว็บไซต์นี้");
  }
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, "payload_too_large", "ข้อมูลมีขนาดใหญ่เกินไป");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "รูปแบบข้อมูลไม่ถูกต้อง");
  }
}
