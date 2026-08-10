import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient } from "@/lib/telegram/client";

export async function GET(req: NextRequest) {
  try {
    const found = await getSingleUserClient();
    if (!found) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { client } = found;

    const dialogs = await client.getDialogs({ limit: 100 });

    const mapped = dialogs.map((d: any) => {
      const entity = d.entity;
      const isChannel = d.isChannel || entity?.className === "Channel";
      const isGroup = d.isGroup;
      const title = d.title || entity?.title || "Без названия";
      const username = entity?.username || undefined;
      const lastMsg = d.message?.message || "";
      const unread = d.unreadCount || 0;
      const date = d.date ? new Date(d.date * 1000).toLocaleDateString("ru-RU") : "";
      // chat id: для каналов -100xxxx, для юзеров — id
      const id = entity?.id ? entity.id.toString() : d.id?.toString() || title;
      return {
        id: isChannel ? `-100${entity.id}` : id,
        rawId: entity?.id?.toString(),
        title,
        username,
        lastMessage: lastMsg.slice(0, 80),
        unreadCount: unread,
        isChannel,
        isGroup,
        date,
      };
    });

    return NextResponse.json({ dialogs: mapped });
  } catch (e: any) {
    console.error("dialogs error", e);
    const msg = e?.errorMessage || e?.message || "Failed";
    if (msg.includes("AUTH_KEY_UNREGISTERED") || msg.includes("SESSION_REVOKED")) {
      return NextResponse.json({ error: "Сессия истекла, войдите заново" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
