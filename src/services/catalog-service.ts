import "server-only";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { MIN_PAID_TOTAL } from "@/lib/pricing";
import type { Catalog, CatalogItem, OfferingSettings } from "@/types/catalog";

interface CatalogRow {
  id: string;
  kind: "design" | "effect";
  code: string;
  name: string;
  description: string;
  price: number | string;
  sort_order: number;
  is_active: boolean;
}

const offeringSchema = z.object({
  enabled: z.boolean().default(true),
  presets: z.array(z.number().positive()).max(8).default([10, 20, 50, 100, 199]),
  min: z.number().min(1).default(1),
  max: z.number().min(1).default(10000),
});

const DEFAULT_OFFERING: OfferingSettings = { enabled: true, presets: [10, 20, 50, 100, 199], min: 1, max: 10000 };

export const mapCatalogItem = (r: CatalogRow): CatalogItem => ({
  id: r.id,
  kind: r.kind,
  code: r.code,
  name: r.name,
  description: r.description,
  price: Number(r.price),
  sortOrder: r.sort_order,
  isActive: r.is_active,
});

export async function getOfferingSettings(): Promise<OfferingSettings> {
  const { data } = await getAdminSupabase().from("app_settings").select("value").eq("key", "public.offering").maybeSingle();
  const parsed = offeringSchema.safeParse(data?.value ?? {});
  return parsed.success ? parsed.data : DEFAULT_OFFERING;
}

/** Prices come from the database – the browser only ever displays them */
export async function getCatalog(opts: { includeInactive?: boolean } = {}): Promise<Catalog> {
  let q = getAdminSupabase()
    .from("catalog_items")
    .select("id, kind, code, name, description, price, sort_order, is_active")
    .order("sort_order", { ascending: true });
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const [{ data, error }, offering] = await Promise.all([q, getOfferingSettings()]);
  if (error) throw new Error(error.message);
  const items = (data as CatalogRow[]).map(mapCatalogItem);
  return {
    designs: items.filter((i) => i.kind === "design"),
    effects: items.filter((i) => i.kind === "effect"),
    offering,
    minPaidTotal: MIN_PAID_TOTAL,
  };
}

export { offeringSchema };
