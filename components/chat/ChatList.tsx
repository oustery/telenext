"use client";
import type { Dialog } from "../Messenger";
import { useState } from "react";

function Avatar({ dialog }: { dialog: Dialog }) {
  const [err, setErr] = useState(false);
  const initials = dialog.title.slice(0, 1).toUpperCase();
  const colors = ["#4a9cff", "#34c759", "#ff9500", "#af52de", "#ff3b30", "#5856d6"];
  const idx = Math.abs(dialog.id.split("").reduce((a,c)=>a+c.charCodeAt(0),0)) % colors.length;
  const bg = colors[idx];

  if (dialog.avatar && !err) {
    return <img src={dialog.avatar} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" onError={()=>setErr(true)} />;
  }
  if (err) {
    return <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold shrink-0" style={{background:bg}}>{initials}</div>;
  }
  return (
    <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-[#e9ebef] flex items-center justify-center relative">
      <img src={`/api/telegram/avatar?chatId=${encodeURIComponent(dialog.id)}`} alt="" className="w-full h-full object-cover" onError={()=>setErr(true)} onLoad={()=>{}} />
      {!err && <div className="absolute inset-0 flex items-center justify-center text-white font-semibold" style={{background:bg, opacity:0.9}}>{initials}</div>}
    </div>
  );
}

export default function ChatList({ dialogs, selectedId, onSelect }: { dialogs: Dialog[]; selectedId: string | null; onSelect:(id:string)=>void }) {
  if (!dialogs.length) return null;
  return (
    <div className="py-1">
      {dialogs.map(d => {
        const active = selectedId === d.id;
        return (
          <button
            key={d.id}
            onClick={()=>onSelect(d.id)}
            className={`w-full flex gap-3 px-3 py-2.5 text-left hover:bg-[#f5f7fb] transition ${active ? "bg-[#e8f1ff]" : ""}`}
          >
            <Avatar dialog={d} />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between gap-2">
                <span className="font-medium text-[14px] truncate">{d.title}</span>
                <span className="text-xs text-[#8e8e93] shrink-0">{d.date}</span>
              </div>
              <div className="flex justify-between gap-2 mt-0.5">
                <span className="text-[13px] text-[#5b6b7a] truncate pr-2">{d.lastMessage || (d.isChannel ? "канал" : "нет сообщений")}</span>
                {d.unreadCount>0 && <span className="bg-[#2481cc] text-white text-xs min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">{d.unreadCount}</span>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
