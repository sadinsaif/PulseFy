import HeroActivity from "@/components/landing/HeroActivity";

/**
 * HeroOrbit — the hero's right-column "live network" graphic.
 *
 * A decorative orbital scene: concentric rings with slow-rotating emerald
 * activity arcs, a central PulseFy mark, and up to five creator avatars drawn
 * from REAL activity (initials fallback when a creator has no image — we never
 * invent faces). The floating HeroActivity cards layer on top and carry their
 * own real/"Sample" honesty. Marked aria-hidden: it's decoration, and the same
 * creators + rewards appear as real text elsewhere on the page. All motion is
 * pure CSS and disabled under prefers-reduced-motion (see globals.css).
 */

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

// Up to 5 distinct creators pulled from real activity (dedup by name).
function pickCreators(activity) {
  const seen = new Set();
  const out = [];
  for (const a of Array.isArray(activity) ? activity : []) {
    const name = a && a.creatorName;
    if (!name) continue;
    const key = String(name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, image: a.creatorImage || null });
    if (out.length >= 5) break;
  }
  return out;
}

export default function HeroOrbit({ activity = [] }) {
  const creators = pickCreators(activity);

  return (
    <div className="hero-orbit" aria-hidden="true">
      <svg className="orbit-svg" viewBox="0 0 400 400" role="presentation">
        <defs>
          <linearGradient id="orbitArc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#54e9b0" />
            <stop offset="100%" stopColor="#25c98e" />
          </linearGradient>
        </defs>
        <circle className="orbit-ring" cx="200" cy="200" r="80" />
        <circle className="orbit-ring" cx="200" cy="200" r="130" />
        <circle className="orbit-ring" cx="200" cy="200" r="180" />
        <path className="orbit-arc-glow" d="M 30.9 138.4 A 180 180 0 0 1 337.9 84.3" />
        <path className="orbit-arc" d="M 30.9 138.4 A 180 180 0 0 1 337.9 84.3" />
        <path className="orbit-arc-glow" d="M 312.6 265 A 130 130 0 0 1 155.5 322.2" />
        <path className="orbit-arc" d="M 312.6 265 A 130 130 0 0 1 155.5 322.2" />
      </svg>

      <div className="orbit-core">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="orbit-logo" src="/logo-mark.png" alt="" />
      </div>

      {creators.map((c, i) => (
        <span className={`orbit-av orbit-av-${i + 1}`} key={i}>
          {c.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ha-avatar" src={c.image} alt="" />
          ) : (
            <span className="ha-avatar ha-avatar-fallback">{initials(c.name)}</span>
          )}
        </span>
      ))}

      <HeroActivity items={activity} />
    </div>
  );
}
