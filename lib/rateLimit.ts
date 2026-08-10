// Simple in-memory rate limiter for serverless (per-instance).
// Для продакшна с множеством лямбд — заменить на Redis/Upstash.
// Но для single-user + Vercel — достаточно, т.к. защищаем от спама с одного IP.

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const e = store.get(key);
  if (!e || now > e.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (e.count < limit) {
    e.count++;
    return { ok: true };
  }
  return { ok: false, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
}

// чистим раз в 5 минут
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store.entries()) if (now > v.resetAt) store.delete(k);
  }, 5 * 60 * 1000).unref?.();
}

export function getClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr;
  return "unknown";
}

export function floodWaitToRetryAfter(message: string): number | null {
  const m = message.match(/FLOOD_WAIT_(\d+)/i);
  if (m) return parseInt(m[1], 10);
  // GramJS иногда бросает объект с seconds
  return null;
}
