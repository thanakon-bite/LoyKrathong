import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { removeAssets } from "./storage-service";
import { log } from "./logger";

/**
 * Retention policy (runs from /api/cron/cleanup):
 *  1. Lanterns past expires_at → status "expired" (they are already hidden by RLS / API filters).
 *  2. Expired, removed and cancelled lanterns: delete their images from Storage and wipe the
 *     personal content (wishes, names, drawings). A minimal row is kept for statistics and
 *     payment history.
 *  3. Abandoned checkouts older than 2 hours are marked expired.
 */
export async function runCleanup() {
  const db = getAdminSupabase();
  const { data: expiredCount, error: expErr } = await db.rpc("expire_lanterns");
  if (expErr) throw new Error(expErr.message);

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await db
    .from("lanterns")
    .select("id, image_url, drawing_data, status")
    .is("content_purged_at", null)
    .or(`status.in.(expired,removed,cancelled),and(status.eq.active,expires_at.lte.${nowIso})`)
    .limit(500);
  if (error) throw new Error(error.message);

  let purged = 0;
  for (let i = 0; i < (rows ?? []).length; i += 100) {
    const batch = rows!.slice(i, i + 100);
    const paths = batch.flatMap((r) => [r.image_url, (r.drawing_data as { path?: string } | null)?.path].filter(Boolean) as string[]);
    try {
      await removeAssets(paths);
    } catch (e) {
      await log("warn", "cleanup", "failed to remove some assets", { error: String(e) });
      continue;
    }
    const ids = batch.map((r) => r.id);
    const { error: updErr } = await db
      .from("lanterns")
      .update({
        display_name: "—",
        wish_message: "",
        blessing_message: "",
        extra_message: "",
        image_url: null,
        drawing_data: null,
        image_config: null,
        content_purged_at: nowIso,
      })
      .in("id", ids);
    if (updErr) throw new Error(updErr.message);
    purged += ids.length;
  }

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: stale } = await db
    .from("payments")
    .select("stripe_session_id")
    .eq("payment_status", "pending")
    .lt("created_at", twoHoursAgo)
    .not("stripe_session_id", "is", null)
    .limit(200);
  for (const p of stale ?? []) {
    await db.rpc("close_unpaid_payment", { p_session_id: p.stripe_session_id, p_status: "expired", p_reason: "abandoned checkout" });
  }

  await db.from("rate_limits").delete().lt("window_start", new Date(Date.now() - 24 * 3600 * 1000).toISOString());

  return { expired: expiredCount ?? 0, purged, abandonedCheckouts: stale?.length ?? 0 };
}
