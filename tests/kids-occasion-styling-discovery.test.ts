import assert from "node:assert/strict";
import { logger } from "../src/lib/logger";
logger.level = "fatal";
import {
  planRequirementSpecs,
  checkProductConsistency,
  extractDynamicLookAccessories,
  getBenchmarkCandidatesForRequirement,
  type DetectedAccessory,
} from "../src/lib/product-search";
import {
  getRetailerFromUrl,
  determineUrlType,
  buildRetailerSearchUrl,
  isUrlConsistentWithProduct,
  isValidProductUrl,
  APPROVED_RETAILERS,
} from "../src/lib/retailer-urls";
import type { LookRecommendation } from "../src/types";

console.log("======================================================================");
console.log("TEST SUITE: DYNAMIC OCCASION-DRIVEN KIDSWEAR & ACCESSORIES INTEGRITY");
console.log("======================================================================");

// -----------------------------------------------------------------------------
// Test 1: Retailer Infrastructure for Mumkins
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Testing Mumkins Retailer Integration...");
assert.ok(APPROVED_RETAILERS.includes("mumkins.in"), "mumkins.in must be in APPROVED_RETAILERS");

const mumkinsUrl = "https://www.mumkins.in/products/girls-embroidered-peplum-lehenga-set";
const detectedRetailer = getRetailerFromUrl(mumkinsUrl);
assert.equal(detectedRetailer, "Mumkins", "getRetailerFromUrl must return Mumkins for mumkins.in");

const urlType = determineUrlType(mumkinsUrl);
assert.equal(urlType, "exact_product", "mumkins.in /products/ must be recognized as exact_product");

const searchUrl = buildRetailerSearchUrl("Mumkins", {
  gender: "girls",
  productName: "Festive Floral Hair Clips",
  category: "accessories",
  subcategory: "hair_accessory",
});
assert.ok(searchUrl.startsWith("https://www.mumkins.in/search?q="), "Mumkins search URL must be properly formed");
assert.ok(/girls/i.test(searchUrl) && /hair/i.test(searchUrl), "Search URL must contain relevant tokens");
console.log("✓ Test 1 Passed: Mumkins retailer infrastructure verified.");

// -----------------------------------------------------------------------------
// Test 2: Kids Girl Everyday Look (User's Exact Scenario from Screenshots)
// Profile: Kids / Girls styling, Age 0-5, Everyday, Minimal, "Comfortable breathable fabrics"
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Testing Kids Girl Everyday Look (User Scenario)...");
const girlEverydayProfile: any = {
  pronouns: "Kids / Girls styling",
  gender: "girl",
  ageGroup: "0-5",
  occasion: "Everyday",
  style: ["Minimal"],
  customStyleNotes: "Comfortable breathable fabrics",
  colorsLove: ["Cream", "Dusty rose", "Butter yellow", "Berry"],
  appearance: { skinTone: "Deep", undertone: "Warm" },
};

const girlEverydayLook: any = {
  id: "look-01",
  title: "Berry Playful Tunic & Leggings",
  outfit: "Berry Tiered Cotton Tunic with Soft Berry Leggings.",
  outfitColor: "Berry",
  vibe: "Playful",
  personaEnergy: "Bright, lively and comfortable for play in the park.",
  reasoning: ["Breathable cotton tunic", "Stretchy comfortable leggings"],
  confidence: 90,
  palette: ["#800020", "#F5DEB3", "#FFFDD0"],
  pieces: [
    { category: "Top", name: "Berry Tiered Cotton Tunic", detail: "Soft breathable muslin cotton." },
    { category: "Bottom", name: "Berry Stretch Leggings", detail: "Comfort elastic waistband." },
    { category: "Accessories", name: "Pastel Floral Hair Clips", detail: "Cute yellow and pink floral clips." },
  ],
  accessories: "Cute floral hair clips in braids",
  footwear: "Comfortable velcro white sneakers",
  applicableCategories: ["outfit", "footwear", "accessories"],
};

// Verify dynamic accessory detection extracts hair_accessory
const detectedAcc = extractDynamicLookAccessories(girlEverydayLook, "child");
assert.ok(detectedAcc.some((a) => a.type === "hair_accessory"), "Must detect hair_accessory from floral clips");

const girlEverydaySpecs = planRequirementSpecs(
  girlEverydayLook,
  girlEverydayProfile,
  "child",
  ["outfit", "footwear", "accessories"]
);

const hairAccSpec = girlEverydaySpecs.find((s) => s.category === "accessories");
assert.ok(hairAccSpec, "Must generate accessories requirement");
assert.equal(hairAccSpec.itemSubcategory, "hair_accessory", "Accessory subcategory must be hair_accessory");
assert.ok(
  !hairAccSpec.itemTitle.toLowerCase().includes("sling bag"),
  "Must NOT generate a generic sling bag title for everyday girl hair accessories"
);
assert.ok(
  /hair/i.test(hairAccSpec.searchQuery) || /clips/i.test(hairAccSpec.searchQuery),
  "Search query must target hair accessories or clips"
);
assert.ok(
  hairAccSpec.preferredRetailers.includes("FirstCry") && hairAccSpec.preferredRetailers.includes("Mumkins"),
  "Preferred retailers must include kid specialists FirstCry and Mumkins"
);

