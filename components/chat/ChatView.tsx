"use client";
import { useEffect, useState, useRef } from "react";
import type { Dialog } from "../Messenger";

type Msg = {
  id: number;
  text: string;
  date: string;
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
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isChannel = dialog.isChannel;

  async function load() {
    try {
      const res = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=60`);
      const data = await res.json();
      if (res.ok) setMessages(data.messages || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setAvatarError(false);
    load();
  }, [dialog.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "auto" }); }, [messages]);

  useEffect(() => {
    const id = setInterval(load, 3500);
    return () => clearInterval(id);
  }, [dialog.id]);

  useEffect(() => {
    // автофокус на десктопе, не на мобилке чтобы не поднимать клавиатуру
    if (!isChannel && window.innerWidth > 768) inputRef.current?.focus();
  }, [dialog.id, isChannel]);

  async function send() {
    if (!text.trim() || isChannel) return;
    setSending(true);
    try {
      const res = await fetch("/api/telegram/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: dialog.id, message: text }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Ошибка отправки");
      } else {
        setText("");
        await load();
      }
    } finally { setSending(false); }
  }

  async function sendFiles(files: FileList | File[]) {
    if (!files.length || isChannel) return;
    setUploading(true);
    for (const file of Array.from(files)) {
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
      } catch (e: any) {
        alert(e.message);
      }
    }
    setUploading(false);
    await load();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
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
      {/* Header — iOS large navigation */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-[#17212b]/80 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.06] safe-top">
        <div className="h-[52px] px-3 flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="md:hidden -ml-1 w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#0a84ff] dark:text-[#40a7e3] text-[22px] leading-none">‹</button>
          )}
          <div className="w-9 h-9 rounded-full overflow-hidden bg-black/5 dark:bg-white/10 flex items-center justify-center shrink-0 relative">
            {!avatarError ? (
              <img
                src={`/api/telegram/avatar?chatId=${encodeURIComponent(dialog.id)}`}
                alt={dialog.title}
                className="w-full h-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <span className="text-[12px] font-bold text-white w-full h-full flex items-center justify-center" style={{ background: `hsl(${Math.abs(dialog.id.length*47)%360} 70% 45%)` }}>
                {dialog.title.slice(0,2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-semibold leading-none truncate text-[#0f1419] dark:text-white">{dialog.title}</div>
            <div className="text-[12px] leading-none mt-1 truncate text-[#636366] dark:text-[#7d8b99]">
              {isChannel ? "канал" : dialog.isGroup ? "группа" : "в сети"} {dialog.username ? `• @${dialog.username}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="w-8 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#8e8e93]">⋯</button>
          </div>
        </div>
        {isChannel && (
          <div className="px-3 pb-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] bg-[#ff9500]/10 text-[#ff9500] dark:bg-[#ff9500]/15 px-2.5 py-1 rounded-full">
              <span>🔒</span> В каналах нельзя писать — только просмотр
            </div>
          </div>
        )}
      </div>

      {/* Messages — iOS bubbles on wallpaper */}
      <div className="flex-1 overflow-y-auto overscroll-contain relative bg-[#efeff3] dark:bg-[#0e1621] bg-[radial-gradient(#d1d5db_1px,transparent_1px)] dark:bg-[radial-gradient(#1a2a3a_1px,transparent_1px)] [background-size:18px_18px]">
        {/* subtle gradient overlay */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/40 via-transparent to-transparent dark:from-black/10 h-24" />

        {dragOver && !isChannel && (
          <div className="absolute inset-0 bg-[#0a84ff]/10 dark:bg-[#40a7e3]/15 backdrop-blur-sm flex items-center justify-center z-10 border-2 border-dashed border-[#0a84ff] dark:border-[#40a7e3] m-3 rounded-2xl">
            <div className="bg-white dark:bg-[#17212b] rounded-full px-4 py-2 shadow text-sm font-medium">Перетащи файлы сюда</div>
          </div>
        )}

        <div className="relative px-3 md:px-4 py-4 space-y-2.5 min-h-full flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="bg-white dark:bg-[#17212b] rounded-full px-4 py-2 shadow-sm text-sm text-[#8e8e93]">Загрузка...</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
              <div className="w-20 h-20 rounded-full bg-white dark:bg-[#17212b] shadow-sm flex items-center justify-center text-3xl mb-3">💬</div>
              <div className="text-[15px] font-medium text-[#0f1419] dark:text-white">Нет сообщений</div>
              <div className="text-[13px] text-[#8e8e93] dark:text-[#7d8b99] mt-1 max-w-[280px]">
                {isChannel ? "В этом канале пока нет постов" : "Напиши первым — сообщение появится здесь"}
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-center my-2">
                <span className="bg-black/5 dark:bg-white/10 backdrop-blur text-[#636366] dark:text-[#a8b3c0] text-[12px] px-3 py-1 rounded-full">
                  {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                </span>
              </div>
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.out ? "justify-end" : "justify-start"}`}>
                  <div className={`relative max-w-[78%] md:max-w-[64%] rounded-[18px] px-3.5 py-2 text-[15px] leading-[20px] shadow-sm ${
                    m.out
                      ? "bg-[#0a84ff] dark:bg-[#2b5278] text-white rounded-br-[6px]"
                      : "bg-white dark:bg-[#182533] text-[#0f1419] dark:text-white rounded-bl-[6px] border border-black/[0.04] dark:border-white/5"
                  }`}>
                    {m.from && !m.out && <div className="text-[12px] font-semibold text-[#0a84ff] dark:text-[#40a7e3] mb-1">{m.from}</div>}

                    {/* Media */}
                    {m.media && m.mediaType === "photo" && (
                      <div className="-mx-1 mb-1.5 overflow-hidden rounded-[12px]">
                        <img
                          src={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`}
                          alt=""
                          className="max-w-full max-h-[380px] w-auto object-cover cursor-zoom-in hover:opacity-95 transition"
                          loading="lazy"
                          onClick={(e) => window.open((e.target as HTMLImageElement).src, "_blank")}
                        />
                      </div>
                    )}
                    {m.media && m.mediaType === "video" && (
                      <div className="-mx-1 mb-1.5 overflow-hidden rounded-[12px]">
                        <video
                          src={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`}
                          controls
                          playsInline
                          className="max-w-full max-h-[380px] rounded-[12px]"
                          preload="metadata"
                        />
                      </div>
                    )}
                    {m.media && m.mediaType === "voice" && (
                      <div className="mb-1.5 -mx-1">
                        <audio
                          src={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`}
                          controls
                          className="w-full h-8 rounded-full"
                        />
                      </div>
                    )}
                    {m.media && m.mediaType === "document" && (
                      <div className="mb-1.5 -mx-1">
                        <a
                          href={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`}
                          target="_blank"
                          className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 ${
                            m.out ? "bg-white/15 hover:bg-white/20" : "bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                          }`}
                        >
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${m.out ? "bg-white text-[#0a84ff]" : "bg-[#0a84ff] text-white"}`}>📎</span>
                          <span className="flex-1 min-w-0 text-left">
                            <span className="block text-[13px] font-medium truncate">{m.fileName || "файл"}</span>
                            <span className={`block text-[11px] truncate ${m.out ? "text-white/70" : "text-[#8e8e93]"}`}>{m.mime || "документ"}</span>
                          </span>
                          <span className={`text-xs ${m.out ? "text-white/80" : "text-[#0a84ff]"}`}>↗</span>
                        </a>
                      </div>
                    )}
                    {m.media && !m.mediaType && <div className={`mb-1 text-xs ${m.out ? "text-white/70" : "text-[#8e8e93]"}`}>📎 медиа</div>}

                    {m.text && <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.text}</div>}

                    <div className={`flex items-center justify-end gap-1 mt-1 text-[11px] tabular-nums ${m.out ? "text-white/70" : "text-[#8e8e93] dark:text-[#7d8b99]"}`}>
                      <span>{m.date}</span>
                      {m.out && <span className="text-[11px]">✓✓</span>}
                    </div>

                    {/* bubble tail */}
                    <span
                      className={`absolute bottom-0 w-3 h-3 ${m.out ? "-right-px bg-[#0a84ff] dark:bg-[#2b5278]" : "-left-px bg-white dark:bg-[#182533] border-l border-b border-black/[0.04] dark:border-white/5"}`}
                      style={{
                        clipPath: m.out ? "polygon(0 0, 100% 100%, 0 100%)" : "polygon(100% 0, 0 100%, 100% 100%)",
                        transform: m.out ? "translateX(1px)" : "translateX(-1px)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </>
          )}
          <div ref={bottomRef} className="h-1" />
        </div>
      </div>

      {/* Input — iOS style */}
      {isChannel ? (
        <div className="bg-white/90 dark:bg-[#17212b]/90 backdrop-blur-xl border-t border-black/[0.06] dark:border-white/[0.06] px-4 py-3 safe-bottom">
          <div className="flex items-center justify-center gap-2 text-[13px] text-[#636366] dark:text-[#7d8b99]">
            <span className="w-6 h-6 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center">🔇</span>
            Подписаны на канал • писать могут только администраторы
          </div>
        </div>
      ) : (
        <div className="bg-white/90 dark:bg-[#17212b]/90 backdrop-blur-xl border-t border-black/[0.06] dark:border-white/[0.06] px-3 py-2 flex items-end gap-2 safe-bottom">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && sendFiles(e.target.files)} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-9 h-9 rounded-full bg-[#f0f2f5] dark:bg-white/10 text-[#0a84ff] dark:text-white flex items-center justify-center active:scale-95 transition shrink-0 disabled:opacity-50"
            aria-label="Прикрепить"
          >
            {uploading ? "⏳" : "+"}
          </button>
          <div className="flex-1 relative bg-[#f0f2f5] dark:bg-[#25303e] rounded-[20px] flex items-end min-h-[36px] px-1 py-1 border border-black/[0.03] dark:border-white/5">
            <textarea
              ref={inputRef}
              value={text}
              onChange={e => { setText(e.target.value); adjustHeight(e.target as HTMLTextAreaElement); }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={uploading ? "Загрузка..." : "Сообщение"}
              rows={1}
              disabled={uploading}
              className="flex-1 bg-transparent px-3 py-[7px] text-[15px] leading-5 outline-none resize-none max-h-[120px] placeholder:text-[#8e8e93] dark:placeholder:text-[#7d8b99] disabled:opacity-50"
              style={{ height: 32 }}
            />
            <button className="w-7 h-7 rounded-full text-[#8e8e93] dark:text-[#7d8b99] hover:text-[#0f1419] dark:hover:text-white flex items-center justify-center shrink-0 mr-0.5">☺</button>
          </div>
          <button
            onClick={send}
            disabled={!text.trim() || sending || uploading}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm active:scale-95 transition shrink-0 ${
              !text.trim() || sending || uploading ? "bg-[#c7c7cc] dark:bg-white/15" : "bg-[#0a84ff] dark:bg-[#2b5278]"
            }`}
            aria-label="Отправить"
          >
            <span className="text-[16px] translate-x-px">↑</span>
          </button>
        </div>
      )}
    </div>
  );
}
