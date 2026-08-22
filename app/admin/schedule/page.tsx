import { prisma } from "@/lib/prisma";
import { formatDate, formatTime } from "@/lib/ui";
import { GenerateLessonsButton } from "@/components/generate-lessons-button";

export default async function SchedulePage() {
  const lessons = await prisma.lesson.findMany({
    where: { date: { gte: new Date() }, status: "SCHEDULED" },
    include: { student: { include: { family: true } } },
    orderBy: { date: "asc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Schedule</h1>
        <div className="flex items-center gap-3">
          <GenerateLessonsButton weeksAhead={10} variant="button" label="Generate lessons for all students" />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white text-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Student</th>
              <th className="px-4 py-2">Family</th>
              <th className="px-4 py-2">Duration</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {lessons.map((l) => (
              <tr key={l.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2 text-zinc-700">
                  {formatDate(l.date, { weekday: "short", month: "short", day: "numeric" })} {formatTime(l.date)}
                </td>
                <td className="px-4 py-2 font-medium">{l.student.name}</td>
                <td className="px-4 py-2 text-zinc-600">{l.student.family.name}</td>
                <td className="px-4 py-2 text-zinc-600">{l.durationHours}h</td>
                <td className="px-4 py-2"><span className="rounded bg-zinc-100 px-2 py-0.5 text-xs">{l.status}</span></td>
              </tr>
            ))}
            {lessons.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No scheduled lessons. Generate them above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const revalidate = 0;