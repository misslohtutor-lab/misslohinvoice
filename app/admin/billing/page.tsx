import { prisma } from "@/lib/prisma";
import { money, formatDate, badge } from "@/lib/ui";
import Link from "next/link";

export default async function BillingPage() {
  const [families, lines] = await Promise.all([
    prisma.family.findMany({ include: { students: { select: { hourlyRate: true } } } }),
    prisma.ledgerLine.findMany({ include: { family: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  const pastDue = families.filter((f) => f.subscriptionStatus === "past_due");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-sm text-zinc-500">
          Cards are charged on the 1st for that month&apos;s scheduled hours. Stripe retries automatically on failure.
        </p>
      </div>

      {pastDue.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>{pastDue.length} family(ies) past due</strong> — cards failed and Stripe is retrying.
        </div>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white">
        <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold">Subscriptions</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="px-4 py-2">Family</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Card</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {families.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2">
                  <Link href={`/admin/families/${f.id}`} className="font-medium hover:underline">{f.name}</Link>
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${badge(f.subscriptionStatus)}`}>
                    {f.subscriptionStatus ?? "none"}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-600">{f.cardLast4 ? `···· ${f.cardLast4}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white">
        <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold">Charges</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="px-4 py-2">Family</th>
              <th className="px-4 py-2">Period</th>
              <th className="px-4 py-2">Hours</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 font-medium">{l.family.name}</td>
                <td className="px-4 py-2 text-zinc-600">{formatDate(l.periodStart)} – {formatDate(l.periodEnd)}</td>
                <td className="px-4 py-2 text-zinc-600">{l.hours}h</td>
                <td className="px-4 py-2 text-right font-medium">{money(l.amount)}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-400">No charges recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export const revalidate = 0;