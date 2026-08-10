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
        throw new Error(data.error || "Ошибка загрузки");
      }
      setDialogs(data.dialogs || []);
    } catch (e: any) {
      setError(e.message || "Нет соединения");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDialogs(true); }, []);
  useEffect(() => {
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
      list = list.filter(d => d.title.toLowerCase().includes(q) || d.username?.toLowerCase().includes(q));
    }
    return list;
  }, [dialogs, activeTab, search]);

  const selected = dialogs.find(d => d.id === selectedId) || null;

  return (
    <div className="flex h-[100dvh] bg-[#f5f7fb] text-[#0f1419] overflow-hidden">
      {/* Sidebar */}
      <div className={`flex flex-col bg-white border-r border-[#e6e8eb] w-full md:w-[360px] md:min-w-[320px] shrink-0 ${selected ? "hidden md:flex" : "flex"}`}>
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-[#f0f2f5]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-[20px] font-bold tracking-tight">Чаты</h1>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href="/login"; }} className="text-[13px] text-[#2481cc] hover:text-[#1a6fb5]">Выйти</button>
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск"
              className="w-full bg-[#f0f2f5] rounded-full pl-9 pr-9 py-2.5 text-[14px] outline-none placeholder:text-[#8e8e93] focus:bg-[#e9ebef] transition"
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full hover:bg-black/5 flex items-center justify-center text-[#8e8e93]">✕</button>}
          </div>
        </div>

        {/* Tabs — простые, понятные */}
        <div className="px-2 py-2 flex gap-1 overflow-x-auto scrollbar-none border-b border-[#f0f2f5]">
          {TABS.map(t => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition ${active ? "bg-[#2481cc] text-white" : "text-[#5b6b7a] hover:bg-[#f0f2f5]"}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-14 bg-[#f0f2f5] rounded-xl animate-pulse" />)}
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={() => loadDialogs(true)} className="mt-3 text-sm text-[#2481cc]">Попробовать снова</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#8e8e93]">Нет чатов</div>
          ) : (
            <ChatList dialogs={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>
      </div>

      {/* Chat */}
      <div className={`flex-1 flex flex-col bg-[#f5f7fb] min-w-0 ${!selected ? "hidden md:flex" : "flex"}`}>
        {selected ? (
          <ChatView dialog={selected} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="flex-1 hidden md:flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-[#e6e8eb] flex items-center justify-center text-2xl mb-4">💬</div>
            <div className="font-semibold">Выберите чат</div>
            <div className="text-sm text-[#8e8e93] mt-1 max-w-sm">Откройте диалог слева чтобы начать общение. Каналы — только для чтения.</div>
          </div>
        )}
      </div>
    </div>
  );
}
