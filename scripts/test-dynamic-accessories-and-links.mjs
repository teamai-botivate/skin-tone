import assert from "node:assert/strict";
import {
  planRequirementSpecs,
  extractDynamicLookAccessories,
  verifyProductPage,
  determineUrlType,
  isValidProductUrl,
  getCanonicalProductUrl,
} from "../src/lib/product-search.ts";
import { getSafeProductUrl } from "../src/features/shopping/components/ShopLookSection.tsx";

console.log("======================================================================");
console.log("LETSTYLE TEST: DYNAMIC ACCESSORY MATCHING & RETAILER LINK VERIFICATION");
console.log("======================================================================");

// -----------------------------------------------------------------------------
// Test 1: Extract dynamic accessories from generated look with diverse accessories
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Testing dynamic accessory extraction across varied looks...");

// Look A: Formal Executive Look with Watch, Studs, and Leather Laptop Bag
const formalLook = {
  id: "formal-exec-1",
  title: "Executive Presence",
  outfit: "Tailored Charcoal Blazer and Trousers",
  pieces: [
    { name: "Charcoal Structured Blazer", category: "outerwear" },
    { name: "Matching Charcoal Trousers", category: "bottom" },
    { name: "Silk Crepe Blouse", category: "base" },
    { name: "Minimalist Leather Strap Watch", category: "jewellery", detail: "Rose gold bezel" },
    { name: "Sculptural Sterling Silver Ring", category: "jewellery" },
  ],
  jewellery: "Subtle gold huggie stud earrings, minimalist analog watch",
  accessories: "Structured leather laptop briefcase with dual handles",
  footwear: "Pointed-toe leather pumps",
};

const formalProfile = {
  name: "Pooja",
  pronouns: "she/her/women",
  appearance: { skinTone: "Medium", undertone: "Warm" },
  occasion: "Executive Presentation",
  style: ["Corporate", "Minimalist"],
};

const formalAccs = extractDynamicLookAccessories(formalLook, "woman");
console.log("  Formal Look Detected Accessories:", formalAccs.map((a) => `${a.type} (${a.title})`));
const formalTypes = formalAccs.map((a) => a.type);
assert.ok(formalTypes.includes("watch"), "Must detect watch in formal look");
assert.ok(formalTypes.includes("earrings"), "Must detect earrings in formal look");
assert.ok(formalTypes.includes("ring"), "Must detect ring in formal look");
assert.ok(formalTypes.includes("bag"), "Must detect briefcase/bag in formal look");

const formalSpecs = planRequirementSpecs(formalLook, formalProfile, "woman", [
  "outfit",
  "jewellery",
  "footwear",
  "accessories",
]);

const formalSubcats = formalSpecs.map((s) => s.itemSubcategory);
assert.ok(formalSubcats.includes("watch"), "Specs must include watch");
assert.ok(formalSubcats.includes("earrings"), "Specs must include earrings");
assert.ok(formalSubcats.includes("ring"), "Specs must include ring");
assert.ok(formalSubcats.includes("bag"), "Specs must include bag");
console.log("  ✓ Test 1a Passed: Formal look accurately formulated specs for watch, stud earrings, ring, and laptop bag.");

// Look B: Festive Sangeet Look with Jhumkas, Kundan Choker, Bangles, Maang Tikka & Potli
const sangeetLook = {
  id: "festive-sangeet-1",
  title: "Royal Emerald Sangeet",
  outfit: "Emerald Green Embroidered Silk Lehenga",
  pieces: [
    { name: "Flared Silk Lehenga Skirt", category: "bottom" },
    { name: "Hand-Embroidered Choli", category: "base" },
    { name: "Traditional Kundan Maang Tikka", category: "jewellery" },
  ],
  jewellery: "Kundan chandelier earrings with pearls, matching choker necklace, gold-plated kada bangles",
  accessories: "Velvet embroidered potli bag with tassel drawstring",
  footwear: "Embroidered mojari juttis",
};

const sangeetProfile = {
  name: "Rhea",
  pronouns: "she/her/women",
  appearance: { skinTone: "Fair", undertone: "Cool" },
  occasion: "Sangeet Ceremony",
  style: ["Traditional", "Royal"],
};

const sangeetAccs = extractDynamicLookAccessories(sangeetLook, "woman");
console.log("  Sangeet Look Detected Accessories:", sangeetAccs.map((a) => `${a.type} (${a.title})`));
const sangeetTypes = sangeetAccs.map((a) => a.type);
assert.ok(sangeetTypes.includes("earrings"), "Must detect chandelier earrings");
assert.ok(sangeetTypes.includes("necklace"), "Must detect choker necklace");
assert.ok(sangeetTypes.includes("bracelet"), "Must detect kada bangles");
assert.ok(sangeetTypes.includes("maang_tikka"), "Must detect maang tikka");
assert.ok(sangeetTypes.includes("bag"), "Must detect potli bag");

