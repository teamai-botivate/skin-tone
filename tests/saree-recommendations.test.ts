import assert from "node:assert/strict";
import type OpenAI from "openai";
import { logger } from "../src/lib/logger";
import {
  REVIEW_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildUserPrompt,
  generateLookRecommendations,
} from "../src/lib/recommendation-prompt";
import {
  buildDiscoveryQuery,
  checkProductConsistency,
  detectPersona,
  getApplicableCategories,
  planRequirementSpecs,
  searchProductsForLook,
  stripHandDrapeTerms,
} from "../src/lib/product-search";
import { buildLookEditPrompt } from "../src/lib/image-prompt";
import { generateFallbackLooks } from "../src/features/recommendations/services/recommendation-engine";
import type { LookRecommendation, SkinTuneProfile } from "../src/lib/skintune-schemas";
logger.level = "fatal";

// Deterministic and fully mocked (no paid calls). These tests pin down the CONTRACT that makes
// saree recommendations follow the user's aesthetic: what the model is told, what it must
// return, how the reviewer enforces it, and how saree looks turn into product searches. Which
// sarees the live model actually picks can only be observed with a live run.

console.log("======================================================================");
console.log("REGRESSION TEST SUITE: SAREE TYPES, DRAPES & AESTHETIC INTELLIGENCE");
console.log("======================================================================");

const profileOf = (patch: Partial<SkinTuneProfile>): SkinTuneProfile =>
  ({
    name: "Meera", pronouns: "she/her/women", gender: "female", ageGroup: "25–34", height: "",
    photoUrl: "", bodyPhotoUrl: "",
    appearance: { skinTone: "Medium", undertone: "Warm", confidence: 90, contrast: "Medium" },
    bodyBuild: "", fit: "", style: [], colorsLove: [], colorsAvoid: [], restrictions: [],
    occasion: "", impression: [], budget: "", customStyleNotes: "",
    ...patch,
  }) as SkinTuneProfile;

// The five requested scenarios, expressed the way users express them in the app
const scenarios = {
  traditional: profileOf({ style: ["Traditional"], occasion: "Festive", customStyleNotes: "Traditional saree" }),
  modernPreDraped: profileOf({ style: ["Modern", "Chic Contemporary"], occasion: "Cocktail", customStyleNotes: "Modern pre-draped saree" }),
  traditionalModernTouch: profileOf({ style: ["Traditional", "Indo-Western Fusion"], occasion: "Reception", customStyleNotes: "Traditional saree with a modern touch" }),
  weddingSilk: profileOf({ style: ["Royal & Regal"], occasion: "Wedding", customStyleNotes: "Silk saree for my cousin's wedding" }),
  everydayCotton: profileOf({ style: ["Casual"], occasion: "Everyday", customStyleNotes: "Comfortable everyday cotton saree" }),
};

// --- Mock OpenAI client: generation calls return `gens`, review calls return `reviews`, in order
type Msg = { role: string; content: string };
type Call = { messages: Msg[]; response_format: { json_schema: { name: string; schema: any } } };
function mockClient(gens: unknown[], reviews: unknown[]) {
  const calls: Call[] = [];
  let g = 0;
  let r = 0;
  const client = {
    chat: {
      completions: {
        create: async (params: Call) => {
          calls.push(params);
          const isReview = params.response_format.json_schema.name === "skintune_look_review";
          return { choices: [{ message: { content: JSON.stringify(isReview ? reviews[r++] : gens[g++]) } }] };
        },
      },
    },
  } as unknown as OpenAI;
  return { client, calls };
}

