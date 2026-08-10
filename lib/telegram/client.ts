import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { decrypt } from "@/lib/crypto";

// Singleton pool Map<userId, TelegramClient>
const pool = new Map<string, TelegramClient>();
// Временные клиенты для логина (до сохранения сессии)
const tempClients = new Map<string, TelegramClient>(); // key = phone

export function getApiCredentials() {
  const apiId = Number(process.env.API_ID);
  const apiHash = process.env.API_HASH;
  if (!apiId || !apiHash) throw new Error("API_ID / API_HASH not set in .env");
  return { apiId, apiHash };
}

export async function getOrCreateTempClient(phone: string) {
  if (tempClients.has(phone)) return tempClients.get(phone)!;
  const { apiId, apiHash } = getApiCredentials();
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
    useWSS: true,
  });
  await client.connect();
  tempClients.set(phone, client);
  return client;
}

export function getTempClient(phone: string) {
  return tempClients.get(phone) || null;
}

export function deleteTempClient(phone: string) {
  const c = tempClients.get(phone);
  if (c) {
    try { c.destroy(); } catch {}
    tempClients.delete(phone);
  }
}

export async function getAuthedClient(userId: string, sessionEnc: string) {
  if (pool.has(userId)) {
    const cached = pool.get(userId)!;
    if (cached.connected) return cached;
  }
  const { apiId, apiHash } = getApiCredentials();
  const sessionStr = decrypt(sessionEnc);
  const session = new StringSession(sessionStr);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: true,
  });
  await client.connect();
  pool.set(userId, client);
  return client;
}

export async function destroyClient(userId: string) {
  const c = pool.get(userId);
  if (c) {
    try { await c.destroy(); } catch {}
    pool.delete(userId);
  }
}

// Для single-user режима — достать единственного юзера из БД
export async function getSingleUserClient() {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return null;
  const client = await getAuthedClient(user.id, user.sessionEnc);
  return { user, client };
}
