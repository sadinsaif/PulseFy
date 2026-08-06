"use client";

import { useEffect, useState } from "react";

/**
 * Client-side referral link box: builds the full URL from the user's username
 * + the browser origin, with a copy-to-clipboard button. Username and stats
 * come from the server page as props so there's no client fetch/loading state.
 */
export default function ReferralCard({ username, referredCount, earnedCents }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  // origin is browser-only — resolve it after mount so SSR never touches window.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const referralLink =
    username && origin ? `${origin}/signup?ref=${username}` : "";

  const handleCopy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="referral-card">
      <h2>Refer others and earn</h2>
      <div className="referral-stats">
        <div className="stat">
          <span className="stat-label">Referred</span>
          <span className="stat-value">{referredCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Earned</span>
          <span className="stat-value">
            ${(earnedCents / 100).toFixed(2)} USDC
          </span>
        </div>
      </div>

      {username ? (
        <div className="referral-link-section">
          <label htmlFor="refLink">Your referral link</label>
          <div className="link-box">
            <input
              id="refLink"
              type="text"
              value={referralLink}
              readOnly
              className="link-input"
            />
            <button onClick={handleCopy} className="copy-btn">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        <p className="notice">
          Set a username in your <a href="/dashboard/profile">profile</a> to
          generate your referral link.
        </p>
      )}
    </div>
  );
}
