"use client";

import { useMemo, useRef, useState } from "react";
import {
  PLATFORMS,
  PLATFORM_VALUES,
  PLATFORM_LABEL,
  ANY_PLATFORM,
  CONTENT_TYPES,
  CONTENT_TYPE_LABEL,
  parseMulti,
} from "@/lib/taxonomy";

// Platform + contentType are held as arrays here (multi-select) and sent to the
// API as arrays — the campaignSchema preprocess (parseMulti) accepts arrays,
// CSV, or a legacy single value, and serializes back to the stored CSV. An empty
// platform array means "any platform" (serializePlatforms([]) → "any").
const EMPTY = {
  title: "",
  brief: "",
  platform: [],
  reward: "",
  budget: "",
  spotlightReward: "",
  performanceMult: "1",
  durationDays: "",
  submitType: "distribution",
  requirements: "",
  contentType: ["ugc"],
  assetsUrl: "",
  visibility: "public",
  showContributions: "yes",
  thumbnailUrl: "",
  bannerUrl: "",
};

// The 7 wizard steps (Section 4). Every existing field lives under one of them.
const STEPS = ["Basics", "Content", "Access", "Assets", "Budget", "Duration", "Review"];

const MAX_IMG_BYTES = 8 * 1024 * 1024; // 8MB upload guard

// Build the initial form from an existing campaign (edit mode) or EMPTY.
function initialForm(initialValues) {
  if (!initialValues) return EMPTY;
  const c = initialValues;
  // Rebuild the duration field from the stored end date so a no-op edit keeps
  // roughly the same end date; blank means open-ended.
  let durationDays = "";
  if (c.endsAt) {
    const d = Math.ceil((new Date(c.endsAt).getTime() - Date.now()) / 86400000);
    if (d >= 1) durationDays = String(d);
  }
  const ct = parseMulti(c.contentType);
  return {
    ...EMPTY,
    title: c.title || "",
    brief: c.brief || "",
    platform: parseMulti(c.platform).filter((p) => p !== ANY_PLATFORM),
    reward: c.reward != null ? String(c.reward) : "",
    budget: c.budget != null ? String(c.budget) : "",
    spotlightReward: c.spotlightReward != null ? String(c.spotlightReward) : "",
    performanceMult: c.performanceMult != null ? String(c.performanceMult) : "1",
    durationDays,
    submitType: c.submitType || "distribution",
    requirements: c.requirements || "",
    contentType: ct.length ? ct : ["ugc"],
    assetsUrl: c.assetsUrl || "",
    visibility: c.visibility || "public",
    showContributions: c.showContributions || "yes",
    thumbnailUrl: c.thumbnailUrl || "",
    bannerUrl: c.bannerUrl || "",
  };
}

/**
 * GIMI-style rich campaign form as a 7-step wizard (Basics → Content → Access →
 * Assets → Budget → Duration → Review). Handles both create (POST) and edit
 * (PUT, when `campaignId` is passed). Platform and content type are polished
 * multi-selects; the Review step previews the campaign from the actual entered
 * data and shows a live budget estimate.
 */