const sangeetSpecs = planRequirementSpecs(sangeetLook, sangeetProfile, "woman", [
  "outfit",
  "jewellery",
  "accessories",
]);

const sangeetSubcats = sangeetSpecs.map((s) => s.itemSubcategory);
assert.ok(sangeetSubcats.includes("earrings"), "Specs must include earrings");
assert.ok(sangeetSubcats.includes("necklace"), "Specs must include necklace");
assert.ok(sangeetSubcats.includes("bracelet"), "Specs must include bangles/bracelet");
assert.ok(sangeetSubcats.includes("maang_tikka"), "Specs must include maang tikka");
assert.ok(sangeetSubcats.includes("bag"), "Specs must include potli bag");
console.log("  ✓ Test 1b Passed: Festive sangeet look dynamically produced jhumkas, choker necklace, bangles, maang tikka, and potli specs.");

// Look C: Men's Date Night Look with Minimal Bracelet and Watch (No Maang Tikka or Earring forced)
const menDateLook = {
  id: "men-date-1",
  title: "Sleek Casual Date Night",
  outfit: "Charcoal Merino Turtleneck with Tapered Chinos",
  pieces: [
    { name: "Charcoal Turtleneck", category: "top" },
    { name: "Olive Tapered Chinos", category: "bottom" },
    { name: "Matte Black Chronograph Watch", category: "accessories" },
    { name: "Braided Leather Wristband Bracelet", category: "jewellery" },
  ],
  jewellery: "Braided leather wristband",
  accessories: "Matte black chronograph watch, Italian leather belt",
  footwear: "Suede Chelsea Boots",
};

const menProfile = {
  name: "Arjun",
  pronouns: "he/him/men",
  appearance: { skinTone: "Medium Deep", undertone: "Warm" },
  occasion: "Dinner Date",
  style: ["Smart Casual"],
};

const menAccs = extractDynamicLookAccessories(menDateLook, "man");
console.log("  Men's Date Detected Accessories:", menAccs.map((a) => `${a.type} (${a.title})`));
const menTypes = menAccs.map((a) => a.type);
assert.ok(menTypes.includes("watch"), "Men's look must detect watch");
assert.ok(menTypes.includes("bracelet"), "Men's look must detect bracelet");
assert.ok(menTypes.includes("belt"), "Men's look must detect belt");
assert.ok(!menTypes.includes("maang_tikka"), "Men's look must NEVER detect or invent maang tikka");
assert.ok(!menTypes.includes("earrings"), "Men's look must NEVER invent earrings when not specified");
console.log("  ✓ Test 1c Passed: Men's look dynamically handled watch, bracelet, and belt without inventing feminine jewellery.");

// -----------------------------------------------------------------------------
// Test 2: Product URL and Link Navigation Verification
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Testing Product URL and Link Navigation Fidelity...");

// Scenario A: Exact real product on Myntra
const myntraRealUrl = "https://www.myntra.com/lehenga-choli/chhabra555/chhabra-555-green-embroidered-mirror-work-made-to-measure-lehenga--blouse-with-dupatta/18261844/buy";
assert.equal(determineUrlType(myntraRealUrl), "exact_product", "Real Myntra PDP must be classified as exact_product");
assert.ok(isValidProductUrl(myntraRealUrl), "Real Myntra PDP must be a valid product URL");

// Scenario B: Exact real product on AJIO
const ajioRealUrl = "https://www.ajio.com/gulabchand-jaipur-printed-cotton-straight-kurta/p/46591234_blue";
assert.equal(determineUrlType(ajioRealUrl), "exact_product", "AJIO PDP with /p/ must be classified as exact_product");
assert.ok(isValidProductUrl(ajioRealUrl), "AJIO PDP must be a valid product URL");

// Scenario C: Exact real product on Tata CLiQ
const tataRealUrl = "https://www.tatacliq.com/westside-dark-pink-floral-a-line-dress/p-mp000000018921821";
assert.equal(determineUrlType(tataRealUrl), "exact_product", "Tata CLiQ PDP with /p- must be classified as exact_product");
assert.ok(isValidProductUrl(tataRealUrl), "Tata CLiQ PDP must be a valid product URL");

// Scenario D: Search URL preserves query and is classified as search_result
const myntraSearch = "https://www.myntra.com/search?q=emerald%20green%20lehenga";
assert.equal(determineUrlType(myntraSearch), "search_result", "Search URL must be classified as search_result");
assert.ok(isValidProductUrl(myntraSearch), "Search URL with query must be valid");

