import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { removeAssets } from "./storage-service";
import { log } from "./logger";
import { expireAbandonedSlipOrders, purgeOldSlipImages } from "./slip-payment-service";
import { storedAssetPaths } from "@/lib/lantern/face-data";

/**
 * Retention policy (runs from /api/cron/cleanup):
 *  1. Lanterns past expires_at (7 days) → status "expired": hidden from the public festival,
 *     but kept for their owner ("โคมของฉัน") – content and images are NOT deleted.
 *  2. Removed (moderated) and cancelled/unpaid lanterns: delete their images from Storage and wipe
 *     the content. A minimal row is kept for statistics and payment history.
 *  3. Abandoned checkouts / QR orders older than 2 hours are marked expired.
 *  4. Payment-slip images older than 90 days are deleted.
 */
export async function runCleanup() {
  const db = getAdminSupabase();
  const { data: expiredCount, error: expErr } = await db.rpc("expire_lanterns");
  if (expErr) throw new Error(expErr.message);

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await db
    .from("lanterns")
    .select("id, image_url, drawing_data, status, moderation_note")
    .is("content_purged_at", null)
    .in("status", ["removed", "cancelled"])
    .limit(500);
  if (error) throw new Error(error.message);
  // lanterns hidden automatically by user reports stay intact until a moderator reviews them
  // (reports are cheap to make – a few fake ones must never wipe a paid lantern for good)
  const purgeable = (rows ?? []).filter((r) => !(r.status === "removed" && String(r.moderation_note ?? "").startsWith("auto-hidden")));

  let purged = 0;
  for (let i = 0; i < purgeable.length; i += 100) {
    const batch = purgeable.slice(i, i + 100);
    // front photo / drawing + the art of every other wall (drawing_data.faces)
    const paths = batch.flatMap((r) => storedAssetPaths(r));
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

  // PromptPay QR orders (no Stripe session) – needs migration 20261123000002_slip_payments
  let abandonedQr = 0;
  try {
    abandonedQr = await expireAbandonedSlipOrders();
  } catch (e) {
    await log("warn", "cleanup", "could not expire abandoned QR orders", { error: String(e) });
  }
  // slip images (names / account numbers) are deleted after 90 days
  let slipImagesPurged = 0;
  try {
    slipImagesPurged = await purgeOldSlipImages();
  } catch (e) {
    await log("warn", "cleanup", "could not delete old slip images", { error: String(e) });
  }

  await db.from("rate_limits").delete().lt("window_start", new Date(Date.now() - 24 * 3600 * 1000).toISOString());

  return { expired: expiredCount ?? 0, purged, abandonedCheckouts: (stale?.length ?? 0) + abandonedQr, slipImagesPurged };
}
