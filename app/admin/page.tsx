import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/ui";
import Link from "next/link";
import { connection } from "next/server";

export default async function AdminDashboard() {
  await connection();
  const [families, upcoming] = await Promise.all([
    prisma.family.findMany({ include: { students: true }, orderBy: { createdAt: "asc" } }),
    prisma.lesson.findMany({
      where: { status: "SCHEDULED", date: { gte: new Date() } },
      include: { student: { include: { family: true } } },
      orderBy: { date: "asc" },
      take: 20,
    }),
  ]);

  const activeSubs = families.filter((f) => f.subscriptionStatus === "active").length;
  const pastDue = families.filter((f) => f.subscriptionStatus === "past_due").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-500">{formatDate(new Date())}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Families" value={String(families.length)} />
        <Stat label="Active subscriptions" value={String(activeSubs)} />
        <Stat label="Past due" value={String(pastDue)} />
        <Stat label="Upcoming lessons" value={String(upcoming.length)} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Upcoming lessons</h2>
          <ul className="divide-y divide-zinc-100 text-sm">
            {upcoming.length === 0 && <li className="py-3 text-zinc-400">No upcoming lessons.</li>}
            {upcoming.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-medium">{l.student.name}</span>
                  <span className="text-zinc-400"> · {l.student.family.name}</span>
                </span>
                <span className="text-zinc-500">{formatDate(l.date)} {l.durationHours}h</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Families</h2>
          <ul className="divide-y divide-zinc-100 text-sm">
            {families.map((f) => (
              <li key={f.id}>
                <Link href={`/admin/families/${f.id}`} className="flex items-center justify-between py-2 hover:bg-zinc-50">
                  <span className="font-medium">{f.name}</span>
                  <span className="flex items-center gap-2 text-zinc-500">
                    <span>{f.students.length} student{f.students.length === 1 ? "" : "s"}</span>
                    <span className="inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-xs">{f.subscriptionStatus ?? "no sub"}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-zinc-500">{label}</div>
    </div>
  );
}
