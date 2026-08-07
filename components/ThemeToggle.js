"use client";

import { useEffect, useState } from "react";

/**
 * Light/dark theme switch for the Settings page.
 *
 * The actual <html data-theme> attribute is set before paint by the inline
 * script in app/layout.js (defaulting to "light" on first visit), so there's
 * no flash. This control just reflects the current value and, on change,
 * flips the attribute + persists the choice to localStorage for next time.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState("light");

  // Sync initial state from whatever the pre-paint script already applied.
  useEffect(() => {
    const current =
      document.documentElement.getAttribute("data-theme") || "light";
    setTheme(current);
  }, []);

  function apply(next) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode / storage disabled — theme still applies for this visit */
    }
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      <button
        type="button"
        className={`theme-opt ${theme === "light" ? "active" : ""}`}
        aria-pressed={theme === "light"}
        onClick={() => apply("light")}
      >
        ☀️ Light
      </button>
      <button
        type="button"
        className={`theme-opt ${theme === "dark" ? "active" : ""}`}
        aria-pressed={theme === "dark"}
        onClick={() => apply("dark")}
      >
        🌙 Dark
      </button>
    </div>
  );
}
