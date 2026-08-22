import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-50">
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="mt-2 text-zinc-500">You don&apos;t have permission to view this page.</p>
      <Link href="/" className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white">Go home</Link>
    </div>
  );
}