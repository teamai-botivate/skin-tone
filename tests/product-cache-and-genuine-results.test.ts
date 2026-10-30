import assert from "node:assert/strict";
import { logger } from "../src/lib/logger";
logger.level = "fatal";
import {
  buildProductCacheKey,
  extractPriceFromSnippet,
  normalizePrice,
  parseInrAmount,
  searchProductsForLook,
  verifyProductPage,
} from "../src/lib/product-search";
import { generateFallbackLooks } from "../src/features/recommendations/services/recommendation-engine";
import {
  clearClientProductCache,
  getProductRecommendations,
} from "../src/features/shopping/services/product-recommendations";
import type { LookRecommendation, ProductResult, SkinTuneProfile } from "../src/lib/skintune-schemas";

console.log("======================================================================");
console.log("REGRESSION TEST SUITE: PRODUCT CACHE FINGERPRINT & GENUINE-ONLY RESULTS");
console.log("======================================================================");

// Make sure no real provider is ever contacted by this suite
const savedEnv = { openai: process.env.OPENAI_API_KEY, tavily: process.env.TAVILY_API_KEY };
delete process.env.OPENAI_API_KEY;
delete process.env.TAVILY_API_KEY;

const baseProfile = {
  name: "Ananya",
  pronouns: "she/her/women",
  gender: "female",
  ageGroup: "25–34",
  height: "5'4\"",
  photoUrl: "",
  bodyPhotoUrl: "",
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 95, contrast: "High" },
  bodyBuild: "",
  fit: "",
  style: ["Traditional", "Indo-Western"],
  colorsLove: ["Pink", "Gold"],
  colorsAvoid: ["Neon Green"],
  restrictions: [],
  occasion: "Garba Night",
  impression: ["Festive", "Joyful"],
  budget: "₹3K–₹7K",
  customStyleNotes: "",
} as SkinTuneProfile;

const baseLook = generateFallbackLooks(baseProfile)[0] as LookRecommendation;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const withProfile = (patch: Partial<SkinTuneProfile>) => ({ ...clone(baseProfile), ...patch }) as SkinTuneProfile;
const withLook = (patch: Partial<LookRecommendation>) => ({ ...clone(baseLook), ...patch }) as LookRecommendation;

// -----------------------------------------------------------------------------
// Test 1: Identical inputs produce the same cache key
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Identical recommendation inputs share a cache key...");
const baseKey = buildProductCacheKey(baseLook, baseProfile, "all");
assert.equal(buildProductCacheKey(clone(baseLook), clone(baseProfile), "all"), baseKey, "Deep-equal inputs must reuse the key");
assert.equal(buildProductCacheKey(baseLook, baseProfile, undefined), baseKey, "Missing category behaves like 'all'");
assert.equal(
  buildProductCacheKey(baseLook, withProfile({ colorsLove: ["Gold", "Pink"] }), "all"),
  baseKey,
  "Reordering an order-insensitive color list must not bust the cache",
);
assert.ok(baseKey.startsWith("v10:"), "Cache key must carry the bumped cache version");
console.log("✓ Test 1 Passed");

