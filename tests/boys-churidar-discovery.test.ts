import assert from "node:assert/strict";
import {
  planRequirementSpecs,
  checkProductConsistency,
  getBenchmarkCandidatesForRequirement,
  resolveHumanColor,
  extractColorFromText,
  PersonaType,
} from "../src/lib/product-search";
import {
  buildRetailerSearchUrl,
  isValidProductUrl,
  getRetailerFromUrl,
} from "../src/lib/retailer-urls";

console.log("======================================================================");
console.log("REGRESSION TEST SUITE: BOYS CHURIDAR & ETHNIC BOTTOM PRODUCT DISCOVERY");
console.log("======================================================================");

// -----------------------------------------------------------------------------
// Test 1: Color Resolution & Anti-Garment-Noun Safeguard
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Testing color resolution does not treat garment nouns as color names...");
assert.equal(resolveHumanColor("Churidar", "Royal Blue"), "Royal Blue", "Churidar must not be returned as a color");
assert.equal(resolveHumanColor("Classic Churidar", "Royal Blue"), "Royal Blue", "Classic Churidar must not be returned as a color");
assert.equal(resolveHumanColor("Kurta", "Teal"), "Teal", "Kurta must not be returned as a color");
assert.equal(resolveHumanColor("Boys Kurta", "Teal"), "Teal", "Boys Kurta must not be returned as a color");
assert.equal(resolveHumanColor("Trousers", "Navy Blue"), "Navy Blue", "Trousers must not be returned as a color");
assert.equal(resolveHumanColor("Mojris", "Brown"), "Brown", "Mojris must not be returned as a color");
assert.equal(resolveHumanColor("Off-White Churidar", "Royal Blue"), "Off-White", "Extracted color from title must be Off-White");
assert.equal(resolveHumanColor("White Cotton Churidar", "Teal"), "White", "Extracted color from title must be White");
assert.equal(resolveHumanColor("Navy Blue Silk Kurta", "Teal"), "Navy Blue", "Extracted color from title must be Navy Blue");
assert.equal(extractColorFromText("Boys Royal Blue Embroidered Kurta"), "Royal Blue", "Should extract Royal Blue");
assert.equal(extractColorFromText("Classic Churidar"), null, "Churidar contains no color keywords");
console.log("✓ Test 1 Passed: Garment nouns are never returned as color names; real colors extracted cleanly.");

// -----------------------------------------------------------------------------
// Test 2: Boys Festive Kurta + Churidar Requirement Planning
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Testing Boys Festive Kurta with Churidar decomposes into Kurta and Ethnic Bottom...");
const boyFestiveProfile: any = {
  name: "Aarav",
  pronouns: "Kids / Boys styling",
  gender: "boy",
  ageGroup: "6–10",
  appearance: { skinTone: "Fair", undertone: "Warm", confidence: 85, contrast: "Medium" },
  style: ["Traditional", "Festive"],
  colorsLove: ["Royal Blue", "Gold"],
  colorsAvoid: ["Black"],
  occasion: "Festival",
  impression: ["Playful", "Festive"],
  budget: "₹1.5K–₹3.5K",
};

const boyFestiveLook: any = {
  id: "boy-festive-look-1",
  title: "Boys Festive Kurta & Churidar",
  note: "Royal blue embroidered festive kurta with comfortable cotton churidar.",
  occasion: "Festival",
  outfit: "Boys royal blue embroidered silk festive kurta with classic churidar.",
  outfitColor: "Royal Blue",
  footwear: "Traditional leather mojris with cushioned sole",
  accessories: "None",
  pieces: [
    { category: "Top", name: "Boys Kurta", detail: "Royal blue silk embroidered mandarin collar kurta" },
    { category: "Bottom", name: "Boys Churidar", detail: "Soft breathable cotton churidar" },
  ],
};

const specs = planRequirementSpecs(boyFestiveLook, boyFestiveProfile, "child", ["outfit", "footwear"]);
assert.ok(specs.length >= 2, `Expected at least 2 specs (kurta + churidar), got ${specs.length}`);

