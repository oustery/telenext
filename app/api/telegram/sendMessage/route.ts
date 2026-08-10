import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient, isFloodWaitError } from "@/lib/telegram/client";
import { resolveEntity } from "@/lib/telegram/resolve";
import { sanitizeChatId } from "@/lib/validate";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try {
    const { chatId, message } = await req.json();
    if (!chatId || !message?.trim()) return NextResponse.json({ error: "chatId & message required" }, { status: 400 });
    if (message.length > 4096) return NextResponse.json({ error: "Сообщение слишком длинное (макс 4096)" }, { status: 400 });

    const ip = getClientIp(req);
    const rl = rateLimit(`sendMessage:${ip}`, 20, 60_000);
    if (!rl.ok) return NextResponse.json({ error: `Слишком часто. Подожди ${rl.retryAfter}с` }, { status: 429, headers: { "Retry-After": String(rl.retryAfter || 30) } });

    const found = await getSingleUserClient();
    if (!found) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    userId = found.user.id;
    const { client } = found;

    const entity = await resolveEntity(sanitizeChatId(chatId), client);

    const sent = await client.sendMessage(entity, { message: message.trim() });

    return NextResponse.json({ ok: true, id: (sent as any).id });
  } catch (e: any) {
    console.error("sendMessage error", e);
    const msg = e?.errorMessage || e?.message || String(e);
    if (msg.includes("AUTH_KEY_DUPLICATED")) {
      if (userId) try { const { destroyClient } = await import("@/lib/telegram/client"); await destroyClient(userId); } catch {}
      return NextResponse.json({ error: "AUTH_KEY_DUPLICATED: попробуй снова через 2с" }, { status: 429, headers: { "Retry-After": "2" } });
    }
    const fw = isFloodWaitError(e);
    if (fw) return NextResponse.json({ error: `Флуд-контроль: подожди ${fw}с` }, { status: 429, headers: { "Retry-After": String(fw) } });
    if (msg.includes("CHAT_WRITE_FORBIDDEN") || msg.includes("CHAT_RESTRICTED")) {
      return NextResponse.json({ error: "В этом канале нельзя писать" }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
