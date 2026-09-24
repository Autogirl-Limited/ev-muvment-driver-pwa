"use client";

import { LogOut } from "lucide-react";
import { useLogout } from "../lib/queries";
import { ConfirmDialog } from "./Modal";

/** The single "are you sure?" step for signing out; used wherever a Log out action exists. */
export function LogoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const logout = useLogout();
  return (
    <ConfirmDialog
      confirmLabel={logout.isPending ? "Signing out…" : "Log out"}
      description="You'll need to sign in again to get back to your account."
      icon={<LogOut size={26} />}
      loading={logout.isPending}
      open={open}
      title="Log out?"
      tone="danger"
      onClose={onClose}
      onConfirm={() => logout.mutate()}
    />
  );
}
