export default function TrustBadge({ verified }) {
  if (!verified) return null;
  return <span className="tag-pill" title="Verified by PulseFy" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>✓ Verified</span>;
}
