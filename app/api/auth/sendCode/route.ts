import { NextRequest, NextResponse } from "next/server";
import { getOrCreateTempClient } from "@/lib/telegram/client";
import { Api } from "telegram/tl";

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

    const client = await getOrCreateTempClient(phone);
    // GramJS сам вызовет auth.sendCode
    const result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: Number(process.env.API_ID),
        apiHash: process.env.API_HASH!,
        settings: new Api.CodeSettings({}),
      })
    );

    // result.phoneCodeHash нужен для signIn
    const phoneCodeHash = (result as any).phoneCodeHash;
    return NextResponse.json({ phoneCodeHash, type: (result as any).type?.className });
  } catch (e: any) {
    console.error("sendCode error", e);
    const msg = e?.errorMessage || e?.message || "Failed to send code";
    // Частые ошибки: PHONE_NUMBER_INVALID, API_ID_INVALID, FloodWait
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
