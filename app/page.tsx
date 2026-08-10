import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getSessionCookie, verifySessionToken } from "@/lib/auth";
import Messenger from "@/components/Messenger";

export default async function Home() {
  const token = await getSessionCookie();

  // Если куки нет — на логин
  if (!token) {
    redirect("/login");
  }

  // Проверяем JWT валидный
  try {
    const payload = await verifySessionToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) redirect("/login");
    // Можно опционально проверить что StringSession живая, но не блокируем рендер
  } catch {
    redirect("/login");
  }

  // Также если в БД вообще нет юзеров (первый запуск)
  const anyUser = await prisma.user.findFirst();
  if (!anyUser) redirect("/login");

  return <Messenger />;
}
