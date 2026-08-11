/**
 * Campaign taxonomy — the single source of truth for the Platform and Content
 * Type fields a brand sets on a campaign.
 *
 * Both are MULTI-VALUE: a campaign can target several platforms and accept
 * several content types. They are stored comma-separated in the existing single
 * `campaigns.platform` / `campaigns.content_type` text columns, so no migration
 * is needed and legacy single-value rows keep working ("tiktok" reads back as
 * ["tiktok"]). The canonical "any platform" value is the literal "any" and is
 * ALWAYS stored on its own — never "any,tiktok".
 *
 * Selected content types are ALTERNATIVES: a campaign accepting "ugc,ai" means a
 * creator may submit content matching EITHER, not both.
 *
 * Everything (form, API, validation, cards, detail, discovery) routes through
 * this module so a single value, a CSV, and "any" all normalize identically.
 */

export const ANY_PLATFORM = "any";

// The concrete platforms a brand can multi-select. "any" is a separate,
// mutually-exclusive choice handled by the form + serializer, not listed here.
export const PLATFORMS = [
  { value: "tiktok", label: "🎵 TikTok" },
  { value: "instagram", label: "📸 Instagram" },
  { value: "youtube", label: "▶️ YouTube" },
  { value: "x", label: "𝕏 X" },
];

export const PLATFORM_VALUES = PLATFORMS.map((p) => p.value);

// Label lookup including the canonical "any" and every individual platform.
export const PLATFORM_LABEL = {
  any: "Any platform",
  tiktok: "🎵 TikTok",
  instagram: "📸 Instagram",
  youtube: "▶️ YouTube",
  x: "𝕏 X",
};

// Content types a campaign can accept (multi-select; alternatives).
export const CONTENT_TYPES = [
  { value: "ugc", label: "UGC", desc: "Raw, authentic creator content" },
  { value: "edit", label: "Edit / Remix / Clip", desc: "Clips, remixes, stitched content" },
  { value: "ai", label: "AI generated", desc: "AI-assisted or fully generated content" },
  { value: "open", label: "Open Format", desc: "Memes, slides, screenshots, or anything creative" },
];

export const CONTENT_TYPE_VALUES = CONTENT_TYPES.map((c) => c.value);

// Short labels (cards / badges).
export const CONTENT_TYPE_LABEL = {
  ugc: "UGC",
  edit: "Edit",
  ai: "AI Generated",
  open: "Open Format",
};

// Verbose labels (the campaign detail panel keeps the richer copy).
export const CONTENT_TYPE_LABEL_LONG = {
  ugc: "UGC (Raw, authentic creator content)",
  edit: "Edit / Remix / Clip",
  ai: "AI generated",
  open: "Open Format (Memes, slides, screenshots, etc.)",
};

/**
 * Parse a stored taxonomy value into an array of trimmed tokens. Accepts a
 * legacy single value ("tiktok" → ["tiktok"]), a CSV ("tiktok,instagram" →
 * [...]), the canonical "any" (→ ["any"]), an already-parsed array, or
 * empty/null (→ []).
 */
export function parseMulti(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return raw.map((s) => String(s).trim()).filter(Boolean);
}

// Dedupe while preserving first-seen order.
function uniq(arr) {
  return arr.filter((v, i) => arr.indexOf(v) === i);
}

/**
 * Serialize a platform selection to the value stored in the DB. Enforces "any"
 * exclusivity: if "any" is present (or nothing valid is selected) the bare
 * canonical "any" is stored; otherwise a deduped CSV of valid platform tokens.
 */
export function serializePlatforms(value) {
  const tokens = uniq(
    parseMulti(value).filter((t) => t === ANY_PLATFORM || PLATFORM_VALUES.includes(t))
  );
  if (tokens.length === 0 || tokens.includes(ANY_PLATFORM)) return ANY_PLATFORM;
  return tokens.join(",");
}

/**
 * Serialize a content-type selection to a deduped CSV of valid tokens. Empty
 * input falls back to "ugc" so a campaign always has at least one content type.
 */
export function serializeContentTypes(value) {
  const tokens = uniq(parseMulti(value).filter((t) => CONTENT_TYPE_VALUES.includes(t)));
  return tokens.length ? tokens.join(",") : "ugc";
}

/** Map a stored value to display labels — one per token. */
export function labelsFor(value, map) {
  return parseMulti(value).map((t) => (map && map[t]) || t);
}

/**
 * Does a campaign's platform value match a discovery filter tab?
 *  - tab "all"                → always true
 *  - campaign includes "any"  → matches every platform tab (any = all)
 *  - otherwise                → membership test
 */
export function platformMatches(value, tab) {
  if (tab === "all") return true;
  const set = parseMulti(value);
  if (set.includes(ANY_PLATFORM)) return true;
  return set.includes(tab);
}

/** Content-type membership test for a discovery filter tab. */
export function contentTypeMatches(value, tab) {
  if (tab === "all") return true;
  return parseMulti(value).includes(tab);
}
