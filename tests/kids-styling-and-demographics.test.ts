import assert from "node:assert/strict";
import { getStylingContext } from "../src/lib/styling-context";
import {
  detectPersona,
  planRequirementSpecs,
  checkProductConsistency,
  getBenchmarkCandidatesForRequirement,
  searchProductsForLook,
} from "../src/lib/product-search";
import { buildRetailerSearchUrl } from "../src/lib/retailer-urls";
import { generateFallbackLooks } from "../src/features/recommendations/services/recommendation-engine";
import type { SkinTuneProfile } from "../src/types";

console.log("======================================================================");
console.log("REGRESSION TEST SUITE: KIDS STYLING & DEMOGRAPHIC INTEGRITY");
console.log("======================================================================");

// -----------------------------------------------------------------------------
// Test 1: Kids + Boy -> Boys' Kidswear, Never Adult Women's Kurtis / Lehengas
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Testing Kids + Boy -> boys' kidswear, never adult women's kurtis...");
const boyProfile: any = {
  name: "Aarav",
  pronouns: "Kids / Boys styling",
  gender: "boy",
  ageGroup: "6–10",
  appearance: { skinTone: "Fair", undertone: "Warm", confidence: 85, contrast: "Medium" },
  style: ["Traditional", "Festive"],
  colorsLove: ["Royal Blue", "Gold"],
  colorsAvoid: ["Black"],
  occasion: "Garba Night",
  impression: ["Playful", "Festive"],
  budget: "₹1.5K–₹3.5K",
};

const boyCtx = getStylingContext(boyProfile);
assert.equal(boyCtx.audience, "kids", "Audience must be kids");
assert.equal(boyCtx.gender, "boys", "Target gender must be boys");
assert.equal(boyCtx.isBoy, true, "isBoy must be true");
assert.equal(boyCtx.isWoman, false, "isWoman must be false");
assert.equal(boyCtx.isMan, false, "isMan must be false");

const boyPersona = detectPersona(boyProfile);
assert.equal(boyPersona, "child", "Persona must be child");

const boyLooks = generateFallbackLooks(boyProfile);
assert.ok(boyLooks.length >= 1, "Must generate fallback looks for boy profile");
for (const look of boyLooks) {
  const outfitLower = look.outfit.toLowerCase();
  assert.ok(
    outfitLower.includes("boy") || outfitLower.includes("kurta") || outfitLower.includes("kedia"),
    `Boy look outfit must be boys kidswear, got: ${look.outfit}`
  );
  assert.ok(!outfitLower.includes("chaniya choli"), "Boy look must NEVER be chaniya choli");
  assert.ok(!outfitLower.includes("lehenga"), "Boy look must NEVER be lehenga");
  assert.ok(!outfitLower.includes("saree"), "Boy look must NEVER be saree");
  assert.ok(!outfitLower.includes("kurti"), "Boy look must NEVER be women's kurti");
  assert.ok(!look.footwear.toLowerCase().includes("heel"), "Boy footwear must never include heels");
  assert.ok(!look.footwear.toLowerCase().includes("pump"), "Boy footwear must never include pumps");
}

const boySpecs = planRequirementSpecs(boyLooks[0] as any, boyProfile, boyPersona, ["outfit", "footwear", "accessories"]);
for (const spec of boySpecs) {
  assert.equal(spec.targetGender, "boys", `Requirement spec targetGender must be 'boys', got: ${spec.targetGender}`);
  assert.ok(spec.searchQuery.toLowerCase().includes("boys"), `Search query must include 'boys', got: ${spec.searchQuery}`);
  assert.ok(!spec.searchQuery.toLowerCase().includes("women"), `Search query must NEVER include 'women', got: ${spec.searchQuery}`);
  assert.ok(!spec.searchQuery.toLowerCase().includes("chaniya"), "Search query must NEVER include chaniya");
  assert.ok(!spec.searchQuery.toLowerCase().includes("lehenga"), "Search query must NEVER include lehenga");
}

