"use client";

import { useEffect, useState } from "react";
import TrustBadge from "@/components/TrustBadge";

export default function TrustPanel({ userId, compact = false }) {
  const [data, setData] = useState(null);
  useEffect(() => { let live = true; fetch(`/api/trust?userId=${encodeURIComponent(userId)}`).then((r) => r.ok ? r.json() : null).then((d) => live && setData(d)).catch(() => {}); return () => { live = false; }; }, [userId]);
  if (!data) return null;
  const { trust, reviews, portfolio, socialLinks } = data;
  if (compact) return <span style={{ fontSize: 12 }}>{trust.verified && <TrustBadge verified />} {trust.score == null ? "Building trust" : `Trust ${trust.score}/100`}</span>;
  return <section className="panel" style={{ marginTop: 18 }}>
    <div className="panel-head"><h3>Trust & reputation</h3><TrustBadge verified={trust.verified} /></div>
    <div className="stat-row" style={{ marginTop: 12 }}>
      <div className="stat-box"><div className="n">{trust.score == null ? "—" : `${trust.score}/100`}</div><div className="l">{trust.limitedData ? "Building trust" : "Trust score"}</div></div>
      <div className="stat-box"><div className="n">{trust.reviewCount ? `★ ${trust.averageRating.toFixed(1)}` : "—"}</div><div className="l">{trust.reviewCount} reviews</div></div>
      <div className="stat-box"><div className="n">{trust.completedCampaigns}</div><div className="l">Completed campaigns</div></div>
      {data.profile.role === "creator" && <div className="stat-box"><div className="n">{trust.successfulSubmissions}</div><div className="l">Approved submissions</div></div>}
    </div>
    <p className="brief" style={{ marginTop: 12 }}>{trust.explanation}</p>
    {trust.reviewCount > 0 && <p className="brief">Rating distribution: {[5,4,3,2,1].map((n) => `${n}★ ${trust.distribution[n]}`).join(" · ")}</p>}
    {reviews.length > 0 && <div style={{ marginTop: 14 }}><h4>Recent reviews</h4>{reviews.map((r) => <div key={r.id} className="brief" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}><b>★ {r.rating}</b> · {r.reviewerName || r.reviewerUsername || "PulseFy member"} <span style={{ color: "var(--text-dim)" }}>({r.reviewerType})</span><br />{r.comment}</div>)}</div>}
    {portfolio?.length > 0 && <div style={{ marginTop: 18 }}><h4>Portfolio</h4><div className="creator-grid" style={{ marginTop: 10 }}>{portfolio.map((p) => <a className="creator-card" key={p.id} href={p.workUrl} target="_blank" rel="noreferrer"><b>{p.title}</b>{p.category && <span className="cc-user">{p.category}</span>}{p.description && <p className="brief">{p.description}</p>}</a>)}</div></div>}
    {socialLinks?.length > 0 && <div className="tags" style={{ marginTop: 14 }}>{socialLinks.map((l) => <a key={l.id} className="tag-pill" href={l.url} target="_blank" rel="noreferrer">{l.platform}</a>)}</div>}
  </section>;
}
