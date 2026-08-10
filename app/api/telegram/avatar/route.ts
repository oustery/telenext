import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient, isFloodWaitError } from "@/lib/telegram/client";
import { resolveEntity } from "@/lib/telegram/resolve";
import { sanitizeChatId } from "@/lib/validate";

export async function GET(req: NextRequest) {
  try {
    const chatIdRaw = req.nextUrl.searchParams.get("chatId");
    if (!chatIdRaw) return NextResponse.json({ error: "chatId required" }, { status: 400 });
    const chatId = sanitizeChatId(chatIdRaw);

    const found = await getSingleUserClient();
    if (!found) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { client } = found;

    const entity = await resolveEntity(chatId, client);

    try {
      const buffer: Buffer = await client.downloadProfilePhoto(entity, { isBig: false } as any) as any;
      if (!buffer || buffer.length === 0) return new NextResponse(null, { status: 404 });
      return new NextResponse(buffer as any, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
          "Content-Length": buffer.length.toString(),
        },
      });
    } catch (e: any) {
      const fw = isFloodWaitError(e);
      if (fw) return NextResponse.json({ error: `FloodWait: подожди ${fw}с` }, { status: 429, headers: { "Retry-After": String(fw) } });
      return new NextResponse(null, { status: 404 });
    }
  } catch (e: any) {
    console.error("avatar error", e);
    const fw = isFloodWaitError(e);
    if (fw) return NextResponse.json({ error: `FloodWait` }, { status: 429, headers: { "Retry-After": String(fw) } });
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
