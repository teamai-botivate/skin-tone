import assert from "node:assert/strict";
import {
  planRequirementSpecs,
  detectFootwearSpec,
  checkProductConsistency,
  verifyProductPage,
  buildDiscoveryQuery,
  getStylingContext,
  searchProductsForLook,
} from "../src/lib/product-search";
import {
  buildRetailerSearchUrl,
  isValidProductUrl,
  determineUrlType,
  getRetailerFromUrl,
} from "../src/lib/retailer-urls";
import type { LookRecommendation, SkinTuneProfile } from "../src/lib/skintune-schemas";

console.log("======================================================================");
console.log("OFFLINE SUITE: DYNAMIC PRODUCT DISCOVERY & VERIFICATION PIPELINE");
console.log("======================================================================");

// -----------------------------------------------------------------------------
// Test 1: Dynamic Requirement-to-Query Generation
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Testing dynamic requirement-to-query generation...");

const boyProfile: SkinTuneProfile = {
  name: "Arjun",
  pronouns: "Kids / Boys styling",
  gender: "boy",
  ageGroup: "6–10",
  occasion: "Everyday",
  style: ["Casual"],
  colorsLove: ["White", "Navy"],
  colorsAvoid: ["Pink"],
  budget: "₹1K–₹2.5K",
} as any;

const canvasLook: LookRecommendation = {
  id: "look-canvas-01",
  title: "Boys Casual Everyday Edit",
  note: "Comfortable cotton tee and shorts paired with clean white canvas shoes.",
  occasion: "Everyday",
  outfit: "Boys White linen-blend tee with navy cotton shorts.",
  outfitColor: "White",
  footwear: "White canvas shoes with durable rubber sole",
  accessories: "None",
  pieces: [
    { category: "Top", name: "Boys White Tee", detail: "Crisp white cotton tee" },
    { category: "Bottom", name: "Boys Navy Shorts", detail: "Comfortable navy cotton chino shorts" },
    { category: "Footwear", name: "Boys Canvas Shoes", detail: "Classic white canvas lace-up shoes" },
  ],
} as any;

const plannedFootwear = planRequirementSpecs(canvasLook, boyProfile, "child", ["footwear"]);
assert.equal(plannedFootwear.length, 1, "Must generate exactly 1 footwear spec");
const canvasSpec = plannedFootwear[0];

assert.equal(canvasSpec.targetGender, "boys");
assert.equal(canvasSpec.dominantColor, "White", "Footwear color must be resolved from piece detail/name as White");
assert.ok(canvasSpec.itemTitle.includes("Canvas Shoes"), `Title must retain Canvas Shoes: ${canvasSpec.itemTitle}`);
assert.ok(canvasSpec.searchQuery.includes("canvas shoes"), `Search query must include 'canvas shoes': ${canvasSpec.searchQuery}`);
assert.ok(canvasSpec.searchQuery.includes("boys"), `Search query must include 'boys': ${canvasSpec.searchQuery}`);
assert.ok(canvasSpec.preferredRetailers.includes("Bata"), "Preferred retailers for kidswear must include Bata");
assert.ok(canvasSpec.preferredRetailers.includes("FirstCry"), "Preferred retailers for kidswear must include FirstCry");

const discQuery = buildDiscoveryQuery(canvasSpec);
assert.ok(discQuery.includes("canvas shoes"), `Discovery query must retain canvas shoes: ${discQuery}`);
assert.ok(!discQuery.includes("Myntra"), `Discovery query must not contain retailer names: ${discQuery}`);

console.log("✓ Test 1 Passed: Requirement-to-query generation dynamically preserves specific footwear term & demographic.");

// -----------------------------------------------------------------------------
// Test 2: Semantic Footwear Relevance and Title Variations
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Testing semantic product relevance on real retailer title variations...");

