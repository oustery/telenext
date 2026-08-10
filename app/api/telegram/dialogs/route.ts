import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient, isFloodWaitError, destroyClient } from "@/lib/telegram/client";

function isAuthKeyDuplicated(e: any): boolean {
  const msg = e?.errorMessage || e?.message || String(e);
  return msg.includes("AUTH_KEY_DUPLICATED") || msg.includes("AuthKeyDuplicated");
}

export async function GET(req: NextRequest) {
  let userId: string | null = null;
  try {
    const found = await getSingleUserClient();
    if (!found) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    userId = found.user.id;
    const { client } = found;

    const dialogs = await client.getDialogs({ limit: 80 });

    // Батчим аватарки в том же коннекте чтобы не плодить параллельные /avatar запросы (которые вызывают AUTH_KEY_DUPLICATED)
    const mapped = await Promise.all(dialogs.map(async (d: any) => {
      const entity: any = d.entity;
      const isChannel = d.isChannel || entity?.broadcast === true || entity?.className === "Channel";
      const isGroup = d.isGroup || entity?.className === "Chat" || entity?.megagroup === true;
      const finalIsChannel = isChannel && !entity?.megagroup;
      const finalIsGroup = isGroup || (isChannel && entity?.megagroup);
      const title = d.title || entity?.title || entity?.firstName || "Без названия";
      const username = entity?.username || undefined;
      const lastMsg = d.message?.message || "";
      const unread = d.unreadCount || 0;
      const date = d.date ? new Date(d.date * 1000).toLocaleDateString("ru-RU") : "";
      let id: string;
      if (finalIsChannel && entity?.id) id = `-100${entity.id}`;
      else if (entity?.id) id = entity.id.toString();
      else id = d.id?.toString() || title;

      // Пытаемся скачать аватарку прямо здесь, но не фейлим весь список если ошибка
      let avatarB64: string | null = null;
      try {
        const buf: Buffer | undefined = await client.downloadProfilePhoto(entity, { isBig: false } as any) as any;
        if (buf && (buf as Buffer).length > 0) {
          avatarB64 = `data:image/jpeg;base64,${(buf as Buffer).toString("base64")}`;
        }
      } catch {}

      return {
        id,
        title,
        username,
        lastMessage: lastMsg.slice(0, 80),
        unreadCount: unread,
        isChannel: finalIsChannel,
        isGroup: finalIsGroup,
        date,
        avatar: avatarB64, // теперь фронт не делает N параллельных /avatar запросов
      };
    }));

    return NextResponse.json({ dialogs: mapped }, {
      headers: { "Cache-Control": "private, max-age=5" },
    });
  } catch (e: any) {
    console.error("dialogs error", e);
    if (isAuthKeyDuplicated(e)) {
      if (userId) try { await destroyClient(userId); } catch {}
      return NextResponse.json({ error: "AUTH_KEY_DUPLICATED: Telegram отклонил параллельный коннект. Подожди 2-3 сек и обнови." }, { status: 429, headers: { "Retry-After": "3" } });
    }
    const fw = isFloodWaitError(e);
    if (fw) return NextResponse.json({ error: `FloodWait: подожди ${fw}с` }, { status: 429, headers: { "Retry-After": String(fw) } });
    const msg = e?.errorMessage || e?.message || "Failed";
    if (msg.includes("AUTH_KEY_UNREGISTERED") || msg.includes("SESSION_REVOKED") || msg.includes("Unauthorized")) {
      return NextResponse.json({ error: "Сессия истекла, войдите заново" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