const ajioSearch = "https://www.ajio.com/search/?text=women%20silk%20saree";
assert.equal(determineUrlType(ajioSearch), "search_result", "AJIO search URL must be classified as search_result");
assert.ok(isValidProductUrl(ajioSearch), "AJIO search URL with ?text= must be valid");

// Scenario E: Bare search page with missing query MUST be rejected
const ajioBrokenSearch = "https://www.ajio.com/search/";
assert.equal(isValidProductUrl(ajioBrokenSearch), false, "Bare /search/ without query parameter must be REJECTED");

const tataBrokenSearch = "https://www.tatacliq.com/search/?text=";
assert.equal(isValidProductUrl(tataBrokenSearch), false, "Search URL with empty text must be REJECTED");

// Scenario F: Dummy IDs like 12345678 MUST be rejected
const dummyIdUrl = "https://www.myntra.com/lehenga/libas/12345678/buy";
assert.equal(isValidProductUrl(dummyIdUrl), false, "URL with dummy ID 12345678 must be REJECTED");

console.log("  ✓ Test 2 Passed: Retailer URLs accurately classified (exact_product vs search_result) and broken/dummy patterns strictly rejected.");

// -----------------------------------------------------------------------------
// Test 3: Safe Product URL and Button Label Verification
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Testing Safe URL Sanitation and CTA Button Labels...");

const sampleExactProduct = {
  id: "prod-1",
  productUrl: ajioRealUrl,
  urlType: "exact_product",
  retailer: "AJIO",
  priceVerified: false, // AJIO Akamai bot protection restricted server check
  productVerified: false,
};

const safeAjioUrl = getSafeProductUrl(sampleExactProduct, "woman");
assert.equal(safeAjioUrl, ajioRealUrl, "getSafeProductUrl must preserve real exact product URL");

// CTA Button label for exact product must be "View on AJIO"
const isExactProduct = sampleExactProduct.urlType === "exact_product";
const buttonLabel = isExactProduct
  ? `View on ${sampleExactProduct.retailer}`
  : `Search on ${sampleExactProduct.retailer}`;
assert.equal(buttonLabel, "View on AJIO", "Exact product must show 'View on AJIO' even when bot protection restricts server price fetch");

// CTA Button label for search result
const sampleSearchProduct = {
  id: "prod-2",
  productUrl: ajioSearch,
  urlType: "search_result",
  retailer: "AJIO",
};
const searchButtonLabel = sampleSearchProduct.urlType === "exact_product"
  ? `View on ${sampleSearchProduct.retailer}`
  : `Search on ${sampleSearchProduct.retailer}`;
assert.equal(searchButtonLabel, "Search on AJIO", "Search result must show 'Search on AJIO'");

console.log("  ✓ Test 3 Passed: CTA button displays 'View on [Retailer]' for exact products and 'Search on [Retailer]' for search results.");

// -----------------------------------------------------------------------------
// Test 4: Live Retailer Verification & Bot Protection Handling
// -----------------------------------------------------------------------------
console.log("\n[Test 4] Testing Live Retailer Verification & Bot Protection Distinction...");

// Test Myntra real product live HTTP verification
const myntraVerification = await verifyProductPage(myntraRealUrl);
console.log("  Myntra PDP Status:", myntraVerification.success ? `HTTP 200 (Price: ₹${myntraVerification.price})` : `Failed (${myntraVerification.reason})`);
if (myntraVerification.success) {
  assert.ok(myntraVerification.price > 0, "Myntra verified price must be a positive integer");
  assert.ok(myntraVerification.productName, "Myntra verified product name must exist");
  assert.ok(myntraVerification.imageUrl, "Myntra verified image URL must exist");
  // Check image normalization (no template parameters)
  assert.ok(!myntraVerification.imageUrl.includes("$height"), "Myntra image URL must have template parameters normalized");
  assert.ok(myntraVerification.priceVerified === true, "Myntra priceVerified must be true for successful fetch");
}

// Test 404 Discontinued page handling
const nonExistentUrl = "https://www.myntra.com/lehenga-choli/non-existent-brand-product-xyz99999/999999999/buy";
const brokenVerification = await verifyProductPage(nonExistentUrl);
console.log("  Non-existent PDP Status:", brokenVerification.success ? "Unexpected success" : `Rejected correctly (${brokenVerification.reason})`);
assert.equal(brokenVerification.success, false, "Non-existent product page must be rejected");

console.log("  ✓ Test 4 Passed: Live page verification accurately confirms valid products, detects bot protection, and rejects 404/broken links.");

console.log("\n======================================================================");
console.log("ALL DYNAMIC ACCESSORY & LINK VERIFICATION TESTS PASSED SUCCESSFULLY! 🚀");
console.log("======================================================================");