console.log("✓ Test 2 Passed: Everyday girl look generates dynamic hair accessories, NOT fidget sling bags.");

// -----------------------------------------------------------------------------
// Test 3: Kids Girl Everyday Fallback (When look.accessories is omitted)
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Testing Everyday Girl Fallback Accessories...");
const girlNoAccLook: any = {
  id: "look-02",
  title: "Cotton Play Dress",
  outfit: "Dusty Rose Tiered Cotton Frock.",
  outfitColor: "Dusty rose",
  vibe: "Sweet",
  personaEnergy: "Breezy and comfortable.",
  reasoning: ["Soft fabric"],
  confidence: 88,
  palette: ["#DCAE96"],
  pieces: [
    { category: "Outfit", name: "Dusty Rose Tiered Cotton Frock", detail: "100% cotton." },
  ],
  footwear: "Cute ballerina flats",
  applicableCategories: ["outfit", "footwear", "accessories"],
};

const girlNoAccSpecs = planRequirementSpecs(
  girlNoAccLook,
  girlEverydayProfile,
  "child",
  ["outfit", "footwear", "accessories"]
);

const fallbackAcc = girlNoAccSpecs.find((s) => s.category === "accessories");
assert.ok(fallbackAcc, "Must generate fallback accessory requirement when requested");
assert.equal(fallbackAcc.itemSubcategory, "hair_accessory", "Fallback for everyday girl must be hair_accessory");
assert.ok(
  !fallbackAcc.searchQuery.toLowerCase().includes("sling bag"),
  "Fallback search query must NOT target sling bags"
);
assert.ok(
  /hair|clips|headband/i.test(fallbackAcc.searchQuery),
  "Fallback search query must target hair accessories / clips"
);
console.log("✓ Test 3 Passed: Everyday girl fallback produces hair accessories, not sling bags.");

// -----------------------------------------------------------------------------
// Test 4: Kids Traditional / Festive Occasion (Modern Traditional)
// -----------------------------------------------------------------------------
console.log("\n[Test 4] Testing Kids Traditional / Festive Occasion...");
const girlFestiveProfile: any = {
  pronouns: "Kids / Girls styling",
  gender: "girl",
  ageGroup: "0-5",
  occasion: "Diwali Festival",
  style: ["Traditional"],
  appearance: { skinTone: "Medium", undertone: "Warm" },
};

const girlFestiveLook: any = {
  id: "look-03",
  title: "Modern Festive Peplum & Dhoti",
  outfit: "Rani Pink Embroidered Peplum Kurti with Mustard Dhoti Pants.",
  outfitColor: "Rani Pink",
  vibe: "Festive",
  personaEnergy: "Celebratory and comfortable for festive pooja.",
  reasoning: ["Modern traditional silhouette", "No tripping dupattas"],
  confidence: 95,
  palette: ["#E75480", "#FFDB58"],
  pieces: [
    { category: "Top", name: "Rani Pink Embroidered Peplum Kurti", detail: "Soft chanderi cotton." },
    { category: "Bottom", name: "Mustard Dhoti Pants", detail: "Comfort elasticated waist." },
    { category: "Accessories", name: "Girls Embellished Festive Potli Bag", detail: "With pearl tassel drawstring." },
  ],
  accessories: "Girls Embellished Festive Potli Bag",
  footwear: "Cushioned flat ethnic juttis",
  applicableCategories: ["outfit", "footwear", "accessories"],
};

const girlFestiveSpecs = planRequirementSpecs(
  girlFestiveLook,
  girlFestiveProfile,
  "child",
  ["outfit", "footwear", "accessories"]
);

const festivePotliSpec = girlFestiveSpecs.find((s) => s.itemSubcategory === "potli");
assert.ok(festivePotliSpec, "Festive girl look must allow potli accessory");
assert.ok(festivePotliSpec.preferredRetailers.includes("Mumkins"), "Festive accessories must include Mumkins");

const festiveFootwearSpec = girlFestiveSpecs.find((s) => s.category === "footwear");
assert.ok(festiveFootwearSpec, "Must generate footwear spec");
assert.equal(festiveFootwearSpec.itemSubcategory, "mojaris", "Festive footwear must map to mojaris/juttis");
console.log("✓ Test 4 Passed: Traditional festive look produces modern traditional pieces, potli & juttis.");

// -----------------------------------------------------------------------------
// Test 5: Kids Vacation Occasion
// -----------------------------------------------------------------------------
console.log("\n[Test 5] Testing Kids Vacation / Holiday Occasion...");
const girlVacationProfile: any = {
  pronouns: "Kids / Girls styling",
  gender: "girl",
  ageGroup: "0-5",
  occasion: "Beach Vacation",
  style: ["Resort", "Minimal"],
  appearance: { skinTone: "Fair", undertone: "Cool" },
};

