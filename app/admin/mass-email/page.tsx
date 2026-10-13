import { prisma } from "@/lib/prisma";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui";
import MassEmailForm from "./mass-email-form";

export const revalidate = 0;

export default async function MassEmailPage() {
  await connection();
  const families = await prisma.family.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  return (
    <>
      <PageHeader
        title="Mass email"
        description="Compose an announcement and send it to every family or a selected few. Every send is stored in the email log."
      />

      <MassEmailForm families={families} />
    </>
  );
}
