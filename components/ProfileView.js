"use client";

import { useEffect, useState } from "react";

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
            <label>Avatar image URL</label>
            <input
              value={form.image}
              placeholder="https://…/photo.jpg"
              onChange={(e) => setForm({ ...form, image: e.target.value })}
            />
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
          <div className="n">{stats.rejected}</div>
          <div className="l">Rejected</div>
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
