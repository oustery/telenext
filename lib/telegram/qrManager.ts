import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram";

// In-memory store for QR sessions
// For single-user mode, we keep only one active QR at a time
// In production for multi-user, use Redis

type QrSession = {
  id: string;
  client: TelegramClient;
  qrUrl: string | null;
  token: Buffer | null;
  expires: number | null;
  status: "waiting" | "scanned" | "success" | "error" | "needs2fa";
  error?: string;
  hint?: string;
  // для 2FA
  passwordResolver?: (pwd: string) => void;
  passwordRejecter?: (err: Error) => void;
};

const sessions = new Map<string, QrSession>();

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createQrSession(): QrSession {
  const id = genId();
  const client = new TelegramClient(new StringSession(""), Number(process.env.API_ID), Number(process.env.API_HASH), {
    connectionRetries: 5,
    useWSS: true,
  });
  const s: QrSession = {
    id,
    client,
    qrUrl: null,
    token: null,
    expires: null,
    status: "waiting",
  };
  sessions.set(id, s);
  return s;
}

export function getQrSession(id: string) {
  return sessions.get(id) || null;
}

export function deleteQrSession(id: string) {
  const s = sessions.get(id);
  if (s) {
    try { s.client.destroy(); } catch {}
    sessions.delete(id);
  }
}

// Запускает QR flow в фоне, обновляет сессию
export async function startQrLogin(session: QrSession) {
  const { client } = session;
  await client.connect();

  // GramJS helper — он сам делает ExportLoginToken loop каждые 30сек и ждет UpdateLoginToken
  // Мы оборачиваем в promise чтобы обновлять qrUrl
  const promise = (client as any).signInUserWithQrCode(
    { apiId: Number(process.env.API_ID), apiHash: process.env.API_HASH },
    {
      onError: async (err: Error) => {
        console.error("QR onError", err);
        session.status = "error";
        session.error = err.message;
        return true; // stop
      },
      qrCode: async ({ token, expires }: { token: Buffer; expires: number }) => {
        const url = `tg://login?token=${token.toString("base64url")}`;
        session.qrUrl = url;
        session.token = token;
        session.expires = expires;
        console.log("QR generated", url.slice(0, 60) + "...");
        // Ждем 30 сек, потом GramJS сам сгенерит новый токен и снова вызовет qrCode
        // Просто держим promise живым
        await new Promise((r) => setTimeout(r, 29000));
      },
      password: async (hint: string) => {
        console.log("QR needs 2FA, hint:", hint);
        session.status = "needs2fa";
        session.hint = hint;
        // Ждем пока фронтенд вызовет /api/auth/qr/2fa с паролем
        return await new Promise<string>((resolve, reject) => {
          session.passwordResolver = resolve;
          session.passwordRejecter = reject;
        });
      },
    }
  );

  try {
    const user = await promise;
    // Успех — сохраняем сессию
    session.status = "success";
    return user;
  } catch (e: any) {
    session.status = "error";
    session.error = e?.message || "QR failed";
    throw e;
  }
}

export function resolveQrPassword(sessionId: string, password: string) {
  const s = sessions.get(sessionId);
  if (!s || !s.passwordResolver) throw new Error("No pending 2FA");
  s.passwordResolver(password);
  s.status = "waiting";
}

export function rejectQrPassword(sessionId: string, err: string) {
  const s = sessions.get(sessionId);
  if (s?.passwordRejecter) s.passwordRejecter(new Error(err));
}