const validCanvasTitles = [
  "Bata Kids White Canvas Shoes",
  "Bata Boys White Canvas Casual Shoes",
  "Bata Canvas Lace-Up Shoes",
  "Bata Boys Canvas Shoes",
  "Bata Children White Canvas Shoes",
  "Kids Canvas Slip-On Shoes",
  "Puma Unisex Kids White Canvas Sneakers",
  "Roadster Boys White Canvas Shoes",
  "Sparx Kids Canvas Casual Shoes",
  "Liberty Boys White Canvas School Shoes",
  "Bata White Canvas Tennis Shoes",
  "Converse Kids Chuck Taylor Canvas Low-Top Sneakers",
];

for (const title of validCanvasTitles) {
  const res = checkProductConsistency(
    title,
    "Bata",
    canvasSpec.category,
    "https://www.bata.in/bata-boys-canvas-shoes-3011234.html",
    undefined,
    "child",
    canvasSpec.itemSubcategory,
    canvasSpec.dominantColor,
    undefined,
    599,
    "Everyday",
    undefined,
    canvasSpec.targetGender,
    canvasSpec.itemTitle,
  );
  assert.equal(res.isConsistent, true, `Expected '${title}' to be accepted as consistent: ${res.reason}`);
}

console.log("✓ Test 2 Passed: Retailer wording variations on canvas shoes accepted semantically without exact title locks.");

// -----------------------------------------------------------------------------
// Test 3: Audience and Demographic Consistency (Unisex & Kids vs Exclusions)
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Testing audience and demographic consistency...");

// Unisex children's products must pass for both boys and girls
const unisexTitles = [
  "Bata Kids Boys & Girls White Canvas Shoes",
  "Liberty Unisex Child White Canvas Shoes",
  "Puma Unisex Kids White Canvas Sneakers",
  "Converse Kids Unisex Chuck Taylor All Star Sneakers",
];

for (const title of unisexTitles) {
  const boyRes = checkProductConsistency(
    title,
    "Store",
    canvasSpec.category,
    "https://www.bata.in/kids-shoes-3011234.html",
    undefined,
    "child",
    canvasSpec.itemSubcategory,
    canvasSpec.dominantColor,
    undefined,
    499,
    "Everyday",
    undefined,
    "boys",
    canvasSpec.itemTitle,
  );
  assert.equal(boyRes.isConsistent, true, `Unisex product '${title}' must be accepted for boys: ${boyRes.reason}`);

  const girlRes = checkProductConsistency(
    title,
    "Store",
    canvasSpec.category,
    "https://www.bata.in/kids-shoes-3011234.html",
    undefined,
    "child",
    canvasSpec.itemSubcategory,
    canvasSpec.dominantColor,
    undefined,
    499,
    "Everyday",
    undefined,
    "girls",
    "Girls Canvas Shoes",
  );
  assert.equal(girlRes.isConsistent, true, `Unisex product '${title}' must be accepted for girls: ${girlRes.reason}`);
}

// Adult men's items must be rejected for children
const adultMenItems = [
  "Men Tan Formal Derby Shoes",
  "Roadster Men White Canvas Sneakers",
  "Arrow Men Formal Trousers",
];

for (const title of adultMenItems) {
  const res = checkProductConsistency(
    title,
    "Store",
    canvasSpec.category,
    "https://www.bata.in/bata-men-shoes-3011234.html",
    undefined,
    "child",
    canvasSpec.itemSubcategory,
    canvasSpec.dominantColor,
    undefined,
    1499,
    "Everyday",
    undefined,
    "boys",
    canvasSpec.itemTitle,
  );
  assert.equal(res.isConsistent, false, `Adult men's item '${title}' must be rejected for boys`);
}

// Exclusively female apparel must be rejected for boys
const femaleItems = [
  "Catwalk Women Stiletto High Heels",
  "Girls Embroidered Pink Lehenga Choli",
  "Bata Women Wedge Heel Sandals",
];

