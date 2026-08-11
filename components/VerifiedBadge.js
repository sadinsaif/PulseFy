/**
 * Compact, premium verification icon shown immediately to the right of a
 * creator's name in the profile header. A real inline-SVG shield (no image):
 * a blue shield with a clean white check, wrapped by a blue→purple→pink edge
 * gradient and a subtle matching glow. Sized in `em` so it scales with the
 * heading font and stays vertically centered on the name at every breakpoint.
 *
 * Deliberately NOT the shared TrustBadge — this icon appears only beside the
 * creator name, so the Trust & reputation panel and every other TrustBadge
 * usage stay exactly as they were. Returns null for unverified creators,
 * preserving the previous show-only-when-verified behaviour.
 */
export default function VerifiedBadge({ verified }) {
  if (!verified) return null;

  // Rounded-top shield with a soft point at the base.
  const SHIELD =
    "M12 2 C9 2 6.6 2.8 5.3 3.4 C4.9 3.6 4.6 4 4.6 4.6 V11 " +
    "C4.6 16 8 19.6 12 21 C16 19.6 19.4 16 19.4 11 V4.6 " +
    "C19.4 4 19.1 3.6 18.7 3.4 C17.4 2.8 15 2 12 2 Z";

  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Verified by PulseFy"
      focusable="false"
      style={{
        width: "0.82em",
        height: "0.82em",
        marginLeft: "0.4rem",
        verticalAlign: "-0.14em",
        flexShrink: 0,
        filter: "drop-shadow(0 1px 4px rgba(124, 92, 246, 0.55))",
      }}
    >
      <defs>
        <linearGradient id="vbEdge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="52%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <linearGradient id="vbFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <path
        d={SHIELD}
        fill="url(#vbFill)"
        stroke="url(#vbEdge)"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8.4 12.2 L10.9 14.7 L15.7 8.8"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
