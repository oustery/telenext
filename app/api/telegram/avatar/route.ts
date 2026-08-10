import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient } from "@/lib/telegram/client";

export async function GET(req: NextRequest) {
  try {
    const chatId = req.nextUrl.searchParams.get("chatId");
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
        else entity = await client.getEntity(chatId as any);
      } else {
        entity = await client.getEntity(chatId);
      }
    } catch {}

    try {
      const buffer: Buffer = await client.downloadProfilePhoto(entity) as any;
      if (!buffer || buffer.length === 0) {
        return new NextResponse(null, { status: 404 });
      }
      return new NextResponse(buffer as any, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
          "Content-Length": buffer.length.toString(),
        },
      });
    } catch (e: any) {
      // No photo
      return new NextResponse(null, { status: 404 });
    }
  } catch (e: any) {
    console.error("avatar error", e);
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
