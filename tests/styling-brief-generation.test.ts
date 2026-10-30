import assert from "node:assert/strict";
import type OpenAI from "openai";
import { logger } from "../src/lib/logger";
import {
  REVIEW_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildUserPrompt,
  generateLookRecommendations,
} from "../src/lib/recommendation-prompt";
import { getLookRecommendations } from "../src/features/recommendations/services/recommendation-engine";
import { buildLookEditPrompt } from "../src/lib/image-prompt";
import type { LookRecommendation, SkinTuneProfile } from "../src/lib/skintune-schemas";
logger.level = "fatal";

// Deterministic, fully mocked: these tests verify the generation PIPELINE (what the model is
// given, how its output is reviewed and corrected), never which outfit is chosen — that decision
// belongs to the model. Live multi-scenario evidence is produced separately.

console.log("======================================================================");
console.log("REGRESSION TEST SUITE: DYNAMIC STYLING-BRIEF GENERATION PIPELINE");
console.log("======================================================================");

const profileOf = (patch: Partial<SkinTuneProfile>): SkinTuneProfile =>
  ({
    name: "Test",
    pronouns: "",
    gender: "",
    ageGroup: "",
    height: "",
    photoUrl: "",
    bodyPhotoUrl: "",
    appearance: { skinTone: "Medium", undertone: "Warm", confidence: 90, contrast: "Medium" },
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
    ...patch,
  }) as SkinTuneProfile;

// Diverse profiles: different audiences, ages, occasions, themes, cultures and constraints
const scenarios: Record<string, SkinTuneProfile> = {
  bohoBirthdayGirlWithStaleTags: profileOf({
    pronouns: "Kids / Girls styling", gender: "girl", ageGroup: "6-10",
    style: ["Minimal", "Creative", "Boho & Free-Spirited", "Traditional"], occasion: "Festival",
    colorsLove: ["Teal pastel", "Dusty rose", "Sage green"],
    customStyleNotes: "get girl dressed for birthday party with theme boho; comfortable breathable fabrics",
  }),
  garbaGirlNoNotes: profileOf({ pronouns: "Kids / Girls styling", gender: "girl", ageGroup: "6-10", occasion: "Garba Night", style: ["Traditional"] }),
  diwaliBoy: profileOf({ pronouns: "Kids / Boys styling", gender: "boy", ageGroup: "11-15", occasion: "Diwali", customStyleNotes: "festive traditional wear with rich embroidery" }),
  casualWoman: profileOf({ pronouns: "she/her/women", gender: "female", ageGroup: "25–34", occasion: "Everyday", style: ["Casual"], customStyleNotes: "comfy denim for weekend brunch" }),
  weddingManNoEthnic: profileOf({ pronouns: "he/him/men", gender: "male", ageGroup: "35–49", occasion: "Wedding", style: ["Traditional"], customStyleNotes: "no ethnic please, sharp western suit for the reception" }),
  unisexKidDinosaur: profileOf({ pronouns: "Kids / Children’s styling (Unisex)", ageGroup: "0-5", occasion: "Everyday", customStyleNotes: "dinosaur theme for a playdate, soft organic cotton" }),
};

type Piece = { category: string; name: string; detail: string };
const fixtureLook = (i: number, outfit: string, pieces: Piece[]) =>
  ({
    id: `look-0${i}`,
    title: `Fixture look ${i}`,
    note: "Fixture note",
    category: "",
    vibe: `vibe${i}`,
    personaEnergy: "Fixture energy.",
    palette: ["#111111", "#222222", "#333333"],
    pieces,
    outfit,
    outfitColor: "Fixture colour",
    jewellery: "None",
    hairstyle: "Fixture hair",
    makeup: "None",
    accessories: "Fixture accessory",
    footwear: "Fixture footwear",
    reasoning: ["a", "b", "c"],
    confidence: 90,
    applicableCategories: ["outfit"],
  }) as Omit<LookRecommendation, "imageUrl">;

const fiveLooks = (tag: string) =>
  [1, 2, 3, 4, 5].map((i) =>
    fixtureLook(i, `${tag} garment ${i}`, [
      { category: "Outfit", name: `${tag} garment ${i}`, detail: "" },
      { category: "Footwear", name: "Fixture shoes", detail: "" },
      { category: "Accessories", name: "Fixture bag", detail: "" },
    ]),
  );

const brief = (direction: string) => ({
  effectiveOccasion: "fixture occasion",
  occasionReasoning: "fixture",
  themeOrAesthetic: "fixture theme",
  styleDirection: direction,
  styleDirectionReasoning: "fixture",
  mustInclude: [],
  mustAvoid: [],
  resolvedConflicts: [],
});

type Msg = { role: string; content: string };
type Call = { messages: Msg[]; response_format: { json_schema: { name: string; schema: Record<string, unknown> } } };

/** Mock OpenAI: generation calls return `gens` in order; review calls return `reviews` in order. */
function mockClient(gens: unknown[], reviews: Array<unknown | Error>) {
  const calls: Call[] = [];
  let g = 0;
  let r = 0;
  const client = {
    chat: {
      completions: {
        create: async (params: Call) => {
          calls.push(params);
          const isReview = params.response_format.json_schema.name === "skintune_look_review";
          const payload = isReview ? reviews[r++] : gens[g++];
          if (payload instanceof Error) throw payload;
          return { choices: [{ message: { content: JSON.stringify(payload) } }] };
        },
      },
    },
  } as unknown as OpenAI;
  return { client, calls };
}

const reviewOf = (failedRequirement: (i: number) => string | null, extra: Partial<Record<"audienceAppropriate" | "titleGarmentsInOutfit" | "outfitNamesAllClothingPieces", boolean>> = {}) => ({
  requirements: ["fixture requirement"],
  reviews: [1, 2, 3, 4, 5].map((i) => {
    const failed = failedRequirement(i);
    return {
      lookId: `look-0${i}`,
      requirementChecks: [{ requirement: failed ?? "fixture requirement", satisfied: !failed, evidence: failed ? "fixture evidence" : "ok" }],
      audienceAppropriate: true,
      titleGarmentsInOutfit: true,
      outfitNamesAllClothingPieces: true,
      ...(i === 1 ? extra : {}),
    };
  }),
});
const pass = reviewOf(() => null);
const failing = (n: number, requirement: string) => reviewOf((i) => (i <= n ? requirement : null));

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) ?? []);

