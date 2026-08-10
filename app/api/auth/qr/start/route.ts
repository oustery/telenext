import { NextResponse } from "next/server";
import { createQrSession, startQrLogin } from "@/lib/telegram/qrManager";

export async function POST() {
  try {
    if (!process.env.API_ID || !process.env.API_HASH) {
      return NextResponse.json({ error: "API_ID / API_HASH не настроены в .env" }, { status: 500 });
    }
    const session = createQrSession();
    // Запускаем в фоне, не ждем
    startQrLogin(session).catch((e) => console.error("QR login failed", e));

    // Ждем пока сгенерится первый QR (до 2 сек)
    for (let i = 0; i < 20; i++) {
      if (session.qrUrl) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!session.qrUrl) {
      return NextResponse.json({ error: "Не удалось сгенерировать QR" }, { status: 500 });
    }

    return NextResponse.json({
      sessionId: session.id,
      qrUrl: session.qrUrl,
      expires: session.expires,
    });
  } catch (e: any) {
    console.error("qr/start error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
