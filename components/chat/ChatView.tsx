"use client";
import { useEffect, useState, useRef, useCallback, memo } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import type { Dialog } from "../Messenger";
import { putMessages, getMessagesCache } from "@/lib/db";
import { putMessages, getMessagesCache } from "@/lib/db";

type Msg = {
  id: number;
  text: string;
  date: string;
  timestamp: number;
  out: boolean;
  from?: string;
  fromId?: string | null;
  media?: boolean;
  mediaType?: string | null;
  mime?: string | null;
  fileName?: string | null;
  isService?: boolean;
  forwardedFrom?: string | null;
  replyTo?: number | null;
  stickerEmoji?: string;
  duration?: number;
  webpage?: { url?: string; title?: string; description?: string; siteName?: string } | null;
  geo?: any;
  venueTitle?: string;
  venueAddress?: string;
  contact?: { name?: string; phone?: string } | null;
  poll?: { question?: string; answers?: string[]; totalVoters?: number } | null;
};

const MessageBubble = memo(function MessageBubble({
  m,
  dialogId,
  isGroup,
  onImageClick,
}: {
  m: Msg;
  dialogId: string;
  isGroup: boolean;
  onImageClick: (src: string) => void;
}) {
  // Сервисное сообщение — по центру
  if (m.isService) {
    return (
      <div className="flex justify-center px-3 py-1">
        <span className="bg-white/90 border border-[#e6e8eb] text-[#5b6b7a] text-xs px-3 py-1 rounded-full">{m.text}</span>
      </div>
    );
  }

  const showName = isGroup && !m.out && !!m.from;

  return (
    <div className={`flex px-3 py-1 ${m.out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] md:max-w-[68%] rounded-2xl px-3.5 py-2 text-[14px] leading-[19px] ${m.out ? "bg-[#2481cc] text-white rounded-br-md" : "bg-white border border-[#e6e8eb] rounded-bl-md text-[#0f1419]"}`}
        style={{ contain: "content" }}
      >
        {m.forwardedFrom && <div className={`text-xs mb-1 border-l-2 pl-2 ${m.out ? "border-white/50 text-white/80" : "border-[#2481cc] text-[#2481cc]"}`}>↪ Переслано от {m.forwardedFrom}</div>}
        {m.replyTo && <div className={`text-xs mb-1 rounded-lg px-2 py-1 ${m.out ? "bg-white/15" : "bg-[#f0f2f5] text-[#5b6b7a]"}`}>↩ В ответ на #{m.replyTo}</div>}
        {showName && <div className="text-xs font-semibold text-[#2481cc] mb-0.5 truncate">{m.from}</div>}

        {/* Фото */}
        {m.media && m.mediaType === "photo" && (
          <img
            src={`/api/telegram/media?chatId=${encodeURIComponent(dialogId)}&messageId=${m.id}`}
            alt=""
            width={360}
            height={240}
            loading="lazy"
            decoding="async"
            className="rounded-xl max-h-[320px] w-auto mb-1.5 cursor-zoom-in block hover:opacity-95 transition"
            onClick={() => onImageClick(`/api/telegram/media?chatId=${encodeURIComponent(dialogId)}&messageId=${m.id}`)}
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        )}

        {/* Видео */}
        {m.media && m.mediaType === "video" && (
          <video src={`/api/telegram/media?chatId=${encodeURIComponent(dialogId)}&messageId=${m.id}`} controls preload="metadata" className="rounded-xl max-h-[320px] mb-1.5 w-full block" />
        )}

        {/* Войс */}
        {m.media && m.mediaType === "voice" && (
          <div className="mb-1.5">
            <audio src={`/api/telegram/media?chatId=${encodeURIComponent(dialogId)}&messageId=${m.id}`} controls preload="none" className="w-full h-8 block" />
            {m.duration ? <div className={`text-[11px] mt-1 ${m.out ? "text-white/70" : "text-[#8e8e93]"}`}>{Math.floor(m.duration / 60)}:{String(m.duration % 60).padStart(2, "0")}</div> : null}
          </div>
        )}

        {/* Аудио */}
        {m.media && m.mediaType === "audio" && (
          <div className="mb-1.5">
            <audio src={`/api/telegram/media?chatId=${encodeURIComponent(dialogId)}&messageId=${m.id}`} controls preload="none" className="w-full h-8 block" />
            {m.fileName && <div className={`text-xs truncate mt-1 ${m.out ? "text-white/80" : "text-[#5b6b7a]"}`}>{m.fileName}</div>}
          </div>
        )}

        {/* Стикер */}
        {m.media && m.mediaType === "sticker" && (
          <div className="mb-1.5 flex items-center gap-2">
            <img
              src={`/api/telegram/media?chatId=${encodeURIComponent(dialogId)}&messageId=${m.id}`}
              alt={m.stickerEmoji || "sticker"}
              loading="lazy"
              className="w-32 h-32 object-contain cursor-pointer"
              onClick={() => onImageClick(`/api/telegram/media?chatId=${encodeURIComponent(dialogId)}&messageId=${m.id}`)}
            />
            <span className={`text-lg ${m.out ? "text-white" : "text-[#5b6b7a]"}`}>{m.stickerEmoji}</span>
          </div>
        )}

        {/* Документ */}
        {m.media && m.mediaType === "document" && (
          <a href={`/api/telegram/media?chatId=${encodeURIComponent(dialogId)}&messageId=${m.id}`} target="_blank" rel="noopener" className={`flex items-center gap-2 rounded-lg px-3 py-2 mb-1 ${m.out ? "bg-white/20" : "bg-[#f0f2f5]"}`}>
            <span className="shrink-0 w-8 h-8 rounded-full bg-[#2481cc] text-white flex items-center justify-center text-sm">📎</span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-xs font-medium truncate">{m.fileName || "файл"}</span>
              <span className={`block text-[11px] truncate ${m.out ? "text-white/70" : "text-[#8e8e93]"}`}>{m.mime || "документ"}</span>
            </span>
            <span className={`text-xs ${m.out ? "text-white" : "text-[#2481cc]"}`}>Скачать</span>
          </a>
        )}

        {/* Полл */}
        {m.media && m.mediaType === "poll" && m.poll && (
          <div className={`rounded-xl border p-3 mb-1.5 ${m.out ? "bg-white/15 border-white/20" : "bg-[#f9f9fb] border-[#e6e8eb]"}`}>
            <div className="font-semibold text-sm mb-2">📊 {m.poll.question}</div>
            <div className="space-y-1.5">
              {m.poll.answers?.map((a, i) => (
                <div key={i} className={`text-xs px-3 py-2 rounded-full border ${m.out ? "border-white/30 text-white" : "bg-white border-[#e6e8eb] text-[#0f1419]"}`}>{a}</div>
              ))}
            </div>
            {typeof m.poll.totalVoters === "number" && <div className={`text-[11px] mt-2 ${m.out ? "text-white/70" : "text-[#8e8e93]"}`}>{m.poll.totalVoters} голосов</div>}
          </div>
        )}

        {/* Локация */}
        {m.media && m.mediaType === "location" && (
          <div className={`rounded-xl overflow-hidden border mb-1.5 ${m.out ? "bg-white/15 border-white/20" : "bg-[#f0f2f5] border-[#e6e8eb]"}`}>
            <div className="h-28 bg-[#dbeafe] flex items-center justify-center text-[#2481cc] text-sm">📍 Карта</div>
            <div className="p-2">
              {m.venueTitle && <div className="text-sm font-medium">{m.venueTitle}</div>}
              {m.venueAddress && <div className="text-xs text-[#5b6b7a]">{m.venueAddress}</div>}
              {m.geo && <a href={`https://www.openstreetmap.org/?mlat=${m.geo.lat}&mlon=${m.geo.long}#map=16/${m.geo.lat}/${m.geo.long}`} target="_blank" rel="noopener" className="text-xs text-[#2481cc]">Открыть на карте</a>}
            </div>
          </div>
        )}

        {/* Контакт */}
        {m.media && m.mediaType === "contact" && m.contact && (
          <div className={`flex items-center gap-3 rounded-xl border p-3 mb-1.5 ${m.out ? "bg-white/15 border-white/20" : "bg-white border-[#e6e8eb]"}`}>
            <div className="w-10 h-10 rounded-full bg-[#2481cc] text-white flex items-center justify-center">👤</div>
            <div className="min-w-0"><div className="text-sm font-medium truncate">{m.contact.name}</div><div className="text-xs text-[#5b6b7a]">{m.contact.phone}</div></div>
            <a href={`tel:${m.contact.phone}`} className="ml-auto text-xs text-[#2481cc]">Позвонить</a>
          </div>
        )}

        {/* Веб-превью */}
        {m.media && m.mediaType === "webpage" && m.webpage && (
          <a href={m.webpage.url} target="_blank" rel="noopener" className={`block rounded-xl border overflow-hidden mb-1.5 ${m.out ? "bg-white/15 border-white/20" : "bg-white border-[#e6e8eb]"}`}>
            <div className="p-3">
              <div className="text-xs text-[#2481cc] truncate">{m.webpage.siteName || m.webpage.url}</div>
              {m.webpage.title && <div className="text-sm font-medium line-clamp-2 mt-0.5">{m.webpage.title}</div>}
              {m.webpage.description && <div className="text-xs text-[#5b6b7a] line-clamp-2 mt-1">{m.webpage.description}</div>}
            </div>
          </a>
        )}

        {m.media && m.mediaType === "unsupported" && <div className={`text-xs mb-1 ${m.out ? "text-white/70" : "text-[#8e8e93]"}`}>Неподдерживаемый тип медиа</div>}

        {m.text ? <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.text}</div> : null}
        <div className={`text-[11px] mt-1 text-right tabular-nums ${m.out ? "text-white/70" : "text-[#8e8e93]"}`}>
          {m.date} {m.out ? "✓✓" : ""}
        </div>
      </div>
    </div>
  );
});

