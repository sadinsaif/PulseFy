"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";

export default function ReferralsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState("");
  // origin is browser-only — resolve it in an effect so SSR doesn't touch window.
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    fetch("/api/referrals")
      .then((r) => r.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Pull the current user's username to build their referral link. GET
  // /api/profile returns it under `profile.username`.
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile?.username) {
          setUsername(data.profile.username);
        }
      })
      .catch(() => {});
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
    <div className="dash-wrap">
      <Sidebar />
      <main className="dash-main">
        <div className="dash-header">
          <h1>Referrals</h1>
          <p className="subtext">
            Refer others and earn 5% of their payouts for the first 90 days.
          </p>
        </div>

        {loading && <p className="loading">Loading...</p>}

        {!loading && stats && (
          <>
            {/* Mimix-style card */}
            <div className="referral-card">
              <h2>Refer others and earn</h2>
              <div className="referral-stats">
                <div className="stat">
                  <span className="stat-label">Referred</span>
                  <span className="stat-value">{stats.referredCount}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Earned</span>
                  <span className="stat-value">
                    ${(stats.earnedCents / 100).toFixed(2)} USDC
                  </span>
                </div>
              </div>

              {username && (
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
              )}

              {!username && (
                <p className="notice">
                  Set a username in your profile to generate your referral link.
                </p>
              )}
            </div>

            <div className="how-it-works">
              <h3>How it works</h3>
              <ol>
                <li>
                  Share your referral link with creators you know.
                </li>
                <li>
                  When they sign up using your link, they become your referral.
                </li>
                <li>
                  For the first 90 days, you earn 5% of every payout they receive
                  (after their withdrawal is marked paid by admin).
                </li>
                <li>
                  Your referral earnings are added to your balance and can be
                  withdrawn anytime.
                </li>
              </ol>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
