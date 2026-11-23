"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { EFFECT_META } from "@/lib/lantern/effects-meta";
import { LANTERN_DESIGNS } from "@/lib/lantern/designs";
import { isEffectId, type LanternDesignId } from "@/types/lantern";
import type { Catalog, CatalogItem, OfferingSettings } from "@/types/catalog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const SHAPE_EMOJI: Record<string, string> = { box: "🏮", heart: "💛", moon: "🌕", rabbit: "🐇" };

function ItemRow({ item, onSaved }: { item: CatalogItem; onSaved: () => void }) {
  const [v, setV] = useState(item);
  const [busy, setBusy] = useState(false);
  const dirty = v.name !== item.name || v.price !== item.price || v.isActive !== item.isActive || v.sortOrder !== item.sortOrder || v.description !== item.description;
  const icon =
    item.kind === "effect" && isEffectId(item.code) ? (
      <span className="text-xl">{EFFECT_META[item.code].emoji}</span>
    ) : item.kind === "shape" ? (
      <span className="text-xl">{SHAPE_EMOJI[item.code] ?? "🪷"}</span>
    ) : (
      <span className="block size-5 rounded" style={{ background: LANTERN_DESIGNS[item.code as LanternDesignId]?.defaultLight ?? "#F5B942" }} />
    );

  const save = async () => {
    setBusy(true);
    try {
      const r = await apiFetch<{ note: string | null }>(`/api/admin/catalog/${item.id}`, {
        method: "PATCH",
        json: { name: v.name, description: v.description, price: Number(v.price), isActive: v.isActive, sortOrder: Number(v.sortOrder) },
      });
      toast.success(`บันทึก ${v.name} แล้ว`);
      if (r.note) toast.message(r.note);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 p-3 sm:grid-cols-[auto_1.4fr_7rem_5rem_auto_auto]", !v.isActive && "opacity-60")}>
      {icon}
      <div className="min-w-0">
        <Input aria-label="ชื่อ" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-9" />
        <p className="mt-1 truncate text-[11px] text-warm/40">{item.code}</p>
      </div>
      <div className="relative col-span-1 sm:col-auto">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-warm/50">฿</span>
        <Input aria-label="ราคา" type="number" min={0} step="1" value={v.price} onChange={(e) => setV({ ...v, price: Number(e.target.value) })} className="h-9 pl-7" />
      </div>
      <Input aria-label="ลำดับ" type="number" min={0} value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value) })} className="hidden h-9 sm:block" />
      <label className="flex items-center gap-2 text-xs text-warm/70">
        <Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} /> เปิดขาย
      </label>
      <Button size="sm" disabled={!dirty || busy} onClick={save}>
        {busy ? <Loader2 className="animate-spin" /> : <Save />} บันทึก
      </Button>
    </div>
  );
}

function OfferingEditor({ initial, onSaved }: { initial: OfferingSettings; onSaved: () => void }) {
  const [o, setO] = useState(initial);
  const [presets, setPresets] = useState(initial.presets.join(", "));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const list = presets
        .split(/[,\s]+/)
        .map(Number)
        .filter((n) => n > 0);
      await apiFetch("/api/admin/settings/offering", { method: "PATCH", json: { ...o, presets: list, min: Number(o.min), max: Number(o.max) } });
      toast.success("บันทึกการตั้งค่าการใส่เงินแล้ว");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-lg text-warm">
          <Coins className="size-5 text-gold" /> ใส่เงินลงกระทง
        </h3>
        <label className="flex items-center gap-2 text-sm text-warm/70">
          <Switch checked={o.enabled} onCheckedChange={(c) => setO({ ...o, enabled: c })} /> เปิดใช้งาน
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <Label>ปุ่มยอดสำเร็จ (คั่นด้วย ,)</Label>
          <Input value={presets} onChange={(e) => setPresets(e.target.value)} placeholder="10, 20, 50, 100, 199" />
        </div>
        <div className="space-y-1.5">
          <Label>ขั้นต่ำ (บาท)</Label>
          <Input type="number" min={1} value={o.min} onChange={(e) => setO({ ...o, min: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>สูงสุด (บาท)</Label>
          <Input type="number" min={1} value={o.max} onChange={(e) => setO({ ...o, max: Number(e.target.value) })} />
        </div>
        <div className="flex items-end">
          <Button className="w-full" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />} บันทึก
          </Button>
        </div>
      </div>
      <p className="text-xs text-warm/45">ยอดที่ใส่จะบวกเข้ายอดโอนพร้อมเพย์เป็นรายการแยก และแสดงเป็นป้ายเหรียญเหนือโคม · ยอดชำระรวมขั้นต่ำ 1 บาท</p>
    </Card>
  );
}

/** Prices of lantern colours & effects, sold individually */
export function CatalogAdmin() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const reload = useCallback(() => {
    apiFetch<{ catalog: Catalog }>("/api/admin/catalog")
      .then((r) => {
        setCatalog(r.catalog);
        setRev((x) => x + 1);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(reload, [reload]);

  if (error) return <Card className="text-red-200">{error}</Card>;
  if (!catalog) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6">
      <OfferingEditor key={`o${rev}`} initial={catalog.offering} onSaved={reload} />
      <section className="space-y-2">
        <h3 className="font-display text-lg text-warm">รูปทรงกระทง</h3>
        {catalog.shapes.length ? (
          <>
            <p className="text-xs text-warm/45">ราคา 0 = ฟรี · ปิดขาย = ซ่อนจากหน้าออกแบบ · ช่องตัวเลขหลังราคา = ลำดับการแสดง (น้อยขึ้นก่อน)</p>
            {catalog.shapes.map((i) => (
              <ItemRow key={`${i.id}${rev}`} item={i} onSaved={reload} />
            ))}
          </>
        ) : (
          <p className="rounded-2xl border border-amber/30 bg-amber/5 p-3 text-xs text-warm/70">
            ยังไม่ได้ติดตั้งรูปทรงกระทง – รัน SQL ใน <code>supabase/migrations/20261123000001_shapes.sql</code> ที่ Supabase → SQL Editor ก่อน
          </p>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="font-display text-lg text-warm">สีโคม</h3>
        <p className="text-xs text-warm/45">ราคา 0 = ฟรี · ปิดขาย = ซ่อนจากหน้าออกแบบ · ช่องตัวเลขหลังราคา = ลำดับการแสดง (น้อยขึ้นก่อน)</p>
        {catalog.designs.map((i) => (
          <ItemRow key={`${i.id}${rev}`} item={i} onSaved={reload} />
        ))}
      </section>
      <section className="space-y-2">
        <h3 className="font-display text-lg text-warm">เอฟเฟกต์</h3>
        {catalog.effects.map((i) => (
          <ItemRow key={`${i.id}${rev}`} item={i} onSaved={reload} />
        ))}
      </section>
    </div>
  );
}