async function main() {
  // -----------------------------------------------------------------------------
  console.log("\n[Test 1] The user prompt injects nothing beyond the profile's own values...");
  const templateWords = words(buildUserPrompt(profileOf({})));
  for (const [name, p] of Object.entries(scenarios)) {
    const prompt = buildUserPrompt(p);
    const profileWords = words(JSON.stringify(p));
    const injected = [...words(prompt)].filter((w) => !templateWords.has(w) && !profileWords.has(w));
    // The audience label is the only computed text (derived from pronouns/gender/age)
    const allowed = new Set(["boy", "girl", "child", "adult", "man", "woman", "unspecified", "gender", "kids", "men", "women", "neutral"]);
    assert.deepEqual(injected.filter((w) => !allowed.has(w)), [], `${name}: prompt contains code-injected words`);
    if (p.customStyleNotes) {
      assert.ok(prompt.indexOf(p.customStyleNotes) < prompt.indexOf("SELECTED OPTIONS"), `${name}: the user's request comes first, verbatim`);
    }
    assert.ok(prompt.includes(`Age group: ${p.ageGroup}`), `${name}: age group preserved`);
  }
  assert.ok(buildUserPrompt(scenarios.bohoBirthdayGirlWithStaleTags).includes("Girl (child)"));
  assert.ok(buildUserPrompt(scenarios.diwaliBoy).includes("Boy (child)"));
  assert.ok(buildUserPrompt(scenarios.garbaGirlNoNotes).includes("(none provided — rely on the selected options below)"));
  console.log(`✓ Test 1 Passed (${Object.keys(scenarios).length} diverse profiles)`);

  // -----------------------------------------------------------------------------
  console.log("\n[Test 2] The system prompts contain no occasion- or theme-specific outfit rules...");
  const occasionNames = /\b(garba|navratri|dandiya|diwali|wedding|birthday|vacation|beach|resort|goa|office|corporate|party|cocktail|date night|boho)\b/i;
  assert.ok(!occasionNames.test(SYSTEM_PROMPT), `SYSTEM_PROMPT must not encode occasion rules: ${SYSTEM_PROMPT.match(occasionNames)?.[0]}`);
  assert.ok(!occasionNames.test(REVIEW_SYSTEM_PROMPT));
  assert.ok(/traditional, western, fusion, mixed, or other/.test(SYSTEM_PROMPT), "All style directions remain available");
  assert.ok(/user's own request wins/.test(SYSTEM_PROMPT), "User's request outranks possibly stale selections");
  console.log("✓ Test 2 Passed");

  // -----------------------------------------------------------------------------
  console.log("\n[Test 3] Generation asks the model to interpret the request first, then reviews the result...");
  let m = mockClient([{ styleBrief: brief("western"), recommendations: fiveLooks("A") }], [pass]);
  let res = await generateLookRecommendations(m.client, scenarios.bohoBirthdayGirlWithStaleTags);
  assert.equal(m.calls.length, 2, "One generation + one review");
  const genSchema = m.calls[0].response_format.json_schema.schema as { required: string[] };
  assert.deepEqual(genSchema.required, ["styleBrief", "recommendations"], "The model must output its own interpretation");
  assert.equal(m.calls[1].response_format.json_schema.name, "skintune_look_review");
  assert.ok(m.calls[1].messages[1].content.includes(scenarios.bohoBirthdayGirlWithStaleTags.customStyleNotes), "Reviewer sees the user's own words");
  assert.ok(m.calls[1].messages[1].content.includes('"styleDirection":"western"'), "Reviewer sees the model's brief");
  assert.equal(res.attempts, 1);
  assert.deepEqual(res.remainingIssues, []);
  assert.equal(res.styleBrief.styleDirection, "western");
  console.log("✓ Test 3 Passed");

  // -----------------------------------------------------------------------------
  console.log("\n[Test 4] Reviewer issues trigger one targeted, re-reviewed correction...");
  m = mockClient(
    [{ styleBrief: brief("traditional"), recommendations: fiveLooks("First") }, { styleBrief: brief("western"), recommendations: fiveLooks("Second") }],
    [failing(3, "theme expressed in garments"), pass],
  );
  res = await generateLookRecommendations(m.client, scenarios.bohoBirthdayGirlWithStaleTags);
  assert.equal(m.calls.length, 4, "generate, review, correct, re-review");
  const correction = m.calls[2].messages.at(-1)!.content;
  assert.ok(correction.includes("look-01: does not satisfy \"theme expressed in garments\" (fixture evidence)"), "Correction quotes the reviewer's concrete issues");
  assert.ok(correction.includes("revise the styleBrief if it misread the request"));
  assert.ok(res.looks[0].outfit.startsWith("Second"), "The corrected, issue-free result is returned");
  assert.equal(res.attempts, 2);

  m = mockClient(
    [{ styleBrief: brief("western"), recommendations: fiveLooks("First") }, { styleBrief: brief("western"), recommendations: fiveLooks("Second") }],
    [failing(1, "minor"), failing(5, "worse")],
  );
  res = await generateLookRecommendations(m.client, scenarios.casualWoman);
  assert.ok(res.looks[0].outfit.startsWith("First"), "A worse correction is discarded");
  assert.deepEqual(res.remainingIssues, ["look-01: does not satisfy \"minor\" (fixture evidence)"]);

  m = mockClient([{ styleBrief: brief("western"), recommendations: fiveLooks("Only") }, { styleBrief: brief("western"), recommendations: fiveLooks("Fixed") }], [reviewOf(() => null, { titleGarmentsInOutfit: false }), pass]);
  res = await generateLookRecommendations(m.client, scenarios.casualWoman);
  assert.ok(m.calls[2].messages.at(-1)!.content.includes("look-01: title/note names a garment missing from the outfit field"), "Structural inconsistency alone triggers a correction");
  assert.ok(res.looks[0].outfit.startsWith("Fixed"));

  m = mockClient([{ styleBrief: brief("fusion"), recommendations: fiveLooks("Only") }], [new Error("reviewer down")]);
  res = await generateLookRecommendations(m.client, scenarios.diwaliBoy);
  assert.equal(m.calls.length, 2, "A failed review does not block generation");
  assert.ok(res.looks[0].outfit.startsWith("Only"));

  m = mockClient([{ recommendations: fiveLooks("NoBrief") }], [pass]);
  await assert.rejects(generateLookRecommendations(m.client, scenarios.casualWoman), "Output without an interpretation is rejected");
  console.log("✓ Test 4 Passed");

  // -----------------------------------------------------------------------------
  console.log("\n[Test 5] A failed AI call never substitutes pre-made looks for a custom request...");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 })) as typeof fetch;
  try {
    await assert.rejects(getLookRecommendations(scenarios.bohoBirthdayGirlWithStaleTags), /custom styling request needs live AI styling/);
    const noNotes = await getLookRecommendations(scenarios.garbaGirlNoNotes);
    assert.ok(noNotes.length > 0, "Profiles without a custom request keep the existing offline fallback");
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log("✓ Test 5 Passed");

  // -----------------------------------------------------------------------------
  console.log("\n[Test 6] The visualisation renders the generated look, not a stale selected occasion...");
  const twoPiece = fixtureLook(1, "Fixture top with fixture bottom", [
    { category: "Top", name: "Fixture top", detail: "" },
    { category: "Bottom", name: "Fixture bottom", detail: "" },
    { category: "Footwear", name: "Fixture shoes", detail: "" },
    { category: "Jewellery", name: "Fixture studs", detail: "" },
  ]) as LookRecommendation;
  const girl = scenarios.bohoBirthdayGirlWithStaleTags;
  const img = buildLookEditPrompt(twoPiece, girl, { occasion: "Garba Night", details: girl.customStyleNotes }, null);
  assert.ok(img.includes("render exactly these clothing pieces together as this one outfit, with no substitutions: Fixture top; Fixture bottom."), "All clothing pieces, and only clothing, are listed");
  assert.ok(!img.includes("CULTURAL OCCASION AUTHENTICITY"), "A stale selected occasion cannot force occasion-specific garments");
  assert.ok(img.includes(`described in the user's own styling request ("${girl.customStyleNotes}")`), "The user's request governs the setting");
  assert.ok(img.includes("young GIRL child"), "Demographic preserved");

  const lookSaysGarba = { ...twoPiece, note: "Twirl-ready look for Garba night" } as LookRecommendation;
  assert.ok(buildLookEditPrompt(lookSaysGarba, scenarios.garbaGirlNoNotes, { occasion: "Garba Night", details: "" }, null).includes("CULTURAL OCCASION AUTHENTICITY"), "Occasion rules still apply when the generated look itself is for that occasion");
  console.log("✓ Test 6 Passed");

  console.log("\n======================================================================");
  console.log("ALL DYNAMIC STYLING-BRIEF PIPELINE TESTS PASSED");
  console.log("======================================================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