const boyBench = getBenchmarkCandidatesForRequirement(boySpecs[0], boyPersona, 3500, "Blue");
assert.ok(boyBench.length >= 1, "Must return benchmark candidates for boys");
for (const b of boyBench) {
  const titleLower = b.productTitle.toLowerCase();
  assert.ok(titleLower.includes("boy"), `Benchmark product title must be for boys, got: ${b.productTitle}`);
  assert.ok(!titleLower.includes("women"), "Benchmark must not contain women");
  assert.ok(!titleLower.includes("kurti"), "Benchmark must not contain women's kurti");
  assert.ok(!titleLower.includes("lehenga"), "Benchmark must not contain lehenga");
  assert.ok(!titleLower.includes("choli"), "Benchmark must not contain choli");
}
console.log("✓ Test 1 Passed: Kids + Boy produces strictly boys kidswear without adult women's kurtis/lehengas.");

// -----------------------------------------------------------------------------
// Test 2: Kids + Girl -> Girls' Kidswear, Never Unrelated Adult Products
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Testing Kids + Girl -> girls' kidswear, never unrelated adult products...");
const girlProfile: any = {
  name: "Ananya",
  pronouns: "Kids / Girls styling",
  gender: "girl",
  ageGroup: "6–10",
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 85, contrast: "Medium" },
  style: ["Traditional", "Festive"],
  colorsLove: ["Pink", "Yellow"],
  occasion: "Garba Night",
  impression: ["Joyful"],
  budget: "₹1.5K–₹3.5K",
};

const girlCtx = getStylingContext(girlProfile);
assert.equal(girlCtx.audience, "kids", "Audience must be kids");
assert.equal(girlCtx.gender, "girls", "Target gender must be girls");
assert.equal(girlCtx.isGirl, true, "isGirl must be true");
assert.equal(girlCtx.isWoman, false, "isWoman must be false");

const girlLooks = generateFallbackLooks(girlProfile);
for (const look of girlLooks) {
  const outfitLower = look.outfit.toLowerCase();
  assert.ok(outfitLower.includes("girl"), `Girl look outfit must be girls clothing, got: ${look.outfit}`);
  assert.ok(!outfitLower.includes("men"), "Girl look must never contain men's clothing");
  assert.ok(!look.footwear.toLowerCase().includes("stiletto"), "Girl footwear must never contain stilettos");
}

const girlSpecs = planRequirementSpecs(girlLooks[0] as any, girlProfile, "child", ["outfit", "footwear", "accessories"]);
for (const spec of girlSpecs) {
  assert.equal(spec.targetGender, "girls", `Requirement spec targetGender must be 'girls', got: ${spec.targetGender}`);
  assert.ok(spec.searchQuery.toLowerCase().includes("girls"), `Search query must include 'girls', got: ${spec.searchQuery}`);
}

const girlBench = getBenchmarkCandidatesForRequirement(girlSpecs[0], "child", 3500, "Pink");
for (const b of girlBench) {
  assert.ok(b.productTitle.toLowerCase().includes("girl"), `Benchmark product title must be for girls, got: ${b.productTitle}`);
}
console.log("✓ Test 2 Passed: Kids + Girl produces strictly girls kidswear without adult products.");

// -----------------------------------------------------------------------------
// Test 3: Kids + Unspecified Gender -> Age-Appropriate Children's Clothing
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Testing Kids + Unspecified Gender -> age-appropriate children's clothing...");
const neutralChildProfile: any = {
  name: "Sam",
  pronouns: "Kids / Children’s styling (Unisex)",
  gender: "unspecified",
  ageGroup: "0–5",
  appearance: { skinTone: "Fair", undertone: "Cool", confidence: 85, contrast: "Medium" },
  style: ["Casual"],
  colorsLove: ["Teal"],
  occasion: "Birthday Party",
  budget: "₹1K–₹2K",
};

const neutralCtx = getStylingContext(neutralChildProfile);
assert.equal(neutralCtx.audience, "kids", "Audience must be kids");
assert.equal(neutralCtx.isKids, true, "isKids must be true");
assert.equal(neutralCtx.isWoman, false, "isWoman must be false");
assert.equal(neutralCtx.isMan, false, "isMan must be false");

