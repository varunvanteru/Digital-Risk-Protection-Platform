import { ready } from "@/server/init";
import { handle } from "@/server/routes";
import { workspaceCookie, workspaceFrom } from "@/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  try {
    await ready();
  } catch (e) {
    console.error("API not ready", e);
    return Response.json({ detail: "The database is unavailable. Check the MySQL settings." }, { status: 503 });
  }
  // Each browser has its own private workspace, named by a cookie set on its first request.
  const { ws, isNew } = workspaceFrom(req);
  const res = await handle(req.method, path.join("/"), req, ws);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (isNew) headers.append("Set-Cookie", workspaceCookie(ws, new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https"));
  return Response.json(res.body, { status: res.status, headers });
}

export { serve as GET, serve as POST, serve as PUT, serve as PATCH, serve as DELETE };
