"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

type Step = "phone" | "code" | "2fa" | "qr" | "qr2fa" | "done";
type Tab = "phone" | "qr";

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("phone");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // QR state
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrHint, setQrHint] = useState<string | null>(null);
  const [qrPassword, setQrPassword] = useState("");
  const pollRef = useRef<number | null>(null);

  async function sendCode() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/sendCode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка отправки кода");
      setPhoneCodeHash(data.phoneCodeHash);
      setStep("code");
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  async function signIn() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/signIn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, phoneCodeHash, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.need2FA) { setStep("2fa"); return; }
        throw new Error(data.error || "Неверный код");
      }
      if (data.need2FA) { setStep("2fa"); return; }
      setStep("done");
      router.push("/");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  async function signIn2FA() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/signIn2FA", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Неверный пароль 2FA");
      router.push("/");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  async function startQr() {
    setLoading(true); setError(null);
    setQrUrl(null); setQrSessionId(null);
    try {
      const res = await fetch("/api/auth/qr/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка QR");
      setQrUrl(data.qrUrl);
      setQrSessionId(data.sessionId);
      setStep("qr");
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  // Poll QR status
  useEffect(() => {
    if (step !== "qr" && step !== "qr2fa") return;
    if (!qrSessionId) return;
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/qr/status?sessionId=${qrSessionId}`);
        const data = await res.json();
        if (data.qrUrl && data.qrUrl !== qrUrl) setQrUrl(data.qrUrl);
        if (data.status === "success") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          router.push("/");
          router.refresh();
        } else if (data.status === "needs2fa") {
          setQrHint(data.hint || "");
          setStep("qr2fa");
        } else if (data.status === "error") {
          setError(data.error || "QR ошибка");
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      } catch {}
    }, 1500);
    pollRef.current = id;
    return () => window.clearInterval(id);
  }, [qrSessionId, step, qrUrl, router]);

  async function submitQr2FA() {
    if (!qrSessionId || !qrPassword) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/qr/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: qrSessionId, password: qrPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep("qr");
      setQrPassword("");
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#17212b] p-4">
      <div className="w-full max-w-md bg-[#0e1621] rounded-2xl p-8 shadow-2xl border border-white/5">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-[#2b5278] rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">✈️</div>
          <h1 className="text-2xl font-bold">TeleNext</h1>
          <p className="text-sm text-[#a8b3c0] mt-1">Вход через Telegram MTProto</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#17212b] rounded-full p-1 mb-6 text-sm">
          <button
            onClick={() => { setTab("phone"); setStep("phone"); setError(null); }}
            className={`flex-1 py-2 rounded-full font-medium transition ${tab === "phone" ? "bg-[#2b5278] text-white" : "text-[#a8b3c0] hover:text-white"}`}
          >
            По номеру
          </button>
          <button
            onClick={() => { setTab("qr"); setError(null); startQr(); }}
            className={`flex-1 py-2 rounded-full font-medium transition ${tab === "qr" ? "bg-[#2b5278] text-white" : "text-[#a8b3c0] hover:text-white"}`}
          >
            По QR-коду
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {tab === "phone" && step === "phone" && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[#a8b3c0]">Номер телефона</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+375 29 123 45 67"
                className="w-full mt-1 bg-[#17212b] border border-[#2b5278]/50 rounded-lg px-4 py-3 outline-none focus:border-[#40a7e3] text-white placeholder:text-[#5a6d7e]"
              />
              <p className="text-xs text-[#5a6d7e] mt-2">Формат: +375291234567, как в Telegram</p>
            </div>
            <button
              onClick={sendCode}
              disabled={!phone || loading}
              className="w-full bg-[#2b5278] hover:bg-[#325d8a] disabled:opacity-50 text-white rounded-lg py-3 font-medium transition"
            >
              {loading ? "Отправка..." : "Получить код"}
            </button>
          </div>
        )}

        {tab === "phone" && step === "code" && (
          <div className="space-y-4">
            <p className="text-sm text-[#a8b3c0]">Код отправлен на <span className="text-white font-medium">{phone}</span></p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="12345"
              className="w-full bg-[#17212b] border border-[#2b5278]/50 rounded-lg px-4 py-3 outline-none focus:border-[#40a7e3] text-center text-2xl tracking-[0.4em]"
              maxLength={5}
            />
            <button
              onClick={signIn}
              disabled={!code || loading}
              className="w-full bg-[#2b5278] hover:bg-[#325d8a] disabled:opacity-50 text-white rounded-lg py-3 font-medium"
            >
              {loading ? "Проверка..." : "Войти"}
            </button>
            <button onClick={() => setStep("phone")} className="w-full text-sm text-[#40a7e3] hover:underline">Изменить номер</button>
          </div>
        )}

        {tab === "phone" && step === "2fa" && (
          <div className="space-y-4">
            <p className="text-sm text-[#a8b3c0]">Включена двухфакторка. Введи пароль:</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль 2FA"
              className="w-full bg-[#17212b] border border-[#2b5278]/50 rounded-lg px-4 py-3 outline-none focus:border-[#40a7e3]"
            />
            <button
              onClick={signIn2FA}
              disabled={!password || loading}
              className="w-full bg-[#2b5278] hover:bg-[#325d8a] disabled:opacity-50 text-white rounded-lg py-3 font-medium"
            >
              {loading ? "Проверка..." : "Подтвердить"}
            </button>
          </div>
        )}

        {tab === "qr" && (step === "qr" || loading && !qrUrl) && (
          <div className="space-y-4 text-center">
            {!qrUrl ? (
              <div className="py-8 text-[#a8b3c0] text-sm">Генерация QR...</div>
            ) : (
              <>
                <div className="bg-white p-4 rounded-xl inline-block">
                  <QRCodeSVG value={qrUrl} size={220} />
                </div>
                <p className="text-sm text-[#a8b3c0]">Открой Telegram на телефоне → Настройки → Устройства → Связать устройство → наведи на QR</p>
                <p className="text-xs text-[#5a6d7e] break-all">{qrUrl.slice(0, 60)}...</p>
                <button onClick={startQr} className="text-sm text-[#40a7e3] hover:underline">Обновить QR</button>
                <div className="text-xs text-[#5a6d7e]">QR обновится автоматически каждые 30 сек. Ожидание сканирования...</div>
              </>
            )}
          </div>
        )}

        {tab === "qr" && step === "qr2fa" && (
          <div className="space-y-4">
            <p className="text-sm text-[#a8b3c0]">QR требует пароль 2FA {qrHint ? `(подсказка: ${qrHint})` : ""}:</p>
            <input
              type="password"
              value={qrPassword}
              onChange={(e) => setQrPassword(e.target.value)}
              placeholder="Пароль 2FA"
              className="w-full bg-[#17212b] border border-[#2b5278]/50 rounded-lg px-4 py-3 outline-none focus:border-[#40a7e3]"
            />
            <button
              onClick={submitQr2FA}
              disabled={!qrPassword || loading}
              className="w-full bg-[#2b5278] hover:bg-[#325d8a] disabled:opacity-50 text-white rounded-lg py-3 font-medium"
            >
              {loading ? "Проверка..." : "Подтвердить 2FA"}
            </button>
            <button onClick={() => setStep("qr")} className="w-full text-sm text-[#5a6d7e] hover:text-white">Назад к QR</button>
          </div>
        )}

        <div className="mt-8 text-xs text-center text-[#5a6d7e]">
          Работает на <span className="text-[#a8b3c0]">API_ID / API_HASH</span> • Сессия шифруется AES-256-GCM
        </div>
      </div>
    </div>
  );
}
