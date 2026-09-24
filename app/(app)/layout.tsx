import type { ReactNode } from "react";
import { AppHeader } from "../components/AppHeader";
import { BottomNav } from "../components/BottomNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame">
      <AppHeader />
      <div className="app-content">{children}</div>
      <BottomNav />
    </div>
  );
}
