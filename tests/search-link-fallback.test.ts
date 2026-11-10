/**
 * Regression: relevant retailer search links ("More matching options") survive when exact
 * product verification fails, appear alongside verified products, and never leak across
 * category, gender or age group. Fully offline: no network, no paid API calls.
 */
import assert from "node:assert/strict";
import {
  buildProductGroup,
  planRequirementSpecs,
  checkProductConsistency,
  type RequirementSpec,
} from "../src/lib/product-search";
import {
  buildRelevantSearchLinks,
  isRelevantRetailerSearchLink,
  getGroupDisplayState,
  shouldShowEmptyState,
} from "../src/lib/retailer-search-links";
import { determineUrlType, isValidProductUrl } from "../src/lib/retailer-urls";
import { ProductGroupSchema, type ProductResult } from "../src/lib/skintune-schemas";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function spec(partial: Partial<RequirementSpec> & Pick<RequirementSpec, "category" | "itemTitle" | "targetGender">): RequirementSpec {
  return {
    stylingRequirement: `${partial.itemTitle} for the look`,
    searchQuery: partial.itemTitle,
    preferredRetailers: ["Myntra", "AJIO", "Tata CLiQ", "Amazon"],
    matchContext: "",
    ...partial,
  };
}

function verifiedProduct(p: Partial<ProductResult> & Pick<ProductResult, "id" | "category" | "productName" | "productUrl" | "retailer">): ProductResult {
  return {
    subcategory: p.category,
    brand: "Brand",
    currency: "INR",
    price: 1499,
    formattedPrice: "₹1,499",
    priceVerified: true,
    productVerified: true,
    isVerified: true,
    urlType: "exact_product",
    imageUrl: "https://assets.myntassets.com/img/product.jpg",
    matchReason: "Verified on retailer page",
    ...p,
  } as ProductResult;
}

// One requirement per demographic, each with a category-appropriate item.
const DEMOGRAPHICS = {
  women: spec({
    category: "outfit", itemTitle: "Women Floral Midi Dress", targetGender: "women", itemSubcategory: "dress",
    preferredRetailers: ["Myntra", "AJIO", "Nykaa Fashion", "Tata CLiQ"],
  }),
  men: spec({
    category: "footwear", itemTitle: "Men Black Formal Derby Shoes", targetGender: "men", itemSubcategory: "formal_shoes",
  }),
  girls: spec({
    category: "accessories", itemTitle: "Girls Cute Hair Accessories & Clips", targetGender: "girls",
    itemSubcategory: "hair_accessory", dominantColor: "Pink", preferredRetailers: ["Myntra", "FirstCry", "Mumkins", "AJIO"],
  }),
  boys: spec({
    category: "footwear", itemTitle: "Boys Ethnic Mojaris", targetGender: "boys", itemSubcategory: "mojari",
    preferredRetailers: ["Myntra", "FirstCry", "AJIO", "Bata"],
  }),
} as const;

const VERIFIED: Record<keyof typeof DEMOGRAPHICS, ProductResult> = {
  women: verifiedProduct({ id: "w1", category: "outfit", productName: "Women Floral Midi Dress", retailer: "Myntra", targetGender: "women", productUrl: "https://www.myntra.com/dresses/brand/women-floral-midi-dress/23456789/buy" }),
  men: verifiedProduct({ id: "m1", category: "footwear", productName: "Men Black Leather Derby Shoes", retailer: "AJIO", targetGender: "men", productUrl: "https://www.ajio.com/brand-men-derby-shoes/p/469876543_black" }),
  girls: verifiedProduct({ id: "g1", category: "accessories", productName: "Girls Set of 6 Hair Clips", retailer: "FirstCry", targetGender: "girls", productUrl: "https://www.firstcry.com/brand/girls-hair-clips/14567890/product-detail" }),
  boys: verifiedProduct({ id: "b1", category: "footwear", productName: "Boys Embroidered Ethnic Mojaris", retailer: "Myntra", targetGender: "boys", productUrl: "https://www.myntra.com/ethnic-shoes/brand/boys-mojaris/23456711/buy" }),
};

console.log("======================================================================");
console.log("REGRESSION: RELEVANT RETAILER SEARCH LINKS (ALL DEMOGRAPHICS)");
console.log("======================================================================");

