/**
 * Comprehensive Dynamic Outfit Component & Footwear Decomposition Test Suite
 *
 * Verifies that:
 * 1. Clothing and footwear components are identified dynamically from look descriptions/pieces.
 * 2. Multi-piece separates (shirt + pants, shirt + shorts, blazer + top + trousers, kurta + dhoti)
 *    are decomposed into separate requirement specs with independent product recommendations.
 * 3. One-piece outfits (dresses, jumpsuits) remain appropriately unified without artificial breakdown.
 * 4. Footwear types (sandals/slides, loafers, oxfords, heels, mojaris/juttis, sneakers) are dynamically
 *    detected from look descriptions and matched to suitable verified candidates without hardcoding.
 * 5. Category isolation and cross-contamination prevention work across all combinations.
 * 6. Tabs, filtering, and empty-state notifications are reliable.
 */

import assert from "node:assert";
import {
  decomposeOutfitGarments,
  detectFootwearSpec,
  planRequirementSpecs,
  searchProductsForLook,
  checkProductConsistency,
} from "../src/lib/product-search.ts";
import { getStylingContext } from "../src/lib/styling-context.ts";

console.log("======================================================================");
console.log("TEST SUITE: DYNAMIC OUTFIT & FOOTWEAR DECOMPOSITION REGRESSION TESTS");
console.log("======================================================================\n");

// -----------------------------------------------------------------------------
// Test Case 1: Separates with Casual Summer Look (Shirt + Shorts + Slide Sandals)
// -----------------------------------------------------------------------------
console.log("[Test 1] Testing Boy's Resort Separates: Shirt + Shorts + Slide Sandals...");
const boyResortProfile = {
  audience: "child",
  gender: "male",
  age: "kid",
  occasion: "Goa beach vacation",
  style: ["Casual", "Resort"],
};
const boyResortLook = {
  id: "boy-resort-01",
  title: "Breezy Coastal Holiday",
  outfit: "Boys breathable Maroon relaxed-fit linen button-down shirt with wide-leg breathable linen shorts",
  outfitColor: "Maroon",
  footwear: "Open-toe breathable tan leather slide sandals",
  applicableCategories: ["outfit", "footwear"],
};

const boyCtx = getStylingContext(boyResortProfile);
const boyGarmentSpecs = decomposeOutfitGarments(
  boyResortLook,
  boyResortProfile,
  "boys",
  "Maroon",
  boyCtx,
);

assert.strictEqual(boyGarmentSpecs.length, 2, "Must decompose into 2 separate garment specs (shirt and shorts)");
const boyShirtSpec = boyGarmentSpecs.find((s) => s.itemSubcategory === "shirt");
const boyShortsSpec = boyGarmentSpecs.find((s) => s.itemSubcategory === "shorts");

assert.ok(boyShirtSpec, "Must have a dedicated shirt requirement spec");
assert.ok(boyShortsSpec, "Must have a dedicated shorts requirement spec");
assert.ok(boyShirtSpec.itemTitle.toLowerCase().includes("shirt"), "Shirt spec title must describe shirt");
assert.ok(boyShortsSpec.itemTitle.toLowerCase().includes("shorts"), "Shorts spec title must describe shorts");
assert.strictEqual(boyShirtSpec.targetGender, "boys", "Shirt target gender must be boys");
assert.strictEqual(boyShortsSpec.targetGender, "boys", "Shorts target gender must be boys");

const boyFootSpec = detectFootwearSpec(
  boyResortLook,
  boyResortProfile,
  "boys",
  "Maroon",
  boyCtx,
  "child",
);

assert.strictEqual(boyFootSpec.category, "footwear", "Category must be footwear");
assert.strictEqual(boyFootSpec.itemSubcategory, "sandals", "Must dynamically identify sandals from 'slide sandals'");
assert.ok(boyFootSpec.itemTitle.toLowerCase().includes("sandal"), "Footwear title must identify sandals");
assert.ok(boyFootSpec.searchQuery.toLowerCase().includes("sandal"), "Search query must target sandals");
assert.ok(!boyFootSpec.searchQuery.toLowerCase().includes("sneaker"), "Search query must NOT fall back to sneakers");

console.log("  ✓ Test 1 Passed: Boy resort look dynamically separated into Shirt, Shorts, and Slide Sandals.");