const neutralPersona = detectPersona(neutralChildProfile);
assert.equal(neutralPersona, "child", "Persona must be child");

const consistencyRejection = checkProductConsistency(
  "Women Embroidered Rayon Kurti",
  "Biba",
  "outfit",
  "https://www.myntra.com/kurtis/biba/women-kurti/123456",
  undefined,
  neutralPersona,
  "outfit",
  "Teal",
  undefined,
  999,
  "Birthday Party",
  undefined,
  "child",
);
assert.equal(consistencyRejection.isConsistent, false, "Must reject adult women's kurti for children");
console.log("✓ Test 3 Passed: Kids + Unspecified Gender safely rejects adult women's kurtis.");

// -----------------------------------------------------------------------------
// Test 4: Men and Women Styling Continue to Work Correctly
// -----------------------------------------------------------------------------
console.log("\n[Test 4] Testing Men and Women styling continue to work correctly...");
const womenProfile: any = {
  name: "Deepika",
  pronouns: "Women’s styling (She/Her)",
  ageGroup: "25–34",
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 85, contrast: "Medium" },
  style: ["Formal", "Minimalist"],
  colorsLove: ["Cedar Brown", "Cream"],
  occasion: "Office Work",
  budget: "₹3K–₹7K",
};
const womenCtx = getStylingContext(womenProfile);
assert.equal(womenCtx.audience, "women", "Audience must be women");
assert.equal(womenCtx.isWoman, true, "isWoman must be true");
assert.equal(womenCtx.isMan, false, "isMan must be false");
assert.equal(womenCtx.isKids, false, "isKids must be false");

const menProfile: any = {
  name: "Kabir",
  pronouns: "Men’s styling (He/Him)",
  ageGroup: "25–34",
  appearance: { skinTone: "Tan", undertone: "Warm", confidence: 85, contrast: "Medium" },
  style: ["Formal", "Sharp"],
  colorsLove: ["Navy Blue"],
  occasion: "Office Work",
  budget: "₹3K–₹7K",
};
const menCtx = getStylingContext(menProfile);
assert.equal(menCtx.audience, "men", "Audience must be men");
assert.equal(menCtx.isMan, true, "isMan must be true");
assert.equal(menCtx.isWoman, false, "isWoman must be false");
assert.equal(menCtx.isKids, false, "isKids must be false");

const menLooks = generateFallbackLooks(menProfile);
assert.ok(menLooks.length >= 1, "Must generate looks for men");
assert.equal(detectPersona(menProfile), "man", "Persona must be man");
assert.equal(detectPersona(womenProfile), "woman", "Persona must be woman");
console.log("✓ Test 4 Passed: Adult Men and Women styling pipelines function correctly.");

// -----------------------------------------------------------------------------
// Test 5: Dynamic Category Switching Updates Subsequent Recommendations
// -----------------------------------------------------------------------------
console.log("\n[Test 5] Testing dynamic category switching updates context...");
let dynamicProfile: any = {
  name: "Child",
  pronouns: "Kids / Boys styling",
  gender: "boy",
  ageGroup: "6–10",
  occasion: "Casual Daytime",
};
let dynCtx = getStylingContext(dynamicProfile);
assert.equal(dynCtx.gender, "boys", "Should be boys");

// User switches to Girls styling
dynamicProfile = {
  ...dynamicProfile,
  pronouns: "Kids / Girls styling",
  gender: "girl",
};
dynCtx = getStylingContext(dynamicProfile);
assert.equal(dynCtx.gender, "girls", "Should dynamically switch to girls");

// User switches to Men styling
dynamicProfile = {
  ...dynamicProfile,
  pronouns: "Men’s styling (He/Him)",
  gender: "men",
  ageGroup: "25–34",
};
dynCtx = getStylingContext(dynamicProfile);
assert.equal(dynCtx.audience, "men", "Should dynamically switch to men");
assert.equal(dynCtx.isKids, false, "isKids should be false");
console.log("✓ Test 5 Passed: Profile updates dynamically switch audience and demographic filters.");

