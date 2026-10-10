import { prisma } from "@/lib/prisma";
import { createFamily } from "@/lib/admin-actions";
import { badge } from "@/lib/ui";
import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui";

export default async function FamiliesPage() {
  await connection();
  const families = await prisma.family.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader
        title="Families"
        description="Manage enrolled families, their students, and subscriptions."
        action={
          <details className="relative">
            <summary className="btn btn-primary cursor-pointer list-none [&::-webkit-details-marker]:hidden">New family</summary>
            <form
              action={createFamily}
              className="card absolute right-0 z-10 mt-2 w-80 space-y-3 p-4 shadow-pop"
            >
              <div>
                <label className="label">Name</label>
                <input name="name" required className="input" />
              </div>
              <div>
                <label className="label">Billing email</label>
                <input name="email" type="email" required className="input" />
              </div>
              <div>
                <label className="label">Phone (optional)</label>
                <input name="phone" className="input" />
              </div>
              <button className="btn btn-primary w-full">Create family</button>
            </form>
          </details>
        }
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Subscription</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {families.map((f) => (
              <tr key={f.id} className="transition-colors hover:bg-muted">
                <td className="px-5 py-3">
                  <Link href={`/admin/families/${f.id}`} className="font-medium text-foreground hover:text-primary">
                    {f.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{f.email}</td>
                <td className="px-5 py-3">
                  {f.subscriptionId ? (
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badge(f.subscriptionStatus ?? "active")}`}>
                      {f.subscriptionStatus ?? "Active"}
                    </span>
                  ) : f.cardLast4 ? (
                    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">
                      Pending — card saved
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No subscription</span>
                  )}
                </td>
              </tr>
            ))}
            {families.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-12 text-center text-muted-foreground">
                  No families yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
