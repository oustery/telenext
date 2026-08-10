"use client";
import type { Dialog } from "../Messenger";
import { useState, useRef, useEffect } from "react";
import { Virtuoso } from "react-virtuoso";

// Lazy avatar с IntersectionObserver — грузим картинку только когда в вьюпорте
function LazyAvatar({ dialog }: { dialog: Dialog }) {
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const initials = dialog.title.slice(0, 1).toUpperCase();
  const colors = ["#4a9cff", "#34c759", "#ff9500", "#af52de", "#ff3b30", "#5856d6"];
  const idx = Math.abs(dialog.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length;
  const bg = colors[idx];

  // Если уже есть base64 из dialogs API — показываем сразу (без ленивости)
  if (dialog.avatar && !error) {
    return <img src={dialog.avatar} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" onError={() => setError(true)} />;
  }

  if (error) {
    return <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold shrink-0" style={{ background: bg }}>{initials}</div>;
  }

  return (
    <div ref={ref} className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-[#e9ebef] flex items-center justify-center relative">
      {!isVisible ? (
        <div className="w-full h-full flex items-center justify-center text-white font-semibold" style={{ background: bg }}>{initials}</div>
      ) : (
        <img
          src={`/api/telegram/avatar?chatId=${encodeURIComponent(dialog.id)}`}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}

export default function ChatList({ dialogs, selectedId, onSelect }: { dialogs: Dialog[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (!dialogs.length) {
    return <div className="p-8 text-center text-sm text-[#8e8e93]">Нет чатов</div>;
  }

  return (
    <Virtuoso
      style={{ height: "100%" }}
      data={dialogs}
      overscan={400}
      increaseViewportBy={{ top: 300, bottom: 300 }}
      computeItemKey={(index, d) => d.id}
      itemContent={(index, d) => {
        const active = selectedId === d.id;
        return (
          <button
            onClick={() => onSelect(d.id)}
            className={`w-full flex gap-3 px-3 py-2.5 text-left hover:bg-[#f5f7fb] transition ${active ? "bg-[#e8f1ff]" : ""}`}
          >
            <LazyAvatar dialog={d} />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between gap-2">
                <span className="font-medium text-[14px] truncate">{d.title}</span>
                <span className="text-xs text-[#8e8e93] shrink-0">{d.date}</span>
              </div>
              <div className="flex justify-between gap-2 mt-0.5">
                <span className="text-[13px] text-[#5b6b7a] truncate pr-2">{d.lastMessage || (d.isChannel ? "канал" : "нет сообщений")}</span>
                {d.unreadCount > 0 && <span className="bg-[#2481cc] text-white text-xs min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center shrink-0">{d.unreadCount > 99 ? "99+" : d.unreadCount}</span>}
              </div>
            </div>
          </button>
        );
      }}
    />
  );
}
