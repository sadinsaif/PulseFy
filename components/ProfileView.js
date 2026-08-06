"use client";

import { useEffect, useRef, useState } from "react";

const PLATFORM_LABEL = {
  tiktok: "🎵 TikTok",
  instagram: "📸 Instagram",
  youtube: "▶️ YouTube",
  x: "𝕏 X",
};

const STATUS_CLASS = {
  pending: "review",
  approved: "live",
  rejected: "ended",
};

// Compact number like GIMI: 5400 → "5.4K", 2100000 → "2.1M".
// Round first, then pick the tier so boundary values (999,999) roll up to
// "1.0M" instead of overflowing to "1000.0K".
function fmtCompact(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 999_950_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 999_950) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 999.95) return (v / 1_000).toFixed(1) + "K";
  return String(v);
}

// Engagement rate as GIMI shows it: engagement / views * 100, one decimal.
function fmtRate(views, engagement) {
  const v = Number(views) || 0;
  const e = Number(engagement) || 0;
  if (v <= 0) return "—";
  return (e / v * 100).toFixed(1) + "%";
}

const EMPTY = {
  name: "",
  email: "",
  username: "",
  bio: "",
  image: "",
  twitter: "",
  instagram: "",
  interests: "",
};

/**
 * Creator profile — header (avatar, name, bio, interests, socials), stat cards
 * (submitted / approved / rejected / approval rate / earnings), and a table of
 * the creator's own submissions. Includes an inline edit form.
 */
