import { NextRequest, NextResponse } from "next/server";
import { getTempClient, deleteTempClient } from "@/lib/telegram/client";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { createSessionToken, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { phone, password } = await req.json();
    if (!phone || !password) return NextResponse.json({ error: "phone & password required" }, { status: 400 });
    const client = getTempClient(phone);
    if (!client) return NextResponse.json({ error: "Сначала запроси код" }, { status: 400 });

    await client.signInWithPassword({ apiId: Number(process.env.API_ID), apiHash: process.env.API_HASH! } as any, {
      password: async () => password,
      onError: (e: any) => { throw e; },
    } as any);

    // GramJS после signInWithPassword уже авторизован
    const session = (client as any).session.save() as string;
    const sessionEnc = encrypt(session);
    const me = await client.getMe();
    const telegramId = me.id.toString();
    const username = (me as any).username || null;
    const firstName = (me as any).firstName || null;

    const user = await prisma.user.upsert({
      where: { phone },
      update: { sessionEnc, telegramId, username, firstName },
      create: { phone, sessionEnc, apiId: Number(process.env.API_ID), telegramId, username, firstName },
    });

    const token = await createSessionToken({ userId: user.id, phone });
    await setSessionCookie(token);
    deleteTempClient(phone);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("2FA error", e);
    return NextResponse.json({ error: e?.errorMessage || e?.message || "2FA failed" }, { status: 400 });
  }
}
