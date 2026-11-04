import assert from "node:assert/strict";
import {
  planRequirementSpecs,
  isExplicitlyNoneAccessory,
  type PersonaType,
} from "../src/lib/product-search";
import type { LookRecommendation, SkinTuneProfile, ProductCategory } from "../src/types";

console.log("======================================================================");
console.log("OFFLINE TEST SUITE: BOYS ACCESSORY REQUIREMENTS INTEGRITY");
console.log("======================================================================");

const baseBoyProfile: any = {
  name: "Aarav",
  pronouns: "Kids / Boys styling",
  gender: "boy",
  ageGroup: "6–10",
  height: "120 cm",
  photoUrl: "",
  bodyBuild: "Slim",
  fit: "Regular",
  restrictions: [],
  appearance: { skinTone: "Fair", undertone: "Warm", confidence: 85, contrast: "Medium" },
  style: ["Traditional", "Festive"],
  colorsLove: ["Royal Blue", "Gold"],
  colorsAvoid: ["Black"],
  occasion: "Garba Night",
  impression: ["Playful", "Festive"],
  budget: "₹1.5K–₹3.5K",
};

const createBoyLook = (patch: Record<string, any>): any => ({
  id: "test-boy-look-01",
  title: "Festive Silk Kurta & Dhoti",
  note: "Vibrant royal blue embroidered kurta with white dhoti pants.",
  category: "Festive",
  vibe: "Playful",
  personaEnergy: "Spirited and festive.",
  palette: ["#1e40af", "#f59e0b", "#ffffff"],
  imageUrl: "/replace-with-generated/garba-01.webp",
  outfit: "Boys royal blue embroidered silk festive kurta with white dhoti pants.",
  outfitColor: "Royal Blue with gold accents",
  jewellery: "None (child-safe styling).",
  hairstyle: "Neat side part.",
  makeup: "None (child-friendly natural skin).",
  footwear: "Boys cushioned ethnic mojaris.",
  accessories: "None",
  confidence: 95,
  applicableCategories: ["outfit", "footwear", "accessories"],
  reasoning: ["Traditional and comfortable for dancing."],
  pieces: [
    { category: "Outfit", name: "Boys Royal Blue Embroidered Kurta Set", detail: "Mandarin collar with soft inner lining." },
    { category: "Bottom", name: "White Elasticized Dhoti Pants", detail: "Comfortable pre-stitched pleats." },
    { category: "Shoe", name: "Cushioned Boys Ethnic Mojaris", detail: "Soft inner lining." },
  ],
  ...patch,
});

const defaultCategories: ProductCategory[] = ["outfit", "footwear", "accessories"];

// -----------------------------------------------------------------------------
// Test 1: Boys Festive Look with Accessories 'None' -> No Accessory Requirement
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Testing Boys festive look with accessories 'None'...");
const noneVariants = [
  "None",
  "none",
  "None (child-friendly)",
  "None (child-safe styling).",
  "No accessories",
  "None needed",
  "none/minimal",
];

for (const variant of noneVariants) {
  const look = createBoyLook({ accessories: variant });
  const specs = planRequirementSpecs(look, baseBoyProfile, "child", defaultCategories);
  const accessorySpecs = specs.filter((s) => s.category === "accessories");

  assert.equal(
    accessorySpecs.length,
    0,
    `Expected 0 accessory specs when accessories is '${variant}', but got ${accessorySpecs.length}: ${JSON.stringify(accessorySpecs.map((s) => s.itemTitle))}`,
  );

  // Ensure outfit and footwear specs are still planned properly
  const outfitSpecs = specs.filter((s) => s.category === "outfit");
  const footwearSpecs = specs.filter((s) => s.category === "footwear");
  assert.ok(outfitSpecs.length >= 1, `Outfit specs must be present for '${variant}'`);
  assert.equal(footwearSpecs.length, 1, `Footwear spec must be present for '${variant}'`);
}
console.log("✓ Test 1 Passed: When accessories is 'None' or child-friendly none, zero accessory specs are created.");

// -----------------------------------------------------------------------------
// Test 2: Boys Traditional Look with Empty Accessories -> No Invented Requirement
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Testing Boys traditional look with empty accessories -> no invented brooch/belt/cap...");
const emptyVariants: Array<string | undefined> = ["", "   ", undefined];

