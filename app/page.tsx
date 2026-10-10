import Link from "next/link";
import { GraduateIcon } from "@/components/icons";

export default function Home() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-primary-soft),transparent)]"
      />
      <div className="relative max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[var(--shadow-card-hover)]">
          <GraduateIcon width={28} height={28} />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight">Miss Loh Tutoring School</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Automatic recurring billing and scheduling for Miss Loh Tutoring School.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/admin" className="btn btn-primary px-5 py-2.5">
            Open admin
          </Link>
          <Link href="/family-guide" className="btn btn-secondary px-5 py-2.5">
            Family guide
          </Link>
        </div>
      </div>
    </div>
  );
}
