import "server-only";
import { ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";

export type Role = "user" | "moderator" | "admin";
export type Permission = "dashboard" | "lanterns" | "reports" | "packages" | "payments" | "logs";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  user: [],
  moderator: ["dashboard", "lanterns", "reports"],
  admin: ["dashboard", "lanterns", "reports", "packages", "payments", "logs"],
};

export const can = (role: Role, perm: Permission) => ROLE_PERMISSIONS[role].includes(perm);

export async function getStaff(): Promise<{ id: string; email: string | null; role: Role } | null> {
  const user = await getCurrentUser();
  if (!user || user.is_anonymous) return null;
  const { data } = await getAdminSupabase().from("users").select("role, email").eq("id", user.id).maybeSingle();
  const role = (data?.role ?? "user") as Role;
  if (role === "user") return null;
  return { id: user.id, email: data?.email ?? user.email ?? null, role };
}

/** Throws 401/403 unless the signed-in user has the permission (checked against the database, not the JWT) */
export async function requirePermission(perm: Permission) {
  const user = await getCurrentUser();
  if (!user || user.is_anonymous) throw new ApiError(401, "unauthorized", "กรุณาเข้าสู่ระบบผู้ดูแล");
  const staff = await getStaff();
  if (!staff || !can(staff.role, perm)) throw new ApiError(403, "forbidden", "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้");
  return staff;
}
