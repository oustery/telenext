import type { TelegramClient } from "telegram";

export async function resolveEntity(chatId: string, client: TelegramClient): Promise<any> {
  const id = chatId.trim();
  // username like @durov or durov
  if (!/^-?\d+$/.test(id)) {
    try {
      return await client.getEntity(id.replace(/^@/, ""));
    } catch {
      return id;
    }
  }
  // numeric id — пробуем найти среди диалогов (быстрее и надёжнее для -100...)
  try {
    const dialogs: any[] = await client.getDialogs({});
    const match = dialogs.find((d: any) => {
      const eid = d.entity?.id?.toString();
      const did = d.id?.toString();
      return did === id || eid === id.replace("-100", "") || `-100${eid}` === id;
    });
    if (match) return match.entity;
  } catch {}
  try {
    return await client.getEntity(id as any);
  } catch {
    return id;
  }
}
