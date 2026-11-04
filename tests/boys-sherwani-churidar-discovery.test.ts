import assert from "node:assert/strict";
import {
  planRequirementSpecs,
  checkProductConsistency,
  getBenchmarkCandidatesForRequirement,
  resolveHumanColor,
  extractColorFromText,
} from "../src/lib/product-search";
import {
  buildRetailerSearchUrl,
  isValidProductUrl,
  getRetailerFromUrl,
} from "../src/lib/retailer-urls";

console.log("======================================================================");
console.log("REGRESSION: BOYS SHERWANI & CHURIDAR DISCOVERY & VALIDATION");
console.log("======================================================================");

const boyProfile: any = {
  name: "Kabir",
  pronouns: "Kids / Boys styling",
  gender: "boy",
  ageGroup: "6–10",
  occasion: "Festival",
  style: ["Traditional", "Festive"],
  colorsLove: ["Cream", "Maroon"],
  budget: "₹1.5K–₹3.5K",
};

const boySherwaniLook: any = {
  id: "look-sherwani-01",
  title: "Boys Festive Sherwani & Churidar",
  note: "Rich cream embroidered festive sherwani with classic off-white churidar.",
  occasion: "Festival",
  outfit: "Boys cream embroidered silk festive sherwani with classic off-white churidar.",
  outfitColor: "Cream",
  footwear: "Traditional leather mojris with cushioned sole",
  accessories: "None",
  pieces: [
    { category: "Top", name: "Boys Sherwani", detail: "Cream silk embroidered mandarin collar sherwani" },
    { category: "Bottom", name: "Boys Churidar", detail: "Off-white soft cotton churidar" },
  ],
};

// -----------------------------------------------------------------------------
// Test 1: Boys Sherwani discovery and requirement extraction
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Testing Boys Sherwani requirement planning & subcategory recognition...");
const specs = planRequirementSpecs(boySherwaniLook, boyProfile, "child", ["outfit", "footwear"]);
assert.ok(specs.length >= 2, `Expected at least 2 outfit specs (sherwani + churidar), got ${specs.length}`);

const sherwaniSpec = specs.find((s) => s.itemSubcategory === "sherwani");
assert.ok(sherwaniSpec, "Sherwani spec must exist with itemSubcategory = 'sherwani' (NOT 'top')");
assert.equal(sherwaniSpec?.targetGender, "boys");
assert.ok(sherwaniSpec?.itemTitle.includes("Sherwani"), "Item title must contain Sherwani");
assert.notEqual(sherwaniSpec?.dominantColor, "Sherwani", "Dominant color must never be 'Sherwani'");
assert.notEqual(sherwaniSpec?.dominantColor, "Boys Sherwani", "Dominant color must never be 'Boys Sherwani'");
assert.equal(sherwaniSpec?.dominantColor, "Cream", "Dominant color must resolve to Cream");
assert.ok(sherwaniSpec?.searchQuery.includes("boys"), "Search query must include 'boys'");
assert.ok(sherwaniSpec?.searchQuery.includes("sherwani"), "Search query must include 'sherwani'");
assert.ok(!sherwaniSpec?.searchQuery.includes("top"), "Search query must NOT contain 'top'");

// Acceptance of valid boys sherwanis
const validSherwani1 = checkProductConsistency(
  "Manyavar Boys Cream Embroidered Silk Festive Sherwani",
  "Manyavar",
  "outfit",
  "https://www.tatacliq.com/manyavar-boys-sherwani/p-2348917",
  undefined,
  "child",
  sherwaniSpec!.itemSubcategory,
  sherwaniSpec!.dominantColor,
  undefined,
  2999,
  "Festival",
  undefined,
  "boys",
  sherwaniSpec!.itemTitle,
);
assert.equal(validSherwani1.isConsistent, true, `Valid boy sherwani must pass: ${validSherwani1.reason}`);

const validSherwani2 = checkProductConsistency(
  "Vastramay Boys Cream & Gold Jacquard Sherwani",
  "Vastramay",
  "outfit",
  "https://www.myntra.com/sherwani/vastramay/boys-cream-sherwani/23489177/buy",
  undefined,
  "child",
  sherwaniSpec!.itemSubcategory,
  sherwaniSpec!.dominantColor,
  undefined,
  1899,
  "Festival",
  undefined,
  "boys",
  sherwaniSpec!.itemTitle,
);
assert.equal(validSherwani2.isConsistent, true, `Valid Myntra boy sherwani must pass: ${validSherwani2.reason}`);
console.log("✓ Test 1 Passed: Sherwani recognized as boys' ethnic upper garment with clean queries & passes consistency.");

