import { NextResponse } from "next/server";
import { getSessionCookie, verifySessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const token = await getSessionCookie();
    if (!token) return NextResponse.json({ authenticated: false }, { status: 401 });

    let payload: any;
    try {
      payload = await verifySessionToken(token);
    } catch {
      return NextResponse.json({ authenticated: false, error: "Invalid token" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return NextResponse.json({ authenticated: false, error: "User not found" }, { status: 401 });

    // Проверяем что сессия реально живая — пробуем подключиться (лёгкий check)
    // Не делаем полный connect чтобы не тормозить, просто возвращаем инфо
    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        phone: user.phone,
        username: user.username,
        firstName: user.firstName,
        telegramId: user.telegramId,
      },
    });
  } catch (e: any) {
    console.error("me error", e);
    return NextResponse.json({ authenticated: false, error: e.message }, { status: 500 });
  }
}
