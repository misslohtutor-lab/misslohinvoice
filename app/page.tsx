import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-50">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">Miss Loh Tutoring School</h1>
        <p className="mt-2 text-zinc-500">Automatic recurring billing and scheduling for Miss Loh Tutoring School.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/admin" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700">
            Open admin
          </Link>
        </div>
      </div>
    </div>
  );
}