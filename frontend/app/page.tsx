import Link from "next/link";

// Public landing page. Authenticated interviewers are routed onward by the middleware
// (Log in → /dashboard); candidates arrive via their invite link (/join/<code>).
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-4xl font-bold">DevLens</h1>
        <p className="mt-2 text-neutral-400">
          Live technical interviews with an embedded AI assistant and a hidden
          interviewer telemetry + scorecard dashboard.
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
        Interviewers create sessions and share a join link; candidates join through the link.
      </p>
    </main>
  );
}
