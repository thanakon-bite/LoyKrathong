"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, EyeOff, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { LANTERN_DESIGNS } from "@/lib/lantern/designs";
import { cn, formatDateTime, formatTHB } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function useAdminList<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(() => {
    setLoading(true);
    apiFetch<T>(url)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [url]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / when the URL changes
  useEffect(reload, [reload]);
  return { data, error, loading, reload };
}

function Filter<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full border px-3 py-1 text-xs ${value === v ? "border-gold bg-gold/15 text-warm" : "border-white/10 text-warm/60"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-warm/60">
      <span>
        หน้า {page + 1}/{pages} · ทั้งหมด {total}
      </span>
      <Button size="icon" variant="subtle" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="ก่อนหน้า">
        <ChevronLeft />
      </Button>
      <Button size="icon" variant="subtle" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} aria-label="ถัดไป">
        <ChevronRight />
      </Button>
    </div>
  );
}

const statusVariant = (s: string) =>
  s === "active" || s === "paid" ? "success" : s === "removed" || s === "failed" || s === "error" ? "danger" : s === "pending" || s === "pending_payment" || s === "warn" ? "warning" : "muted";

// ------------------------------------------------------------------ lanterns

interface AdminLantern {
  id: string;
  display_name: string;
  wish_message: string;
  blessing_message: string;
  extra_message: string;
  lantern_type: string;
  status: string;
  report_count: number;
  moderation_note: string | null;
  created_at: string;
  expires_at: string | null;
  content_purged_at: string | null;
}