// -----------------------------------------------------------------------------
// Test 2: Every material input change produces a different cache key
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Material input changes invalidate the cache key...");
const variations: Array<[string, string]> = [
  ["gender", buildProductCacheKey(baseLook, withProfile({ gender: "male" }), "all")],
  ["pronouns/audience", buildProductCacheKey(baseLook, withProfile({ pronouns: "he/him/men" }), "all")],
  ["age group", buildProductCacheKey(baseLook, withProfile({ ageGroup: "6–10" }), "all")],
  ["budget", buildProductCacheKey(baseLook, withProfile({ budget: "Under ₹2K" }), "all")],
  ["occasion", buildProductCacheKey(baseLook, withProfile({ occasion: "Wedding Reception" }), "all")],
  ["style", buildProductCacheKey(baseLook, withProfile({ style: ["Minimalist"] }), "all")],
  ["style order (first style is used)", buildProductCacheKey(baseLook, withProfile({ style: ["Indo-Western", "Traditional"] }), "all")],
  ["colors loved", buildProductCacheKey(baseLook, withProfile({ colorsLove: ["Emerald Green"] }), "all")],
  ["colors avoided", buildProductCacheKey(baseLook, withProfile({ colorsAvoid: ["Pink"] }), "all")],
  ["impression", buildProductCacheKey(baseLook, withProfile({ impression: ["Powerful"] }), "all")],
  ["skin tone", buildProductCacheKey(baseLook, withProfile({ appearance: { ...baseProfile.appearance, skinTone: "Deep" } }), "all")],
  ["undertone", buildProductCacheKey(baseLook, withProfile({ appearance: { ...baseProfile.appearance, undertone: "Cool" } }), "all")],
  ["outfit", buildProductCacheKey(withLook({ outfit: "Ivory chikankari anarkali with gota dupatta" }), baseProfile, "all")],
  ["outfit color", buildProductCacheKey(withLook({ outfitColor: "Ivory" }), baseProfile, "all")],
  ["palette", buildProductCacheKey(withLook({ palette: ["#000000"] }), baseProfile, "all")],
  ["pieces", buildProductCacheKey(withLook({ pieces: [{ category: "outfit", name: "Anarkali", detail: "Ivory" }] }), baseProfile, "all")],
  ["footwear", buildProductCacheKey(withLook({ footwear: "Block heels" }), baseProfile, "all")],
  ["jewellery", buildProductCacheKey(withLook({ jewellery: "Pearl studs" }), baseProfile, "all")],
  ["accessories", buildProductCacheKey(withLook({ accessories: "Clutch" }), baseProfile, "all")],
  ["category", buildProductCacheKey(baseLook, baseProfile, "footwear")],
  ["look id", buildProductCacheKey(withLook({ id: "another-look" }), baseProfile, "all")],
];
for (const [label, key] of variations) {
  assert.notEqual(key, baseKey, `Changing ${label} must produce a different cache key`);
}
assert.equal(new Set(variations.map(([, k]) => k)).size, variations.length, "Each variation must map to its own key");
console.log(`✓ Test 2 Passed: ${variations.length} input changes each produce a distinct key`);

// -----------------------------------------------------------------------------
// Test 3: Irrelevant/unstable values do not disable caching; missing values are safe
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Irrelevant inputs keep the key stable and missing values are safe...");
assert.equal(buildProductCacheKey(baseLook, withProfile({ name: "Someone Else" }), "all"), baseKey, "Name is irrelevant");
assert.equal(buildProductCacheKey(baseLook, withProfile({ photoUrl: "data:image/png;base64,AAAA" }), "all"), baseKey, "Photo is irrelevant");
assert.equal(buildProductCacheKey(baseLook, withProfile({ height: "6'0\"" }), "all"), baseKey, "Height is irrelevant");
const imgA = buildProductCacheKey(withLook({ imageUrl: "data:image/png;base64,AAAA" }), baseProfile, "all");
const imgB = buildProductCacheKey(withLook({ imageUrl: "data:image/png;base64,BBBB" }), baseProfile, "all");
assert.equal(imgA, imgB, "Regenerated image data must not bust the cache (only image presence matters)");

const sparseLook = { id: "sparse", title: "Sparse" } as LookRecommendation;
const sparseKey = buildProductCacheKey(sparseLook, {} as SkinTuneProfile);
assert.equal(sparseKey, buildProductCacheKey(clone(sparseLook), {} as SkinTuneProfile), "Sparse inputs must be deterministic");
assert.notEqual(
  buildProductCacheKey(sparseLook, { budget: "Under ₹2K" } as SkinTuneProfile),
  sparseKey,
  "Sparse inputs still distinguish provided values",
);
console.log("✓ Test 3 Passed");

