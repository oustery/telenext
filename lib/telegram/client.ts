import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { decrypt } from "@/lib/crypto";

// Для single-user храним всё в зашифрованной StringSession в БД.
// На Vercel каждая лямбда — отдельный процесс, поэтому Map живёт только внутри одного воркера.
// Делаем кэш в globalThis с TTL 90с — если один воркер обслужил два запроса подряд, переиспользуем соединение и экономим 2-3с на connect().

type Cached = { client: TelegramClient; lastUsed: number };

const globalKey = "__telenext_pool" as const;
const globalForPool = globalThis as unknown as { [globalKey]?: Map<string, Cached> };

function getPool(): Map<string, Cached> {
  if (!globalForPool[globalKey]) globalForPool[globalKey] = new Map();
  return globalForPool[globalKey]!;
}

// Периодически чистим старые соединения (раз в 60с)
if (typeof setInterval !== "undefined" && !(globalThis as any).__telenext_pool_cleaner) {
  (globalThis as any).__telenext_pool_cleaner = setInterval(() => {
    const pool = getPool();
    const now = Date.now();
    for (const [k, v] of pool.entries()) {
      if (now - v.lastUsed > 90_000) {
        try { v.client.destroy(); } catch {}
        pool.delete(k);
      }
    }
  }, 60_000).unref?.();
}

// Временные клиенты для логина (до сохранения сессии) — тоже в globalThis чтобы переживать hot-reload
const tempKey = "__telenext_temp" as const;
const globalForTemp = globalThis as unknown as { [tempKey]?: Map<string, TelegramClient> };
function getTempPool() {
  if (!globalForTemp[tempKey]) globalForTemp[tempKey] = new Map();
  return globalForTemp[tempKey]!;
}

export function getApiCredentials() {
  const apiId = Number(process.env.API_ID);
  const apiHash = process.env.API_HASH;
  if (!apiId || !apiHash) throw new Error("API_ID / API_HASH not set in .env");
  return { apiId, apiHash };
}

export async function getOrCreateTempClient(phone: string) {
  const pool = getTempPool();
  if (pool.has(phone)) {
    const c = pool.get(phone)!;
    if (c.connected) return c;
    try { await c.connect(); return c; } catch { pool.delete(phone); }
  }
  const { apiId, apiHash } = getApiCredentials();
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
    useWSS: true,
    floodSleepThreshold: 60,
  });
  await client.connect();
  pool.set(phone, client);
  return client;
}

export function getTempClient(phone: string) {
  return getTempPool().get(phone) || null;
}

export function deleteTempClient(phone: string) {
  const pool = getTempPool();
  const c = pool.get(phone);
  if (c) {
    try { c.destroy(); } catch {}
    pool.delete(phone);
  }
}

export async function getAuthedClient(userId: string, sessionEnc: string) {
  const pool = getPool();
  const cached = pool.get(userId);
  if (cached && cached.client.connected) {
    cached.lastUsed = Date.now();
    return cached.client;
  }
  // чистим мёртвый
  if (cached) {
    try { await cached.client.destroy(); } catch {}
    pool.delete(userId);
  }
  const { apiId, apiHash } = getApiCredentials();
  const sessionStr = decrypt(sessionEnc);
  const session = new StringSession(sessionStr);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: true,
    floodSleepThreshold: 60,
  });
  await client.connect();
  pool.set(userId, { client, lastUsed: Date.now() });
  return client;
}

export async function destroyClient(userId: string) {
  const pool = getPool();
  const c = pool.get(userId);
  if (c) {
    try { await c.client.destroy(); } catch {}
    pool.delete(userId);
  }
}

// Single-user helper — достаёт единственного юзера и возвращает клиента (переиспользует кэш)
export async function getSingleUserClient() {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return null;
  const client = await getAuthedClient(user.id, user.sessionEnc);
  return { user, client };
}

// Удобный wrapper для одноразовых операций с авто-коннектом и обработкой FloodWait
export function isFloodWaitError(e: any): number | null {
  const msg = e?.errorMessage || e?.message || String(e);
  const m = msg.match(/FLOOD_WAIT_(\d+)/i);
  if (m) return parseInt(m[1], 10);
  if (typeof e?.seconds === "number") return e.seconds;
  return null;
}
