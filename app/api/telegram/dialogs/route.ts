import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient, isFloodWaitError } from "@/lib/telegram/client";

export async function GET(req: NextRequest) {
  try {
    const found = await getSingleUserClient();
    if (!found) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { client } = found;

    // Более точное определение типа: Channel с broadcast vs megagroup
    const dialogs = await client.getDialogs({ limit: 100 });

    const mapped = dialogs.map((d: any) => {
      const entity: any = d.entity;
      // entity может быть Channel с полями broadcast / megagroup
      const isChannel = d.isChannel || entity?.className === "Channel" || entity?.broadcast === true;
      const isGroup = d.isGroup || entity?.className === "Chat" || entity?.megagroup === true;
      // для супергрупп: megagroup true → считаем группой, а не каналом
      const finalIsChannel = isChannel && !entity?.megagroup;
      const finalIsGroup = isGroup || (isChannel && entity?.megagroup);

      const title = d.title || entity?.title || entity?.firstName || "Без названия";
      const username = entity?.username || undefined;
      const lastMsg = d.message?.message || "";
      const unread = d.unreadCount || 0;
      const date = d.date ? new Date(d.date * 1000).toLocaleDateString("ru-RU") : "";

      // Более надёжный id
      let id: string;
      if (finalIsChannel && entity?.id) id = `-100${entity.id}`;
      else if (entity?.id) id = entity.id.toString();
      else id = d.id?.toString() || title;

      return {
        id,
        rawId: entity?.id?.toString(),
        title,
        username,
        lastMessage: lastMsg.slice(0, 80),
        unreadCount: unread,
        isChannel: finalIsChannel,
        isGroup: finalIsGroup,
        date,
      };
    });

    return NextResponse.json({ dialogs: mapped }, {
      headers: { "Cache-Control": "private, max-age=5" },
    });
  } catch (e: any) {
    console.error("dialogs error", e);
    const fw = isFloodWaitError(e);
    if (fw) return NextResponse.json({ error: `FloodWait: подожди ${fw}с` }, { status: 429, headers: { "Retry-After": String(fw) } });
    const msg = e?.errorMessage || e?.message || "Failed";
    if (msg.includes("AUTH_KEY_UNREGISTERED") || msg.includes("SESSION_REVOKED") || msg.includes("Unauthorized")) {
      return NextResponse.json({ error: "Сессия истекла, войдите заново" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
