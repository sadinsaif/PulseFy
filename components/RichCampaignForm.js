"use client";

import { useRef, useState } from "react";

const PLATFORMS = [
  { value: "any", label: "Any platform" },
  { value: "tiktok", label: "🎵 TikTok" },
  { value: "instagram", label: "📸 Instagram" },
  { value: "youtube", label: "▶️ YouTube" },
  { value: "x", label: "𝕏 X" },
];

const CONTENT_TYPES = [
  { value: "ugc", label: "UGC", desc: "Raw, authentic creator content" },
  { value: "edit", label: "Edit / Remix / Clip", desc: "Clips, remixes, stitched content" },
  { value: "ai", label: "AI generated", desc: "AI-assisted or fully generated content" },
  { value: "open", label: "Open Format", desc: "Memes, slides, screenshots, or anything creative" },
];

const EMPTY = {
  title: "",
  brief: "",
  platform: "any",
  reward: "",
  submitType: "distribution",
  requirements: "",
  contentType: "ugc",
  assetsUrl: "",
  visibility: "public",
  showContributions: "yes",
  thumbnailUrl: "",
  bannerUrl: "",
};

/**
 * GIMI-style rich campaign creation form with step progress, submit-type toggles,
 * content-type cards, visibility toggles, image pickers. Inline, no modal.
 */
