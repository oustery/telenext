import { NextRequest, NextResponse } from "next/server";
import { getTempClient, deleteTempClient } from "@/lib/telegram/client";
import { Api } from "telegram/tl";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { createSessionToken, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { phone, phoneCodeHash, code } = await req.json();
    if (!phone || !phoneCodeHash || !code) return NextResponse.json({ error: "phone, phoneCodeHash, code required" }, { status: 400 });

    const client = getTempClient(phone);
    if (!client) return NextResponse.json({ error: "Сначала запроси код" }, { status: 400 });

    try {
      const result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash,
          phoneCode: code,
        })
      );

      // Успех — сохраняем сессию
      const session = (client as any).session.save() as string;
      const sessionEnc = encrypt(session);

      // Достаем инфо о юзере
      const me = await client.getMe();
      const telegramId = me.id.toString();
      const username = (me as any).username || null;
      const firstName = (me as any).firstName || null;

      // single-user режим: upsert
      const user = await prisma.user.upsert({
        where: { phone },
        update: { sessionEnc, telegramId, username, firstName },
        create: { phone, sessionEnc, apiId: Number(process.env.API_ID), telegramId, username, firstName },
      });

      const token = await createSessionToken({ userId: user.id, phone });
      await setSessionCookie(token);
      deleteTempClient(phone);

      return NextResponse.json({ ok: true, user: { id: user.id, phone, username } });
    } catch (e: any) {
      const err = e?.errorMessage || e?.message || "";
      if (err.includes("SESSION_PASSWORD_NEEDED") || err.includes("2FA")) {
        return NextResponse.json({ need2FA: true, error: "Нужен пароль 2FA" }, { status: 400 });
      }
      if (err.includes("PHONE_CODE_INVALID") || err.includes("PHONE_CODE_EXPIRED")) {
        return NextResponse.json({ error: "Неверный или просроченный код" }, { status: 400 });
      }
      throw e;
    }
  } catch (e: any) {
    console.error("signIn error", e);
    return NextResponse.json({ error: e?.errorMessage || e?.message || "SignIn failed" }, { status: 400 });
  }
}
