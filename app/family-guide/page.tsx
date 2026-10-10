import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Family Guide — Miss Loh Tutoring School",
  description: "Everything you need to know about how our tutoring service works, billing, and what to expect as a family.",
};

export default function FamilyGuidePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="relative overflow-hidden border-b border-border bg-surface px-6 py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_80%_at_50%_0%,var(--color-primary-soft),transparent)]"
        />
        <div className="relative mx-auto w-full max-w-3xl">
          <p className="mb-3 inline-flex rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            Family Guide
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Welcome to Miss Loh Tutoring School
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            This guide explains everything you need to know about how our tutoring service works, how billing
            operates, and what to expect as a family enrolled in our program.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <Section title="How It Works">
          <p>
            Miss Loh Tutoring School provides <strong>online tutoring via Zoom</strong>. Each student (your
            child) is assigned a <strong>weekly schedule</strong> — a consistent day and time for their lessons.
            Our system automatically tracks every lesson and handles all billing for you.
          </p>
          <h3 className="mt-6 text-lg font-medium text-foreground">Your Role as a Parent</h3>
          <p>You don&apos;t need to manage a portal or log into any system. Everything happens behind the scenes:</p>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-foreground">
            <li><strong>We schedule your child&apos;s lessons</strong> based on the agreed-upon weekly time slot.</li>
            <li><strong>You receive email notifications</strong> before charges, after payments, and before upcoming lessons.</li>
            <li>
              <strong>Your credit card is charged automatically</strong> on the 1st of each month for the lessons
              scheduled that month.
            </li>
          </ul>
        </Section>

        <Section title="Setting Up Payment">
          <p>
            When your child is first enrolled, you&apos;ll receive an <strong>onboarding email</strong> with a
            secure link to save your credit card.
          </p>
          <ol className="mt-2 list-decimal pl-5 space-y-1 text-foreground">
            <li>Click the link in the email — it opens a <strong>Stripe Checkout</strong> page (our secure payment processor).</li>
            <li>Enter your credit or debit card details.</li>
            <li>Submit — your card is now on file.</li>
          </ol>
          <p className="mt-3">
            <strong>Your card information is never stored on our servers.</strong> Stripe handles all payment data
            securely. You can update your card at any time by contacting us.
          </p>
        </Section>

        <Section title="Monthly Billing">
          <h3 className="text-lg font-medium text-foreground">When You&apos;re Charged</h3>
          <p>
            Your card is charged on the <strong>1st of each month</strong> for all lessons scheduled during that
            month. Billing is automated — no manual invoices or payment reminders needed.
          </p>

          <h3 className="mt-4 text-lg font-medium text-foreground">How Charges Are Calculated</h3>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-foreground">
            <li>Each student has an <strong>hourly rate</strong> agreed upon at enrollment.</li>
            <li>
              Charges are calculated based on the <strong>exact number of lessons scheduled</strong> for the month
              (not attended — scheduled).
            </li>
            <li>
              If your family has multiple students (siblings), each student&apos;s lessons are billed as separate
              line items, combined into one charge per family.
            </li>
          </ul>

          <h3 className="mt-4 text-lg font-medium text-foreground">What You&apos;ll Receive</h3>
          <div className="mt-2 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm text-left text-foreground">
              <thead className="bg-muted text-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">What It Contains</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-2.5"><strong>Charge Notice</strong></td>
                  <td className="px-4 py-2.5">~3 days before the 1st</td>
                  <td className="px-4 py-2.5">An itemized preview of upcoming lessons and total amount due</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5"><strong>Receipt</strong></td>
                  <td className="px-4 py-2.5">After successful payment</td>
                  <td className="px-4 py-2.5">Confirmation of payment with per-student breakdown</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5"><strong>Payment Failure Alert</strong></td>
                  <td className="px-4 py-2.5">If your card is declined</td>
                  <td className="px-4 py-2.5">Notification that payment failed, with instructions to update your card</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5"><strong>Lesson Reminder</strong></td>
                  <td className="px-4 py-2.5">48 hours before each lesson</td>
                  <td className="px-4 py-2.5">Reminder of your child&apos;s upcoming lesson date and time</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="mt-4 text-lg font-medium text-foreground">Example Monthly Charge</h3>
          <p className="text-foreground">
            If your child has 4 lessons scheduled in a month at $50/hour:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-foreground">
            <li>4 lessons × 1 hour = 4 hours</li>
            <li>4 hours × $50/hour = <strong>$200.00 CAD</strong></li>
          </ul>
        </Section>

        <Section title="Missed Lessons & Credits">
          <p>We understand that life happens. Here&apos;s how missed lessons are handled:</p>

          <h3 className="mt-4 text-lg font-medium text-foreground">Illness or No-Show (Missed Lesson)</h3>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-foreground">
            <li>
              If your child <strong>cannot attend</strong> a scheduled lesson (e.g., illness), notify us as soon as
              possible.
            </li>
            <li>We mark the lesson as <strong>Missed</strong> in our system.</li>
            <li>
              A <strong>credit is automatically applied</strong> to your next month&apos;s bill, offsetting the
              charge for that lesson.
            </li>
            <li>
              If your child <strong>attends only part</strong> of a lesson (e.g. joining late or leaving early), we
              may mark it as <strong>half missed</strong> and apply a <strong>half credit</strong> to your next bill.
            </li>
          </ul>

          <h3 className="mt-4 text-lg font-medium text-foreground">Cancelled by the School (Skipped Lesson)</h3>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-foreground">
            <li>If we need to cancel a lesson, it is marked as <strong>Skipped</strong>.</li>
            <li>
              <strong>No charge</strong> is applied for skipped lessons — the credit appears on your next bill.
            </li>
          </ul>

          <h3 className="mt-4 text-lg font-medium text-foreground">Restoring a Lesson</h3>
          <p className="text-foreground">
            If a missed lesson is rescheduled, the credit is reversed and the lesson is restored to your billing.
          </p>

          <p className="mt-3 text-sm text-muted-foreground">
            <strong>Important:</strong> Credits from missed lessons are applied automatically to your next monthly
            invoice. You do not need to request a refund — it happens seamlessly.
          </p>
        </Section>

        <Section title="Mid-Month Enrollment">
          <p>
            If your family joins <strong>after the 1st of the month</strong>, here&apos;s what happens:
          </p>
          <ol className="mt-2 list-decimal pl-5 space-y-1 text-foreground">
            <li>You&apos;ll receive an onboarding email to save your card.</li>
            <li>
              We&apos;ll send a <strong>separate billing email</strong> with an itemized list of lessons for the
              current month (from your start date to the end of the month).
            </li>
            <li>Your card will be charged <strong>24 hours after</strong> you receive that email.</li>
            <li>Starting the following month, you&apos;ll be billed on the regular 1st-of-the-month cycle.</li>
          </ol>
        </Section>

        <Section title="Frequently Asked Questions">
          <div className="space-y-3">
            <FaqItem
              question="Can I see my upcoming lessons before being charged?"
              answer="Yes! The charge notice email (sent ~3 days before the 1st) includes a full breakdown of all scheduled lessons for the upcoming month."
            />
            <FaqItem
              question="What if my card is declined?"
              answer="You'll receive an email notification. Stripe will automatically retry the charge. If it continues to fail, please update your card by contacting us, and we'll send a new onboarding link."
            />
            <FaqItem
              question="Can I change my child's lesson time?"
              answer="Yes — contact us to discuss a new weekly time slot. Changes will be reflected in future billing cycles."
            />
            <FaqItem
              question="What if we want to add another student (sibling)?"
              answer="Contact us to add another student to your family. Their lessons will appear as an additional line item on your monthly bill."
            />
            <FaqItem
              question="Do I get a receipt for tax purposes?"
              answer="Yes — every successful payment triggers a receipt email with the full breakdown. You can also request an annual summary from us."
            />
            <FaqItem
              question="What timezone are lesson times in?"
              answer="Lesson times in our emails are shown in your family's local timezone (Eastern Time by default) with the timezone abbreviation included, so you always know when a lesson starts for you. Contact us if you'd like to change the timezone used for your emails."
            />
            <FaqItem
              question="How are billing units calculated?"
              answer="Billing is based on 15-minute increments. For example, a 1-hour lesson = 4 billing units. Your hourly rate is applied to the total scheduled hours."
            />
          </div>
        </Section>

        <Section title="Contact Us">
          <p className="text-foreground">
            If you have any questions about your account, billing, or lessons, please reach out to us directly.
            We&apos;re happy to help.
          </p>
        </Section>

        <p className="mt-10 text-xs text-muted-foreground">
          This guide was last updated in August 2026. For the most current information, please contact Miss Loh
          Tutoring School directly.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="font-medium text-foreground">{question}</p>
      <p className="mt-1 text-muted-foreground">{answer}</p>
    </div>
  );
}
