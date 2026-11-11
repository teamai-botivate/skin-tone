// Audience handling for onboarding: which Step 7 / Step 8 choices an audience sees, and what
// changes when the user picks a different audience in Step 2. Pure functions, no React.

import type { SkinTuneProfile } from '@/types';
import { deriveGenderFromAudience, getStylingContext, isKidsAgeGroup } from '@/lib/styling-context';
import {
  allPresetStyleLabels,
  getQuickTagsForAudience,
  getStyleOptionsForAudience,
  type OnboardingAudience,
  type SelectOption,
} from './data/options';

export function getOnboardingAudience(profile: Partial<SkinTuneProfile>): OnboardingAudience {
  const ctx = getStylingContext(profile);
  if (ctx.isBoy) return 'boys';
  if (ctx.isGirl) return 'girls';
  if (ctx.isKids) return 'kids';
  if (ctx.isMan) return 'men';
  if (ctx.isWoman) return 'women';
  return 'neutral';
}

export const styleOptionsForProfile = (profile: Partial<SkinTuneProfile>): SelectOption[] =>
  getStyleOptionsForAudience(getOnboardingAudience(profile));

export const quickTagsForProfile = (profile: Partial<SkinTuneProfile>): string[] =>
  getQuickTagsForAudience(getOnboardingAudience(profile));

/**
 * Profile changes for a new Step 2 audience choice (a preset label or custom "Other" text).
 * - gender always follows the new choice; unrecognised custom text clears it instead of
 *   keeping the previous audience's gender.
 * - The age is cleared whenever it belongs to the other side of the adult / kids divide, and
 *   kids-ness is judged without the old age, so a stale kids age can't keep an adult a child.
 * - Preset styles that only exist for the previous audience are removed when the audience
 *   changes (Step 7 then shows the new audience's list); the user's own custom styles are kept.
 */
export function applyAudienceSelection(
  profile: SkinTuneProfile,
  pronouns: string,
): Partial<SkinTuneProfile> {
  const gender = deriveGenderFromAudience(pronouns);
  const patch: Partial<SkinTuneProfile> = { pronouns, gender };

  const wasKids = getStylingContext(profile).isKids;
  const isNowKids = getStylingContext({ ...profile, pronouns, gender, ageGroup: '' }).isKids;
  const ageBelongsElsewhere = Boolean(profile.ageGroup) && isKidsAgeGroup(profile.ageGroup) !== isNowKids;
  if (wasKids !== isNowKids || ageBelongsElsewhere) patch.ageGroup = '';

  const before = getOnboardingAudience(profile);
  const after = getOnboardingAudience({ ...profile, ...patch });
  // Only between two recognised audiences: half-typed custom text passes through "neutral"
  // and must not drop selections on the way.
  if (before !== after && before !== 'neutral' && after !== 'neutral') {
    const allowed = new Set(getStyleOptionsForAudience(after).map((o) => o.label));
    const kept = (profile.style || []).filter((s) => allowed.has(s) || !allPresetStyleLabels.has(s));
    if (kept.length !== (profile.style || []).length) patch.style = kept;
  }
  return patch;
}

/**
 * Repairs a stored profile written before audience switching cleared stale values: gender is
 * re-derived from the stored audience choice, and a kids age stored for an adult is dropped.
 * Nothing else (styles, notes, colours) is touched.
 */
export function repairStoredAudience(profile: SkinTuneProfile): SkinTuneProfile {
  if (!profile.pronouns) return profile;
  const gender = deriveGenderFromAudience(profile.pronouns);
  const repaired = { ...profile, gender };
  if (repaired.ageGroup && isKidsAgeGroup(repaired.ageGroup) && !getStylingContext(repaired).isKids) {
    repaired.ageGroup = '';
  }
  return repaired.gender === profile.gender && repaired.ageGroup === profile.ageGroup ? profile : repaired;
}
