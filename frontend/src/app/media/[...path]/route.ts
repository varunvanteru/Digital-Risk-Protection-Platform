import { ready } from "@/server/init";
import { getMedia } from "@/server/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentType(b: Buffer): string {
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.subarray(0, 4).toString() === "RIFF") return "image/webp";
  if (b.subarray(0, 3).toString() === "GIF") return "image/gif";
  return "application/octet-stream";
}

/** Brand logos and simulated avatars, from the database or data/demo-media. */
export async function GET(_: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  try {
    await ready();
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
  const media = await getMedia(path.map(decodeURIComponent).join("/"));
  if (!media) return new Response("Not Found", { status: 404 });
  return new Response(new Uint8Array(media.data), {
    headers: { "Content-Type": contentType(media.data), "Cache-Control": "public, max-age=300" },
  });
}
