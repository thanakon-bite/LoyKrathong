import "server-only";
import { ApiError } from "@/lib/api";
import { PricingError, quote, totalProblem } from "@/lib/pricing";
import type { ReleaseRequest } from "@/lib/security/validation";
import type { Quote, Selection } from "@/types/catalog";
import { getCatalog } from "./catalog-service";

/** Re-prices a release request from the database (never trusts amounts from the browser) */
export async function quoteRequest(body: ReleaseRequest): Promise<{ selection: Selection; quote: Quote }> {
  const selection: Selection = { design: body.lantern.design, shape: body.lantern.shape, effects: [...new Set(body.effects)], offering: body.offering };
  const catalog = await getCatalog();
  try {
    const q = quote(catalog, selection);
    const problem = totalProblem(q.total, catalog.minPaidTotal);
    if (problem) throw new ApiError(400, "below_minimum", problem);
    return { selection, quote: q };
  } catch (e) {
    if (e instanceof PricingError) throw new ApiError(400, e.code, e.message);
    throw e;
  }
}