const kurtaSpec = specs.find((s) => s.itemSubcategory === "kurta");
assert.ok(kurtaSpec, "Kurta spec must exist with subcat = kurta");
assert.equal(kurtaSpec?.targetGender, "boys");

const churidarSpec = specs.find((s) => s.itemSubcategory === "ethnic_bottom");
assert.ok(churidarSpec, "Churidar spec must exist with subcat = ethnic_bottom (NOT trousers)");
assert.ok(churidarSpec?.itemTitle.includes("Churidar"), `Title must mention Churidar, got: ${churidarSpec?.itemTitle}`);
assert.notEqual(churidarSpec?.dominantColor, "Churidar", "Dominant color must NEVER be 'Churidar'");
assert.ok(!churidarSpec?.stylingRequirement.includes("(Churidar)"), `Styling requirement must not say '(Churidar)', got: ${churidarSpec?.stylingRequirement}`);
assert.ok(!churidarSpec?.searchQuery.includes("tailored trousers pants"), `Search query must NOT contain 'tailored trousers pants', got: ${churidarSpec?.searchQuery}`);
assert.ok(churidarSpec?.searchQuery.includes("churidar"), `Search query must include 'churidar', got: ${churidarSpec?.searchQuery}`);
assert.ok(churidarSpec?.searchQuery.includes("boys"), `Search query must include 'boys', got: ${churidarSpec?.searchQuery}`);
console.log("✓ Test 2 Passed: Boys Churidar planned as ethnic_bottom with clean color, title and search query.");

// -----------------------------------------------------------------------------
// Test 3: Boys Churidar Fallback Benchmark Candidates
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Testing Boys Churidar benchmark candidates return verified ethnic bottoms...");
const churidarBench = getBenchmarkCandidatesForRequirement(churidarSpec!, "child", 3500, "Royal Blue");
assert.ok(churidarBench.length >= 3, `Expected at least 3 benchmark candidates, got ${churidarBench.length}`);

for (const candidate of churidarBench) {
  assert.ok(candidate.productTitle.toLowerCase().includes("churidar"), `Product must be a churidar: ${candidate.productTitle}`);
  assert.ok(candidate.productTitle.toLowerCase().includes("boy"), `Product must be for boys: ${candidate.productTitle}`);
  assert.ok(!candidate.productTitle.toLowerCase().includes("kurta set"), `Product must not be a kurta set: ${candidate.productTitle}`);
  assert.ok(!candidate.productTitle.toLowerCase().includes("trousers"), `Product must not be trousers: ${candidate.productTitle}`);
  assert.ok(isValidProductUrl(candidate.url), `Candidate URL must be valid: ${candidate.url}`);

  // Test that each benchmark candidate passes consistency verification
  const consistency = checkProductConsistency(
    candidate.productTitle,
    candidate.brand,
    "outfit",
    candidate.url,
    undefined,
    "child",
    churidarSpec!.itemSubcategory,
    churidarSpec!.dominantColor,
    undefined,
    candidate.price,
    "Festival",
    undefined,
    "boys",
    churidarSpec!.itemTitle,
  );
  assert.equal(consistency.isConsistent, true, `Benchmark candidate '${candidate.productTitle}' must pass consistency: ${consistency.reason}`);
}
console.log("✓ Test 3 Passed: Benchmark candidates provide verified boys churidars that pass consistency.");

// -----------------------------------------------------------------------------
// Test 4: Consistency Validation Rules for Boys Ethnic Bottoms
// -----------------------------------------------------------------------------
console.log("\n[Test 4] Testing consistency check precision for boys ethnic bottoms...");

// Valid boy churidar
const validBoyChuridar = checkProductConsistency(
  "Vastramay Boys Off-White Solid Cotton Churidar",
  "Vastramay",
  "outfit",
  "https://www.myntra.com/churidar/vastramay/boys-off-white-churidar/12345/buy",
  undefined,
  "child",
  "ethnic_bottom",
  "Off-White",
  undefined,
  499,
  "Festival",
  undefined,
  "boys",
);
assert.equal(validBoyChuridar.isConsistent, true, `Valid boy churidar must pass: ${validBoyChuridar.reason}`);

