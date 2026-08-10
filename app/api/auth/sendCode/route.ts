import { NextRequest, NextResponse } from "next/server";
import { getOrCreateTempClient, isFloodWaitError } from "@/lib/telegram/client";
import { Api } from "telegram/tl";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { validatePhone } from "@/lib/validate";

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    const err = validatePhone(phone);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    // Rate-limit: 3 запроса в минуту на IP
    const ip = getClientIp(req);
    const rl = rateLimit(`sendCode:${ip}`, 3, 60_000);
    if (!rl.ok) return NextResponse.json({ error: `Слишком часто. Подожди ${rl.retryAfter}с` }, { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });

    const cleanPhone = phone.trim();
    const client = await getOrCreateTempClient(cleanPhone);
    const result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: cleanPhone,
        apiId: Number(process.env.API_ID),
        apiHash: process.env.API_HASH!,
        settings: new Api.CodeSettings({}),
      })
    );

    const phoneCodeHash = (result as any).phoneCodeHash;
    return NextResponse.json({ phoneCodeHash, type: (result as any).type?.className });
  } catch (e: any) {
    console.error("sendCode error", e);
    const fw = isFloodWaitError(e);
    if (fw) return NextResponse.json({ error: `FloodWait: подожди ${fw}с` }, { status: 429, headers: { "Retry-After": String(fw) } });
    const msg = e?.errorMessage || e?.message || "Failed to send code";
    const status = msg.includes("PHONE_NUMBER_INVALID") ? 400 : msg.includes("API_ID") ? 500 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