export default function ProfileView() {
  const [profile, setProfile] = useState(EMPTY);
  const [stats, setStats] = useState(null);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  // Read a chosen image file, downscale it to a 256px square, and store the
  // result as a compact data URL right in the form (no upload server needed).
  function pickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Please choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        // Cover-crop to a centered square, then scale down.
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        setForm((f) => ({ ...f, image: canvas.toDataURL("image/jpeg", 0.85) }));
        setErr("");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function load() {
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile);
        setStats(data.stats);
        setSubs(data.submissions || []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit() {
    setForm(profile);
    setErr("");
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      setSaving(false);
      if (!res.ok) {
        setErr(data.error || "Could not save profile.");
        return;
      }
      setEditing(false);
      load();
    } catch {
      setSaving(false);
      setErr("Network error. Please try again.");
    }
  }

  if (loading) return <p className="brief">Loading profile…</p>;

  // If the profile API failed, stats stays null — show a message instead of
  // crashing on stats.* below.
  if (!stats) {
    return (
      <p className="brief">
        Couldn&apos;t load your profile right now. Please refresh the page.
      </p>
    );
  }

  const initial = (profile.name || profile.email || "S")[0].toUpperCase();
  const interestList = (profile.interests || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (editing) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Edit profile</h3>
        </div>
        {err && <div className="alert err">{err}</div>}
        <form onSubmit={save} className="profile-form">
          <div className="field">
            <label>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Username</label>
            <input
              value={form.username}
              placeholder="yourhandle"
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Bio</label>
            <textarea
              rows={3}
              value={form.bio}
              placeholder="Tell brands who you are…"
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Profile photo</label>
            <div className="avatar-upload">
              {form.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="profile-av img sm" src={form.image} alt="preview" />
              ) : (
                <div
                  className="profile-av sm"
                  style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
                >
                  {(form.name || form.email || "S")[0].toUpperCase()}
                </div>
              )}
              <div className="au-actions">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={pickPhoto}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => fileRef.current?.click()}
                >
                  {form.image ? "Change photo" : "Upload photo"}
                </button>
                {form.image && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setForm({ ...form, image: "" })}
                  >
                    Remove
                  </button>
                )}
                <p className="au-hint">JPG or PNG — we crop &amp; resize it for you.</p>
              </div>
            </div>
          </div>
          <div className="field">
            <label>Interests (comma separated)</label>
            <input
              value={form.interests}
              placeholder="Web3, Fashion, Travel, AI"
              onChange={(e) => setForm({ ...form, interests: e.target.value })}
            />
          </div>
          <div className="two-col">
            <div className="field">
              <label>X (Twitter)</label>
              <input
                value={form.twitter}
                placeholder="@handle"
                onChange={(e) => setForm({ ...form, twitter: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Instagram</label>
              <input
                value={form.instagram}
                placeholder="@handle"
                onChange={(e) => setForm({ ...form, instagram: e.target.value })}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="hero-card">
        {profile.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="profile-av img" src={profile.image} alt={profile.name} />
        ) : (
          <div
            className="profile-av"
            style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
          >
            {initial}
          </div>
        )}
        <div className="hc-body">
          <h1>{profile.name || "Your name"}</h1>
          <div className="meta">
            {profile.username && <span>🔗 @{profile.username}</span>}
            <span>✉️ {profile.email}</span>
          </div>
          {profile.bio && <p className="brief" style={{ marginTop: 8 }}>{profile.bio}</p>}
          {interestList.length > 0 && (
            <div className="tags">
              {interestList.map((t, i) => (
                <span className="tag-pill" key={i}>
                  {t}
                </span>
              ))}
            </div>
          )}
          {(profile.twitter || profile.instagram) && (
            <div className="tags" style={{ marginTop: 8 }}>
              {profile.twitter && <span className="tag-pill">𝕏 {profile.twitter}</span>}
              {profile.instagram && (
                <span className="tag-pill">📸 {profile.instagram}</span>
              )}
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={startEdit}>
          Edit profile
        </button>
      </div>

      {/* Stat boxes */}
      <div className="stat-row" style={{ marginBottom: 18 }}>
        <div className="stat-box">
          <div className="n">{stats.submitted}</div>
          <div className="l">Submissions</div>
        </div>
        <div className="stat-box">
          <div className="n" style={{ color: "var(--ok)" }}>{stats.approved}</div>
          <div className="l">Approved</div>
        </div>
        <div className="stat-box">
          <div className="n" title={`${(Number(stats.views) || 0).toLocaleString()} views`}>
            {fmtCompact(stats.views || 0)}
          </div>
          <div className="l">Total views</div>
        </div>
        <div className="stat-box">
          <div className="n" style={{ color: "var(--accent)" }}>
            {stats.views > 0 ? `${stats.rate}%` : "—"}
          </div>
          <div className="l">Avg. rate</div>
        </div>
        <div className="stat-box">
          <div className="n">{stats.approvalRate}%</div>
          <div className="l">Approval rate</div>
        </div>
        <div className="stat-box">
          <div className="n" style={{ color: "var(--accent-3)" }}>${stats.earnings}</div>
          <div className="l">Earnings</div>
        </div>
      </div>

      {/* Submissions table */}
      <div className="panel">
        <div className="panel-head">
          <h3>My submissions</h3>
        </div>
        {subs.length === 0 ? (
          <p className="brief" style={{ marginTop: 8 }}>
            You haven&apos;t submitted anything yet. Open a challenge and submit
            your post.
          </p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Views</th>
                  <th>Engagement</th>
                  <th>Rate</th>
                  <th>Earnings</th>
                  <th>Post</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.challengeId}</b></td>
                    <td>{PLATFORM_LABEL[s.platform] || s.platform}</td>
                    <td>
                      <span className={`status ${STATUS_CLASS[s.status] || "review"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700 }} title={`${(Number(s.views) || 0).toLocaleString()} views`}>
                      {s.views > 0 ? fmtCompact(s.views) : <span style={{ color: "var(--text-dim)" }}>—</span>}
                    </td>
                    <td style={{ fontWeight: 700 }} title={`${(Number(s.engagement) || 0).toLocaleString()} engagements`}>
                      {s.engagement > 0 ? fmtCompact(s.engagement) : <span style={{ color: "var(--text-dim)" }}>—</span>}
                    </td>
                    <td>
                      {s.views > 0 ? (
                        <b style={{ color: "var(--accent)" }}>{fmtRate(s.views, s.engagement)}</b>
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>—</span>
                      )}
                    </td>
                    <td>
                      {s.status === "approved" && s.reward > 0 ? (
                        <b style={{ color: "var(--ok)" }}>${s.reward}</b>
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <a
                        href={s.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--accent)" }}
                      >
                        Open ↗
                      </a>
                    </td>
                    <td style={{ color: "var(--text-dim)", fontSize: 13 }}>
                      {new Date(s.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
