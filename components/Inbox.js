"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Two-pane inbox. Left: the conversation list (reloads every 20s). Right:
 * the open thread with a composer. Opening a thread marks incoming messages
 * read (the API does that on fetch) and refreshes the list so the badge drops.
 *
 * Props: meId (signed-in user id), initialTo (?to= target to open on load).
 */
export default function Inbox({ meId, initialTo = "" }) {
  const [conversations, setConversations] = useState(null); // null = loading
  const [active, setActive] = useState(initialTo || ""); // partnerId of open thread
  const [thread, setThread] = useState(null); // { partner, messages[] }
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [convError, setConvError] = useState("");
  const bottomRef = useRef(null);
  const latestReq = useRef(0); // sequence guard for loadThread race

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setConversations(data.conversations || []);
      setConvError("");
    } catch {
      setConversations((prev) => prev ?? []); // keep stale list, stop "loading"
      setConvError("Couldn't load conversations.");
    }
  }, []);

  // Load the conversation list on mount + every 20s (badge stays fresh).
  useEffect(() => {
    loadConversations();
    const timer = setInterval(loadConversations, 20000);
    return () => clearInterval(timer);
  }, [loadConversations]);

  // Load (and thereby mark-read) the open thread. Also syncs the list so the
  // unread badge drops immediately after opening.
  const loadThread = useCallback(
    async (partnerId) => {
      if (!partnerId) return;
      const seq = ++latestReq.current;
      setErr("");
      try {
        const res = await fetch(`/api/messages?with=${encodeURIComponent(partnerId)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setErr(d.error || "Couldn't load this conversation.");
          setThread(null);
          return;
        }
        const data = await res.json();
        if (seq !== latestReq.current) return; // stale response
        setThread(data);
        setActive(partnerId);
        loadConversations();
      } catch {
        if (seq !== latestReq.current) return;
        setErr("Network error. Please try again.");
      }
    },
    [loadConversations]
  );

  // Open a conversation from ?to= / after sending / when clicking a row.
  useEffect(() => {
    if (initialTo) loadThread(initialTo);
  }, [initialTo, loadThread]);

  // Scroll new messages into view (also on conversation switch, even when the
  // new thread happens to have the same message count as the previous one).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active, thread?.messages?.length]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || !active) return;
    const targetId = active; // the thread this message is being sent to
    setSending(true);
    setErr("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: targetId, body: text.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || "Couldn't send. Try again.");
        setSending(false);
        return;
      }
      setText("");
      setSending(false);
      // Append the sent message only if that conversation is still open — the
      // user may have switched threads while the POST was in flight.
      setThread((prev) =>
        prev && prev.partner?.id === targetId
          ? { ...prev, messages: [...prev.messages, data.message] }
          : prev
      );
      loadConversations();
    } catch {
      setSending(false);
      setErr("Network error. Please try again.");
    }
  }

  // Human-ish time label: "3:42 PM" today, "Aug 5" otherwise.
  function fmtWhen(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="inbox">
      {/* ── Conversation list ─────────────────────────────────────────── */}
      <div className="conv-list">
        {convError && <p className="brief">{convError}</p>}
        {conversations === null ? (
          <p className="brief">Loading conversations…</p>
        ) : conversations.length === 0 ? (
          <p className="brief" style={{ padding: 14 }}>
            No conversations yet. Open a creator&apos;s profile and hit{" "}
            <b>Message</b> to start chatting.
          </p>
        ) : (
          conversations.map((c) => {
            const isActive = c.partnerId === active;
            const initial = (c.name || c.username || "S")[0].toUpperCase();
            return (
              <button
                key={c.partnerId}
                className={`conv-row ${isActive ? "active" : ""}`}
                onClick={() => loadThread(c.partnerId)}
              >
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="conv-av img" src={c.image} alt="" />
                ) : (
                  <span
                    className="conv-av"
                    style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
                  >
                    {initial}
                  </span>
                )}
                <div className="conv-info">
                  <div className="conv-top">
                    <b>{c.name || "Creator"}</b>
                    <span className="conv-time">{fmtWhen(c.lastAt)}</span>
                  </div>
                  <div className="conv-sub">
                    <span className="conv-body">
                      {c.lastSender === meId && "You: "}
                      {c.lastBody}
                    </span>
                    {c.unread > 0 && <span className="conv-unread">{c.unread}</span>}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* ── Open thread + composer ─────────────────────────────────────── */}
      <div className="conv-thread">
        {err && <div className="alert err">{err}</div>}
        {!active || !thread ? (
          <div className="thread-empty">
            <p className="brief">Select a conversation to start messaging.</p>
          </div>
        ) : (
          <>
            <div className="thread-head">
              <Link
                href={`/creator/${thread.partner.id}`}
                className="thread-partner"
              >
                <span
                  className="conv-av"
                  style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
                >
                  {(thread.partner.name || thread.partner.username || "S")[0].toUpperCase()}
                </span>
                <span>
                  <b>{thread.partner.name || "Creator"}</b>
                  {thread.partner.username && (
                    <span className="brief">@{thread.partner.username}</span>
                  )}
                </span>
              </Link>
            </div>

            <div className="msg-list">
              {thread.messages.length === 0 ? (
                <p className="brief">Say hi 👋 — start the conversation.</p>
              ) : (
                thread.messages.map((m) => {
                  const mine = m.senderId === meId;
                  return (
                    <div key={m.id} className={`msg ${mine ? "mine" : ""}`}>
                      <p>{m.body}</p>
                      <span className="msg-time">{fmtWhen(m.createdAt)}</span>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={send}>
              <div className="composer-row">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Write a message…"
                  maxLength={2000}
                  autoFocus
                />
                <button className="btn btn-primary" disabled={sending || !text.trim()}>
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
