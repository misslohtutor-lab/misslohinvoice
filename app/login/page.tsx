import { signIn } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/rate-limit";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;

  async function submit(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!rateLimit(`login:${ip}:${email}`)) {
      redirect("/login?error=rate_limited");
    }
    await signIn("email", { email, redirect: false });
    redirect("/login?sent=1");
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
      <form
        action={submit}
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <h1 className="mb-1 text-xl font-semibold">Miss Loh Tutoring School</h1>
        <p className="mb-5 text-sm text-zinc-500">Enter your email to receive a sign-in link.</p>
        {sent && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Check your inbox for a sign-in link.
          </p>
        )}
        {error === "rate_limited" && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Too many sign-in attempts for this email. Please wait about 10 minutes and try again.
          </p>
        )}
        <label className="mb-1 block text-sm font-medium" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="mb-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="you@example.com"
        />
        <button className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700">
          Send sign-in link
        </button>
      </form>
    </div>
  );
}

export const dynamic = "force-dynamic";