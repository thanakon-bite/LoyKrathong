import "server-only";
import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 (S3-compatible) for lantern images.
 * Browsers upload straight to R2 with a short-lived presigned PUT, so photos up to 50 MB never pass
 * through a serverless function (Netlify caps request bodies at ~6 MB). The bucket stays private:
 * images are read through presigned GET URLs that expire with their lantern.
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */

interface R2Config {
  client: AwsClient;
  base: string;
}

let cached: R2Config | null | undefined;

function config(): R2Config | null {
  if (cached !== undefined) return cached;
  const account = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  cached =
    account && accessKeyId && secretAccessKey && bucket
      ? {
          client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto", retries: 2 }),
          base: `https://${account}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}`,
        }
      : null;
  return cached;
}

export const isR2Configured = () => config() !== null;

function need(): R2Config {
  const c = config();
  if (!c) throw new Error("R2 is not configured");
  return c;
}

const objectUrl = (base: string, key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

/** Presigned PUT – the signature covers content-type and content-length, so R2 rejects any other file size/type */
export async function presignPut(key: string, contentType: string, contentLength: number, expiresInSeconds = 600) {
  const { client, base } = need();
  const url = new URL(objectUrl(base, key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await client.sign(url.toString(), {
    method: "PUT",
    headers: { "content-type": contentType, "content-length": String(contentLength) },
    aws: { signQuery: true, allHeaders: true },
  });
  return signed.url;
}

/** Presigned GET (max 7 days – S3 SigV4 limit) */
export async function presignGet(key: string, expiresInSeconds: number) {
  const { client, base } = need();
  const url = new URL(objectUrl(base, key));
  url.searchParams.set("X-Amz-Expires", String(Math.max(60, Math.min(604_800, Math.ceil(expiresInSeconds)))));
  const signed = await client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

/** Object size in bytes, or null when it does not exist */
export async function headObject(key: string): Promise<number | null> {
  const { client, base } = need();
  const res = await client.fetch(objectUrl(base, key), { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD ${res.status}`);
  return Number(res.headers.get("content-length") ?? 0);
}

export async function getObject(key: string, maxBytes: number): Promise<Uint8Array | null> {
  const { client, base } = need();
  const res = await client.fetch(objectUrl(base, key), { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 GET ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > maxBytes) {
    await res.body?.cancel();
    throw new Error("R2 object too large");
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("R2 object too large");
  return bytes;
}

export async function putObject(key: string, body: Uint8Array, contentType: string, cacheControl = "private, max-age=3600") {
  const { client, base } = need();
  const res = await client.fetch(objectUrl(base, key), {
    method: "PUT",
    body: body as BodyInit,
    headers: { "content-type": contentType, "cache-control": cacheControl },
  });
  if (!res.ok) throw new Error(`R2 PUT ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function deleteObjects(keys: string[]) {
  const { client, base } = need();
  const failed: string[] = [];
  // small batches in parallel (S3 DeleteObjects needs Content-MD5; single deletes are simpler and idempotent)
  for (let i = 0; i < keys.length; i += 8) {
    await Promise.all(
      keys.slice(i, i + 8).map(async (key) => {
        const res = await client.fetch(objectUrl(base, key), { method: "DELETE" });
        if (!res.ok && res.status !== 404) failed.push(key);
      }),
    );
  }
  if (failed.length) throw new Error(`R2 DELETE failed for ${failed.length} object(s)`);
}
