import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient, isFloodWaitError } from "@/lib/telegram/client";
import { resolveEntity } from "@/lib/telegram/resolve";
import { sanitizeChatId } from "@/lib/validate";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { MAX_FILE_SIZE, validateFile } from "@/lib/validate";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const chatId = form.get("chatId") as string;
    const caption = (form.get("caption") as string) || "";
    const file = form.get("file") as File | null;

    if (!chatId || !file) return NextResponse.json({ error: "chatId & file required" }, { status: 400 });
    const vErr = validateFile(file);
    if (vErr) return NextResponse.json({ error: vErr }, { status: 413 });

    if (caption.length > 1024) return NextResponse.json({ error: "Подпись слишком длинная" }, { status: 400 });

    const ip = getClientIp(req);
    const rl = rateLimit(`sendFile:${ip}`, 10, 60_000);
    if (!rl.ok) return NextResponse.json({ error: `Слишком часто. Подожди ${rl.retryAfter}с` }, { status: 429, headers: { "Retry-After": String(rl.retryAfter || 30) } });

    const found = await getSingleUserClient();
    if (!found) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { client } = found;

    // защита от OOM — уже проверили MAX_FILE_SIZE
    const entity = await resolveEntity(sanitizeChatId(chatId), client);
    const buffer = Buffer.from(await file.arrayBuffer());

    await client.sendFile(entity, {
      file: buffer as any,
      caption: caption || undefined,
      attributes: [],
    } as any);

    return NextResponse.json({ ok: true, size: buffer.length });
  } catch (e: any) {
    console.error("sendFile error", e);
    const fw = isFloodWaitError(e);
    if (fw) return NextResponse.json({ error: `Флуд-контроль: подожди ${fw}с` }, { status: 429, headers: { "Retry-After": String(fw) } });
    const msg = e?.errorMessage || e?.message || "Failed";
    if (msg.includes("CHAT_WRITE_FORBIDDEN")) return NextResponse.json({ error: "В этом канале нельзя писать" }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
