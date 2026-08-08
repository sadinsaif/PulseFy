"use client";

/**
 * PerfChart — a dependency-free, presentational bar chart in the PulseFy
 * palette. Used by the brand Overview and Analytics pages.
 *
 * Props:
 *   data            [{ label, primary, secondary? }] — one bar (or bar pair) each
 *   primaryLabel    legend + tooltip label for the primary series (e.g. "Views")
 *   secondaryLabel  legend + tooltip label for the secondary series (e.g. "Spend")
 *   primaryFormat   "number" | "compact" | "money" — how primary values render
 *   secondaryFormat same, for the secondary series
 *
 * Format modes are strings (not functions) so this client component can receive
 * them from a server component. Bars are sized as a % of the largest value in
 * their own series, so a big-views / small-spend pairing both read clearly.
 * All styling lives in globals.css (.perf-chart*).
 */
function fmt(v, mode) {
  const n = Number(v) || 0;
  if (mode === "money") return "$" + n.toLocaleString();
  if (mode === "compact") {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }
  return n.toLocaleString();
}

export default function PerfChart({
  data = [],
  primaryLabel = "Primary",
  secondaryLabel,
  primaryFormat = "number",
  secondaryFormat = "number",
}) {
  const rows = Array.isArray(data) ? data.filter(Boolean) : [];
  if (!rows.length) {
    return (
      <div className="perf-chart empty">
        <p>No campaign data yet. Launch a campaign to see performance here.</p>
      </div>
    );
  }

  const maxPrimary = Math.max(1, ...rows.map((d) => Number(d.primary) || 0));
  const maxSecondary = Math.max(1, ...rows.map((d) => Number(d.secondary) || 0));
  const hasSecondary = secondaryLabel != null;

  return (
    <div className="perf-chart">
      <div className="perf-legend">
        <span className="perf-key">
          <i className="dot-primary" /> {primaryLabel}
        </span>
        {hasSecondary && (
          <span className="perf-key">
            <i className="dot-secondary" /> {secondaryLabel}
          </span>
        )}
      </div>
      <div className="perf-bars">
        {rows.map((d, i) => {
          const p = Number(d.primary) || 0;
          const s = Number(d.secondary) || 0;
          const ph = Math.max(2, Math.round((p / maxPrimary) * 100));
          const sh = Math.max(2, Math.round((s / maxSecondary) * 100));
          return (
            <div className="perf-col" key={i}>
              <div className="perf-stack">
                <div
                  className="perf-bar primary"
                  style={{ height: `${ph}%` }}
                  title={`${primaryLabel}: ${fmt(p, primaryFormat)}`}
                >
                  <span className="perf-val">{fmt(p, primaryFormat)}</span>
                </div>
                {hasSecondary && (
                  <div
                    className="perf-bar secondary"
                    style={{ height: `${sh}%` }}
                    title={`${secondaryLabel}: ${fmt(s, secondaryFormat)}`}
                  />
                )}
              </div>
              <div className="perf-label" title={d.label}>
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
