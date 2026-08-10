"use client";
import { useEffect, useState } from "react";
import ChatList from "./chat/ChatList";
import ChatView from "./chat/ChatView";

export type Dialog = {
  id: string;
  title: string;
  username?: string;
  avatar?: string;
  lastMessage?: string;
  unreadCount: number;
  isChannel: boolean;
  isGroup: boolean;
  date?: string;
};

export default function Messenger() {
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function loadDialogs() {
    try {
      const res = await fetch("/api/telegram/dialogs");
      const data = await res.json();
      if (res.ok) setDialogs(data.dialogs || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadDialogs(); }, []);

  // Polling каждые 3 сек для MVP (в v2 заменим на Socket.io)
  useEffect(() => {
    const id = setInterval(loadDialogs, 3000);
    return () => clearInterval(id);
  }, []);

  const filtered = dialogs.filter(d => 
    !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.username?.toLowerCase().includes(search.toLowerCase())
  );

  const selected = dialogs.find(d => d.id === selectedId) || null;

  return (
    <div className="flex h-screen bg-[#17212b] text-white overflow-hidden">
      {/* Левая панель */}
      <div className="w-[420px] min-w-[360px] border-r border-white/5 bg-[#0e1621] flex flex-col">
        <div className="p-3 flex items-center gap-3 border-b border-white/5">
          <button className="p-2 hover:bg-white/10 rounded-full">☰</button>
          <div className="flex-1 relative">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск"
              className="w-full bg-[#17212b] rounded-full px-4 py-2 pl-10 text-sm outline-none placeholder:text-[#5a6d7e] focus:bg-[#25303e]"
            />
            <span className="absolute left-3 top-2.5 text-[#5a6d7e]">🔍</span>
          </div>
        </div>
        <div className="flex gap-2 px-3 py-2 border-b border-white/5 overflow-x-auto text-sm">
          {["Все","Личные","Группы","Каналы"].map(t => (
            <button key={t} className="px-3 py-1.5 rounded-full bg-[#2b5278] whitespace-nowrap text-xs font-medium hover:bg-[#325d8a]">{t}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-[#5a6d7e] text-sm">Загрузка диалогов...</div>
          ) : (
            <ChatList dialogs={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>
        <div className="p-3 border-t border-white/5 flex items-center justify-between text-xs text-[#5a6d7e]">
          <span>TeleNext • MTProto</span>
          <button
            onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/login"; }}
            className="hover:text-white"
          >
            Выйти
          </button>
        </div>
      </div>

      {/* Центр */}
      <div className="flex-1 flex flex-col bg-[#0e1621] relative">
        {selected ? (
          <ChatView dialog={selected} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[#5a6d7e]">
            <div className="w-24 h-24 rounded-full bg-[#17212b] flex items-center justify-center text-3xl mb-4">💬</div>
            <h3 className="text-white font-medium">Выбери чат</h3>
            <p className="text-sm mt-1 max-w-md">Слева — список каналов и личек. Кликни, чтобы открыть переписку. Поддерживается текст, медиа, reply и forward.</p>
            <div className="mt-6 text-xs bg-[#17212b] rounded-lg px-4 py-3 text-left">
              <div>Подсказка: для проверки канала введи в поиске username, напр. <code className="text-[#40a7e3]">@durov</code></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
