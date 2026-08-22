import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { DayOfWeek, UserRole } from "../app/generated/prisma/enums";
import { generateLessonsForStudent } from "../lib/scheduling";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@missloh.local";

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: UserRole.ADMIN },
    create: { email, name: "Admin", role: UserRole.ADMIN, emailVerified: new Date() },
  });
  console.log("Admin ready:", user.email, "(role:", user.role + ")");

  const demoFamilyEmail = "family@missloh.local";
  const family = await prisma.family.upsert({
    where: { email: demoFamilyEmail },
    update: {},
    create: {
      name: "Demo Family",
      email: demoFamilyEmail,
      students: {
        create: [
          { name: "Ava", hourlyRate: 50, subject: "Math" },
          { name: "Liam", hourlyRate: 45, subject: "Reading" },
        ],
      },
    },
  });
  await prisma.user.upsert({
    where: { email: demoFamilyEmail },
    update: { familyId: family.id },
    create: {
      email: demoFamilyEmail,
      name: "Demo Parent",
      role: UserRole.PARENT,
      familyId: family.id,
      emailVerified: new Date(),
    },
  });

  // Give demo students recurring weekly slots + generate lessons so the app shows data immediately.
  const students = await prisma.student.findMany({ where: { familyId: family.id } });
  const spots: { slot: [DayOfWeek, string, string]; student: string }[] = [
    { student: "Ava", slot: [DayOfWeek.MONDAY, "16:00", "17:00"] },
    { student: "Ava", slot: [DayOfWeek.THURSDAY, "16:00", "17:30"] },
    { student: "Liam", slot: [DayOfWeek.WEDNESDAY, "15:30", "16:00"] },
    { student: "Liam", slot: [DayOfWeek.FRIDAY, "15:30", "16:30"] },
  ];
  for (const { student, slot } of spots) {
    const st = students.find((s) => s.name === student);
    if (!st) continue;
    const [dow, startTime, endTime] = slot;
    const exists = await prisma.weeklySlot.count({ where: { studentId: st.id, dayOfWeek: dow, startTime } });
    if (exists === 0) {
      await prisma.weeklySlot.create({ data: { studentId: st.id, dayOfWeek: dow, startTime, endTime } });
    }
  }
  let lessons = 0;
  for (const s of students) {
    lessons += await generateLessonsForStudent(s.id, 10);
  }
  console.log("Demo family ready:", family.name, "·", lessons, "lessons generated");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });