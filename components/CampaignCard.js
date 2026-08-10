import Link from "next/link";
import { isLive, statusLabel, countdown, budgetLeft } from "@/lib/campaign";
import TrustBadge from "@/components/TrustBadge";

const PLABEL = {
  any: "Any platform",
  tiktok: "🎵 TikTok",
  instagram: "📸 Instagram",
  youtube: "▶️ YouTube",
  x: "𝕏 X",
};

const CONTENT_TYPE_LABEL = {
  ugc: "UGC",
  edit: "Edit",
  ai: "AI Generated",
  open: "Open Format",
};

/**
 * Shared GIMI-style campaign card used on the Overview feed and the Discover
 * grid. The thumbnail carries the whole "at a glance" story: a Live/End status
 * badge (top-left), the content-type badge (top-right), and a gradient strip
 * along the bottom with the campaign Budget and a live countdown. The body
 * repeats the reward as Approval / Performance / Spotlight pills.
 *
 * `now` is passed in from a parent clock so every card counts down in sync
 * without each mounting its own interval.
 */
export default function CampaignCard({ c, now }) {
  const live = isLive(c, now);
  const left = countdown(c.endsAt, now);
  // Budget shown on the card is what's LEFT in the pool — it ticks down as the
  // brand approves posts and pays out rewards/spotlight bonuses.
  const budgetRemaining = budgetLeft(c);
  const hasMeta = c.budget > 0 || (live && left);

  return (
    <Link
      href={`/dashboard/campaigns/${c.id}`}
      className={`camp-card ${live ? "" : "is-ended"}`}
    >
      {/* Thumbnail with all the overlays (badge / type / budget / countdown) */}
      <div className="camp-thumb">
        {c.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.thumbnailUrl} alt={c.title} />
        ) : (
          <div
            className="camp-thumb-fallback"
            style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
          >
            {(c.title || "C")[0].toUpperCase()}
          </div>
        )}

        {/* Live / End status badge (top-left) */}
        <span className={`camp-status-badge ${live ? "live" : "end"}`}>
          {statusLabel(c, now)}
        </span>

        {/* Content-type badge (top-right, GIMI-style) */}
        {c.contentType && (
          <span className="camp-badge">
            {CONTENT_TYPE_LABEL[c.contentType] || c.contentType}
          </span>
        )}

        {/* Bottom gradient strip — Budget + live countdown right on the thumbnail */}
        {hasMeta && (
          <div className="camp-thumb-meta">
            {c.budget > 0 && (
              <span className="camp-thumb-budget">
                <small>Budget</small>
                <b>${Number(budgetRemaining).toLocaleString()}</b>
              </span>
            )}
            {live && left && <span className="camp-thumb-count">⏳ {left}</span>}
          </div>
        )}
      </div>

      <div className="camp-body">
        <div className="camp-top">
          <span className="camp-reward">
            ${c.reward}
            <small>/post</small>
          </span>
          <span className="tag-pill">{PLABEL[c.platform] || c.platform}</span>
        </div>
        <h3>{c.title}</h3>
        <p className="camp-brand">by {c.brandName || "A brand"} <TrustBadge verified={c.brandVerified} /></p>

        {/* Reward pills — Approval / Performance / Spotlight */}
        <div className="camp-pills">
          <span className="camp-pill">✅ Approval: ${c.reward}</span>
          <span className="camp-pill">📈 Performance: ×{Number(c.performanceMult) || 1}</span>
          {Number(c.spotlightReward) > 0 && (
            <span className="camp-pill">⭐ Spotlight: ${c.spotlightReward}</span>
          )}
        </div>

        {c.brief && <p className="camp-brief">{c.brief}</p>}
        <div className="camp-foot">
          <span>{c.submissionCount ?? 0} submissions</span>
          <span className="camp-join">
            {live ? "Join & submit →" : "View campaign →"}
          </span>
        </div>
      </div>
    </Link>
  );
}