for (const [demo, req] of Object.entries(DEMOGRAPHICS) as Array<[keyof typeof DEMOGRAPHICS, RequirementSpec]>) {
  console.log(`\n[${demo}] ${req.itemTitle} (${req.category})`);

  // 1. Verified exact products are displayed correctly
  test("verified exact products are kept unchanged in the group", () => {
    const group = buildProductGroup(req, [VERIFIED[demo]]);
    assert.equal(group.products.length, 1);
    assert.deepEqual(group.products[0], VERIFIED[demo]);
    assert.equal(group.products[0].urlType, "exact_product");
    assert.equal(determineUrlType(group.products[0].productUrl), "exact_product");
    assert.ok(ProductGroupSchema.safeParse(group).success, "group must match the API schema");
  });

  // 2. Relevant search URLs survive when exact product verification fails
  test("relevant search links survive when no product verifies", () => {
    const group = buildProductGroup(req, []);
    assert.equal(group.products.length, 0);
    assert.ok((group.retailerSearchLinks?.length ?? 0) > 0, "search links must be kept");
    assert.equal(getGroupDisplayState(group), "links_only");
  });

  // 3. Verified products and search links appear together in the same section
  test("verified products and search links coexist in the same group", () => {
    const group = buildProductGroup(req, [VERIFIED[demo]]);
    assert.equal(group.products.length, 1);
    assert.ok((group.retailerSearchLinks?.length ?? 0) > 0);
    assert.equal(group.category, req.category);
    assert.equal(getGroupDisplayState(group), "products_and_links");
  });

  // 6. Search URLs are never labelled as verified exact products
  test("search links are typed search_result and never enter products", () => {
    const group = buildProductGroup(req, []);
    for (const link of group.retailerSearchLinks ?? []) {
      assert.equal(link.urlType, "search_result");
      assert.equal(determineUrlType(link.url), "search_result");
      assert.ok(!("productName" in link) && !("price" in link) && !("imageUrl" in link) && !("brand" in link),
        "a search link must carry no invented product details");
    }
    assert.equal(group.products.length, 0, "search links must not be converted into product cards");
  });

  // 7/8. Empty state only when both are absent
  test("relevant search links prevent the empty state", () => {
    const group = buildProductGroup(req, []);
    assert.equal(shouldShowEmptyState([], [group]), false);
  });
}

console.log("\n[Discovered listing pages]");

test("girls hair-accessory listing page from search index is kept", () => {
  const req = DEMOGRAPHICS.girls;
  const links = buildRelevantSearchLinks(req, [
    { url: "https://www.firstcry.com/hair-accessories/6/43?gender=girl&q=girls-hair-clips", title: "Girls Hair Clips & Hair Accessories Online" },
  ]);
  assert.equal(links[0]?.source, "discovered");
  assert.equal(links[0]?.retailer, "FirstCry");
});

// 4. Cross-category results are rejected
test("cross-category listing pages are rejected for every category", () => {
  const cases: Array<[RequirementSpec, string, string]> = [
    [DEMOGRAPHICS.girls, "https://www.ajio.com/search/?text=girls%20party%20dress", "Girls Party Dresses"],
    [DEMOGRAPHICS.girls, "https://www.ajio.com/search/?text=girls%20ballerina%20shoes", "Girls Ballerina Shoes"],
    [DEMOGRAPHICS.boys, "https://www.ajio.com/search/?text=boys%20kurta%20pyjama%20set", "Boys Kurta Pyjama Sets"],
    [DEMOGRAPHICS.men, "https://www.ajio.com/search/?text=men%20formal%20shirts", "Men Formal Shirts"],
    [DEMOGRAPHICS.men, "https://www.amazon.in/s?k=men%20leather%20belt", "Men Leather Belts"],
    [DEMOGRAPHICS.women, "https://www.ajio.com/search/?text=women%20block%20heels", "Women Block Heels"],
    [DEMOGRAPHICS.women, "https://www.ajio.com/search/?text=women%20gold%20earrings", "Women Earrings"],
    [spec({ category: "jewellery", itemTitle: "Women Gold Jhumkas", targetGender: "women" }), "https://www.ajio.com/search/?text=women%20anarkali%20kurta", "Women Anarkali Kurtas"],
    [spec({ category: "makeup", itemTitle: "Nude Matte Lipstick", targetGender: "women" }), "https://www.amazon.in/s?k=women%20handbags", "Handbags"],
  ];
  for (const [req, url, title] of cases) {
    assert.equal(isRelevantRetailerSearchLink(url, req, title), false, `${req.category} must reject ${url}`);
    assert.equal(buildRelevantSearchLinks(req, [{ url, title }]).some((l) => l.url === url), false);
  }
});

