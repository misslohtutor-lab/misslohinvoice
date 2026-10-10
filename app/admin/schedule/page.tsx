import { prisma } from "@/lib/prisma";
import { formatDate, formatTime, badge } from "@/lib/ui";
import { PageHeader } from "@/components/ui";
import { GenerateLessonsButton } from "@/components/generate-lessons-button";

export default async function SchedulePage() {
  const lessons = await prisma.lesson.findMany({
    where: { date: { gte: new Date() }, status: "SCHEDULED" },
    include: { student: { include: { family: true } } },
    orderBy: { date: "asc" },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Schedule"
        description="All upcoming scheduled lessons across every student."
        action={<GenerateLessonsButton weeksAhead={10} variant="button" label="Generate lessons" />}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Student</th>
              <th className="px-5 py-3">Family</th>
              <th className="px-5 py-3">Duration</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lessons.map((l) => (
              <tr key={l.id} className="transition-colors hover:bg-muted">
                <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {formatDate(l.date, { weekday: "short", month: "short", day: "numeric" })}
                  </span>{" "}
                  {formatTime(l.date)}
                </td>
                <td className="px-5 py-3 font-medium">{l.student.name}</td>
                <td className="px-5 py-3 text-muted-foreground">{l.student.family.name}</td>
                <td className="px-5 py-3 text-muted-foreground">{l.durationHours}h</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badge(l.status)}`}>
                    {l.status.toLowerCase()}
                  </span>
                </td>
              </tr>
            ))}
            {lessons.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                  No scheduled lessons. Generate them above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const revalidate = 0;
