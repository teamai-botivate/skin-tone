import assert from "node:assert/strict";
import { logger } from "../src/lib/logger";
logger.level = "fatal";
import {
  planRequirementSpecs,
  checkProductConsistency,
  decomposeOutfitGarments,
  classifyMenGarment,
} from "../src/lib/product-search";
import {
  isUrlConsistentWithProduct,
  buildRetailerSearchUrl,
} from "../src/lib/retailer-urls";
import type { LookRecommendation, SkinTuneProfile } from "../src/lib/skintune-schemas";

console.log("======================================================================");
console.log("TEST SUITE: BOYS WAISTCOAT / VEST & BLAZER RECOMMENDATION INTEGRITY");
console.log("======================================================================");

// Profile from user's screenshot (Image 1):
// Kids / Boys styling · 0-5
// Style Direction: Mini Gentleman
// Colours: Loves Dusty rose, Butter yellow, Berry · Special Event
const boyProfile = {
  name: "Little Boy",
  pronouns: "Kids / Boys styling",
  gender: "boy",
  ageGroup: "0–5",
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 85, contrast: "Medium" },
  style: ["Mini Gentleman"],
  colorsLove: ["Dusty rose", "Butter yellow", "Berry"],
  colorsAvoid: [],
  occasion: "Special Event",
  impression: ["Charming", "Polished"],
  budget: "No strict budget",
} as unknown as SkinTuneProfile;

// Look from user's screenshot (Image 2):
// Butter Yellow Vest Ensemble
// Outfit: Butter Yellow Vest Set, colour: #F7E4B3
const yellowVestLook = {
  id: "look-02",
  title: "Butter Yellow Vest Ensemble",
  imageUrl: "https://example.com/vest.jpg",
  note: "A vibrant butter yellow vest set that ensures he stands out while staying comfortable on a special occasion.",
  category: "Party",
  vibe: "Charming",
  personaEnergy: "Bright and joyful.",
  palette: ["#F7E4B3", "#D2C5B5", "#8EAA90"],
  outfit: "Butter Yellow Vest Set",
  outfitColor: "#F7E4B3",
  jewellery: "None",
  hairstyle: "Styled with a playful tousle",
  makeup: "None (child-friendly natural skin)",
  footwear: "Boys Tan Leather Penny Loafers",
  accessories: "None",
  confidence: 88,
  applicableCategories: ["outfit", "footwear"],
  reasoning: ["Tailored vest set perfect for a mini gentleman on special events."],
  pieces: [
    { category: "Layer", name: "Butter Yellow Vest", detail: "Tailored butter yellow waistcoat" },
    { category: "Top", name: "Collared Shirt", detail: "Blue classic cotton shirt" }, // Testing color harmonization
    { category: "Bottom", name: "Tailored Trousers", detail: "Matching butter yellow formal trousers" },
  ],
};

// -----------------------------------------------------------------------------
// Test 1: Deconstruction & Subcategory Accuracy for Vest / Waistcoat
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Testing Vest / Waistcoat decomposition and query planning...");
const specs = planRequirementSpecs(yellowVestLook, boyProfile, "child", ["outfit", "footwear"]);
assert.ok(specs.length >= 2, "Must plan specs for vest, shirt, and trousers");

const vestSpec = specs.find((s) => /vest|waistcoat/i.test(s.itemTitle));
assert.ok(vestSpec, "Must have a vest / waistcoat spec");
assert.equal(vestSpec.itemSubcategory, "waistcoat", "Vest subcategory must be 'waistcoat', NOT 'jacket'");
assert.ok(!vestSpec.searchQuery.toLowerCase().includes("jacket"), "Search query must NOT search for generic jacket");
assert.ok(vestSpec.searchQuery.toLowerCase().includes("waistcoat") || vestSpec.searchQuery.toLowerCase().includes("vest"), "Search query must include waistcoat or vest");
console.log("✓ Test 1 Passed: Vest decomposed into 'waistcoat' subcategory with query:", vestSpec.searchQuery);

// -----------------------------------------------------------------------------
// Test 2: Reject Bomber & Puffer Jackets for Waistcoat / Vest Requirement
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Testing Waistcoat consistency check rejects bombers and puffers...");

// Image 3: AJIO Boy Quilted Puffer Jacket
const pufferCandidate = {
  name: "Trampoline Boy Quilted Puffer Jacket",
  url: "https://www.ajio.com/trampoline-boy-quilted-puffer-jacket/p/702382958008",
  brand: "Trampoline",
};
const pufferCheck = checkProductConsistency(
  pufferCandidate.name,
  pufferCandidate.brand,
  "outfit",
  pufferCandidate.url,
  undefined,
  "child",
  vestSpec.itemSubcategory,
  vestSpec.dominantColor,
  undefined,
  899,
  boyProfile.occasion,
  undefined,
  "boys",
  vestSpec.itemTitle
);
assert.equal(pufferCheck.isConsistent, false, "Must reject Trampoline Quilted Puffer Jacket for vest requirement");
console.log("✓ Puffer jacket rejected:", pufferCheck.reason);

