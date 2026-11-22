"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Flag, Flame, LogOut, Package, Receipt, ScrollText } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { formatNumber, formatTHB } from "@/lib/utils";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LanternsAdmin, LogsAdmin, PaymentsAdmin, ReportsAdmin } from "./admin-sections";
import { CatalogAdmin } from "./admin-catalog";

type Role = "moderator" | "admin";

interface Overview {
  role: Role;
  totals: Record<string, number>;
}

const TOTAL_LABELS: Array<[string, string, boolean?]> = [
  ["lanterns", "โคมทั้งหมดที่ถูกปล่อย"],
  ["activeLanterns", "กำลังลอยอยู่"],
  ["lanternsLast24h", "ปล่อยใน 24 ชม."],
  ["participants", "ผู้ร่วมกิจกรรม"],
  ["users", "ผู้ใช้งานทั้งหมด"],
  ["registeredUsers", "สมาชิกที่ยืนยันอีเมล"],
  ["openReports", "รายงานที่รอตรวจสอบ"],
  ["paidPayments", "รายการชำระสำเร็จ"],
  ["revenue", "รายได้รวม (THB)", true],
  ["offerings", "ยอดใส่เงินลงกระทง (THB)", true],
];

export function AdminDashboard({ role, email }: { role: Role; email: string | null }) {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = role === "admin";

  const loadOverview = useCallback(() => {
    apiFetch<Overview>("/api/admin/overview")
      .then(setOverview)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(loadOverview, [loadOverview]);

  const signOut = async () => {
    await getBrowserSupabase()?.auth.signOut();
    router.replace("/admin/login");
  };

  return (
    <div className="mx-auto min-h-dvh max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="rounded-full bg-gold/15 px-3 py-1 text-xs text-gold">{isAdmin ? "Admin" : "Moderator"}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-warm/60">
          <span className="hidden sm:inline">{email}</span>
          <Button asChild variant="ghost" size="sm">
            <Link href="/festival">ดูเทศกาล</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut /> ออกจากระบบ
          </Button>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="mb-2 w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="overview"><BarChart3 /> ภาพรวม</TabsTrigger>
          <TabsTrigger value="lanterns"><Flame /> โคม</TabsTrigger>
          <TabsTrigger value="reports"><Flag /> รายงาน</TabsTrigger>
          {isAdmin && <TabsTrigger value="catalog"><Package /> ราคา/ของเสริม</TabsTrigger>}
          {isAdmin && <TabsTrigger value="payments"><Receipt /> ชำระเงิน</TabsTrigger>}
          {isAdmin && <TabsTrigger value="logs"><ScrollText /> Logs</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          {error && <Card className="text-red-200">{error}</Card>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {TOTAL_LABELS.map(([key, label, money]) => (
              <Card key={key} className="p-4">
                <p className="text-xs text-warm/55">{label}</p>
                <p className="mt-2 font-display text-2xl text-warm">
                  {overview ? (money ? formatTHB(overview.totals[key] ?? 0) : formatNumber(overview.totals[key] ?? 0)) : <Skeleton className="h-7 w-16" />}
                </p>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="lanterns"><LanternsAdmin onChanged={loadOverview} /></TabsContent>
        <TabsContent value="reports"><ReportsAdmin onChanged={loadOverview} /></TabsContent>
        {isAdmin && <TabsContent value="catalog"><CatalogAdmin /></TabsContent>}
        {isAdmin && <TabsContent value="payments"><PaymentsAdmin /></TabsContent>}
        {isAdmin && <TabsContent value="logs"><LogsAdmin /></TabsContent>}
      </Tabs>
    </div>
  );
}
