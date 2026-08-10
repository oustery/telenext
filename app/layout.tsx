import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TeleNext — Telegram на Next.js",
  description: "Веб-клиент Telegram на MTProto (API_ID/API_HASH)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="antialiased bg-[#17212b] text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
