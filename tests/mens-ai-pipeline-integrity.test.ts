import assert from "node:assert/strict";
import type OpenAI from "openai";
import { logger } from "../src/lib/logger";
import { SYSTEM_PROMPT, attachStyleIntent, buildUserPrompt, generateLookRecommendations, toStyleIntent } from "../src/lib/recommendation-prompt";
import { getLookRecommendations } from "../src/features/recommendations/services/recommendation-engine";
import { buildLookEditPrompt, formatStyleIntent } from "../src/lib/image-prompt";
import { getApplicableCategories, planRequirementSpecs } from "../src/lib/product-search";
import type { LookRecommendation, SkinTuneProfile } from "../src/lib/skintune-schemas";
logger.level = "fatal";

console.log("======================================================================");
console.log("MEN'S STYLING: AI OUTPUT IS NEVER OVERRIDDEN BY FALLBACK DATA");
console.log("======================================================================");

// Fully offline: the model and the recommendations endpoint are mocked. The model's output is
// generated from word lists, so the test proves the pipeline carries WHATEVER the model returns.

const profileOf = (patch: Partial<SkinTuneProfile>): SkinTuneProfile =>
  ({
    name: "T", pronouns: "Men’s styling", gender: "men", ageGroup: "25–34", height: "", photoUrl: "", bodyPhotoUrl: "",
    appearance: { skinTone: "Medium", undertone: "Warm", confidence: 90, contrast: "Medium" },
    bodyBuild: "", fit: "", style: [], colorsLove: [], colorsAvoid: [], restrictions: [],
    occasion: "", impression: [], budget: "", customStyleNotes: "", ...patch,
  }) as SkinTuneProfile;

let seed = 11;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const TOPS = ["Boxy Heavyweight Tee", "Waffle Knit Polo", "Band-Collar Linen Shirt", "Mandarin Collar Kurta", "Cable-Knit Crewneck", "Oxford Button-Down"];
const BOTTOMS = ["Wide-Leg Raw Denim", "Pleated Wool Trousers", "Drawcord Linen Trousers", "Tapered Cigarette Trousers", "Relaxed Cargo Pants"];
const LAYERS = ["Unstructured Hopsack Blazer", "Utility Overshirt", "Silk Nehru Jacket", "Chore Coat"];
const SHOES = ["Suede Chelsea Boots", "Court Sneakers", "Leather Monk Straps", "Woven Espadrilles", "Leather Mojaris"];
const COLOURS = ["Slate", "Oat", "Olive", "Ink Navy", "Rust", "Ecru"];

/** A model-authored look; every field is generated, nothing about it is known to the code under test. */
const modelLook = (i: number) => {
  const c = pick(COLOURS);
  const top = `${c} ${pick(TOPS)}`;
  const bottom = `${pick(COLOURS)} ${pick(BOTTOMS)}`;
  const layer = `${pick(COLOURS)} ${pick(LAYERS)}`;
  const shoe = `${pick(COLOURS)} ${pick(SHOES)}`;
  return {
    id: `look-0${i}`, title: `Model look ${i} ${c}`, note: `Model note ${i}`, category: "", vibe: `vibe${i}`,
    personaEnergy: "Model energy.", palette: ["#111111", "#222222", "#333333"],
    pieces: [
      { category: "Layer", name: layer, detail: "" }, { category: "Top", name: top, detail: "" },
      { category: "Bottom", name: bottom, detail: "" }, { category: "Footwear", name: shoe, detail: "" },
    ],
    outfit: `${layer} over ${top} with ${bottom}`, outfitColor: c, jewellery: "None", hairstyle: `Model hair ${i}`,
    makeup: "Clean natural grooming", accessories: "None", footwear: shoe,
    reasoning: ["a", "b", "c"], confidence: 90, applicableCategories: ["outfit", "footwear", "accessories", "jewellery"],
  };
};
const modelBrief = (occasion: string, theme: string) => ({
  effectiveOccasion: occasion, occasionReasoning: "m", themeOrAesthetic: theme, styleDirection: "western" as const,
  styleDirectionReasoning: "m", sareeAesthetic: "not_requested" as const, mustInclude: [] as string[], mustAvoid: [] as string[], resolvedConflicts: [] as string[],
});
const passReview = { requirements: [], reviews: [], batchVariety: { variedBeyondColour: true, evidence: "ok" } };