const girlVacationLook: any = {
  id: "look-04",
  title: "Breezy Cotton Sundress",
  outfit: "Butter Yellow Tiered Cotton Sundress with Flutter Straps.",
  outfitColor: "Butter yellow",
  vibe: "Sunny",
  personaEnergy: "Free and light for playing on the beach.",
  reasoning: ["Breathable cotton", "Comfortable for warm weather"],
  confidence: 92,
  palette: ["#FFFDD0"],
  pieces: [
    { category: "Outfit", name: "Butter Yellow Tiered Cotton Sundress", detail: "100% organic cotton." },
  ],
  footwear: "Slide sandals",
  applicableCategories: ["outfit", "footwear", "accessories"],
};

const girlVacationSpecs = planRequirementSpecs(
  girlVacationLook,
  girlVacationProfile,
  "child",
  ["outfit", "footwear", "accessories"]
);

const vacationAccSpec = girlVacationSpecs.find((s) => s.category === "accessories");
assert.ok(vacationAccSpec, "Must generate vacation accessory spec");
assert.ok(
  vacationAccSpec.itemTitle.toLowerCase().includes("cotton") ||
    vacationAccSpec.stylingRequirement.toLowerCase().includes("cotton") ||
    vacationAccSpec.stylingRequirement.toLowerCase().includes("hat"),
  "Vacation accessory must recommend soft cotton bag or sun hat"
);
console.log("✓ Test 5 Passed: Vacation girl look generates soft cotton bag/sun accessories.");

// -----------------------------------------------------------------------------
// Test 6: Rejection of Adult Women's Sling Bags for Young Girls
// (Direct fix for Screenshot 3)
// -----------------------------------------------------------------------------
console.log("\n[Test 6] Testing Rejection of Adult Bags & Subcategory Integrity...");

// Product 1 from Screenshot 3: Adult sling bag claiming "for Women and girls"
const adultBag1 = checkProductConsistency(
  "GUKA Sling Bag For Women and girls",
  "GUKA",
  "accessories",
  "https://www.amazon.in/dp/B09ABCDEFG",
  undefined,
  "child",
  "hair_accessory",
  undefined,
  undefined,
  undefined,
  "Everyday",
  undefined,
  "girls",
  "Girls Cute Hair Accessories & Clips"
);
assert.equal(adultBag1.isConsistent, false, "Must reject adult sling bag for hair_accessory requirement");

// Product 2 from Screenshot 3: Adult designer sling bag
const adultBag2 = checkProductConsistency(
  "Hamster London HL MOB Floral Sling bag For Women And Girls Designer Bags",
  "Hamster London",
  "accessories",
  "https://www.amazon.in/dp/B09HIJKLMN",
  undefined,
  "child",
  "bag",
  undefined,
  undefined,
  undefined,
  "Everyday",
  undefined,
  "girls",
  "Girls Cute Mini Crossbody Pouch"
);
assert.equal(adultBag2.isConsistent, false, "Must reject adult women's sling bag for young child look");

// Valid kids hair clips product
const validKidsClips = checkProductConsistency(
  "KIDS CLAN Girls Pastel Floral Hair Clips (Pack of 10)",
  "KIDS CLAN",
  "accessories",
  "https://www.firstcry.com/kids-clan/girls-hair-clips-set/1283741/product-detail",
  undefined,
  "child",
  "hair_accessory",
  undefined,
  undefined,
  undefined,
  "Everyday",
  undefined,
  "girls",
  "Girls Cute Hair Accessories & Clips"
);
assert.equal(validKidsClips.isConsistent, true, "Must accept authentic kids hair clips product");
console.log("✓ Test 6 Passed: Adult sling bags rejected; authentic kids accessories accepted.");

// -----------------------------------------------------------------------------
// Test 7: Benchmark Candidates Occasion Alignment
// -----------------------------------------------------------------------------
console.log("\n[Test 7] Testing Benchmark Candidates Occasion Alignment...");
const hairBenchmark = getBenchmarkCandidatesForRequirement(
  hairAccSpec!,
  "child",
  null,
  "Berry"
);
assert.ok(hairBenchmark.length >= 3, "Must return at least 3 benchmark candidates");
assert.ok(
  hairBenchmark.every((c) => /hair|clip|headband/i.test(c.productTitle)),
  "All benchmark candidates for hair_accessory must be hair accessories, not sling bags"
);
assert.ok(
  hairBenchmark.some((c) => c.retailer === "Mumkins"),
  "Benchmark candidates must include Mumkins"
);

const festivePotliBenchmark = getBenchmarkCandidatesForRequirement(
  festivePotliSpec!,
  "child",
  null,
  "Rani Pink"
);
assert.ok(
  festivePotliBenchmark.some((c) => /potli/i.test(c.productTitle)),
  "Festive accessories benchmark must include potli bag"
);
assert.ok(
  festivePotliBenchmark.some((c) => c.retailer === "Mumkins"),
  "Festive benchmark candidates must include Mumkins"
);
console.log("✓ Test 7 Passed: Benchmark candidates are occasion-aligned with Mumkins included.");

// -----------------------------------------------------------------------------
// Test 8: Strict Demographic Isolation (Zero Adult Leaks for Kids)
// -----------------------------------------------------------------------------
console.log("\n[Test 8] Testing Strict Demographic Isolation (Zero Adult Leaks for Kids)...");

