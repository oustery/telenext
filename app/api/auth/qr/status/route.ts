import { NextRequest, NextResponse } from "next/server";
import { getQrSession } from "@/lib/telegram/qrManager";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { createSessionToken, setSessionCookie } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const s = getQrSession(sessionId);
  if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // Если QR обновился (GramJS генерит новый каждые ~30с) — отдаем новый
  if (s.status === "success") {
    try {
      const sessionStr = (s.client as any).session.save() as string;
      const sessionEnc = encrypt(sessionStr);
      const me = await s.client.getMe();
      const telegramId = me.id.toString();
      const username = (me as any).username || null;
      const firstName = (me as any).firstName || null;
      // phone для QR-логина неизвестен — генерим fake
      const phone = `qr:${telegramId}`;

      const user = await prisma.user.upsert({
        where: { phone },
        update: { sessionEnc, telegramId, username, firstName },
        create: { phone, sessionEnc, apiId: Number(process.env.API_ID), telegramId, username, firstName },
      });

      // fallback: также найди по telegramId
      const existing = await prisma.user.findFirst({ where: { telegramId } });
      // уже upserted

      const token = await createSessionToken({ userId: user.id, phone: user.phone });
      await setSessionCookie(token);

      return NextResponse.json({ status: "success", qrUrl: s.qrUrl, expires: s.expires });
    } catch (e: any) {
      console.error("qr status success handling", e);
      return NextResponse.json({ status: "error", error: e.message });
    }
  }

  return NextResponse.json({
    status: s.status,
    qrUrl: s.qrUrl,
    expires: s.expires,
    hint: s.hint,
    error: s.error,
  });
}