for (const emptyVal of emptyVariants) {
  const look = createBoyLook({ accessories: emptyVal });
  const specs = planRequirementSpecs(look, baseBoyProfile, "child", defaultCategories);
  const accessorySpecs = specs.filter((s) => s.category === "accessories");

  assert.equal(
    accessorySpecs.length,
    0,
    `Expected 0 invented accessory specs for empty accessories (${emptyVal}), but got: ${JSON.stringify(accessorySpecs.map((s) => s.itemTitle))}`,
  );

  for (const s of specs) {
    const titleLower = s.itemTitle.toLowerCase();
    assert.ok(!titleLower.includes("brooch"), `Spec title must not invent brooch: ${s.itemTitle}`);
    assert.ok(!titleLower.includes("pocket square"), `Spec title must not invent pocket square: ${s.itemTitle}`);
    assert.ok(!titleLower.includes("belt & cap"), `Spec title must not invent belt & cap: ${s.itemTitle}`);
  }
}
console.log("✓ Test 2 Passed: Empty or missing accessories never automatically invent brooches, belts, or caps for boys.");

// -----------------------------------------------------------------------------
// Test 3: Boys Festive Look with Explicitly Specified Brooch -> Brooch Generated
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Testing Boys festive look with an explicitly specified brooch...");
const broochLook = createBoyLook({
  accessories: "Royal pearl sherwani brooch",
});
const broochSpecs = planRequirementSpecs(broochLook, baseBoyProfile, "child", defaultCategories);
const broochAccSpecs = broochSpecs.filter((s) => s.category === "accessories");

assert.equal(broochAccSpecs.length, 1, `Must generate exactly 1 accessory spec for specified brooch, got ${broochAccSpecs.length}`);
const broochSpec = broochAccSpecs[0];
assert.equal(broochSpec.targetGender, "boys", `Target gender must be 'boys', got ${broochSpec.targetGender}`);
assert.ok(
  broochSpec.itemTitle.toLowerCase().includes("brooch"),
  `Item title must contain 'brooch', got: ${broochSpec.itemTitle}`,
);
assert.ok(
  broochSpec.searchQuery.toLowerCase().includes("boys"),
  `Search query must include 'boys', got: ${broochSpec.searchQuery}`,
);
assert.ok(
  broochSpec.searchQuery.toLowerCase().includes("brooch"),
  `Search query must include 'brooch', got: ${broochSpec.searchQuery}`,
);
console.log(`✓ Test 3 Passed: Legitimate brooch explicitly in the look is preserved: "${broochSpec.itemTitle}" (${broochSpec.searchQuery})`);

// -----------------------------------------------------------------------------
// Test 4: Boys Look with Explicitly Specified Belt -> Belt Requirement Generated
// -----------------------------------------------------------------------------
console.log("\n[Test 4] Testing Boys look with an explicitly specified belt...");
const casualBoyProfile: any = {
  ...baseBoyProfile,
  occasion: "Casual Birthday Party",
  style: ["Smart Casual"],
};
const beltLook = createBoyLook({
  outfit: "Boys white Oxford button-down shirt with khaki stretch chinos.",
  accessories: "Brown braided leather belt",
});
const beltSpecs = planRequirementSpecs(beltLook, casualBoyProfile, "child", defaultCategories);
const beltAccSpecs = beltSpecs.filter((s) => s.category === "accessories");

assert.equal(beltAccSpecs.length, 1, `Must generate exactly 1 accessory spec for specified belt, got ${beltAccSpecs.length}`);
const beltSpec = beltAccSpecs[0];
assert.equal(beltSpec.itemSubcategory, "belt", `Subcategory must be 'belt', got ${beltSpec.itemSubcategory}`);
assert.equal(beltSpec.targetGender, "boys", `Target gender must be 'boys', got ${beltSpec.targetGender}`);
assert.ok(
  beltSpec.itemTitle.toLowerCase().includes("belt"),
  `Item title must contain 'belt', got: ${beltSpec.itemTitle}`,
);
assert.ok(
  beltSpec.searchQuery.toLowerCase().includes("boys"),
  `Search query must include 'boys', got: ${beltSpec.searchQuery}`,
);
assert.ok(
  beltSpec.searchQuery.toLowerCase().includes("belt"),
  `Search query must include 'belt', got: ${beltSpec.searchQuery}`,
);
console.log(`✓ Test 4 Passed: Legitimate belt explicitly in the look is preserved: "${beltSpec.itemTitle}" (${beltSpec.searchQuery})`);

