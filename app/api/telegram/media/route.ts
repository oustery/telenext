import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient, isFloodWaitError } from "@/lib/telegram/client";
import { resolveEntity } from "@/lib/telegram/resolve";
import { sanitizeChatId } from "@/lib/validate";

export async function GET(req: NextRequest) {
  try {
    const chatIdRaw = req.nextUrl.searchParams.get("chatId");
    const messageId = req.nextUrl.searchParams.get("messageId");
    if (!chatIdRaw || !messageId) return NextResponse.json({ error: "chatId & messageId required" }, { status: 400 });
    const chatId = sanitizeChatId(chatIdRaw);

    const found = await getSingleUserClient();
    if (!found) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { client } = found;

    const entity = await resolveEntity(chatId, client);

    const msgs = await client.getMessages(entity, { ids: [Number(messageId)] } as any);
    const msg: any = Array.isArray(msgs) ? msgs[0] : (msgs as any);
    if (!msg || !msg.media) return NextResponse.json({ error: "No media" }, { status: 404 });

    const buffer: Buffer = await client.downloadMedia(msg.media, {}) as any;
    if (!buffer) return NextResponse.json({ error: "Download failed" }, { status: 500 });

    let contentType = "application/octet-stream";
    let ext = "bin";
    const media = msg.media;
    if (media?.className === "MessageMediaPhoto") {
      contentType = "image/jpeg"; ext = "jpg";
    } else if (media?.className === "MessageMediaDocument") {
      const doc: any = media.document;
      const mime = doc?.mimeType || "";
      if (mime) contentType = mime;
      if (mime.includes("mp4") || mime.includes("video")) ext = "mp4";
      else if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
      else if (mime.includes("png")) ext = "png";
      else if (mime.includes("webp")) ext = "webp";
      else if (mime.includes("pdf")) ext = "pdf";
      else if (mime.includes("audio") || mime.includes("ogg")) ext = "ogg";
    }

    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        "Content-Disposition": `inline; filename="media-${messageId}.${ext}"`,
      },
    });
  } catch (e: any) {
    console.error("media error", e);
    const fw = isFloodWaitError(e);
    if (fw) return NextResponse.json({ error: `FloodWait: подожди ${fw}с` }, { status: 429, headers: { "Retry-After": String(fw) } });
    return NextResponse.json({ error: e?.errorMessage || e?.message || "Failed" }, { status: 500 });
  }
}
