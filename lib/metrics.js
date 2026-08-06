// Fetches REAL post metrics from platform APIs.
//
// Only YouTube is wired up today — it's free, official, and needs no OAuth
// (just a server-side YOUTUBE_API_KEY). TikTok / Instagram / X have no free
// official way to read an arbitrary public URL, so they return null here and
// the UI shows "metrics pending" — we NEVER invent numbers.
//
// Engagement is normalised per platform. YouTube's statistics endpoint has no
// share count, so YouTube engagement = likes + comments. Rate is computed by
// the caller as engagement / views * 100.

// How long to wait on the YouTube API before giving up. Keeps a slow/stalled
// Google response from ever hanging a serverless function to its hard timeout.
const YT_TIMEOUT_MS = 6000;

// True for YouTube's *.youtube.com / *.youtube-nocookie.com hosts (NOT youtu.be).
// Exact match or a dotted-subdomain suffix only, so "notyoutube.com" and
// "evilyoutube.com" do NOT match (a plain endsWith would wrongly accept them).
function isYouTubeDotComHost(h) {
  return (
    h === "youtube.com" ||
    h.endsWith(".youtube.com") ||
    h === "youtube-nocookie.com" ||
    h.endsWith(".youtube-nocookie.com")
  );
}

/** Pull the 11-char video ID out of any YouTube/Shorts/youtu.be URL. */
export function extractYouTubeId(u) {
  try {
    const url = new URL(u);
    const h = url.hostname.replace(/^www\./, "");
    if (h === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
    if (isYouTubeDotComHost(h)) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const m = url.pathname.match(/^\/(shorts|embed|v|live)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

/** True if the URL points at YouTube (any of its host variants). */
export function isYouTubeUrl(u) {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "");
    return h === "youtu.be" || isYouTubeDotComHost(h);
  } catch {
    return false;
  }
}

// Turn one YouTube statistics object into our metric shape, or null when the
// view count is absent (premiere / live / hidden stats) — we return null there
// so callers LEAVE existing numbers untouched instead of zeroing them out.
function statsToMetrics(s) {
  if (!s || s.viewCount == null) return null;
  const views = Number(s.viewCount || 0);
  const likes = Number(s.likeCount || 0); // omitted when likes are hidden
  const comments = Number(s.commentCount || 0); // omitted when comments off
  if (!Number.isFinite(views)) return null;
  return { views, likes, comments, engagement: likes + comments };
}

/**
 * Fetch real stats for a YouTube video/Short.
 * Returns { views, likes, comments, engagement } or null when the key is
 * missing, the URL isn't a resolvable video, or the API call fails/times out.
 * Callers treat null as "leave the metrics as they are" (never fake numbers).
 */
export async function fetchYouTubeStats(url) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const id = extractYouTubeId(url);
  if (!id) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${id}&key=${key}`,
      { cache: "no-store", signal: AbortSignal.timeout(YT_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return statsToMetrics(data.items?.[0]?.statistics); // private/deleted -> undefined -> null
  } catch {
    return null; // network error, timeout, or bad JSON
  }
}

/**
 * Batch variant for the refresh endpoint: one API call resolves up to 50
 * videos, cutting both latency and quota cost from N units to 1. Takes video
 * IDs, returns a Map of id -> metrics (ids we couldn't resolve are absent).
 */
export async function fetchYouTubeStatsByIds(ids) {
  const out = new Map();
  const key = process.env.YOUTUBE_API_KEY;
  const unique = [...new Set((ids || []).filter(Boolean))].slice(0, 50);
  if (!key || unique.length === 0) return out;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${unique.join(
        ","
      )}&key=${key}`,
      { cache: "no-store", signal: AbortSignal.timeout(YT_TIMEOUT_MS) }
    );
    if (!res.ok) return out;
    const data = await res.json();
    for (const item of data.items || []) {
      const m = statsToMetrics(item.statistics);
      if (m) out.set(item.id, m);
    }
  } catch {
    /* leave the map empty — callers keep existing numbers */
  }
  return out;
}

/**
 * Platform dispatch. Given a platform label + post URL, return real metrics
 * or null if we can't fetch them for free yet.
 * Today: YouTube only. TikTok / Instagram / X need a paid provider (Phase 2).
 */
export async function fetchMetrics(platform, url) {
  if (isYouTubeUrl(url)) return await fetchYouTubeStats(url);
  return null;
}

/** Whether we can currently auto-fetch metrics for this platform/URL. */
export function canAutoFetch(platform, url) {
  return isYouTubeUrl(url);
}
