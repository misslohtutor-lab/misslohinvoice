import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Family Guide — Miss Loh Tutoring School",
  description: "Everything you need to know about how our tutoring service works, billing, and what to expect as a family.",
};

export default function FamilyGuidePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50">
      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold text-zinc-900">
          Welcome to Miss Loh Tutoring School — Family Guide
        </h1>
        <p className="mt-3 text-zinc-500">
          This guide explains everything you need to know about how our tutoring service works, how billing
          operates, and what to expect as a family enrolled in our program.
        </p>

        <hr className="my-10 border-zinc-200" />

        <Section title="How It Works">
          <p>
            Miss Loh Tutoring School provides <strong>online tutoring via Zoom</strong>. Each student (your
            child) is assigned a <strong>weekly schedule</strong> — a consistent day and time for their lessons.
            Our system automatically tracks every lesson and handles all billing for you.
          </p>
          <h3 className="mt-6 text-lg font-medium text-zinc-900">Your Role as a Parent</h3>
          <p>You don&apos;t need to manage a portal or log into any system. Everything happens behind the scenes:</p>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-zinc-700">
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
          <ol className="mt-2 list-decimal pl-5 space-y-1 text-zinc-700">
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
          <h3 className="text-lg font-medium text-zinc-900">When You&apos;re Charged</h3>
          <p>
            Your card is charged on the <strong>1st of each month</strong> for all lessons scheduled during that
            month. Billing is automated — no manual invoices or payment reminders needed.
          </p>

          <h3 className="mt-4 text-lg font-medium text-zinc-900">How Charges Are Calculated</h3>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-zinc-700">
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

          <h3 className="mt-4 text-lg font-medium text-zinc-900">What You&apos;ll Receive</h3>
          <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-sm text-left text-zinc-700">
              <thead className="bg-zinc-100 text-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">What It Contains</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                <tr>
                  <td className="px-4 py-2"><strong>Charge Notice</strong></td>
                  <td className="px-4 py-2">~3 days before the 1st</td>
                  <td className="px-4 py-2">An itemized preview of upcoming lessons and total amount due</td>
                </tr>
                <tr>
                  <td className="px-4 py-2"><strong>Receipt</strong></td>
                  <td className="px-4 py-2">After successful payment</td>
                  <td className="px-4 py-2">Confirmation of payment with per-student breakdown</td>
                </tr>
                <tr>
                  <td className="px-4 py-2"><strong>Payment Failure Alert</strong></td>
                  <td className="px-4 py-2">If your card is declined</td>
                  <td className="px-4 py-2">Notification that payment failed, with instructions to update your card</td>
                </tr>
                <tr>
                  <td className="px-4 py-2"><strong>Lesson Reminder</strong></td>
                  <td className="px-4 py-2">48 hours before each lesson</td>
                  <td className="px-4 py-2">Reminder of your child&apos;s upcoming lesson date and time</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="mt-4 text-lg font-medium text-zinc-900">Example Monthly Charge</h3>
          <p className="text-zinc-700">
            If your child has 4 lessons scheduled in a month at $50/hour:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-zinc-700">
            <li>4 lessons × 1 hour = 4 hours</li>
            <li>4 hours × $50/hour = <strong>$200.00 CAD</strong></li>
          </ul>
        </Section>

        <Section title="Missed Lessons & Credits">
          <p>We understand that life happens. Here&apos;s how missed lessons are handled:</p>

          <h3 className="mt-4 text-lg font-medium text-zinc-900">Illness or No-Show (Missed Lesson)</h3>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-zinc-700">
            <li>
              If your child <strong>cannot attend</strong> a scheduled lesson (e.g., illness), notify us as soon as
              possible.
            </li>
            <li>We mark the lesson as <strong>Missed</strong> in our system.</li>
            <li>
              A <strong>credit is automatically applied</strong> to your next month&apos;s bill, offsetting the
              charge for that lesson.
            </li>
          </ul>

          <h3 className="mt-4 text-lg font-medium text-zinc-900">Cancelled by the School (Skipped Lesson)</h3>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-zinc-700">
            <li>If we need to cancel a lesson, it is marked as <strong>Skipped</strong>.</li>
            <li>
              <strong>No charge</strong> is applied for skipped lessons — the credit appears on your next bill.
            </li>
          </ul>

          <h3 className="mt-4 text-lg font-medium text-zinc-900">Restoring a Lesson</h3>
          <p className="text-zinc-700">
            If a missed lesson is rescheduled, the credit is reversed and the lesson is restored to your billing.
          </p>

          <p className="mt-3 text-sm text-zinc-600">
            <strong>Important:</strong> Credits from missed lessons are applied automatically to your next monthly
            invoice. You do not need to request a refund — it happens seamlessly.
          </p>
        </Section>

        <Section title="Mid-Month Enrollment">
          <p>
            If your family joins <strong>after the 1st of the month</strong>, here&apos;s what happens:
          </p>
          <ol className="mt-2 list-decimal pl-5 space-y-1 text-zinc-700">
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
          <div className="space-y-4 text-zinc-700">
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
              answer="All lesson times are in Eastern Time (ET) — America/Toronto."
            />
            <FaqItem
              question="How are billing units calculated?"
              answer="Billing is based on 15-minute increments. For example, a 1-hour lesson = 4 billing units. Your hourly rate is applied to the total scheduled hours."
            />
          </div>
        </Section>

        <Section title="Contact Us">
          <p className="text-zinc-700">
            If you have any questions about your account, billing, or lessons, please reach out to us directly.
            We&apos;re happy to help.
          </p>
        </Section>

        <p className="mt-10 text-xs text-zinc-400">
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
      <h2 className="text-xl font-medium text-zinc-900">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-zinc-700">{children}</div>
    </section>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div>
      <p className="font-medium text-zinc-900">{question}</p>
      <p className="mt-1">{answer}</p>
    </div>
  );
}
