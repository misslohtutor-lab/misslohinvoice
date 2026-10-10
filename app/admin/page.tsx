import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/ui";
import Link from "next/link";
import { connection } from "next/server";
import { PageHeader, StatCard } from "@/components/ui";
import { CardIcon, UsersIcon, CalendarIcon, AlertIcon } from "@/components/icons";

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
    <>
      <PageHeader
        title="Dashboard"
        description={`Snapshot for ${formatDate(new Date(), { weekday: "long", year: "numeric" })}`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Families" value={String(families.length)} icon={<UsersIcon width={18} height={18} />} />
        <StatCard
          label="Active subscriptions"
          value={String(activeSubs)}
          tone="success"
          icon={<CardIcon width={18} height={18} />}
        />
        <StatCard
          label="Past due"
          value={String(pastDue)}
          tone={pastDue > 0 ? "warning" : "neutral"}
          icon={<AlertIcon width={18} height={18} />}
        />
        <StatCard
          label="Upcoming lessons"
          value={String(upcoming.length)}
          tone="primary"
          icon={<CalendarIcon width={18} height={18} />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-semibold">Upcoming lessons</h2>
            <Link href="/admin/schedule" className="text-xs font-medium text-primary hover:underline">
              View schedule
            </Link>
          </div>
          <ul className="divide-y divide-border text-sm">
            {upcoming.length === 0 && (
              <li className="px-5 py-6 text-center text-muted-foreground">No upcoming lessons.</li>
            )}
            {upcoming.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-5 py-3">
                <span>
                  <span className="font-medium">{l.student.name}</span>
                  <span className="text-muted-foreground"> · {l.student.family.name}</span>
                </span>
                <span className="text-right text-muted-foreground">
                  <span className="font-medium text-foreground">{formatDate(l.date, { weekday: "short", month: "short", day: "numeric" })}</span>
                  <span className="ml-2">{l.durationHours}h</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-semibold">Families</h2>
            <Link href="/admin/families" className="text-xs font-medium text-primary hover:underline">
              Manage
            </Link>
          </div>
          <ul className="divide-y divide-border text-sm">
            {families.length === 0 && (
              <li className="px-5 py-6 text-center text-muted-foreground">No families yet.</li>
            )}
            {families.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/admin/families/${f.id}`}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted"
                >
                  <span className="font-medium">{f.name}</span>
                  <span className="flex items-center gap-3 text-muted-foreground">
                    <span>
                      {f.students.length} student{f.students.length === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {f.subscriptionStatus ?? "no sub"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