const look = (i: number, outfit: string, pieces: Array<{ category: string; name: string; detail: string }>) => ({
  id: `look-0${i}`, title: `Saree look ${i}`, note: "n", category: "", vibe: `vibe${i}`, personaEnergy: "e",
  palette: ["#111111", "#222222", "#333333"], pieces, outfit, outfitColor: "c", jewellery: "Gold jhumkas",
  hairstyle: "Low bun", makeup: "Soft glam", accessories: "Potli bag", footwear: "Embellished juttis",
  reasoning: ["a", "b", "c"], confidence: 90, applicableCategories: ["outfit", "makeup", "jewellery", "footwear", "accessories"],
});
const sareePieces = (saree: string, drapeDetail: string, blouse: string) => [
  { category: "Outfit", name: saree, detail: drapeDetail },
  { category: "Top", name: blouse, detail: "" },
  { category: "Footwear", name: "Embellished juttis", detail: "" },
];
const fiveTraditional = [
  look(1, "Kanjeevaram silk saree in a Nivi drape with a classic brocade blouse", sareePieces("Kanjeevaram silk saree", "Tamil Nadu, korvai border; Nivi drape", "Classic brocade blouse")),
  look(2, "Paithani silk saree in a Maharashtrian Nauvari drape with an elbow-sleeve blouse", sareePieces("Paithani silk saree", "Maharashtra, peacock pallu; Nauvari drape", "Elbow-sleeve blouse")),
  look(3, "Banarasi brocade saree in a seedha pallu drape with a high-neck blouse", sareePieces("Banarasi brocade saree", "Varanasi zari; seedha pallu", "High-neck blouse")),
  look(4, "Patola double ikat saree in a Gujarati drape with a mirror-work blouse", sareePieces("Patola double ikat saree", "Gujarat; Gujarati drape", "Mirror-work blouse")),
  look(5, "Bengal Tant saree in a Bengali drape with a puff-sleeve blouse", sareePieces("Bengal Tant cotton saree", "Bengal handloom; Bengali drape", "Puff-sleeve blouse")),
];
const fiveWesternFusion = [1, 2, 3, 4, 5].map((i) =>
  look(i, `Satin co-ord set ${i}`, [
    { category: "Top", name: `Satin crop top ${i}`, detail: "" },
    { category: "Bottom", name: `Satin palazzo ${i}`, detail: "" },
    { category: "Footwear", name: "Block heels", detail: "" },
  ]),
);
const brief = (sareeAesthetic: string, styleDirection = "traditional") => ({
  effectiveOccasion: "o", occasionReasoning: "r", themeOrAesthetic: "t", styleDirection,
  styleDirectionReasoning: "r", sareeAesthetic, mustInclude: ["saree"], mustAvoid: [], resolvedConflicts: [],
});
const review = (failedRequirement: string | null, variedBeyondColour = true) => ({
  requirements: ["saree", failedRequirement ?? "authentic traditional saree"],
  reviews: [1, 2, 3, 4, 5].map((i) => ({
    lookId: `look-0${i}`,
    requirementChecks: [{ requirement: failedRequirement ?? "authentic traditional saree", satisfied: !failedRequirement, evidence: failedRequirement ? "co-ord set, no saree" : "ok" }],
    audienceAppropriate: true,
    titleGarmentsInOutfit: true,
    outfitNamesAllClothingPieces: true,
  })),
  batchVariety: { variedBeyondColour, evidence: variedBeyondColour ? "different weaves and drapes" : "same saree in five colours" },
});

const specsFor = (lk: LookRecommendation, p: SkinTuneProfile) => {
  const persona = detectPersona(p);
  return planRequirementSpecs(lk, p, persona, getApplicableCategories(persona, "outfit")).filter((s) => s.category === "outfit");
};

