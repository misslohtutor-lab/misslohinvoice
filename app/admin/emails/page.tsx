import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import EmailList from "./email-list";

export const revalidate = 0;

export default async function EmailsPage() {
  const emails = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { family: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader
        title="Recent emails"
        description={
          <>
            Last 50 outgoing emails tracked in the{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Message</code> table. Click a row to
            preview the email content.
          </>
        }
      />

      <EmailList emails={emails} />
    </>
  );
}
