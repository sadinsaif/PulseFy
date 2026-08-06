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

/** Pull the 11-char video ID out of any YouTube/Shorts/youtu.be URL. */
export function extractYouTubeId(u) {
  try {
    const url = new URL(u);
    const h = url.hostname.replace(/^www\./, "");
    if (h === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
    if (h.endsWith("youtube.com") || h.endsWith("youtube-nocookie.com")) {
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
    return (
      h === "youtu.be" ||
      h.endsWith("youtube.com") ||
      h.endsWith("youtube-nocookie.com")
    );
  } catch {
    return false;
  }
}

/**
 * Fetch real stats for a YouTube video/Short.
 * Returns { views, likes, comments, engagement } or null when the key is
 * missing, the URL isn't a resolvable video, or the API call fails. Callers
 * treat null as "leave the metrics as they are" (never fake numbers).
 */
export async function fetchYouTubeStats(url) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const id = extractYouTubeId(url);
  if (!id) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${id}&key=${key}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const s = data.items?.[0]?.statistics;
    if (!s) return null; // private / deleted / bad id
    const views = Number(s.viewCount || 0);
    const likes = Number(s.likeCount || 0); // omitted when likes are hidden
    const comments = Number(s.commentCount || 0); // omitted when comments off
    return { views, likes, comments, engagement: likes + comments };
  } catch {
    return null;
  }
}

/**
 * Platform dispatch. Given a platform label + post URL, return real metrics
 * or null if we can't fetch them for free yet.
 * Today: YouTube only. TikTok / Instagram / X need a paid provider (Phase 2).
 */
export async function fetchMetrics(platform, url) {
  if (platform === "youtube" || isYouTubeUrl(url)) {
    return await fetchYouTubeStats(url);
  }
  return null;
}

/** Whether we can currently auto-fetch metrics for this platform/URL. */
export function canAutoFetch(platform, url) {
  return platform === "youtube" || isYouTubeUrl(url);
}
