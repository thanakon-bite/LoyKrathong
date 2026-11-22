import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { packageFeaturesSchema } from "@/lib/security/validation";
import type { FestivalPackage, PackageFeatures } from "@/types/payment";

interface PackageRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number | string;
  currency: string;
  features: unknown;
  sort_order: number;
  is_active: boolean;
}

const FALLBACK_FEATURES: PackageFeatures = {
  designs: ["classic-golden"],
  allowImage: false,
  allowDrawing: false,
  decoration: null,
  highlights: [],
};

export function mapPackage(row: PackageRow): FestivalPackage {
  const parsed = packageFeaturesSchema.safeParse(row.features);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    currency: row.currency,
    features: parsed.success ? parsed.data : FALLBACK_FEATURES,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

const COLUMNS = "id, slug, name, description, price, currency, features, sort_order, is_active";

export async function listActivePackages(): Promise<FestivalPackage[]> {
  const { data, error } = await getAdminSupabase()
    .from("packages")
    .select(COLUMNS)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as PackageRow[]).map(mapPackage);
}

export async function listAllPackages(): Promise<FestivalPackage[]> {
  const { data, error } = await getAdminSupabase().from("packages").select(COLUMNS).order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as PackageRow[]).map(mapPackage);
}

export async function getActivePackage(slug: string): Promise<FestivalPackage | null> {
  const { data, error } = await getAdminSupabase().from("packages").select(COLUMNS).eq("slug", slug).eq("is_active", true).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapPackage(data as PackageRow) : null;
}
