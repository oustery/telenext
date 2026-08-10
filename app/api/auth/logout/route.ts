import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionCookie, verifySessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { destroyClient } from "@/lib/telegram/client";

export async function POST() {
  try {
    const token = await getSessionCookie();
    if (token) {
      try {
        const payload = await verifySessionToken(token);
        await destroyClient(payload.userId);
      } catch {}
    }
    // single-user: просто удаляем всех
    // await prisma.user.deleteMany();
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
