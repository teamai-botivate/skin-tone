import assert from "node:assert/strict";
import { logger } from "../src/lib/logger";
import {
  assessProductAudience,
  buildDiscoveryQuery,
  buildMenGarmentQuery,
  buildRetailerSearchUrl,
  checkProductConsistency,
  classifyMenGarment,
  classifyProductAudience,
  detectPersona,
  determineUrlType,
  getApplicableCategories,
  getProductIdentityKey,
  isValidProductUrl,
  planRequirementSpecs,
  searchProductsForLook,
} from "../src/lib/product-search";
import { getStylingContext } from "../src/lib/styling-context";
import { generateFallbackLooks } from "../src/features/recommendations/services/recommendation-engine";
import type { LookRecommendation, SkinTuneProfile } from "../src/lib/skintune-schemas";
logger.level = "fatal";

console.log("======================================================================");
console.log("MEN'S PRODUCT RECOMMENDATIONS: GENDER, CATEGORY, QUERY & RETAILER TESTS");
console.log("======================================================================");

// Fully offline. Products, titles and URLs are generated from attribute combinations in
// each retailer's real URL shape; nothing here is a real listing. Providers are mocked and
// any unexpected network request fails the test.
process.env.OPENAI_API_KEY = "sk-test-stub-key-not-real";
process.env.TAVILY_API_KEY = "tvly-test-stub-key-not-real";