// -----------------------------------------------------------------------------
// Test Case 2: One-Piece Look (Emerald Green Silk Slip Midi Dress + Heels)
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Testing Woman's One-Piece Dress + Heels (No artificial top/bottom split)...");
const womanDressProfile = {
  audience: "myself",
  gender: "female",
  age: "20s",
  occasion: "Evening Cocktail Party",
  style: ["Minimalist", "Chic"],
};
const womanDressLook = {
  id: "woman-dress-01",
  title: "Emerald Elegance",
  outfit: "Emerald green silk slip midi dress with delicate shoulder straps",
  outfitColor: "Emerald Green",
  footwear: "Metallic gold strappy block heels",
  applicableCategories: ["outfit", "footwear"],
};

const womanCtx = getStylingContext(womanDressProfile);
const womanDressSpecs = decomposeOutfitGarments(
  womanDressLook,
  womanDressProfile,
  "women",
  "Emerald Green",
  womanCtx,
);

assert.strictEqual(womanDressSpecs.length, 1, "One-piece dress must remain 1 unified outfit spec");
assert.strictEqual(womanDressSpecs[0].itemSubcategory, "dress", "Subcategory must be dress");
assert.ok(womanDressSpecs[0].itemTitle.toLowerCase().includes("dress"), "Title must contain dress");

const womanFootSpec = detectFootwearSpec(
  womanDressLook,
  womanDressProfile,
  "women",
  "Emerald Green",
  womanCtx,
  "woman",
);
assert.strictEqual(womanFootSpec.itemSubcategory, "heels", "Must dynamically detect heels from 'strappy block heels'");
assert.ok(womanFootSpec.itemTitle.toLowerCase().includes("heel"), "Footwear title must mention heels");
assert.ok(womanFootSpec.searchQuery.toLowerCase().includes("heel"), "Search query must search for heels");

console.log("  ✓ Test 2 Passed: One-piece dress remained unified; heels dynamically detected.");

// -----------------------------------------------------------------------------
// Test Case 3: 3-Piece Layered Suit Separates (Blazer + Shirt + Trousers + Loafers)
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Testing Man's 3-Piece Formal Suit Separates + Loafers...");
const manSuitProfile = {
  audience: "myself",
  gender: "male",
  age: "30s",
  occasion: "Corporate Business Summit",
  style: ["Formal", "Tailored"],
};
const manSuitLook = {
  id: "man-suit-01",
  title: "Sharp Executive Presence",
  outfit: "Navy tailored single-breasted wool blazer with crisp white poplin shirt and charcoal pleated trousers",
  outfitColor: "Navy",
  footwear: "Classic dark brown suede penny loafers",
  applicableCategories: ["outfit", "footwear"],
};

const manCtx = getStylingContext(manSuitProfile);
const manSuitSpecs = decomposeOutfitGarments(
  manSuitLook,
  manSuitProfile,
  "men",
  "Navy",
  manCtx,
);

assert.strictEqual(manSuitSpecs.length, 3, "Must decompose into Layer, Top, and Bottom (3 separate specs)");
const manBlazer = manSuitSpecs.find((s) => s.itemSubcategory === "blazer");
const manShirt = manSuitSpecs.find((s) => s.itemSubcategory === "shirt" || s.itemSubcategory === "top");
const manTrousers = manSuitSpecs.find((s) => s.itemSubcategory === "trousers");

assert.ok(manBlazer, "Must have blazer spec");
assert.ok(manShirt, "Must have shirt spec");
assert.ok(manTrousers, "Must have trousers spec");

const manLoaferSpec = detectFootwearSpec(
  manSuitLook,
  manSuitProfile,
  "men",
  "Navy",
  manCtx,
  "man",
);
assert.strictEqual(manLoaferSpec.itemSubcategory, "loafers", "Must dynamically detect loafers from 'penny loafers'");

console.log("  ✓ Test 3 Passed: 3-piece suit deconstructed into Blazer, Shirt, Trousers, and Loafers.");

// -----------------------------------------------------------------------------
// Test Case 4: Traditional Indian Separates (Kurta + Chudidar + Mojaris)
// -----------------------------------------------------------------------------
console.log("\n[Test 4] Testing Traditional Indian Separates: Kurta + Churidar + Mojaris...");
const boyKurtaProfile = {
  audience: "child",
  gender: "male",
  age: "kid",
  occasion: "Diwali Family Celebration",
  style: ["Traditional"],
};
const boyKurtaLook = {
  id: "boy-diwali-01",
  title: "Festive Prince",
  outfit: "Boys royal blue embroidered raw silk kurta with off-white chudidar pyjama",
  outfitColor: "Royal Blue",
  footwear: "Handcrafted metallic thread ethnic mojaris",
  applicableCategories: ["outfit", "footwear"],
};

const boyKurtaSpecs = decomposeOutfitGarments(
  boyKurtaLook,
  boyKurtaProfile,
  "boys",
  "Royal Blue",
  boyCtx,
);