// 5. Other gender / age group results are rejected
test("other-gender and other-age-group listing pages are rejected", () => {
  const cases: Array<[RequirementSpec, string]> = [
    [DEMOGRAPHICS.girls, "https://www.ajio.com/search/?text=boys%20hair%20accessories"],
    [DEMOGRAPHICS.girls, "https://www.ajio.com/search/?text=women%20hair%20clips"],
    [DEMOGRAPHICS.girls, "https://www.ajio.com/search/?text=hair%20clips"], // no child audience: adult catalogue
    [DEMOGRAPHICS.boys, "https://www.ajio.com/search/?text=men%20ethnic%20mojaris"],
    [DEMOGRAPHICS.boys, "https://www.ajio.com/search/?text=girls%20ethnic%20mojaris"],
    [DEMOGRAPHICS.men, "https://www.ajio.com/search/?text=women%20formal%20shoes"],
    [DEMOGRAPHICS.men, "https://www.ajio.com/search/?text=boys%20formal%20shoes"],
    [DEMOGRAPHICS.women, "https://www.ajio.com/search/?text=men%20floral%20dress"],
    [DEMOGRAPHICS.women, "https://www.ajio.com/search/?text=girls%20floral%20midi%20dress"],
    // children's sections never link to adult-only designer boutiques
    [DEMOGRAPHICS.boys, "https://www.perniaspopupshop.com/search?q=boys%20mojaris"],
  ];
  for (const [req, url] of cases) {
    assert.equal(isRelevantRetailerSearchLink(url, req), false, `${req.targetGender} must reject ${url}`);
  }
});

test("exact product pages, unapproved stores and malformed searches are never search links", () => {
  const req = DEMOGRAPHICS.girls;
  assert.equal(isRelevantRetailerSearchLink(VERIFIED.girls.productUrl, req), false, "a product page is not a search link");
  assert.equal(isRelevantRetailerSearchLink("https://www.randomshop.com/search?q=girls%20hair%20clips", req), false);
  assert.equal(isRelevantRetailerSearchLink("https://www.myntra.com/search?q=girls%20hair%20clips", req), false);
  assert.equal(isRelevantRetailerSearchLink("https://www.ajio.com/search/?text=", req), false);
});

test("irrelevant discovered pages do not prevent the empty state on their own", () => {
  const req = spec({ category: "accessories", itemTitle: "Girls Hair Clips", targetGender: "girls", preferredRetailers: [] });
  const group = buildProductGroup(req, [], [{ url: "https://www.ajio.com/search/?text=boys%20sneakers", title: "Boys Sneakers" }]);
  assert.equal(group.retailerSearchLinks, undefined);
  assert.equal(getGroupDisplayState(group), "empty");
  assert.equal(shouldShowEmptyState([], [group]), true);
});

console.log("\n[Display rules]");

test("display states follow the four fallback rules", () => {
  const link = { retailer: "Myntra", url: "https://www.myntra.com/x?rawQuery=x" };
  assert.equal(getGroupDisplayState({ products: [VERIFIED.women] }), "products");
  assert.equal(getGroupDisplayState({ products: [VERIFIED.women], retailerSearchLinks: [link] }), "products_and_links");
  assert.equal(getGroupDisplayState({ products: [], retailerSearchLinks: [link] }), "links_only");
  assert.equal(getGroupDisplayState({ products: [], retailerSearchLinks: [] }), "empty");
  assert.equal(shouldShowEmptyState([], [{ products: [] }, { products: [], retailerSearchLinks: [link] }]), false);
  assert.equal(shouldShowEmptyState([], [{ products: [] }, { products: [] }]), true);
  assert.equal(shouldShowEmptyState([], []), true);
  assert.equal(shouldShowEmptyState([VERIFIED.men], []), false);
});

console.log("\n[Existing boys regressions]");

