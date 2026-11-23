import { apiFetch, ClientApiError } from "@/lib/api-client";

type Kind = "image" | "drawing";

/**
 * Uploads a lantern image. Preferred path: presigned PUT straight to Cloudflare R2 (≤ 50 MB, never
 * passes through a serverless function), then the server validates + re-encodes it.
 * Falls back to the multipart API (≤ 5 MB) when R2 is not configured on the server.
 */
export async function uploadLanternAsset(kind: Kind, blob: Blob): Promise<{ path: string }> {
  const contentType = blob.type || "image/webp";
  let direct: { key: string; uploadUrl: string; headers: Record<string, string> };
  try {
    direct = await apiFetch("/api/uploads/direct", { method: "POST", json: { kind, contentType, size: blob.size } });
  } catch (e) {
    if (e instanceof ClientApiError && e.code === "direct_upload_unavailable") return uploadMultipart(kind, blob);
    throw e;
  }
  let res: Response;
  try {
    res = await fetch(direct.uploadUrl, { method: "PUT", headers: direct.headers, body: blob });
  } catch {
    throw new ClientApiError(0, "network", "อัปโหลดรูปไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  }
  if (!res.ok) throw new ClientApiError(res.status, "upload_failed", "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  return apiFetch("/api/uploads/direct/complete", { method: "POST", json: { key: direct.key } });
}

function uploadMultipart(kind: Kind, blob: Blob) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", blob, `${kind}.${blob.type.includes("png") ? "png" : blob.type.includes("jpeg") ? "jpg" : "webp"}`);
  return apiFetch<{ path: string }>("/api/uploads", { method: "POST", body: form });
}
