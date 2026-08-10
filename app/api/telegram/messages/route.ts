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
      // Service message (user joined, etc.)
      if (m.className === "MessageService") {
        const action: string = m.action?.className || "MessageService";
        let text = "";
        if (action === "MessageActionChatCreate") text = `Создана группа "${m.action.title}"`;
        else if (action === "MessageActionChatAddUser") text = `Пользователь добавлен`;
        else if (action === "MessageActionChatJoinedByLink") text = `Вошёл по ссылке`;
        else if (action === "MessageActionChannelCreate") text = `Создан канал`;
        else text = m.message || "Сервисное сообщение";
        return {
          id: m.id,
          text,
          date: m.date ? new Date(m.date * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "",
          timestamp: m.date || 0,
          out: false,
          isService: true,
          media: false,
          mediaType: null,
        };
      }

      const media = m.media;
      let mediaType: string | null = null;
      let mime: string | null = null;
      let fileName: string | null = null;
      let extra: any = {};

      if (media) {
        const cn = media.className;
        if (cn === "MessageMediaPhoto") {
          mediaType = "photo";
        } else if (cn === "MessageMediaDocument") {
          const doc: any = media.document;
          mime = doc?.mimeType || "";
          fileName = doc?.attributes?.find((a: any) => a.fileName)?.fileName || null;
          const isSticker = doc?.attributes?.some((a: any) => a.className === "DocumentAttributeSticker");
          const isAnimated = doc?.attributes?.some((a: any) => a.className === "DocumentAttributeVideo" && a.roundMessage);
          const isVoice = doc?.attributes?.some((a: any) => a.className === "DocumentAttributeAudio" && a.voice);
          const isAudio = doc?.attributes?.some((a: any) => a.className === "DocumentAttributeAudio" && !a.voice);
          const stickerAlt = doc?.attributes?.find((a: any) => a.alt)?.alt || "";

          if (isSticker) {
            mediaType = "sticker";
            extra.stickerEmoji = stickerAlt || "❤️";
          } else if (isVoice) mediaType = "voice";
          else if (isAudio) mediaType = "audio";
          else if (mime?.startsWith("video")) mediaType = "video";
          else if (mime?.startsWith("image")) mediaType = "photo";
          else mediaType = "document";

          // для войса/аудио — длительность
          const audioAttr = doc?.attributes?.find((a: any) => a.className === "DocumentAttributeAudio");
          if (audioAttr) extra.duration = audioAttr.duration;
        } else if (cn === "MessageMediaWebPage") {
          mediaType = "webpage";
          extra.webpage = {
            url: media.webpage?.url,
            title: media.webpage?.title,
            description: media.webpage?.description,
            siteName: media.webpage?.siteName,
          };
        } else if (cn === "MessageMediaGeo" || cn === "MessageMediaVenue") {
          mediaType = "location";
          extra.geo = media.geo || media.venue?.geo;
          extra.venueTitle = media.venue?.title;
          extra.venueAddress = media.venue?.address;
        } else if (cn === "MessageMediaContact") {
          mediaType = "contact";
          extra.contact = {
            name: `${media.firstName || ""} ${media.lastName || ""}`.trim(),
            phone: media.phoneNumber,
          };
        } else if (cn === "MessageMediaPoll") {
          mediaType = "poll";
          extra.poll = {
            question: media.poll?.question?.text || media.poll?.question || "",
            answers: media.poll?.answers?.map((a: any) => a.text?.text || a.text) || [],
            totalVoters: media.results?.totalVoters,
          };
        } else if (cn === "MessageMediaGame") {
          mediaType = "game";
          extra.game = media.game;
        } else {
          mediaType = "unsupported";
        }
      }

      // Forwarded
      let forwardedFrom: string | null = null;
      if (m.fwdFrom) {
        forwardedFrom = m.fwdFrom.fromName || m.fwdFrom.fromId?.toString() || "Переслано";
      }

      // Reply
      let replyTo: number | null = null;
      if (m.replyTo?.replyToMsgId) replyTo = m.replyTo.replyToMsgId;

      return {
        id: m.id,
        text: m.message || "",
        date: m.date ? new Date(m.date * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "",
        timestamp: m.date || 0,
        out: m.out || m.senderId?.toString() === myId,
        from: m.sender?.firstName || m.sender?.title || undefined,
        fromId: m.senderId?.toString() || null,
        media: !!media,
        mediaType,
        mime,
        fileName,
        forwardedFrom,
        replyTo,
        isService: false,
        ...extra,
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
