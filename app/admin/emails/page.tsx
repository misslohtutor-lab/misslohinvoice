import { prisma } from "@/lib/prisma";
import { badge, formatDate, formatTime } from "@/lib/ui";

export const revalidate = 0;

const EMAIL_TYPES: Record<string, string> = {
  CHARGE_NOTICE: "Charge notice",
  RECEIPT: "Receipt",
  LESSON_REMINDER: "Reminder",
  PAYMENT_FAILED: "Payment failed",
  ONBOARDING_COMPLETE: "Onboarding done",
  ONBOARDING_INVITE: "Onboarding invite",
  MAGIC_LINK: "Magic link",
};

export default async function EmailsPage() {
  const emails = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { family: { select: { name: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Recent emails</h1>
        <p className="text-sm text-zinc-500">
          Last 50 outgoing emails tracked in the{" "}
          <code className="rounded bg-zinc-100 px-1">Message</code> table.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">To</th>
              <th className="px-4 py-2">Family</th>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">Sent</th>
              <th className="px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {emails.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${badge(m.type)}`}>
                    {EMAIL_TYPES[m.type] ?? m.type}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-600">{m.to}</td>
                <td className="px-4 py-2 text-zinc-600">{m.family?.name ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-600">{m.subject}</td>
                <td className="px-4 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${badge(m.sent ? "SUCCESS" : "FAILED")}`}>
                    {m.sent ? "yes" : "no"}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-600">
                  {formatDate(m.createdAt)} {formatTime(m.createdAt)}
                </td>
              </tr>
            ))}
            {emails.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  No emails sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
