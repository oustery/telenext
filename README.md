# TeleNext — Telegram клиент на Next.js + MTProto

Веб-клиент Telegram, который работает через **API_ID / API_HASH** (MTProto), а не Bot API. Позволяет залогиниться своим номером и общаться как в официальном клиенте: лички, группы, каналы.

> Одно-пользовательский режим (single-user) — идеально для личного клиента. Многопользовательский легко включить.

## Стек

- Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- GramJS (`telegram` npm) для MTProto
- Prisma + SQLite (для продакшна — Postgres)
- Socket.io (заготовка для реалтайма, сейчас polling 3с)
- AES-256-GCM шифрование сессии + httpOnly JWT cookie

## Быстрый старт

### 1. Получи API_ID / API_HASH

1. Зайди на https://my.telegram.org → API development tools
2. Создай приложение (любое название)
3. Скопируй `API_ID` и `API_HASH`

### 2. Установка

```bash
git clone ...
cd telenext
cp .env.example .env
# заполни API_ID, API_HASH, SESSION_SECRET, JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run dev
```

Открой http://localhost:3000 → введи номер → код из Telegram → (если включена 2FA — пароль) → готово.

### 3. Переменные окружения

```env
API_ID=123456
API_HASH=abc123...
SESSION_SECRET=сгенерируй openssl rand -hex 32
JWT_SECRET=любая_длинная_строка
DATABASE_URL="file:./dev.db"
PORT=3000
```

### 4. Деплой

**Не деплой на Vercel** — serverless убьёт долгоживущее MTProto соединение.

Рекомендуется:
- Fly.io: `fly launch && fly deploy`
- Railway / Render / Hetzner VPS + Docker

Используется кастомный сервер `server.ts` (Next + Socket.io на одном процессе). В Docker:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
EXPOSE 3000
CMD ["npm","start"]
```

## Структура

```
/app
  /login        # логин: phone -> code -> 2FA
  /api/auth     # sendCode, signIn, signIn2FA, logout
  /api/telegram # dialogs, messages, sendMessage
/components
  Messenger.tsx # 2-колоночный layout
  chat/ChatList.tsx, ChatView.tsx
/lib
  telegram/client.ts # пул клиентов GramJS
  crypto.ts          # encrypt/decrypt сессии
  auth.ts            # JWT cookie
/server.ts           # Next + Socket.io
/prisma/schema.prisma
```

## Как это работает

1. `POST /api/auth/sendCode` → `auth.SendCode` через GramJS, возвращает `phoneCodeHash`
2. `POST /api/auth/signIn` → `auth.SignIn` с кодом, сохраняет `StringSession` зашифрованной в БД, ставит JWT cookie
3. Дальше `getSingleUserClient()` достаёт сессию → `new TelegramClient(StringSession, apiId, apiHash)` → `client.getDialogs()` / `client.getMessages()` / `client.sendMessage()`

Если нужен QR-логин: `client.signInUserWithQrCode()` — можно добавить.

## API

- `GET /api/telegram/dialogs` → список чатов
- `GET /api/telegram/messages?chatId=-100123...&limit=50` → сообщения
- `POST /api/telegram/sendMessage` `{chatId, message}` → отправить

## Частые ошибки

- `PHONE_NUMBER_INVALID` — проверь формат +375...
- `API_ID_INVALID` — неверный API_ID/HASH
- `PHONE_CODE_INVALID` — неверный код
- `SESSION_PASSWORD_NEEDED` — нужна 2FA (перекинет на экран пароля)
- `FLOOD_WAIT_xx` — слишком часто, подожди xx секунд
- `AUTH_KEY_UNREGISTERED` — сессия слетела, войди заново

## Планы (v2)

- [ ] Socket.io реалтайм (newMessage, typing) вместо polling
- [ ] QR-логин
- [ ] Загрузка/просмотр медиа (фото, видео, файлы)
- [ ] Поиск по сообщениям, фильтры Все/Личные/Группы/Каналы
- [ ] Мультиаккаунт
- [ ] PWA + push

## Безопасность

- `StringSession` никогда не уходит на клиент, хранится AES-256-GCM в БД
- JWT в httpOnly cookie
- Не логируй сессии и коды
- Соблюдай лимиты Telegram (20 сообщ/сек), иначе FloodWait/бан