async function main() {
  // -------------------------------------------------------------------------
  console.log("\n[Test 1] The engine knows saree types, contemporary constructions and drapes — and keeps weave and drape apart...");
  for (const term of ["Banarasi", "Kanjeevaram", "Kanchipuram", "Paithani", "Patola", "Chanderi", "Maheshwari", "Bandhani", "Sambalpuri", "Tant", "Gadwal", "Kasavu"]) {
    assert.ok(SYSTEM_PROMPT.includes(term), `Traditional weave known: ${term}`);
  }
  for (const term of ["pre-draped", "ready-to-wear", "ruffle", "concept", "pant-style", "dhoti-style", "cowl drape", "cape-style", "belted", "jacket-style", "contemporary fusion"]) {
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes(term), `Contemporary construction known: ${term}`);
  }
  for (const term of ["Nivi", "Bengali", "Gujarati", "Maharashtrian", "dhoti drape", "butterfly", "seedha pallu", "pre-stitched drapes"]) {
    assert.ok(SYSTEM_PROMPT.includes(term), `Drape known: ${term}`);
  }
  assert.match(SYSTEM_PROMPT, /A weave is never a drape and a drape is never a weave/);
  assert.match(SYSTEM_PROMPT, /never the drape/, "Product piece names carry the saree, not its drape");
  assert.match(SYSTEM_PROMPT, /Five looks that differ only in colour are a failure/);
  assert.match(REVIEW_SYSTEM_PROMPT, /calls a drape a weave/);
  console.log("✓ Test 1 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 2] Each of the 5 requests reaches the model verbatim, with the aesthetic rules it must follow...");
  for (const [name, p] of Object.entries(scenarios)) {
    const prompt = buildUserPrompt(p);
    assert.ok(prompt.includes(`"${p.customStyleNotes}"`), `${name}: request passed verbatim`);
    assert.ok(prompt.indexOf(p.customStyleNotes!) < prompt.indexOf("SELECTED OPTIONS"), `${name}: request comes before possibly stale selections`);
    assert.ok(prompt.includes(`Occasion: ${p.occasion}`), `${name}: occasion preserved`);
  }
  assert.match(SYSTEM_PROMPT, /traditional: authentic traditional sarees and regional weaves[\s\S]*Never fill the looks with western or fusion outfits/);
  assert.match(SYSTEM_PROMPT, /contemporary: lead with modern constructions — pre-draped, ruffle, pant-style/);
  assert.match(SYSTEM_PROMPT, /traditional_with_modern_touch: an authentic traditional saree or weave combined with a contemporary element[\s\S]*both sides are visible in every look/);
  assert.match(SYSTEM_PROMPT, /rich zari silks and heirloom weaves for grand ceremonies; breathable handloom cotton/, "Fabric weight follows formality (wedding silk vs everyday cotton)");
  console.log("✓ Test 2 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 3] The model must commit to a saree aesthetic in its brief (strict schema)...");
  let m = mockClient([{ styleBrief: brief("traditional"), recommendations: fiveTraditional }], [review(null)]);
  let res = await generateLookRecommendations(m.client, scenarios.traditional);
  const briefSchema = m.calls[0].response_format.json_schema.schema.properties.styleBrief;
  assert.ok(briefSchema.required.includes("sareeAesthetic"));
  assert.deepEqual(briefSchema.properties.sareeAesthetic.enum, ["traditional", "contemporary", "traditional_with_modern_touch", "not_requested"]);
  assert.equal(res.styleBrief.sareeAesthetic, "traditional");
  assert.ok(m.calls[1].messages[1].content.includes('"sareeAesthetic":"traditional"'), "Reviewer sees the committed aesthetic");
  const reviewSchema = m.calls[1].response_format.json_schema.schema;
  assert.ok(reviewSchema.required.includes("batchVariety"), "Reviewer must judge variety");
  assert.equal(res.attempts, 1);
  console.log("✓ Test 3 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 4] 'Traditional Saree' answered with western fusion is rejected and corrected...");
  m = mockClient(
    [{ styleBrief: brief("traditional"), recommendations: fiveWesternFusion }, { styleBrief: brief("traditional"), recommendations: fiveTraditional }],
    [review("authentic traditional saree or regional weave, traditionally worn"), review(null)],
  );
  res = await generateLookRecommendations(m.client, scenarios.traditional);
  assert.equal(res.attempts, 2, "Correction requested");
  assert.match(m.calls[2].messages.at(-1)!.content, /authentic traditional saree/, "Correction cites the aesthetic requirement");
  assert.ok(res.looks.every((l) => /saree/i.test(l.outfit)), "Returned looks are the traditional sarees");
  assert.deepEqual(res.remainingIssues, []);
  console.log("✓ Test 4 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 5] Five near-identical sarees in different colours trigger a correction...");
  const colourSwaps = ["Red", "Blue", "Green", "Pink", "Gold"].map((c, i) =>
    look(i + 1, `${c} Banarasi silk saree in a Nivi drape with a brocade blouse`, sareePieces(`${c} Banarasi silk saree`, "Nivi drape", "Brocade blouse")),
  );
  m = mockClient(
    [{ styleBrief: brief("traditional"), recommendations: colourSwaps }, { styleBrief: brief("traditional"), recommendations: fiveTraditional }],
    [review(null, false), review(null, true)],
  );
  res = await generateLookRecommendations(m.client, scenarios.weddingSilk);
  assert.equal(res.attempts, 2);
  assert.match(m.calls[2].messages.at(-1)!.content, /differ only in colour/);
  assert.equal(new Set(res.looks.map((l) => l.pieces[0].name.split(" ")[0])).size, 5, "Corrected looks use different sarees");
  console.log("✓ Test 5 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 6] Drapes are kept out of product searches; weaves and saleable constructions stay...");
  assert.equal(stripHandDrapeTerms("Kanjeevaram silk saree in a Nivi drape"), "Kanjeevaram silk saree");
  assert.equal(stripHandDrapeTerms("Bengal Tant cotton saree in a Bengali drape"), "Bengal Tant cotton saree");
  assert.equal(stripHandDrapeTerms("Chiffon saree, butterfly drape"), "Chiffon saree");
  assert.equal(stripHandDrapeTerms("Banarasi saree seedha pallu"), "Banarasi saree");
  assert.equal(stripHandDrapeTerms("Maharashtrian Paithani silk saree"), "Maharashtrian Paithani silk saree", "Origin adjective is not a drape");
  assert.equal(stripHandDrapeTerms("Gujarati Patola saree"), "Gujarati Patola saree");
  for (const kept of ["Pre-draped ruffle saree", "Pant-style saree", "Dhoti-style saree", "Cowl drape saree", "Pre-stitched Nauvari saree"]) {
    assert.equal(stripHandDrapeTerms(kept), kept, `Saleable construction kept: ${kept}`);
  }
  console.log("✓ Test 6 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 7] Each scenario's saree look becomes the right product requirements...");
  const cases: Array<[keyof typeof scenarios, LookRecommendation, RegExp, RegExp | null, RegExp]> = [
    // Traditional: structured pieces, drape only in the detail
    ["traditional", look(1, "Kanjeevaram silk saree in a Nivi drape with a classic brocade blouse", sareePieces("Kanjeevaram silk saree", "Nivi drape", "Classic brocade blouse")) as unknown as LookRecommendation, /kanjeevaram silk saree/i, null, /blouse/i],
    // Modern pre-draped
    ["modernPreDraped", look(2, "Pre-draped ruffle georgette saree with a structured corset blouse", sareePieces("Pre-draped ruffle georgette saree", "ready-to-wear", "Structured corset blouse")) as unknown as LookRecommendation, /pre-draped ruffle georgette saree/i, null, /corset/i],
    // Traditional with a modern touch: traditional weave + modern blouse + jacket layer
    ["traditionalModernTouch", look(3, "Banarasi silk saree in a Nivi drape with a sheer organza blouse and a cropped brocade jacket", [
      { category: "Outfit", name: "Banarasi silk saree", detail: "Varanasi zari; Nivi drape" },
      { category: "Top", name: "Sheer organza blouse", detail: "" },
      { category: "Layer", name: "Cropped brocade jacket", detail: "" },
    ]) as unknown as LookRecommendation, /banarasi silk saree/i, null, /organza blouse|brocade jacket/i],
    // Wedding silk, free text only (no structured pieces) — the fallback planner path
    ["weddingSilk", { ...look(4, "Ruby red Kanchipuram silk saree with gold zari korvai border in a Nivi drape, paired with a heavy zardozi blouse", []), pieces: [] } as unknown as LookRecommendation, /ruby red kanchipuram silk saree/i, /nivi/i, /zardozi blouse/i],
    // Everyday cotton, free text only — must not be searched as silk
    ["everydayCotton", { ...look(5, "Indigo Bengal Tant cotton saree in a Bengali drape, worn with a sleeveless cotton blouse", []), pieces: [] } as unknown as LookRecommendation, /indigo bengal tant cotton saree/i, /\bsilk\b|bengali drape/i, /cotton blouse/i],
  ];
  for (const [name, lk, sareeRe, forbiddenRe, topRe] of cases) {
    const specs = specsFor(lk, scenarios[name]);
    const saree = specs.find((s) => s.itemSubcategory === "saree");
    assert.ok(saree, `${name}: saree requirement planned`);
    const query = buildDiscoveryQuery(saree!);
    assert.match(saree!.itemTitle, sareeRe, `${name}: saree title from the look (${saree!.itemTitle})`);
    assert.match(query, sareeRe, `${name}: search keeps weave/fabric/construction (${query})`);
    assert.ok(!/\bnivi\b|bengali drape|seedha pallu/i.test(query), `${name}: no hand-drape words in the search (${query})`);
    if (forbiddenRe) assert.ok(!forbiddenRe.test(query), `${name}: query avoids ${forbiddenRe} (${query})`);
    assert.equal(saree!.targetGender, "women", `${name}: gender preserved`);
    assert.ok(specs.some((s) => s !== saree && topRe.test(s.itemTitle)), `${name}: blouse/layer planned (${specs.map((s) => s.itemTitle).join(" | ")})`);
  }
  console.log("✓ Test 7 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 8] Real retailer saree titles of every kind pass the saree check; non-sarees don't...");
  for (const title of [
    "Women Pink Ready to Wear Pre-Draped Saree",
    "Mitera Woven Design Zari Banarasi Saree",
    "Women Black Ruffle Pre-Stitched Saree with Belt",
    "Indo Era Pant Style Saree",
    "Handloom Pure Cotton Tant Saree",
    "Kanjivaram Pure Silk Saree with Blouse Piece",
  ]) {
    const c = checkProductConsistency(title, "X", "outfit", "https://www.myntra.com/sarees/x/y/31985601/buy", undefined, "woman", "saree", undefined, undefined, 2499, "Festive", undefined, "women");
    assert.equal(c.isConsistent, true, `${title}: ${c.reason}`);
  }
  for (const title of ["Women Embroidered Lehenga Choli Set", "Women Satin Co-ord Set"]) {
    const c = checkProductConsistency(title, "X", "outfit", "https://www.myntra.com/x/y/z/31985602/buy", undefined, "woman", "saree", undefined, undefined, 2499, "Festive", undefined, "women");
    assert.equal(c.isConsistent, false, `Not a saree: ${title}`);
  }
  console.log("✓ Test 8 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 9] Live discovery for a wedding silk saree: verified saree shown, lehenga rejected, drape kept out of the query...");
  process.env.OPENAI_API_KEY = "sk-test-stub-key-not-real";
  process.env.TAVILY_API_KEY = "tvly-test-stub-key-not-real";
  const SAREE_URL = "https://www.myntra.com/sarees/kalamandir/kalamandir-red-kanjeevaram-pure-silk-saree/31985611/buy";
  const LEHENGA_URL = "https://www.myntra.com/lehenga-choli/x/x-women-red-lehenga-choli/31985612/buy";
  const ld = (name: string, price: string) =>
    `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name, brand: { name: "Kalamandir" }, image: "https://assets.myntassets.com/saree.jpg", offers: { price, priceCurrency: "INR" } })}</script>`;
  const queries: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("api.tavily.com")) return new Response("{}", { status: 432 });
    if (url.endsWith("/responses")) {
      const text: string = JSON.parse(String(init?.body)).input[0].content[0].text;
      queries.push(text.split("\n")[0]);
      const products = /saree/i.test(text.split("\n")[0])
        ? [
            { pageUrl: SAREE_URL, title: "Kalamandir Red Kanjeevaram Pure Silk Saree", brand: "Kalamandir", retailer: "Myntra" },
            { pageUrl: LEHENGA_URL, title: "Women Red Lehenga Choli", brand: "X", retailer: "Myntra" },
          ]
        : [];
      return new Response(JSON.stringify({ id: "r", object: "response", status: "completed", model: "gpt-4o-mini", output: [{ id: "m", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ products }), annotations: [] }] }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url === SAREE_URL) return new Response(ld("Kalamandir Red Kanjeevaram Pure Silk Saree", "8999"), { status: 200 });
    if (url === LEHENGA_URL) return new Response(ld("Women Red Lehenga Choli", "4999"), { status: 200 });
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  const weddingLook = { ...look(1, "Ruby red Kanjeevaram silk saree in a Nivi drape with a heavy zardozi blouse", sareePieces("Ruby red Kanjeevaram silk saree", "Tamil Nadu, korvai border; Nivi drape", "Heavy zardozi blouse")) } as unknown as LookRecommendation;
  const found = await searchProductsForLook(weddingLook, scenarios.weddingSilk, "outfit", true);
  const sareeGroup = found.groups?.find((g) => /saree/i.test(g.recommendedItemTitle));
  assert.ok(sareeGroup, "Saree group planned");
  assert.deepEqual(sareeGroup!.products.map((p) => p.productUrl), [SAREE_URL], "Only the genuine, verified saree is shown");
  assert.equal(sareeGroup!.products[0].price, 8999, "Price from the product page");
  const sareeQuery = queries.find((q) => /saree/i.test(q))!;
  assert.match(sareeQuery, /Kanjeevaram silk saree/i);
  assert.ok(!/nivi/i.test(sareeQuery), `No drape in the live query (${sareeQuery})`);
  console.log("✓ Test 9 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 10] Latest / new fashion saree & contemporary variations prompt intelligence...");
  assert.match(SYSTEM_PROMPT, /latest saree|new fashion saree|designer saree/i, "System prompt mentions latest/new fashion sarees");
  assert.match(SYSTEM_PROMPT, /metallic tissue silk|liquid organza|crushed.*georgette|satin crepe/i, "Cutting-edge fabrics defined");
  assert.match(SYSTEM_PROMPT, /structured corset blouses|sculpted boned bustiers|tailored cropped blazers/i, "Modern blouse and layer pairings defined");
  assert.match(SYSTEM_PROMPT, /saree-jumpsuits|skirt-pleated sarees/i, "Modern saree variations defined");
  assert.match(REVIEW_SYSTEM_PROMPT, /latest saree|new fashion saree/i, "Reviewer checks latest/new fashion saree requirements");
  console.log("✓ Test 10 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 11] Indo-Western & Cocktail/Mocktail/Partywear prompt intelligence...");
  assert.match(SYSTEM_PROMPT, /Cocktail, Mocktail, Soirée, or Evening Party/i, "Partywear prompt guidance present");
  assert.match(SYSTEM_PROMPT, /pre-draped cocktail sarees with sculpted boned bustiers|fluid satin cowl slip gowns/i, "Chic party silhouettes defined");
  assert.match(REVIEW_SYSTEM_PROMPT, /Indo-Western fusion, cocktail, mocktail, or parties/i, "Reviewer verifies party and fusion fashion fidelity");
  console.log("✓ Test 11 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 12] Image prompt generation (buildLookEditPrompt) visual fidelity for contemporary saree, cocktail, and Indo-Western...");
  const modernSareeLook = {
    ...look(1, "Pre-draped liquid metallic tissue saree with a sculpted boned bustier and metallic belt", [
      { category: "Outfit", name: "Pre-draped liquid metallic tissue saree", detail: "metallic tissue silk" },
      { category: "Top", name: "Sculpted boned bustier", detail: "sweetheart neckline" },
      { category: "Accessories", name: "Metallic waist-cincher belt", detail: "gold finish" },
      { category: "Footwear", name: "Metallic stiletto heels", detail: "" },
    ]),
    styleIntent: {
      effectiveOccasion: "Cocktail Party",
      themeOrAesthetic: "Contemporary Glamour",
      styleDirection: "fusion" as const,
      mustInclude: ["latest saree"],
      mustAvoid: [],
    },
  } as unknown as LookRecommendation;

  const womanPartyProfile = profileOf({
    name: "Kavya",
    occasion: "Cocktail Party",
    style: ["Chic Contemporary", "Indo-Western Fusion"],
    customStyleNotes: "Latest new fashion saree for a cocktail evening",
  });

  const prompt = buildLookEditPrompt(modernSareeLook, womanPartyProfile, { occasion: "Cocktail Party", details: "Latest new fashion saree for a cocktail evening" }, null);
  assert.match(prompt, /CONTEMPORARY & LATEST SAREE VISUAL FIDELITY/, "Visual fidelity for contemporary saree included");
  assert.match(prompt, /COCKTAIL & PARTY OCCASION ATMOSPHERE/, "Atmosphere for cocktail party included");
  assert.match(prompt, /INDO-WESTERN FUSION VISUAL FIDELITY/, "Indo-Western fusion visual fidelity included");
  assert.match(prompt, /upscale evening party or cocktail lounge/i, "Party setting specified");
  assert.match(prompt, /crisp, impeccably pre-draped or concept silhouette/i, "Modern drape specified");
  console.log("✓ Test 12 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 13] Dynamic fallback suites for modern saree and cocktail partywear...");
  const cocktailFallback = generateFallbackLooks(profileOf({ occasion: "Cocktail Party", style: ["Glamorous"] }));
  assert.equal(cocktailFallback.length, 5, "Returns 5 cocktail party looks");
  assert.ok(cocktailFallback.some((l) => /cocktail saree/i.test(l.outfit)), "Includes cocktail saree");
  assert.ok(cocktailFallback.some((l) => /satin.*gown|tuxedo|corset/i.test(l.outfit)), "Includes gowns and tuxedo partywear");

  const sareeFallback = generateFallbackLooks(profileOf({ style: ["Modern Saree"], occasion: "Reception" }));
  assert.equal(sareeFallback.length, 5, "Returns 5 modern saree looks");
  assert.ok(sareeFallback.every((l) => /saree/i.test(l.outfit)), "All 5 looks are sarees");
  assert.ok(sareeFallback.some((l) => /pre-draped|pre-stitched|pant-style|ruffle/i.test(l.outfit)), "Includes modern pre-draped / pant / ruffle sarees");
  console.log("✓ Test 13 Passed");

  console.log("\n======================================================================");
  console.log("ALL SAREE INTELLIGENCE TESTS PASSED");
  console.log("======================================================================");
}

main().catch((err) => {
  console.error("\n✗ TEST FAILED:", err);
  process.exit(1);
});
