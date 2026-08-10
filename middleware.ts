import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Простая проверка наличия сессии. Полная проверка JWT — в API, тут достаточно факта наличия куки
// чтобы мгновенно редиректить без мелькания /login
export function middleware(req: NextRequest) {
  const session = req.cookies.get("telenext_session")?.value;
  const isLogin = req.nextUrl.pathname.startsWith("/login");
  const isRoot = req.nextUrl.pathname === "/";

  // Если уже залогинен и идёт на /login — сразу на /
  if (isLogin && session) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Если не залогинен и идёт на / — на /login
  // (проверяем только наличие куки, детали проверит server component)
  if (isRoot && !session) {
    // не делаем жёсткий редирект здесь чтобы не мешать guest preview,
    // но если хочешь — раскомментируй:
    // const url = req.nextUrl.clone();
    // url.pathname = "/login";
    // return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login"],
};
