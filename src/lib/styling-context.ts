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

  // 1. Determine if Kids / Children
  const isKidsAge =
    age.includes("0-5") ||
    age.includes("0–5") ||
    age.includes("6-10") ||
    age.includes("6–10") ||
    age.includes("11-15") ||
    age.includes("11–15") ||
    age.includes("15-19") ||
    age.includes("15–19") ||
    age.includes("0-12") ||
    age.includes("0–12") ||
    age.includes("0-13") ||
    age.includes("0–13") ||
    age.includes("13-18") ||
    age.includes("13–18") ||
    age.includes("kid") ||
    age.includes("child");

  const isKidsPronoun =
    pronouns.includes("kid") ||
    pronouns.includes("child") ||
    pronouns.includes("boy") ||
    pronouns.includes("girl");

  const isKidsGender =
    rawGender === "boy" ||
    rawGender === "boys" ||
    rawGender === "girl" ||
    rawGender === "girls" ||
    rawGender === "child" ||
    rawGender === "kid" ||
    rawGender === "kids";

  const isKids = isKidsAge || isKidsPronoun || isKidsGender;

  if (isKids) {
    const isBoy =
      rawGender === "boy" ||
      rawGender === "boys" ||
      /\b(boy|boys|son)\b/i.test(pronouns) ||
      /\b(boy|boys|son)\b/i.test(notes);

    const isGirl =
      !isBoy &&
      (rawGender === "girl" ||
        rawGender === "girls" ||
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

  // 2. Adult Women (check before "men" because "women" contains the substring "men")
  const isWoman =
    rawGender === "women" ||
    rawGender === "woman" ||
    rawGender === "female" ||
    pronouns.includes("women") ||
    pronouns.includes("female") ||
    pronouns.includes("she/her");

  if (isWoman) {
    return {
      audience: "women",
      gender: "women",
      isKids: false,
      isBoy: false,
      isGirl: false,
      isMan: false,
      isWoman: true,
      ageGroup: profile.ageGroup || "",
      displayLabel: "Women",
    };
  }

  // 3. Adult Men
  const strippedOfWomen = pronouns.replace(/\b(women|womens|women's|female|woman)\b/gi, "");
  const isMan =
    rawGender === "men" ||
    rawGender === "man" ||
    rawGender === "male" ||
    strippedOfWomen.includes("men") ||
    pronouns.includes("male") ||
    pronouns.includes("he/him");

  if (isMan) {
    return {
      audience: "men",
      gender: "men",
      isKids: false,
      isBoy: false,
      isGirl: false,
      isMan: true,
      isWoman: false,
      ageGroup: profile.ageGroup || "",
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
    ageGroup: profile.ageGroup || "",
    displayLabel: "Styling",
  };
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
