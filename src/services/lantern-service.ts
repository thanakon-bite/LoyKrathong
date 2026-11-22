import "server-only";
import { ApiError } from "@/lib/api";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { DEFAULT_TEXT_CONFIG } from "@/lib/lantern/designs";
import { imageConfigSchema, textConfigSchema, type LanternInput } from "@/lib/security/validation";
import type { Decoration, LanternDesignId, MyLanternSummary, PublicLantern } from "@/types/lantern";
import type { FestivalPackage } from "@/types/payment";
import { assertOwnedAsset, signMany } from "./storage-service";

export interface LanternRow {
  id: string;
  user_id: string;
  display_name: string;
  wish_message: string;
  blessing_message: string;
  extra_message: string;
  lantern_type: string;
  lantern_color: string;
  decoration: string | null;
  text_config: unknown;
  image_config: unknown;
  drawing_data: { path?: string } | null;
  image_url: string | null;
  status: string;
  created_at: string;
  released_at: string | null;
  expires_at: string | null;
}

export const PUBLIC_COLUMNS =
  "id, user_id, display_name, wish_message, blessing_message, extra_message, lantern_type, lantern_color, decoration, text_config, image_config, drawing_data, image_url, status, created_at, released_at, expires_at";

/** Maximum lanterns returned to one client (it renders at most 50) */
export const ACTIVE_FETCH_LIMIT = 150;

async function toPublic(rows: LanternRow[]): Promise<PublicLantern[]> {
  const now = Date.now();
  const toSign: Array<{ path: string; expiresInSeconds: number }> = [];
  for (const r of rows) {
    const remaining = (Date.parse(r.expires_at ?? "") - now) / 1000;
    if (r.image_url) toSign.push({ path: r.image_url, expiresInSeconds: remaining });
    if (r.drawing_data?.path) toSign.push({ path: r.drawing_data.path, expiresInSeconds: remaining });
  }
  const urls = toSign.length ? await signMany(toSign) : new Map<string, string>();

  return rows.map((r) => {
    const tc = textConfigSchema.safeParse(r.text_config);
    const ic = imageConfigSchema.safeParse(r.image_config);
    return {
      id: r.id,
      ownerId: r.user_id,
      displayName: r.display_name,
      wishMessage: r.wish_message,
      blessingMessage: r.blessing_message,
      extraMessage: r.extra_message,
      design: r.lantern_type as LanternDesignId,
      color: r.lantern_color,
      decoration: (r.decoration as Decoration | null) ?? null,
      textConfig: tc.success ? tc.data : DEFAULT_TEXT_CONFIG,
      imageConfig: ic.success ? ic.data : null,
      imageSrc: r.image_url ? (urls.get(r.image_url) ?? null) : null,
      drawingSrc: r.drawing_data?.path ? (urls.get(r.drawing_data.path) ?? null) : null,
      releasedAt: r.released_at!,
      expiresAt: r.expires_at!,
    };
  });
}

/** Active lanterns (server time decides expiry – never the client clock) */
export async function listActiveLanterns(limit = ACTIVE_FETCH_LIMIT) {
  const nowIso = new Date().toISOString();
  const { data, error } = await getAdminSupabase()
    .from("lanterns")
    .select(PUBLIC_COLUMNS)
    .eq("status", "active")
    .gt("expires_at", nowIso)
    .order("released_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return toPublic(data as LanternRow[]);
}

export async function getActiveLanternsByIds(ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await getAdminSupabase()
    .from("lanterns")
    .select(PUBLIC_COLUMNS)
    .in("id", ids)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());
  if (error) throw new Error(error.message);
  return toPublic(data as LanternRow[]);
}

/** Includes the owner's own lanterns even when the caller is checking right after release */
export async function getActiveLantern(id: string) {
  const [lantern] = await getActiveLanternsByIds([id]);
  return lantern ?? null;
}

/** Enforces what the chosen package allows (design, image, drawing, decoration) */
export function assertPackageAllows(input: LanternInput, pkg: FestivalPackage) {
  if (!pkg.features.designs.includes(input.design)) {
    throw new ApiError(400, "design_not_in_package", "แบบโคมนี้ไม่รวมอยู่ในแพ็กเกจที่เลือก");
  }
  if (input.imagePath && !pkg.features.allowImage) throw new ApiError(400, "image_not_allowed", "แพ็กเกจนี้ไม่รองรับการใส่รูปภาพ");
  if (input.drawingPath && !pkg.features.allowDrawing) throw new ApiError(400, "drawing_not_allowed", "แพ็กเกจนี้ไม่รองรับการวาดภาพ");
  if (!input.wishMessage && !input.blessingMessage && !input.extraMessage && !input.drawingPath && !input.imagePath) {
    throw new ApiError(400, "empty_lantern", "กรุณาเขียนคำอธิษฐานหรือวาดภาพบนโคมอย่างน้อย 1 อย่าง");
  }
}

