import type { Metadata, Viewport } from "next";
import { currentUser } from "@/lib/supabase/server";
import { dir, type Lang } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "BOX WOODWORK — ניהול מפעל",
  description: "ניהול ייצור לנגריית רהיטים בהתאמה אישית",
};
export const viewport: Viewport = { themeColor: "#0C0D10", initialScale: 1, width: "device-width" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  const lang = (me?.lang ?? "he") as Lang;

  return (
    <html lang={lang} dir={dir(lang)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&family=Heebo:wght@200;300;400;500;700&family=IBM+Plex+Mono:wght@400;500;600&family=Rubik:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
