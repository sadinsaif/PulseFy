"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { signIn } from "next-auth/react";

/**
 * "Continue with Privy" button for the login and signup pages. Opens the Privy
 * modal (email OTP / social / external wallet), then trades the resulting Privy
 * access token for a normal NextAuth session via the server bridge
 * (signIn("privy", …) → the Credentials provider in auth.js).
 *
 * Only rendered when NEXT_PUBLIC_PRIVY_APP_ID is set, so it's always inside
 * <PrivyProvider>. Props:
 *   role     — signup role hint ("creator" | "brand"); omitted on the login page.
 *   referral — a ?ref=<username> to credit; omitted on the login page.
 */
export default function PrivyAuthButton({ role = "", referral = "", label }) {
  const router = useRouter();
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const bridging = useRef(false);

  const bridge = useCallback(async () => {
    if (bridging.current) return;
    bridging.current = true;
    setBusy(true);
    setErr("");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("no-token");
      const res = await signIn("privy", {
        token,
        role: role || "",
        ref: referral || "",
        redirect: false,
      });
      if (res?.error) {
        setErr(
          res.error.includes("PRIVY_EMAIL_REQUIRED")
            ? "Add and verify an email on your login, then try again."
            : "Could not complete sign-in. Please try again."
        );
        bridging.current = false;
        setBusy(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setErr("Could not complete sign-in. Please try again.");
      bridging.current = false;
      setBusy(false);
    }
  }, [getAccessToken, role, referral, router]);

  // The modal login path: onComplete fires once Privy has authenticated, which
  // is also when embedded-wallet creation runs.
  const { login } = useLogin({ onComplete: () => bridge() });

  function onClick() {
    setErr("");
    if (!ready) return;
    if (authenticated) bridge(); // already logged into Privy → straight to bridge
    else login(); // opens the modal; onComplete fires the bridge
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div style={SEP_WRAP} aria-hidden="true">
        <span style={SEP_LINE} />
        <span style={SEP_TEXT}>or</span>
        <span style={SEP_LINE} />
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-block"
        onClick={onClick}
        disabled={!ready || busy}
      >
        {busy ? "Connecting…" : label || "Continue with email, social or wallet"}
      </button>
      {err && (
        <div className="alert err" style={{ marginTop: 10 }}>
          {err}
        </div>
      )}
    </div>
  );
}

const SEP_WRAP = { display: "flex", alignItems: "center", gap: 12, margin: "2px 0 14px" };
const SEP_LINE = { flex: 1, height: 1, background: "var(--border)" };
const SEP_TEXT = { color: "var(--text-dim)", fontSize: 13 };