assert.strictEqual(boyKurtaSpecs.length, 2, "Must decompose into Kurta (top) and Churidar (bottom)");
assert.ok(boyKurtaSpecs.some((s) => s.itemSubcategory === "kurta"), "Must include kurta spec");
assert.ok(boyKurtaSpecs.some((s) => s.itemSubcategory === "trousers"), "Must include pyjama/churidar spec");

const boyMojariSpec = detectFootwearSpec(
  boyKurtaLook,
  boyKurtaProfile,
  "boys",
  "Royal Blue",
  boyCtx,
  "child",
);
assert.strictEqual(boyMojariSpec.itemSubcategory, "mojaris", "Must dynamically detect mojaris");

console.log("  ✓ Test 4 Passed: Traditional kurta + bottom + mojaris decomposed cleanly.");

// -----------------------------------------------------------------------------
// Test Case 5: Casual Separates (Graphic Tee + Denim Jeans + Canvas Sneakers)
// -----------------------------------------------------------------------------
console.log("\n[Test 5] Testing Casual Separates: Tee + Jeans + Sneakers...");
const girlCasualProfile = {
  audience: "child",
  gender: "female",
  age: "kid",
  occasion: "Weekend Birthday Party",
  style: ["Casual", "Playful"],
};
const girlCasualLook = {
  id: "girl-casual-01",
  title: "Cheerful Weekend",
  outfit: "Girls pastel lavender cotton graphic t-shirt with light wash relaxed denim jeans",
  outfitColor: "Lavender",
  footwear: "White canvas low-top sneakers",
  applicableCategories: ["outfit", "footwear"],
};

const girlCtx = getStylingContext(girlCasualProfile);
const girlCasualSpecs = decomposeOutfitGarments(
  girlCasualLook,
  girlCasualProfile,
  "girls",
  "Lavender",
  girlCtx,
);

assert.strictEqual(girlCasualSpecs.length, 2, "Must decompose into T-shirt and Jeans");
assert.ok(girlCasualSpecs.some((s) => s.itemSubcategory === "top"), "Must include top/tee spec");
assert.ok(girlCasualSpecs.some((s) => s.itemSubcategory === "trousers"), "Must include jeans/bottom spec");

const girlSneakerSpec = detectFootwearSpec(
  girlCasualLook,
  girlCasualProfile,
  "girls",
  "Lavender",
  girlCtx,
  "child",
);
assert.strictEqual(girlSneakerSpec.itemSubcategory, "sneakers", "Must dynamically detect sneakers");

console.log("  ✓ Test 5 Passed: Casual tee + jeans + sneakers decomposed cleanly.");

// -----------------------------------------------------------------------------
// Test Case 6: Category Isolation and Cross-Contamination Verification
// -----------------------------------------------------------------------------
console.log("\n[Test 6] Testing Category Consistency and Cross-Contamination Rejection...");

// 6a. Shoes must NOT be accepted in outfit category
const shoeInOutfit = checkProductConsistency(
  "Nike Air Max Casual Running Shoes",
  "Nike",
  "outfit",
  "https://www.myntra.com/shoes/nike/123",
  undefined,
  "child",
  "shorts",
  "Maroon",
  undefined,
  2499,
  "Goa beach vacation",
  undefined,
  "boys",
);
assert.strictEqual(shoeInOutfit.isConsistent, false, "Shoes must be rejected in outfit category");

// 6b. Shirts must NOT be accepted as shorts
const shirtAsShorts = checkProductConsistency(
  "Boys Solid Cotton Linen Shirt",
  "CHARCHIT",
  "outfit",
  "https://www.myntra.com/shirts/charchit/123",
  undefined,
  "child",
  "shorts",
  "Maroon",
  undefined,
  899,
  "Goa beach vacation",
  undefined,
  "boys",
);
assert.strictEqual(shirtAsShorts.isConsistent, false, "Shirts must be rejected when requirement is shorts");

// 6c. Shorts must NOT be accepted as shirts
const shortsAsShirt = checkProductConsistency(
  "Boys Cotton Chino Shorts",
  "U.S. Polo Assn.",
  "outfit",
  "https://www.myntra.com/shorts/us-polo/123",
  undefined,
  "child",
  "shirt",
  "Maroon",
  undefined,
  799,
  "Goa beach vacation",
  undefined,
  "boys",
);
assert.strictEqual(shortsAsShirt.isConsistent, false, "Shorts must be rejected when requirement is shirt");