// Adult men's shirt must be REJECTED for boys kidswear
const adultMenShirt = checkProductConsistency(
  "Roadster Men Navy Blue Casual Shirt",
  "Roadster",
  "outfit",
  "https://www.myntra.com/shirts/roadster/roadster-men-navy-shirt/buy",
  undefined,
  "child",
  "top",
  undefined,
  undefined,
  undefined,
  "Everyday",
  undefined,
  "boys",
  "Boys Casual Shirt"
);
assert.equal(adultMenShirt.isConsistent, false, "Must reject adult men's shirt for boys kidswear");

// Adult men's URL must be REJECTED for boys kidswear
const adultMenUrlConsistent = isUrlConsistentWithProduct(
  "https://www.myntra.com/men-clothing/roadster/shirt/12345/buy",
  { gender: "boys", category: "outfit", productName: "Boys Casual Shirt" }
);
assert.equal(adultMenUrlConsistent, false, "Must reject adult men's clothing URL for boys kidswear");

// Adult women's dress must be REJECTED for girls kidswear
const adultWomenDress = checkProductConsistency(
  "MANGO Women Floral Print A-Line Dress",
  "MANGO",
  "outfit",
  "https://www.myntra.com/dresses/mango/mango-women-dress/buy",
  undefined,
  "child",
  "dress",
  undefined,
  undefined,
  undefined,
  "Everyday",
  undefined,
  "girls",
  "Girls Cotton Play Dress"
);
assert.equal(adultWomenDress.isConsistent, false, "Must reject adult women's dress for girls kidswear");

// Adult women's URL must be REJECTED for girls kidswear
const adultWomenUrlConsistent = isUrlConsistentWithProduct(
  "https://www.myntra.com/women-dresses/mango/dress/67890/buy",
  { gender: "girls", category: "outfit", productName: "Girls Cotton Dress" }
);
assert.equal(adultWomenUrlConsistent, false, "Must reject adult women's dresses URL for girls kidswear");

// Authentic boys product and URL must be ACCEPTED
const validBoysKurta = checkProductConsistency(
  "Vastramay Boys Solid Cotton Kurta with Dhoti Pant",
  "Vastramay",
  "outfit",
  "https://www.firstcry.com/vastramay/boys-kurta-set/1283741/product-detail",
  undefined,
  "child",
  "kurta",
  undefined,
  undefined,
  undefined,
  "Traditional",
  undefined,
  "boys",
  "Boys Kurta Set"
);
assert.equal(validBoysKurta.isConsistent, true, "Must accept authentic boys kidswear");

const validBoysUrl = isUrlConsistentWithProduct(
  "https://www.firstcry.com/vastramay/boys-kurta-set/1283741/product-detail",
  { gender: "boys", category: "outfit", productName: "Boys Kurta Set" }
);
assert.equal(validBoysUrl, true, "Must accept authentic boys kidswear URL");

// Authentic girls product and URL must be ACCEPTED
const validGirlsLehenga = checkProductConsistency(
  "Biba Girls Printed Lehenga Choli Set",
  "Biba",
  "outfit",
  "https://www.mumkins.in/products/girls-embroidered-peplum-lehenga-set",
  undefined,
  "child",
  "lehenga",
  undefined,
  undefined,
  undefined,
  "Diwali Festival",
  undefined,
  "girls",
  "Girls Festive Lehenga"
);
assert.equal(validGirlsLehenga.isConsistent, true, "Must accept authentic girls kidswear");

const validGirlsUrl = isUrlConsistentWithProduct(
  "https://www.mumkins.in/products/girls-embroidered-peplum-lehenga-set",
  { gender: "girls", category: "outfit", productName: "Girls Festive Lehenga" }
);
assert.equal(validGirlsUrl, true, "Must accept authentic girls kidswear URL");
console.log("✓ Test 8 Passed: Strict demographic isolation enforced (zero adult leaks for kids).");

// -----------------------------------------------------------------------------
// Test 9: Strict Traditional/Ethnic Occasion Integrity
// -----------------------------------------------------------------------------
console.log("\n[Test 9] Testing Strict Traditional/Ethnic Occasion Integrity...");

// Western denim jeans must be REJECTED during traditional occasion
const westernJeansInTraditional = checkProductConsistency(
  "Zara Boys Denim Casual Jeans",
  "Zara",
  "outfit",
  "https://www.myntra.com/jeans/zara/zara-boys-jeans/buy",
  undefined,
  "child",
  "bottom",
  undefined,
  undefined,
  undefined,
  "Traditional",
  undefined,
  "boys",
  "Boys Traditional Festive Bottom"
);
assert.equal(westernJeansInTraditional.isConsistent, false, "Must reject denim jeans in traditional occasion");

// Western graphic t-shirt must be REJECTED during Diwali festival occasion
const westernTshirtInDiwali = checkProductConsistency(
  "H&M Girls Graphic T-Shirt",
  "H&M",
  "outfit",
  "https://www.firstcry.com/hm/girls-graphic-tshirt/123/product-detail",
  undefined,
  "child",
  "top",
  undefined,
  undefined,
  undefined,
  "Diwali Festival",
  undefined,
  "girls",
  "Girls Festive Kurti"
);
assert.equal(westernTshirtInDiwali.isConsistent, false, "Must reject casual t-shirt in Diwali festival");

