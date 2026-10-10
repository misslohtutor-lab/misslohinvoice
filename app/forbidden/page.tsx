import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">Error 403</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Access denied</h1>
      <p className="mt-2 text-muted-foreground">You don&apos;t have permission to view this page.</p>
      <Link href="/" className="btn btn-primary mt-6 px-5 py-2.5">Go home</Link>
    </div>
  );
}