export default function RichCampaignForm({ onCancel, onSuccess }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const thumbRef = useRef(null);
  const bannerRef = useRef(null);

  // Downscale and crop an uploaded image to a data URL (like profile photo picker).
  function pickImage(e, field, maxW, maxH) {
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
        const canvas = document.createElement("canvas");
        const aspect = img.width / img.height;
        let w = maxW, h = maxH;
        if (aspect > maxW / maxH) {
          h = maxW / aspect;
        } else {
          w = maxH * aspect;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        setForm((f) => ({ ...f, [field]: canvas.toDataURL("image/jpeg", 0.85) }));
        setErr("");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

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
      onSuccess?.();
    } catch {
      setSaving(false);
      setErr("Network error. Please try again.");
    }
  }

  return (
    <form onSubmit={submit} className="rich-camp-form">
      {err && <div className="alert err">{err}</div>}

      {/* 1. Campaign Name */}
      <div className="field">
        <label>1. Campaign Name <span style={{ color: "var(--err)" }}>*</span></label>
        <input
          value={form.title}
          placeholder="Summer Product Launch"
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
      </div>

      {/* 2. Submit Type (distribution / source) */}
      <div className="field">
        <label>2. How should creators submit?</label>
        <div className="toggle-group">
          <button
            type="button"
            className={`toggle-btn ${form.submitType === "distribution" ? "active" : ""}`}
            onClick={() => setForm({ ...form, submitType: "distribution" })}
          >
            <div className="tb-ic">🔗</div>
            <div>
              <b>Distribution</b>
              <span>Get creators to share their content or yours directly on socials</span>
            </div>
          </button>
          <button
            type="button"
            className={`toggle-btn ${form.submitType === "source" ? "active" : ""}`}
            onClick={() => setForm({ ...form, submitType: "source" })}
          >
            <div className="tb-ic">📁</div>
            <div>
              <b>Source</b>
              <span>Get creators to submit content source files for you to use freely across your own socials</span>
            </div>
          </button>
        </div>
      </div>

      {/* 3. Brief */}
      <div className="field">
        <label>3. Describe what people should create and post (Brief)</label>
        <textarea
          rows={5}
          value={form.brief}
          placeholder="Show our product in a 15–30s clip, tag @brand, be fun and authentic…"
          onChange={(e) => setForm({ ...form, brief: e.target.value})}
        />
      </div>

      {/* 4. Must-include requirements */}
      <div className="field">
        <label>4. Must-include requirements</label>
        <input
          value={form.requirements}
          placeholder="e.g., #hashtag, @mention, or link"
          onChange={(e) => setForm({ ...form, requirements: e.target.value })}
        />
        <p className="field-hint">Mandatory elements — submissions missing these will be rejected automatically.</p>
      </div>

      {/* 5. Content Type */}
      <div className="field">
        <label>5. What type of content can creators submit?</label>
        <div className="content-type-grid">
          {CONTENT_TYPES.map((ct) => (
            <button
              key={ct.value}
              type="button"
              className={`ct-card ${form.contentType === ct.value ? "active" : ""}`}
              onClick={() => setForm({ ...form, contentType: ct.value })}
            >
              <b>{ct.label}</b>
              <span>{ct.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 6. Assets URL */}
      <div className="field">
        <label>6. Add a link to a cloud or Google Drive folder with your campaign assets</label>
        <input
          type="url"
          value={form.assetsUrl}
          placeholder="https://drive.google.com/…"
          onChange={(e) => setForm({ ...form, assetsUrl: e.target.value })}
        />
        <p className="field-hint">Provide assets — logos, examples, long format videos or inspirations</p>
      </div>

      {/* 7. Visibility & showContributions */}
      <div className="field">
        <label>7. Campaign Visibility & Access</label>
        <div className="toggle-group">
          <button
            type="button"
            className={`toggle-btn ${form.visibility === "public" ? "active" : ""}`}
            onClick={() => setForm({ ...form, visibility: "public" })}
          >
            <div className="tb-ic">👥</div>
            <div><b>Public</b><span>Open to Everyone</span></div>
          </button>
          <button
            type="button"
            className={`toggle-btn ${form.visibility === "private" ? "active" : ""}`}
            onClick={() => setForm({ ...form, visibility: "private" })}
          >
            <div className="tb-ic">🔒</div>
            <div><b>Private</b><span>Invite-only or whitelist access</span></div>
          </button>
        </div>
        <label className="checkbox-row" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={form.showContributions === "yes"}
            onChange={(e) => setForm({ ...form, showContributions: e.target.checked ? "yes" : "no" })}
          />
          <span>Show contributions publicly</span>
        </label>
        <p className="field-hint">When enabled, contributions are displayed on this campaign's details page for everyone. When off, they stay hidden from the public.</p>
      </div>

      {/* 8. Thumbnail upload */}
      <div className="field">
        <label>8. Add your campaign thumbnail</label>
        <div className="img-upload-box">
          {form.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="img-preview thumb" src={form.thumbnailUrl} alt="thumb" />
          ) : (
            <div className="img-placeholder thumb">
              <span>📷</span>
              <p>Click to Upload</p>
            </div>
          )}
          <input
            ref={thumbRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => pickImage(e, "thumbnailUrl", 400, 400)}
          />
          <div className="img-upload-actions">
            <button type="button" className="btn btn-ghost" onClick={() => thumbRef.current?.click()}>
              {form.thumbnailUrl ? "Change" : "Upload"} thumbnail
            </button>
            {form.thumbnailUrl && (
              <button type="button" className="btn btn-ghost" onClick={() => setForm({ ...form, thumbnailUrl: "" })}>Remove</button>
            )}
            <p className="field-hint">Upload original assets that will be used as the thumbnail for this campaign on the Discover page.</p>
          </div>
        </div>
      </div>

      {/* 9. Banner upload */}
      <div className="field">
        <label>9. Update your campaign banner</label>
        <div className="img-upload-box">
          {form.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="img-preview banner" src={form.bannerUrl} alt="banner" />
          ) : (
            <div className="img-placeholder banner">
              <span>🎨</span>
              <p>Click to Upload</p>
            </div>
          )}
          <input
            ref={bannerRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => pickImage(e, "bannerUrl", 1200, 400)}
          />
          <div className="img-upload-actions">
            <button type="button" className="btn btn-ghost" onClick={() => bannerRef.current?.click()}>
              {form.bannerUrl ? "Change" : "Upload"} banner
            </button>
            {form.bannerUrl && (
              <button type="button" className="btn btn-ghost" onClick={() => setForm({ ...form, bannerUrl: "" })}>Remove</button>
            )}
            <p className="field-hint">Banners show on the campaign page only</p>
          </div>
        </div>
      </div>

      {/* Platform + Reward (original fields, kept compact) */}
      <div className="two-col">
        <div className="field">
          <label>Platform</label>
          <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Reward per approved post ($)</label>
          <input
            type="number"
            min="0"
            value={form.reward}
            placeholder="50"
            onChange={(e) => setForm({ ...form, reward: e.target.value })}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Creating…" : "Launch campaign"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