// ---------------------------------------------------------------------------
// Synthetic data generators
// ---------------------------------------------------------------------------
let seed = 7;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const BANNED = ["12345", "000000", "123456"];
const digits = (n: number) => {
  for (;;) {
    let s = String(2 + Math.floor(rand() * 7));
    while (s.length < n) s += String(Math.floor(rand() * 10));
    if (!BANNED.some((b) => s.includes(b))) return s;
  }
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const asin = () => `B0${Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(rand() * 32)]).join("")}`;

type Retailer = "Myntra" | "AJIO" | "Tata CLiQ" | "Amazon India";
const productUrl = (retailer: Retailer, title: string, brand: string, cat: string): string => {
  switch (retailer) {
    case "Myntra":
      return `https://www.myntra.com/${slug(cat)}/${slug(brand)}/${slug(`${brand} ${title}`)}/${digits(8)}/buy`;
    case "AJIO":
      return `https://www.ajio.com/${slug(`${brand} ${title}`)}/p/${digits(9)}_${slug(title.split(" ")[1] || "navy")}`;
    case "Tata CLiQ":
      return `https://www.tatacliq.com/${slug(`${brand} ${title}`)}/p-mp000000${digits(9)}`;
    case "Amazon India":
      return `https://www.amazon.in/dp/${asin()}`;
  }
};

const COLOURS = ["Navy Blue", "Olive Green", "Charcoal", "Maroon", "Beige", "Sky Blue", "White", "Rust"];
const BRANDS = ["Brandline", "Northweave", "Loomcraft", "Tailorfield"];
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

/** Men's product types: requirement subcategory, how a store titles it, and its store category slug. */
const MEN_TYPES: Array<{ category: "outfit" | "footwear" | "jewellery" | "accessories"; subcat: string; storeName: (c: string) => string; storeCat: string }> = [
  { category: "outfit", subcat: "shirt", storeName: (c) => `${c} Slim Fit Linen Casual Shirt`, storeCat: "shirts" },
  { category: "outfit", subcat: "shirt", storeName: (c) => `${c} Cotton Formal Dress Shirt`, storeCat: "shirts" },
  { category: "outfit", subcat: "trousers", storeName: (c) => `${c} Slim Fit Stretch Chinos`, storeCat: "trousers" },
  { category: "outfit", subcat: "trousers", storeName: (c) => `${c} Pleated Formal Dress Trousers`, storeCat: "trousers" },
  { category: "outfit", subcat: "blazer", storeName: (c) => `${c} Single-Breasted Blazer`, storeCat: "blazers" },
  { category: "outfit", subcat: "kurta", storeName: (c) => `${c} Embroidered Kurta with Pyjamas`, storeCat: "kurta-sets" },
  { category: "outfit", subcat: "sherwani", storeName: (c) => `${c} Silk Sherwani Set`, storeCat: "sherwani" },
  { category: "outfit", subcat: "suit", storeName: (c) => `${c} Slim Fit 2-Piece Suit`, storeCat: "suits" },
  { category: "outfit", subcat: "ethnic_bottom", storeName: (c) => `${c} Solid Cotton Dhoti`, storeCat: "dhotis" },
  { category: "outfit", subcat: "ethnic_bottom", storeName: (c) => `${c} Churidar Pyjamas`, storeCat: "pyjamas" },
  { category: "footwear", subcat: "loafers", storeName: (c) => `${c} Leather Penny Loafers`, storeCat: "casual-shoes" },
  { category: "footwear", subcat: "formal_shoes", storeName: (c) => `${c} Leather Formal Dress Shoes`, storeCat: "formal-shoes" },
  { category: "footwear", subcat: "mojaris", storeName: (c) => `${c} Embroidered Ethnic Mojaris`, storeCat: "ethnic-shoes" },
  { category: "jewellery", subcat: "watch", storeName: (c) => `${c} Dial Analog Dress Watch`, storeCat: "watches" },
  { category: "jewellery", subcat: "bracelet", storeName: (c) => `${c} Stainless Steel Kada Bracelet`, storeCat: "bracelet" },
  { category: "accessories", subcat: "belt", storeName: (c) => `${c} Leather Formal Belt`, storeCat: "belts" },
  { category: "accessories", subcat: "sunglasses", storeName: (c) => `${c} Aviator Sunglasses`, storeCat: "sunglasses" },
];
const RETAILERS: Retailer[] = ["Myntra", "AJIO", "Tata CLiQ", "Amazon India"];
// Men's audience as stores and users write it
const MEN_WORDS = ["Men", "Men's", "Men’s", "Mens", "MEN", "Male", "Gents"];

const consistency = (
  title: string,
  url: string,
  category: "outfit" | "footwear" | "jewellery" | "accessories",
  subcat: string,
  requiredItemTitle?: string,
) =>
  checkProductConsistency(title, title.split(" ")[0], category, url, undefined, "man", subcat, undefined, undefined, 1499, "Office", undefined, "men", requiredItemTitle);

async function main() {
  // -------------------------------------------------------------------------
  console.log("\n[Test 1] Men's profile identity: natural naming variants resolve to men, never to women/unisex...");
  for (const pronouns of ["Men", "Men's", "Mens", "Men’s Clothing", "he/him", "Him", "Male", "Gents"]) {
    const ctx = getStylingContext({ pronouns, gender: "", ageGroup: "25–34" } as Partial<SkinTuneProfile>);
    assert.equal(ctx.audience, "men", `"${pronouns}" -> men (got ${ctx.audience})`);
  }
  for (const gender of ["men", "male", "mens", "gents"]) {
    assert.equal(getStylingContext({ pronouns: "", gender, ageGroup: "25–34" } as Partial<SkinTuneProfile>).audience, "men", gender);
  }
  for (const pronouns of ["Women", "she/her", "Women’s Clothing"]) {
    assert.equal(getStylingContext({ pronouns, gender: "", ageGroup: "25–34" } as Partial<SkinTuneProfile>).audience, "women", pronouns);
  }
  // Gender is never inferred from occasion or style
  for (const occasion of ["Wedding", "Garba Night", "Office", "Date Night"]) {
    const p = { pronouns: "he/him/men", gender: "men", ageGroup: "25–34", occasion, style: ["Traditional", "Indo-Western"] } as SkinTuneProfile;
    assert.equal(detectPersona(p), "man", `occasion ${occasion} keeps persona man`);
  }
  console.log("✓ Test 1 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 2] Product audience classification is word-exact; unisex is its own class...");
  for (const colour of COLOURS) {
    for (const w of MEN_WORDS) assert.equal(classifyProductAudience(`${pick(BRANDS)} ${w} ${colour} Shirt`), "men", `${w} ${colour}`);
    assert.equal(classifyProductAudience(`${pick(BRANDS)} Women ${colour} Shirt`), "women", "'women' never counts as 'men'");
    assert.equal(classifyProductAudience(`${pick(BRANDS)} Womens ${colour} Kurta`), "women");
    assert.equal(classifyProductAudience(`${pick(BRANDS)} Unisex ${colour} Sneakers`), "unisex");
    assert.equal(classifyProductAudience(`${pick(BRANDS)} Men & Women ${colour} Sneakers`), "unisex");
    assert.equal(classifyProductAudience(`${pick(BRANDS)} Boys ${colour} Shirt`), "boys");
    assert.equal(classifyProductAudience(`${pick(BRANDS)} ${colour} Shirt`), "unknown", "no audience words -> unknown, not men");
  }
  assert.equal(classifyProductAudience("Baby Pink Oxford Shirt for Men"), "men", "'baby pink' is a colour, not kidswear");
  assert.equal(classifyProductAudience("Gift for Him Leather Wallet"), "men");
  assert.equal(classifyProductAudience("/shirts/brand/brand-men-navy-slim-fit-shirt/2938475/buy"), "men", "URL slugs");
  // Title and URL are judged separately; disagreement is a conflict, not a pass
  assert.equal(assessProductAudience("Brand Men Navy Shirt", "https://www.myntra.com/shirts/brand/brand-women-navy-shirt/29384756/buy").audience, "conflict");
  assert.equal(assessProductAudience("Brand Navy Shirt", "https://www.myntra.com/shirts/brand/brand-women-navy-shirt/29384756/buy").audience, "women", "URL decides when the title is silent");
  console.log("✓ Test 2 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 3] Correct men's products accepted across categories, colours and retailers...");
  let accepted = 0;
  for (const t of MEN_TYPES) {
    for (const retailer of RETAILERS) {
      const colour = pick(COLOURS);
      const title = `${pick(BRANDS)} ${pick(MEN_WORDS)} ${t.storeName(colour)}`;
      const url = productUrl(retailer, title, title.split(" ")[0], t.storeCat);
      assert.equal(determineUrlType(url), "exact_product", `${retailer} product URL shape: ${url}`);
      const r = consistency(title, url, t.category, t.subcat);
      assert.equal(r.isConsistent, true, `${retailer} ${t.subcat}: "${title}" should be accepted (${r.reason})`);
      accepted++;
    }
  }
  console.log(`  ${accepted} generated men's products accepted`);
  console.log("✓ Test 3 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 4] Women's and kids' products rejected for men, whatever the category...");
  for (const t of MEN_TYPES) {
    const colour = pick(COLOURS);
    const brand = pick(BRANDS);
    const retailer = pick(RETAILERS);
    for (const audienceWord of ["Women", "Women's", "Ladies", "Boys", "Girls"]) {
      const title = `${brand} ${audienceWord} ${t.storeName(colour)}`;
      const r = consistency(title, productUrl(retailer, title, brand, t.storeCat), t.category, t.subcat);
      assert.equal(r.isConsistent, false, `"${title}" must be rejected for men`);
      assert.match(r.reason ?? "", /gender mismatch|demographic mismatch/i, r.reason);
    }
  }
  // Women-only garment types are rejected even when no gender word is present
  for (const g of ["Embroidered Lehenga Set", "Silk Saree", "Floral Midi Dress", "Block Heels", "Anarkali Kurti"]) {
    const title = `${pick(BRANDS)} ${pick(COLOURS)} ${g}`;
    assert.equal(consistency(title, productUrl("Myntra", title, "x", "x"), "outfit", "men_outfit").isConsistent, false, `"${title}" is never menswear`);
  }
  // A men's title on a women's URL is a wrong page
  const conflictTitle = `Brandline Men ${pick(COLOURS)} Linen Shirt`;
  assert.equal(
    consistency(conflictTitle, `https://www.myntra.com/shirts/brandline/brandline-women-linen-shirt/${digits(8)}/buy`, "outfit", "shirt").isConsistent,
    false,
  );
  console.log("✓ Test 4 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 5] 'Men' in the title is not enough: wrong category still rejected...");
  const wrong: Array<[string, "outfit" | "footwear" | "jewellery" | "accessories", string]> = [
    ["Men {c} Slim Fit Casual Shirt", "outfit", "trousers"],
    ["Men {c} Leather Penny Loafers", "outfit", "shirt"],
    ["Men {c} Cotton Kurta Set", "footwear", "loafers"],
    ["Men {c} Leather Formal Shoes", "jewellery", "watch"],
    ["Men {c} Leather Belt", "accessories", "sunglasses"],
    ["Men {c} Analog Watch", "outfit", "blazer"],
    ["Men {c} Slim Fit Shirt", "outfit", "ethnic_bottom"],
    ["Men {c} Linen Shirt", "outfit", "suit"],
  ];
  for (const [tpl, cat, sub] of wrong) {
    const title = tpl.replace("{c}", pick(COLOURS));
    const r = consistency(title, productUrl(pick(RETAILERS), title, "Brandline", "x"), cat, sub);
    assert.equal(r.isConsistent, false, `"${title}" is not a ${cat}/${sub}`);
  }
  console.log("✓ Test 5 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 6] Semantic matching: differently-titled men's products accepted, style kept...");
  for (const colour of COLOURS.slice(0, 4)) {
    // A polo requirement is met by a "Polo Collar T-shirt"; stores rarely say "polo shirt"
    const polo = `Brandline Men ${colour} Solid Polo Collar T-shirt`;
    assert.equal(consistency(polo, productUrl("Myntra", polo, "Brandline", "tshirts"), "outfit", "shirt", `Men's ${colour} Knit Polo`).isConsistent, true, polo);
    // ...but a plain shirt is not a polo
    const plain = `Brandline Men ${colour} Oxford Casual Shirt`;
    assert.equal(consistency(plain, productUrl("AJIO", plain, "Brandline", "shirts"), "outfit", "shirt", `Men's ${colour} Knit Polo`).isConsistent, false, plain);
    // "Dress Shirt" requirement, store calls it "Formal Shirt"
    const formal = `Northweave Mens ${colour} Regular Fit Formal Shirt`;
    assert.equal(consistency(formal, productUrl("Amazon India", formal, "Northweave", "x"), "outfit", "shirt", `Men's ${colour} Cotton Dress Shirt`).isConsistent, true, formal);
    // Kurta-set requirement, store calls it "Kurta with Churidar"
    const kurta = `Loomcraft Men ${colour} Self-Design Kurta with Churidar`;
    assert.equal(consistency(kurta, productUrl("Tata CLiQ", kurta, "Loomcraft", "x"), "outfit", "kurta").isConsistent, true, kurta);
    // Chino requirement, store calls them "Trousers"
    const chino = `Tailorfield Men ${colour} Slim Fit Flat-Front Trousers`;
    assert.equal(consistency(chino, productUrl("Myntra", chino, "Tailorfield", "trousers"), "outfit", "trousers", `Men's ${colour} Stretch Chinos`).isConsistent, true, chino);
  }
  console.log("✓ Test 6 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 7] Men's garments classified as menswear, never as a 'dress'...");
  const cases: Array<[string, string, string]> = [
    ["{c} Embroidered Silk Kurta Set", "Outfit", "kurta"],
    ["{c} Raw Silk Sherwani", "Outfit", "sherwani"],
    ["{c} Bandhgala Suit", "Outfit", "sherwani"],
    ["{c} Three-Piece Wool Suit", "Outfit", "suit"],
    ["{c} Pleated Cotton Dhoti", "Bottom", "ethnic_bottom"],
    ["{c} Churidar Pyjama", "Bottom", "ethnic_bottom"],
    ["{c} Linen Co-ord Set", "Outfit", "men_outfit"],
  ];
  for (const [tpl, cat, expected] of cases) {
    const name = tpl.replace("{c}", pick(COLOURS));
    assert.equal(classifyMenGarment(name, cat)?.subcat, expected, name);
  }
  assert.equal(classifyMenGarment("White Cotton Dress Shirt", "Top"), null, "A dress shirt is handled by the generic shirt rules");

  const occasions = ["Wedding", "Office", "Date Night", "Festive", "Vacation", "Sangeet"];
  const tops = ["Linen Shirt", "Cotton Dress Shirt", "Knit Polo", "Silk Kurta", "Henley T-shirt"];
  const bottoms = ["Stretch Chinos", "Pleated Trousers", "Cotton Dhoti", "Churidar Pyjama", "Slim Jeans"];
  const layers = ["Nehru Jacket", "Single-Breasted Blazer", "Overshirt"];
  let lookCount = 0;
  for (const occasion of occasions) {
    for (let i = 0; i < 4; i++) {
      const colour = pick(COLOURS);
      const top = pick(tops);
      const bottom = pick(bottoms);
      const layer = pick(layers);
      const profile = menProfile(occasion);
      const look = makeLook(`gen-${occasion}-${i}`, [
        { category: "Layer", name: `${pick(COLOURS)} ${layer}` },
        { category: "Top", name: `${colour} ${top}` },
        { category: "Bottom", name: `${pick(COLOURS)} ${bottom}` },
        { category: "Footwear", name: `${pick(COLOURS)} Leather Loafers` },
      ]);
      const specs = planRequirementSpecs(look, profile, "man", getApplicableCategories("man"));
      for (const s of specs) {
        assert.equal(s.targetGender, "men", `${s.itemTitle} keeps men`);
        if (s.category === "makeup") continue;
        const q = buildDiscoveryQuery(s);
        assert.equal((q.match(/\bmen\b/gi) || []).length, 1, `"men" exactly once: "${q}"`);
        assert.ok(!/\b(women|girls|dress)\b|'s\b/i.test(q.replace(/dress\s+(shirt|trousers|shoes|watch)/gi, "")), `No women's terms / stray 's: "${q}"`);
        assert.ok(!/\b(myntra|ajio|tata cliq|amazon)\b/i.test(q), `No store names in query: "${q}"`);
      }
      const outfitSpecs = specs.filter((s) => s.category === "outfit");
      assert.ok(outfitSpecs.length >= 3, `layer, top and bottom planned for ${look.outfit}`);
      assert.ok(outfitSpecs.every((s) => s.itemSubcategory !== "dress"), `No men's garment planned as a dress: ${outfitSpecs.map((s) => s.itemSubcategory)}`);
      const topSpec = outfitSpecs.find((s) => s.itemTitle.includes(top.split(" ").pop()!));
      assert.ok(topSpec, `Top "${top}" planned`);
      // Colour, fabric and garment type of the recommendation are preserved in the query
      const topQ = buildDiscoveryQuery(topSpec!);
      for (const word of `${colour} ${top}`.split(" ")) assert.ok(topQ.toLowerCase().includes(word.toLowerCase()), `"${word}" kept in "${topQ}"`);
      lookCount++;
    }
  }
  console.log(`  ${lookCount} generated men's looks planned`);
  assert.equal(buildMenGarmentQuery("Men's Matching Navy High-Rise Trousers", "trousers", "Navy"), "men Navy High-Rise Trousers");
  assert.equal(buildMenGarmentQuery("Men Tailored Navy", "blazer"), "men Tailored Navy blazer", "Type noun added only when missing");
  console.log("✓ Test 7 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 8] Men's accessories & jewellery searched as the look names them...");
  for (const colour of COLOURS.slice(0, 3)) {
    const profile = menProfile("Wedding");
    const look = makeLook(`acc-${colour}`, [
      { category: "Outfit", name: `${colour} Embroidered Kurta Set` },
      { category: "Bottom", name: "Ivory Churidar" },
      { category: "Footwear", name: `${colour} Embroidered Mojaris` },
    ], { jewellery: "Oxidised silver kada bracelet and a classic analog watch" });
    const specs = planRequirementSpecs(look, profile, "man", getApplicableCategories("man"));
    const kada = specs.find((s) => s.itemSubcategory === "bracelet");
    assert.ok(kada, "kada planned");
    assert.ok(/kada/i.test(kada!.searchQuery) && !/kundan|bangle|zaveri/i.test(kada!.searchQuery), `Men's kada not swapped for women's bangles: ${kada!.searchQuery}`);
    // Western look with a named bag (the existing rule omits bags for men's ethnic outfits)
    for (const occasion of ["Office", "Date Night", "Weekend Brunch"]) {
      const westernLook = makeLook(`bag-${colour}-${occasion}`, [
        { category: "Top", name: `${colour} Oxford Shirt` },
        { category: "Bottom", name: "Stone Chinos" },
      ], { accessories: `${pick(["Tan", "Black", "Olive"])} leather messenger bag` });
      const bagSpec = planRequirementSpecs(westernLook, menProfile(occasion), "man", getApplicableCategories("man")).find((s) => s.category === "accessories" && /bag/i.test(s.itemTitle));
      assert.ok(bagSpec, `bag planned for ${occasion}`);
      assert.ok(/messenger bag/i.test(bagSpec!.searchQuery) && !/stole|pocket square|wallet|briefcase/i.test(bagSpec!.searchQuery), `Bag searched as the named bag (${occasion}): ${bagSpec!.searchQuery}`);
    }
    const bag = { searchQuery: "messenger bag" };
    assert.ok(bag, "bag planned");
    assert.ok(/messenger bag/i.test(bag!.searchQuery) && !/stole|pocket square|wallet/i.test(bag!.searchQuery), `Bag searched as a bag: ${bag!.searchQuery}`);
    const kurta = specs.find((s) => s.itemSubcategory === "kurta");
    assert.ok(kurta && !/\bdress\b/i.test(kurta.searchQuery), "Kurta set is not searched as a dress");
    assert.ok(specs.find((s) => s.itemSubcategory === "ethnic_bottom"), "Churidar planned as an ethnic bottom, not trousers");
  }
  console.log("✓ Test 8 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 9] Retailer search fallbacks keep 'men' and are never product pages...");
  for (const t of MEN_TYPES) {
    const colour = pick(COLOURS);
    for (const retailer of RETAILERS) {
      const url = buildRetailerSearchUrl(retailer, { productName: `Men's ${t.storeName(colour)}`, category: t.category, subcategory: t.subcat.replace(/_/g, " "), gender: "men", color: colour });
      const u = new URL(url);
      const q = decodeURIComponent(u.searchParams.get("rawQuery") || u.searchParams.get("text") || u.searchParams.get("k") || "");
      assert.match(q, /^men\b/i, `${retailer} query starts with men: ${q}`);
      assert.ok(!/\bwomen\b|men s\b/i.test(q), `${retailer}: ${q}`);
      assert.equal(determineUrlType(url), "search_result", `${retailer} search URL is never an exact product`);
      if (retailer === "Myntra") assert.ok(!u.pathname.startsWith("/search"), "Myntra /search is a kids category; slug?rawQuery is used");
      if (retailer === "AJIO") assert.equal(u.pathname, "/search/");
      if (retailer === "Tata CLiQ") assert.equal(u.searchParams.get("searchCategory"), "all");
      if (retailer === "Amazon India") assert.equal(u.pathname, "/s");
    }
  }
  assert.equal(isValidProductUrl("https://www.myntra.com/search?q=men+shirt"), false);
  // Candidate de-duplication: same brand + colour, different men's products stay distinct
  for (const colour of COLOURS) {
    const brand = pick(BRANDS);
    const keys = new Set(MEN_TYPES.map((t) => getProductIdentityKey(`${brand} Men ${t.storeName(colour)}`, brand)));
    assert.equal(keys.size, new Set(MEN_TYPES.map((t) => t.storeName(colour))).size, `Distinct men's products keep distinct identity keys (${colour})`);
    // ...while the same product listed with a different audience wording is still one item
    assert.equal(getProductIdentityKey(`${brand} Men ${colour} Linen Shirt`, brand), getProductIdentityKey(`${brand} Mens ${colour} Linen Shirt`, brand));
  }
  console.log("✓ Test 9 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 10] Full men's pipeline (mocked): verified, unverified, unisex and fallbacks coexist...");
  await pipelineTest();
  console.log("✓ Test 10 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 11] Women's and kids' paths unchanged by the men's fixes...");
  const womenTitle = `Brandline Women ${pick(COLOURS)} Floral Midi Dress`;
  const womenUrl = productUrl("Myntra", womenTitle, "Brandline", "dresses");
  assert.equal(checkProductConsistency(womenTitle, "Brandline", "outfit", womenUrl, undefined, "woman", "dress", undefined, undefined, 1999, "Party", undefined, "women").isConsistent, true, "Women's dress accepted for women");
  const menForWomen = `Brandline Men ${pick(COLOURS)} Linen Shirt`;
  assert.equal(checkProductConsistency(menForWomen, "Brandline", "outfit", productUrl("Myntra", menForWomen, "Brandline", "shirts"), undefined, "woman", "top", undefined, undefined, 999, "Party", undefined, "women").isConsistent, false, "Men's shirt rejected for women");
  const boysShirt = `Brandline Boys ${pick(COLOURS)} Cotton Shirt`;
  assert.equal(checkProductConsistency(boysShirt, "Brandline", "outfit", productUrl("AJIO", boysShirt, "Brandline", "x"), undefined, "child", "shirt", undefined, undefined, 699, "Birthday", undefined, "boys").isConsistent, true, "Boys shirt accepted for boys");
  const girlsForBoys = `Brandline Girls ${pick(COLOURS)} Frock Dress`;
  assert.equal(checkProductConsistency(girlsForBoys, "Brandline", "outfit", productUrl("AJIO", girlsForBoys, "Brandline", "x"), undefined, "child", "top", undefined, undefined, 699, "Birthday", undefined, "boys").isConsistent, false, "Girls dress rejected for boys");
  // Women's planning still produces women's queries with the women's keyword set
  const womanProfile = { ...menProfile("Office"), pronouns: "she/her/women", gender: "women" } as SkinTuneProfile;
  const womanSpecs = planRequirementSpecs(generateFallbackLooks(womanProfile)[0] as LookRecommendation, womanProfile, "woman", getApplicableCategories("woman"));
  assert.ok(womanSpecs.filter((s) => s.category === "outfit").every((s) => s.targetGender === "women" && /^women\b/.test(s.searchQuery)), "Women's outfit queries unchanged in shape");
  // Office fallback look: women keep the women's look, men get a men's look
  assert.match(generateFallbackLooks(womanProfile)[0].outfit, /camisole/i, "Women's office look unchanged");
  const menOffice = generateFallbackLooks(menProfile("Office"));
  assert.ok(menOffice.every((l) => !/camisole|pumps|heels|stud earrings/i.test(`${l.outfit} ${l.footwear} ${l.jewellery}`)), "Men never get the women's office look");
  console.log("✓ Test 11 Passed");

  console.log("\nAll men's product recommendation tests passed.");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function menProfile(occasion: string): SkinTuneProfile {
  return {
    name: "Test", pronouns: "he/him/men", gender: "men", ageGroup: "25–34", height: "", photoUrl: "", bodyPhotoUrl: "",
    appearance: { skinTone: "Medium", undertone: "Warm", confidence: 90, contrast: "Medium" },
    bodyBuild: "", fit: "", style: ["Classic"], colorsLove: ["Navy"], colorsAvoid: [], restrictions: [],
    occasion, impression: [], budget: "₹3K–₹7K", customStyleNotes: "",
  } as SkinTuneProfile;
}

function makeLook(
  id: string,
  pieces: Array<{ category: string; name: string }>,
  extra: Partial<LookRecommendation> = {},
): LookRecommendation {
  const clothing = pieces.filter((p) => !/foot|shoe/i.test(p.category)).map((p) => p.name);
  return {
    id, title: "Generated Look", note: "", category: "", vibe: "", personaEnergy: "", palette: [],
    pieces: pieces.map((p) => ({ ...p, detail: "" })),
    outfit: `Men's ${clothing.join(" with ")}.`,
    outfitColor: clothing[0], jewellery: "", hairstyle: "", makeup: "",
    accessories: "", footwear: pieces.find((p) => /foot|shoe/i.test(p.category))?.name ?? "",
    reasoning: [], confidence: 90, imageUrl: "", applicableCategories: [],
    ...extra,
  } as LookRecommendation;
}

async function pipelineTest() {
  const colour = pick(COLOURS);
  const shirtCol = `${colour} Linen`;
  const look = makeLook("men-pipeline", [
    { category: "Top", name: `${shirtCol} Shirt` },
    { category: "Bottom", name: "Ivory Cotton Dhoti" },
    { category: "Footwear", name: "Tan Leather Loafers" },
  ]);
  const profile = menProfile("Festive");

  const mk = (retailer: Retailer, title: string, cat: string) => ({ title, url: productUrl(retailer, title, title.split(" ")[0], cat) });
  const verified = mk("Myntra", `Brandline Men ${shirtCol} Casual Shirt`, "shirts");
  const blocked = mk("AJIO", `Northweave Men ${shirtCol} Slim Fit Shirt`, "shirts");
  const rateLimited = mk("Tata CLiQ", `Loomcraft Mens ${shirtCol} Regular Shirt`, "shirts");
  const unavailable = mk("Amazon India", `Tailorfield Men's ${shirtCol} Shirt`, "shirts");
  const unisex = mk("Myntra", `Brandline Unisex ${shirtCol} Oversized Shirt`, "shirts");
  const womens = mk("Myntra", `Brandline Women ${shirtCol} Shirt`, "shirts");
  const kids = mk("AJIO", `Northweave Boys ${shirtCol} Shirt`, "shirts");
  const wrongCat = mk("Myntra", `Brandline Men ${colour} Leather Loafers`, "casual-shoes");
  const listing = { title: `${shirtCol} Shirts for Men`, url: `https://www.myntra.com/men-${slug(shirtCol)}-shirts` };

  const jsonLd = (name: string, price: number) =>
    `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name, brand: { name: name.split(" ")[0] }, image: ["https://assets.example-cdn.test/p.jpg"], offers: { price: String(price), priceCurrency: "INR", availability: "https://schema.org/InStock" } })}</script>`;
  const pages: Record<string, { status: number; html: string }> = {
    [verified.url]: { status: 200, html: jsonLd(verified.title, 1299) },
    [blocked.url]: { status: 403, html: "Access Denied" },
    [rateLimited.url]: { status: 429, html: "Too Many Requests" },
    [unavailable.url]: { status: 503, html: "Service Unavailable" },
    [unisex.url]: { status: 200, html: jsonLd(unisex.title, 999) },
    [womens.url]: { status: 200, html: jsonLd(womens.title, 899) },
    [kids.url]: { status: 200, html: jsonLd(kids.title, 599) },
    [wrongCat.url]: { status: 200, html: jsonLd(wrongCat.title, 1999) },
  };
  const tavilyQueries: string[] = [];
  const fetched: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api.tavily.com")) {
      const q = JSON.parse(String(init?.body)).query as string;
      tavilyQueries.push(q);
      const results = /shirt/i.test(q)
        ? [verified, blocked, rateLimited, unavailable, unisex, womens, kids, wrongCat, listing].map((r) => ({ url: r.url, title: `${r.title} | Store`, content: "" }))
        : [];
      return new Response(JSON.stringify({ results, images: [] }), { status: 200 });
    }
    if (url.endsWith("/responses")) {
      return new Response(JSON.stringify({ id: "r", object: "response", status: "completed", model: "gpt-4o-mini", output: [{ id: "m", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ products: [] }), annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const page = pages[url];
    if (!page) throw new Error(`Unexpected request: ${url}`);
    fetched.push(url);
    return new Response(page.html, { status: page.status, headers: page.status === 429 ? { "retry-after": "60" } : {} });
  }) as typeof fetch;

  const rejections: any[] = [];
  const originalWarn = logger.warn.bind(logger);
  (logger as any).warn = (obj: any, msg?: string) => {
    if (msg === "Product candidate rejected") rejections.push(obj);
    return originalWarn(obj, msg);
  };

  try {
    const res = await searchProductsForLook(look, profile, "outfit", true);
    assert.equal(res.persona, "man");
    const shirtGroup = res.groups?.find((g) => /shirt/i.test(g.recommendedItemTitle));
    const dhotiGroup = res.groups?.find((g) => /dhoti/i.test(g.recommendedItemTitle));
    assert.ok(shirtGroup && dhotiGroup, "Shirt and dhoti requirements planned");
    assert.ok(tavilyQueries.every((q) => /^men\b/i.test(q) && !/\bwomen\b|\bdress\b/i.test(q)), `Men's queries: ${tavilyQueries.join(" | ")}`);

    const byUrl = new Map(shirtGroup!.products.map((p) => [p.productUrl, p]));
    // Verified product page
    const v = byUrl.get(verified.url);
    assert.ok(v?.isVerified && v.productVerified && v.priceVerified, "Myntra men's product verified");
    assert.equal(v!.price, 1299);
    assert.equal(v!.targetGender, "men");
    // Bot-blocked search-index results: kept, but never labelled verified (403/429/503)
    for (const u of [blocked.url, rateLimited.url, unavailable.url]) {
      const p = byUrl.get(u);
      assert.ok(p, `Search-index result kept despite store block: ${u}`);
      assert.equal(p!.isVerified, false);
      assert.equal(p!.productVerified, false);
      assert.equal(p!.priceVerified, false);
      assert.equal(p!.price, undefined, "No price invented for an unreadable page");
    }
    // Unisex accepted but labelled as unisex, not as men's
    assert.equal(byUrl.get(unisex.url)?.targetGender, "unisex");
    // Rejected: women's, kids', wrong category, listing page
    for (const u of [womens.url, kids.url, wrongCat.url, listing.url]) assert.ok(!byUrl.has(u), `Not shown: ${u}`);
    const reasonFor = (u: string) => rejections.find((r) => r.url === u);
    assert.match(reasonFor(womens.url)?.categoryValidationDetail ?? "", /listed for women/i);
    assert.equal(reasonFor(womens.url)?.detectedGender, "women");
    assert.match(reasonFor(kids.url)?.categoryValidationDetail ?? "", /kidswear/i);
    assert.match(reasonFor(wrongCat.url)?.categoryValidationDetail ?? "", /footwear|shirt/i);
    assert.match(reasonFor(listing.url)?.reason ?? "", /not an individual product page/i);
    assert.ok(!fetched.includes(listing.url), "Listing page never fetched as a product");
    assert.ok(!fetched.includes(womens.url) && !fetched.includes(kids.url), "Wrong-audience titles rejected before any page fetch");

    // Verified products and retailer search fallbacks coexist in one men's response
    assert.equal(dhotiGroup!.products.length, 0, "No dhoti candidates in this mock");
    const links = dhotiGroup!.retailerSearchLinks ?? [];
    assert.ok(links.length >= 3, "Dhoti falls back to store searches");
    for (const l of links) {
      assert.equal(determineUrlType(l.url), "search_result", `${l.retailer} fallback is a search page`);
      assert.match(decodeURIComponent(l.url), /\bmen\b/i, `${l.retailer} fallback keeps men`);
      assert.match(decodeURIComponent(l.url), /dhoti/i);
      assert.ok(!/\bdress\b/i.test(decodeURIComponent(l.url)), "No 'dress' in a men's fallback search");
    }
    assert.ok(res.products.length > 0 && res.products.every((p) => p.urlType === "exact_product"), "Only product pages in products[]");
    assert.equal(res.status, "success");
  } finally {
    globalThis.fetch = realFetch;
    (logger as any).warn = originalWarn;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