for (const title of femaleItems) {
  const res = checkProductConsistency(
    title,
    "Store",
    canvasSpec.category,
    "https://www.myntra.com/heels/catwalk/women-heels/23489176/buy",
    undefined,
    "child",
    canvasSpec.itemSubcategory,
    canvasSpec.dominantColor,
    undefined,
    1299,
    "Everyday",
    undefined,
    "boys",
    canvasSpec.itemTitle,
  );
  assert.equal(res.isConsistent, false, `Female apparel '${title}' must be rejected for boys`);
}

console.log("✓ Test 3 Passed: Unisex children's products accepted while adult and cross-gender items strictly rejected.");

// -----------------------------------------------------------------------------
// Test 4: Cross-Category & Unrelated Product Rejection
// -----------------------------------------------------------------------------
console.log("\n[Test 4] Testing cross-category and unrelated product rejection...");

const crossCategoryChecks = [
  { category: "footwear", title: "boAt Airdopes 141 Bluetooth Earbuds", url: "https://www.amazon.in/dp/B09N3ZNHTY", expectedErr: "electronics" },
  { category: "footwear", title: "Boys White Cotton Graphic T-Shirt", url: "https://www.myntra.com/tshirt/puma/23489176/buy", expectedErr: "clothing" },
  { category: "footwear", title: "Bata Open Toe Casual Flip-Flops", url: "https://www.bata.in/bata-flip-flop-3011234.html", expectedErr: "type" },
  { category: "outfit", title: "Boys White Canvas Sneakers", url: "https://www.bata.in/bata-boys-shoes-3011234.html", expectedErr: "footwear" },
  { category: "outfit", title: "GIVA 925 Silver Bracelet", url: "https://www.giva.co/products/silver-bracelet", expectedErr: "jewellery" },
];

for (const item of crossCategoryChecks) {
  const res = checkProductConsistency(
    item.title,
    "Store",
    item.category as any,
    item.url,
    undefined,
    "child",
    item.category === "footwear" ? "sneakers" : "top",
    "White",
    undefined,
    499,
    "Everyday",
    undefined,
    "boys",
    item.category === "footwear" ? "Boys Canvas Shoes" : "Boys White Top",
  );
  assert.equal(res.isConsistent, false, `Cross-category item '${item.title}' must be rejected for category '${item.category}'`);
}

console.log("✓ Test 4 Passed: Electronics, clothing in footwear, footwear in outfit, and jewellery in outfit rejected.");

// -----------------------------------------------------------------------------
// Test 5: Product-Page Verification (Offline Mocking)
// -----------------------------------------------------------------------------
console.log("\n[Test 5] Testing product-page verification logic with offline HTML fixtures...");

const originalFetch = globalThis.fetch;

// Mock 1: Successful JSON-LD product page
const jsonLdHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Bata Kids Boys White Canvas Shoes | Bata India</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": "Bata Kids Boys White Canvas Shoes",
    "image": "https://www.bata.in/images/3011234_1.jpg",
    "brand": {
      "@type": "Brand",
      "name": "Bata"
    },
    "offers": {
      "@type": "Offer",
      "priceCurrency": "INR",
      "price": "599",
      "availability": "https://schema.org/InStock"
    }
  }
  </script>
