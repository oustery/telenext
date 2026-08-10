"use client";
import { useEffect, useState, useMemo } from "react";
import ChatList from "./chat/ChatList";
import ChatView from "./chat/ChatView";

export type Dialog = {
  id: string;
  title: string;
  username?: string;
  lastMessage?: string;
  unreadCount: number;
  isChannel: boolean;
  isGroup: boolean;
  date?: string;
};

type Tab = "all" | "personal" | "groups" | "channels";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "personal", label: "Личные" },
  { id: "groups", label: "Группы" },
  { id: "channels", label: "Каналы" },
];

export default function Messenger() {
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("all");

  async function loadDialogs() {
    try {
      const res = await fetch("/api/telegram/dialogs");
      const data = await res.json();
      if (res.ok) setDialogs(data.dialogs || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadDialogs(); }, []);
  useEffect(() => {
    const id = setInterval(loadDialogs, 4000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    let list = dialogs;
    // Tab filter
    if (activeTab === "personal") list = list.filter(d => !d.isChannel && !d.isGroup);
    else if (activeTab === "groups") list = list.filter(d => d.isGroup);
    else if (activeTab === "channels") list = list.filter(d => d.isChannel);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => d.title.toLowerCase().includes(q) || d.username?.toLowerCase().includes(q) || d.lastMessage?.toLowerCase().includes(q));
    }
    return list;
  }, [dialogs, activeTab, search]);

  const selected = dialogs.find(d => d.id === selectedId) || null;

  // counts for tabs
  const counts = useMemo(() => ({
    all: dialogs.length,
    personal: dialogs.filter(d => !d.isChannel && !d.isGroup).length,
    groups: dialogs.filter(d => d.isGroup).length,
    channels: dialogs.filter(d => d.isChannel).length,
  }), [dialogs]);

  return (
    <div className="flex h-[100dvh] bg-[#f5f5f5] dark:bg-[#0f1419] text-[#0f1419] dark:text-white overflow-hidden antialiased selection:bg-[#40a7e3]/30">
      {/* CSS for iOS safe area and native feel */}
      <style>{`
        @supports (padding: max(0px)) {
          .safe-top { padding-top: max(12px, env(safe-area-inset-top)); }
          .safe-bottom { padding-bottom: max(8px, env(safe-area-inset-bottom)); }
        }
      `}</style>

      {/* Sidebar — на мобилке скрывается когда выбран чат */}
      <div className={`
        flex flex-col bg-white dark:bg-[#17212b] border-r border-black/[0.06] dark:border-white/[0.06]
        w-full md:w-[380px] md:min-w-[340px] md:max-w-[420px] shrink-0
        ${selected ? "hidden md:flex" : "flex"}
      `}>
        {/* Header — iOS style */}
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-[#17212b]/80 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.06] safe-top">
          <div className="px-3 pt-2 pb-3 flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск"
                className="w-full bg-[#f0f2f5] dark:bg-[#25303e] rounded-[10px] px-4 py-[9px] pl-9 text-[15px] leading-none outline-none placeholder:text-[#8e8e93] dark:placeholder:text-[#7d8b99] focus:bg-[#e6e8eb] dark:focus:bg-[#2b5278]/30 transition"
              />
              <span className="absolute left-3 top-[10px] text-[#8e8e93] dark:text-[#7d8b99] text-[13px]">⌕</span>
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-[7px] w-6 h-6 rounded-full bg-black/10 dark:bg-white/15 flex items-center justify-center text-xs">✕</button>
              )}
            </div>
            <button className="w-9 h-9 rounded-full bg-[#40a7e3] text-white flex items-center justify-center shadow-sm active:scale-95 transition">✎</button>
          </div>

          {/* Tabs — iOS segmented */}
          <div className="px-3 pb-3">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
              {TABS.map(t => {
                const active = activeTab === t.id;
                const count = counts[t.id];
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[13px] font-medium whitespace-nowrap transition ${
                      active
                        ? "bg-[#0f1419] dark:bg-white text-white dark:text-[#0f1419] shadow-sm"
                        : "bg-[#f0f2f5] dark:bg-white/[0.08] text-[#636366] dark:text-[#a8b3c0] hover:bg-black/5 dark:hover:bg-white/[0.12]"
                    }`}
                  >
                    {t.label}
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${active ? "bg-white/20 dark:bg-black/10" : "bg-black/[0.06] dark:bg-white/10"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/10" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 bg-black/5 dark:bg-white/10 rounded w-1/3" />
                    <div className="h-3 bg-black/5 dark:bg-white/10 rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#f0f2f5] dark:bg-white/5 flex items-center justify-center text-2xl mb-3">💬</div>
              <div className="text-[15px] font-medium">Нет чатов</div>
              <div className="text-[13px] text-[#8e8e93] dark:text-[#7d8b99] mt-1">Попробуй другой запрос или вкладку</div>
            </div>
          ) : (
            <ChatList dialogs={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>

        {/* Footer — iOS bottom safe area */}
        <div className="px-3 py-2.5 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between text-[11px] text-[#8e8e93] dark:text-[#7d8b99] bg-white/50 dark:bg-[#17212b]/50 backdrop-blur safe-bottom">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#34c759] animate-pulse" /> TeleNext • MTProto</span>
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/login"; }} className="px-3 py-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition">Выйти</button>
        </div>
      </div>

      {/* Chat — на мобилке оверлей */}
      <div className={`flex-1 flex flex-col bg-[#e7ebf0] dark:bg-[#0e1621] relative min-w-0 ${!selected ? "hidden md:flex" : "flex"}`}>
        {selected ? (
          <ChatView dialog={selected} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="flex-1 hidden md:flex flex-col items-center justify-center text-center p-8">
            <div className="w-28 h-28 rounded-[28px] bg-white dark:bg-[#17212b] shadow-sm border border-black/5 dark:border-white/5 flex items-center justify-center text-4xl mb-5">✈️</div>
            <h3 className="text-[17px] font-semibold text-[#0f1419] dark:text-white">Выбери чат</h3>
            <p className="text-[14px] text-[#636366] dark:text-[#7d8b99] mt-1.5 max-w-[360px] leading-5">Начни общение — выбери диалог слева. Поддерживаются текст, фото, видео, файлы. В каналах писать нельзя.</p>
            <div className="mt-6 inline-flex items-center gap-2 text-[12px] bg-white dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-full px-4 py-2 text-[#636366] dark:text-[#a8b3c0]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#40a7e3]" /> Нажми <code className="bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-[#0f1419] dark:text-white">@durov</code> в поиске
            </div>
          </div>
        )}
        {/* Мобилка: пустой state когда нет чата но sidebar скрыт — не показываем, показываем список */}
      </div>
    </div>
  );
}