// -----------------------------------------------------------------------------
// Test 2: Boys Churidar discovery and requirement extraction
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Testing Boys Churidar requirement planning & subcategory recognition...");
const churidarSpec = specs.find((s) => s.itemSubcategory === "ethnic_bottom");
assert.ok(churidarSpec, "Churidar spec must exist with itemSubcategory = 'ethnic_bottom' (NOT 'trousers')");
assert.equal(churidarSpec?.targetGender, "boys");
assert.ok(churidarSpec?.itemTitle.includes("Churidar"), "Item title must contain Churidar");
assert.notEqual(churidarSpec?.dominantColor, "Churidar", "Dominant color must never be 'Churidar'");
assert.notEqual(churidarSpec?.dominantColor, "Boys Churidar", "Dominant color must never be 'Boys Churidar'");
assert.equal(churidarSpec?.dominantColor, "Off-White", "Dominant color extracted from piece detail must be Off-White");
assert.ok(churidarSpec?.searchQuery.includes("boys"), "Search query must include 'boys'");
assert.ok(churidarSpec?.searchQuery.includes("churidar"), "Search query must include 'churidar'");
assert.ok(!churidarSpec?.searchQuery.includes("tailored trousers pants"), "Search query must NOT contain 'tailored trousers pants'");

// Acceptance of valid boys churidar
const validChuridar1 = checkProductConsistency(
  "Vastramay Boys Off-White Solid Cotton Churidar",
  "Vastramay",
  "outfit",
  "https://www.myntra.com/churidar/vastramay/boys-off-white-churidar/23489176/buy",
  undefined,
  "child",
  churidarSpec!.itemSubcategory,
  churidarSpec!.dominantColor,
  undefined,
  499,
  "Festival",
  undefined,
  "boys",
  churidarSpec!.itemTitle,
);
assert.equal(validChuridar1.isConsistent, true, `Valid boy churidar must pass: ${validChuridar1.reason}`);
console.log("✓ Test 2 Passed: Churidar recognized as boys' ethnic bottom with clean queries & passes consistency.");

// -----------------------------------------------------------------------------
// Test 3: Relevant Retailer Title Variations
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Testing relevant retailer title variations...");
const variations = [
  {
    title: "Kisah Boys Off-White Cotton Churidar for Kurta",
    subcat: "ethnic_bottom",
    expected: true,
    desc: "Churidar with 'for Kurta' phrasing",
  },
  {
    title: "TABARD Kids Boys Solid Ethnic Churidar Bottom",
    subcat: "ethnic_bottom",
    expected: true,
    desc: "Kids boys solid ethnic churidar bottom",
  },
  {
    title: "Manyavar Boys Jacquard Indo-Western Sherwani",
    subcat: "sherwani",
    expected: true,
    desc: "Boys Indo-Western Sherwani",
  },
  {
    title: "Vastramay Boys Cream Bandhgala Achkan Sherwani",
    subcat: "sherwani",
    expected: true,
    desc: "Boys Bandhgala Achkan Sherwani",
  },
  {
    title: "Biba Boys Traditional Festive Sherwani",
    subcat: "sherwani",
    expected: true,
    desc: "Boys traditional festive sherwani",
  },
];

for (const v of variations) {
  const res = checkProductConsistency(
    v.title,
    "Brand",
    "outfit",
    "https://www.ajio.com/p/469283719",
    undefined,
    "child",
    v.subcat,
    "Cream",
    undefined,
    1499,
    "Festival",
    undefined,
    "boys",
    v.subcat === "sherwani" ? "Boys Sherwani" : "Boys Churidar",
  );
  assert.equal(res.isConsistent, v.expected, `${v.desc} should have isConsistent = ${v.expected}, got: ${res.reason}`);
}
console.log("✓ Test 3 Passed: Retailer wording variations ('for Kurta', 'Kids Boys', 'Indo-Western', 'Achkan') accepted.");

// -----------------------------------------------------------------------------
// Test 4: Rejection of Girls' and Adult Men's Products
// -----------------------------------------------------------------------------
console.log("\n[Test 4] Testing rejection of girls' and adult men's products...");
const adultAndGirlsChecks = [
  {
    title: "Men Off-White Solid Silk Churidar",
    subcat: "ethnic_bottom",
    url: "https://www.tatacliq.com/men-churidar/p-12345",
    desc: "Adult men's churidar",
  },
  {
    title: "Men Embroidered Wedding Sherwani",
    subcat: "sherwani",
    url: "https://www.manyavar.com/men-sherwani/p-23456",
    desc: "Adult men's sherwani",
  },
  {
    title: "Women Off-White Embroidered Kurti",
    subcat: "sherwani",
    url: "https://www.myntra.com/women-kurti/23489178/buy",
    desc: "Adult women's kurti",
  },
  {
    title: "Girls Pink Embroidered Lehenga Choli",
    subcat: "ethnic_bottom",
    url: "https://www.myntra.com/girls-lehenga/23489179/buy",
    desc: "Girls lehenga choli",
  },
  {
    title: "Girls Anarkali Kurta Set with Dupatta",
    subcat: "sherwani",
    url: "https://www.firstcry.com/girls-anarkali/2847195/product-detail",
    desc: "Girls anarkali set",
  },
];

