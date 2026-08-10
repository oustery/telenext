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
  const fileRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const firstIdx = useRef(10000);

  const isChannel = dialog.isChannel;

  const loadInitial = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const c = new AbortController();
      const t = setTimeout(()=>c.abort(), 12000);
      const r = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=40`, { signal:c.signal, cache:"no-store" });
      clearTimeout(t);
      const d = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(d.error || `Ошибка ${r.status}`);
      setMessages(d.messages||[]);
      setHasMore(!!d.hasMore);
      firstIdx.current = 10000 - (d.messages?.length||0);
    } catch(e:any) {
      setLoadError(e?.name==="AbortError" ? "Превышено время ожидания" : e?.message || "Не удалось загрузить");
    } finally { setLoading(false); }
  }, [dialog.id]);

  const loadMore = useCallback(async ()=>{
    if (!hasMore || loadingMore || !messages.length) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=40&offsetId=${messages[0].id}`, {cache:"no-store"});
      const d = await r.json().catch(()=>({}));
      if (r.ok && d.messages?.length) {
        setMessages(p=>[...d.messages, ...p]);
        setHasMore(!!d.hasMore);
        firstIdx.current -= d.messages.length;
      } else setHasMore(false);
    } catch {} finally { setLoadingMore(false); }
  }, [dialog.id, messages, hasMore, loadingMore]);

  const pollNew = useCallback(async ()=>{
    if (loading || loadingMore) return;
    try {
      const r = await fetch(`/api/telegram/messages?chatId=${encodeURIComponent(dialog.id)}&limit=20`, {cache:"no-store"});
      if (r.status===429) return;
      const d = await r.json().catch(()=>({}));
      if (r.ok && d.messages?.length) {
        setMessages(prev=>{
          const ids=new Set(prev.map(m=>m.id));
          const max=Math.max(...prev.map(m=>m.id),0);
          const add=d.messages.filter((m:Msg)=>!ids.has(m.id) && m.id>max);
          return add.length? [...prev, ...add] : prev;
        });
      }
    } catch {}
  }, [dialog.id, loading, loadingMore]);

  useEffect(()=>{ setMessages([]); setHasMore(true); firstIdx.current=10000; loadInitial(); }, [loadInitial]);
  useEffect(()=>{ const id=setInterval(()=>{ if(!document.hidden) pollNew(); },6000); return()=>clearInterval(id); }, [pollNew]);

  async function send(retry=false){
    if(!text.trim()||isChannel) return;
    const optimistic: Msg = { id:Date.now(), text:text.trim(), date:new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}), timestamp:Date.now()/1000, out:true };
    const toSend=text.trim();
    setText("");
    setMessages(p=>[...p, optimistic]);
    setSending(true);
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),25000);
      const r=await fetch("/api/telegram/sendMessage",{method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({chatId:dialog.id, message:toSend}), signal:c.signal});
      clearTimeout(t);
      const d=await r.json().catch(()=>({}));
      if(!r.ok){
        if(r.status===429 && (d.error||"").includes("AUTH_KEY_DUPLICATED") && !retry){
          setMessages(p=>p.filter(m=>m.id!==optimistic.id));
          await new Promise(r=>setTimeout(r,2200));
          setText(toSend);
          setTimeout(()=>send(true),0);
          return;
        }
        setMessages(p=>p.filter(m=>m.id!==optimistic.id));
        alert(d.error||"Ошибка отправки");
        setText(toSend);
      } else setTimeout(pollNew,600);
    } catch(e:any){
      if(e?.name==="AbortError"){
        // Не показываем ошибку — сообщение уже в Telegram, просто ждём подтверждения
        setTimeout(pollNew,1500);
      } else {
        setMessages(p=>p.filter(m=>m.id!==optimistic.id));
        alert(e?.message||"Ошибка сети");
        setText(toSend);
      }
    } finally{ setSending(false); }
  }

  async function sendFiles(files: FileList|File[]){
    if(!files.length||isChannel) return;
    setUploading(true);
    for(const f of Array.from(files)){
      if(f.size>50*1024*1024){ alert(`${f.name}: макс 50MB`); continue; }
      const fd=new FormData(); fd.append("chatId", dialog.id); fd.append("file", f);
      try{ const r=await fetch("/api/telegram/sendFile",{method:"POST", body:fd}); if(!r.ok){ const d=await r.json(); alert(d.error); } } catch(e:any){ alert(e.message); }
    }
    setUploading(false); pollNew();
  }

  return (
    <div className="flex flex-col h-full bg-[#f5f7fb]">
      {/* Header — простой */}
      <div className="h-14 px-3 flex items-center gap-3 bg-white border-b border-[#e6e8eb] shrink-0">
        {onBack && <button onClick={onBack} className="md:hidden w-8 h-8 flex items-center justify-center -ml-1 text-[#2481cc]">‹</button>}
        <div className="w-8 h-8 rounded-full bg-[#2481cc] text-white flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
          {dialog.avatar ? <img src={dialog.avatar} alt="" className="w-full h-full object-cover" /> : dialog.title.slice(0,1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate">{dialog.title}</div>
          <div className="text-xs text-[#8e8e93] truncate">{isChannel ? "канал" : dialog.isGroup ? "группа" : "в сети"}{dialog.username?` • @${dialog.username}`:""}</div>
        </div>
      </div>

      {isChannel && (
        <div className="bg-[#fff4e5] text-[#8a6d00] text-xs text-center py-1.5 border-b border-[#ffe9b3]">В каналах можно только читать</div>
      )}

      {/* Messages */}
      <div className="flex-1 relative overflow-hidden bg-[#f5f7fb]">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[#8e8e93]">Загрузка...</div>
        ) : loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-sm font-medium">Не удалось загрузить</div>
            <div className="text-xs text-[#8e8e93] mt-1 max-w-[300px]">{loadError}</div>
            <button onClick={loadInitial} className="mt-3 px-4 py-2 bg-[#2481cc] text-white rounded-full text-sm">Попробовать снова</button>
          </div>
        ) : messages.length===0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
            <div className="w-14 h-14 rounded-full bg-white border border-[#e6e8eb] flex items-center justify-center text-xl mb-3">💬</div>
            <div className="font-medium">Нет сообщений</div>
            <div className="text-sm text-[#8e8e93] mt-1">{isChannel?"Постов пока нет":"Напишите первым"}</div>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            style={{height:"100%"}}
            data={messages}
            firstItemIndex={firstIdx.current}
            initialTopMostItemIndex={Math.max(0,messages.length-1)}
            alignToBottom
            followOutput="smooth"
            startReached={()=>{ if(hasMore&&!loadingMore) loadMore(); }}
            components={{
              Header: () => (
                <div className="flex justify-center py-3">
                  {loadingMore ? <span className="text-xs bg-white border border-[#e6e8eb] px-3 py-1 rounded-full">Загрузка...</span>
                  : hasMore ? <span className="text-xs text-[#8e8e93]">Потяните чтобы загрузить ещё</span>
                  : <span className="text-xs text-[#8e8e93]">Начало истории</span>}
                </div>
              )
            }}
            itemContent={(idx, m)=>(
              <div className={`flex px-3 py-1 ${m.out?"justify-end":"justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-[14px] leading-5 ${m.out ? "bg-[#2481cc] text-white rounded-br-md" : "bg-white border border-[#e6e8eb] rounded-bl-md"}`}>
                  {m.from && !m.out && <div className="text-xs font-semibold text-[#2481cc] mb-0.5">{m.from}</div>}
                  {m.media && m.mediaType==="photo" && <img src={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`} alt="" className="rounded-xl max-h-[300px] mb-1.5 cursor-pointer" onClick={e=>window.open((e.target as HTMLImageElement).src,"_blank")} />}
                  {m.media && m.mediaType==="video" && <video src={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`} controls className="rounded-xl max-h-[300px] mb-1.5" />}
                  {m.media && m.mediaType==="voice" && <audio src={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`} controls className="w-full h-8 mb-1" />}
                  {m.media && m.mediaType==="document" && <a href={`/api/telegram/media?chatId=${encodeURIComponent(dialog.id)}&messageId=${m.id}`} target="_blank" className={`flex items-center gap-2 rounded-lg px-3 py-2 mb-1 ${m.out?"bg-white/20":"bg-[#f0f2f5]"}`}><span>📎</span><span className="text-xs truncate">{m.fileName||"файл"}</span></a>}
                  {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                  <div className={`text-[11px] mt-1 text-right ${m.out?"text-white/70":"text-[#8e8e93]"}`}>{m.date} {m.out?"✓✓":""}</div>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {/* Input — простой */}
      {isChannel ? (
        <div className="bg-white border-t border-[#e6e8eb] p-3 text-center text-sm text-[#8e8e93]">Подписаны на канал • писать могут только администраторы</div>
      ) : (
        <div className="bg-white border-t border-[#e6e8eb] px-3 py-2.5 flex items-end gap-2">
          <input ref={fileRef} type="file" multiple hidden onChange={e=>e.target.files&&sendFiles(e.target.files)} />
          <button onClick={()=>fileRef.current?.click()} disabled={uploading} className="w-9 h-9 rounded-full bg-[#f0f2f5] flex items-center justify-center hover:bg-[#e9ebef] disabled:opacity-50">+</button>
          <textarea
            value={text}
            onChange={e=>{ setText(e.target.value); e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,100)+"px"; }}
            onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); send(); }}}
            placeholder="Сообщение"
            rows={1}
            className="flex-1 bg-[#f0f2f5] rounded-2xl px-4 py-2.5 text-[14px] outline-none resize-none max-h-[100px] placeholder:text-[#8e8e93]"
            style={{height:40}}
          />
          <button onClick={()=>send()} disabled={!text.trim()||sending||uploading} className={`w-9 h-9 rounded-full text-white flex items-center justify-center ${!text.trim()||sending||uploading?"bg-[#a8b4c0]":"bg-[#2481cc] hover:bg-[#1a6fb5]"}`}>↑</button>
        </div>
      )}
    </div>
  );
}
