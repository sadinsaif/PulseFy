"use client";

import { useState } from "react";
import TopUpModal from "@/components/TopUpModal";

/**
 * The single "+ Top Up" button for the Brand Overview header (§2 — Top Up lives
 * only on Overview, the Wallet page, and the Budget step when insufficient).
 * Opens the shared TopUpModal. After a request it reloads so the new pending
 * top-up shows in transactions; balances only move once an admin confirms (§5).
 */
export default function BrandTopUpButton({ available = 0 }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        + Top Up
      </button>
      {open && (
        <TopUpModal
          available={Number(available)}
          onClose={() => setOpen(false)}
          onSuccess={() => {
            // Reflect the new pending request; a page refresh is the simplest
            // way to re-derive the server-rendered balances.
            if (typeof window !== "undefined") window.location.reload();
          }}
        />
      )}
    </>
  );
}