for (const ag of adultAndGirlsChecks) {
  const res = checkProductConsistency(
    ag.title,
    "Brand",
    "outfit",
    ag.url,
    undefined,
    "child",
    ag.subcat,
    "Cream",
    undefined,
    1999,
    "Festival",
    undefined,
    "boys",
    ag.subcat === "sherwani" ? "Boys Sherwani" : "Boys Churidar",
  );
  assert.equal(res.isConsistent, false, `${ag.desc} ('${ag.title}') must be rejected for boys, but passed!`);
}
console.log("✓ Test 4 Passed: Adult men's and girls'/women's items strictly rejected for boys.");

// -----------------------------------------------------------------------------
// Test 5: Rejection of Unrelated Products and Incorrect Product Data
// -----------------------------------------------------------------------------
console.log("\n[Test 5] Testing rejection of unrelated products & incorrect categories...");
const unrelatedChecks = [
  {
    title: "Boys Blue Graphic Print Casual T-Shirt",
    subcat: "sherwani",
    desc: "T-shirt passed to sherwani",
  },
  {
    title: "Boys Slim Fit Casual Denim Jeans",
    subcat: "ethnic_bottom",
    desc: "Denim jeans passed to churidar",
  },
  {
    title: "Boys Tailored Formal Single-Breasted Blazer",
    subcat: "sherwani",
    desc: "Western blazer passed to sherwani",
  },
  {
    title: "Boys Blue Printed Cotton Festive Kurta Dhoti Set",
    subcat: "ethnic_bottom",
    desc: "Complete Kurta Dhoti set passed to separate churidar bottom",
  },
  {
    title: "Boys Leather Mojris Ethnic Footwear",
    subcat: "sherwani",
    desc: "Footwear mojris passed to outfit sherwani",
  },
];

for (const u of unrelatedChecks) {
  const res = checkProductConsistency(
    u.title,
    "Brand",
    "outfit",
    "https://www.myntra.com/item/23489180/buy",
    undefined,
    "child",
    u.subcat,
    "Cream",
    undefined,
    1499,
    "Festival",
    undefined,
    "boys",
    u.subcat === "sherwani" ? "Boys Sherwani" : "Boys Churidar",
  );
  assert.equal(res.isConsistent, false, `${u.desc} ('${u.title}') must be rejected, but passed!`);
}
console.log("✓ Test 5 Passed: Unrelated garments, Western separates, full sets, and footwear rejected.");

// -----------------------------------------------------------------------------
// Test 6: Fallback Retailer Search Links when No Product is Verified
// -----------------------------------------------------------------------------
console.log("\n[Test 6] Testing fallback retailer search links generation...");
const stores = churidarSpec!.preferredRetailers;
assert.ok(stores.length >= 4, "Preferred retailers must have at least 4 stores");
assert.ok(stores.includes("FirstCry"), "Preferred retailers for kids must include FirstCry");

const myntraLink = buildRetailerSearchUrl("Myntra", {
  productName: churidarSpec!.itemTitle,
  category: churidarSpec!.category,
  subcategory: churidarSpec!.itemSubcategory,
  gender: churidarSpec!.targetGender,
  color: churidarSpec!.dominantColor,
});
assert.ok(myntraLink.includes("myntra.com/"), "Myntra search link must be generated");
assert.ok(myntraLink.includes("churidar"), "Myntra search link must include churidar");

const firstcryLink = buildRetailerSearchUrl("FirstCry", {
  productName: churidarSpec!.itemTitle,
  category: churidarSpec!.category,
  subcategory: churidarSpec!.itemSubcategory,
  gender: churidarSpec!.targetGender,
  color: churidarSpec!.dominantColor,
});
assert.ok(firstcryLink.includes("firstcry.com/search?q="), "FirstCry search link must use search endpoint");
assert.ok(firstcryLink.toLowerCase().includes("churidar"), "FirstCry search link must include churidar");

console.log("✓ Test 6 Passed: High-fidelity fallback retailer search links generated correctly for FirstCry and Myntra.");

console.log("\n======================================================================");
console.log("ALL 6 BOYS SHERWANI & CHURIDAR REGRESSION TESTS PASSED CLEANLY! 🎉");
console.log("======================================================================");

