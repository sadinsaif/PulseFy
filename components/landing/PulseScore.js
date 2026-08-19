"use client";

import { useEffect, useRef, useState } from "react";

/**
 * PulseScore — the signature radial "Pulse Score" preview.
 *
 * IMPORTANT: this is an explicit, clearly-labelled DEMO. It never shows a real
 * person's score. A logged-out visitor has no score to show, and we do not
 * fabricate one for anybody — the ring animates to a fixed sample value purely
 * to illustrate the shape of the feature. The factors listed below are the real
 * inputs a signed-in creator's live score is built from (approved work, ratings,
 * verification, consistency), so the preview is honest about what it represents.
 *
 * Reduced-motion: draws the final ring immediately, no sweep.
 */
const FACTORS = [
  { label: "Approved work", pct: 88 },
  { label: "Ratings", pct: 76 },
  { label: "Verification", pct: 100 },
  { label: "Consistency", pct: 64 },
];

export default function PulseScore({ sample = 82 }) {
  const ref = useRef(null);
  const [val, setVal] = useState(0);

  const R = 74;
  const C = 2 * Math.PI * R;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = Math.max(0, Math.min(100, Number(sample) || 0));

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setVal(target);
      return;
    }

    let raf = 0;
    let started = false;
    const DURATION = 1400;

    const run = () => {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / DURATION);
        const eased = 1 - Math.pow(1 - t, 3);
        setVal(target * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
        else setVal(target);
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started) {
            started = true;
            run();
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.35 }
    );
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [sample]);

  const offset = C * (1 - val / 100);

  return (
    <div className="pulse-card" ref={ref}>
      <span className="pulse-sample-chip">Sample preview</span>

      <div className="pulse-ring-wrap" aria-hidden="true">
        <svg viewBox="0 0 180 180" className="pulse-ring">
          <defs>
            <linearGradient id="pulseGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ff7a45" />
              <stop offset="55%" stopColor="#ffb43a" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          <circle cx="90" cy="90" r={R} className="pulse-ring-track" />
          <circle
            cx="90"
            cy="90"
            r={R}
            className="pulse-ring-value"
            stroke="url(#pulseGrad)"
            strokeDasharray={C}
            strokeDashoffset={offset}
            transform="rotate(-90 90 90)"
          />
        </svg>
        <div className="pulse-ring-center">
          <span className="pulse-score-num">{Math.round(val)}</span>
          <span className="pulse-score-of">Pulse Score</span>
        </div>
      </div>

      <ul className="pulse-factors">
        {FACTORS.map((f) => (
          <li key={f.label}>
            <span className="pf-label">{f.label}</span>
            <span className="pf-bar">
              <span
                className="pf-fill"
                style={{ width: `${Math.round((f.pct * val) / 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>

      <p className="pulse-foot">
        Built from your approved work, ratings and verification —
        updated as you create. Sign in to see your live score.
      </p>
    </div>
  );
}
