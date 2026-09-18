import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Muvment Driver",
  description: "Installable driver portal for Muvment shifts, charging, and payments.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Muvment",
  },
  applicationName: "Muvment Driver",
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: "/icon-512.png",
    icon: "/icon-512.png",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
