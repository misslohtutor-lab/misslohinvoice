import Link from "next/link";

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/families", label: "Families" },
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/jobs", label: "Jobs" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <Link href="/admin" className="font-semibold">Miss Loh Admin</Link>
        <nav className="flex gap-4 text-sm">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="text-zinc-600 hover:text-zinc-900">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