async function main() {
  // -----------------------------------------------------------------------------
  // Test 4: No live results -> no fabricated/benchmark products, empty groups retained
  // -----------------------------------------------------------------------------
  console.log("\n[Test 4] Insufficient search results never produce fabricated products...");
  const offline = await searchProductsForLook(withLook({ id: "offline-look" }), baseProfile, "all", true);
  assert.equal(offline.products.length, 0, `Expected zero products without live search, got ${offline.products.length}`);
  assert.equal(offline.totalFound, 0);
  assert.equal(offline.status, "partial", "UI must receive the insufficient-results status");
  assert.ok((offline.groups || []).length > 0, "Planned groups are retained so the UI can show 'no verified match'");
  for (const g of offline.groups || []) {
    assert.equal(g.products.length, 0, `Group ${g.recommendedItemTitle} must not be padded with static products`);
  }
  console.log("✓ Test 4 Passed: empty, honest response with planned groups and no padding");

  // -----------------------------------------------------------------------------
  // Fetch stub simulating a genuine Tavily search plus retailer product pages
  // -----------------------------------------------------------------------------
  type StubResult = { url: string; title: string; content: string };
  type StubPage = { name: string; brand: string; price: number; availability?: string };

  let searchResults: StubResult[] = [];
  let productPages: Record<string, StubPage> = {};
  let tavilyCalls = 0;
  let pageCalls = 0;
  const realFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://api.tavily.com/")) {
      tavilyCalls++;
      return new Response(JSON.stringify({ results: searchResults, images: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    pageCalls++;
    const page = productPages[url];
    if (!page) return new Response("Not here", { status: 404 });
    const jsonLd = {
      "@type": "Product",
      name: page.name,
      brand: { name: page.brand },
      offers: { price: String(page.price), priceCurrency: "INR", availability: page.availability ?? "https://schema.org/InStock" },
    };
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
  }) as typeof fetch;
  process.env.TAVILY_API_KEY = "tvly-test-stub-key-not-real";

  const assertGenuine = (p: ProductResult) => {
    assert.equal(p.source, "live_search", `Product ${p.productName} must come from live search`);
    assert.ok(!p.id.startsWith("bench-"), "Benchmark ids must never appear");
    assert.ok(p.productUrl in productPages, `Product URL must be one returned by the retailer search: ${p.productUrl}`);
  };

  try {
    // ---------------------------------------------------------------------------
    // Test 5: Genuine search results are verified and returned (no padding)
    // ---------------------------------------------------------------------------
    console.log("\n[Test 5] Genuine retailer search results still work end-to-end...");
    const myntraUrl = "https://www.myntra.com/flats/mochi/mochi-women-pink-embroidered-ethnic-juttis/24567890/buy";
    const ajioUrl = "https://www.ajio.com/fabindia-women-embroidered-leather-juttis/p/466123456_pink";
    searchResults = [
      { url: myntraUrl, title: "Buy Mochi Women Pink Embroidered Ethnic Juttis | Myntra", content: "Rs. 1,499 handcrafted mojaris" },
      { url: ajioUrl, title: "Fabindia Women Embroidered Leather Juttis", content: "Punjabi jutti ₹1,890" },
    ];
    productPages = {
      [myntraUrl]: { name: "Mochi Women Pink Embroidered Ethnic Juttis", brand: "Mochi", price: 1599 },
      [ajioUrl]: { name: "Fabindia Women Embroidered Leather Juttis", brand: "Fabindia", price: 1890 },
    };

    const genuineLook = withLook({ id: "genuine-look" });
    const genuine = await searchProductsForLook(genuineLook, baseProfile, "footwear");
    assert.ok(genuine.products.length > 0, "Verified retailer results must be returned");
    assert.ok(genuine.products.length <= searchResults.length, "Never more products than genuine search results");
    for (const p of genuine.products) assertGenuine(p);
    const myntraProduct = genuine.products.find((p) => p.productUrl === myntraUrl);
    assert.ok(myntraProduct, "The verified Myntra search result must be returned");
    assert.equal(myntraProduct.price, 1599, "Displayed price must be the page-verified price");
    assert.equal(myntraProduct.priceVerified, true);
    assert.equal(myntraProduct.productVerified, true);
    console.log(`✓ Test 5 Passed: ${genuine.products.length} verified product(s), all from live search`);

    // ---------------------------------------------------------------------------
    // Test 6: Identical request reuses cache; changed input triggers a new search
    // ---------------------------------------------------------------------------
    console.log("\n[Test 6] Cache reuse for identical inputs and refresh for changed inputs...");
    const callsBefore = tavilyCalls;
    const again = await searchProductsForLook(clone(genuineLook), clone(baseProfile), "footwear");
    assert.equal(tavilyCalls, callsBefore, "Identical inputs must be served from cache without searching");
    assert.strictEqual(again, genuine, "Cached response must be reused");

    const changedBudget = await searchProductsForLook(genuineLook, withProfile({ budget: "₹7K–₹10K" }), "footwear");
    assert.ok(tavilyCalls > callsBefore, "Budget change must trigger a fresh search");
    assert.notStrictEqual(changedBudget, genuine);

    const callsAfterBudget = tavilyCalls;
    await searchProductsForLook(genuineLook, withProfile({ colorsAvoid: ["Black"] }), "footwear");
    assert.ok(tavilyCalls > callsAfterBudget, "Avoided-color change must trigger a fresh search");
    console.log("✓ Test 6 Passed");

    // ---------------------------------------------------------------------------
    // Test 7: Unverifiable (404) results are dropped, not replaced with static products
    // ---------------------------------------------------------------------------
    console.log("\n[Test 7] Unverifiable results are dropped without static replacements...");
    const deadUrl = "https://www.myntra.com/flats/mochi/mochi-women-gold-ethnic-juttis/99999999/buy";
    searchResults = [{ url: deadUrl, title: "Mochi Women Gold Ethnic Juttis", content: "Rs. 1,299" }];
    productPages = {};
    const dead = await searchProductsForLook(withLook({ id: "dead-look" }), baseProfile, "footwear");
    assert.equal(dead.products.length, 0, "A 404 product page must not be replaced by benchmark products");
    assert.equal(dead.status, "partial");
    console.log("✓ Test 7 Passed");

    // ---------------------------------------------------------------------------
    // Test 8: Search result without a snippet price is not given an invented price
    // ---------------------------------------------------------------------------
    console.log("\n[Test 8] Missing prices are never filled with benchmark prices...");
    const noPriceUrl = "https://www.ajio.com/fabindia-women-pink-embroidered-juttis/p/466999888_pink";
    searchResults = [{ url: noPriceUrl, title: "Fabindia Women Pink Embroidered Juttis", content: "Handcrafted mojaris" }];
    productPages = {};
    // Page blocked by bot protection: product stays, but price must be unknown, not fabricated
    const blockedFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === noPriceUrl) return new Response("", { status: 403 });
      return blockedFetch(input, init);
    }) as typeof fetch;
    const noPrice = await searchProductsForLook(withLook({ id: "no-price-look" }), baseProfile, "footwear");
    globalThis.fetch = blockedFetch;
    assert.equal(noPrice.products.length, 1, "The genuine (bot-restricted) search result is kept, with nothing added");
    for (const p of noPrice.products) {
      assert.equal(p.source, "live_search");
      assert.equal(p.productUrl, noPriceUrl, "Only the URL returned by the retailer search may appear");
      assert.equal(p.price, undefined, `Unverified product must not show an invented price (got ${p.price})`);
      assert.equal(p.formattedPrice, undefined);
      assert.equal(p.priceVerified, false);
      assert.equal(p.isVerified, false);
      assert.equal(p.availability, undefined);
    }
    console.log(`✓ Test 8 Passed (${noPrice.products.length} restricted-page product(s) checked)`);
  } finally {
    globalThis.fetch = realFetch;
    if (savedEnv.openai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedEnv.openai;
    if (savedEnv.tavily === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = savedEnv.tavily;
  }

  // ---------------------------------------------------------------------------
  // Test 9: Client cache uses the same fingerprint (no stale results across profile edits)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 9] Client-side product cache follows the same invalidation rules...");
  let apiCalls = 0;
  globalThis.fetch = (async () => {
    apiCalls++;
    const body = {
      lookId: baseLook.id,
      persona: "woman",
      applicableCategories: ["footwear"],
      products: [{ id: `p-${apiCalls}`, category: "footwear", subcategory: "Juttis", brand: "B", productName: "N", retailer: "R", productUrl: "https://www.myntra.com/x/1/buy", matchReason: "m" }],
      status: "success",
      searchedAt: new Date().toISOString(),
      totalFound: 1,
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    clearClientProductCache();
    const first = await getProductRecommendations(baseLook, baseProfile, "footwear");
    const second = await getProductRecommendations(clone(baseLook), clone(baseProfile), "footwear");
    assert.equal(apiCalls, 1, "Identical inputs must be served from the client cache");
    assert.strictEqual(second, first);

    await getProductRecommendations(baseLook, withProfile({ budget: "Under ₹2K" }), "footwear");
    assert.equal(apiCalls, 2, "Budget change must bypass the client cache");
    await getProductRecommendations(baseLook, withProfile({ gender: "male", pronouns: "he/him/men" }), "footwear");
    assert.equal(apiCalls, 3, "Gender/audience change must bypass the client cache");
    await getProductRecommendations(withLook({ outfitColor: "Ivory" }), baseProfile, "footwear");
    assert.equal(apiCalls, 4, "Outfit detail change must bypass the client cache");
    await getProductRecommendations(baseLook, baseProfile, "outfit");
    assert.equal(apiCalls, 5, "Category change must bypass the client cache");
    console.log("✓ Test 9 Passed");
  } finally {
    globalThis.fetch = realFetch;
    clearClientProductCache();
  }

  // ---------------------------------------------------------------------------
  // Test 10: INR price parsing keeps every meaningful digit
  // ---------------------------------------------------------------------------
  console.log("\n[Test 10] INR price parsing handles comma, no-comma, decimal and invalid formats...");
  const snippetCases: Array<[string, number | undefined]> = [
    ["Rs. 1499", 1499],
    ["Rs.1499", 1499],
    ["Rs 1499/-", 1499],
    ["Rs. 1,499", 1499],
    ["₹1499", 1499],
    ["₹1,499", 1499],
    ["₹ 1,499.00", 1499],
    ["₹1,499.50", 1500],
    ["INR 1,49,999", 149999],
    ["MRP: Rs. 3,299", 3299],
    ["Price: 2499", 2499],
    ["1499 INR", 1499],
    ["Mochi Juttis Rs. 1499 handcrafted", 1499],
    ["Buy now at ₹2,199. Free shipping", 2199],
    ["Rs. abc", undefined],
    ["₹0", undefined],
    ["Rs. 12", undefined], // below the existing ₹99 sanity floor
    ["₹12,34,56,789", undefined], // above the existing ₹2.5L ceiling
    ["Rs. 1499.999", undefined], // malformed amount
    ["size 32 waist", undefined],
    ["", undefined],
  ];
  for (const [input, expected] of snippetCases) {
    assert.equal(extractPriceFromSnippet(input), expected, `extractPriceFromSnippet(${JSON.stringify(input)})`);
  }
  assert.equal(normalizePrice("Rs. 1,499").price, 1499, "normalizePrice must not read 'Rs. 1,499' as .1499");
  assert.equal(normalizePrice("₹1499").formattedPrice, "₹1,499");
  assert.equal(normalizePrice("Size 8 | ₹999").price, 999, "Currency-marked amount wins over other numbers");
  assert.equal(normalizePrice(1499).price, 1499);
  assert.deepEqual(normalizePrice("not a price"), {});
  assert.deepEqual(normalizePrice(null), {});
  assert.equal(parseInrAmount("1,49,999.00"), 149999);
  assert.equal(parseInrAmount("1.499"), undefined, "European-style thousands are not silently misread");

  // Page-level verified prices (JSON-LD and og:price) must also keep comma-grouped digits
  const pageFetch = globalThis.fetch;
  const pageHtml: Record<string, string> = {
    "https://www.myntra.com/a/1/buy": `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Women Pink Juttis", offers: { price: "Rs. 1,499" } })}</script>`,
    "https://www.myntra.com/b/2/buy": `<meta property="og:price:amount" content="2,199.00">`,
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new Response(pageHtml[url] ?? "", { status: pageHtml[url] ? 200 : 404 });
  }) as typeof fetch;
  try {
    assert.equal((await verifyProductPage("https://www.myntra.com/a/1/buy")).price, 1499, "JSON-LD 'Rs. 1,499'");
    assert.equal((await verifyProductPage("https://www.myntra.com/b/2/buy")).price, 2199, "og:price:amount '2,199.00'");
  } finally {
    globalThis.fetch = pageFetch;
  }
  console.log(`✓ Test 10 Passed: ${snippetCases.length} snippet formats plus normalize/page parsing`);

  // ---------------------------------------------------------------------------
  // Test 11: Provider failure is distinguishable from a genuine absence of products
  // ---------------------------------------------------------------------------
  console.log("\n[Test 11] Search-provider failure is reported, not disguised as 'no products'...");
  process.env.TAVILY_API_KEY = "tvly-test-stub-key-not-real";
  let tavilyMode: "quota" | "empty" = "quota";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://api.tavily.com/")) {
      return tavilyMode === "quota"
        ? new Response(JSON.stringify({ detail: { error: "This request exceeds your plan's set usage limit." } }), { status: 432 })
        : new Response(JSON.stringify({ results: [], images: [] }), { status: 200 });
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
  try {
    const quota = await searchProductsForLook(withLook({ id: "quota-look" }), baseProfile, "footwear");
    const tvDiag = quota.diagnostics?.find((d) => d.keyName === "TAVILY_API_KEY");
    assert.equal(quota.products.length, 0, "No products may be invented when the provider fails");
    assert.ok(tvDiag, "Tavily failure must be reported in diagnostics");
    assert.equal(tvDiag.status, "rate_limited", "HTTP 432 plan limit is classified as rate_limited");
    assert.ok(tvDiag.message.includes("432") && tvDiag.message.includes("usage limit"), "Provider's reason is preserved");

    tavilyMode = "empty";
    const empty = await searchProductsForLook(withLook({ id: "empty-look" }), baseProfile, "footwear");
    assert.equal(empty.products.length, 0);
    assert.ok(
      !empty.diagnostics?.some((d) => d.keyName === "TAVILY_API_KEY"),
      "A healthy search with no matches must not be reported as a Tavily failure",
    );
  } finally {
    globalThis.fetch = realFetch;
    if (savedEnv.tavily === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = savedEnv.tavily;
  }
  console.log("✓ Test 11 Passed");

  console.log("\n======================================================================");
  console.log("ALL PRODUCT CACHE & GENUINE-RESULT TESTS PASSED");
  console.log("======================================================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
