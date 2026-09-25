import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import { Zap } from "lucide-react";
import type { ReactNode } from "react";
import { auth } from "../auth";
import { Providers } from "./components/Providers";
import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  title: "EV Muvment Driver",
  description: "Driver application and authentication PWA for EV Muvment.",
  appleWebApp: {
    capable: true,
    // "default" keeps the iOS status bar opaque with text that follows light/dark. "black-translucent"
    // would draw white text over our light background.
    statusBarStyle: "default",
    title: "EV Driver",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  // No `themeColor` here on purpose: Next re-inserts its own tags on navigation. Instead the theme
  // script below owns a single <meta name="theme-color"> that always matches the app theme.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Runs before first paint so the saved (or system) theme never flashes.
const themeScript = `(function(){try{var t=localStorage.getItem("ev_muvment_theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m)}m.content=t==="dark"?"#04060b":"#f6f8fd"}catch(e){}})()`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en" data-theme="light" className={roboto.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <main className="app-shell">
          <section className="desktop-block">
            <div className="brand-mark">
              <Zap size={30} fill="currentColor" />
            </div>
            <h1>Mobile only</h1>
            <p>EV Muvment Driver is designed as a phone-first PWA. Please open it on an Android phone or iPhone.</p>
          </section>
          <div className="phone-app">
            <Providers session={session}>{children}</Providers>
          </div>
        </main>
      </body>
    </html>
  );
}