// -----------------------------------------------------------------------------
// Test 5: Existing Men's and Women's Accessory Extraction Remains Unchanged
// -----------------------------------------------------------------------------
console.log("\n[Test 5] Testing existing Men's and Women's accessory extraction remains intact...");

// Men's festive look with empty accessories -> fallback Men's Silk Pocket Square & Royal Brooch is preserved
const menProfile: any = {
  name: "Kabir",
  pronouns: "Men’s styling",
  gender: "men",
  ageGroup: "25–34",
  height: "180 cm",
  photoUrl: "",
  bodyBuild: "Athletic",
  fit: "Tailored",
  restrictions: [],
  appearance: { skinTone: "Tan", undertone: "Warm", confidence: 85, contrast: "Medium" },
  style: ["Traditional", "Festive"],
  colorsLove: ["Navy Blue"],
  colorsAvoid: [],
  occasion: "Garba Night",
  impression: ["Regal"],
  budget: "₹3K–₹7K",
};
const menFestiveLook: any = {
  id: "look-men-01",
  title: "Men's Festive Kurta",
  note: "Navy silk festive kurta.",
  category: "Festive",
  vibe: "Regal",
  personaEnergy: "Confident.",
  palette: ["#1e3a8a", "#f59e0b", "#ffffff"],
  imageUrl: "/replace-with-generated/garba-01.webp",
  outfit: "Men navy silk embroidered festive kurta with churidar trousers.",
  outfitColor: "Navy Blue",
  jewellery: "Traditional metallic kada.",
  hairstyle: "Sleek.",
  makeup: "None.",
  footwear: "Men handcrafted leather mojaris.",
  accessories: "", // Empty: triggers fallback for men
  confidence: 92,
  applicableCategories: ["outfit", "footwear", "accessories", "jewellery"],
  reasoning: ["Traditional and sharp."],
  pieces: [
    { category: "Top", name: "Men Navy Silk Embroidered Kurta", detail: "Mandarin collar." },
    { category: "Bottom", name: "Churidar Trousers", detail: "Cotton silk blend." },
    { category: "Footwear", name: "Handcrafted Leather Mojaris", detail: "Padded insole." },
  ],
};
const menSpecs = planRequirementSpecs(menFestiveLook, menProfile, "man", defaultCategories);
const menAccSpecs = menSpecs.filter((s) => s.category === "accessories");
assert.equal(menAccSpecs.length, 1, "Men's festive fallback accessory must remain intact");
assert.ok(
  menAccSpecs[0].itemTitle.toLowerCase().includes("pocket square") || menAccSpecs[0].itemTitle.toLowerCase().includes("brooch"),
  `Men's fallback accessory must be pocket square/brooch, got: ${menAccSpecs[0].itemTitle}`,
);
assert.equal(menAccSpecs[0].targetGender, "men", `Men's targetGender must be 'men'`);

// Men's look with explicit belt -> belt spec generated
const menCasualLook: any = {
  id: "look-men-02",
  title: "Men's Smart Casual Linen",
  note: "Navy linen shirt with beige chinos.",
  category: "Casual",
  vibe: "Easygoing",
  personaEnergy: "Relaxed.",
  palette: ["#1e3a8a", "#f59e0b", "#ffffff"],
  imageUrl: "/replace-with-generated/casual-01.webp",
  outfit: "Men navy linen button-down shirt with beige tailored chinos.",
  outfitColor: "Navy Blue",
  jewellery: "None.",
  hairstyle: "Natural.",
  makeup: "None.",
  footwear: "Men white leather sneakers.",
  accessories: "Tan braided leather belt",
  confidence: 90,
  applicableCategories: ["outfit", "footwear", "accessories"],
  reasoning: ["Clean and comfortable."],
  pieces: [
    { category: "Top", name: "Men Navy Linen Shirt", detail: "100% linen." },
    { category: "Bottom", name: "Beige Tailored Chinos", detail: "Stretch cotton." },
    { category: "Footwear", name: "White Leather Sneakers", detail: "Rubber sole." },
  ],
};
const menCasualSpecs = planRequirementSpecs(menCasualLook, { ...menProfile, occasion: "Casual Brunch" }, "man", defaultCategories);
const menCasualAccSpecs = menCasualSpecs.filter((s) => s.category === "accessories");
assert.equal(menCasualAccSpecs.length, 1, "Men's explicit belt must be planned");
assert.equal(menCasualAccSpecs[0].itemSubcategory, "belt", "Men's subcategory must be 'belt'");

