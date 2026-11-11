import type { SkinTuneProfile } from "@/types";

export type Audience = "kids" | "men" | "women" | "neutral";
export type TargetGender = "boys" | "girls" | "child" | "men" | "women" | "unspecified";

export interface StylingContext {
  audience: Audience;
  gender: TargetGender;
  isKids: boolean;
  isBoy: boolean;
  isGirl: boolean;
  isMan: boolean;
  isWoman: boolean;
  ageGroup: string;
  displayLabel: string;
}

/**
 * Single source of truth for resolving audience, gender, and demographic filters
 * from user profile across the entire LetStyle application.
 */
export function getStylingContext(profile?: Partial<SkinTuneProfile> | null): StylingContext {
  if (!profile) {
    return {
      audience: "neutral",
      gender: "unspecified",
      isKids: false,
      isBoy: false,
      isGirl: false,
      isMan: false,
      isWoman: false,
      ageGroup: "",
      displayLabel: "Styling",
    };
  }

  const pronouns = (profile.pronouns || "").toLowerCase();
  const rawGender = (profile.gender || "").toLowerCase();
  const age = (profile.ageGroup || "").toLowerCase();
  const notes = (profile.customStyleNotes || "").toLowerCase();

  // 1. Determine if Kids / Children.
  // Precedence: an explicit adult audience (gender women/men, or an adult audience text)
  // always wins over a kids age left over from an earlier selection; kids words are matched
  // as whole words, so e.g. "girlfriend" or "boyfriend" never mean a child.
  const isExplicitAdultGender = ADULT_WOMEN_GENDERS.has(rawGender) || ADULT_MEN_GENDERS.has(rawGender);
  const isKidsGender = KIDS_GENDERS.has(rawGender);
  const isKidsPronoun = KIDS_WORDS.test(pronouns);
  // Only an explicit adult audience word counts here; bare he/him or she/her describe children too
  const isAdultPronoun = !isKidsPronoun && ADULT_AUDIENCE_WORDS.test(pronouns);
  const isKidsAge = isKidsAgeGroup(age);

  const isKids =
    !isExplicitAdultGender &&
    (isKidsGender || isKidsPronoun || (!isAdultPronoun && isKidsAge));

  if (isKids) {
    // The selected Boys / Girls audience decides; pronouns and notes only fill in an unset gender.
    const explicitBoy = rawGender === "boy" || rawGender === "boys";
    const explicitGirl = rawGender === "girl" || rawGender === "girls";
    const isBoy =
      explicitBoy ||
      (!explicitGirl && (/\b(boy|boys|son)\b/i.test(pronouns) || /\b(boy|boys|son)\b/i.test(notes)));

    const isGirl =
      !isBoy &&
      (explicitGirl ||
        /\b(girl|girls|daughter)\b/i.test(pronouns) ||
        /\b(girl|girls|daughter)\b/i.test(notes));

    const gender: TargetGender = isBoy ? "boys" : isGirl ? "girls" : "child";

    return {
      audience: "kids",
      gender,
      isKids: true,
      isBoy,
      isGirl,
      isMan: false,
      isWoman: false,
      ageGroup: profile.ageGroup || "",
      displayLabel: isBoy ? "Kids (Boys)" : isGirl ? "Kids (Girls)" : "Kids",
    };
  }

  // A kids age range never describes an adult; it is a leftover from an earlier kids selection.
  const adultAgeGroup = isKidsAge ? "" : profile.ageGroup || "";

  // 2. Adult Women (check before "men" because "women" contains the substring "men").
  // An explicit gender decides on its own; the audience text is used only when gender is unset.
  const isWoman = ADULT_WOMEN_GENDERS.has(rawGender) || (!ADULT_MEN_GENDERS.has(rawGender) && womenFromPronouns(pronouns));

  if (isWoman) {
    return {
      audience: "women",
      gender: "women",
      isKids: false,
      isBoy: false,
      isGirl: false,
      isMan: false,
      isWoman: true,
      ageGroup: adultAgeGroup,
      displayLabel: "Women",
    };
  }

  // 3. Adult Men
  const isMan = ADULT_MEN_GENDERS.has(rawGender) || menFromPronouns(pronouns);

  if (isMan) {
    return {
      audience: "men",
      gender: "men",
      isKids: false,
      isBoy: false,
      isGirl: false,
      isMan: true,
      isWoman: false,
      ageGroup: adultAgeGroup,
      displayLabel: "Men",
    };
  }

  return {
    audience: "neutral",
    gender: "unspecified",
    isKids: false,
    isBoy: false,
    isGirl: false,
    isMan: false,
    isWoman: false,
    ageGroup: adultAgeGroup,
    displayLabel: "Styling",
  };
}

