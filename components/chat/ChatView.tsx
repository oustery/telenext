"use client";
import { useEffect, useState, useRef, useCallback } from "react";
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

export default function ChatView({ dialog, onBack }: { dialog: Dialog; onBack?: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const firstItemIndexRef = useRef(0);

  const isChannel = dialog.isChannel;

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=40`, { signal: controller.signal, cache: "no-store" });
      clearTimeout(t);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) { location.href = "/login"; return; }
        throw new Error(data.error || `Ошибка ${res.status}`);
      }
      setMessages(data.messages || []);
      setHasMore(!!data.hasMore);
      firstItemIndexRef.current = 10000 - (data.messages?.length || 0);
    } catch (e: any) {
      const msg = e?.name === "AbortError" ? "Превышено время ожидания" : e?.message || "Не удалось загрузить сообщения";
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [dialog.id]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldestId = messages[0]?.id;
      const res = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=40&offsetId=${oldestId}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) throw new Error(data.error || "Слишком часто, подожди");
        throw new Error(data.error || "Ошибка подгрузки");
      }
      if (data.messages?.length) {
        const older: Msg[] = data.messages;
        setMessages(prev => [...older, ...prev]);
        setHasMore(!!data.hasMore);
        firstItemIndexRef.current -= older.length;
      } else {
        setHasMore(false);
      }
    } catch (e: any) {
      // тихо, не спамим
      console.warn("loadMore failed", e?.message);
    } finally {
      setLoadingMore(false);
    }
  }, [dialog.id, messages, hasMore, loadingMore]);

  // Poll for new messages (only tail) — с защитой от AUTH_KEY_DUPLICATED (429)
  const pollNew = useCallback(async () => {
    if (loading || loadingMore) return;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=20`, { signal: controller.signal, cache: "no-store" });
      clearTimeout(t);
      if (res.status === 429) return; // FloodWait / AUTH_KEY_DUPLICATED — тихо ждём следующий тик
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.messages?.length) {
        const incoming: Msg[] = data.messages;
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          const newOnes = incoming.filter(m => !ids.has(m.id));
          if (newOnes.length === 0) return prev;
          const maxId = Math.max(...prev.map(m => m.id), 0);
          const toAdd = newOnes.filter(m => m.id > maxId);
          if (toAdd.length === 0) return prev;
          return [...prev, ...toAdd];
        });
      }
    } catch {}
  }, [dialog.id, loading, loadingMore]);

  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    setAvatarError(false);
    firstItemIndexRef.current = 10000;
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    // 6с + не поллим если вкладка не видна (экономим коннекты)
    const id = setInterval(() => {
      if (document.hidden) return;
      pollNew();
    }, 6000);
    return () => clearInterval(id);
  }, [pollNew]);

  useEffect(() => {
    if (!isChannel && window.innerWidth > 768) inputRef.current?.focus();
  }, [dialog.id, isChannel]);

  async function send(retry = false) {
    if (!text.trim() || isChannel) return;
    const optimistic: Msg = {
      id: Date.now(),
      text: text.trim(),
      date: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      timestamp: Date.now() / 1000,
      out: true,
    };
    const toSend = text.trim();
    setText("");
    if (inputRef.current) { inputRef.current.style.height = "32px"; }
    setMessages(prev => [...prev, optimistic]);
    setSending(true);
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/telegram/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: dialog.id, message: toSend }),
        signal: controller.signal,
      });
      clearTimeout(t);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // При AUTH_KEY_DUPLICATED — тихо ретраим один раз через 2с без алерта
        if (res.status === 429 && (data.error || "").includes("AUTH_KEY_DUPLICATED") && !retry) {
          setMessages(prev => prev.filter(m => m.id !== optimistic.id));
          await new Promise(r => setTimeout(r, 2200));
          setText(toSend);
          // рекурсивно пробуем ещё раз
          setTimeout(() => send(true), 0);
          return;
        }
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        // Для 429 показываем мягкое уведомление, для остальных — алерт
        if (res.status === 429) alert(data.error || "Слишком часто, подожди 2с");
        else alert(data.error || "Ошибка отправки");
        setText(toSend);
      } else {
        setTimeout(pollNew, 600);
      }
    } catch (e: any) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      if (e?.name === "AbortError") alert("Таймаут отправки, попробуй ещё раз");
      else alert(e?.message || "Ошибка сети");
      setText(toSend);
    } finally { setSending(false); }
  }

  async function sendFiles(files: FileList | File[]) {
    if (!files.length || isChannel) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) { alert(`${file.name}: слишком большой (макс 50MB)`); continue; }
      const form = new FormData();
      form.append("chatId", dialog.id);
      form.append("file", file);
      form.append("caption", "");
      try {
        const res = await fetch("/api/telegram/sendFile", { method: "POST", body: form });
        if (!res.ok) {
          const d = await res.json();
          alert(`Ошибка загрузки ${file.name}: ${d.error}`);
        }
      } catch (e: any) { alert(e.message); }
    }
    setUploading(false);
    pollNew();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    if (isChannel) return;
    if (e.dataTransfer.files?.length) sendFiles(e.dataTransfer.files);
  }

  function adjustHeight(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  return (
    <div
      className="flex flex-col h-full bg-[#efeff3] dark:bg-[#0e1621] relative"
      onDragOver={(e) => { e.preventDefault(); if (!isChannel) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-[#17212b]/80 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.06] safe-top">
        <div className="h-[52px] px-3 flex items-center gap-3">
          {onBack && <button onClick={onBack} className="md:hidden -ml-1 w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#0a84ff] dark:text-[#40a7e3] text-[22px] leading-none">‹</button>}
          <div className="w-9 h-9 rounded-full overflow-hidden bg-black/5 dark:bg-white/10 flex items-center justify-center shrink-0 relative">
            {!avatarError && dialog.avatar ? (
              <img src={dialog.avatar} alt={dialog.title} className="w-full h-full object-cover" onError={() => setAvatarError(true)} />
            ) : !avatarError ? (
              <img src={`/api/telegram/avatar?chatId=${encodeURIComponent(dialog.id)}`} alt={dialog.title} className="w-full h-full object-cover" onError={() => setAvatarError(true)} />
            ) : (
              <span className="text-[12px] font-bold text-white w-full h-full flex items-center justify-center" style={{ background: `hsl(${Math.abs(dialog.id.length*47)%360} 70% 45%)` }}>{dialog.title.slice(0,2).toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-semibold leading-none truncate text-[#0f1419] dark:text-white">{dialog.title}</div>
            <div className="text-[12px] leading-none mt-1 truncate text-[#636366] dark:text-[#7d8b99]">{isChannel ? "канал" : dialog.isGroup ? "группа" : "в сети"} {dialog.username ? `• @${dialog.username}` : ""}</div>
          </div>
          <div className="flex items-center gap-1"><button className="w-8 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#8e8e93]">⋯</button></div>
        </div>
        {isChannel && (
          <div className="px-3 pb-2"><div className="inline-flex items-center gap-1.5 text-[11px] bg-[#ff9500]/10 text-[#ff9500] dark:bg-[#ff9500]/15 px-2.5 py-1 rounded-full">🔒 В каналах нельзя писать — только просмотр</div></div>
        )}
      </div>

      {/* Messages — Virtuoso */}
      <div className="flex-1 relative bg-[#efeff3] dark:bg-[#0e1621] bg-[radial-gradient(#d1d5db_1px,transparent_1px)] dark:bg-[radial-gradient(#1a2a3a_1px,transparent_1px)] [background-size:18px_18px] overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/40 via-transparent to-transparent dark:from-black/10 h-24" />
        {dragOver && !isChannel && (
          <div className="absolute inset-0 bg-[#0a84ff]/10 dark:bg-[#40a7e3]/15 backdrop-blur-sm flex items-center justify-center z-10 border-2 border-dashed border-[#0a84ff] dark:border-[#40a7e3] m-3 rounded-2xl">
            <div className="bg-white dark:bg-[#17212b] rounded-full px-4 py-2 shadow text-sm font-medium">Перетащи файлы сюда</div>
          </div>
        )}

        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center"><div className="bg-white dark:bg-[#17212b] rounded-full px-4 py-2 shadow-sm text-sm text-[#8e8e93] animate-pulse">Загрузка...</div></div>
        ) : loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 text-xl mb-3">!</div>
            <div className="text-[14px] font-medium text-[#0f1419] dark:text-white">Не удалось загрузить</div>
            <div className="text-[12px] text-[#8e8e93] dark:text-[#7d8b99] mt-1 max-w-[300px] break-words">{loadError}</div>
            <div className="flex gap-2 mt-4">
              <button onClick={loadInitial} className="px-4 py-2 rounded-full bg-[#0a84ff] text-white text-sm font-medium active:scale-95">Попробовать снова</button>
              <button onClick={() => { setLoadError(null); setHasMore(true); loadInitial(); }} className="px-4 py-2 rounded-full bg-black/5 dark:bg-white/10 text-sm">Обновить</button>
            </div>
            <div className="text-[11px] text-[#8e8e93] mt-3">Если ошибка повторяется — попробуй выйти и войти снова, или проверь связь с Telegram</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-full bg-white dark:bg-[#17212b] shadow-sm flex items-center justify-center text-3xl mb-3">💬</div>
            <div className="text-[15px] font-medium text-[#0f1419] dark:text-white">Нет сообщений</div>
            <div className="text-[13px] text-[#8e8e93] dark:text-[#7d8b99] mt-1 max-w-[280px]">{isChannel ? "В этом канале пока нет постов" : "Напиши первым — сообщение появится здесь"}</div>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            style={{ height: "100%" }}
            data={messages}
            firstItemIndex={firstItemIndexRef.current}
            initialTopMostItemIndex={Math.max(0, messages.length - 1)}
            alignToBottom
            followOutput="smooth"
            startReached={() => { if (hasMore && !loadingMore) loadMore(); }}
            components={{
              Header: () => (
                <div className="flex justify-center py-3">
                  {loadingMore ? (
                    <span className="bg-white/80 dark:bg-white/10 backdrop-blur text-[12px] px-3 py-1 rounded-full text-[#8e8e93]">Загрузка...</span>
                  ) : hasMore ? (
                    <span className="bg-black/5 dark:bg-white/10 text-[11px] px-3 py-1 rounded-full text-[#8e8e93]">↑ Потяни чтобы загрузить ещё</span>
                  ) : (
                    <span className="bg-black/5 dark:bg-white/10 text-[11px] px-3 py-1 rounded-full text-[#8e8e93]">Начало истории</span>
                  )}
                </div>
              ),
            }}
            itemContent={(index, m) => (
              <div className={`flex px-3 md:px-4 py-1 ${m.out ? "justify-end" : "justify-start"}`}>
                <div className={`relative max-w-[78%] md:max-w-[64%] rounded-[18px] px-3.5 py-2 text-[15px] leading-[20px] shadow-sm ${m.out ? "bg-[#0a84ff] dark:bg-[#2b5278] text-white rounded-br-[6px]" : "bg-white dark:bg-[#182533] text-[#0f1419] dark:text-white rounded-bl-[6px] border border-black/[0.04] dark:border-white/5"}`}>
                  {m.from && !m.out && <div className="text-[12px] font-semibold text-[#0a84ff] dark:text-[#40a7e3] mb-1">{m.from}</div>}
                  {m.media && m.mediaType === "photo" && (
                    <div className="-mx-1 mb-1.5 overflow-hidden rounded-[12px]">
                      <img src={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`} alt="" className="max-w-full max-h-[380px] w-auto object-cover cursor-zoom-in hover:opacity-95 transition" loading="lazy" onClick={(e) => window.open((e.target as HTMLImageElement).src, "_blank")} />
                    </div>
                  )}
                  {m.media && m.mediaType === "video" && (
                    <div className="-mx-1 mb-1.5 overflow-hidden rounded-[12px]">
                      <video src={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`} controls playsInline className="max-w-full max-h-[380px] rounded-[12px]" preload="metadata" />
                    </div>
                  )}
                  {m.media && m.mediaType === "voice" && (
                    <div className="mb-1.5 -mx-1"><audio src={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`} controls className="w-full h-8 rounded-full" /></div>
                  )}
                  {m.media && m.mediaType === "document" && (
                    <div className="mb-1.5 -mx-1">
                      <a href={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`} target="_blank" className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 ${m.out ? "bg-white/15 hover:bg-white/20" : "bg-black/[0.04] dark:bg-white/[0.06]"}`}>
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${m.out ? "bg-white text-[#0a84ff]" : "bg-[#0a84ff] text-white"}`}>📎</span>
                        <span className="flex-1 min-w-0 text-left"><span className="block text-[13px] font-medium truncate">{m.fileName || "файл"}</span><span className={`block text-[11px] truncate ${m.out ? "text-white/70" : "text-[#8e8e93]"}`}>{m.mime || "документ"}</span></span>
                        <span className={`text-xs ${m.out ? "text-white/80" : "text-[#0a84ff]"}`}>↗</span>
                      </a>
                    </div>
                  )}
                  {m.media && !m.mediaType && <div className={`mb-1 text-xs ${m.out ? "text-white/70" : "text-[#8e8e93]"}`}>📎 медиа</div>}
                  {m.text && <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.text}</div>}
                  <div className={`flex items-center justify-end gap-1 mt-1 text-[11px] tabular-nums ${m.out ? "text-white/70" : "text-[#8e8e93] dark:text-[#7d8b99]"}`}><span>{m.date}</span>{m.out && <span>✓✓</span>}</div>
                  <span className={`absolute bottom-0 w-3 h-3 ${m.out ? "-right-px bg-[#0a84ff] dark:bg-[#2b5278]" : "-left-px bg-white dark:bg-[#182533] border-l border-b border-black/[0.04] dark:border-white/5"}`} style={{ clipPath: m.out ? "polygon(0 0, 100% 100%, 0 100%)" : "polygon(100% 0, 0 100%, 100% 100%)", transform: m.out ? "translateX(1px)" : "translateX(-1px)" }} />
                </div>
              </div>
            )}
          />
        )}
      </div>

      {/* Input */}
      {isChannel ? (
        <div className="bg-white/90 dark:bg-[#17212b]/90 backdrop-blur-xl border-t border-black/[0.06] dark:border-white/[0.06] px-4 py-3 safe-bottom">
          <div className="flex items-center justify-center gap-2 text-[13px] text-[#636366] dark:text-[#7d8b99]"><span className="w-6 h-6 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center">🔇</span>Подписаны на канал • писать могут только администраторы</div>
        </div>
      ) : (
        <div className="bg-white/90 dark:bg-[#17212b]/90 backdrop-blur-xl border-t border-black/[0.06] dark:border-white/[0.06] px-3 py-2 flex items-end gap-2 safe-bottom">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && sendFiles(e.target.files)} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-9 h-9 rounded-full bg-[#f0f2f5] dark:bg-white/10 text-[#0a84ff] dark:text-white flex items-center justify-center active:scale-95 transition shrink-0 disabled:opacity-50" aria-label="Прикрепить">{uploading ? "⏳" : "+"}</button>
          <div className="flex-1 relative bg-[#f0f2f5] dark:bg-[#25303e] rounded-[20px] flex items-end min-h-[36px] px-1 py-1 border border-black/[0.03] dark:border-white/5">
            <textarea ref={inputRef} value={text} onChange={e => { setText(e.target.value); adjustHeight(e.target as HTMLTextAreaElement); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={uploading ? "Загрузка..." : "Сообщение"} rows={1} disabled={uploading} className="flex-1 bg-transparent px-3 py-[7px] text-[15px] leading-5 outline-none resize-none max-h-[120px] placeholder:text-[#8e8e93] dark:placeholder:text-[#7d8b99] disabled:opacity-50" style={{ height: 32 }} />
            <button className="w-7 h-7 rounded-full text-[#8e8e93] dark:text-[#7d8b99] hover:text-[#0f1419] dark:hover:text-white flex items-center justify-center shrink-0 mr-0.5">☺</button>
          </div>
          <button onClick={send} disabled={!text.trim() || sending || uploading} className={`w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm active:scale-95 transition shrink-0 ${!text.trim() || sending || uploading ? "bg-[#c7c7cc] dark:bg-white/15" : "bg-[#0a84ff] dark:bg-[#2b5278]"}`} aria-label="Отправить"><span className="text-[16px] translate-x-px">↑</span></button>
        </div>
      )}
    </div>
  );
}
