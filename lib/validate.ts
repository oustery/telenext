export function validatePhone(phone: string): string | null {
  if (!phone) return "Номер обязателен";
  const p = phone.trim();
  if (!/^\+?\d{7,15}$/.test(p.replace(/[\s\-()]/g, ""))) return "Неверный формат. Пример: +375291234567";
  return null;
}

export function validateCode(code: string): string | null {
  if (!code) return "Код обязателен";
  if (!/^\d{4,6}$/.test(code.trim())) return "Код — 4-6 цифр";
  return null;
}

export function sanitizeChatId(id: string): string {
  return id.trim().slice(0, 64);
}

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — лимит Telegram для ботов/клиентов (до 2GB для премиум, но режем)
export const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/", "application/"];

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return `Файл слишком большой (макс ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
  if (file.size === 0) return "Пустой файл";
  return null;
}
