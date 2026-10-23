import { handleAuth, sessionUser } from "@/server/auth";
import { ready } from "@/server/init";
import { handle } from "@/server/routes";
import { workspaceCookie, workspaceFrom } from "@/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isSecure = (req: Request) => new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";

async function serve(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const route = path.join("/");
  try {
    await ready();
  } catch (e) {
    console.error("API not ready", e);
    return Response.json({ detail: "The database is unavailable. Check the MySQL settings." }, { status: 503 });
  }
  const headers = new Headers({ "Cache-Control": "no-store" });

  // Each browser has its own private workspace, named by a cookie set on its first request.
  // A signed-in account always uses its own workspace, whatever the cookie says.
  const fromCookie = workspaceFrom(req);
  const user = route.startsWith("auth/") ? null : await sessionUser(req);
  const ws = user?.workspaceId ?? fromCookie.ws;

  if (route.startsWith("auth/")) {
    const res = await handleAuth(req.method, route, req, fromCookie.ws);
    for (const c of res.cookies) headers.append("Set-Cookie", c);
    return Response.json(res.body, { status: res.status, headers });
  }

  const res = await handle(req.method, route, req, ws);
  if (fromCookie.isNew || (user && fromCookie.ws !== ws)) headers.append("Set-Cookie", workspaceCookie(ws, isSecure(req)));
  return Response.json(res.body, { status: res.status, headers });
}

export { serve as GET, serve as POST, serve as PUT, serve as PATCH, serve as DELETE };
