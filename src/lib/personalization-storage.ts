/**
 * Personalization & Styling Storage Management for LetStyle
 *
 * Tracks all browser storage keys used for user-specific personalization data
 * (profile, appearance, preferences, outfits, feedback, avatars).
 */

export const PERSONALIZATION_STORAGE_KEYS = [
  'letstyle-profile',
  'letstyle-saved-looks',
  'letstyle-feedback',
  'letstyle-avatar-versions',
  'skintune-profile',
  'skintune-saved-looks',
  'skintune-feedback',
  'skintune-avatar',
  'skintune-avatar-versions',
] as const;

/**
 * Completely clears all user-specific personalization data from localStorage.
 * Does not clear unrelated browser storage keys.
 */
export function clearPersonalizationStorage(): void {
  if (typeof window === 'undefined') return;
  for (const key of PERSONALIZATION_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage access might be restricted in some environments
    }
  }
}