const ADULT_WOMEN_GENDERS = new Set(["women", "woman", "female"]);
const ADULT_MEN_GENDERS = new Set(["men", "man", "male", "mens", "gents"]);
const KIDS_GENDERS = new Set(["boy", "boys", "girl", "girls", "child", "kid", "kids"]);
/** Whole words only: "girlfriend", "boyfriend" or "kidding" never mean a child. */
const KIDS_WORDS = /\b(kids?|child|children|childrens|children's|children’s|boys?|girls?)\b/;

const ADULT_AUDIENCE_WORDS = /\b(women|womens|woman|female|men|mens|man|male|gents?)\b/;

const KIDS_AGE_RANGES =["0-5", "6-10", "11-15", "15-19", "0-12", "0-13", "13-18"];

/** True for the kids age ranges offered in onboarding (and older stored variants). */
export function isKidsAgeGroup(ageGroup?: string | null): boolean {
  const age = (ageGroup || "").toLowerCase().replace(/–/g, "-");
  return KIDS_AGE_RANGES.some((range) => age.includes(range)) || /\b(kids?|child|children)\b/.test(age);
}

function womenFromPronouns(pronouns: string): boolean {
  return pronouns.includes("women") || pronouns.includes("female") || pronouns.includes("she/her");
}

function menFromPronouns(pronouns: string): boolean {
  const strippedOfWomen = pronouns.replace(/\b(women|womens|women's|female|woman)\b/gi, "");
  // Natural variants: Men, Men's / Men’s, Mens, Male, Gents, Him (he/him/his)
  return (
    strippedOfWomen.includes("men") ||
    /\bmale\b/.test(strippedOfWomen) ||
    pronouns.includes("he/him") ||
    /\b(he|him|his|gents?)\b/.test(strippedOfWomen)
  );
}

/**
 * The gender implied by an onboarding audience choice (a preset label or custom "Other" text).
 * Returns "" when the text names no known audience, so a previous gender is never carried over.
 */
export function deriveGenderFromAudience(audienceText: string): string {
  const text = (audienceText || "").toLowerCase();
  if (/\bboys?\b/.test(text)) return "boy";
  if (/\bgirls?\b/.test(text)) return "girl";
  if (KIDS_WORDS.test(text)) return "unspecified";
  if (womenFromPronouns(text)) return "women";
  if (menFromPronouns(text)) return "men";
  return "";
}

/**
 * Compute a deterministic snapshot / fingerprint of all generation-relevant styling inputs.
 * When any of these inputs change, previously generated outfits must be invalidated and regenerated.
 */
export function getGenerationFingerprint(profile?: Partial<SkinTuneProfile> | null): string {
  if (!profile) return "";
  const appearance = profile.appearance || { skinTone: '', undertone: '', confidence: 0, contrast: 'Medium' };
  const ctx = getStylingContext(profile);

  return JSON.stringify({
    audience: ctx.audience,
    targetGender: ctx.gender,
    gender: (profile.gender || '').trim().toLowerCase(),
    pronouns: (profile.pronouns || '').trim().toLowerCase(),
    ageGroup: (profile.ageGroup || '').trim().toLowerCase(),
    occasion: (profile.occasion || '').trim().toLowerCase(),
    customStyleNotes: (profile.customStyleNotes || '').trim().toLowerCase(),
    style: [...(profile.style || [])].map((s) => s.trim().toLowerCase()).sort(),
    colorsLove: [...(profile.colorsLove || [])].map((s) => s.trim().toLowerCase()).sort(),
    colorsAvoid: [...(profile.colorsAvoid || [])].map((s) => s.trim().toLowerCase()).sort(),
    budget: (profile.budget || '').trim().toLowerCase(),
    bodyBuild: (profile.bodyBuild || '').trim().toLowerCase(),
    fit: (profile.fit || '').trim().toLowerCase(),
    skinTone: (appearance.skinTone || '').trim().toLowerCase(),
    undertone: (appearance.undertone || '').trim().toLowerCase(),
    contrast: (appearance.contrast || '').trim().toLowerCase(),
    restrictions: [...(profile.restrictions || [])].map((s) => s.trim().toLowerCase()).sort(),
    impression: [...(profile.impression || [])].map((s) => s.trim().toLowerCase()).sort(),
    photoUrl: profile.photoUrl || '',
    bodyPhotoUrl: profile.bodyPhotoUrl || '',
  });
}
