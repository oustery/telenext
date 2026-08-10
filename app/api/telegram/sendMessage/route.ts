import { NextRequest, NextResponse } from "next/server";
import { getSingleUserClient } from "@/lib/telegram/client";

export async function POST(req: NextRequest) {
  try {
    const { chatId, message } = await req.json();
    if (!chatId || !message) return NextResponse.json({ error: "chatId & message required" }, { status: 400 });

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

    const sent = await client.sendMessage(entity, { message });

    return NextResponse.json({ ok: true, id: (sent as any).id });
  } catch (e: any) {
    console.error("sendMessage error", e);
    const msg = e?.errorMessage || e?.message || "Failed";
    if (msg.includes("FLOOD_WAIT")) {
      return NextResponse.json({ error: `Флуд-контроль: ${msg}. Подожди.` }, { status: 429 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
