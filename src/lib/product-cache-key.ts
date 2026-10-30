import type { LookRecommendation, SkinTuneProfile } from "@/types";

// Bump whenever the fingerprint inputs or the cached response shape change
export const PRODUCT_CACHE_VERSION = "v10";

/**
 * Deterministic fingerprint of every input that materially affects product search:
 * audience/persona (gender, pronouns, age, notes), occasion, style, budget, colors, impression,
 * skin tone/undertone (makeup shades), the look's outfit details, and the requested category.
 * Display-only or unstable values (name, photos, height, raw image data) are deliberately excluded.
 * Shared by the server and client caches; it must stay free of Node-only APIs.
 */
export function buildProductCacheFingerprint(
  look: Partial<LookRecommendation>,
  profile: Partial<SkinTuneProfile>,
  requestedCategory?: string,
): string {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  const sortedList = (v: unknown) => list(v).sort();

  return JSON.stringify({
    category: requestedCategory || "all",
    profile: {
      gender: str(profile?.gender),
      pronouns: str(profile?.pronouns),
      ageGroup: str(profile?.ageGroup),
      customStyleNotes: str(profile?.customStyleNotes),
      occasion: str(profile?.occasion),
      // Order matters: the first style is used as the product style label
      style: list(profile?.style),
      budget: str(profile?.budget),
      colorsLove: sortedList(profile?.colorsLove),
      colorsAvoid: sortedList(profile?.colorsAvoid),
      impression: sortedList(profile?.impression),
      skinTone: str(profile?.appearance?.skinTone),
      undertone: str(profile?.appearance?.undertone),
    },
    look: {
      title: str(look?.title),
      note: str(look?.note),
      vibe: str(look?.vibe),
      outfit: str(look?.outfit),
      outfitColor: str(look?.outfitColor),
      palette: list(look?.palette),
      pieces: (Array.isArray(look?.pieces) ? look.pieces : []).map((p) => [
        str(p?.category),
        str(p?.name),
        str(p?.detail),
      ]),
      jewellery: str(look?.jewellery),
      accessories: str(look?.accessories),
      footwear: str(look?.footwear),
      // Only presence affects scoring; the URL itself may be a large/rotating data URL
      hasImage: Boolean(look?.imageUrl),
    },
  });
}