// Women's festive look with empty accessories -> fallback potli bag is preserved
const womenProfile: any = {
  name: "Deepika",
  pronouns: "Women’s styling",
  gender: "women",
  ageGroup: "25–34",
  height: "165 cm",
  photoUrl: "",
  bodyBuild: "Hourglass",
  fit: "Regular",
  restrictions: [],
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 85, contrast: "Medium" },
  style: ["Traditional", "Festive"],
  colorsLove: ["Pink"],
  colorsAvoid: [],
  occasion: "Garba Night",
  impression: ["Graceful"],
  budget: "₹3K–₹7K",
};
const womenFestiveLook: any = {
  id: "look-women-01",
  title: "Women's Festive Chaniya Choli",
  note: "Pink flared lehenga.",
  category: "Festive",
  vibe: "Graceful",
  personaEnergy: "Radiant.",
  palette: ["#ec4899", "#f59e0b", "#ffffff"],
  imageUrl: "/replace-with-generated/garba-01.webp",
  outfit: "Women pink flared embroidered chaniya choli with mirror-work dupatta.",
  outfitColor: "Pink",
  jewellery: "Oxidised silver jhumkas.",
  hairstyle: "Braided.",
  makeup: "Soft glam.",
  footwear: "Embellished juttis.",
  accessories: "", // Empty: triggers fallback for women
  confidence: 94,
  applicableCategories: ["outfit", "footwear", "accessories", "jewellery", "makeup"],
  reasoning: ["Traditional and vibrant."],
  pieces: [
    { category: "Outfit", name: "Pink Flared Embroidered Chaniya Choli", detail: "Cotton." },
    { category: "Footwear", name: "Embellished Juttis", detail: "Padded." },
  ],
};
const womenSpecs = planRequirementSpecs(womenFestiveLook, womenProfile, "woman", defaultCategories);
const womenAccSpecs = womenSpecs.filter((s) => s.category === "accessories");
assert.equal(womenAccSpecs.length, 1, "Women's festive fallback accessory must remain intact");
assert.ok(
  womenAccSpecs[0].itemTitle.toLowerCase().includes("potli"),
  `Women's fallback accessory must be potli bag, got: ${womenAccSpecs[0].itemTitle}`,
);

console.log("✓ Test 5 Passed: Existing men's and women's accessory extraction and fallbacks remain 100% intact.");

// -----------------------------------------------------------------------------
// Test 6: Helper Function isExplicitlyNoneAccessory Validation
// -----------------------------------------------------------------------------
console.log("\n[Test 6] Testing isExplicitlyNoneAccessory helper function...");
assert.equal(isExplicitlyNoneAccessory("None"), true);
assert.equal(isExplicitlyNoneAccessory("none"), true);
assert.equal(isExplicitlyNoneAccessory("None."), true);
assert.equal(isExplicitlyNoneAccessory("None (child-friendly)"), true);
assert.equal(isExplicitlyNoneAccessory("None (child-safe styling)."), true);
assert.equal(isExplicitlyNoneAccessory("No accessories"), true);
assert.equal(isExplicitlyNoneAccessory("None needed"), true);
assert.equal(isExplicitlyNoneAccessory("None recommended"), true);
assert.equal(isExplicitlyNoneAccessory("none/minimal"), true);
assert.equal(isExplicitlyNoneAccessory("nil"), true);
assert.equal(isExplicitlyNoneAccessory("n/a"), true);

// Legitimate accessories must NEVER match
assert.equal(isExplicitlyNoneAccessory("Royal pearl sherwani brooch"), false);
assert.equal(isExplicitlyNoneAccessory("Brown braided leather belt"), false);
assert.equal(isExplicitlyNoneAccessory("Contrasting silk pocket square"), false);
assert.equal(isExplicitlyNoneAccessory("Navy baseball cap"), false);
assert.equal(isExplicitlyNoneAccessory(""), false);
assert.equal(isExplicitlyNoneAccessory(undefined), false);

console.log("✓ Test 6 Passed: Helper correctly differentiates explicit 'None' non-recommendations from legitimate accessories.");

console.log("\n======================================================================");
console.log("ALL 6 BOYS ACCESSORY INTEGRITY TESTS PASSED CLEANLY! 🎉");
console.log("======================================================================");
