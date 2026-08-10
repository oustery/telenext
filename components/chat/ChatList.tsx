"use client";
import type { Dialog } from "../Messenger";

export default function ChatList({ dialogs, selectedId, onSelect }: {
  dialogs: Dialog[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (dialogs.length === 0) {
    return <div className="p-8 text-center text-sm text-[#5a6d7e]">Нет диалогов. Подпишись на канал в Telegram и обнови.</div>;
  }
  return (
    <div className="divide-y divide-white/[0.03]">
      {dialogs.map(d => (
        <button
          key={d.id}
          onClick={() => onSelect(d.id)}
          className={`w-full flex gap-3 p-3 text-left hover:bg-[#202e3a] transition ${selectedId === d.id ? "bg-[#2b5278]" : ""}`}
        >
          <div className="w-11 h-11 rounded-full bg-[#2b5278] flex-shrink-0 flex items-center justify-center text-sm font-bold overflow-hidden">
            {d.avatar ? <img src={d.avatar} alt="" className="w-full h-full object-cover" /> : d.title.slice(0,2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center">
              <span className="font-medium text-sm truncate pr-2">{d.title}</span>
              <span className="text-[11px] text-[#5a6d7e] flex-shrink-0">{d.date || ""}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-[#a8b3c0] truncate pr-2">{d.lastMessage || (d.isChannel ? "канал" : "нет сообщений")}</span>
              {d.unreadCount > 0 && (
                <span className="bg-[#5288c1] text-white text-[11px] px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{d.unreadCount}</span>
              )}
            </div>
            <div className="text-[11px] text-[#5a6d7e] mt-0.5">
              {d.isChannel ? "канал" : d.isGroup ? "группа" : "личка"} {d.username ? `• @${d.username}` : ""}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
