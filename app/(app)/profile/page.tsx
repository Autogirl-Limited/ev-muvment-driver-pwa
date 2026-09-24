"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { AtSign, LogOut, Mail, Phone, User } from "lucide-react";
import { LogoutDialog } from "../../components/LogoutDialog";

export default function ProfilePage() {
  const { data: session } = useSession();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const user = session?.profile?.user;
  if (!user) return null;

  const initials = `${user.first_name[0] ?? ""}${user.last_name[0] ?? ""}`.toUpperCase();
  const rows = [
    { icon: AtSign, label: "Username", value: user.username },
    { icon: Mail, label: "Email", value: user.email },
    { icon: Phone, label: "Phone", value: user.phone_number },
  ];

  return (
    <div className="screen-enter">
      <section className="home">
        <div className="profile-head">
          <span className="avatar large">{initials || <User size={28} />}</span>
          <h2>{user.first_name} {user.last_name}</h2>
          <span className={`pill ${user.shift ? "pill-live" : ""}`}>
            <i /> {user.shift ? "On shift" : "Off shift"}
          </span>
        </div>

        <section className="panel list-panel">
          {rows.map(({ icon: Icon, label, value }) => (
            <div className="list-row" key={label}>
              <span className="list-icon"><Icon size={18} /></span>
              <div>
                <small>{label}</small>
                <strong>{value || "Not provided"}</strong>
              </div>
            </div>
          ))}
        </section>

        <button className="ghost-button danger" type="button" onClick={() => setConfirmingLogout(true)}>
          <LogOut size={18} /> Log out
        </button>
        <LogoutDialog open={confirmingLogout} onClose={() => setConfirmingLogout(false)} />
      </section>
    </div>
  );
}
