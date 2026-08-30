"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { DayOfWeek, LessonStatus, UserRole } from "@/generated/prisma/enums";
import { generateAllLessons, generateLessonsForStudent, computeFamilyMonth } from "@/lib/scheduling";
import type { MonthSummary } from "@/lib/scheduling";
import { timeToMinutes } from "@/lib/ui";
import { createOnboardingCheckout, createSubscriptionAfterSetup, syncNextMonthQuantities, sendImmediateInvoice } from "@/lib/subscriptions";
import { queueMidMonthCharge } from "@/lib/midmonth";
import { guideUrl } from "@/lib/checkout";
import { sendOnboarding } from "@/lib/email-templates";
import { formatBusinessDate, formatBusinessTime, nextBusinessMonth } from "@/lib/time";
import { getStripe } from "@/lib/stripe";

function logActionError(action: string, err: unknown) {
  console.error(`[admin-action:${action}]`, err);
  return { ok: false as const, error: "Something went wrong. Please try again or check the server logs." };
}

export async function createFamily(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const phone = String(formData.get("phone") ?? "") || null;

  const family = await prisma.family.create({ data: { name, email, phone } });
  await prisma.user.upsert({
    where: { email },
    update: { role: UserRole.PARENT, familyId: family.id },
    create: { email, name, role: UserRole.PARENT, familyId: family.id },
  });
  redirect(`/admin/families/${family.id}`);
}

export async function addStudent(formData: FormData) {
  await requireAdmin();
  const familyId = String(formData.get("familyId") ?? "");
  const name = String(formData.get("name") ?? "");
  const hourlyRate = Number(formData.get("hourlyRate") ?? 0);
  const subject = String(formData.get("subject") ?? "") || null;
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0 || Math.round(hourlyRate * 100) % 4 !== 0) {
    throw new Error("Hourly rates must be positive and divisible by $0.04");
  }

  await prisma.student.create({
    data: { familyId, name, hourlyRate, subject },
  });
  revalidatePath("/admin/families/" + familyId);
}

export async function addWeeklySlot(formData: FormData) {
  await requireAdmin();
  const studentId = String(formData.get("studentId") ?? "");
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  const dayOfWeek = String(formData.get("dayOfWeek") ?? "") as DayOfWeek;
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");

  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start == null || end == null) {
    throw new Error("Times must be on a quarter hour (e.g. 16:00, 16:15)");
  }
  if (end <= start) {
    throw new Error("End time must be after start time");
  }

  if (!student) throw new Error("Student not found");

  const overlapping = await prisma.weeklySlot.findFirst({
    where: {
      studentId,
      dayOfWeek,
      active: true,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });
  if (overlapping) {
    throw new Error("This slot overlaps an existing active slot for the student");
  }

  await prisma.weeklySlot.create({ data: { studentId, dayOfWeek, startTime, endTime } });
  redirect(`/admin/families/${student?.familyId}`);
}

/**
 * Delete a recurring slot. Also removes the slot's upcoming SCHEDULED lessons
 * so the student isn't billed for sessions that no longer happen (e.g. when
 * moving the slot to a different time). Past lessons are kept for history.
 */
export async function deleteWeeklySlot(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const slot = await prisma.weeklySlot.findUnique({ where: { id }, include: { student: true } });
  if (!slot) throw new Error("Slot not found");

  await prisma.$transaction([
    prisma.lesson.deleteMany({
      where: { slotId: id, status: LessonStatus.SCHEDULED, date: { gte: new Date() } },
    }),
    prisma.weeklySlot.delete({ where: { id } }),
  ]);

  revalidatePath(`/admin/families/${slot.student.familyId}`);
}

export type GenerateResult =
  | { ok: true; created: number; total: number }
  | { ok: false; error: string };

export async function generateLessonsAction(formData: FormData): Promise<GenerateResult> {
  await requireAdmin();
  const studentId = (formData.get("studentId") as string) || null;
  const weeksAhead = Number(formData.get("weeksAhead") ?? 8);
  try {
    if (studentId) {
      const student = await prisma.student.findUnique({ where: { id: studentId } });
      const created = await generateLessonsForStudent(studentId, weeksAhead);
      revalidatePath(`/admin/families/${student?.familyId}`);
      return { ok: true, created, total: await countLessons(studentId) };
    }
    const created = await generateAllLessons(weeksAhead);
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/families");
    return { ok: true, created, total: await prisma.lesson.count({ where: { status: "SCHEDULED" } }) };
  } catch (err) {
    return logActionError("generateLessons", err);
  }
}

