import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient } from "@/lib/telegram/client";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const chatId = form.get("chatId") as string;
    const caption = (form.get("caption") as string) || "";
    const file = form.get("file") as File | null;

    if (!chatId || !file) return NextResponse.json({ error: "chatId & file required" }, { status: 400 });

    const found = await getSingleUserClient();
    if (!found) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { client } = found;

    let entity: any = chatId;
    if (/^-?\d+$/.test(chatId)) {
      const dialogs = await client.getDialogs({});
      const match = dialogs.find((d: any) => `-100${d.entity?.id}` === chatId || d.entity?.id?.toString() === chatId.replace("-100",""));
      if (match) entity = match.entity;
    } else {
      try { entity = await client.getEntity(chatId); } catch {}
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // GramJS sendFile умеет с Buffer + кастомным атрибутом
    await client.sendFile(entity, {
      file: buffer as any,
      caption: caption || undefined,
      // @ts-ignore — GramJS примет file как Buffer
      attributes: [],
    } as any);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("sendFile error", e);
    return NextResponse.json({ error: e?.errorMessage || e?.message || "Failed" }, { status: 500 });
  }
}
