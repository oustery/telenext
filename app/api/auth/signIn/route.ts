import { NextRequest, NextResponse } from "next/server";
import { getTempClient, deleteTempClient, isFloodWaitError } from "@/lib/telegram/client";
import { Api } from "telegram/tl";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { validatePhone, validateCode } from "@/lib/validate";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const { phone, phoneCodeHash, code } = await req.json();
    const pErr = validatePhone(phone);
    if (pErr) return NextResponse.json({ error: pErr }, { status: 400 });
    const cErr = validateCode(code);
    if (cErr) return NextResponse.json({ error: cErr }, { status: 400 });
    if (!phoneCodeHash) return NextResponse.json({ error: "Сначала запроси код" }, { status: 400 });

    const ip = getClientIp(req);
    const rl = rateLimit(`signIn:${ip}`, 5, 60_000);
    if (!rl.ok) return NextResponse.json({ error: `Слишком много попыток. Подожди ${rl.retryAfter}с` }, { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });

    const client = getTempClient(phone);
    if (!client) return NextResponse.json({ error: "Сначала запроси код" }, { status: 400 });

    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone.trim(),
          phoneCodeHash,
          phoneCode: code.trim(),
        })
      );

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

      return NextResponse.json({ ok: true, user: { id: user.id, phone, username } });
    } catch (e: any) {
      const fw = isFloodWaitError(e);
      if (fw) return NextResponse.json({ error: `FloodWait: подожди ${fw}с` }, { status: 429, headers: { "Retry-After": String(fw) } });
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
    const fw = isFloodWaitError(e);
    if (fw) return NextResponse.json({ error: `FloodWait: подожди ${fw}с` }, { status: 429, headers: { "Retry-After": String(fw) } });
    return NextResponse.json({ error: e?.errorMessage || e?.message || "SignIn failed" }, { status: 400 });
  }
}
