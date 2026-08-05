"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Notification bell — shows unread count, opens a dropdown of recent notifications.
 * Click a notification → marks it read + goes to its link.
 */
export default function NotificationBell() {
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifs(data.notifications || []);
        setUnread(data.unread || 0);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(timer);
  }, []);

  async function markRead(id) {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotifs((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: "yes" } : n))
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* silent */
    }
  }

  async function markAllRead() {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifs((prev) => prev.map((n) => ({ ...n, read: "yes" })));
      setUnread(0);
    } catch {
      /* silent */
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="notif-bell"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && <span className="badge">{unread}</span>}
      </button>

      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-dropdown">
            <div className="notif-head">
              <b>Notifications</b>
              {unread > 0 && (
                <button className="link-btn" onClick={markAllRead}>
                  Mark all read
                </button>
              )}
            </div>
            <div className="notif-list">
              {loading ? (
                <p className="brief">Loading…</p>
              ) : notifs.length === 0 ? (
                <p className="brief">No notifications yet.</p>
              ) : (
                notifs.map((n) => {
                  const isUnread = n.read !== "yes";
                  return (
                    <Link
                      key={n.id}
                      href={n.link || "#"}
                      className={`notif-item ${isUnread ? "unread" : ""}`}
                      onClick={() => {
                        if (isUnread) markRead(n.id);
                        setOpen(false);
                      }}
                    >
                      <p>{n.message}</p>
                      <span className="notif-time">
                        {new Date(n.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
