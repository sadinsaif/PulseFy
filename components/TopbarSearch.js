"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The Overview top-bar search. Typing a name and pressing Enter jumps to the
 * Creators discovery page with the query pre-filled.
 */
export default function TopbarSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function go(e) {
    e.preventDefault();
    router.push(`/dashboard/creators?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <form onSubmit={go}>
      <input
        className="search"
        placeholder="Search creators…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}