// Western athletic sneakers must be REJECTED during traditional occasion
const athleticSneakersInFestive = checkProductConsistency(
  "Puma Boys Running Athletic Shoes",
  "Puma",
  "footwear",
  "https://www.myntra.com/shoes/puma/boys-running-shoes/buy",
  undefined,
  "child",
  "shoes",
  undefined,
  undefined,
  undefined,
  "Navratri Festival",
  undefined,
  "boys",
  "Boys Traditional Footwear"
);
assert.equal(athleticSneakersInFestive.isConsistent, false, "Must reject athletic running shoes in traditional occasion");

// Authentic ethnic footwear (Mojaris / Juttis) must be ACCEPTED
const ethnicMojarisInFestive = checkProductConsistency(
  "Klip2Deal Boys Embroidered Mojaris Juttis",
  "Klip2Deal",
  "footwear",
  "https://www.firstcry.com/klip2deal/boys-ethnic-mojaris/456/product-detail",
  undefined,
  "child",
  "mojaris",
  undefined,
  undefined,
  undefined,
  "Navratri Festival",
  undefined,
  "boys",
  "Boys Festive Mojaris"
);
assert.equal(ethnicMojarisInFestive.isConsistent, true, "Must accept ethnic mojaris in traditional festive occasion");
console.log("✓ Test 9 Passed: Strict traditional/ethnic occasion integrity enforced.");

// -----------------------------------------------------------------------------
// Test 10: Boys Festive Dupatta / Stole Requirement Planning & Validation
// (Direct fix for User Scenario: Yellow Kurta + Pink Festive Dupatta Look)
// -----------------------------------------------------------------------------
console.log("\n[Test 10] Testing Boys Festive Dupatta / Stole Planning & Validation...");
const boyDupattaProfile: any = {
  pronouns: "Kids / Boys styling",
  gender: "boy",
  ageGroup: "0-5",
  occasion: "Festival",
  style: ["Traditional"],
  appearance: { skinTone: "Medium", undertone: "Warm" },
};

const boyDupattaLook: any = {
  id: "look-boy-dupatta-01",
  title: "Festive Splendor Kurta & Stole",
  outfit: "Boys Bright Yellow Silk Kurta with Rani Pink Festive Dupatta.",
  outfitColor: "Yellow",
  pieces: [
    { category: "Top", name: "Boys Bright Yellow Silk Kurta", detail: "Soft chanderi silk with delicate gold embroidery." },
    { category: "Layer", name: "Boys Festive Dupatta", detail: "Rani pink silk stole with gold zari borders." },
  ],
  footwear: "Embellished ethnic juttis",
  accessories: "None",
  applicableCategories: ["outfit", "footwear"],
};

const boyDupattaSpecs = planRequirementSpecs(
  boyDupattaLook,
  boyDupattaProfile,
  "child",
  ["outfit", "footwear"]
);

const dupattaSpec = boyDupattaSpecs.find((s) => s.itemSubcategory === "dupatta" || s.itemSubcategory === "stole");
assert.ok(dupattaSpec, "Must generate a dupatta/stole requirement spec, NOT a generic jacket spec");
assert.equal(dupattaSpec.itemSubcategory, "dupatta", "Subcategory must be dupatta");
assert.ok(
  /dupatta|stole/i.test(dupattaSpec.searchQuery),
  `Search query must target dupatta/stole, got: ${dupattaSpec.searchQuery}`
);
assert.ok(
  !dupattaSpec.searchQuery.toLowerCase().includes("jacket"),
  `Search query must NOT target western jacket: ${dupattaSpec.searchQuery}`
);

// 1. Must REJECT Western Jacket 1 from User Screenshot (RARE ONES)
const rareOnesJacket = checkProductConsistency(
  "RARE ONES Boys Solid Masa Cotton Spread Collar Button-Front Slim Fit Tailored Jacket",
  "RARE ONES",
  "outfit",
  "https://www.myntra.com/jackets/rare-ones/rare-ones-boys-jacket/buy",
  undefined,
  "child",
  dupattaSpec.itemSubcategory,
  dupattaSpec.dominantColor,
  undefined,
  1349,
  "Festival",
  undefined,
  "boys",
  dupattaSpec.itemTitle
);
assert.equal(rareOnesJacket.isConsistent, false, "Must reject RARE ONES western tailored jacket for dupatta requirement");

// 2. Must REJECT Western Jacket 2 from User Screenshot (H&M)
const hmClassicJacket = checkProductConsistency(
  "H&M Boys Black Solid Classic Jacket",
  "H&M",
  "outfit",
  "https://www.myntra.com/jackets/hm/hm-boys-black-solid-classic-jacket/10459302/buy",
  undefined,
  "child",
  dupattaSpec.itemSubcategory,
  dupattaSpec.dominantColor,
  undefined,
  1999,
  "Festival",
  undefined,
  "boys",
  dupattaSpec.itemTitle
);
assert.equal(hmClassicJacket.isConsistent, false, "Must reject H&M black classic jacket for dupatta requirement");

