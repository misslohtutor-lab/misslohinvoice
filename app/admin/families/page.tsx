import { prisma } from "@/lib/prisma";
import { createFamily } from "@/lib/admin-actions";
import Link from "next/link";
import { connection } from "next/server";

export default async function FamiliesPage() {
  await connection();
  const families = await prisma.family.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Families</h1>
        <details className="relative">
          <summary className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
            New family
          </summary>
          <form
            action={createFamily}
            className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg"
          >
            <label className="mb-1 block text-sm">Name</label>
            <input name="name" required className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
            <label className="mb-1 block text-sm">Billing email</label>
            <input name="email" type="email" required className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
            <label className="mb-1 block text-sm">Phone (optional)</label>
            <input name="phone" className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
            <button className="w-full rounded-lg bg-zinc-900 py-2 text-sm text-white">Create</button>
          </form>
        </details>
      </div>

      <table className="w-full rounded-xl border border-zinc-200 bg-white text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Subscription</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {families.map((f) => (
            <tr key={f.id} className="hover:bg-zinc-50">
              <td className="px-4 py-2">
                <Link href={`/admin/families/${f.id}`} className="font-medium text-zinc-900 hover:underline">
                  {f.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-zinc-600">{f.email}</td>
              <td className="px-4 py-2 text-zinc-600">
                {f.subscriptionId ? (
                  f.subscriptionStatus ?? "Active"
                ) : f.cardLast4 ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Pending — card saved</span>
                ) : (
                  "No subscription"
                )}
              </td>
            </tr>
          ))}
          {families.length === 0 && (
            <tr><td colSpan={3} className="px-4 py-6 text-center text-zinc-400">No families yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
