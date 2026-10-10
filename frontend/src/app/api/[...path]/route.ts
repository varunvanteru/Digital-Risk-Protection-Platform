import { ready } from "@/server/init";
import { handle } from "@/server/routes";

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
  const res = await handle(req.method, path.join("/"), req);
  return Response.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}

export { serve as GET, serve as POST, serve as PUT, serve as PATCH, serve as DELETE };