// 3. Must REJECT Book from User Screenshot (The Wonder Book of Railways)
const railwayBook = checkProductConsistency(
  "The Wonder Book of Railways: For Boys and Girls (Classic Reprint)",
  "The",
  "outfit",
  "https://www.amazon.in/dp/1330847291",
  undefined,
  "child",
  dupattaSpec.itemSubcategory,
  dupattaSpec.dominantColor,
  undefined,
  2108,
  "Festival",
  undefined,
  "boys",
  dupattaSpec.itemTitle
);
assert.equal(railwayBook.isConsistent, false, "Must reject non-fashion book from fashion recommendations");

// 4. Must ACCEPT authentic Boys Festive Silk Dupatta / Stole
const validDupatta = checkProductConsistency(
  "Vastramay Boys Pink Woven Silk Festive Dupatta Stole",
  "Vastramay",
  "outfit",
  "https://www.myntra.com/dupatta/vastramay/boys-pink-dupatta/23489182/buy",
  undefined,
  "child",
  dupattaSpec.itemSubcategory,
  dupattaSpec.dominantColor,
  undefined,
  499,
  "Festival",
  undefined,
  "boys",
  dupattaSpec.itemTitle
);
assert.equal(validDupatta.isConsistent, true, `Must accept authentic boys festive dupatta: ${validDupatta.reason}`);
console.log("✓ Test 10 Passed: Boys Festive Dupatta properly deconstructed; Western jackets and books rejected; authentic stole accepted.");

// -----------------------------------------------------------------------------
// Test 11: Benchmark Candidates for Boys Dupatta / Stole
// -----------------------------------------------------------------------------
console.log("\n[Test 11] Testing Benchmark Candidates for Boys Dupatta / Stole...");
const dupattaBenchmarks = getBenchmarkCandidatesForRequirement(
  dupattaSpec,
  "child",
  null,
  "Pink"
);
assert.ok(dupattaBenchmarks.length >= 3, "Must return at least 3 benchmark candidates");
assert.ok(
  dupattaBenchmarks.every((c) => /dupatta|stole|angavastram/i.test(c.productTitle)),
  "All benchmark candidates must be authentic festive dupattas/stoles, NOT western jackets"
);
console.log("✓ Test 11 Passed: Benchmark candidates provide authentic festive dupattas and stoles.");

// -----------------------------------------------------------------------------
// Test 12: Boys Traditional Shawl (Direct Fix for Screenshot 9: Shawl vs Bomber Jackets)
// -----------------------------------------------------------------------------
console.log("\n[Test 12] Testing Boys Traditional Shawl Planning & Subcategory Fidelity...");
const boyShawlProfile: any = {
  pronouns: "Kids / Boys styling",
  gender: "boy",
  ageGroup: "0-5",
  occasion: "Festival",
  style: ["Traditional"],
  appearance: { skinTone: "Medium", undertone: "Warm" },
};

const boyShawlLook: any = {
  id: "look-boy-shawl-01",
  title: "Royal Festive Silk Kurta & Shawl",
  outfit: "Boys Maroon Silk Kurta paired with Boys Traditional Shawl.",
  outfitColor: "Maroon",
  pieces: [
    { category: "Top", name: "Boys Maroon Silk Kurta", detail: "Woven banarasi silk kurta with mandarin collar." },
    { category: "Layer", name: "Boys Traditional Shawl", detail: "Deep maroon woven jacquard silk shawl with zari border." },
  ],
  footwear: "Embellished ethnic juttis",
  accessories: "None",
  applicableCategories: ["outfit", "footwear"],
};

const boyShawlSpecs = planRequirementSpecs(
  boyShawlLook,
  boyShawlProfile,
  "child",
  ["outfit", "footwear"]
);

const shawlSpec = boyShawlSpecs.find((s) => s.itemSubcategory === "shawl");
assert.ok(shawlSpec, "Must generate a distinct 'shawl' requirement spec, NOT stole or generic jacket");
assert.equal(shawlSpec.itemSubcategory, "shawl", "Subcategory must be shawl");

// Color fidelity test: 'Traditional Shawl' must NEVER be parsed as the color!
assert.notEqual(
  shawlSpec.dominantColor?.toLowerCase(),
  "traditional shawl",
  `Dominant color must NOT be 'Traditional Shawl', got: ${shawlSpec.dominantColor}`
);
assert.ok(
  shawlSpec.dominantColor === "Maroon" || shawlSpec.dominantColor === "Classic",
  `Dominant color must resolve to an authentic fashion color, got: ${shawlSpec.dominantColor}`
);

// Query fidelity test: Search query must target traditional shawl, NEVER bomber/jacket
assert.ok(
  /shawl/i.test(shawlSpec.searchQuery),
  `Search query must target shawl, got: ${shawlSpec.searchQuery}`
);
assert.ok(
  !/jacket|bomber|blazer/i.test(shawlSpec.searchQuery),
  `Search query must NOT target western jackets/bombers: ${shawlSpec.searchQuery}`
);