function mockModel(looks: unknown[], occasion = "x", theme = "y") {
  const calls: Array<{ messages: Array<{ role: string; content: string }>; response_format: { json_schema: { name: string } } }> = [];
  const client = {
    chat: {
      completions: {
        create: async (p: (typeof calls)[number]) => {
          calls.push(p);
          const isReview = p.response_format.json_schema.name === "skintune_look_review";
          return { choices: [{ message: { content: JSON.stringify(isReview ? passReview : { styleBrief: modelBrief(occasion, theme), recommendations: looks }) } }] };
        },
      },
    },
  } as unknown as OpenAI;
  return { client, calls };
}

async function main() {
  // -------------------------------------------------------------------------
  console.log("\n[Test 1] A successful AI generation is returned exactly as the model wrote it...");
  for (let run = 0; run < 6; run++) {
    const looks = [1, 2, 3, 4, 5].map(modelLook);
    const { client } = mockModel(looks);
    const res = await generateLookRecommendations(client, profileOf({ occasion: pick(["Office", "Wedding", "Vacation", "Date", "Everyday"]) }));
    assert.deepEqual(res.looks, looks, "No template, fallback suite or post-processing alters the model's looks");
  }
  console.log("✓ Test 1 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 2] Different preferences reach the model; the same occasion can yield different looks...");
  const variants = [
    profileOf({ occasion: "Office", style: ["Minimal"], bodyBuild: "Slim", fit: "Fitted", colorsLove: ["Olive"], customStyleNotes: "quiet tonal looks, no logos" }),
    profileOf({ occasion: "Office", style: ["Streetwear & Edgy"], bodyBuild: "Broad", fit: "Oversized", colorsLove: ["Rust"], customStyleNotes: "creative studio, relaxed" }),
    profileOf({ occasion: "Office", style: ["Old Money"], bodyBuild: "Athletic", fit: "Regular", colorsLove: ["Ink navy"] }),
  ];
  const prompts = variants.map(buildUserPrompt);
  assert.equal(new Set(prompts).size, 3, "Every preference change changes what the model is asked");
  for (const [i, v] of variants.entries()) {
    for (const value of [v.style[0], v.bodyBuild, v.fit, v.colorsLove[0]]) assert.ok(prompts[i].includes(value), `"${value}" reaches the model`);
    if (v.customStyleNotes) assert.ok(prompts[i].includes(v.customStyleNotes), "The user's own request is passed verbatim");
  }
  // Which looks come back is decided only by the model: the menswear guidance has no occasion rules
  const guidance = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf("MENSWEAR STYLING EXPERTISE"), SYSTEM_PROMPT.indexOf("AUDIENCE & DEMOGRAPHIC INTEGRITY"));
  assert.ok(!/\b(office|wedding|vacation|party|date night|sangeet|puja|groom)\b/i.test(guidance), "No occasion-to-outfit rules in the menswear guidance");
  console.log("✓ Test 2 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 3] The generation prompt carries principles, not outfits to copy...");
  const menSection = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf("MENSWEAR STYLING EXPERTISE"), SYSTEM_PROMPT.indexOf("AUDIENCE & DEMOGRAPHIC INTEGRITY"));
  assert.match(menSection, /only when the audience is an adult man/);
  assert.match(menSection, /never fall back on a default formula/i);
  assert.match(menSection, /no fixed slot or template per look/i);
  const withoutBannedFormula = menSection.replace(/shirt \+ chinos?(?: trousers)? \+ loafers/g, "");
  assert.ok(!/\b(bandhgala|sherwani|achkan|chelsea|loafers?|oxfords?|cargo|espadrilles?|blazers?)\b/i.test(withoutBannedFormula), "No garment or shoe is named as an example to copy (only the banned formula is quoted)");
  console.log("✓ Test 3 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 4] Men never get pre-made looks; women/kids keep their existing fallback...");
  const realFetch = globalThis.fetch;
  const aiLooks = [1, 2, 3, 4, 5].map((i) => ({ ...modelLook(i), imageUrl: "/replace-with-generated/pending.webp" }));
  const plain = profileOf({ occasion: "Office" });
  const withNotes = profileOf({ occasion: "Office", customStyleNotes: "relaxed creative studio" });
  try {
    let fetchCalls = 0;
    globalThis.fetch = (async () => { fetchCalls++; return new Response(JSON.stringify({ recommendations: aiLooks }), { status: 200 }); }) as typeof fetch;
    for (const p of [plain, withNotes]) {
      const got = await getLookRecommendations(p);
      assert.deepEqual(got, aiLooks, "A successful AI response is returned untouched");
    }
    assert.equal(fetchCalls, 2);

    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "down" }), { status: 503 })) as typeof fetch;
    await assert.rejects(getLookRecommendations(withNotes), /needs live AI styling/, "A custom request is never answered with pre-made looks");
    // Men: even without custom notes, a clear retry error replaces fixed outfits
    for (const occasion of ["Office", "Wedding", "Vacation", "Date"]) {
      await assert.rejects(
        getLookRecommendations(profileOf({ occasion })),
        /Men's styling needs live AI styling.*Please try again/,
        `men / ${occasion}: retry error, no fixed outfits`,
      );
    }
    // Women and kids keep the existing fallback behaviour, only after an AI failure
    const woman = profileOf({ pronouns: "Women’s styling", gender: "women", occasion: "Office" });
    const girl = profileOf({ pronouns: "Kids / Girls styling", gender: "girl", ageGroup: "6-10", occasion: "Everyday" });
    for (const p of [woman, girl]) {
      const fallback = await getLookRecommendations(p);
      assert.ok(
        fallback.length > 0 && !fallback.some((l) => aiLooks.some((a) => a.id === l.id && a.title === l.title)),
        "Fallback is used only after an AI failure",
      );
    }

    // An empty AI answer is also a failure, not a success to merge with fallback data
    globalThis.fetch = (async () => new Response(JSON.stringify({ recommendations: [] }), { status: 200 })) as typeof fetch;
    await assert.rejects(getLookRecommendations(withNotes), /needs live AI styling/);
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log("✓ Test 4 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 5] Image prompt and product requirements derive from the final AI-generated look...");
  for (let i = 1; i <= 6; i++) {
    const look = modelLook(i) as unknown as LookRecommendation;
    const profile = profileOf({ occasion: pick(["Office", "Wedding", "Vacation"]), bodyBuild: "Athletic", fit: "Relaxed" });
    const img = buildLookEditPrompt(look, profile, { occasion: profile.occasion, details: "" }, null);
    assert.ok(img.includes(`New outfit: ${look.outfit}`), "Image prompt renders the AI's outfit");
    assert.ok(img.includes(`Footwear: ${look.footwear}`), "...and its footwear");
    for (const p of look.pieces.filter((x) => !/foot/i.test(x.category))) assert.ok(img.includes(p.name), `Garment "${p.name}" is in the render brief`);
    assert.ok(img.includes(`New hairstyle: ${look.hairstyle}`));
    assert.ok(img.includes("Preserve their natural build (Athletic)"));

    const specs = planRequirementSpecs(look, profile, "man", getApplicableCategories("man"));
    const planned = specs.map((s) => `${s.itemTitle} ${s.searchQuery}`.toLowerCase()).join(" | ");
    for (const p of look.pieces.filter((x) => /top|bottom|layer/i.test(x.category))) {
      const colourWord = p.name.split(" ")[0].toLowerCase();
      assert.ok(planned.includes(colourWord), `Requirement for "${p.name}" keeps its colour "${colourWord}"`);
    }
    assert.ok(specs.filter((s) => s.category === "outfit").length >= 3, "Layer, top and bottom each get a requirement");
    assert.ok(specs.every((s) => s.targetGender === "men"), "Every requirement stays men's");
    const foot = specs.find((s) => s.category === "footwear");
    assert.ok(foot && foot.itemTitle.toLowerCase().includes(look.footwear.split(" ").slice(-1)[0].toLowerCase()), `Footwear requirement follows "${look.footwear}"`);
  }
  console.log("✓ Test 5 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 6] The reviewed styling brief reaches image generation without overriding the look...");
  const brief = {
    ...modelBrief("Evening reception", "quiet tonal minimalism"),
    mustInclude: ["no logos", "breathable fabrics"],
    mustAvoid: ["loud prints"],
    resolvedConflicts: ["x"],
    occasionReasoning: "long reasoning that must not travel",
  };
  // (a) The brief that produced the returned looks is the reviewed one (after a correction, the corrected brief)
  const first = [1, 2, 3, 4, 5].map(modelLook);
  const second = [1, 2, 3, 4, 5].map(modelLook);
  const reviewFails = {
    requirements: ["r"],
    reviews: [1, 2, 3, 4, 5].map((i) => ({
      lookId: `look-0${i}`,
      requirementChecks: [{ requirement: "r", satisfied: i !== 1, evidence: "e" }],
      audienceAppropriate: true, titleGarmentsInOutfit: true, outfitNamesAllClothingPieces: true,
    })),
    batchVariety: { variedBeyondColour: true, evidence: "ok" },
  };
  let genN = 0;
  let revN = 0;
  const twoPass = {
    chat: { completions: { create: async (p: { response_format: { json_schema: { name: string } } }) => {
      if (p.response_format.json_schema.name === "skintune_look_review") {
        return { choices: [{ message: { content: JSON.stringify(revN++ === 0 ? reviewFails : passReview) } }] };
      }
      const isFirst = genN++ === 0;
      return { choices: [{ message: { content: JSON.stringify({ styleBrief: isFirst ? modelBrief("First occasion", "first theme") : brief, recommendations: isFirst ? first : second }) } }] };
    } } },
  } as unknown as OpenAI;
  const reviewed = await generateLookRecommendations(twoPass, profileOf({ occasion: "Wedding" }));
  assert.equal(reviewed.attempts, 2);
  assert.equal(reviewed.styleBrief.effectiveOccasion, "Evening reception");
  const attached = attachStyleIntent(reviewed.looks, reviewed.styleBrief);
  assert.equal(attached.length, 5);
  for (const [i, look] of attached.entries()) {
    const { styleIntent, ...rest } = look;
    assert.deepEqual(rest, reviewed.looks[i], "Attaching the intent never alters the AI's look");
    assert.equal(styleIntent.effectiveOccasion, "Evening reception");
    assert.deepEqual(styleIntent.mustInclude, ["no logos", "breathable fabrics"]);
    assert.ok(!JSON.stringify(styleIntent).includes("must not travel"), "Free-text reasoning is not forwarded");
  }
  // (b) Bounded: an oversized brief cannot bloat an image request
  const huge = toStyleIntent({
    ...brief,
    themeOrAesthetic: "x".repeat(5000),
    mustInclude: Array.from({ length: 40 }, (_, i) => `req ${i} ${"y".repeat(900)}`),
  });
  assert.ok(huge.themeOrAesthetic.length <= 240 && huge.mustInclude.length <= 8 && huge.mustInclude.every((m) => m.length <= 240));
  // (c) The render prompt carries the intent as background and keeps every look instruction
  const look = { ...attached[0], imageUrl: "/p" } as unknown as LookRecommendation;
  const profile = profileOf({ occasion: "Wedding", bodyBuild: "Broad", fit: "Relaxed" });
  const ctxArg = { occasion: "Wedding", details: "" };
  const withIntent = buildLookEditPrompt(look, profile, ctxArg, null);
  const bare = { ...look } as LookRecommendation & { styleIntent?: unknown };
  delete bare.styleIntent;
  const withoutIntent = buildLookEditPrompt(bare as LookRecommendation, profile, ctxArg, null);
  assert.ok(withIntent.includes("REVIEWED STYLING INTENT") && withIntent.includes("occasion: Evening reception") && withIntent.includes("the person asked to avoid: loud prints"));
  assert.ok(withIntent.includes("authoritative and must be rendered exactly as given"), "The look outranks the brief");
  const squash = (t: string) => t.replace(/\s{2,}/g, " ");
  assert.equal(
    squash(withIntent.replace(formatStyleIntent(look), "")),
    squash(withoutIntent),
    "The ONLY difference is the intent paragraph: outfit, garments, footwear, jewellery, accessories, reference-photo and framing instructions are unchanged",
  );
  assert.ok(!withoutIntent.includes("REVIEWED STYLING INTENT"), "Looks without a brief (older sessions) render exactly as before");
  assert.equal(formatStyleIntent({ styleIntent: undefined }), "");
  assert.equal(formatStyleIntent({ styleIntent: { effectiveOccasion: "", themeOrAesthetic: "", styleDirection: "", mustInclude: [], mustAvoid: [] } }), "", "An empty brief adds nothing");
  // (d) The intent survives the existing contracts, and looks without it still satisfy them
  const { GenerateImageRequestSchema, RecommendationsResponseSchema } = await import("../src/lib/skintune-schemas");
  const parsed = GenerateImageRequestSchema.parse({ look, profile, context: ctxArg });
  assert.deepEqual(parsed.look.styleIntent?.mustAvoid, ["loud prints"], "styleIntent is kept by the generate-image contract");
  const resp = RecommendationsResponseSchema.parse({ recommendations: attached.map((l) => ({ ...l, imageUrl: "/p" })) });
  assert.equal(resp.recommendations[0].styleIntent?.themeOrAesthetic, "quiet tonal minimalism");
  assert.doesNotThrow(() => RecommendationsResponseSchema.parse({ recommendations: first.map((l) => ({ ...l, imageUrl: "/p" })) }));
  console.log("✓ Test 6 Passed");

  console.log("\nAll AI-pipeline integrity tests passed.");
}

main().catch((e) => { console.error(e); process.exit(1); });
