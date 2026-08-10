import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Messenger from "@/components/Messenger";

export default async function Home() {
  const user = await prisma.user.findFirst();
  if (!user) {
    redirect("/login");
  }
  return <Messenger />;
}
