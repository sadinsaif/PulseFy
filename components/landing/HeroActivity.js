import VerifiedBadge from "@/components/VerifiedBadge";

/**
 * HeroActivity — the floating "live activity" cards layered over the hero.
 *
 * Data honesty: when there is REAL public-safe approved activity we render it
 * (creator + campaign + reward). When there is none yet, we fall back to three
 * clearly-tagged ILLUSTRATIVE cards ("Sample") so a first-time visitor still
 * sees the shape of the product without us ever passing fake activity off as
 * real. The float animation is pure CSS and is disabled under
 * prefers-reduced-motion (see globals.css).
 */

const PLATFORM = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
  reddit: "Reddit",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  any: "Multi-platform",
};

function platformLabel(p) {
  return PLATFORM[String(p || "").toLowerCase()] || "Multi-platform";
}

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!then) return "";
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function initials(name) {
  const n = String(name || "").trim();
  if (!n) return "•";
  return n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function Avatar({ name, image }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="ha-avatar" src={image} alt="" />;
  }
  return <span className="ha-avatar ha-avatar-fallback">{initials(name)}</span>;
}

const SAMPLE = [
  { creatorName: "New creator", reward: 120, platform: "tiktok", campaignTitle: "Product launch reel" },
  { creatorName: "Rising talent", reward: 90, platform: "instagram", campaignTitle: "Unboxing challenge" },
  { creatorName: "Verified pro", reward: 240, platform: "youtube", campaignTitle: "Deep-dive review", spotlighted: true },
];

export default function HeroActivity({ items = [] }) {
  const real = Array.isArray(items) && items.length > 0;
  const cards = (real ? items : SAMPLE).slice(0, 3);

  return (
    <div className="hero-activity" aria-hidden="true">
      {cards.map((a, i) => (
        <div className={`ha-card ha-card-${i + 1}`} key={i}>
          <Avatar name={a.creatorName} image={real ? a.creatorImage : null} />
          <div className="ha-body">
            <div className="ha-top">
              <span className="ha-name">
                {a.creatorName}
                {real && a.creatorVerified ? <VerifiedBadge verified /> : null}
              </span>
              <span className="ha-reward">+${Number(a.reward || 0).toLocaleString("en-US")}</span>
            </div>
            <div className="ha-sub">
              {a.spotlighted ? <span className="ha-spark">★</span> : null}
              <span className="ha-camp">{a.campaignTitle}</span>
            </div>
            <div className="ha-meta">
              <span>{platformLabel(a.platform)}</span>
              {real && a.createdAt ? <span>· {timeAgo(a.createdAt)}</span> : <span className="ha-tag">Sample</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
