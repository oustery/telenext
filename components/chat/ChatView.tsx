"use client";
import { useEffect, useState, useRef, useCallback, memo } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import type { Dialog } from "../Messenger";

type Msg = {
  id: number;
  text: string;
  date: string;
  timestamp: number;
  out: boolean;
  from?: string;
  media?: boolean;
  mediaType?: string | null;
  mime?: string | null;
  fileName?: string | null;
};

// Мемоизированный бабл — критично для 60fps
const MessageBubble = memo(function MessageBubble({ m, dialogId }: { m: Msg; dialogId: string }) {
  return (
    <div className={`flex px-3 py-1 ${m.out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] md:max-w-[68%] rounded-2xl px-3.5 py-2 text-[14px] leading-[19px] ${m.out ? "bg-[#2481cc] text-white rounded-br-md" : "bg-white border border-[#e6e8eb] rounded-bl-md text-[#0f1419]"}`}
        style={{ contain: "content", willChange: "auto" }}
      >
        {m.from && !m.out && <div className="text-xs font-semibold text-[#2481cc] mb-0.5 truncate">{m.from}</div>}
        {m.media && m.mediaType === "photo" && (
          <img
            src={`/api/telegram/media?chatId=${encodeURIComponent(dialogId)}&messageId=${m.id}`}
            alt=""
            width={360}
            height={240}
            loading="lazy"
            decoding="async"
            className="rounded-xl max-h-[300px] w-auto mb-1.5 cursor-pointer block"
            style={{ contentVisibility: "auto" as any }}
            onClick={(e) => window.open((e.target as HTMLImageElement).src, "_blank")}
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        )}
        {m.media && m.mediaType === "video" && (
          <video
            src={`/api/telegram/media?chatId=${encodeURIComponent(dialogId)}&messageId=${m.id}`}
            controls
            preload="metadata"
            className="rounded-xl max-h-[300px] mb-1.5 w-full block"
            style={{ contentVisibility: "auto" as any }}
          />
        )}
        {m.media && m.mediaType === "voice" && (
          <audio src={`/api/telegram/media?chatId=${encodeURIComponent(dialogId)}&messageId=${m.id}`} controls preload="none" className="w-full h-8 mb-1 block" />
        )}
        {m.media && m.mediaType === "document" && (
          <a href={`/api/telegram/media?chatId=${encodeURIComponent(dialogId)}&messageId=${m.id}`} target="_blank" rel="noopener" className={`flex items-center gap-2 rounded-lg px-3 py-2 mb-1 ${m.out ? "bg-white/20" : "bg-[#f0f2f5]"}`}>
            <span className="shrink-0">📎</span>
            <span className="text-xs truncate min-w-0">{m.fileName || "файл"}</span>
          </a>
        )}
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

  const fileRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const firstIdx = useRef(10000);
  const scrollTimeout = useRef<number | null>(null);

  const isChannel = dialog.isChannel;

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=30`, {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(t);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
      setMessages(data.messages || []);
      setHasMore(!!data.hasMore);
      firstIdx.current = 10000 - (data.messages?.length || 0);
    } catch (e: any) {
      setLoadError(e?.name === "AbortError" ? "Превышено время ожидания" : e?.message || "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, [dialog.id]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !messages.length || isScrolling) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=30&offsetId=${messages[0].id}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.messages?.length) {
        setMessages((prev) => [...data.messages, ...prev]);
        setHasMore(!!data.hasMore);
        firstIdx.current -= data.messages.length;
      } else {
        setHasMore(false);
      }
    } catch {
      // тихо
    } finally {
      setLoadingMore(false);
    }
  }, [dialog.id, messages, hasMore, loadingMore, isScrolling]);

  const pollNew = useCallback(async () => {
    if (loading || loadingMore || isScrolling || document.hidden) return;
    try {
      const res = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=15`, { cache: "no-store" });
      if (res.status === 429) return;
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.messages?.length) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const max = prev.length ? Math.max(...prev.map((m) => m.id)) : 0;
          const add = (data.messages as Msg[]).filter((m) => !ids.has(m.id) && m.id > max);
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

  // Поллим реже и только когда не скроллим
  useEffect(() => {
    const id = setInterval(pollNew, 8000);
    return () => clearInterval(id);
  }, [pollNew]);

  const handleIsScrolling = useCallback((scrolling: boolean) => {
    setIsScrolling(scrolling);
    if (scrollTimeout.current) window.clearTimeout(scrollTimeout.current);
    if (scrolling) {
      scrollTimeout.current = window.setTimeout(() => setIsScrolling(false), 800);
    }
  }, []);

  const itemContent = useCallback(
    (index: number, m: Msg) => <MessageBubble m={m} dialogId={dialog.id} />,
    [dialog.id]
  );

  async function send(retry = false) {
    if (!text.trim() || isChannel) return;
    const toSend = text.trim();
    const optimistic: Msg = {
      id: Date.now(),
      text: toSend,
      date: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      timestamp: Date.now() / 1000,
      out: true,
    };
    setText("");
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 20000);
      const res = await fetch("/api/telegram/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: dialog.id, message: toSend }),
        signal: controller.signal,
      });
      clearTimeout(t);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429 && (data.error || "").includes("AUTH_KEY_DUPLICATED") && !retry) {
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
          await new Promise((r) => setTimeout(r, 1800));
          setText(toSend);
          setTimeout(() => send(true), 0);
          return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        // не блокируем второе сообщение — просто возвращаем текст
        setText(toSend);
        if (res.status !== 429) alert(data.error || "Ошибка отправки");
      } else {
        // оставим оптимистик, серверный poll подтянет реальный id
        setTimeout(pollNew, 700);
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        // сообщение уже ушло — не удаляем оптимистик
        setTimeout(pollNew, 1200);
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setText(toSend);
        alert(e?.message || "Ошибка сети");
      }
    } finally {
      setSending(false);
    }
  }

  async function sendFiles(files: FileList | File[]) {
    if (!files.length || isChannel) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      if (f.size > 50 * 1024 * 1024) {
        alert(`${f.name}: макс 50MB`);
        continue;
      }
      const fd = new FormData();
      fd.append("chatId", dialog.id);
      fd.append("file", f);
      try {
        const r = await fetch("/api/telegram/sendFile", { method: "POST", body: fd });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          alert(d.error || "Ошибка загрузки");
        }
      } catch (e: any) {
        alert(e.message);
      }
    }
    setUploading(false);
    pollNew();
  }

  return (
    <div className="flex flex-col h-full bg-[#f5f7fb] min-h-0">
      {/* Header — без blur для 60fps */}
      <div className="h-14 px-3 flex items-center gap-3 bg-white border-b border-[#e6e8eb] shrink-0">
        {onBack && (
          <button onClick={onBack} className="md:hidden w-8 h-8 -ml-1 flex items-center justify-center text-[#2481cc] active:opacity-60" aria-label="Назад">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <div className="w-8 h-8 rounded-full bg-[#2481cc] text-white flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
          {dialog.avatar ? <img src={dialog.avatar} alt="" className="w-full h-full object-cover" loading="eager" /> : dialog.title.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] leading-none truncate">{dialog.title}</div>
          <div className="text-xs text-[#8e8e93] truncate leading-none mt-1">{isChannel ? "канал" : dialog.isGroup ? "группа" : "в сети"}{dialog.username ? ` • @${dialog.username}` : ""}</div>
        </div>
      </div>

      {isChannel && <div className="bg-[#fff4e5] text-[#8a6d00] text-xs text-center py-1.5 border-b border-[#ffe9b3] shrink-0">В каналах можно только читать</div>}

      {/* Messages — виртуализация без лишних эффектов */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-[#f5f7fb]">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[#8e8e93]">Загрузка...</div>
        ) : loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-sm font-medium">Не удалось загрузить</div>
            <div className="text-xs text-[#8e8e93] mt-1 max-w-[300px] break-words">{loadError}</div>
            <button onClick={loadInitial} className="mt-3 px-4 py-2 bg-[#2481cc] text-white rounded-full text-sm active:scale-95">Попробовать снова</button>
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
            startReached={() => {
              if (hasMore && !loadingMore && !isScrolling) loadMore();
            }}
            computeItemKey={(idx, m) => m.id}
            itemContent={itemContent}
            components={{
              Header: () => (
                <div className="flex justify-center py-2">
                  {loadingMore ? (
                    <span className="text-xs bg-white border border-[#e6e8eb] px-3 py-1 rounded-full">Загрузка...</span>
                  ) : hasMore ? (
                    <span className="text-xs text-[#8e8e93]">Потяните чтобы загрузить ещё</span>
                  ) : (
                    <span className="text-xs text-[#8e8e93]">Начало истории</span>
                  )}
                </div>
              ),
            }}
          />
        )}
      </div>

      {/* Input — без blur */}
      {isChannel ? (
        <div className="bg-white border-t border-[#e6e8eb] p-3 text-center text-sm text-[#8e8e93] shrink-0">Подписаны на канал • писать могут только администраторы</div>
      ) : (
        <div className="bg-white border-t border-[#e6e8eb] px-3 py-2 flex items-end gap-2 shrink-0">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && sendFiles(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-9 h-9 rounded-full bg-[#f0f2f5] flex items-center justify-center hover:bg-[#e9ebef] disabled:opacity-50 shrink-0 active:scale-95">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b6b7a" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 100) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Сообщение"
            rows={1}
            className="flex-1 bg-[#f0f2f5] rounded-2xl px-4 py-2.5 text-[14px] leading-5 outline-none resize-none max-h-[100px] placeholder:text-[#8e8e93]"
            style={{ height: 40 }}
          />
          <button
            onClick={() => send()}
            disabled={!text.trim() || sending || uploading}
            className={`w-9 h-9 rounded-full text-white flex items-center justify-center shrink-0 active:scale-95 transition-colors ${!text.trim() || sending || uploading ? "bg-[#a8b4c0]" : "bg-[#2481cc] hover:bg-[#1a6fb5]"}`}
            aria-label="Отправить"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2z" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
