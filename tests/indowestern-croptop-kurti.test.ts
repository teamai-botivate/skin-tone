import assert from "node:assert/strict";
import {
  checkProductConsistency,
  decomposeOutfitGarments,
  buildWomenGarmentQuery,
} from "../src/lib/product-search";
import type { LookRecommendation, SkinTuneProfile } from "../src/lib/skintune-schemas";

console.log("======================================================================");
console.log("TEST SUITE: INDO-WESTERN CROP TOP, NET SHRUG & PEPLUM SHORT KURTI");
console.log("======================================================================");

const dummyProfile: SkinTuneProfile = {
  name: "Anushka",
  pronouns: "she/her/women",
  gender: "female",
  ageGroup: "25–34",
  height: "",
  photoUrl: "",
  bodyPhotoUrl: "",
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 90, contrast: "Medium" },
  bodyBuild: "",
  fit: "",
  style: ["Indo-Western Fusion", "Chic Contemporary"],
  colorsLove: ["Rose", "Dusty rose"],
  colorsAvoid: [],
  restrictions: [],
  occasion: "Wedding Reception",
  impression: [],
  budget: "Mid-Range",
  customStyleNotes: "Indo-Western crop top and shrug set",
} as unknown as SkinTuneProfile;

const ctx = {
  isBoy: false,
  isGirl: false,
  isKids: false,
  isToddlerOrBaby: false,
  isOlderChild: false,
  isTeen: false,
  isAdultMan: false,
  isAdultWoman: true,
};

// --- Test 1: Decompose Indo-Western Outfit with Crop Top & Net Shrug ---
console.log("\n[Test 1] Indo-Western Crop Top & Net Shrug Decomposition...");
const indoWesternLook: LookRecommendation = {
  id: "test-indo-01",
  title: "Embroidered Crop Top with Sheer Net Shrug & Palazzo",
  note: "Indo western crop top set",
  category: "Indo-Western",
  personaEnergy: "Chic",
  palette: ["#fff"],
  imageUrl: "/pending.webp",
  outfit: "Embroidered rose pink crop top with a sheer net shrug and flared palazzo pants",
  outfitColor: "Rose Pink",
  pieces: [
    { category: "Top", name: "Embroidered Crop Top", detail: "Fitted bustier crop top with floral zari work." },
    { category: "Layer", name: "Sheer Net Shrug", detail: "Floor-length sheer net cape shrug with ruffled edges." },
    { category: "Bottom", name: "Flared Palazzo Trousers", detail: "Wide-leg ivory palazzo pants with embroidered waistband." },
  ],
  jewellery: "Statement earrings",
  hairstyle: "Soft waves",
  makeup: "Dewy soft glam",
  footwear: "Block heel sandals",
  accessories: "Micro clutch",
  vibe: "Elegant",
  confidence: 95,
  applicableCategories: ["outfit", "footwear", "accessories"],
  reasoning: ["Flowy net shrug adds regal movement without restricting dancing."],
};

const specs = decomposeOutfitGarments(indoWesternLook, dummyProfile, "women", "Rose", ctx as any);
assert.equal(specs.length, 3, "Should detect exactly 3 garment specs (top, layer, bottom)");

const cropTopSpec = specs.find((s) => s.itemSubcategory === "crop_top");
assert.ok(cropTopSpec, "Should classify Embroidered Crop Top with subcat 'crop_top'");
assert.ok(
  cropTopSpec.searchQuery.toLowerCase().includes("crop top"),
  `Search query should preserve 'crop top', got: '${cropTopSpec.searchQuery}'`,
);
assert.ok(
  !cropTopSpec.searchQuery.toLowerCase().includes("women rose top myntra"),
  "Search query should NOT collapse into generic 'top'",
);

const shrugSpec = specs.find((s) => s.itemSubcategory === "shrug");
assert.ok(shrugSpec, "Should classify Sheer Net Shrug with subcat 'shrug'");
assert.ok(
  shrugSpec.searchQuery.toLowerCase().includes("shrug") || shrugSpec.searchQuery.toLowerCase().includes("cape"),
  `Search query should preserve 'shrug' or 'cape', got: '${shrugSpec.searchQuery}'`,
);

console.log("✓ Test 1 Passed: Crop top and net shrug cleanly decomposed and queried.");

// --- Test 2: Reject Generic Western Top for Embroidered Crop Top ---
console.log("\n[Test 2] checkProductConsistency for Crop Top vs Generic Top...");
// The exact mismatched product from user's screenshot
const sheinTopCheck = checkProductConsistency(
  "Rose Pink Tops for Women by Shein Online",
  "Shein",
  "outfit",
  "https://www.ajio.com/shein-rose-pink-tops/p/12345",
  "Rose Pink Tops for Women",
  "woman",
  "crop_top",
  "Rose",
  "https://assets.ajio.com/medias/test.jpg",
  499,
  "Wedding Reception",
  undefined,
  "women",
  "Embroidered Crop Top",
);

assert.equal(
  sheinTopCheck.isConsistent,
  false,
  "Should REJECT generic Shein online top when requirement is an Embroidered Crop Top",
);
console.log("Rejection reason:", sheinTopCheck.reason);

// A genuine embroidered crop top should PASS
const realCropTopCheck = checkProductConsistency(
  "Indo Era Women Embroidered Crop Top with Floral Accents",
  "Indo Era",
  "outfit",
  "https://www.myntra.com/crop-tops/indo-era/embroidered/12345/buy",
  "Indo Era Embroidered Crop Top",
  "woman",
  "crop_top",
  "Rose",
  "https://assets.myntra.com/medias/test.jpg",
  1299,
  "Wedding Reception",
  undefined,
  "women",
  "Embroidered Crop Top",
);
assert.equal(realCropTopCheck.isConsistent, true, "Should ACCEPT genuine embroidered crop top");
console.log("✓ Test 2 Passed: Generic non-cropped tops strictly rejected for crop top requirements.");

