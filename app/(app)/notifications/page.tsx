"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BellOff, BellRing, CheckCheck, CircleAlert, Info, Volume2, VolumeX, Zap } from "lucide-react";
import { useRealtimeStatus } from "../../components/RealtimeProvider";
import { EmptyState, Spinner } from "../../components/Ui";
import { notificationTarget } from "../../lib/notification-link";
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from "../../lib/queries";
import { setSoundEnabled, unlockSound, useSoundEnabled } from "../../lib/sound";
import { dayLabel, timeAgo } from "../../lib/time";
import type { AppNotification, NotificationPriority } from "../../lib/types";

const ICON: Record<NotificationPriority, typeof Info> = { LOW: Info, MEDIUM: BellRing, HIGH: Zap, URGENT: CircleAlert };

/** Re-renders every 30s so "2 min ago" keeps moving. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const subscribeNoop = () => () => {};
function useAlertPermission() {
  return useSyncExternalStore(
    subscribeNoop,
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "unsupported",
  );
}

function Item({ n, now, onOpen }: { n: AppNotification; now: number; onOpen: (n: AppNotification) => void }) {
  const Icon = ICON[n.priority] ?? Info;
  return (
    <li>
      <button className={`nt-item p-${n.priority.toLowerCase()} ${n.is_read ? "" : "unread"}`} type="button" onClick={() => onOpen(n)}>
        <span className="nt-icon">
          <Icon size={18} />
        </span>
        <span className="nt-body">
          <strong>{n.title}</strong>
          <span>{n.description}</span>
          <small>{timeAgo(n.created_at, now)}</small>
        </span>
        {n.is_read ? null : <i className="nt-dot" aria-label="Unread" />}
      </button>
    </li>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const list = useNotifications(unreadOnly);
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const live = useRealtimeStatus();
  const soundOn = useSoundEnabled();
  const [, bump] = useState(0);
  const permission = useAlertPermission();
  const now = useNow();

  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const groups = useMemo(() => {
    const map = new Map<string, AppNotification[]>();
    for (const n of items) {
      const label = dayLabel(n.created_at, now);
      map.set(label, [...(map.get(label) ?? []), n]);
    }
    return [...map.entries()];
  }, [items, now]);

  const unreadCount = unread.data ?? 0;
  const open = (n: AppNotification) => {
    if (!n.is_read) markRead.mutate(n.id);
    const target = notificationTarget(n);
    if (target !== "/notifications") router.push(target);
  };

  return (
    <div className="screen-enter nt">
      <div className="nt-bar">
        <span className={`nt-live ${live}`}>
          <i /> {live === "live" ? "Live" : live === "connecting" ? "Connecting…" : "Reconnecting…"}
        </span>
        <div className="nt-tools">
          <button
            aria-label={soundOn ? "Mute notification sound" : "Turn on notification sound"}
            aria-pressed={soundOn}
            className="icon-button plain"
            type="button"
            onClick={() => {
              setSoundEnabled(!soundOn);
              if (!soundOn) unlockSound();
            }}
          >
            {soundOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button className="nt-readall" disabled={unreadCount === 0 || markAll.isPending} type="button" onClick={() => markAll.mutate()}>
            <CheckCheck size={16} /> Mark all read
          </button>
        </div>
      </div>

      <div className="nt-tabs" role="tablist">
        <button aria-selected={!unreadOnly} role="tab" type="button" onClick={() => setUnreadOnly(false)}>
          All
        </button>
        <button aria-selected={unreadOnly} role="tab" type="button" onClick={() => setUnreadOnly(true)}>
          Unread{unreadCount ? <b>{unreadCount > 99 ? "99+" : unreadCount}</b> : null}
        </button>
      </div>

      {permission === "default" ? (
        <div className="nt-permission">
          <BellRing size={20} />
          <div>
            <strong>Get alerts even when the app is closed</strong>
            <span>Payments, pick-up approvals and drop-off reminders, right when they happen.</span>
          </div>
          <button type="button" onClick={() => void Notification.requestPermission().then(() => bump((n) => n + 1))}>
            Turn on
          </button>
        </div>
      ) : permission === "denied" ? (
        <p className="nt-note">
          <BellOff size={14} /> Alerts are blocked in your browser settings, so you&apos;ll only see them inside the app.
        </p>
      ) : null}

      {list.isPending ? (
        <ul className="nt-list" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <li className="nt-skeleton" key={i} />
          ))}
        </ul>
      ) : list.isError ? (
        <EmptyState icon={<CircleAlert size={30} />} title="Couldn't load notifications">
          <button className="ghost-button" type="button" onClick={() => void list.refetch()}>
            Try again
          </button>
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon={<BellRing size={30} />} title={unreadOnly ? "Nothing unread" : "You're all caught up"}>
          New alerts about payments, charging and your vehicle will show up here the moment they happen.
        </EmptyState>
      ) : (
        <>
          {groups.map(([label, group]) => (
            <section key={label}>
              <h3 className="nt-day">{label}</h3>
              <ul className="nt-list">
                {group.map((n) => (
                  <Item key={n.id} n={n} now={now} onOpen={open} />
                ))}
              </ul>
            </section>
          ))}
          {list.hasNextPage ? (
            <button className="ghost-button" disabled={list.isFetchingNextPage} type="button" onClick={() => void list.fetchNextPage()}>
              {list.isFetchingNextPage ? <Spinner /> : null} Load older
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
