import { NextResponse, type NextRequest } from "next/server";

/**
 * The app opens on the sign-in page until the visitor signs in or picks "Continue as demo".
 * A signed-in account goes straight into the app (its session lasts 30 days). A demo visit only
 * lasts while the visitor moves around inside the app: whenever the app is opened from outside it
 * (typed address, bookmark, a link from another site, the installed app), it shows the sign-in page.
 * This only checks the cookies; the API checks the session itself.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const signedIn = req.cookies.has("bs_session");
  const demo = req.cookies.get("bs_demo")?.value === "1";

  if (pathname === "/login") {
    return signedIn ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (signedIn || (demo && !openedFromOutside(req))) return NextResponse.next();

  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

/** A full page load that did not come from this site: Sec-Fetch-Site is "none" (typed, bookmark, app icon) or "cross-site". */
function openedFromOutside(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  const isPageLoad = req.headers.get("sec-fetch-mode") === "navigate" && req.headers.get("sec-fetch-dest") === "document";
  return isPageLoad && (site === "none" || site === "cross-site");
}

export const config = {
  // Pages only: not the API, media, Next's files, static files, or anything with a file extension.
  matcher: ["/((?!api/|media/|_next/|help/|icons/|landing/|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|sw\\.js|.*\\..*).*)"],
};
