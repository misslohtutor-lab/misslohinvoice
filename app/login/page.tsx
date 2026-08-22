import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default function LoginPage() {
  async function submit(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
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