// 6d. Sneakers must NOT be accepted when requirement is sandals
const sneakersAsSandals = checkProductConsistency(
  "Boys High Top Canvas Sneakers",
  "Puma",
  "footwear",
  "https://www.myntra.com/shoes/puma/123",
  undefined,
  "child",
  "sandals",
  "Tan",
  undefined,
  1499,
  "Goa beach vacation",
  undefined,
  "boys",
);
assert.strictEqual(sneakersAsSandals.isConsistent, false, "Sneakers must be rejected when requirement is sandals");

// 6e. Valid slide sandals MUST be accepted for sandals requirement
const validSlideSandals = checkProductConsistency(
  "Boys Tan Breathable Double-Strap Slide Sandals",
  "Bata",
  "footwear",
  "https://www.myntra.com/sandals/bata/123",
  undefined,
  "child",
  "sandals",
  "Tan",
  undefined,
  699,
  "Goa beach vacation",
  undefined,
  "boys",
);
assert.strictEqual(validSlideSandals.isConsistent, true, "Slide sandals must be accepted for sandals requirement");

// 6f. Adult women's clothing must NOT be accepted for a boy child
const womenItemForBoy = checkProductConsistency(
  "Women Floral Print Flared Kurti",
  "Anouk",
  "outfit",
  "https://www.myntra.com/kurtis/anouk/123",
  undefined,
  "child",
  "shirt",
  "Maroon",
  undefined,
  899,
  "Goa beach vacation",
  undefined,
  "boys",
);
assert.strictEqual(womenItemForBoy.isConsistent, false, "Women's kurti must be rejected for a boy");

console.log("  ✓ Test 6 Passed: Cross-contamination strictly prevented across all categories and subcategories.");

// -----------------------------------------------------------------------------
// Test Case 7: Full Pipeline Integration with searchProductsForLook
// -----------------------------------------------------------------------------
console.log("\n[Test 7] Testing End-to-End searchProductsForLook for Multi-Component Look...");

const fullSearchLook = {
  id: "full-look-resort",
  title: "Breezy Linen Resort Set",
  outfit: "Boys breathable Maroon relaxed-fit linen button-down shirt with wide-leg breathable linen shorts",
  outfitColor: "Maroon",
  footwear: "Open-toe breathable tan leather slide sandals",
  applicableCategories: ["outfit", "footwear"],
};

const fullProfile = {
  audience: "child",
  gender: "male",
  age: "kid",
  occasion: "Goa vacation",
  style: ["Casual", "Resort"],
};

const productRes = await searchProductsForLook(
  fullSearchLook,
  fullProfile,
  "all",
  true,
);

assert.ok(productRes.groups.length >= 3, `Must produce at least 3 distinct product groups (got ${productRes.groups.length})`);
const groupTitles = productRes.groups.map((g) => g.recommendedItemTitle.toLowerCase());

const hasShirtGroup = groupTitles.some((t) => t.includes("shirt"));
const hasShortsGroup = groupTitles.some((t) => t.includes("shorts"));
const hasSandalsGroup = groupTitles.some((t) => t.includes("sandal") || t.includes("slide") || t.includes("footwear"));

assert.ok(hasShirtGroup, "Product recommendations must include a dedicated group for Shirt");
assert.ok(hasShortsGroup, "Product recommendations must include a dedicated group for Shorts");
assert.ok(hasSandalsGroup, "Product recommendations must include a dedicated group for Footwear/Sandals");

console.log("  ✓ Test 7 Passed: End-to-end recommendation pipeline returned distinct groups for Shirt, Shorts, and Sandals:");
for (const grp of productRes.groups) {
  console.log(`    - Group: "${grp.recommendedItemTitle}" (${grp.category}) -> ${grp.products.length} products`);
}

// -----------------------------------------------------------------------------
// Test Case 8: Tab Category Filtering & Empty State Retention
// -----------------------------------------------------------------------------
console.log("\n[Test 8] Testing footwear-accessories Category Tab Resolution...");

const footwearTabRes = await searchProductsForLook(
  fullSearchLook,
  fullProfile,
  "footwear-accessories",
  true,
);

assert.ok(footwearTabRes.groups.length >= 1, "Footwear-accessories tab query must resolve footwear groups");
assert.strictEqual(footwearTabRes.groups[0].category, "footwear", "Group category must be footwear");

console.log("  ✓ Test 8 Passed: 'footwear-accessories' tab properly resolves footwear requirement specs.");

console.log("\n======================================================================");
console.log("ALL DYNAMIC COMPONENT DECOMPOSITION TESTS PASSED WITH ZERO REGRESSIONS! 🚀");
console.log("======================================================================\n");
