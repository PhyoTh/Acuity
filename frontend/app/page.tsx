import Link from "next/link";

// Landing page placeholder. Real routing (role-based redirect to
// /interview or /dashboard) is a Deliverable 1 task — see plan.md §6.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-4xl font-bold">DevLens</h1>
        <p className="mt-2 text-neutral-400">
          Live technical interviews with an embedded AI assistant and a hidden
          recruiter telemetry + scorecard dashboard.
        </p>
      </div>
      <div className="flex gap-4 text-sm">
        <Link href="/login" className="rounded bg-white px-4 py-2 font-medium text-black">
          Log in
        </Link>
        <Link href="/signup" className="rounded border border-neutral-700 px-4 py-2">
          Sign up
        </Link>
      </div>
      <p className="text-xs text-neutral-600">
        Scaffold only — no features wired up yet. See plan.md for the roadmap.
      </p>
    </main>
  );
}
