"use client";

import { useRef, useState } from "react";

const PLATFORMS = [
  { value: "any", label: "🌐 Any" },
  { value: "tiktok", label: "🎵 TikTok" },
  { value: "instagram", label: "📸 Instagram" },
  { value: "youtube", label: "▶️ YouTube" },
  { value: "x", label: "𝕏 X" },
];

const CONTENT_TYPES = [
  { value: "ugc", title: "UGC", desc: "Raw, authentic creator content" },
  { value: "edit", title: "Edit / Remix / Clip", desc: "Clips, remixes, stitched content" },
  { value: "ai", title: "AI generated", desc: "AI-assisted or fully generated content" },
  { value: "open", title: "Open Format", desc: "Memes, slides, screenshots, anything creative" },
];

const EMPTY = {
  title: "",
  submitType: "distribution",
  brief: "",
  requirements: "",
  contentType: "ugc",
  assetsUrl: "",
  visibility: "public",
  showContributions: "yes",
  thumbnailUrl: "",
  bannerUrl: "",
  platform: "any",
  reward: "",
};

// Downscale a chosen image to a compact data URL (no upload server needed).
function readImage(file, maxW, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/**
 * GIMI-style campaign creation form. Sections: name, how creators submit,
 * brief, must-include requirements, content type, assets link, visibility,
 * thumbnail + banner, platform & reward. Calls onCreated() after a successful
 * POST so the parent can refresh its list.
 */
export default function CampaignForm({ onCreated, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const thumbRef = useRef(null);
  const bannerRef = useRef(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      setSaving(false);
      if (!res.ok) {
        setErr(data.error || "Could not create the campaign.");
        return;
      }
      setForm(EMPTY);
      onCreated?.();
    } catch {
      setSaving(false);
      setErr("Network error. Please try again.");
    }
  }

  return (
    <form onSubmit={submit} className="campaign-form">
      {err && <div className="alert err">{err}</div>}

      {/* 1. Name */}
      <section className="cf-section">
        <h4>1. Campaign name <span className="req">*</span></h4>
        <input
          value={form.title}
          placeholder="Campaign name…"
          onChange={(e) => set("title", e.target.value)}
          required
        />
      </section>

      {/* 2. How should creators submit? */}
      <section className="cf-section">
        <h4>2. How should creators submit? <span className="req">*</span></h4>
        <div className="cf-toggle-row">
          <button
            type="button"
            className={`cf-toggle ${form.submitType === "distribution" ? "on" : ""}`}
            onClick={() => set("submitType", "distribution")}
          >
            <b>Distribution</b>
            <span>Creators share content on their own socials</span>
          </button>
          <button
            type="button"
            className={`cf-toggle ${form.submitType === "source" ? "on" : ""}`}
            onClick={() => set("submitType", "source")}
          >
            <b>Source</b>
            <span>Creators submit source files for you to use</span>
          </button>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Primary platform</label>
          <select value={form.platform} onChange={(e) => set("platform", e.target.value)}>
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </section>

      {/* 3. Brief */}
      <section className="cf-section">
        <h4>3. Describe what people should create and post (Brief) <span className="req">*</span></h4>
        <textarea
          rows={5}
          value={form.brief}
          placeholder="Explain the concept, tone, do's and don'ts…"
          onChange={(e) => set("brief", e.target.value)}
        />
      </section>

      {/* 4. Must-include requirements */}
      <section className="cf-section">
        <h4>4. Must-include requirements</h4>
        <p className="cf-hint">Mandatory elements — submissions missing these can be rejected.</p>
        <input
          value={form.requirements}
          placeholder="Add requirements (e.g. #hashtag, @mention, or link)"
          onChange={(e) => set("requirements", e.target.value)}
        />
      </section>

      {/* 5. Content type */}
      <section className="cf-section">
        <h4>5. What type of content can creators submit? <span className="req">*</span></h4>
        <div className="cf-card-row">
          {CONTENT_TYPES.map((c) => (
            <button
              type="button"
              key={c.value}
              className={`cf-card ${form.contentType === c.value ? "on" : ""}`}
              onClick={() => set("contentType", c.value)}
            >
              <b>{c.title}</b>
              <span>{c.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 6. Assets link */}
      <section className="cf-section">
        <h4>6. Add a link to a cloud / Drive folder with your assets</h4>
        <p className="cf-hint">Provide assets — logos, examples, long-format videos or inspirations.</p>
        <input
          type="url"
          value={form.assetsUrl}
          placeholder="Enter URL or cloud folder link"
          onChange={(e) => set("assetsUrl", e.target.value)}
        />
      </section>

      {/* 7. Visibility & access */}
      <section className="cf-section">
        <h4>7. Campaign visibility &amp; access <span className="req">*</span></h4>
        <div className="cf-card-row">
          <button
            type="button"
            className={`cf-card ${form.visibility === "public" ? "on" : ""}`}
            onClick={() => set("visibility", "public")}
          >
            <b>Public</b>
            <span>Open to everyone</span>
          </button>
          <button
            type="button"
            className={`cf-card ${form.visibility === "private" ? "on" : ""}`}
            onClick={() => set("visibility", "private")}
          >
            <b>Private</b>
            <span>Invite-only / hidden from Discover</span>
          </button>
        </div>
        <label className="cf-check" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={form.showContributions === "yes"}
            onChange={(e) => set("showContributions", e.target.checked ? "yes" : "no")}
          />
          Show contributions publicly on the campaign page
        </label>
      </section>

      {/* 8. Thumbnail */}
      <section className="cf-section">
        <h4>8. Add your campaign thumbnail</h4>
        <p className="cf-hint">Used as the card image on the Discover page.</p>
        <div className="cf-upload">
          {form.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.thumbnailUrl} alt="thumbnail" className="cf-preview" />
          ) : (
            <div className="cf-drop" onClick={() => thumbRef.current?.click()}>
              ⬆️ Click to upload<span>SVG, PNG, JPG or WEBP</span>
            </div>
          )}
          <input
            ref={thumbRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readImage(f, 800, (url) => set("thumbnailUrl", url));
            }}
          />
          {form.thumbnailUrl && (
            <button type="button" className="btn btn-ghost" onClick={() => set("thumbnailUrl", "")}>
              Remove
            </button>
          )}
        </div>
      </section>

      {/* 9. Banner */}
      <section className="cf-section">
        <h4>9. Add your campaign banner</h4>
        <p className="cf-hint">Shows on the campaign detail page only.</p>
        <div className="cf-upload">
          {form.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.bannerUrl} alt="banner" className="cf-preview wide" />
          ) : (
            <div className="cf-drop" onClick={() => bannerRef.current?.click()}>
              ⬆️ Click to upload<span>SVG, PNG, JPG or WEBP</span>
            </div>
          )}
          <input
            ref={bannerRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readImage(f, 1400, (url) => set("bannerUrl", url));
            }}
          />
          {form.bannerUrl && (
            <button type="button" className="btn btn-ghost" onClick={() => set("bannerUrl", "")}>
              Remove
            </button>
          )}
        </div>
      </section>

      {/* Reward */}
      <section className="cf-section">
        <h4>Reward per approved post ($)</h4>
        <input
          type="number"
          min="0"
          value={form.reward}
          placeholder="50"
          onChange={(e) => set("reward", e.target.value)}
        />
      </section>

      <div className="cf-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Publishing…" : "Publish campaign"}
        </button>
      </div>
    </form>
  );
}