export default function ChatView({ dialog, onBack }: { dialog: Dialog; onBack?: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [modalSrc, setModalSrc] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<any>(null);
  const firstIdx = useRef(10000);
  const scrollTimeout = useRef<number | null>(null);

  const isChannel = dialog.isChannel;
  const isGroup = dialog.isGroup;

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    // Мгновенный показ кэша для оффлайна и скорости
    const cached = await getMessagesCache(dialog.id);
    if (cached && cached.length) {
      setMessages(cached as any);
      setHasMore(false);
      firstIdx.current = 10000 - cached.length;
      setLoading(false);
      if (!navigator.onLine) return;
    }
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 10000);
      const r = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=30`, { signal: c.signal, cache: "no-store" });
      clearTimeout(t);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Ошибка ${r.status}`);
      const list = d.messages || [];
      setMessages(list);
      setHasMore(!!d.hasMore);
      firstIdx.current = 10000 - list.length;
      if (list.length) putMessages(dialog.id, list);
    } catch (e: any) {
      if (cached && cached.length) {
        setLoadError(null);
        setLoading(false);
        return;
      }
      setLoadError(e?.name === "AbortError" ? "Превышено время ожидания" : e?.message || "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, [dialog.id]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !messages.length || isScrolling) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=30&offsetId=${messages[0].id}`, { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.messages?.length) {
        setMessages((prev) => { const merged=[...d.messages, ...prev]; putMessages(dialog.id, merged.slice(-300)); return merged; });
        setHasMore(!!d.hasMore);
        firstIdx.current -= d.messages.length;
      } else setHasMore(false);
    } catch {} finally { setLoadingMore(false); }
  }, [dialog.id, messages, hasMore, loadingMore, isScrolling]);

  const pollNew = useCallback(async () => {
    if (loading || loadingMore || isScrolling || document.hidden) return;
    try {
      const r = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=15`, { cache: "no-store" });
      if (r.status === 429) return;
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.messages?.length) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const max = prev.length ? Math.max(...prev.map((m) => m.id)) : 0;
          const add = (d.messages as Msg[]).filter((m) => !ids.has(m.id) && m.id > max);
          return add.length ? [...prev, ...add] : prev;
        });
      }
    } catch {}
  }, [dialog.id, loading, loadingMore, isScrolling]);

  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    firstIdx.current = 10000;
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const id = setInterval(pollNew, 8000);
    return () => clearInterval(id);
  }, [pollNew]);

  // ESC для модалки
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setModalSrc(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const handleIsScrolling = useCallback((scrolling: boolean) => {
    setIsScrolling(scrolling);
    if (scrollTimeout.current) window.clearTimeout(scrollTimeout.current);
    if (scrolling) scrollTimeout.current = window.setTimeout(() => setIsScrolling(false), 800);
  }, []);

  const itemContent = useCallback((index: number, m: Msg) => <MessageBubble m={m} dialogId={dialog.id} isGroup={isGroup} onImageClick={setModalSrc} />, [dialog.id, isGroup]);

  async function send(retry = false) {
    if (!text.trim() || isChannel) return;
    const toSend = text.trim();
    const optimistic: Msg = { id: Date.now(), text: toSend, date: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), timestamp: Date.now() / 1000, out: true };
    setText("");
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 20000);
      const r = await fetch("/api/telegram/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: dialog.id, message: toSend }), signal: c.signal });
      clearTimeout(t);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 429 && (d.error || "").includes("AUTH_KEY_DUPLICATED") && !retry) {
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
          await new Promise((r) => setTimeout(r, 1800));
          setText(toSend);
          setTimeout(() => send(true), 0);
          return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setText(toSend);
        if (r.status !== 429) alert(d.error || "Ошибка отправки");
      } else setTimeout(pollNew, 700);
    } catch (e: any) {
      if (e?.name === "AbortError") setTimeout(pollNew, 1200);
      else {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setText(toSend);
        alert(e?.message || "Ошибка сети");
      }
    } finally { setSending(false); }
  }

  async function sendFiles(files: FileList | File[]) {
    if (!files.length || isChannel) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      if (f.size > 50 * 1024 * 1024) { alert(`${f.name}: макс 50MB`); continue; }
      const fd = new FormData(); fd.append("chatId", dialog.id); fd.append("file", f);
      try { const r = await fetch("/api/telegram/sendFile", { method: "POST", body: fd }); if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || "Ошибка"); } } catch (e: any) { alert(e.message); }
    }
    setUploading(false); pollNew();
  }

  return (
    <div className="flex flex-col h-full bg-[#f5f7fb] min-h-0 relative">
      {/* Header */}
      <div className="h-14 px-3 flex items-center gap-3 bg-white border-b border-[#e6e8eb] shrink-0">
        {onBack && <button onClick={onBack} className="md:hidden w-8 h-8 -ml-1 flex items-center justify-center text-[#2481cc]"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg></button>}
        <div className="w-8 h-8 rounded-full bg-[#2481cc] text-white flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
          {dialog.avatar ? <img src={dialog.avatar} alt="" className="w-full h-full object-cover" /> : dialog.title.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] leading-none truncate">{dialog.title}</div>
          <div className="text-xs text-[#8e8e93] truncate leading-none mt-1">{isChannel ? "канал" : isGroup ? "группа" : "в сети"}{dialog.username ? ` • @${dialog.username}` : ""}</div>
        </div>
      </div>

      {isChannel && <div className="bg-[#fff4e5] text-[#8a6d00] text-xs text-center py-1.5 border-b border-[#ffe9b3] shrink-0">В каналах можно только читать</div>}

      <div className="flex-1 min-h-0 relative overflow-hidden bg-[#f5f7fb]">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[#8e8e93]">Загрузка...</div>
        ) : loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-sm font-medium">Не удалось загрузить</div>
            <div className="text-xs text-[#8e8e93] mt-1 max-w-[300px] break-words">{loadError}</div>
            <button onClick={loadInitial} className="mt-3 px-4 py-2 bg-[#2481cc] text-white rounded-full text-sm">Попробовать снова</button>
          </div>
        ) : messages.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
            <div className="w-14 h-14 rounded-full bg-white border border-[#e6e8eb] flex items-center justify-center text-xl mb-3">💬</div>
            <div className="font-medium">Нет сообщений</div>
            <div className="text-sm text-[#8e8e93] mt-1">{isChannel ? "Постов пока нет" : "Напишите первым"}</div>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            style={{ height: "100%" }}
            data={messages}
            firstItemIndex={firstIdx.current}
            initialTopMostItemIndex={Math.max(0, messages.length - 1)}
            alignToBottom
            followOutput
            increaseViewportBy={{ top: 400, bottom: 200 }}
            overscan={300}
            isScrolling={handleIsScrolling}
            startReached={() => { if (hasMore && !loadingMore && !isScrolling) loadMore(); }}
            computeItemKey={(idx, m) => m.id}
            itemContent={itemContent}
            components={{
              Header: () => (
                <div className="flex justify-center py-2">
                  {loadingMore ? <span className="text-xs bg-white border border-[#e6e8eb] px-3 py-1 rounded-full">Загрузка...</span> : hasMore ? <span className="text-xs text-[#8e8e93]">Потяните чтобы загрузить ещё</span> : <span className="text-xs text-[#8e8e93]">Начало истории</span>}
                </div>
              ),
            }}
          />
        )}
      </div>

      {/* Modal для изображений */}
      {modalSrc && (
        <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setModalSrc(null)}>
          <button onClick={() => setModalSrc(null)} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center backdrop-blur">✕</button>
          <img src={modalSrc} alt="" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {isChannel ? (
        <div className="bg-white border-t border-[#e6e8eb] p-3 text-center text-sm text-[#8e8e93] shrink-0">Подписаны на канал • писать могут только администраторы</div>
      ) : (
        <div className="bg-white border-t border-[#e6e8eb] px-3 py-2 flex items-end gap-2 shrink-0">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && sendFiles(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-9 h-9 rounded-full bg-[#f0f2f5] flex items-center justify-center hover:bg-[#e9ebef] disabled:opacity-50 shrink-0">+</button>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); const el = e.target as HTMLTextAreaElement; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 100) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Сообщение"
            rows={1}
            className="flex-1 bg-[#f0f2f5] rounded-2xl px-4 py-2.5 text-[14px] leading-5 outline-none resize-none max-h-[100px] placeholder:text-[#8e8e93]"
            style={{ height: 40 }}
          />
          <button onClick={() => send()} disabled={!text.trim() || sending || uploading} className={`w-9 h-9 rounded-full text-white flex items-center justify-center shrink-0 ${!text.trim() || sending || uploading ? "bg-[#a8b4c0]" : "bg-[#2481cc]"}`}>↑</button>
        </div>
      )}
    </div>
  );
}
