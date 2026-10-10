import { signIn } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/rate-limit";
import { GraduateIcon } from "@/components/icons";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; callbackUrl?: string }> }) {
  const { sent, error, callbackUrl } = await searchParams;

  async function submit(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!rateLimit(`login:${ip}:${email}`)) {
      redirect("/login?error=rate_limited");
    }
    await signIn("email", { email, redirect: false, redirectTo: callbackUrl ?? "/" });
    redirect("/login?sent=1");
  }

  return (
    <div className="relative flex min-h-full flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-primary-soft),transparent)]"
      />
      <form
        action={submit}
        className="card relative w-full max-w-sm p-7"
      >
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <GraduateIcon width={22} height={22} />
        </div>
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mb-6 text-sm text-muted-foreground">Enter your email to receive a sign-in link.</p>
        {sent && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-600/20">
            Check your inbox for a sign-in link.
          </p>
        )}
        {error === "rate_limited" && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-600/20">
            Too many sign-in attempts for this email. Please wait about 10 minutes and try again.
          </p>
        )}
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="input mb-4"
          placeholder="you@example.com"
        />
        <button className="btn btn-primary w-full py-2.5">
          Send sign-in link
        </button>
      </form>
    </div>
  );
}

export const dynamic = "force-dynamic";