// Image 4: KB TEAM SPIRIT Colourblock Bomber Jacket with Detachable Hoodie
const bomberCandidate = {
  name: "KB TEAM SPIRIT Colourblock Bomber Jacket with Detachable Hoodie",
  url: "https://www.ajio.com/kb-team-spirit-colourblock-bomber-jacket-with-detachable-hoodie/p/702382958009",
  brand: "KB TEAM SPIRIT",
};
const bomberCheck = checkProductConsistency(
  bomberCandidate.name,
  bomberCandidate.brand,
  "outfit",
  bomberCandidate.url,
  undefined,
  "child",
  vestSpec.itemSubcategory,
  vestSpec.dominantColor,
  undefined,
  799,
  boyProfile.occasion,
  undefined,
  "boys",
  vestSpec.itemTitle
);
assert.equal(bomberCheck.isConsistent, false, "Must reject Bomber Jacket with Hoodie for vest requirement");
console.log("✓ Bomber jacket with hoodie rejected:", bomberCheck.reason);

// URL Consistency for Waistcoat
assert.equal(
  isUrlConsistentWithProduct(pufferCandidate.url, {
    category: "outfit",
    subcategory: "waistcoat",
    productName: pufferCandidate.name,
    targetGender: "boys",
  }),
  false,
  "isUrlConsistentWithProduct must reject puffer URL for waistcoat"
);
assert.equal(
  isUrlConsistentWithProduct(bomberCandidate.url, {
    category: "outfit",
    subcategory: "waistcoat",
    productName: bomberCandidate.name,
    targetGender: "boys",
  }),
  false,
  "isUrlConsistentWithProduct must reject bomber URL for waistcoat"
);

// Valid waistcoat candidate must pass
const validWaistcoatCandidate = {
  name: "Little Bansi Boys Butter Yellow Embroidered Waistcoat",
  url: "https://www.myntra.com/waistcoat/little-bansi/little-bansi-boys-waistcoat/21985698/buy",
  brand: "Little Bansi",
};
const validCheck = checkProductConsistency(
  validWaistcoatCandidate.name,
  validWaistcoatCandidate.brand,
  "outfit",
  validWaistcoatCandidate.url,
  undefined,
  "child",
  vestSpec.itemSubcategory,
  vestSpec.dominantColor,
  undefined,
  1299,
  boyProfile.occasion,
  undefined,
  "boys",
  vestSpec.itemTitle
);
assert.equal(validCheck.isConsistent, true, "Valid waistcoat must pass consistency check");
console.log("✓ Test 2 Passed: Bombers and puffers rejected; authentic waistcoat accepted.");

// -----------------------------------------------------------------------------
// Test 3: Reject Bomber & Puffer Jackets for Blazer Requirement
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Testing Blazer consistency check rejects bombers and casual jackets...");

const blazerSpec = {
  itemSubcategory: "blazer",
  itemTitle: "Boys Tailored Formal Blazer",
  dominantColor: "Butter Yellow",
};

// Rare Ones Bomber Jacket
const rareOnesBomber = {
  name: "RARE ONES Boys Printed Manttn Cotton Applique Mock Collar Zip-Front Bomber Jacket",
  url: "https://www.myntra.com/jackets/rare-ones/rare-ones-boys-printed-bomber-jacket/1928374/buy",
  brand: "RARE ONES",
};
const rareOnesCheck = checkProductConsistency(
  rareOnesBomber.name,
  rareOnesBomber.brand,
  "outfit",
  rareOnesBomber.url,
  "Boys Tailored Formal Blazer Online",
  "child",
  blazerSpec.itemSubcategory,
  blazerSpec.dominantColor,
  undefined,
  1574,
  boyProfile.occasion,
  undefined,
  "boys",
  blazerSpec.itemTitle
);
assert.equal(rareOnesCheck.isConsistent, false, "Must reject RARE ONES Bomber Jacket for blazer requirement");
console.log("✓ RARE ONES Bomber rejected:", rareOnesCheck.reason);

// Status Quo Bomber Jacket
const statusQuoBomber = {
  name: "Status Quo Boys Bomber Jacket",
  url: "https://www.myntra.com/jackets/status-quo/status-quo-boys-bomber-jacket/2345678/buy",
  brand: "Status Quo",
};
const statusQuoCheck = checkProductConsistency(
  statusQuoBomber.name,
  statusQuoBomber.brand,
  "outfit",
  statusQuoBomber.url,
  undefined,
  "child",
  blazerSpec.itemSubcategory,
  blazerSpec.dominantColor,
  undefined,
  1580,
  boyProfile.occasion,
  undefined,
  "boys",
  blazerSpec.itemTitle
);
assert.equal(statusQuoCheck.isConsistent, false, "Must reject Status Quo Bomber Jacket for blazer requirement");
console.log("✓ Status Quo Bomber rejected:", statusQuoCheck.reason);

