"use client";

import { useEffect, useRef } from "react";

const BARS = [
  ["45", "Mon"],
  ["68", "Tue"],
  ["52", "Wed"],
  ["88", "Thu"],
  ["74", "Fri"],
  ["96", "Sat"],
  ["61", "Sun"],
];

/** Animated bar chart — ports the load animation from legacy dashboard.js */
export default function Chart() {
  const ref = useRef(null);

  useEffect(() => {
    const bars = ref.current?.querySelectorAll(".bar") || [];
    bars.forEach((bar, i) => {
      const h = bar.getAttribute("data-h");
      setTimeout(() => {
        bar.style.height = h + "%";
      }, 100 + i * 70);
    });
  }, []);

  return (
    <div className="chart" ref={ref}>
      {BARS.map(([h, day]) => (
        <div className="bar-wrap" key={day}>
          <div className="bar" data-h={h}></div>
          <span>{day}</span>
        </div>
      ))}
    </div>
  );
}