// Churidar paired with kurta phrasing
const pairingChuridar = checkProductConsistency(
  "Kisah Boys White Cotton Churidar for Kurta",
  "Kisah",
  "outfit",
  "https://www.ajio.com/kisah-boys-white-churidar/p/4612345",
  undefined,
  "child",
  "ethnic_bottom",
  "White",
  undefined,
  799,
  "Festival",
  undefined,
  "boys",
);
assert.equal(pairingChuridar.isConsistent, true, `Churidar with 'for Kurta' phrasing must pass: ${pairingChuridar.reason}`);

// Kurta set incorrectly passed to ethnic_bottom must be rejected
const fullKurtaSet = checkProductConsistency(
  "Boys Blue Printed Cotton Festive Kurta Dhoti Set",
  "Vastramay",
  "outfit",
  "https://www.myntra.com/boys-blue-kurta-set/12345/buy",
  undefined,
  "child",
  "ethnic_bottom",
  "Off-White",
  undefined,
  999,
  "Festival",
  undefined,
  "boys",
);
assert.equal(fullKurtaSet.isConsistent, false, "Full Kurta Set must be rejected when requirement is ethnic_bottom");

// Adult men's churidar must be rejected for boys
const adultMenChuridar = checkProductConsistency(
  "Men Off-White Solid Cotton Churidar",
  "Manyavar",
  "outfit",
  "https://www.tatacliq.com/men-churidar/p-12345",
  undefined,
  "child",
  "ethnic_bottom",
  "Off-White",
  undefined,
  899,
  "Festival",
  undefined,
  "boys",
);
assert.equal(adultMenChuridar.isConsistent, false, "Adult men's churidar must be rejected for boys demographic");

// Adult women's kurti must be rejected
const womenKurti = checkProductConsistency(
  "Women Off-White Embroidered Kurti",
  "Libas",
  "outfit",
  "https://www.myntra.com/women-kurti/12345/buy",
  undefined,
  "child",
  "ethnic_bottom",
  "Off-White",
  undefined,
  1299,
  "Festival",
  undefined,
  "boys",
);
assert.equal(womenKurti.isConsistent, false, "Women's kurti must be rejected for boys ethnic bottom");
console.log("✓ Test 4 Passed: Consistency checks cleanly distinguish boys churidars from adult, women, and kurta sets.");

// -----------------------------------------------------------------------------
// Test 5: Retailer URL Support for FirstCry and Bata
// -----------------------------------------------------------------------------
console.log("\n[Test 5] Testing FirstCry and Bata URL support and generation...");
const firstcryUrl = buildRetailerSearchUrl("FirstCry", {
  gender: "boys",
  productName: "Boys Cotton Churidar",
  color: "Off-White",
  category: "outfit",
});
assert.ok(firstcryUrl.includes("firstcry.com/search?q="), `FirstCry search URL must use firstcry.com/search: ${firstcryUrl}`);
assert.ok(firstcryUrl.includes("boys"), `FirstCry search URL must contain 'boys': ${firstcryUrl}`);

const bataUrl = buildRetailerSearchUrl("Bata", {
  gender: "boys",
  productName: "Boys Leather Mojris",
  category: "footwear",
});
assert.ok(bataUrl.includes("bata.com/in/search?q="), `Bata search URL must use bata.com: ${bataUrl}`);

assert.equal(getRetailerFromUrl("https://www.firstcry.com/babyhug/cotton-churidar/12345/product-detail"), "FirstCry");
assert.equal(getRetailerFromUrl("https://www.bata.com/in/boys-sandals-12345.html"), "Bata");
assert.equal(isValidProductUrl("https://www.firstcry.com/tabard/boys-white-churidar/98765/product-detail"), true);
assert.equal(isValidProductUrl("https://www.bata.com/in/boys-formal-shoes-54321.html"), true);
console.log("✓ Test 5 Passed: FirstCry and Bata URLs correctly identified, validated and generated.");

console.log("\n======================================================================");
console.log("ALL 5 BOYS CHURIDAR & ETHNIC BOTTOM TESTS PASSED CLEANLY! 🎉");
console.log("======================================================================");

