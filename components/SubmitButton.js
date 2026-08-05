"use client";

import { useEffect, useState } from "react";

const PLATFORMS = [
  { id: "tiktok", label: "TikTok", icon: "🎵" },
  { id: "instagram", label: "Instagram", icon: "📸" },
  { id: "youtube", label: "YouTube", icon: "▶️" },
  { id: "x", label: "X", icon: "𝕏" },
];

/**
 * Submit-your-clip flow for a challenge (GIMI-style).
 * A button opens a modal where the creator picks a platform, pastes their
 * published post link, and adds an optional caption. Posts to /api/submit.
 */
export default function SubmitButton({ challengeId, requiredCaption }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState("tiktok");
  const [postUrl, setPostUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [existing, setExisting] = useState(null);

  // Load the creator's existing submission (if any) when the modal opens.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/submit?challengeId=${encodeURIComponent(challengeId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (alive && data.submission) {
          setExisting(data.submission);
          setPlatform(data.submission.platform);
          setPostUrl(data.submission.postUrl);
          setCaption(data.submission.caption || "");
        }
      } catch {
        /* ignore — form still works */
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, challengeId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, platform, postUrl, caption }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (res.status === 401) {
        setErr("Please sign in as a creator to submit.");
        return;
      }
      if (!res.ok) {
        setErr(data.error || "Could not submit. Try again.");
        return;
      }
      setMsg(data.message || "Submission received — it's now in review.");
      setExisting({ platform, postUrl, caption, status: "pending" });
    } catch {
      setLoading(false);
      setErr("Network error. Please try again.");
    }
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        {existing ? "Update submission ↗" : "Submit your clip ↗"}
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{existing ? "Update your submission" : "Submit your clip"}</h3>
              <button className="modal-x" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            {existing && (
              <div className="alert info">
                You already submitted — current status:{" "}
                <b style={{ textTransform: "capitalize" }}>{existing.status}</b>. Editing
                puts it back in review.
              </div>
            )}

            {requiredCaption && (
              <p className="modal-hint">
                Your caption must include: <b>{requiredCaption}</b>
              </p>
            )}

            {err && <div className="alert err">{err}</div>}
            {msg ? (
              <>
                <div className="alert ok">{msg}</div>
                <button className="btn btn-primary btn-block" onClick={() => setOpen(false)}>
                  Done
                </button>
              </>
            ) : (
              <form onSubmit={onSubmit}>
                <div className="field">
                  <label>Platform</label>
                  <div className="platform-row">
                    {PLATFORMS.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className={`platform-chip ${platform === p.id ? "active" : ""}`}
                        onClick={() => setPlatform(p.id)}
                      >
                        <span>{p.icon}</span> {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="postUrl">Post link</label>
                  <input
                    id="postUrl"
                    type="url"
                    placeholder="https://www.tiktok.com/@you/video/…"
                    value={postUrl}
                    onChange={(e) => setPostUrl(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="caption">Caption (optional)</label>
                  <textarea
                    id="caption"
                    rows={3}
                    placeholder="Your post caption…"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                </div>

                <button className="btn btn-primary btn-block" disabled={loading}>
                  {loading ? "Submitting…" : existing ? "Update submission" : "Submit"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
