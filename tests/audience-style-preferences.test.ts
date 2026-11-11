/**
 * Regression: audience and Step 7 / Step 8 style preferences survive from onboarding to the
 * recommendation and image prompts. Fully offline — the one provider call is mocked.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

process.env.OPENAI_API_KEY = "sk-test-offline-not-real";

import { logger } from "../src/lib/logger";
import { getStylingContext, deriveGenderFromAudience, isKidsAgeGroup } from "../src/lib/styling-context";
import {
  applyAudienceSelection,
  getOnboardingAudience,
  quickTagsForProfile,
  repairStoredAudience,
  styleOptionsForProfile,
} from "../src/features/onboarding/audience-selection";
import { pronounOptions, kidsAgeGroupOptions } from "../src/features/onboarding/data/options";
import {
  buildUserPrompt,
  selectedStyleWorlds,
  SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
} from "../src/lib/recommendation-prompt";
import { buildLookEditPrompt } from "../src/lib/image-prompt";
import { buildLookImagePrompt } from "../src/lib/server-image-generation";
import type { SkinTuneProfile } from "../src/types";
import type { LookRecommendation } from "../src/lib/skintune-schemas";

logger.level = "fatal";

const [WOMEN, MEN, BOYS, GIRLS] = pronounOptions.map((o) => o.label);

// Every optional field filled, so the profile also satisfies the server-side schema type
type FullProfile = SkinTuneProfile & { gender: string; bodyPhotoUrl: string; customStyleNotes: string };
const profileOf = (p: Partial<SkinTuneProfile>): FullProfile => ({
  name: "Test",
  pronouns: "",
  gender: "",
  ageGroup: "",
  height: "",
  photoUrl: "",
  bodyPhotoUrl: "",
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 80, contrast: "Medium" },
  bodyBuild: "",
  fit: "",
  style: [],
  colorsLove: [],
  colorsAvoid: [],
  restrictions: [],
  occasion: "",
  impression: [],
  budget: "",
  customStyleNotes: "",
  ...p,
}) as FullProfile;

/** Applies a Step 2 choice exactly as the onboarding screen does. */
const choose = (profile: FullProfile, pronouns: string): FullProfile => ({
  ...profile,
  pronouns,
  ...applyAudienceSelection(profile, pronouns),
}) as FullProfile;

const lookOf = (over: Partial<LookRecommendation>): LookRecommendation =>
  ({
    id: "look-01",
    title: "Fixture look",
    note: "Fixture note",
    outfit: "Fixture outfit",
    outfitColor: "Mint",
    pieces: [],
    footwear: "Fixture shoes",
    jewellery: "None",
    accessories: "None",
    hairstyle: "Soft waves",
    makeup: "Soft",
    reasoning: ["Fixture reason"],
    imageUrl: "/replace-with-generated/pending.webp",
    ...over,
  }) as LookRecommendation;