// 1. Must REJECT Bomber Jacket 1 from User Screenshot (RARE ONES)
const rareOnesBomber = checkProductConsistency(
  "RARE ONES Boys Printed Manttn Cotton Applique Mock Collar Zip-Front Bomber Jacket",
  "RARE ONES",
  "outfit",
  "https://www.myntra.com/jackets/rare-ones/rare-ones-boys-bomber-jacket/buy",
  undefined,
  "child",
  shawlSpec.itemSubcategory,
  shawlSpec.dominantColor,
  undefined,
  1574,
  "Festival",
  undefined,
  "boys",
  shawlSpec.itemTitle
);
assert.equal(rareOnesBomber.isConsistent, false, "Must reject RARE ONES zip-front bomber jacket for Boys Traditional Shawl");

// 2. Must REJECT Bomber Jacket 2 from User Screenshot (Status Quo)
const statusQuoBomber = checkProductConsistency(
  "Status Quo Boys Bomber Jacket",
  "Status Quo",
  "outfit",
  "https://www.myntra.com/jackets/status-quo/status-quo-boys-bomber-jacket/buy",
  undefined,
  "child",
  shawlSpec.itemSubcategory,
  shawlSpec.dominantColor,
  undefined,
  1580,
  "Festival",
  undefined,
  "boys",
  shawlSpec.itemTitle
);
assert.equal(statusQuoBomber.isConsistent, false, "Must reject Status Quo bomber jacket for Boys Traditional Shawl");

// 3. Must REJECT Bomber Jacket 3 from User Screenshot (StyleCast x Revolte)
const styleCastBomber = checkProductConsistency(
  "StyleCast x Revolte Boys Lightweight Crop Outdoor Bomber with Patchwork Jacket",
  "StyleCast x Revolte",
  "outfit",
  "https://www.myntra.com/jackets/stylecast/stylecast-crop-outdoor-bomber/buy",
  undefined,
  "child",
  shawlSpec.itemSubcategory,
  shawlSpec.dominantColor,
  undefined,
  2011,
  "Festival",
  undefined,
  "boys",
  shawlSpec.itemTitle
);
assert.equal(styleCastBomber.isConsistent, false, "Must reject StyleCast crop outdoor bomber jacket for Boys Traditional Shawl");

// 4. Must ACCEPT authentic Boys Traditional Silk Shawl
const validShawl = checkProductConsistency(
  "Vastramay Boys Maroon Woven Jacquard Silk Traditional Festive Shawl",
  "Vastramay",
  "outfit",
  "https://www.myntra.com/shawl/vastramay/boys-maroon-silk-shawl/23489190/buy",
  undefined,
  "child",
  shawlSpec.itemSubcategory,
  shawlSpec.dominantColor,
  undefined,
  699,
  "Festival",
  undefined,
  "boys",
  shawlSpec.itemTitle
);
assert.equal(validShawl.isConsistent, true, `Must accept authentic boys traditional silk shawl: ${validShawl.reason}`);

// -----------------------------------------------------------------------------
// Focused Offline Regressions for Boys Shawl Verification Pipeline
// -----------------------------------------------------------------------------
// Sub-test 1: Bomber jacket title + generic URL must be rejected
const bomberGenericConsistency = checkProductConsistency(
  "Status Quo Boys Bomber Jacket",
  "Status Quo",
  "outfit",
  "https://www.myntra.com/12345/buy",
  undefined,
  "child",
  shawlSpec.itemSubcategory,
  shawlSpec.dominantColor,
  undefined,
  1580,
  "Festival",
  undefined,
  "boys",
  shawlSpec.itemTitle
);
assert.equal(bomberGenericConsistency.isConsistent, false, "Sub-test 1 Failed: Bomber jacket title + generic URL must be rejected in consistency check");

const bomberGenericUrlConsistent = isUrlConsistentWithProduct(
  "https://www.myntra.com/12345/buy",
  { productName: "Status Quo Boys Bomber Jacket", category: "outfit", subcategory: "shawl", gender: "boys" },
  "child"
);
assert.equal(bomberGenericUrlConsistent, false, "Sub-test 1 Failed: Bomber jacket title + generic URL must be rejected in isUrlConsistentWithProduct");

// Sub-test 2: Bomber jacket title + shawl-related URL must be rejected (URL keywords must NEVER override contradictory title)
const bomberShawlUrlConsistency = checkProductConsistency(
  "Status Quo Boys Bomber Jacket",
  "Status Quo",
  "outfit",
  "https://www.myntra.com/shawl/status-quo/boys-jacket/12345/buy",
  undefined,
  "child",
  shawlSpec.itemSubcategory,
  shawlSpec.dominantColor,
  undefined,
  1580,
  "Festival",
  undefined,
  "boys",
  shawlSpec.itemTitle
);
assert.equal(bomberShawlUrlConsistency.isConsistent, false, "Sub-test 2 Failed: Bomber jacket title + shawl-related URL must be rejected in consistency check");

const bomberShawlUrlConsistent = isUrlConsistentWithProduct(
  "https://www.myntra.com/shawl/status-quo/boys-jacket/12345/buy",
  { productName: "Status Quo Boys Bomber Jacket", category: "outfit", subcategory: "shawl", gender: "boys" },
  "child"
);
assert.equal(bomberShawlUrlConsistent, false, "Sub-test 2 Failed: Bomber jacket title + shawl-related URL must be rejected in isUrlConsistentWithProduct");

