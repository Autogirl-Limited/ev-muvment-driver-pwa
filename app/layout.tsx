import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Zap } from "lucide-react";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "EV Muvment Driver",
  description: "Driver application and authentication PWA for EV Muvment.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EV Driver",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fd" },
    { media: "(prefers-color-scheme: dark)", color: "#05070d" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Runs before first paint so the saved (or system) theme never flashes.
const themeScript = `(function(){try{var t=localStorage.getItem("ev_muvment_theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" className={inter.variable} suppressHydrationWarning>
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
          <div className="phone-app">{children}</div>
        </main>
      </body>
    </html>
  );
}
