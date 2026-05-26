import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Refreshes the Supabase session cookie on every request and enforces role-based routing:
//   - /dashboard*  -> interviewers only
//   - /interview*  -> any authenticated user
//   - /join/*      -> public (candidate invite entry point)
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

  const needsAuth = path.startsWith("/dashboard") || path.startsWith("/interview");
  if (needsAuth && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (path.startsWith("/dashboard") && role !== "interviewer") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  // Run on app routes, skipping static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
