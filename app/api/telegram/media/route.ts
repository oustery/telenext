import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient } from "@/lib/telegram/client";

export async function GET(req: NextRequest) {
  try {
    const chatId = req.nextUrl.searchParams.get("chatId");
    const messageId = req.nextUrl.searchParams.get("messageId");
    if (!chatId || !messageId) return NextResponse.json({ error: "chatId & messageId required" }, { status: 400 });

    const found = await getSingleUserClient();
    if (!found) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { client } = found;

    // Находим entity
    let entity: any = chatId;
    if (/^-?\d+$/.test(chatId)) {
      const dialogs = await client.getDialogs({});
      const match = dialogs.find((d: any) => `-100${d.entity?.id}` === chatId || d.entity?.id?.toString() === chatId.replace("-100",""));
      if (match) entity = match.entity;
    } else {
      try { entity = await client.getEntity(chatId); } catch {}
    }

    const msgs = await client.getMessages(entity, { ids: [Number(messageId)] });
    const msg: any = Array.isArray(msgs) ? msgs[0] : msgs;
    if (!msg || !msg.media) return NextResponse.json({ error: "No media" }, { status: 404 });

    const buffer: Buffer = await client.downloadMedia(msg.media, {}) as any;
    if (!buffer) return NextResponse.json({ error: "Download failed" }, { status: 500 });

    // Определяем content-type по media
    let contentType = "application/octet-stream";
    let ext = "bin";
    const media = msg.media;
    if (media?.className === "MessageMediaPhoto") {
      contentType = "image/jpeg";
      ext = "jpg";
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
        "Cache-Control": "public, max-age=86400",
        "Content-Disposition": `inline; filename="media-${messageId}.${ext}"`,
      },
    });
  } catch (e: any) {
    console.error("media error", e);
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