// --- Test 3: Peplum Short Kurti (Not a Top & No H&M) ---
console.log("\n[Test 3] Peplum Short Kurti Classification & Retailer Screening...");
const kurtiLook: LookRecommendation = {
  id: "test-kurti-01",
  title: "Peplum Short Kurti with Cowl Tulip Trousers",
  note: "Short kurti set",
  category: "Indo-Western",
  personaEnergy: "Radiant",
  palette: ["#fff"],
  imageUrl: "/pending.webp",
  outfit: "Structured dusty rose embroidered peplum short kurti paired with pleated tulip cowl trousers",
  outfitColor: "Dusty Rose",
  pieces: [
    { category: "Top", name: "Embroidered Peplum Short Kurti", detail: "Fitted bodice with flared peplum hem." },
    { category: "Bottom", name: "Pleated Asymmetric Tulip Cowl Trousers", detail: "Draped tulip cut." },
  ],
  jewellery: "Polki studs",
  hairstyle: "Messy ponytail",
  makeup: "Dewy flush",
  footwear: "Flat juttis",
  accessories: "Micro sling bag",
  vibe: "Radiant",
  confidence: 93,
  applicableCategories: ["outfit", "jewellery", "footwear", "accessories"],
  reasoning: ["Cinched peplum short kurti creates a flattering ethnic silhouette."],
};

const kurtiSpecs = decomposeOutfitGarments(kurtiLook, dummyProfile, "women", "Dusty Rose", ctx as any);
const peplumKurtiSpec = kurtiSpecs.find((s) => s.itemSubcategory === "kurta");
assert.ok(peplumKurtiSpec, "Peplum short kurti must be classified under subcat 'kurta'");
assert.ok(
  peplumKurtiSpec.itemTitle.toLowerCase().includes("kurti"),
  `Piece title must say kurti, not 'top': '${peplumKurtiSpec.itemTitle}'`,
);
assert.ok(
  !peplumKurtiSpec.preferredRetailers.includes("H&M"),
  "Preferred retailers for ethnic kurti must NOT include H&M",
);

// Consistency check: H&M top must be REJECTED
const hmTopCheck = checkProductConsistency(
  "H&M Dusty Rose Peplum Top",
  "H&M",
  "outfit",
  "https://www2.hm.com/en_in/productpage.98765.html",
  "H&M Peplum Top",
  "woman",
  "kurta",
  "Dusty Rose",
  "https://lp2.hm.com/test.jpg",
  999,
  "Wedding Reception",
  undefined,
  "women",
  "Embroidered Peplum Short Kurti",
);
assert.equal(hmTopCheck.isConsistent, false, "Should REJECT western H&M top for ethnic short kurti");
console.log("H&M rejection reason:", hmTopCheck.reason);

// A genuine ethnic short kurti should PASS
const realKurtiCheck = checkProductConsistency(
  "Libas Women Dusty Rose Embroidered Peplum Short Kurti",
  "Libas",
  "outfit",
  "https://www.myntra.com/kurtis/libas/dusty-rose-peplum/54321/buy",
  "Libas Embroidered Peplum Short Kurti",
  "woman",
  "kurta",
  "Dusty Rose",
  "https://assets.myntra.com/medias/test.jpg",
  1499,
  "Wedding Reception",
  undefined,
  "women",
  "Embroidered Peplum Short Kurti",
);
assert.equal(realKurtiCheck.isConsistent, true, "Should ACCEPT genuine ethnic short kurti");
console.log("✓ Test 3 Passed: Ethnic short kurti verified, H&M and western tops excluded.");

// --- Test 4: Net Shrug vs Puffer Jacket ---
console.log("\n[Test 4] Net Shrug Consistency vs Heavy Winter Outerwear...");
const pufferCheck = checkProductConsistency(
  "Rose Pink Quilted Puffer Jacket with Hood",
  "Roadster",
  "outfit",
  "https://www.myntra.com/jackets/puffer/65432/buy",
  "Rose Puffer Jacket",
  "woman",
  "shrug",
  "Rose",
  "https://assets.myntra.com/test.jpg",
  1999,
  "Wedding Reception",
  undefined,
  "women",
  "Sheer Net Shrug",
);
assert.equal(pufferCheck.isConsistent, false, "Should REJECT heavy puffer jacket when requirement is a Net Shrug");

const realShrugCheck = checkProductConsistency(
  "Inddus Women Rose Gold Sheer Embroidered Net Shrug Cape",
  "Inddus",
  "outfit",
  "https://www.ajio.com/inddus-net-shrug/p/34567",
  "Inddus Net Shrug Cape",
  "woman",
  "shrug",
  "Rose",
  "https://assets.ajio.com/test.jpg",
  1199,
  "Wedding Reception",
  undefined,
  "women",
  "Sheer Net Shrug",
);
assert.equal(realShrugCheck.isConsistent, true, "Should ACCEPT sheer net shrug cape");
console.log("✓ Test 4 Passed: Net shrug cape verified and protected from winter outerwear.");

console.log("\n======================================================================");
console.log("ALL INDO-WESTERN & ETHNIC RE-CREATION TESTS PASSED CLEANLY! ✨");
console.log("======================================================================\n");

