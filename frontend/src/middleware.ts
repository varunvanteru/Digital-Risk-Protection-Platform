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

/**
 * A full page load that did not come from one of this site's pages (typed address, bookmark, app icon,
 * a link on another site). The app's own data requests (RSC) are always from inside.
 * The Referer decides, because it reaches the app intact behind Hostinger's CDN, which alters the
 * Sec-Fetch headers: a page load from inside the app (a click, a reload, Continue as demo) names one of
 * its pages; one from outside names none. Sec-Fetch-Site, where present, can only add an "outside".
 */
function openedFromOutside(req: NextRequest): boolean {
  if (req.headers.has("rsc") || req.headers.has("next-router-prefetch")) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site === "none" || site === "cross-site") return true;
  const hosts = new Set([req.headers.get("x-forwarded-host"), req.headers.get("host"), req.nextUrl.host].filter(Boolean));
  try {
    return !hosts.has(new URL(req.headers.get("referer") ?? "").host);
  } catch {
    return true; // no Referer: typed, bookmark or app icon
  }
}

export const config = {
  // Pages only: not the API, media, Next's files, static files, or anything with a file extension.
  matcher: ["/((?!api/|media/|_next/|help/|icons/|landing/|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|sw\\.js|.*\\..*).*)"],
};
