import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient, isFloodWaitError, destroyClient } from "@/lib/telegram/client";
import { resolveEntity } from "@/lib/telegram/resolve";
import { sanitizeChatId } from "@/lib/validate";

function isAuthKeyDuplicated(e: any): boolean {
  const msg = e?.errorMessage || e?.message || String(e);
  return msg.includes("AUTH_KEY_DUPLICATED") || msg.includes("AuthKeyDuplicated");
}

export async function GET(req: NextRequest) {
  let userId: string | null = null;
  try {
    const chatIdRaw = req.nextUrl.searchParams.get("chatId");
    if (!chatIdRaw) return NextResponse.json({ error: "chatId required" }, { status: 400 });
    const chatId = sanitizeChatId(chatIdRaw);
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "40"), 100);
    const offsetId = req.nextUrl.searchParams.get("offsetId") ? Number(req.nextUrl.searchParams.get("offsetId")) : undefined;

    const found = await getSingleUserClient();
    if (!found) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    userId = found.user.id;
    const { client } = found;

    const entity = await resolveEntity(chatId, client);

    const messages = await client.getMessages(entity, {
      limit,
      offsetId: offsetId,
      reverse: false,
    } as any);

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
        timestamp: m.date || 0,
        out: m.out || m.senderId?.toString() === myId,
        from: m.sender?.firstName || m.sender?.title || undefined,
        media: !!media,
        mediaType,
        mime,
        fileName,
      };
    }).reverse();

    const hasMore = messages.length === limit;
    const nextOffsetId = mapped.length ? mapped[0].id : undefined;

    return NextResponse.json({ messages: mapped, hasMore, nextOffsetId }, {
      headers: { "Cache-Control": "private, max-age=2" },
    });
  } catch (e: any) {
    console.error("messages error", e);
    if (isAuthKeyDuplicated(e)) {
      if (userId) try { await destroyClient(userId); } catch {}
      return NextResponse.json({ error: "AUTH_KEY_DUPLICATED: параллельный запрос. Попробуй снова через 2с." }, { status: 429, headers: { "Retry-After": "2" } });
    }
    const fw = isFloodWaitError(e);
    if (fw) return NextResponse.json({ error: `FloodWait: подожди ${fw}с` }, { status: 429, headers: { "Retry-After": String(fw) } });
    return NextResponse.json({ error: e?.errorMessage || e?.message || "Failed" }, { status: 500 });
  }
}