</head>
<body></body>
</html>
`;

globalThis.fetch = async (url: any) => {
  const urlStr = String(url);
  if (urlStr.includes("bata.in/success-product.html")) {
    return new Response(jsonLdHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  }
  if (urlStr.includes("bata.in/bot-blocked.html")) {
    return new Response("<html><body>Attention Required! | Cloudflare</body></html>", { status: 403 });
  }
  if (urlStr.includes("bata.in/out-of-stock.html")) {
    return new Response("<html><body>404 - Not Found</body></html>", { status: 404 });
  }
  return new Response("Not Found", { status: 404 });
};

try {
  const successRes = await verifyProductPage("https://www.bata.in/success-product.html");
  assert.equal(successRes.success, true, "Product page with JSON-LD must verify successfully");
  assert.equal(successRes.price, 599, "Price must be extracted from JSON-LD");
  assert.equal(successRes.productName, "Bata Kids Boys White Canvas Shoes");
  assert.equal(successRes.brand, "Bata");
  assert.equal(successRes.priceVerified, true);

  const blockedRes = await verifyProductPage("https://www.bata.in/bot-blocked.html");
  assert.equal(blockedRes.success, false);
  assert.equal(blockedRes.retailerRestricted, true, "Bot blocked challenge must set retailerRestricted");

  const missingRes = await verifyProductPage("https://www.bata.in/out-of-stock.html");
  assert.equal(missingRes.success, false);
  assert.equal(missingRes.httpStatus, 404);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("✓ Test 5 Passed: Product page verification cleanly verifies JSON-LD, detects bot challenges, and flags 404s.");

// -----------------------------------------------------------------------------
// Test 6: Fallback Retailer Search Links for Missing Live Matches
// -----------------------------------------------------------------------------
console.log("\n[Test 6] Testing authentic retailer fallback search links generation...");

const retailersToTest = ["Myntra", "AJIO", "Amazon India", "Bata", "FirstCry"];
for (const retailer of retailersToTest) {
  const searchUrl = buildRetailerSearchUrl(retailer, {
    productName: canvasSpec.itemTitle,
    category: canvasSpec.category,
    subcategory: canvasSpec.itemSubcategory,
    gender: canvasSpec.targetGender,
    color: canvasSpec.dominantColor,
  });

  assert.ok(searchUrl.startsWith("https://"), `${retailer} search URL must be HTTPS`);
  assert.ok(isValidProductUrl(searchUrl), `${retailer} search URL must be a valid retailer URL`);
  const lowerUrl = searchUrl.toLowerCase();
  assert.ok(lowerUrl.includes("boys"), `${retailer} search link must include 'boys'`);
  assert.ok(lowerUrl.includes("canvas") || lowerUrl.includes("shoes"), `${retailer} search link must include canvas or shoes`);
}

console.log("✓ Test 6 Passed: High-fidelity store search links generated across all 5 supported kidswear retailers.");

// -----------------------------------------------------------------------------
// Test 7: Generalization across other Audiences and Footwear Subcategories
// -----------------------------------------------------------------------------
console.log("\n[Test 7] Testing generalization to Men's, Women's, and Girls' Footwear Subcategories...");

const subcategoryMatrix = [
  { subcat: "formal_shoes", title: "Men Black Leather Oxford Shoes", category: "footwear", gender: "men", expected: true },
  { subcat: "formal_shoes", title: "Men Running Canvas Sneakers", category: "footwear", gender: "men", expected: false },
  { subcat: "boots", title: "Women Tan Leather Chelsea Boots", category: "footwear", gender: "women", expected: true },
  { subcat: "boots", title: "Women Heeled Stiletto Pumps", category: "footwear", gender: "women", expected: false },
  { subcat: "flats", title: "Girls Black School Bellies / Ballet Flats", category: "footwear", gender: "girls", expected: true },
  { subcat: "sandals", title: "Boys Blue Strap Floaters / Slide Sandals", category: "footwear", gender: "boys", expected: true },
];

for (const testCase of subcategoryMatrix) {
  const res = checkProductConsistency(
    testCase.title,
    "Brand",
    testCase.category as any,
    "https://www.bata.in/sample-3011234.html",
    undefined,
    testCase.gender === "men" ? "man" : testCase.gender === "women" ? "woman" : "child",
    testCase.subcat,
    "Black",
    undefined,
    999,
    "Formal",
    undefined,
    testCase.gender,
    testCase.title,
  );
  assert.equal(res.isConsistent, testCase.expected, `Subcategory '${testCase.subcat}' check failed on '${testCase.title}'`);
}

console.log("✓ Test 7 Passed: Generic pipeline cleanly handles formal shoes, boots, flats, and sandals across all audiences.");

console.log("\n======================================================================");
console.log("ALL 7 DYNAMIC PRODUCT DISCOVERY PIPELINE TESTS PASSED CLEANLY! 🎉");
console.log("======================================================================");
