/**
 * Cloudflare Workers bindings (only present when running on Workers via @opennextjs/cloudflare).
 * Read from the global OpenNext context directly so this module also loads on Node hosts.
 */
export interface CloudflareBindings {
  /** static assets of this Worker (public/ folder) */
  ASSETS?: { fetch: (req: Request | string) => Promise<Response> };
  /** Cloudflare Images binding – resize / re-encode without sharp */
  IMAGES?: CloudflareImagesBinding;
}

export interface CloudflareImagesBinding {
  input(stream: ReadableStream<Uint8Array>): {
    transform(opts: Record<string, unknown>): CloudflareImagesTransformer;
    output(opts: { format: string; quality?: number }): Promise<{ response(): Response; contentType(): string }>;
  };
  info(stream: ReadableStream<Uint8Array>): Promise<{ format: string; fileSize?: number; width?: number; height?: number }>;
}
interface CloudflareImagesTransformer {
  transform(opts: Record<string, unknown>): CloudflareImagesTransformer;
  output(opts: { format: string; quality?: number }): Promise<{ response(): Response; contentType(): string }>;
}

export function cloudflareEnv(): CloudflareBindings | null {
  const ctx = (globalThis as unknown as Record<symbol, { env?: CloudflareBindings } | undefined>)[Symbol.for("__cloudflare-context__")];
  return ctx?.env ?? null;
}