// StyleCast Outdoor Bomber Jacket
const styleCastBomber = {
  name: "StyleCast x Revolte Boys Lightweight Crop Outdoor Bomber with Patchwork Jacket",
  url: "https://www.myntra.com/jackets/stylecast/stylecast-boys-crop-outdoor-bomber/3456789/buy",
  brand: "StyleCast x Revolte",
};
const styleCastCheck = checkProductConsistency(
  styleCastBomber.name,
  styleCastBomber.brand,
  "outfit",
  styleCastBomber.url,
  undefined,
  "child",
  blazerSpec.itemSubcategory,
  blazerSpec.dominantColor,
  undefined,
  2011,
  boyProfile.occasion,
  undefined,
  "boys",
  blazerSpec.itemTitle
);
assert.equal(styleCastCheck.isConsistent, false, "Must reject StyleCast Outdoor Bomber for blazer requirement");
console.log("✓ StyleCast Bomber rejected:", styleCastCheck.reason);

// Valid blazer candidate must pass
const validBlazer = {
  name: "Allen Solly Junior Boys Tailored Single-Breasted Formal Blazer",
  url: "https://www.myntra.com/blazers/allen-solly-junior/allen-solly-boys-formal-blazer/4567890/buy",
  brand: "Allen Solly Junior",
};
const validBlazerCheck = checkProductConsistency(
  validBlazer.name,
  validBlazer.brand,
  "outfit",
  validBlazer.url,
  undefined,
  "child",
  blazerSpec.itemSubcategory,
  blazerSpec.dominantColor,
  undefined,
  2499,
  boyProfile.occasion,
  undefined,
  "boys",
  blazerSpec.itemTitle
);
assert.equal(validBlazerCheck.isConsistent, true, "Valid blazer must pass consistency check");
console.log("✓ Test 3 Passed: Bomber jackets rejected for blazer; authentic blazer accepted.");

// -----------------------------------------------------------------------------
// Test 4: Dynamic Palette Harmony for Decomposed Separates (No Clashing Blue Shirts)
// -----------------------------------------------------------------------------
console.log("\n[Test 4] Testing Palette Harmony for separate inner shirt (Image 5 fix)...");
const shirtSpec = specs.find((s) => s.itemSubcategory === "shirt" || /shirt/i.test(s.itemTitle));
assert.ok(shirtSpec, "Must have an inner shirt spec");
// The piece had detail: "Blue classic cotton shirt", but user loved Dusty rose, Butter yellow, Berry
// and the look is Butter Yellow Vest Set. Blue is completely clashing.
// Dynamic harmonization must convert it to Cream or White (coordinating neutral)
assert.notEqual(shirtSpec.dominantColor?.toLowerCase(), "blue", "Inner shirt must NOT be Blue for a Butter Yellow look");
assert.ok(
  /cream|white|ivory|butter|yellow/i.test(shirtSpec.dominantColor || ""),
  `Inner shirt color must harmonize with the look (got: ${shirtSpec.dominantColor})`
);
assert.ok(
  !shirtSpec.searchQuery.toLowerCase().includes("blue"),
  `Search query must not search for blue shirt (query: ${shirtSpec.searchQuery})`
);
console.log("✓ Test 4 Passed: Shirt harmonized to:", shirtSpec.dominantColor, "with query:", shirtSpec.searchQuery);

// -----------------------------------------------------------------------------
// Test 5: Fallback Retailer Search URL Does Not Generate 'kids-pink-jackets' for Boys
// -----------------------------------------------------------------------------
console.log("\n[Test 5] Testing Fallback Retailer Search URL generation for boys...");
const searchUrl = buildRetailerSearchUrl("Myntra", {
  gender: "boys",
  category: "outfit",
  subcategory: "waistcoat",
  productName: "Boys Tailored Waistcoat",
  color: "Butter Yellow",
});
assert.ok(searchUrl.includes("boys"), "Search URL must include 'boys'");
assert.ok(!searchUrl.includes("kids-pink-jackets"), "Search URL must NOT generate kids-pink-jackets");
assert.ok(searchUrl.includes("waistcoat"), "Search URL must include 'waistcoat'");
console.log("✓ Test 5 Passed: Search URL correctly built:", searchUrl);

console.log("\n======================================================================");
console.log("ALL BOYS WAISTCOAT, BLAZER & PALETTE HARMONY TESTS PASSED CLEANLY!");
console.log("======================================================================");

