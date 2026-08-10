import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { decrypt } from "@/lib/crypto";

type Cached = { client: TelegramClient; lastUsed: number };

const globalKey = "__telenext_pool" as const;
const globalForPool = globalThis as unknown as { [globalKey]?: Map<string, Cached> };
const pendingKey = "__telenext_pending" as const;
const globalForPending = globalThis as unknown as { [pendingKey]?: Map<string, Promise<TelegramClient>> };

function getPool(): Map<string, Cached> {
  if (!globalForPool[globalKey]) globalForPool[globalKey] = new Map();
  return globalForPool[globalKey]!;
}
function getPending(): Map<string, Promise<TelegramClient>> {
  if (!globalForPending[pendingKey]) globalForPending[pendingKey] = new Map();
  return globalForPending[pendingKey]!;
}

// Чистим старые соединения раз в 60с
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
  if (c) { try { c.destroy(); } catch {} pool.delete(phone); }
}

function isAuthKeyDuplicated(e: any): boolean {
  const msg = e?.errorMessage || e?.message || String(e);
  return msg.includes("AUTH_KEY_DUPLICATED") || msg.includes("AuthKeyDuplicated");
}

export function isFloodWaitError(e: any): number | null {
  const msg = e?.errorMessage || e?.message || String(e);
  const m = msg.match(/FLOOD_WAIT_(\d+)/i);
  if (m) return parseInt(m[1], 10);
  if (typeof e?.seconds === "number") return e.seconds;
  return null;
}

export function isAuthKeyError(e: any): boolean {
  return isAuthKeyDuplicated(e) || (e?.errorMessage || "").includes("AUTH_KEY");
}

async function createAuthedClient(userId: string, sessionEnc: string): Promise<TelegramClient> {
  const { apiId, apiHash } = getApiCredentials();
  const sessionStr = decrypt(sessionEnc);
  const session = new StringSession(sessionStr);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
    useWSS: true,
    floodSleepThreshold: 60,
    // важно: не даём TelegramClient самому ретраить AUTH_KEY_DUPLICATED бесконечно
  });
  // Пробуем connect с ретраем при AUTH_KEY_DUPLICATED
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await client.connect();
      return client;
    } catch (e: any) {
      if (isAuthKeyDuplicated(e) && attempt === 0) {
        console.warn(`AUTH_KEY_DUPLICATED for ${userId}, retrying after 1.5s...`, e?.message);
        try { await client.destroy(); } catch {}
        // ждём чтобы старый коннект на другом лямбда-воркере освободился
        await new Promise(r => setTimeout(r, 1500));
        // пробуем ещё раз с новой сессией (той же, но новый объект)
        const session2 = new StringSession(sessionStr);
        const client2 = new TelegramClient(session2, apiId, apiHash, {
          connectionRetries: 3,
          useWSS: true,
          floodSleepThreshold: 60,
        });
        try {
          await client2.connect();
          return client2;
        } catch (e2: any) {
          if (isAuthKeyDuplicated(e2)) {
            // если снова дубликат — отдаём ошибку чтобы фронт показал ретрай
            throw e2;
          }
          throw e2;
        }
      }
      throw e;
    }
  }
  throw new Error("Failed to connect");
}

export async function getAuthedClient(userId: string, sessionEnc: string): Promise<TelegramClient> {
  const pool = getPool();
  const pending = getPending();

  // Если уже есть коннект — переиспользуем
  const cached = pool.get(userId);
  if (cached && cached.client.connected) {
    cached.lastUsed = Date.now();
    return cached.client;
  }
  if (cached) {
    try { await cached.client.destroy(); } catch {}
    pool.delete(userId);
  }

  // Если уже идёт создание клиента для этого userId — ждём тот же промис (дедупликация коннектов)
  if (pending.has(userId)) {
    return pending.get(userId)!;
  }

  const promise = (async () => {
    try {
      const client = await createAuthedClient(userId, sessionEnc);
      pool.set(userId, { client, lastUsed: Date.now() });
      return client;
    } finally {
      pending.delete(userId);
    }
  })();

  pending.set(userId, promise);
  return promise;
}

export async function destroyClient(userId: string) {
  const pool = getPool();
  const pending = getPending();
  pending.delete(userId);
  const c = pool.get(userId);
  if (c) {
    try { await c.client.destroy(); } catch {}
    pool.delete(userId);
  }
}

export async function getSingleUserClient() {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return null;
  const client = await getAuthedClient(user.id, user.sessionEnc);
  return { user, client };
}