export default function RichCampaignForm({ onCancel, onSuccess, initialValues = null, campaignId = null }) {
  const isEdit = !!campaignId;
  const [form, setForm] = useState(() => initialForm(initialValues));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState("");          // field currently under a drag
  const [processing, setProcessing] = useState(""); // field decoding an image
  const thumbRef = useRef(null);
  const bannerRef = useRef(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // ---- Platform multi-select (Section 2). Empty concrete set = "any"; picking
  // a concrete platform clears "any" and vice-versa (mutual exclusivity). ----
  const concretePlatforms = form.platform.filter((p) => PLATFORM_VALUES.includes(p));
  const anyActive = concretePlatforms.length === 0;
  const selectAny = () => set({ platform: [] });
  function togglePlatform(v) {
    const has = concretePlatforms.includes(v);
    set({ platform: has ? concretePlatforms.filter((p) => p !== v) : [...concretePlatforms, v] });
  }

  // ---- Content type multi-select (Section 3). Alternatives; ≥1 required. ----
  function toggleContentType(v) {
    setForm((f) => ({
      ...f,
      contentType: f.contentType.includes(v)
        ? f.contentType.filter((t) => t !== v)
        : [...f.contentType, v],
    }));
  }

  // ---- Live budget estimate (Section 6). Estimated approved posts ≈ total
  // budget ÷ approval reward. Purely a display aid derived from entered data —
  // no financial rule is invented or persisted. ----
  const estimate = useMemo(() => {
    const budget = Number(form.budget) || 0;
    const reward = Number(form.reward) || 0;
    if (budget <= 0 || reward <= 0) return null;
    return Math.floor(budget / reward);
  }, [form.budget, form.reward]);

  // ---- Image upload: shared handler for click and drag & drop. Validates type
  // and size, then downscales/crops to a data URL (keeps the existing storage
  // approach — the image travels inline in the campaign payload). ----
  function handleFile(file, field, maxW, maxH) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Please choose an image file (PNG, JPG, or WEBP).");
      return;
    }
    if (file.size > MAX_IMG_BYTES) {
      setErr("That image is larger than 8MB. Please choose a smaller file.");
      return;
    }
    setErr("");
    setProcessing(field);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const aspect = img.width / img.height;
        let w = maxW, h = maxH;
        if (aspect > maxW / maxH) h = maxW / aspect;
        else w = maxH * aspect;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        set({ [field]: canvas.toDataURL("image/jpeg", 0.85) });
        setProcessing("");
      };
      img.onerror = () => {
        setErr("That file could not be read as an image.");
        setProcessing("");
      };
      img.src = reader.result;
    };
    reader.onerror = () => {
      setErr("That file could not be read.");
      setProcessing("");
    };
    reader.readAsDataURL(file);
  }
  const onDrop = (e, field, maxW, maxH) => {
    e.preventDefault();
    setDrag("");
    handleFile(e.dataTransfer.files?.[0], field, maxW, maxH);
  };

  // ---- Per-step client validation (Section 8). The server re-validates via
  // campaignSchema; these inline checks just stop the wizard advancing with
  // obviously-invalid input and point the user at the field. ----
  function validateStep(i) {
    if (i === 0) {
      if (!form.title.trim() || form.title.trim().length < 3)
        return "Give your campaign a name (at least 3 characters).";
    }
    if (i === 1) {
      if (form.contentType.length === 0)
        return "Pick at least one content type creators can submit.";
    }
    if (i === 4) {
      const reward = Number(form.reward);
      const budget = Number(form.budget);
      if (!(reward > 0)) return "Enter an approval reward greater than $0.";
      if (form.budget !== "" && !(budget >= 0)) return "Budget can't be negative.";
      if (budget > 0 && reward > budget)
        return "The approval reward can't be larger than the whole budget.";
      const mult = Number(form.performanceMult);
      if (form.performanceMult !== "" && !(mult >= 1)) return "Performance multiplier must be at least ×1.";
    }
    if (i === 5) {
      if (form.durationDays !== "") {
        const d = Number(form.durationDays);
        if (!(d >= 1) || d > 365) return "Duration must be between 1 and 365 days (or blank for open-ended).";
      }
    }
    // Assets step only — an invalid URL sitting in state must not block the
    // other steps (the field is editable only on step 3). submit() re-runs
    // every step's check, so a bad URL is still caught before launch.
    if (i === 3 && form.assetsUrl && !/^https?:\/\//i.test(form.assetsUrl))
      return "The assets link must be a valid URL (https://…).";
    return "";
  }

  function next() {
    const problem = validateStep(step);
    if (problem) {
      setErr(problem);
      return;
    }
    setErr("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setErr("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit(e) {
    e.preventDefault();
    // Guard against implicit submission (pressing Enter in a single-field step
    // like Duration): treat it as "Continue" so the campaign is never launched
    // or saved before the Review step is reached.
    if (step < STEPS.length - 1) {
      next();
      return;
    }
    // Re-run every step's validation before launching (Section 8 + double-submit
    // guard via `saving`).
    for (let i = 0; i < STEPS.length; i++) {
      const problem = validateStep(i);
      if (problem) {
        setErr(problem);
        setStep(i);
        return;
      }
    }
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(
        isEdit ? `/api/campaigns/${campaignId}` : "/api/campaigns",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json().catch(() => ({}));
      setSaving(false);
      if (!res.ok) {
        setErr(data.error || `Could not ${isEdit ? "save" : "create"} the campaign.`);
        return;
      }
      if (!isEdit) setForm(EMPTY);
      onSuccess?.(data.campaign);
    } catch {
      setSaving(false);
      setErr("Network error. Please try again.");
    }
  }

  const platformSummary = anyActive
    ? "Any platform"
    : concretePlatforms.map((p) => PLATFORM_LABEL[p]).join(", ");
  const contentSummary = form.contentType.map((t) => CONTENT_TYPE_LABEL[t]).join(" / ");

  return (
    <form onSubmit={submit} className="rich-camp-form" noValidate>
      {/* Step progress bar */}
      <ol className="cf-steps" aria-label="Campaign setup steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`cf-step ${i === step ? "current" : ""} ${i < step ? "done" : ""}`}
          >
            <span className="cf-step-num" aria-hidden="true">{i < step ? "✓" : i + 1}</span>
            <span className="cf-step-label">{label}</span>
          </li>
        ))}
      </ol>

      {err && <div className="alert err" role="alert">{err}</div>}

      {/* ============ STEP 1 · BASICS ============ */}
      {step === 0 && (
        <div className="cf-panel">
          <div className="field">
            <label htmlFor="cf-title">Campaign name <span style={{ color: "var(--danger)" }}>*</span></label>
            <input
              id="cf-title"
              value={form.title}
              placeholder="Summer Product Launch"
              onChange={(e) => set({ title: e.target.value })}
            />
          </div>
          <div className="field">
            <label>How should creators submit?</label>
            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-btn ${form.submitType === "distribution" ? "active" : ""}`}
                aria-pressed={form.submitType === "distribution"}
                onClick={() => set({ submitType: "distribution" })}
              >
                <div className="tb-ic">🔗</div>
                <div><b>Distribution</b><span>Creators share content on their own socials</span></div>
              </button>
              <button
                type="button"
                className={`toggle-btn ${form.submitType === "source" ? "active" : ""}`}
                aria-pressed={form.submitType === "source"}
                onClick={() => set({ submitType: "source" })}
              >
                <div className="tb-ic">📁</div>
                <div><b>Source</b><span>Creators submit source files for you to use freely</span></div>
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="cf-brief">Brief — describe what people should create and post</label>
            <textarea
              id="cf-brief"
              rows={5}
              value={form.brief}
              placeholder="Show our product in a 15–30s clip, tag @brand, be fun and authentic…"
              onChange={(e) => set({ brief: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="cf-req">Must-include requirements</label>
            <input
              id="cf-req"
              value={form.requirements}
              placeholder="e.g., #hashtag, @mention, or link"
              onChange={(e) => set({ requirements: e.target.value })}
            />
            <p className="field-hint">Mandatory elements — set expectations up front for reviewers.</p>
          </div>
        </div>
      )}

      {/* ============ STEP 2 · CONTENT (platform + content type) ============ */}
      {step === 1 && (
        <div className="cf-panel">
          <div className="field">
            <label>Which platforms can creators post on?</label>
            <p className="field-hint">Pick one or more. “Any platform” accepts posts from all of them.</p>
            <div className="cf-multi" role="group" aria-label="Platforms">
              <button
                type="button"
                className={`cf-chip ${anyActive ? "active" : ""}`}
                aria-pressed={anyActive}
                onClick={selectAny}
              >
                <span className="cf-chip-check" aria-hidden="true">{anyActive ? "✓" : ""}</span>
                Any platform
              </button>
              {PLATFORMS.map((p) => {
                const on = concretePlatforms.includes(p.value);
                return (
                  <button
                    key={p.value}
                    type="button"
                    className={`cf-chip ${on ? "active" : ""}`}
                    aria-pressed={on}
                    onClick={() => togglePlatform(p.value)}
                  >
                    <span className="cf-chip-check" aria-hidden="true">{on ? "✓" : ""}</span>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="field">
            <label>What type of content can creators submit? <span style={{ color: "var(--danger)" }}>*</span></label>
            <p className="field-hint">
              These are alternatives — selecting several means a creator may submit any one of them.
            </p>
            <div className="content-type-grid" role="group" aria-label="Content types">
              {CONTENT_TYPES.map((ct) => {
                const on = form.contentType.includes(ct.value);
                return (
                  <button
                    key={ct.value}
                    type="button"
                    className={`ct-card ${on ? "active" : ""}`}
                    aria-pressed={on}
                    onClick={() => toggleContentType(ct.value)}
                  >
                    <span className="ct-check" aria-hidden="true">{on ? "✓" : ""}</span>
                    <b>{ct.label}</b>
                    <span>{ct.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP 3 · ACCESS & VISIBILITY ============ */}
      {step === 2 && (
        <div className="cf-panel">
          <div className="field">
            <label>Campaign visibility & access</label>
            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-btn ${form.visibility === "public" ? "active" : ""}`}
                aria-pressed={form.visibility === "public"}
                onClick={() => set({ visibility: "public" })}
              >
                <div className="tb-ic">👥</div>
                <div><b>Public</b><span>Listed on Discover — open to every creator to browse and join.</span></div>
              </button>
              <button
                type="button"
                className={`toggle-btn ${form.visibility === "private" ? "active" : ""}`}
                aria-pressed={form.visibility === "private"}
                onClick={() => set({ visibility: "private" })}
              >
                <div className="tb-ic">🔒</div>
                <div><b>Private</b><span>Hidden from Discover — only creators you authorize can view and submit.</span></div>
              </button>
            </div>
            <label className="checkbox-row" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={form.showContributions === "yes"}
                onChange={(e) => set({ showContributions: e.target.checked ? "yes" : "no" })}
              />
              <span>Show contributions publicly on the campaign page</span>
            </label>
            <p className="field-hint">
              When on, approved contributions appear on this campaign&apos;s page for everyone. When off, they stay hidden from the public.
            </p>
          </div>
        </div>
      )}

      {/* ============ STEP 4 · CREATIVE ASSETS ============ */}
      {step === 3 && (
        <div className="cf-panel">
          <div className="field">
            <label htmlFor="cf-assets">Link to a cloud or Google Drive folder with your assets</label>
            <input
              id="cf-assets"
              type="url"
              value={form.assetsUrl}
              placeholder="https://drive.google.com/…"
              onChange={(e) => set({ assetsUrl: e.target.value })}
            />
            <p className="field-hint">Optional — logos, examples, long-format videos or inspiration.</p>
          </div>

          <div className="field">
            <label>Campaign thumbnail</label>
            <div
              className={`cf-drop ${drag === "thumbnailUrl" ? "over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDrag("thumbnailUrl"); }}
              onDragLeave={() => setDrag("")}
              onDrop={(e) => onDrop(e, "thumbnailUrl", 400, 400)}
            >
              {form.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="img-preview thumb" src={form.thumbnailUrl} alt="Thumbnail preview" />
              ) : (
                <div className="img-placeholder thumb" role="button" tabIndex={-1} onClick={() => thumbRef.current?.click()}>
                  <span>📷</span>
                  <p>{processing === "thumbnailUrl" ? "Processing…" : "Click or drop to upload"}</p>
                </div>
              )}
              <input
                ref={thumbRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files?.[0], "thumbnailUrl", 400, 400)}
              />
              <div className="img-upload-actions">
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => thumbRef.current?.click()}>
                    {form.thumbnailUrl ? "Replace" : "Upload"}
                  </button>
                  {form.thumbnailUrl && (
                    <button type="button" className="btn btn-ghost" onClick={() => set({ thumbnailUrl: "" })}>Remove</button>
                  )}
                </div>
                <p className="field-hint">Shown as the campaign&apos;s tile on Discover. PNG/JPG/WEBP, up to 8MB.</p>
              </div>
            </div>
          </div>

          <div className="field">
            <label>Campaign banner</label>
            <div
              className={`cf-drop ${drag === "bannerUrl" ? "over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDrag("bannerUrl"); }}
              onDragLeave={() => setDrag("")}
              onDrop={(e) => onDrop(e, "bannerUrl", 1200, 400)}
            >
              {form.bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="img-preview banner" src={form.bannerUrl} alt="Banner preview" />
              ) : (
                <button type="button" className="img-placeholder banner" onClick={() => bannerRef.current?.click()}>
                  <span>🎨</span>
                  <p>{processing === "bannerUrl" ? "Processing…" : "Click or drop to upload"}</p>
                </button>
              )}
              <input
                ref={bannerRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files?.[0], "bannerUrl", 1200, 400)}
              />
              <div className="img-upload-actions">
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => bannerRef.current?.click()}>
                    {form.bannerUrl ? "Replace" : "Upload"}
                  </button>
                  {form.bannerUrl && (
                    <button type="button" className="btn btn-ghost" onClick={() => set({ bannerUrl: "" })}>Remove</button>
                  )}
                </div>
                <p className="field-hint">Wide banner shown at the top of the campaign page.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP 5 · BUDGET & REWARDS ============ */}
      {step === 4 && (
        <div className="cf-panel">
          <div className="two-col">
            <div className="field">
              <label htmlFor="cf-reward">Approval reward per post ($) <span style={{ color: "var(--danger)" }}>*</span></label>
              <input
                id="cf-reward" type="number" min="0" value={form.reward}
                placeholder="50" onChange={(e) => set({ reward: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="cf-budget">Budget ($)</label>
              <input
                id="cf-budget" type="number" min="0" value={form.budget}
                placeholder="1000" onChange={(e) => set({ budget: e.target.value })}
              />
              <p className="field-hint">Total pool funding this campaign.</p>
            </div>
          </div>
          <div className="two-col">
            <div className="field">
              <label htmlFor="cf-spot">Spotlight bonus ($)</label>
              <input
                id="cf-spot" type="number" min="0" value={form.spotlightReward}
                placeholder="10" onChange={(e) => set({ spotlightReward: e.target.value })}
              />
              <p className="field-hint">Extra reward for a spotlighted post.</p>
            </div>
            <div className="field">
              <label htmlFor="cf-mult">Performance multiplier (×)</label>
              <input
                id="cf-mult" type="number" min="1" max="100" value={form.performanceMult}
                placeholder="1" onChange={(e) => set({ performanceMult: e.target.value })}
              />
              <p className="field-hint">Rewards scale with views/engagement (e.g. ×1, ×2).</p>
            </div>
          </div>
          {estimate != null ? (
            <div className="cf-estimate">
              <span>Estimated approved posts</span>
              <b>≈ {estimate.toLocaleString()}</b>
              <span className="field-hint" style={{ margin: 0 }}>
                budget ${Number(form.budget).toLocaleString()} ÷ ${Number(form.reward).toLocaleString()} reward
              </span>
            </div>
          ) : (
            <p className="field-hint">Enter a budget and reward to see how many approved posts it funds.</p>
          )}
        </div>
      )}

      {/* ============ STEP 6 · DURATION ============ */}
      {step === 5 && (
        <div className="cf-panel">
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="cf-days">Campaign duration (days)</label>
            <input
              id="cf-days" type="number" min="1" max="365" value={form.durationDays}
              placeholder="30" onChange={(e) => set({ durationDays: e.target.value })}
            />
            <p className="field-hint">
              How long it stays live and counts down. Leave blank for no end date.
            </p>
          </div>
        </div>
      )}

      {/* ============ STEP 7 · REVIEW & LAUNCH (real entered data) ============ */}
      {step === 6 && (
        <div className="cf-panel">
          <div className="cf-review">
            {(form.bannerUrl || form.thumbnailUrl) && (
              <div className="cf-review-media">
                {form.bannerUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="cf-review-banner" src={form.bannerUrl} alt="Banner" />
                )}
                {form.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="cf-review-thumb" src={form.thumbnailUrl} alt="Thumbnail" />
                )}
              </div>
            )}
            <h3 className="cf-review-title">{form.title || "Untitled campaign"}</h3>
            {form.brief && <p className="brief">{form.brief}</p>}
            <div className="cf-review-grid">
              <div><small>Platforms</small><b>{platformSummary}</b></div>
              <div><small>Content types</small><b>{contentSummary || "—"}</b></div>
              <div><small>Submission</small><b>{form.submitType === "source" ? "Source files" : "Distribution"}</b></div>
              <div><small>Visibility</small><b>{form.visibility === "private" ? "Private" : "Public"}</b></div>
              <div><small>Approval reward</small><b>${(Number(form.reward) || 0).toLocaleString()}/post</b></div>
              <div><small>Budget</small><b>{Number(form.budget) > 0 ? `$${Number(form.budget).toLocaleString()}` : "—"}</b></div>
              <div><small>Spotlight bonus</small><b>{Number(form.spotlightReward) > 0 ? `$${Number(form.spotlightReward).toLocaleString()}` : "—"}</b></div>
              <div><small>Performance</small><b>×{Number(form.performanceMult) || 1}</b></div>
              <div><small>Duration</small><b>{form.durationDays ? `${form.durationDays} days` : "Open-ended"}</b></div>
              <div><small>Est. approved posts</small><b>{estimate != null ? `≈ ${estimate.toLocaleString()}` : "—"}</b></div>
            </div>
            {form.requirements && (
              <p className="field-hint" style={{ marginTop: 4 }}>
                <b>Must include:</b> {form.requirements}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ============ WIZARD NAV ============ */}
      <div className="cf-nav">
        <div>
          {step > 0 && (
            <button type="button" className="btn btn-ghost" onClick={back} disabled={saving}>← Back</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {onCancel && (
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={next}>Continue →</button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (isEdit ? "Saving…" : "Launching…") : isEdit ? "Save changes" : "Launch campaign"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
