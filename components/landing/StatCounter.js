"use client";

import { useEffect, useRef, useState } from "react";

/**
 * StatCounter — counts a REAL number up from zero the first time it scrolls into
 * view. Purely presentational polish over a value the server already computed;
 * it never invents a number. Honours prefers-reduced-motion (shows the final
 * value immediately, no animation).
 *
 * Props: value (number), prefix, suffix, label, decimals.
 */
export default function StatCounter({ value = 0, prefix = "", suffix = "", label = "", decimals = 0 }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = Number(value) || 0;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || target === 0) {
      setDisplay(target);
      return;
    }

    let raf = 0;
    let started = false;
    const DURATION = 1100;

    const run = () => {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / DURATION);
        // easeOutCubic — quick then settles.
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(target * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
        else setDisplay(target);
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
      { threshold: 0.4 }
    );
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [value]);

  const shown =
    decimals > 0
      ? Number(display).toFixed(decimals)
      : Math.round(display).toLocaleString("en-US");

  return (
    <div className="lx-stat" ref={ref}>
      <div className="lx-stat-num">
        {prefix}
        {shown}
        {suffix}
      </div>
      <div className="lx-stat-label">{label}</div>
    </div>
  );
}
