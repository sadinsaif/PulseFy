/**
 * Shared campaign helpers used by the card + detail views.
 *
 * A campaign is "live" when its status is "active" AND it hasn't passed its
 * end date (endsAt). Anything else — paused, ended, or an active campaign whose
 * endsAt is in the past — counts as finished ("End"), and finished cards sort
 * below live ones (the GIMI Discover behaviour).
 */

/**
 * True if the campaign is open (active and not past its end date).
 * `now` is injectable so a caller can pass a clock that's stable across the
 * SSR/hydration boundary (avoids a Live→End flip + hydration warning on load).
 */
export function isLive(camp, now = Date.now()) {
  if (!camp || camp.status !== "active") return false;
  if (!camp.endsAt) return true; // open-ended
  return new Date(camp.endsAt).getTime() > now;
}

/** "Live" | "End" — the corner status badge label. */
export function statusLabel(camp, now = Date.now()) {
  return isLive(camp, now) ? "Live" : "End";
}

/**
 * Human countdown to a campaign's end date, e.g. "5d left", "6h left",
 * "12m left". Returns "" when there's no end date, and "Ended" once it's past.
 * `now` is injectable so a live ticking timer can pass its own clock.
 */
export function countdown(endsAt, now = Date.now()) {
  if (!endsAt) return "";
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return "Ended";
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days >= 1) return `${days}d left`;
  if (hrs >= 1) return `${hrs}h left`;
  return `${Math.max(1, mins)}m left`;
}
