import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { getStaff } from "@/services/admin-service";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin Dashboard", robots: { index: false, follow: false } };

export default async function AdminPage() {
  if (!isSupabaseConfigured()) redirect("/admin/login");
  // Role is read from the database on every request (not trusted from the client)
  const staff = await getStaff().catch(() => null);
  if (!staff) redirect("/admin/login?denied=1");
  return <AdminDashboard role={staff.role === "admin" ? "admin" : "moderator"} email={staff.email} />;
}
