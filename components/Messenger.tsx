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
  avatar?: string | null;
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
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("all");

  async function loadDialogs(showLoader = false) {
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/dialogs", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { location.href = "/login"; return; }
        throw new Error(data.error || "Ошибка загрузки чатов");
      }
      setDialogs(data.dialogs || []);
    } catch (e: any) {
      setError(e.message || "Нет соединения. Потяни чтобы обновить");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDialogs(true); }, []);
  useEffect(() => {
    // Уменьшили частоту чтобы не триггерить AUTH_KEY_DUPLICATED параллельными коннектами
    const id = setInterval(() => loadDialogs(false), 8000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    let list = dialogs;
    if (activeTab === "personal") list = list.filter(d => !d.isChannel && !d.isGroup);
    else if (activeTab === "groups") list = list.filter(d => d.isGroup);
    else if (activeTab === "channels") list = list.filter(d => d.isChannel);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => d.title.toLowerCase().includes(q) || d.username?.toLowerCase().includes(q) || d.lastMessage?.toLowerCase().includes(q));
    }
    return list;
  }, [dialogs, activeTab, search]);

  const selected = dialogs.find(d => d.id === selectedId) || null;

  const counts = useMemo(() => ({
    all: dialogs.length,
    personal: dialogs.filter(d => !d.isChannel && !d.isGroup).length,
    groups: dialogs.filter(d => d.isGroup).length,
    channels: dialogs.filter(d => d.isChannel).length,
  }), [dialogs]);

  return (
    <div className="flex h-[100dvh] bg-[#f5f5f5] dark:bg-[#0f1419] text-[#0f1419] dark:text-white overflow-hidden antialiased selection:bg-[#40a7e3]/30">
      <style>{`
        @supports (padding: max(0px)) {
          .safe-top { padding-top: max(12px, env(safe-area-inset-top)); }
          .safe-bottom { padding-bottom: max(8px, env(safe-area-inset-bottom)); }
        }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Sidebar */}
      <div className={`
        flex flex-col bg-white dark:bg-[#17212b] border-r border-black/[0.06] dark:border-white/[0.06]
        w-full md:w-[380px] md:min-w-[340px] md:max-w-[420px] shrink-0
        ${selected ? "hidden md:flex" : "flex"}
      `}>
        {/* Header */}
        <div className="shrink-0 sticky top-0 z-10 bg-white/90 dark:bg-[#17212b]/90 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.06] safe-top">
          <div className="px-3 pt-3 pb-2.5 flex items-center gap-2.5">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93] dark:text-[#7d8b99] pointer-events-none">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              </span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск"
                className="w-full bg-[#f0f2f5] dark:bg-[#25303e] rounded-[10px] pl-9 pr-9 py-[9px] text-[15px] leading-none outline-none placeholder:text-[#8e8e93] dark:placeholder:text-[#7d8b99] focus:bg-[#e6e8eb] dark:focus:bg-[#2a3a4d] transition"
              />
              {search ? (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/10 dark:bg-white/15 flex items-center justify-center hover:bg-black/15 dark:hover:bg-white/20 transition">
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              ) : null}
            </div>
            <button className="w-9 h-9 rounded-full bg-[#0a84ff] dark:bg-[#40a7e3] text-white flex items-center justify-center shadow-sm active:scale-95 transition shrink-0" aria-label="Новое сообщение">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
            </button>
          </div>

          {/* Tabs — fixed to not cut last tab */}
          <div className="pl-3 pr-1 pb-2.5 -mr-1">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none snap-x snap-mandatory pr-3">
              {TABS.map(t => {
                const active = activeTab === t.id;
                const count = counts[t.id];
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`snap-start shrink-0 flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[13px] font-medium whitespace-nowrap transition ${
                      active
                        ? "bg-[#0f1419] dark:bg-white text-white dark:text-[#0f1419] shadow-sm"
                        : "bg-[#f0f2f5] dark:bg-white/[0.08] text-[#636366] dark:text-[#a8b3c0] hover:bg-black/5 dark:hover:bg-white/[0.12]"
                    }`}
                  >
                    {t.label}
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center tabular-nums ${active ? "bg-white/20 dark:bg-black/10" : "bg-black/[0.06] dark:bg-white/10"}`}>{count}</span>
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
          ) : error ? (
            <div className="p-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-3">!</div>
              <div className="text-[14px] font-medium text-red-600 dark:text-red-400">{error}</div>
              <button onClick={() => loadDialogs(true)} className="mt-3 px-4 py-2 rounded-full bg-[#0a84ff] text-white text-sm">Попробовать снова</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#f0f2f5] dark:bg-white/5 flex items-center justify-center text-2xl mb-3">💬</div>
              <div className="text-[15px] font-medium">Нет чатов</div>
              <div className="text-[13px] text-[#8e8e93] dark:text-[#7d8b99] mt-1">Попробуй другой запрос или вкладку</div>
              {search && <button onClick={() => setSearch("")} className="mt-3 text-sm text-[#0a84ff]">Сбросить поиск</button>}
            </div>
          ) : (
            <ChatList dialogs={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>

        <div className="shrink-0 px-3 py-2.5 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between text-[11px] text-[#8e8e93] dark:text-[#7d8b99] bg-white/50 dark:bg-[#17212b]/50 backdrop-blur safe-bottom">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#34c759] animate-pulse" /> TeleNext • MTProto</span>
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/login"; }} className="px-3 py-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition">Выйти</button>
        </div>
      </div>

      {/* Chat */}
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
      </div>
    </div>
  );
}