export async function assertAssets(userId: string, input: LanternInput) {
  await Promise.all([assertOwnedAsset(userId, input.imagePath), assertOwnedAsset(userId, input.drawingPath)]);
}

function rowFromInput(userId: string, input: LanternInput, pkg: FestivalPackage, requestId: string) {
  return {
    user_id: userId,
    package_id: pkg.id,
    display_name: input.displayName,
    wish_message: input.wishMessage,
    blessing_message: input.blessingMessage,
    extra_message: input.extraMessage,
    lantern_type: input.design,
    lantern_color: input.color.toUpperCase(),
    decoration: pkg.features.decoration,
    text_config: input.textConfig,
    image_config: input.imagePath ? input.imageConfig : null,
    image_url: input.imagePath,
    drawing_data: input.drawingPath ? { path: input.drawingPath, width: 512, height: 563 } : null,
    client_request_id: requestId,
  };
}

/** Free package: create + release immediately. Idempotent per (user, requestId). */
export async function releaseFreeLantern(userId: string, input: LanternInput, pkg: FestivalPackage, requestId: string) {
  const db = getAdminSupabase();
  const { data, error } = await db
    .from("lanterns")
    .insert({ ...rowFromInput(userId, input, pkg, requestId), status: "active" })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // same request submitted twice → return the lantern that was already released
      const { data: existing } = await db
        .from("lanterns")
        .select("id, status")
        .eq("user_id", userId)
        .eq("client_request_id", requestId)
        .maybeSingle();
      if (existing) return { id: existing.id as string, duplicate: true };
    }
    throw new Error(error.message);
  }
  return { id: data.id as string, duplicate: false };
}

/** Paid package: lantern waits (hidden) until the Stripe webhook confirms payment */
export async function createPendingLantern(userId: string, input: LanternInput, pkg: FestivalPackage, requestId: string) {
  const { data, error } = await getAdminSupabase()
    .from("lanterns")
    .insert({ ...rowFromInput(userId, input, pkg, requestId), status: "pending_payment" })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  return data.id as string;
}

export async function findLanternByRequest(userId: string, requestId: string) {
  const { data } = await getAdminSupabase()
    .from("lanterns")
    .select("id, status, payment_id")
    .eq("user_id", userId)
    .eq("client_request_id", requestId)
    .maybeSingle();
  return data as { id: string; status: string; payment_id: string | null } | null;
}

export async function listMyLanterns(userId: string): Promise<MyLanternSummary[]> {
  const { data, error } = await getAdminSupabase()
    .from("lanterns")
    .select("id, display_name, wish_message, lantern_type, lantern_color, status, created_at, released_at, expires_at, packages(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const now = Date.now();
  return (data ?? []).map((r) => {
    const pkg = r.packages as unknown as { name: string } | null;
    const expired = r.status === "active" && r.expires_at && Date.parse(r.expires_at) <= now;
    return {
      id: r.id,
      displayName: r.display_name,
      wishMessage: r.status === "active" && !expired ? r.wish_message : "",
      design: r.lantern_type as LanternDesignId,
      color: r.lantern_color,
      status: (expired ? "expired" : r.status) as MyLanternSummary["status"],
      createdAt: r.created_at,
      releasedAt: r.released_at,
      expiresAt: r.expires_at,
      packageName: pkg?.name ?? null,
    };
  });
}

export async function reportLantern(lanternId: string, reporterId: string, reason: string, details?: string) {
  const db = getAdminSupabase();
  const lantern = await getActiveLantern(lanternId);
  if (!lantern) throw new ApiError(404, "not_found", "ไม่พบโคมนี้ หรือโคมหมดอายุแล้ว");
  if (lantern.ownerId === reporterId) throw new ApiError(400, "own_lantern", "ไม่สามารถรายงานโคมของตัวเองได้");
  const { error } = await db.from("lantern_reports").insert({ lantern_id: lanternId, reporter_id: reporterId, reason, details: details || null });
  if (error) {
    if (error.code === "23505") throw new ApiError(409, "already_reported", "คุณได้รายงานโคมนี้ไปแล้ว");
    throw new Error(error.message);
  }
}

export async function getFestivalStats() {
  const db = getAdminSupabase();
  const [{ data: stats, error }, { count }] = await Promise.all([
    db.from("festival_statistics").select("total_lanterns, total_participants, total_wishes, updated_at").eq("id", 1).single(),
    db.from("lanterns").select("id", { count: "exact", head: true }).eq("status", "active").gt("expires_at", new Date().toISOString()),
  ]);
  if (error) throw new Error(error.message);
  return {
    totalLanterns: Number(stats.total_lanterns),
    totalParticipants: Number(stats.total_participants),
    totalWishes: Number(stats.total_wishes),
    activeLanterns: count ?? 0,
    updatedAt: stats.updated_at as string,
  };
}
