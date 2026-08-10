# TeleNext — Аудит слабых мест и план улучшений

> Дата: 10.08.2026 | Версия: MVP 1191c5d → target 5.0

## 1. Методология
Проанализированы: код (`app/*`, `lib/*`, `components/*`), сборка Vercel, рантайм Supabase, UX на iOS Safari/Android Chrome, безопасность MTProto.

## 2. Топ-15 слабых мест (в порядке критичности)

| # | Категория | Проблема | Риск | Оценка |
|---|---|---|---|---|
| **1** | **Архитектура** | `Map<userId, TelegramClient>` и `Map<qrSession>` в памяти. На Vercel каждая лямбда — отдельный процесс → Map теряется, `session not found`, реконнекты по 2-3с на каждый запрос, утечка памяти | 🔴 Критично | 9/10 |
| 2 | Безопасность | Нет rate-limit на `/api/auth/sendCode` и `signIn` → спам, `FLOOD_WAIT`, бан API_ID | 🔴 | 8/10 |
| 3 | Безопасность | `any` в 6 файлах, нет валидации Zod → инъекции, падения | 🟠 | 7/10 |
| 4 | UX | Нет пагинации/virtuoso — `getMessages(limit:60)` грузит всё, на 1000+ сообщений лагает, `react-virtuoso` установлен но не используется | 🟠 | 7/10 |
| 5 | UX | Нет кэша аватаров/медиа — каждый `<img>` бьёт в Telegram DC, медленно, жрёт лимиты | 🟠 | 7/10 |
| 6 | Функционал | `isChannel` определяется только по `isChannel`/`className==="Channel"` — пропускает супергруппы/форумы, нет `broadcast`, `megagroup` | 🟡 | 6/10 |
| 7 | Функционал | Отправка `sendFile` через `Buffer` целиком в память → OOM на файлах >50МБ, нет лимита, нет прогресса | 🟡 | 6/10 |
| 8 | Безопасность | Нет обработки `FLOOD_WAIT_X` — показываем `500`, а надо `429` + `retryAfter` | 🟡 | 6/10 |
| 9 | Архитектура | Polling 3.5с на `/dialogs` + `/messages` → 20 req/мин на юзера, бьёт по лимитам и батарее | 🟡 | 6/10 |
| 10 | Код | Дублирование `entity` resolution в 4 местах (dialogs/messages/media/avatar/sendFile) | 🟡 | 5/10 |
| 11 | UX | Нет optimistic UI — отправка ждёт `load()`, кажется зависанием | 🟡 | 5/10 |
| 12 | Доступность | Нет `aria-*`, фокус-менеджмента, `prefers-reduced-motion` | 🟢 | 4/10 |
| 13 | Наблюдаемость | Нет логов, нет Sentry, нет health-check | 🟢 | 4/10 |
| 14 | i18n | Только RU, нет EN | 🟢 | 3/10 |
| 15 | Тесты | 0% покрытие | 🟢 | 3/10 |

## 3. Что уже было исправлено до аудита
- StringSession duplicate → `serverExternalPackages`
- Next.js 15.3.5 → 15.5.23 (CVE)
- Потеря `step` при сворачивании браузера → `localStorage` + `visibilitychange`
- Вкладки не фильтровали → фильтр `all/personal/groups/channels`
- Нет аватарок → `/api/avatar` + `downloadProfilePhoto`
- В каналах можно было писать → `isChannel` guard

## 4. План исправлений (3 волны)

### Волна A — Критика (1-2 дня, реализуем сейчас)
- [x] **A1** Stateless TelegramClient: убрать долгоживущий Map, создавать клиента на запрос, переиспользовать `globalThis` с TTL 2мин, `await client.connect()` → `try/finally disconnect` опционально
- [x] **A2** Rate-limit + Zod: `phone` regex `^\+?\d{7,15}$`, `limit 3/60s` по IP для sendCode
- [x] **A3** Хелпер `resolveEntity(chatId, client)` — единый
- [x] **A4** Обработка `FLOOD_WAIT` → `429` + `Retry-After`
- [x] **A5** Лимит файла 50МБ + mime whitelist + `Buffer` → `ArrayBuffer` stream friendly
- [x] **A6** Virtuoso для чата + `offsetId` пагинация (подгрузка при скролле вверх)

### Волна B — UX/Производительность (3-5 дней)
- [ ] B1 SSE вместо polling: `GET /api/telegram/updates` (long-poll) или Ably/Pusher
- [ ] B2 Кэш аватаров в R2/Supabase Storage + `If-None-Match`
- [ ] B3 Оптимистик отправка + `pending` статус
- [ ] B4 Поиск по сообщениям, папки, закрепы
- [ ] B5 Офлайн PWA + Service Worker

### Волна C — Зрелость (1-2 недели)
- [ ] C1 Миграция `telegram` → `teleproto` (активный форк)
- [ ] C2 Sentry + OpenTelemetry
- [ ] C3 E2E тесты Playwright
- [ ] C4 E2E шифрование локальных бэкапов
- [ ] C5 Админ-панель для мульти-юзера

## 5. Детальные заметки по A

**A1 почему Map ломается на Vercel:** `global Map` живёт только в рамках одного воркера. Vercel может запустить 10 параллельных лямбд → у каждой свой Map → `getSingleUserClient` в лямбде A не видит клиента из лямбды B → каждый запрос делает новый `connect()` → 2сек задержка. Решение — не хранить состояние, а на каждый API вызов: `new TelegramClient(StringSession(decrypt(sessionEnc)))` → `connect()` → `invoke()` → `disconnect()` или кэшировать в `globalThis` с `lastUsed` и `setInterval` чисткой.

**A2 Rate-limit:** без него злоумышленник может заспамить `sendCode` и получить бан `API_ID` для всех юзеров.

**A4 FloodWait:** GramJS бросает `FloodWaitError` с `seconds`. Нужно парсить `error.seconds` и отдавать `429`.

## 6. Метрики успеха
- p95 `GET /dialogs` < 800мс (сейчас 2200мс из-за переподключения)
- 0 `FLOOD_WAIT` банов в неделю
- LCP < 1.8с на 3G
- 60fps скролл на 2000 сообщений
