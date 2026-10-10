import { prisma } from "@/lib/prisma";
import { money, formatDate, badge } from "@/lib/ui";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { AlertIcon } from "@/components/icons";

export default async function BillingPage() {
  const [families, lines] = await Promise.all([
    prisma.family.findMany({ include: { students: { select: { hourlyRate: true } } } }),
    prisma.ledgerLine.findMany({ include: { family: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  const pastDue = families.filter((f) => f.subscriptionStatus === "past_due");

  return (
    <>
      <PageHeader
        title="Billing"
        description="Cards are charged on the 1st for that month's scheduled hours. Stripe retries automatically on failure."
      />

      {pastDue.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertIcon className="mt-0.5 shrink-0 text-amber-600" width={18} height={18} />
          <p>
            <strong>{pastDue.length} family(ies) past due</strong> — cards failed and Stripe is retrying.
          </p>
        </div>
      )}

      <section className="card overflow-hidden">
        <h2 className="border-b border-border px-5 py-4 font-semibold">Subscriptions</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3">Family</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Card</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {families.map((f) => (
              <tr key={f.id} className="transition-colors hover:bg-muted">
                <td className="px-5 py-3">
                  <Link href={`/admin/families/${f.id}`} className="font-medium hover:text-primary">
                    {f.name}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badge(f.subscriptionStatus)}`}>
                    {f.subscriptionStatus ?? "none"}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                  {f.cardLast4 ? `•••• ${f.cardLast4}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-border px-5 py-4 font-semibold">Charges</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3">Family</th>
              <th className="px-5 py-3">Period</th>
              <th className="px-5 py-3">Hours</th>
              <th className="px-5 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l) => (
              <tr key={l.id} className="transition-colors hover:bg-muted">
                <td className="px-5 py-3 font-medium">{l.family.name}</td>
                <td className="px-5 py-3 text-muted-foreground">
                  {formatDate(l.periodStart)} – {formatDate(l.periodEnd)}
                </td>
                <td className="px-5 py-3 text-muted-foreground">{l.hours}h</td>
                <td className="px-5 py-3 text-right font-medium tabular-nums">{money(l.amount)}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-muted-foreground">
                  No charges recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

export const revalidate = 0;
