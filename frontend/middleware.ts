import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Refreshes the Supabase session cookie on every request and enforces role-based routing:
//   - /dashboard*  -> interviewers only
//   - /candidate*  -> candidates only
//   - /interview*  -> any authenticated user
//   - /join/*      -> public (candidate invite entry point)
//   - /, /login, /signup -> authenticated users are bounced back to their own home so the
//                           browser "back" button can't leave them stranded on a public/auth
//                           page after they've logged in
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const role = (user?.user_metadata?.role as string | undefined) ?? null;

  const needsAuth =
    path.startsWith("/dashboard") ||
    path.startsWith("/interview") ||
    path.startsWith("/candidate");
  if (needsAuth && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (path.startsWith("/dashboard") && role !== "interviewer") {
    return NextResponse.redirect(new URL("/candidate", request.url));
  }
  if (path.startsWith("/candidate") && role !== "candidate") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Authenticated user landing on a public/auth page — bounce them back to their own home.
  // Without this, hitting the browser "back" button from /dashboard would leave them on the
  // public landing page or login form, even though their session is still valid.
  if (user && (path === "/" || path === "/login" || path === "/signup")) {
    const home = role === "interviewer" ? "/dashboard" : "/candidate";
    return NextResponse.redirect(new URL(home, request.url));
  }

  // Disable bfcache on auth-protected pages so the browser doesn't restore a stale render
  // from history when the user hits "back" — middleware would otherwise be skipped and the
  // redirect above wouldn't fire. The perf hit is negligible for our app's traffic.
  if (needsAuth) {
    response.headers.set("Cache-Control", "no-store, must-revalidate");
  }

  return response;
}

export const config = {
  // Run on app routes, skipping static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
