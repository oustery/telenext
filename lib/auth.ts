import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "telenext_session";
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev_jwt_secret_change_me");

export async function createSessionToken(payload: { userId: string; phone: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(secret);
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload as { userId: string; phone: string };
}

export async function setSessionCookie(token: string) {
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 год
    // для iOS Safari: также ставим expires
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });
}

export async function getSessionCookie() {
  const c = await cookies();
  return c.get(COOKIE)?.value || null;
}

export async function clearSessionCookie() {
  const c = await cookies();
  c.delete(COOKIE);
}

export const COOKIE_NAME = COOKIE;