// -----------------------------------------------------------------------------
// Test 6: Retailer Search URLs Preserve Kids/Boys Keywords and Valid Patterns
// -----------------------------------------------------------------------------
console.log("\n[Test 6] Testing retailer search URLs preserve kids/boys category and avoid adult tokens...");
const myntraBoyUrl = buildRetailerSearchUrl("Myntra", {
  gender: "boys",
  productName: "Festive Kurta Dhoti Set",
  color: "Blue",
  category: "outfit",
});
assert.ok(myntraBoyUrl.includes("boys"), `Myntra URL must contain 'boys': ${myntraBoyUrl}`);
assert.ok(!myntraBoyUrl.includes("women"), `Myntra URL must NEVER contain 'women': ${myntraBoyUrl}`);

const ajioBoyUrl = buildRetailerSearchUrl("AJIO", {
  gender: "boys",
  productName: "Casual Sneakers",
  category: "footwear",
});
assert.ok(ajioBoyUrl.includes("boys"), `AJIO URL must contain 'boys': ${ajioBoyUrl}`);
assert.ok(!ajioBoyUrl.includes("women"), `AJIO URL must NEVER contain 'women': ${ajioBoyUrl}`);

const tataCliqBoyUrl = buildRetailerSearchUrl("Tata CLiQ", {
  gender: "boys",
  productName: "Festive Kurta",
  category: "outfit",
});
assert.ok(tataCliqBoyUrl.includes("boys"), `Tata CLiQ URL must contain 'boys': ${tataCliqBoyUrl}`);
assert.ok(!tataCliqBoyUrl.includes("women"), `Tata CLiQ URL must NEVER contain 'women': ${tataCliqBoyUrl}`);
console.log("✓ Test 6 Passed: Retailer search URLs strictly encode 'boys' and prevent 'women' contamination.");

// -----------------------------------------------------------------------------
// Test 7: Consistency Checks Reject Incompatible Products Without Silent Fallbacks
// -----------------------------------------------------------------------------
console.log("\n[Test 7] Testing consistency validator rejects adult women's kurtis for boys...");
const adultKurtiResult = checkProductConsistency(
  "Women Solid Straight Kurti with Palazzos",
  "Libas",
  "outfit",
  "https://www.myntra.com/kurtis/libas/women-kurti-set/1928374",
  undefined,
  "child",
  "kurta",
  "Blue",
  undefined,
  1299,
  "Garba Night",
  undefined,
  "boys",
);
assert.equal(adultKurtiResult.isConsistent, false, "Must strictly reject adult women's kurti for boys");
assert.ok(adultKurtiResult.reason?.includes("female apparel keywords") || adultKurtiResult.reason?.includes("Demographic mismatch"),
  `Reason must cite demographic or gender mismatch: ${adultKurtiResult.reason}`);

const adultMenSuitResult = checkProductConsistency(
  "Men Slim Fit Formal 2-Piece Suit",
  "Raymond",
  "outfit",
  "https://www.tatacliq.com/men-formal-suit/123",
  undefined,
  "child",
  "blazer",
  "Navy Blue",
  undefined,
  5999,
  "Special Event",
  undefined,
  "boys",
);
assert.equal(adultMenSuitResult.isConsistent, false, "Must reject adult men's suits for boys");

const validBoyKurtaResult = checkProductConsistency(
  "Boys Blue Printed Cotton Festive Kurta Dhoti Set",
  "Vastramay",
  "outfit",
  "https://www.myntra.com/boys-blue-kurta-dhoti-set",
  undefined,
  "child",
  "kurta",
  "Blue",
  undefined,
  999,
  "Garba Night",
  undefined,
  "boys",
);
assert.equal(validBoyKurtaResult.isConsistent, true, `Valid boy kidswear must pass consistency: ${validBoyKurtaResult.reason}`);

console.log("✓ Test 7 Passed: Incompatible items are cleanly rejected and verified boys kidswear accepted.");

console.log("\n======================================================================");
console.log("ALL 7 CRITICAL KIDS STYLING REGRESSION TESTS PASSED CLEANLY! 🎉");
console.log("======================================================================");