const intent = (styleDirection: string, effectiveOccasion = "Everyday") => ({
  effectiveOccasion,
  themeOrAesthetic: "fixture theme",
  styleDirection,
  mustInclude: [],
  mustAvoid: [],
});

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("[Audience switching]");

  await test("Girls → Women clears the kids age and resolves to an adult woman", () => {
    const girl = choose(profileOf({ ageGroup: "6-10", style: ["Traditional & Festive", "Other: Mirror work"] }), GIRLS);
    assert.equal(getStylingContext(girl).gender, "girls");
    const woman = choose(girl, WOMEN);
    assert.equal(woman.gender, "women");
    assert.equal(woman.ageGroup, "", "the child's age is not carried over");
    const ctx = getStylingContext(woman);
    assert.equal(ctx.audience, "women");
    assert.equal(ctx.isKids, false);
    assert.deepEqual(woman.style, ["Other: Mirror work"], "girls-only presets dropped, the user's own style kept");
  });

  await test("Boys → Men clears the kids age; Men → Boys clears the adult age", () => {
    const boy = choose(profileOf({ ageGroup: "11-15" }), BOYS);
    const man = choose(boy, MEN);
    assert.equal(man.ageGroup, "");
    assert.equal(getStylingContext(man).audience, "men");
    const adult = { ...man, ageGroup: "25–34" };
    const backToBoy = choose(adult, BOYS);
    assert.equal(backToBoy.ageGroup, "", "an adult age is not kept for a child");
    assert.equal(getStylingContext(backToBoy).gender, "boys");
  });

  await test("Women → Girls → Women, and Boys ↔ Girls keep shared kids styles and the kids age", () => {
    const woman = choose(profileOf({ ageGroup: "25–34", style: ["Traditional", "Elegant"] }), WOMEN);
    const girl = choose(woman, GIRLS);
    assert.equal(girl.ageGroup, "");
    assert.equal(getStylingContext(girl).audience, "kids");
    assert.equal(getStylingContext(choose(girl, WOMEN)).audience, "women");

    const boy = choose(profileOf({ ageGroup: "6-10", style: ["Traditional & Festive", "Sporty"] }), BOYS);
    const sister = choose(boy, GIRLS);
    assert.equal(sister.ageGroup, "6-10", "staying a child keeps the age");
    assert.deepEqual(sister.style, ["Traditional & Festive"], "shared kids style kept, boys-only style dropped");
    assert.equal(getStylingContext(sister).gender, "girls");
  });

  await test("unrecognised custom audience text does not keep the previous gender", () => {
    const girl = choose(profileOf({ ageGroup: "6-10" }), GIRLS);
    const custom = choose(girl, "Other: styling for my girlfriend");
    assert.equal(custom.gender, "", "stale 'girl' gender not retained");
    assert.equal(custom.ageGroup, "");
    assert.equal(getStylingContext(custom).isKids, false);
  });

  await test("half-typed custom audience text never drops selected styles", () => {
    let p = choose(profileOf({ ageGroup: "25–34", style: ["Traditional", "Indo-Western"] }), WOMEN);
    for (const typed of ["Other: w", "Other: wo", "Other: women"]) p = choose(p, typed);
    assert.deepEqual(p.style, ["Traditional", "Indo-Western"]);
    assert.equal(getStylingContext(p).audience, "women");
  });

  console.log("\n[Audience resolution]");

  await test('"girlfriend" / "boyfriend" never resolve to a child', () => {
    for (const pronouns of ["styling for my girlfriend", "Other: my boyfriend's outfit", "girlfriends' brunch"]) {
      assert.equal(getStylingContext({ pronouns, gender: "", ageGroup: "25–34" }).isKids, false, pronouns);
      assert.equal(deriveGenderFromAudience(pronouns) === "girl" || deriveGenderFromAudience(pronouns) === "boy", false, pronouns);
    }
    assert.equal(getStylingContext({ pronouns: "for my girls", gender: "", ageGroup: "" }).isKids, true, "whole word still matches");
  });

  await test("explicit adult gender beats a stale kids age and loose text", () => {
    for (const ageGroup of ["6-10", "6–10", "15-19", "0–5"]) {
      assert.equal(getStylingContext({ pronouns: WOMEN, gender: "women", ageGroup }).audience, "women", ageGroup);
      assert.equal(getStylingContext({ pronouns: MEN, gender: "men", ageGroup }).audience, "men", ageGroup);
      // An adult audience text alone also beats the age
      assert.equal(getStylingContext({ pronouns: WOMEN, gender: "", ageGroup }).audience, "women", ageGroup);
    }
    assert.equal(getStylingContext({ pronouns: "Other: kids corner", gender: "women", ageGroup: "" }).audience, "women");
    const ctx = getStylingContext({ pronouns: WOMEN, gender: "women", ageGroup: "6-10" });
    assert.equal(ctx.ageGroup, "", "a kids age is not reported for an adult");
    // Kids age inference still applies when no adult audience was chosen — bare pronouns are not one
    assert.equal(getStylingContext({ pronouns: "", gender: "", ageGroup: "6-10" }).isKids, true);
    assert.equal(getStylingContext({ pronouns: "he/him", gender: "", ageGroup: "Kids (0–12)" }).isKids, true);
    assert.equal(getStylingContext({ pronouns: "she/her", gender: "", ageGroup: "6-10" }).isKids, true);
    assert.ok(kidsAgeGroupOptions.every((o) => isKidsAgeGroup(o.label)));
  });

  await test("Boys / Girls classification follows the selected audience", () => {
    const boy = getStylingContext({ pronouns: BOYS, gender: "boy", ageGroup: "6-10", customStyleNotes: "matching with my daughter's colours" });
    assert.equal(boy.gender, "boys");
    const girl = getStylingContext({ pronouns: GIRLS, gender: "girl", ageGroup: "6-10", customStyleNotes: "twinning with the boys" });
    assert.equal(girl.gender, "girls", "notes mentioning boys don't turn a girl into a boy");
    assert.equal(getStylingContext({ pronouns: "Kids / Children", gender: "unspecified", ageGroup: "0-5", customStyleNotes: "for my son" }).gender, "boys");
  });

  await test("stored profiles from before the fix are repaired on load", () => {
    const stale = profileOf({ pronouns: WOMEN, gender: "women", ageGroup: "6-10", style: ["Traditional"] });
    const repaired = repairStoredAudience(stale);
    assert.equal(repaired.ageGroup, "");
    assert.deepEqual(repaired.style, ["Traditional"], "styles untouched");
    const staleGender = profileOf({ pronouns: "Other: for my girlfriend", gender: "girl", ageGroup: "25–34" });
    assert.equal(repairStoredAudience(staleGender).gender, "");
    const fine = profileOf({ pronouns: GIRLS, gender: "girl", ageGroup: "6-10" });
    assert.equal(repairStoredAudience(fine), fine, "a consistent profile is returned as is");
  });

  console.log("\n[Selected styles are preserved]");

  await test("saveProfile no longer strips Traditional / Royal & Regal for Everyday or Vacation", () => {
    const src = readFileSync(path.join(__dirname, "../src/app/LetStyleApp.tsx"), "utf8");
    const save = src.slice(src.indexOf("const saveProfile"), src.indexOf("const openSettings"));
    assert.ok(save.length > 0);
    assert.ok(!/royal & regal|\.style\.filter|style: filteredStyles/i.test(save), "no style filtering in saveProfile");
  });

  await test("Traditional reaches the recommendation prompt for Everyday and Vacation occasions", () => {
    for (const occasion of ["Everyday", "Vacation"]) {
      const prompt = buildUserPrompt(profileOf({ pronouns: WOMEN, gender: "women", ageGroup: "25–34", occasion, style: ["Traditional"] }));
      const worlds = prompt.slice(prompt.indexOf("STYLE WORLDS CHOSEN IN THIS SESSION"), prompt.indexOf("SELECTED OPTIONS"));
      assert.match(worlds, /Style worlds: Traditional/, occasion);
      assert.match(worlds, /intentional preferences/);
      const stale = prompt.slice(prompt.indexOf("SELECTED OPTIONS"));
      assert.ok(!stale.includes("Style worlds"), "style worlds are not listed as possibly stale");
      assert.ok(stale.includes(`Occasion: ${occasion}`));
    }
  });

  console.log("\n[Recommendation prompts]");

  await test("the user's own request still comes first; custom Step 7 text is passed through", () => {
    const p = profileOf({ pronouns: MEN, gender: "men", ageGroup: "25–34", style: ["Traditional", "Other: Dark academia", "Other"], customStyleNotes: "Modern sleek cuts" });
    const prompt = buildUserPrompt(p);
    assert.ok(prompt.indexOf("Modern sleek cuts") < prompt.indexOf("STYLE WORLDS CHOSEN"));
    assert.match(prompt, /Style worlds: Traditional, Dark academia\n/);
    assert.deepEqual(selectedStyleWorlds(["Other"]), []);
    assert.match(prompt, /Age group: 25–34/);
    assert.match(buildUserPrompt({ ...p, ageGroup: "6-10" }), /Age group: Adult/, "a stale kids age is never sent for an adult");
  });

  await test("system and review prompts make selected traditional / fusion styles binding", () => {
    assert.match(SYSTEM_PROMPT, /style worlds were chosen by the user in this session and are intentional preferences/);
    assert.match(SYSTEM_PROMPT, /overrides a selected style world only where it explicitly rules that style out/, "generic notes refine, never silently override");
    assert.match(SYSTEM_PROMPT, /selected traditional \/ ethnic \/ festive style world makes the direction traditional, whatever the occasion/);
    assert.match(SYSTEM_PROMPT, /selected fusion \/ Indo-Western style world makes the direction fusion/);
    assert.match(SYSTEM_PROMPT, /TRADITIONAL & ETHNIC INTEGRITY \(applies to every look when the brief's styleDirection is "traditional"/);
    assert.match(SYSTEM_PROMPT, /user's own request wins/, "explicit conflicts in the request still win");
    assert.match(REVIEW_SYSTEM_PROMPT, /style worlds chosen in this session ARE requirements/);
  });

  console.log("\n[Image prompts]");

  const woman = profileOf({ pronouns: WOMEN, gender: "women", ageGroup: "25–34", style: ["Traditional", "Indo-Western"] });
  const traditionalSummer = lookOf({
    title: "Chanderi Anarkali",
    note: "Breathable chanderi for a summer holiday lunch",
    outfit: "Mint chanderi anarkali kurta with churidar and organza dupatta",
  });

  await test("a traditional summer / holiday look gets no Western-only or no-ethnic instruction", () => {
    for (const look of [traditionalSummer, { ...traditionalSummer, styleIntent: intent("traditional") }] as LookRecommendation[]) {
      const img = buildLookEditPrompt(look, woman, { occasion: "Everyday", details: "" }, null);
      assert.ok(!img.includes("RESORT CASUAL AUTHENTICITY"), "summer / holiday are not a vacation occasion");
      assert.ok(!/DO NOT render (heavy )?traditional/i.test(img));
      assert.ok(img.includes(`New outfit: ${traditionalSummer.outfit}`));
    }
  });

  await test("a traditional look for a real vacation keeps its ethnic garments", () => {
    const look = { ...traditionalSummer, styleIntent: intent("traditional", "Goa vacation") } as LookRecommendation;
    const img = buildLookEditPrompt(look, woman, { occasion: "Vacation", details: "" }, null);
    assert.ok(img.includes("OCCASION SETTING: This look is for a relaxed vacation / resort occasion"));
    assert.ok(img.includes("including any traditional or ethnic pieces"));
    assert.ok(!/DO NOT render (heavy )?traditional/i.test(img), "never a no-ethnic rule for a traditional direction");
    const boyLook = { ...look, outfit: "Linen kurta-pyjama set" } as LookRecommendation;
    const boy = profileOf({ pronouns: BOYS, gender: "boy", ageGroup: "6-10" });
    assert.ok(!/NO kurta/.test(buildLookEditPrompt(boyLook, boy, { occasion: "Vacation", details: "" }, null)));
  });

  await test("an explicitly western vacation look keeps its resort restrictions", () => {
    const look = lookOf({ title: "Linen resort set", outfit: "Linen co-ord", styleIntent: intent("western", "Beach vacation") } as Partial<LookRecommendation>);
    const img = buildLookEditPrompt(look, woman, { occasion: "Vacation", details: "" }, null);
    assert.ok(img.includes("OCCASION & RESORT CASUAL AUTHENTICITY"));
    assert.ok(!buildLookEditPrompt(lookOf({ title: "Office day", outfit: "Linen resort shirt" }), woman, { occasion: "Office", details: "" }, null).includes("RESORT"), "a garment name is not an occasion");
  });

  await test("Fusion applies per look, not because the profile selected Indo-Western", () => {
    const mixed = intent("mixed");
    const traditional = { ...traditionalSummer, styleIntent: mixed } as LookRecommendation;
    const fusion = lookOf({ title: "Indo-Western cape set", outfit: "Embellished bustier with dhoti pants and sheer cape", styleIntent: mixed } as Partial<LookRecommendation>);
    const ctxArg = { occasion: "Party", details: "Latest Indo-Western look" };
    assert.ok(!buildLookEditPrompt(traditional, woman, ctxArg, null).includes("INDO-WESTERN FUSION"), "the traditional look stays traditional");
    assert.ok(buildLookEditPrompt(fusion, woman, ctxArg, null).includes("INDO-WESTERN FUSION"), "the fusion look is rendered as fusion");
    const fusionBrief = { ...traditionalSummer, styleIntent: intent("fusion") } as LookRecommendation;
    assert.ok(buildLookEditPrompt(fusionBrief, woman, ctxArg, null).includes("INDO-WESTERN FUSION"), "a fusion brief applies to its looks");
    const asymmetricTraditional = lookOf({ outfit: "Asymmetric angrakha kurta with dhoti", styleIntent: intent("traditional") } as Partial<LookRecommendation>);
    const man = profileOf({ pronouns: MEN, gender: "men", ageGroup: "25–34" });
    assert.ok(!buildLookEditPrompt(asymmetricTraditional, man, ctxArg, null).includes("INDO-WESTERN FUSION"), "a traditional cut is not forced into cigarette trousers");
  });

  await test("the image styling agent never calls an adult a child", async () => {
    const realFetch = globalThis.fetch;
    const bodies: string[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ error: { message: "offline" } }), { status: 400, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const adult = profileOf({ pronouns: WOMEN, gender: "women", ageGroup: "" });
      await buildLookImagePrompt({ look: traditionalSummer, profile: adult, context: { occasion: "Everyday", details: "" }, photoUrl: "data:image/jpeg;base64,eA==", siblingVibes: [] });
      const sent = bodies.join(" ");
      assert.ok(sent.includes("Subject Demographic: Adult Woman (Age group: adult)"), "adult with no age stated");
      assert.ok(!sent.includes("(Age group: child)"));
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  console.log("\n[Audience-specific onboarding options]");

  const labels = (p: SkinTuneProfile) => styleOptionsForProfile(p).map((o) => o.label);
  const forAudience = (pronouns: string, ageGroup: string) => choose(profileOf({ ageGroup }), pronouns);

  await test("each audience gets its own Step 7 style worlds", () => {
    assert.deepEqual(labels(forAudience(WOMEN, "25–34")), ["Elegant", "Glamorous", "Minimal", "Romantic & Soft", "Old Money", "Indo-Western", "Traditional", "Modern"]);
    assert.deepEqual(labels(forAudience(MEN, "25–34")), ["Classic & Timeless", "Smart Casual", "Formal & Tailored", "Streetwear", "Minimal", "Old Money", "Traditional", "Indo-Western"]);
    assert.deepEqual(labels(forAudience(BOYS, "6-10")), ["Cute & Playful", "Smart Casual", "Traditional & Festive", "Mini Gentleman", "Comfortable Everyday", "Sporty"]);
    assert.deepEqual(labels(forAudience(GIRLS, "6-10")), ["Cute & Playful", "Princess & Party", "Floral & Pastel", "Traditional & Festive", "Casual & Comfy", "Modern"]);
    assert.equal(getOnboardingAudience(forAudience("Other: for my girlfriend", "25–34")), "neutral");
    assert.ok(labels(forAudience("Other: for my girlfriend", "25–34")).length > 0, "a custom audience still gets options");
  });

  await test("each audience gets its own Step 8 quick tags", () => {
    const tags = {
      women: quickTagsForProfile(forAudience(WOMEN, "25–34")),
      men: quickTagsForProfile(forAudience(MEN, "25–34")),
      boys: quickTagsForProfile(forAudience(BOYS, "6-10")),
      girls: quickTagsForProfile(forAudience(GIRLS, "6-10")),
    };
    const sets = Object.values(tags).map((t) => t.join("|"));
    assert.equal(new Set(sets).size, 4, "four different tag sets");
    assert.ok(tags.men.every((t) => !/saree|lehenga|dress|jewellery/i.test(t)), "no women's prompts for men");
    for (const kids of [tags.boys, tags.girls]) {
      assert.ok(kids.every((t) => !/power suit|saree|statement jewellery|sleek cuts/i.test(t)), "no adult prompts for kids");
    }
    assert.ok(tags.boys.every((t) => !/dress|lehenga|hair accessor/i.test(t)), "no girls' prompts for boys");
  });

  await test("the Other / custom option stays available on Steps 7 and 8", () => {
    const src = readFileSync(path.join(__dirname, "../src/app/LetStyleApp.tsx"), "utf8");
    const step7 = src.slice(src.indexOf("'body-style': ("), src.indexOf("'custom-style': ("));
    assert.match(step7, /options: styleOptionsForProfile\(profile\)/);
    assert.match(step7, /allowOther: true/);
    const step8 = readFileSync(path.join(__dirname, "../src/features/onboarding/components/CustomStyleStep.tsx"), "utf8");
    assert.match(step8, /quickTagsForProfile\(profile\)/);
    assert.match(step8, /textarea/, "free-text description remains");
  });

  console.log(`\nAll ${passed} audience & style preference checks passed.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