export function LanternsAdmin({ onChanged }: { onChanged: () => void }) {
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<"all" | "active" | "reported" | "removed">("reported");
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAdminList<{ lanterns: AdminLantern[]; total: number; pageSize: number }>(
    `/api/admin/lanterns?filter=${filter}&page=${page}`,
  );

  const act = async (id: string, action: "remove" | "restore") => {
    if (action === "remove" && !confirm("ซ่อนโคมนี้ออกจากเทศกาลทันที?")) return;
    try {
      await apiFetch(`/api/admin/lanterns/${id}`, { method: "PATCH", json: { action } });
      toast.success(action === "remove" ? "ซ่อนโคมแล้ว (ผู้ชมทุกคนจะไม่เห็นโคมนี้ทันที)" : "กู้คืนโคมแล้ว");
      reload();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Filter
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setPage(0);
        }}
        options={[
          ["reported", "ถูกรายงาน"],
          ["active", "กำลังลอย"],
          ["removed", "ถูกซ่อน"],
          ["all", "ทั้งหมด"],
        ]}
      />
      {error && <Card className="text-red-200">{error}</Card>}
      {loading && !data && <Skeleton className="h-60" />}
      {data && data.lanterns.length === 0 && <Card className="text-warm/55">ไม่มีรายการ</Card>}
      <div className="grid gap-3 lg:grid-cols-2">
        {data?.lanterns.map((l) => (
          <Card key={l.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(l.status)}>{l.status}</Badge>
              {l.report_count > 0 && <Badge variant="danger">รายงาน {l.report_count}</Badge>}
              <span className="text-xs text-warm/45">{LANTERN_DESIGNS[l.lantern_type as keyof typeof LANTERN_DESIGNS]?.nameTh ?? l.lantern_type}</span>
              <span className="ml-auto text-xs text-warm/45">{formatDateTime(l.created_at)}</span>
            </div>
            <p className="text-warm">{l.display_name}</p>
            {l.content_purged_at ? (
              <p className="text-xs italic text-warm/40">เนื้อหาถูกลบตามนโยบายการเก็บข้อมูลแล้ว</p>
            ) : (
              <div className="space-y-1 text-sm text-warm/70">
                {l.wish_message && <p className="whitespace-pre-line">🙏 {l.wish_message}</p>}
                {l.blessing_message && <p className="whitespace-pre-line">💛 {l.blessing_message}</p>}
                {l.extra_message && <p>✎ {l.extra_message}</p>}
              </div>
            )}
            {l.moderation_note && <p className="text-xs text-amber">หมายเหตุ: {l.moderation_note}</p>}
            <div className="flex gap-2 pt-1">
              {l.status === "active" && (
                <Button size="sm" variant="destructive" onClick={() => act(l.id, "remove")}>
                  <EyeOff /> ซ่อนโคม
                </Button>
              )}
              {l.status === "removed" && l.expires_at && Date.parse(l.expires_at) > now && (
                <Button size="sm" variant="outline" onClick={() => act(l.id, "restore")}>
                  <RotateCcw /> กู้คืน
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      {data && <Pager page={page} total={data.total} size={data.pageSize} onPage={setPage} />}
    </div>
  );
}

// ------------------------------------------------------------------ reports

interface Report {
  id: string;
  lantern_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  lanterns: { display_name: string; wish_message: string; blessing_message: string; status: string; report_count: number } | null;
}

export function ReportsAdmin({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<"open" | "resolved" | "dismissed">("open");
  const { data, error, loading, reload } = useAdminList<{ reports: Report[] }>(`/api/admin/reports?status=${status}`);

  const removeLantern = async (r: Report) => {
    try {
      await apiFetch(`/api/admin/lanterns/${r.lantern_id}`, { method: "PATCH", json: { action: "remove", note: `report: ${r.reason}` } });
      toast.success("ซ่อนโคมและปิดรายงานแล้ว");
      reload();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const dismiss = async (r: Report) => {
    try {
      await apiFetch(`/api/admin/reports/${r.id}`, { method: "PATCH", json: { status: "dismissed" } });
      reload();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Filter value={status} onChange={setStatus} options={[["open", "รอตรวจสอบ"], ["resolved", "ดำเนินการแล้ว"], ["dismissed", "ยกเลิกรายงาน"]]} />
      {error && <Card className="text-red-200">{error}</Card>}
      {loading && !data && <Skeleton className="h-40" />}
      {data && data.reports.length === 0 && <Card className="text-warm/55">ไม่มีรายงาน</Card>}
      <div className="space-y-3">
        {data?.reports.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-start gap-4 p-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="danger">{r.reason}</Badge>
                {r.lanterns && <Badge variant={statusVariant(r.lanterns.status)}>{r.lanterns.status}</Badge>}
                <span className="text-xs text-warm/45">{formatDateTime(r.created_at)}</span>
              </div>
              {r.details && <p className="text-sm text-warm/70">“{r.details}”</p>}
              {r.lanterns && (
                <p className="text-sm text-warm">
                  {r.lanterns.display_name}: <span className="text-warm/60">{r.lanterns.wish_message || r.lanterns.blessing_message}</span>
                </p>
              )}
            </div>
            {r.status === "open" && (
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => removeLantern(r)}>
                  <EyeOff /> ซ่อนโคม
                </Button>
                <Button size="sm" variant="ghost" onClick={() => dismiss(r)}>
                  <X /> ไม่ผิด
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ payments

interface AdminPayment {
  id: string;
  user_id: string;
  lantern_id: string | null;
  package_name: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  amount: number;
  currency: string;
  payment_method: string | null;
  payment_status: string;
  failure_reason: string | null;
  created_at: string;
  paid_at: string | null;
  slips?: AdminSlip[];
}

interface AdminSlip {
  id: string;
  payment_id: string;
  image_url: string | null;
  trans_ref: string | null;
  status: string;
  reason: string | null;
  message: string | null;
  amount: number | null;
  slip_date: string | null;
  sender_name: string | null;
  sender_bank: string | null;
  receiver_name: string | null;
  receiver_account: string | null;
  receiver_proxy: string | null;
  receiver_bank: string | null;
  is_duplicate: boolean | null;
  created_at: string;
}

const SLIP_STATUS_TH: Record<string, string> = {
  processing: "กำลังตรวจ",
  verified: "ผ่าน",
  rejected: "ไม่ผ่าน",
  error: "ตรวจไม่ได้",
  pending_review: "รอแอดมินตรวจ",
};

function SlipCell({ slip }: { slip: AdminSlip }) {
  return (
    <div className="flex gap-2">
      {slip.image_url ? (
        <a href={slip.image_url} target="_blank" rel="noopener noreferrer" className="shrink-0" title="เปิดสลิปขนาดเต็ม">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          <img src={slip.image_url} alt="สลิป" loading="lazy" className="h-16 w-12 rounded border border-white/10 object-cover" />
        </a>
      ) : (
        <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded border border-white/10 text-[10px] text-warm/30">ไม่มีรูป</span>
      )}
      <div className="min-w-0 space-y-0.5 text-[11px] text-warm/60">
        <p>
          <Badge variant={slip.status === "verified" ? "success" : slip.status === "rejected" || slip.status === "error" ? "danger" : "warning"}>
            {SLIP_STATUS_TH[slip.status] ?? slip.status}
          </Badge>
          {slip.is_duplicate && <span className="ml-1 text-amber">ซ้ำ (provider)</span>}
        </p>
        {slip.trans_ref && <p className="max-w-56 truncate font-mono">ref {slip.trans_ref}</p>}
        {slip.amount != null && (
          <p>
            {formatTHB(Number(slip.amount))}
            {slip.slip_date ? ` · ${formatDateTime(slip.slip_date)}` : ""}
          </p>
        )}
        {(slip.receiver_name || slip.receiver_proxy || slip.receiver_account) && (
          <p className="max-w-56 truncate">ถึง {[slip.receiver_name, slip.receiver_bank, slip.receiver_proxy ?? slip.receiver_account].filter(Boolean).join(" · ")}</p>
        )}
        {slip.sender_name && (
          <p className="max-w-56 truncate">
            จาก {slip.sender_name}
            {slip.sender_bank ? ` · ${slip.sender_bank}` : ""}
          </p>
        )}
        {slip.status !== "verified" && slip.message && <p className="max-w-56 text-red-200/80">{slip.message}</p>}
      </div>
    </div>
  );
}

interface SlipQuotaInfo {
  provider: string;
  quota: { quota: number | null; overQuota: number | null; specialQuota: number | null; endDate: string | null; specialEndDate: string | null } | null;
  error: string | null;
}

function SlipQuotaCard() {
  const { data, error } = useAdminList<SlipQuotaInfo>("/api/admin/payments/quota");
  const q = data?.quota;
  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
      <span className="text-warm/60">ตรวจสลิปอัตโนมัติ{data ? ` (${data.provider === "slipok" ? "SlipOK" : "EasySlip"})` : ""}</span>
      {error && <span className="text-red-200">{error}</span>}
      {!data && !error && <Skeleton className="h-5 w-40" />}
      {data?.error && <span className="text-red-200">{data.error}</span>}
      {q && (
        <>
          <span className="text-warm">
            โควตาคงเหลือ <b className={cn((q.quota ?? 0) < 20 ? "text-amber" : "text-gold")}>{q.quota ?? "—"}</b> สลิป
          </span>
          {!!q.specialQuota && <span className="text-warm/70">โควตาพิเศษ {q.specialQuota}</span>}
          {!!q.overQuota && <span className="text-red-200">เกินโควตา {q.overQuota}</span>}
          {q.endDate && <span className="text-xs text-warm/50">แพ็กเกจหมดอายุ {q.endDate}</span>}
        </>
      )}
      {data && !q && !data.error && <span className="text-xs text-warm/50">ผู้ให้บริการนี้ไม่มี API แสดงโควตา</span>}
    </Card>
  );
}

export function PaymentsAdmin() {
  const [status, setStatus] = useState<"all" | "paid" | "pending" | "failed" | "cancelled" | "expired" | "refunded">("all");
  const [page, setPage] = useState(0);
  const [approving, setApproving] = useState<string | null>(null);
  const { data, error, reload } = useAdminList<{ payments: AdminPayment[]; total: number; pageSize: number }>(`/api/admin/payments?status=${status}&page=${page}`);

  const approve = async (p: AdminPayment) => {
    if (!window.confirm(`ยืนยันว่าตรวจสลิปในแอปธนาคารแล้ว ได้รับเงิน ${formatTHB(Number(p.amount))} จริง และต้องการปล่อยโคม?`)) return;
    setApproving(p.id);
    try {
      await apiFetch(`/api/admin/payments/${p.id}`, { method: "POST", json: { action: "approve" } });
      toast.success("อนุมัติแล้ว โคมถูกปล่อย");
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="space-y-4">
      <SlipQuotaCard />
      <Filter
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(0);
        }}
        options={[["all", "ทั้งหมด"], ["paid", "ชำระแล้ว"], ["pending", "รอ"], ["failed", "ล้มเหลว"], ["cancelled", "ยกเลิก"], ["expired", "หมดเวลา"], ["refunded", "คืนเงิน"]]}
      />
      {error && <Card className="text-red-200">{error}</Card>}
      {!data && !error && <Skeleton className="h-60" />}
      {data && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="text-xs text-warm/50">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 font-normal">วันที่</th>
                <th className="px-4 py-3 font-normal">แพ็กเกจ</th>
                <th className="px-4 py-3 font-normal">ยอด</th>
                <th className="px-4 py-3 font-normal">ช่องทาง</th>
                <th className="px-4 py-3 font-normal">สถานะ</th>
                <th className="px-4 py-3 font-normal">สลิป (transRef · ยอด · ผู้รับ) / Stripe</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p) => {
                const slips = p.slips ?? [];
                const canApprove = p.payment_method === "promptpay_slip" && p.payment_status !== "paid" && p.payment_status !== "refunded" && slips.length > 0;
                return (
                  <tr key={p.id} className="border-b border-white/5 last:border-0 align-top">
                    <td className="px-4 py-3 text-warm/70">{formatDateTime(p.created_at)}</td>
                    <td className="px-4 py-3 text-warm">{p.package_name}</td>
                    <td className="px-4 py-3 text-warm">{formatTHB(Number(p.amount), p.currency)}</td>
                    <td className="px-4 py-3 text-warm/70">{p.payment_method === "promptpay_slip" ? "พร้อมเพย์ + สลิป" : (p.payment_method ?? "—")}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(p.payment_status)}>{p.payment_status}</Badge>
                      {p.failure_reason && <p className="mt-1 text-xs text-warm/40">{p.failure_reason}</p>}
                      {canApprove && (
                        <Button size="sm" variant="outline" className="mt-2" disabled={approving === p.id} onClick={() => void approve(p)}>
                          อนุมัติเอง
                        </Button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {slips.length > 0 ? (
                        <div className="space-y-2">
                          {slips.slice(0, 3).map((s) => (
                            <SlipCell key={s.id} slip={s} />
                          ))}
                          {slips.length > 3 && <p className="text-[11px] text-warm/40">+ อีก {slips.length - 3} สลิป</p>}
                        </div>
                      ) : p.stripe_session_id ? (
                        <div className="font-mono text-[11px] text-warm/50">
                          <p className="max-w-64 truncate">{p.stripe_session_id}</p>
                          <p className="max-w-64 truncate">{p.stripe_payment_intent_id ?? ""}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-warm/30">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      {data && <Pager page={page} total={data.total} size={data.pageSize} onPage={setPage} />}
    </div>
  );
}

// ------------------------------------------------------------------ logs

interface LogRow {
  id: number;
  level: string;
  source: string;
  message: string;
  context: unknown;
  created_at: string;
}

export function LogsAdmin() {
  const [level, setLevel] = useState<"all" | "error" | "warn" | "info">("error");
  const { data, error, reload, loading } = useAdminList<{ logs: LogRow[] }>(`/api/admin/logs?level=${level}`);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Filter value={level} onChange={setLevel} options={[["error", "Error"], ["warn", "Warning"], ["info", "Info"], ["all", "ทั้งหมด"]]} />
        <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
          <RotateCcw /> รีเฟรช
        </Button>
      </div>
      {error && <Card className="text-red-200">{error}</Card>}
      {data && data.logs.length === 0 && <Card className="text-warm/55">ไม่มี Log</Card>}
      <div className="space-y-2">
        {data?.logs.map((l) => (
          <Card key={l.id} className="p-3">
            <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen(open === l.id ? null : l.id)}>
              <Badge variant={statusVariant(l.level)}>{l.level}</Badge>
              <span className="font-mono text-xs text-gold">{l.source}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-warm/80">{l.message}</span>
              <span className="text-xs text-warm/40">{formatDateTime(l.created_at)}</span>
            </button>
            {open === l.id && l.context != null && (
              <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-black/40 p-3 text-[11px] text-warm/60">{JSON.stringify(l.context, null, 2)}</pre>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
