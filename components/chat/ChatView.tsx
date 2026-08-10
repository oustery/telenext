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

export default function ChatView({ dialog }: { dialog: Dialog }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const res = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=50`);
      const data = await res.json();
      if (res.ok) setMessages(data.messages || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load();
  }, [dialog.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [dialog.id]);

  async function send() {
    if (!text.trim()) return;
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
    if (!files.length) return;
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
    if (e.dataTransfer.files?.length) sendFiles(e.dataTransfer.files);
  }

  return (
    <div
      className="flex flex-col h-full"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* Header */}
      <div className="h-[56px] px-4 flex items-center justify-between border-b border-white/5 bg-[#17212b]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#2b5278] flex items-center justify-center text-xs font-bold">
            {dialog.title.slice(0,2).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium leading-none">{dialog.title}</div>
            <div className="text-xs text-[#a8b3c0]">{dialog.isChannel ? "канал" : dialog.isGroup ? "группа" : "был(а) недавно"}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[#5a6d7e]">
          <button className="p-2 hover:bg-white/10 rounded-full">🔍</button>
          <button className="p-2 hover:bg-white/10 rounded-full">⋮</button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0e1621] relative">
        {dragOver && (
          <div className="absolute inset-0 bg-[#2b5278]/30 backdrop-blur-sm flex items-center justify-center z-10 border-2 border-dashed border-[#40a7e3] m-2 rounded-xl">
            <div className="text-white font-medium">Перетащи файлы сюда</div>
          </div>
        )}
        {loading ? (
          <div className="text-center text-sm text-[#5a6d7e] mt-10">Загрузка сообщений...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-[#5a6d7e] mt-10">Нет сообщений. Напиши первым или перетащи файлы!</div>
        ) : (
          messages.map(m => (
            <div key={m.id} className={`flex ${m.out ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[68%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow ${m.out ? "bg-[#2b5278] rounded-br-sm" : "bg-[#182533] rounded-bl-sm"}`}>
                {m.from && !m.out && <div className="text-xs font-semibold text-[#40a7e3] mb-1">{m.from}</div>}

                {/* Media */}
                {m.media && m.mediaType === "photo" && (
                  <div className="mb-2 -mx-1">
                    <img
                      src={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`}
                      alt=""
                      className="rounded-lg max-w-full max-h-80 object-cover cursor-pointer"
                      loading="lazy"
                      onClick={(e) => window.open((e.target as HTMLImageElement).src, "_blank")}
                    />
                  </div>
                )}
                {m.media && m.mediaType === "video" && (
                  <div className="mb-2">
                    <video
                      src={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`}
                      controls
                      className="rounded-lg max-w-full max-h-80"
                      preload="metadata"
                    />
                  </div>
                )}
                {m.media && m.mediaType === "voice" && (
                  <div className="mb-2">
                    <audio
                      src={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`}
                      controls
                      className="w-full"
                    />
                  </div>
                )}
                {m.media && m.mediaType === "document" && (
                  <div className="mb-2">
                    <a
                      href={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`}
                      target="_blank"
                      className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 hover:bg-black/30"
                    >
                      <span className="text-lg">📎</span>
                      <span className="text-xs truncate">{m.fileName || "файл"} {m.mime ? `• ${m.mime}` : ""}</span>
                      <span className="text-xs text-[#40a7e3] ml-auto">Скачать</span>
                    </a>
                  </div>
                )}
                {m.media && !m.mediaType && (
                  <div className="mb-1 text-xs text-[#a8b3c0]">📎 медиа</div>
                )}

                {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                {!m.text && !m.media && <div className="text-xs text-[#5a6d7e] italic">пустое сообщение</div>}

                <div className={`text-[11px] mt-1 text-right ${m.out ? "text-[#a8d0ff]/70" : "text-[#5a6d7e]"}`}>{m.date} {m.out ? "✓✓" : ""}</div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-[#17212b] border-t border-white/5 flex items-end gap-2">
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && sendFiles(e.target.files)} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="p-2 text-[#5a6d7e] hover:text-white disabled:opacity-50"
          title="Прикрепить файлы (или перетащи)"
        >
          {uploading ? "⏳" : "📎"}
        </button>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={uploading ? "Загрузка..." : "Написать сообщение... (Shift+Enter — новая строка)"}
          rows={1}
          disabled={uploading}
          className="flex-1 bg-[#0e1621] rounded-2xl px-4 py-3 text-sm outline-none resize-none max-h-32 placeholder:text-[#5a6d7e] disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending || uploading}
          className="w-10 h-10 rounded-full bg-[#2b5278] hover:bg-[#325d8a] disabled:opacity-50 flex items-center justify-center"
        >
          {sending ? "…" : "➤"}
        </button>
      </div>
      {uploading && <div className="px-4 pb-2 text-xs text-[#40a7e3]">Загрузка файлов...</div>}
    </div>
  );
}