const boyProfile: any = {
  name: "Kabir", pronouns: "Kids / Boys styling", gender: "boy", ageGroup: "6–10",
  occasion: "Festival", style: ["Traditional", "Festive"], colorsLove: ["Cream", "Maroon"], budget: "₹1.5K–₹3.5K",
};
const boyLook: any = {
  id: "look-sherwani-02", title: "Boys Festive Sherwani & Churidar", occasion: "Festival",
  note: "Cream embroidered festive sherwani with off-white churidar and a traditional shawl.",
  outfit: "Boys cream embroidered silk festive sherwani with classic off-white churidar and a cream traditional shawl.",
  outfitColor: "Cream", footwear: "Traditional leather mojris", accessories: "None",
  pieces: [
    { category: "Top", name: "Boys Sherwani", detail: "Cream silk embroidered sherwani" },
    { category: "Bottom", name: "Boys Churidar", detail: "Off-white cotton churidar" },
    { category: "Drape", name: "Boys Traditional Shawl", detail: "Cream woven shawl" },
  ],
};

test("boys sherwani / churidar / shawl groups get boys-only, outfit-only search links", () => {
  const specs = planRequirementSpecs(boyLook, boyProfile, "child", ["outfit", "footwear"]);
  const outfitSpecs = specs.filter((s) => s.category === "outfit");
  assert.ok(outfitSpecs.some((s) => s.itemSubcategory === "sherwani"), "sherwani spec must still be planned");
  for (const s of outfitSpecs) {
    const group = buildProductGroup(s, []);
    for (const link of group.retailerSearchLinks ?? []) {
      const decoded = decodeURIComponent(link.url).toLowerCase();
      assert.ok(!/\b(men|women|girls?)\b/.test(decoded.replace(/[-_/?=&]+/g, " ")), `${s.itemTitle}: ${link.url}`);
      assert.ok(!/\b(shoes?|mojaris?|mojris?|footwear)\b/.test(decoded), `${s.itemTitle}: no footwear in outfit links`);
    }
  }
  const shawl = spec({ category: "outfit", itemTitle: "Boys Cream Traditional Shawl", itemSubcategory: "shawl", targetGender: "boys", preferredRetailers: ["Myntra", "FirstCry", "AJIO"] });
  assert.ok((buildProductGroup(shawl, []).retailerSearchLinks?.length ?? 0) > 0, "boys shawl keeps relevant links");
  assert.equal(isRelevantRetailerSearchLink("https://www.ajio.com/search/?text=boys%20bomber%20jacket", shawl, "Boys Bomber Jackets"), false,
    "a jacket listing is not a shawl");
});

console.log("\n[Existing product verification intact]");

test("exact product verification still rejects wrong audience and accepts the right product", () => {
  const specs = planRequirementSpecs(boyLook, boyProfile, "child", ["outfit"]);
  const sherwani = specs.find((s) => s.itemSubcategory === "sherwani")!;
  const ok = checkProductConsistency(
    "Vastramay Boys Cream & Gold Jacquard Sherwani", "Vastramay", "outfit",
    "https://www.myntra.com/sherwani/vastramay/boys-cream-sherwani/23489177/buy",
    undefined, "child", sherwani.itemSubcategory, sherwani.dominantColor, undefined, 1899, "Festival", undefined, "boys", sherwani.itemTitle,
  );
  assert.equal(ok.isConsistent, true, ok.reason);
  const wrongAudience = checkProductConsistency(
    "Vastramay Men Cream Jacquard Sherwani", "Vastramay", "outfit",
    "https://www.myntra.com/sherwani/vastramay/men-cream-sherwani/23489178/buy",
    undefined, "child", sherwani.itemSubcategory, sherwani.dominantColor, undefined, 4999, "Festival", undefined, "boys", sherwani.itemTitle,
  );
  assert.equal(wrongAudience.isConsistent, false, "adult men's sherwani must still be rejected for boys");
  // URL rules are unchanged: search pages are never exact products
  assert.equal(determineUrlType("https://www.ajio.com/search/?text=boys%20sherwani"), "search_result");
  assert.equal(isValidProductUrl("https://www.myntra.com/search?q=sherwani"), false);
});

console.log(`\nAll ${passed} search-link fallback checks passed.`);