async function countLessons(studentId: string) {
  return prisma.lesson.count({ where: { studentId, status: "SCHEDULED" } });
}

export async function updateFamilyEmail(formData: FormData) {
  await requireAdmin();
  const familyId = String(formData.get("familyId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new Error("Family not found");

  const oldEmail = family.email;
  await prisma.family.update({ where: { id: familyId }, data: { email } });
  // Keep the family's login account (User) in sync so magic-link sign-in
  // works with the new address.
  if (oldEmail !== email) {
    await prisma.user.updateMany({
      where: { familyId, email: oldEmail },
      data: { email },
    });
  }
  revalidatePath(`/admin/families/${familyId}`);
}

export type OnboardResult =
  | { ok: true; checkoutUrl: string; emailSent: boolean; emailError?: string }
  | { ok: false; error: string };

export async function sendOnboardingLink(formData: FormData): Promise<OnboardResult> {
  await requireAdmin();
  const familyId = String(formData.get("familyId") ?? "");
  try {
    const family = await prisma.family.findUnique({ where: { id: familyId } });
    if (!family) throw new Error("Family not found");
    const url = await createOnboardingCheckout(familyId);
    const email = await sendOnboarding(family, url, guideUrl());
    return { ok: true, checkoutUrl: url, emailSent: email.sent, emailError: email.error };
  } catch (err) {
    return logActionError("sendOnboarding", err);
  }
}

export type CreateSubscriptionResult =
  | { ok: true; subscriptionId: string }
  | { ok: false; error: string; deferred?: boolean };

/**
 * Manually create a family's monthly subscription after onboarding saved their
 * card. Normally the webhook does this, but when onboarding completes before a
 * schedule exists (nothing to bill), creation is deferred — this action lets an
 * admin trigger it once lessons are scheduled.
 */
export async function createSubscription(formData: FormData): Promise<CreateSubscriptionResult> {
  await requireAdmin();
  const familyId = String(formData.get("familyId") ?? "");
  try {
    const family = await prisma.family.findUnique({ where: { id: familyId } });
    if (!family) throw new Error("Family not found");
    if (!family.stripeCustomerId || !family.cardLast4) {
      return { ok: false, error: "This family hasn't saved a card yet — send the onboarding link first." };
    }
    const sub = await createSubscriptionAfterSetup(familyId, family.stripeCustomerId, null);
    if (!sub) {
      return {
        ok: false,
        deferred: true,
        error: "No scheduled lessons for next month yet — nothing to bill. Add a weekly slot and generate lessons first.",
      };
    }
    revalidatePath(`/admin/families/${familyId}`);
    return { ok: true, subscriptionId: sub.id };
  } catch (err) {
    return logActionError("createSubscription", err);
  }
}

export type SyncResult =
  | { ok: true; summary: MonthSummary; year: number; month: number }
  | { ok: false; error: string };

export async function syncNextMonthAction(formData: FormData): Promise<SyncResult> {
  await requireAdmin();
  const familyId = String(formData.get("familyId") ?? "");
  try {
    const result = await syncNextMonthQuantities(familyId);
    revalidatePath(`/admin/families/${familyId}`);
    return { ok: true, summary: result.summary, year: result.year, month: result.month };
  } catch (err) {
    return logActionError("syncNextMonth", err);
  }
}

export type BillingEmailResult =
  | { ok: true; amount: number; chargeLabel: string }
  | { ok: false; error: string };

/**
 * Mid-month billing: send the family an itemized billing email now and schedule
 * the card to be charged 24h later (the cron performs the charge). For families
 * that sign up mid-month so they aren't waiting for the 1st.
 */
export async function sendMidMonthBillingEmail(formData: FormData): Promise<BillingEmailResult> {
  await requireAdmin();
  const familyId = String(formData.get("familyId") ?? "");
  try {
    const result = await queueMidMonthCharge(familyId);
    const chargeLabel = `${formatBusinessDate(result.chargeAt, { weekday: "long", month: "long", day: "numeric" })}, ${formatBusinessTime(result.chargeAt)}`;
    revalidatePath(`/admin/families/${familyId}`);
    return { ok: true, amount: result.amount, chargeLabel };
  } catch (err) {
    return logActionError("sendMidMonthBillingEmail", err);
  }
}

export async function computeMonthAction(formData: FormData) {
  await requireAdmin();
  const familyId = String(formData.get("familyId") ?? "");
  const { year, month } = nextBusinessMonth();
  return { summary: await computeFamilyMonth(familyId, year, month) };
}

export async function deleteStudent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw new Error("Student not found");
  await prisma.student.delete({ where: { id } });
  redirect(`/admin/families/${student.familyId}`);
}

export async function deleteFamily(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const family = await prisma.family.findUnique({
    where: { id },
    select: { id: true, subscriptionId: true },
  });

  // Deleting the family must stop recurring billing: cancel the Stripe
  // subscription (if any) so the customer is never charged again. A
  // subscription that is already canceled or gone on Stripe's side is fine; a
  // genuine cancellation failure aborts the delete rather than orphaning charges.
  if (family?.subscriptionId) {
    let active = false;
    try {
      const status = (await getStripe().subscriptions.retrieve(family.subscriptionId)).status;
      active = status !== "canceled" && status !== "incomplete_expired";
    } catch {
      active = false; // subscription no longer exists on Stripe — nothing to cancel
    }
    if (active) {
      try {
        await getStripe().subscriptions.cancel(family.subscriptionId);
      } catch (err) {
        console.error("[admin-action:deleteFamily] Stripe cancellation failed:", err);
        throw new Error("Failed to cancel the Stripe subscription. Please try again.");
      }
    }
  }

  await prisma.family.delete({ where: { id } });
  redirect("/admin/families");
}

/**
 * Set a lesson's status. Marking it MISSED (student no-show) records a negative
 * Adjustment on the family that offsets the next bill; setting it back removes
 * the credit.
 */
export async function markLesson(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as LessonStatus;
  const lesson = await prisma.lesson.findUniqueOrThrow({
    where: { id },
    include: { student: true },
  });

  const amount = lesson.durationHours * lesson.student.hourlyRate;

  const existingCredits = await prisma.adjustment.findMany({
    where: { reason: { startsWith: `Missed lesson ${lesson.id}` } },
    select: { id: true, appliedToInvoice: true, stripeBalanceTransactionId: true },
  });
  if (existingCredits.some((credit) => credit.appliedToInvoice || credit.stripeBalanceTransactionId)) {
    throw new Error("This missed-lesson credit has already been sent to Stripe and cannot be reversed here");
  }

  // Remove any unapplied local credit first (idempotent).
  await prisma.adjustment.deleteMany({
    where: { id: { in: existingCredits.map((credit) => credit.id) } },
  });

  // Only a genuinely MISSED lesson (e.g. illness) grants a credit. SKIPPED
  // (organizational) and other statuses do not.
  if (status === "MISSED") {
    await prisma.adjustment.create({
      data: {
        familyId: lesson.student.familyId,
        amount: -amount,
        remainingAmount: -amount,
        reason: `Missed lesson ${lesson.id} (${lesson.date.toISOString().slice(0, 10)})`,
      },
    });
  }

  await prisma.lesson.update({ where: { id }, data: { status } });

  revalidatePath(`/admin/families/${lesson.student.familyId}`);
  revalidatePath("/admin/schedule");
}

export type InvoiceResult =
  | { ok: true; invoiceId: string; invoiceUrl: string; amount: number }
  | { ok: false; error: string };

/**
 * Send an immediate invoice for the family's current-month lessons. The
 * customer pays via a Stripe invoice link — no card on file required. After
 * payment, the webhook auto-creates a subscription for future months.
 */
export async function sendInvoiceNow(formData: FormData): Promise<InvoiceResult> {
  await requireAdmin();
  const familyId = String(formData.get("familyId") ?? "");
  try {
    const result = await sendImmediateInvoice(familyId);
    revalidatePath(`/admin/families/${familyId}`);
    return { ok: true, invoiceId: result.invoiceId, invoiceUrl: result.invoiceUrl, amount: result.amount };
  } catch (err) {
    return logActionError("sendInvoiceNow", err);
  }
}
