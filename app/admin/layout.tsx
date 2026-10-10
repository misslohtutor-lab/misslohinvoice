import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { AdminMobileNav, AdminSidebar } from "@/components/admin-nav";
import { GraduateIcon } from "@/components/icons";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-full bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface p-4 md:flex">
        <AdminSidebar />
      </aside>

      <div className="flex min-h-screen flex-col md:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/admin" className="mb-3 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduateIcon width={18} height={18} />
            </span>
            <span className="text-sm font-semibold">Miss Loh Tutoring Admin</span>
          </Link>
          <AdminMobileNav />
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl space-y-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
