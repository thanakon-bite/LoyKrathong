"use client";

import { useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api-client";
import { FALLBACK_CATALOG } from "@/lib/catalog/defaults";
import type { Catalog } from "@/types/catalog";

/** Catalog shared by studio + checkout; fetched once per page load */
let catalog: Catalog | null = null;
let live = false;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load() {
  if (pending) return;
  pending = apiFetch<{ catalog: Catalog }>("/api/catalog")
    .then((r) => {
      catalog = r.catalog;
      live = true;
    })
    .catch(() => {
      catalog = FALLBACK_CATALOG;
      live = false;
      pending = null; // allow a retry on the next mount
    })
    .finally(() => listeners.forEach((l) => l()));
}

function subscribe(l: () => void) {
  listeners.add(l);
  load();
  return () => listeners.delete(l);
}

export function useCatalog(): { catalog: Catalog | null; live: boolean } {
  const c = useSyncExternalStore(subscribe, () => catalog, () => null);
  return { catalog: c, live: c ? live : false };
}

export const priceLabel = (n: number) => (n > 0 ? `+฿${n.toLocaleString("th-TH")}` : "ฟรี");
