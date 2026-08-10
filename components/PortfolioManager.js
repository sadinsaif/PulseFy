"use client";

import { useEffect, useState } from "react";

const emptyItem = {
  title: "",
  description: "",
  category: "",
  thumbnailUrl: "",
  workUrl: "",
  platform: "website",
  displayOrder: 0,
};
const emptyLink = { platform: "instagram", url: "" };
const platformLabels = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  website: "Website",
};

export default function PortfolioManager() {
  const [items, setItems] = useState([]);
  const [links, setLinks] = useState([]);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [linkForm, setLinkForm] = useState(emptyLink);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/portfolio");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load your portfolio.");
      setItems(data.items || []);
      setLinks(data.links || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load your portfolio.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetItemForm() {
    setItemForm(emptyItem);
    setEditingId(null);
  }

  async function saveItem(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(editingId ? `/api/portfolio/${editingId}` : "/api/portfolio", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemForm),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save portfolio item.");
      setMessage(editingId ? "Portfolio item updated." : "Portfolio item added.");
      resetItemForm();
      await load();
    } catch (saveError) {
      setError(saveError.message || "Could not save portfolio item.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not remove portfolio item.");
      setMessage("Portfolio item removed.");
      if (editingId === id) resetItemForm();
      await load();
    } catch (removeError) {
      setError(removeError.message || "Could not remove portfolio item.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLink(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "social", ...linkForm }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save social link.");
      setMessage(links.some((link) => link.platform === linkForm.platform) ? "Social link updated." : "Social link added.");
      setLinkForm(emptyLink);
      await load();
    } catch (saveError) {
      setError(saveError.message || "Could not save social link.");
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(platform) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/portfolio", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not remove social link.");
      setMessage("Social link removed.");
      if (linkForm.platform === platform) setLinkForm(emptyLink);
      await load();
    } catch (removeError) {
      setError(removeError.message || "Could not remove social link.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="brief">Loading portfolio and social links…</p>;

  return (
    <>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><h3>{editingId ? "Edit portfolio item" : "Portfolio"}</h3></div>
        {error && <div className="alert err">{error}</div>}
        {message && <p className="brief" style={{ marginTop: 8 }}>{message}</p>}
        <form className="profile-form" onSubmit={saveItem}>
          <div className="two-col">
            <div className="field"><label>Title</label><input required value={itemForm.title} onChange={(event) => setItemForm({ ...itemForm, title: event.target.value })} /></div>
            <div className="field"><label>Work URL</label><input required type="url" placeholder="https://…" value={itemForm.workUrl} onChange={(event) => setItemForm({ ...itemForm, workUrl: event.target.value })} /></div>
          </div>
          <div className="two-col">
            <div className="field"><label>Category</label><input value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })} /></div>
            <div className="field"><label>Platform</label><select value={itemForm.platform} onChange={(event) => setItemForm({ ...itemForm, platform: event.target.value })}>{["website", "instagram", "tiktok", "youtube", "x", "other"].map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select></div>
          </div>
          <div className="field"><label>Description</label><textarea rows={2} value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} /></div>
          <div className="two-col">
            <div className="field"><label>Thumbnail URL (optional)</label><input type="url" placeholder="https://…" value={itemForm.thumbnailUrl} onChange={(event) => setItemForm({ ...itemForm, thumbnailUrl: event.target.value })} /></div>
            <div className="field"><label>Display order</label><input type="number" min="0" max="1000" value={itemForm.displayOrder} onChange={(event) => setItemForm({ ...itemForm, displayOrder: event.target.value })} /></div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes" : "Add portfolio item"}</button>
            {editingId && <button type="button" className="btn btn-ghost btn-sm" onClick={resetItemForm} disabled={busy}>Cancel</button>}
          </div>
        </form>
        {items.length > 0 && <div style={{ marginTop: 14 }}>{items.map((item) => <div className="brief" key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}><b>{item.title}</b>{item.category && <> · {item.category}</>} · <a href={item.workUrl} target="_blank" rel="noreferrer">Open</a><div style={{ display: "inline-flex", flexWrap: "wrap", gap: 8, marginLeft: 8 }}><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setItemForm({ ...emptyItem, ...item, description: item.description || "", category: item.category || "", thumbnailUrl: item.thumbnailUrl || "", platform: item.platform || "website" }); setEditingId(item.id); setMessage(""); setError(""); }}>Edit</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => removeItem(item.id)}>Remove</button></div></div>)}</div>}
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><h3>Social Links</h3></div>
        <p className="brief">Add public HTTPS links you want displayed on your trust profile.</p>
        <form className="profile-form" onSubmit={saveLink}>
          <div className="two-col">
            <div className="field"><label>Platform</label><select value={linkForm.platform} onChange={(event) => setLinkForm({ ...linkForm, platform: event.target.value })}>{Object.entries(platformLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="field"><label>URL</label><input required type="url" placeholder="https://…" value={linkForm.url} onChange={(event) => setLinkForm({ ...linkForm, url: event.target.value })} /></div>
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Saving…" : links.some((link) => link.platform === linkForm.platform) ? "Update social link" : "Add social link"}</button>
        </form>
        {links.length > 0 && <div style={{ marginTop: 14 }}>{links.map((link) => <div className="brief" key={link.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}><b>{platformLabels[link.platform] || link.platform}</b> · <a href={link.url} target="_blank" rel="noreferrer">Open</a><div style={{ display: "inline-flex", flexWrap: "wrap", gap: 8, marginLeft: 8 }}><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setLinkForm({ platform: link.platform, url: link.url }); setMessage(""); setError(""); }}>Edit</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => removeLink(link.platform)}>Remove</button></div></div>)}</div>}
      </section>
    </>
  );
}
