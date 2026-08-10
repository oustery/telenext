import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient } from "@/lib/telegram/client";

export async function GET(req: NextRequest) {
  try {
    const chatId = req.nextUrl.searchParams.get("chatId");
    const limit = Number(req.nextUrl.searchParams.get("limit") || "50");
    if (!chatId) return NextResponse.json({ error: "chatId required" }, { status: 400 });

    const found = await getSingleUserClient();
    if (!found) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { client } = found;

    let entity: any = chatId;
    try {
      if (/^-?\d+$/.test(chatId)) {
        const dialogs = await client.getDialogs({});
        const match = dialogs.find((d: any) => {
          const eid = d.entity?.id?.toString();
          return d.id?.toString() === chatId || eid === chatId.replace("-100", "") || `-100${eid}` === chatId;
        });
        if (match) entity = match.entity;
      } else {
        entity = await client.getEntity(chatId);
      }
    } catch {}

    const messages = await client.getMessages(entity, { limit, reverse: false });
    const me = await client.getMe();
    const myId = me.id.toString();

    const mapped = messages.map((m: any) => {
      const media = m.media;
      let mediaType: string | null = null;
      let mime: string | null = null;
      let fileName: string | null = null;
      if (media) {
        if (media.className === "MessageMediaPhoto") mediaType = "photo";
        else if (media.className === "MessageMediaDocument") {
          const doc: any = media.document;
          mime = doc?.mimeType || "";
          fileName = doc?.attributes?.find((a: any) => a.fileName)?.fileName || null;
          if (mime?.startsWith("video")) mediaType = "video";
          else if (mime?.startsWith("image")) mediaType = "photo";
          else if (mime?.startsWith("audio") || mime?.includes("ogg") || mime?.includes("voice")) mediaType = "voice";
          else mediaType = "document";
        } else if (media.className === "MessageMediaWebPage") mediaType = "webpage";
      }

      return {
        id: m.id,
        text: m.message || "",
        date: m.date ? new Date(m.date * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "",
        out: m.out || m.senderId?.toString() === myId,
        from: m.sender?.firstName || m.sender?.title || undefined,
        media: !!media,
        mediaType,
        mime,
        fileName,
      };
    }).reverse();

    return NextResponse.json({ messages: mapped });
  } catch (e: any) {
    console.error("messages error", e);
    return NextResponse.json({ error: e?.errorMessage || e?.message || "Failed" }, { status: 500 });
  }
}
