import { NextRequest, NextResponse } from "next/server";
import { getQrSession, resolveQrPassword } from "@/lib/telegram/qrManager";

export async function POST(req: NextRequest) {
  try {
    const { sessionId, password } = await req.json();
    if (!sessionId || !password) return NextResponse.json({ error: "sessionId & password required" }, { status: 400 });
    const s = getQrSession(sessionId);
    if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (s.status !== "needs2fa") return NextResponse.json({ error: "Not waiting for 2FA" }, { status: 400 });

    resolveQrPassword(sessionId, password);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
