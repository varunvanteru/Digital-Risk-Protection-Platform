import { NextResponse, type NextRequest } from "next/server";

/**
 * The app opens on the sign-in page until the visitor signs in or picks "Continue as demo".
 * This only checks that one of the two cookies is present; the API checks the session itself.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const signedIn = req.cookies.has("bs_session");
  const entered = signedIn || req.cookies.get("bs_demo")?.value === "1";

  if (pathname === "/login") {
    return signedIn ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (entered) return NextResponse.next();

  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Pages only: not the API, media, Next's files, static files, or anything with a file extension.
  matcher: ["/((?!api/|media/|_next/|help/|icons/|landing/|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|sw\\.js|.*\\..*).*)"],
};