// Sub-test 3: Actual shawl title + generic retailer URL must not be treated as a verified exact product
const genericShawlStoreUrl = "https://www.myntra.com/boys-shawl";
const genericUrlType: string = determineUrlType(genericShawlStoreUrl);
assert.equal(genericUrlType, "search_result", "Sub-test 3 Failed: Generic store URL must be classified as search_result, NOT exact_product");
const isGenericTreatedAsExact = (genericUrlType as unknown) === "exact_product" && isValidProductUrl(genericShawlStoreUrl);
assert.equal(isGenericTreatedAsExact, false, "Sub-test 3 Failed: Actual shawl title + generic retailer URL must not be treated as a verified exact product");

// Sub-test 4: Actual shawl title + valid matching product URL can pass existing checks
const validExactShawlUrl = "https://www.myntra.com/shawl/vastramay/boys-maroon-silk-shawl/23489190/buy";
const validExactShawlConsistency = checkProductConsistency(
  "Vastramay Boys Maroon Woven Jacquard Silk Traditional Festive Shawl",
  "Vastramay",
  "outfit",
  validExactShawlUrl,
  undefined,
  "child",
  shawlSpec.itemSubcategory,
  shawlSpec.dominantColor,
  undefined,
  699,
  "Festival",
  undefined,
  "boys",
  shawlSpec.itemTitle
);
assert.equal(validExactShawlConsistency.isConsistent, true, `Sub-test 4 Failed: Authentic shawl + valid product URL must pass consistency check: ${validExactShawlConsistency.reason}`);

const validExactShawlUrlConsistent = isUrlConsistentWithProduct(
  validExactShawlUrl,
  { productName: "Vastramay Boys Maroon Woven Jacquard Silk Traditional Festive Shawl", category: "outfit", subcategory: "shawl", gender: "boys" },
  "child"
);
assert.equal(validExactShawlUrlConsistent, true, "Sub-test 4 Failed: Authentic shawl + valid matching URL must pass isUrlConsistentWithProduct");
assert.equal(determineUrlType(validExactShawlUrl), "exact_product", "Sub-test 4 Failed: Valid product URL must be classified as exact_product");

// Sub-test 5: No valid shawl candidates must result in no verified match, not a jacket fallback
const onlyJacketCandidates = [
  {
    productTitle: "Status Quo Boys Bomber Jacket",
    brand: "Status Quo",
    url: "https://www.myntra.com/12345/buy",
    price: 1580,
  },
  {
    productTitle: "RARE ONES Boys Zip-Front Bomber Jacket",
    brand: "RARE ONES",
    url: "https://www.myntra.com/shawl/rare-ones-jacket/67890/buy",
    price: 1574,
  },
];

const survivingCandidates = onlyJacketCandidates.filter((cand) => {
  const res = checkProductConsistency(
    cand.productTitle,
    cand.brand,
    "outfit",
    cand.url,
    undefined,
    "child",
    shawlSpec.itemSubcategory,
    shawlSpec.dominantColor,
    undefined,
    cand.price,
    "Festival",
    undefined,
    "boys",
    shawlSpec.itemTitle
  );
  return res.isConsistent;
});

assert.equal(survivingCandidates.length, 0, "Sub-test 5 Failed: All bomber jackets must be rejected, leaving 0 verified candidates");

// Group structure when candidates fail verification: empty products array + safe retailer search links
const fallbackGroup = {
  category: "outfit",
  recommendedItemTitle: shawlSpec.itemTitle,
  stylingRequirement: shawlSpec.stylingRequirement,
  products: survivingCandidates,
  retailerSearchLinks: survivingCandidates.length === 0 ? [
    { retailer: "Myntra", url: buildRetailerSearchUrl("Myntra", { productName: shawlSpec.itemTitle, category: "outfit", gender: "boys" }) },
    { retailer: "FirstCry", url: buildRetailerSearchUrl("FirstCry", { productName: shawlSpec.itemTitle, category: "outfit", gender: "boys" }) },
  ] : undefined,
};

assert.equal(fallbackGroup.products.length, 0, "Sub-test 5 Failed: Products array must be empty (triggering 'No verified match found')");
assert.ok(fallbackGroup.retailerSearchLinks && fallbackGroup.retailerSearchLinks.length > 0, "Sub-test 5 Failed: Must provide retailer search links rather than substituting a jacket");

// 5. Benchmark Candidates for Shawl
const shawlBenchmarks = getBenchmarkCandidatesForRequirement(
  shawlSpec,
  "child",
  null,
  "Maroon"
);
assert.ok(shawlBenchmarks.length >= 3, "Must return at least 3 benchmark candidates for shawl");
assert.ok(
  shawlBenchmarks.every((c) => /shawl|doshala/i.test(c.productTitle)),
  "All benchmark candidates for shawl must be authentic shawls or doshalas, NOT jackets"
);
console.log("✓ Test 12 Passed: Boys Traditional Shawl properly planned; all 3 bomber jackets rejected; authentic shawls accepted.");

console.log("\n======================================================================");
console.log("ALL 12 DYNAMIC OCCASION & KIDSWEAR TESTS PASSED SUCCESSFULLY!");
console.log("======================================================================");

