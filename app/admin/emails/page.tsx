import { prisma } from "@/lib/prisma";
import EmailList from "./email-list";

export const revalidate = 0;

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
          Click a row to preview the email content.
        </p>
      </div>

      <EmailList emails={emails} />
    </div>
  );
}
