import type { Metadata } from "next";
import { AdminLogin } from "@/components/admin/admin-login";

export const metadata: Metadata = { title: "Admin Login", robots: { index: false, follow: false } };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,#14204a_0%,#050913_70%)] px-4">
      <div className="w-full space-y-4">
        {denied && <p className="text-center text-sm text-amber">บัญชีนี้ไม่มีสิทธิ์เข้าถึงระบบผู้ดูแล</p>}
        <AdminLogin />
      </div>
    </main>
  );
}
