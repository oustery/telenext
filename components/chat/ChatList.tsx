"use client";
import type { Dialog } from "../Messenger";
import { useState } from "react";

function Avatar({ dialog }: { dialog: Dialog }) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const initials = dialog.title.trim().slice(0, 2).toUpperCase() || "??";
  const hue = Math.abs(dialog.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
  const bg = dialog.isChannel ? `hsl(${hue} 70% 45%)` : dialog.isGroup ? `hsl(${hue} 60% 50%)` : `hsl(${hue} 75% 55%)`;

  // если бэкенд уже отдал base64 аватар — используем его, без доп. запроса (критично для AUTH_KEY_DUPLICATED)
  if (dialog.avatar && !error) {
    return (
      <div className="w-[52px] h-[52px] rounded-full overflow-hidden shrink-0 relative bg-black/5 dark:bg-white/10 flex items-center justify-center">
        <img
          src={dialog.avatar}
          alt={dialog.title}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setError(true)}
        />
      </div>
    );
  }

  // fallback: пробуем отдельный /avatar (кэшируется), но с ошибкой — показываем инициалы
  if (error) {
    return (
      <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-[15px] font-semibold shrink-0" style={{ background: bg }}>
        {initials}
      </div>
    );
  }

  return (
    <div className="w-[52px] h-[52px] rounded-full overflow-hidden shrink-0 relative bg-black/5 dark:bg-white/10 flex items-center justify-center">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-[15px] font-semibold" style={{ background: bg }}>
          {initials}
        </div>
      )}
      <img
        src={`/api/telegram/avatar?chatId=${encodeURIComponent(dialog.id)}`}
        alt={dialog.title}
        className={`w-full h-full object-cover ${loaded ? "opacity-100" : "opacity-0"} transition`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
}

export default function ChatList({ dialogs, selectedId, onSelect }: {
  dialogs: Dialog[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (dialogs.length === 0) {
    return <div className="p-10 text-center text-sm text-[#8e8e93] dark:text-[#7d8b99]">Нет диалогов в этой вкладке.</div>;
  }
  return (
    <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
      {dialogs.map(d => {
        const isSelected = selectedId === d.id;
        return (
          <button
            key={d.id}
            onClick={() => onSelect(d.id)}
            className={`w-full flex gap-3 px-3 py-[10px] text-left transition group relative ${
              isSelected
                ? "bg-[#40a7e3] dark:bg-[#2b5278] text-white"
                : "hover:bg-black/[0.04] dark:hover:bg-white/[0.04] active:bg-black/[0.06] dark:active:bg-white/[0.06] bg-white dark:bg-[#17212b]"
            }`}
          >
            <Avatar dialog={d} />
            <div className="flex-1 min-w-0 py-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`font-semibold text-[15px] leading-4 truncate pr-2 ${isSelected ? "text-white" : "text-[#0f1419] dark:text-white"}`}>
                  {d.title}
                </span>
                <span className={`text-[12px] tabular-nums shrink-0 ${isSelected ? "text-white/70" : "text-[#8e8e93] dark:text-[#7d8b99]"}`}>{d.date || ""}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className={`text-[13px] leading-4 truncate pr-2 ${isSelected ? "text-white/80" : "text-[#636366] dark:text-[#a8b3c0]"}`}>
                  {d.lastMessage || (d.isChannel ? "канал" : d.isGroup ? "группа" : "нет сообщений")}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {d.isChannel && <span className={`text-[11px] ${isSelected ? "text-white/60" : "text-[#8e8e93]"}`}>📢</span>}
                  {d.unreadCount > 0 ? (
                    <span className={`min-w-[22px] h-[22px] px-1.5 flex items-center justify-center rounded-full text-[12px] font-semibold tabular-nums ${
                      isSelected ? "bg-white text-[#40a7e3] dark:text-[#2b5278]" : "bg-[#40a7e3] text-white"
                    }`}>{d.unreadCount > 999 ? "999+" : d.unreadCount}</span>
                  ) : (
                    <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-white/30" : "bg-transparent"}`} />
                  )}
                </div>
              </div>
              <div className={`text-[11px] mt-1 flex items-center gap-1 ${isSelected ? "text-white/60" : "text-[#8e8e93] dark:text-[#5a6d7e]"}`}>
                <span className="inline-flex items-center gap-1">
                  {d.isChannel ? "канал" : d.isGroup ? "группа" : "личка"}
                  {d.username ? ` • @${d.username}` : ""}
                </span>
              </div>
            </div>
            <span className={`absolute left-[76px] right-0 bottom-0 h-px ${isSelected ? "bg-transparent" : "bg-black/[0.06] dark:bg-white/[0.06]"} hidden md:block`} />
          </button>
        );
      })}
    </div>
  );
}
