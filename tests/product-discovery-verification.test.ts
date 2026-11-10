import assert from "node:assert/strict";
import { logger } from "../src/lib/logger";
import {
  buildDiscoveryQuery,
  checkProductConsistency,
  detectPersona,
  determineUrlType,
  getApplicableCategories,
  parseAmazonProductPage,
  planRequirementSpecs,
  searchProductsForLook,
  verifyProductPage,
} from "../src/lib/product-search";
import { generateFallbackLooks } from "../src/features/recommendations/services/recommendation-engine";
import type { LookRecommendation, SkinTuneProfile } from "../src/lib/skintune-schemas";
logger.level = "fatal";

console.log("======================================================================");
console.log("REGRESSION TEST SUITE: JEWELLERY & FOOTWEAR DISCOVERY + VERIFICATION");
console.log("======================================================================");

// Fully offline. Retailer pages are small synthetic fixtures that reproduce the markup
// observed on real pages (Myntra/GIVA JSON-LD, Amazon's product elements, bot blocks).
// Provider calls are mocked; any unexpected request fails the test.
process.env.OPENAI_API_KEY = "sk-test-stub-key-not-real";
process.env.TAVILY_API_KEY = "tvly-test-stub-key-not-real";

// ---------------------------------------------------------------------------
// Retailer page fixtures
// ---------------------------------------------------------------------------
const MYNTRA_STUD = "https://www.myntra.com/earrings/giva/giva-925-sterling-silver-gold-plated-contemporary-studs/24389998/buy";
const AMAZON_STUD = "https://www.amazon.in/dp/B0C9X2LQ7M";
const GIVA_STUD = "https://www.giva.co/products/golden-everyday-studs";
const AJIO_STUD = "https://www.ajio.com/accessorize-london-gold-toned-circular-studs/p/469580217_gold";
const NYKAA_FASHION_STUD = "https://www.nykaafashion.com/gold-toned-dainty-studs/p/9876543";
const MYNTRA_LISTING = "https://www.myntra.com/gold-stud-earrings";
const MYNTRA_HEELS_AS_JEWELLERY = "https://www.myntra.com/heels/dressberry/dressberry-women-gold-toned-heeled-sandals/31985698/buy";
const DEAD_MYNTRA_STUD = "https://www.myntra.com/earrings/minutiae/minutiae-gold-toned-tiny-studs/15910681/buy";

const AMAZON_HEELS = "https://www.amazon.in/dp/B0BRG5YRFQ";
const MYNTRA_HEELS = "https://www.myntra.com/heels/dressberry/dressberry-women-open-toe-block-heel-sandals/31985698/buy";
const MYNTRA_EARRING_AS_FOOTWEAR = "https://www.myntra.com/earrings/giva/giva-gold-plated-studs/24389990/buy";

const jsonLdProduct = (name: string, brand: string, price: string, image: string, attrs = "") =>
  `<script${attrs} type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": ["Product"],
    name,
    brand: { "@type": "Brand", name: brand },
    image: [image],
    offers: { "@type": "Offer", price, priceCurrency: "INR", availability: "https://schema.org/InStock" },
  })}</script>`;

const amazonPage = (title: string, price: string, mrp: string, brand: string) => `
<html><body>
<div id="sponsored"><span class="a-price-whole">99</span></div>
<div id="bylineInfo_feature_div"><div id="bylineInfo" class="a-section">
</div><a id="bylineInfo" class="a-link-normal" href="/stores/x">Visit the ${brand} Store</a></div>
<span id="productTitle" class="a-size-large product-title-word-break">        ${title}       </span>
<div id="corePriceDisplay_desktop_feature_div" class="celwidget">
  <span class="a-price aok-align-center"><span class="a-offscreen">₹${price}</span><span class="a-price-whole">${price}</span></span>
  <span class="a-price a-text-price" data-a-size="s" data-a-strike="true" data-a-color="secondary"><span class="a-offscreen">₹${mrp}</span></span>
</div>
<img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/real-main.jpg">
<div id="availability" class="a-section"><span class="a-size-medium a-color-success">In stock</span></div>
</body></html>`;

let giva429Remaining = 1;
const pages: Record<string, () => { status: number; html: string }> = {
  // Single-quoted, attribute-first JSON-LD tag: the old exact-match regex missed this form
  [MYNTRA_STUD]: () => ({
    status: 200,
    html: jsonLdProduct("GIVA 925 Sterling Silver Gold-Plated Contemporary Studs Earrings", "GIVA", "759", "https://assets.myntassets.com/studs.jpg", ' id="pdp-ld"').replace(
      'type="application/ld+json"',
      "type='application/ld+json'",
    ),
  }),
  [AMAZON_STUD]: () => ({ status: 200, html: amazonPage("PALMONAS 18k Gold Plated Simple Stud Earrings for Women", "1,299", "2,599", "PALMONAS") }),
  // Shopify store rate-limits a burst of parallel requests once, then serves the page
  [GIVA_STUD]: () =>
    giva429Remaining-- > 0
      ? { status: 429, html: "Too Many Requests" }
      : { status: 200, html: jsonLdProduct("Golden Everyday Studs", "GIVA", "999.00", "https://www.giva.co/cdn/shop/files/studs.jpg") },
  [AJIO_STUD]: () => ({ status: 403, html: "Access Denied" }),
  [NYKAA_FASHION_STUD]: () => ({ status: 503, html: "Service Unavailable" }),
  [DEAD_MYNTRA_STUD]: () => ({ status: 404, html: "Page Not Found" }),
  [AMAZON_HEELS]: () => ({ status: 200, html: amazonPage("Women Gold-Toned Heeled Sandals", "1,149", "2,299", "Shoetopia") }),
  [MYNTRA_HEELS]: () => ({ status: 200, html: jsonLdProduct("DressBerry Women Open Toe Block Heel Sandals", "DressBerry", "950", "https://assets.myntassets.com/heels.jpg") }),
};
const fetchedPages: string[] = [];

// ---------------------------------------------------------------------------
// Provider mocks
// ---------------------------------------------------------------------------
const openaiBodies: any[] = [];
let openaiPlan: (body: any) => { products: Array<Record<string, string>>; citations: Array<{ url: string; title: string }> } = () => ({ products: [], citations: [] });

const openaiResponse = (text: string, citations: Array<{ url: string; title: string }>) =>
  new Response(
    JSON.stringify({
      id: "resp_test",
      object: "response",
      status: "completed",
      model: "gpt-4o-mini",
      output: [
        { id: "ws_test", type: "web_search_call", status: "completed", action: { type: "search", query: "q" } },
        {
          id: "msg_test",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{
            type: "output_text",
            text,
            annotations: citations.map((c) => ({ type: "url_citation", url: c.url, title: c.title, start_index: 0, end_index: 1 })),
          }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("api.tavily.com")) {
    return new Response(JSON.stringify({ detail: { error: "This request exceeds your plan's set usage limit." } }), { status: 432 });
  }
  if (url.endsWith("/responses")) {
    const body = JSON.parse(String(init?.body));
    openaiBodies.push(body);
    const { products, citations } = openaiPlan(body);
    return openaiResponse(JSON.stringify({ products }), citations);
  }
  const page = pages[url];
  if (!page) throw new Error(`Unexpected request: ${url}`);
  fetchedPages.push(url);
  const { status, html } = page();
  return new Response(html, { status, headers: { "Content-Type": "text/html" } });
}) as typeof fetch;

// Capture the structured rejection logs
const rejectionLogs: any[] = [];
const originalWarn = logger.warn.bind(logger);
(logger as any).warn = (obj: any, msg?: string) => {
  if (msg === "Product candidate rejected") rejectionLogs.push(obj);
  return originalWarn(obj, msg);
};

// ---------------------------------------------------------------------------
const profile = {
  name: "Ananya", pronouns: "she/her/women", gender: "female", ageGroup: "25–34", height: "",
  photoUrl: "", bodyPhotoUrl: "",
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 95, contrast: "High" },
  bodyBuild: "", fit: "", style: ["Minimal"], colorsLove: ["Gold"], colorsAvoid: [], restrictions: [],
  occasion: "Office", impression: [], budget: "₹3K–₹7K", customStyleNotes: "",
} as SkinTuneProfile;
const lookFor = (id: string): LookRecommendation => {
  const base = JSON.parse(JSON.stringify(generateFallbackLooks(profile)[0]));
  base.pieces = (base.pieces || []).filter((p: any) => !/jewel|foot|shoe|earring/i.test(p.category || ""));
  return { ...base, id, jewellery: "Simple gold studs", footwear: "Gold block heels" };
};

async function main() {
  // -------------------------------------------------------------------------
  console.log("\n[Test 1] Search queries carry product keywords, not store names / boolean OR...");
  const jq = buildDiscoveryQuery({ searchQuery: "women minimal gold stud earrings GIVA OR Myntra OR Nykaa", itemTitle: "Simple gold studs" });
  assert.equal(jq, "women minimal gold stud earrings GIVA", "Store names and OR removed; brand kept");
  assert.equal(buildDiscoveryQuery({ searchQuery: "women Gold block heels Myntra AJIO", itemTitle: "x" }), "women Gold block heels");
  assert.equal(buildDiscoveryQuery({ searchQuery: "Myntra AJIO", itemTitle: "Simple gold studs" }), "Simple gold studs", "Never empty");
  console.log("✓ Test 1 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 2] Product-page URL patterns for approved stores; listing pages are not products...");
  for (const url of [MYNTRA_STUD, AMAZON_STUD, GIVA_STUD, AJIO_STUD, NYKAA_FASHION_STUD]) {
    assert.equal(determineUrlType(url), "exact_product", url);
  }
  for (const url of [MYNTRA_LISTING, "https://www.giva.co/collections/studs", "https://www.nykaafashion.com/jewellery/earrings/c/1234"]) {
    assert.equal(determineUrlType(url), "search_result", url);
  }
  console.log("✓ Test 2 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 3] Amazon product pages are read from Amazon's own product elements...");
  const amz = parseAmazonProductPage(amazonPage("PALMONAS 18k Gold Plated Simple Stud Earrings for Women", "1,299", "2,599", "PALMONAS"));
  assert.equal(amz.productName, "PALMONAS 18k Gold Plated Simple Stud Earrings for Women");
  assert.equal(amz.price, 1299, "Buy-box price, not the ₹99 sponsored price elsewhere on the page");
  assert.equal(amz.originalPrice, 2599);
  assert.equal(amz.brand, "PALMONAS", "Brand from the byline link, not its empty wrapper");
  assert.equal(amz.imageUrl, "https://m.media-amazon.com/images/I/real-main.jpg");
  assert.equal(amz.unavailable, false);
  assert.deepEqual(parseAmazonProductPage("<html>no product</html>"), {}, "No title -> no product evidence");
  const amzVerify = await verifyProductPage(AMAZON_STUD);
  assert.equal(amzVerify.success, true, "Genuine Amazon page now verifies (was: 'Could not find reliable product details')");
  assert.equal(amzVerify.price, 1299);
  assert.equal(amzVerify.httpStatus, 200);
  console.log("✓ Test 3 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 4] Verifier: loose JSON-LD tags, 429 retry, bot blocks, and listing pages...");
  const myntraVerify = await verifyProductPage(MYNTRA_STUD);
  assert.equal(myntraVerify.success, true, "Single-quoted JSON-LD tag with @type array is parsed");
  assert.equal(myntraVerify.price, 759);
  giva429Remaining = 1;
  const givaVerify = await verifyProductPage(GIVA_STUD);
  assert.equal(givaVerify.success, true, "One short rate-limit response is retried");
  assert.equal(givaVerify.price, 999);
  const ajioVerify = await verifyProductPage(AJIO_STUD);
  assert.equal(ajioVerify.retailerRestricted, true);
  assert.equal(ajioVerify.httpStatus, 403);
  pages[MYNTRA_LISTING] = () => ({
    status: 200,
    html: `<meta property="og:title" content="Gold Stud Earrings - Buy Gold Stud Earrings online in India"><meta property="og:image" content="https://x/banner.jpg">`,
  });
  const listingVerify = await verifyProductPage(MYNTRA_LISTING);
  assert.equal(listingVerify.success, false, "A category page with only og: tags is NOT a verified product");
  assert.match(listingVerify.reason ?? "", /no structured product data/i);
  delete pages[MYNTRA_LISTING];
  console.log("✓ Test 4 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 5] Footwear category validation: 'Heeled' titles are heels; no cross-category leaks...");
  const heeled = checkProductConsistency("Women Gold-Toned Heeled Sandals", "Shoetopia", "footwear", AMAZON_HEELS, undefined, "woman", "heels", undefined, undefined, 1149, "Office", undefined, "women");
  assert.equal(heeled.isConsistent, true, `Heeled sandals on an Amazon /dp/ URL are heels (${heeled.reason})`);
  assert.equal(checkProductConsistency("GIVA Gold Plated Studs Earrings", "GIVA", "footwear", MYNTRA_EARRING_AS_FOOTWEAR, undefined, "woman", "heels", undefined, undefined, 999, "Office", undefined, "women").isConsistent, false, "Jewellery is never footwear");
  assert.equal(checkProductConsistency("Women Gold-Toned Heeled Sandals", "DressBerry", "jewellery", MYNTRA_HEELS_AS_JEWELLERY, undefined, "woman", "earrings", undefined, undefined, 899, "Office", undefined, "women").isConsistent, false, "Footwear is never jewellery");
  assert.equal(checkProductConsistency("Men Brown Formal Derby Shoes", "X", "footwear", "https://www.amazon.in/dp/B0AAAAAAAA", undefined, "woman", "heels", undefined, undefined, 1999, "Office", undefined, "women").isConsistent, false, "Gender matching preserved");
  console.log("✓ Test 5 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 6] 'Simple gold studs': Tavily 432 -> OpenAI fallback -> verified products, every rejection explained...");
  openaiBodies.length = 0;
  rejectionLogs.length = 0;
  fetchedPages.length = 0;
  giva429Remaining = 1;
  openaiPlan = () => ({
    products: [
      { pageUrl: MYNTRA_STUD, title: "GIVA Gold-Plated Contemporary Studs Earrings", brand: "GIVA", retailer: "Myntra" },
      { pageUrl: AMAZON_STUD, title: "PALMONAS Gold Plated Simple Stud Earrings", brand: "PALMONAS", retailer: "Amazon" },
      { pageUrl: GIVA_STUD, title: "Golden Everyday Studs", brand: "GIVA", retailer: "GIVA" },
      // Bot-blocked, but the URL is a web_search citation -> shown, clearly unverified
      { pageUrl: AJIO_STUD, title: "Accessorize London Gold-Toned Circular Studs", brand: "Accessorize London", retailer: "AJIO" },
      // Bot-blocked and only in the model's text -> cannot be confirmed, rejected
      { pageUrl: NYKAA_FASHION_STUD, title: "Gold-Toned Dainty Studs", brand: "Nykaa Fashion", retailer: "Nykaa Fashion" },
      // A category page, not a product
      { pageUrl: MYNTRA_LISTING, title: "Gold Stud Earrings", brand: "Myntra", retailer: "Myntra" },
      // Wrong category: footwear suggested for jewellery
      { pageUrl: MYNTRA_HEELS_AS_JEWELLERY, title: "DressBerry Women Gold-Toned Heeled Sandals", brand: "DressBerry", retailer: "Myntra" },
      // Hallucinated / dead page
      { pageUrl: DEAD_MYNTRA_STUD, title: "MINUTIAE Gold-Toned Tiny Studs Earrings", brand: "MINUTIAE", retailer: "Myntra" },
    ],
    citations: [{ url: AJIO_STUD, title: "Buy Accessorize London Gold-Toned Circular Studs | AJIO" }],
  });
  const jewellery = await searchProductsForLook(lookFor("look-studs"), profile, "jewellery", true);
  const group = jewellery.groups?.find((g) => g.recommendedItemTitle === "Simple gold studs");
  assert.ok(group, "Simple gold studs group planned");
  const byUrl = new Map(group!.products.map((p) => [p.productUrl, p]));

  assert.ok(byUrl.get(MYNTRA_STUD)?.isVerified, "Myntra studs verified");
  assert.equal(byUrl.get(MYNTRA_STUD)?.price, 759);
  const amazonProduct = byUrl.get(AMAZON_STUD);
  assert.ok(amazonProduct?.isVerified, "Amazon studs verified");
  assert.equal(amazonProduct?.price, 1299);
  assert.equal(amazonProduct?.productName, "PALMONAS 18k Gold Plated Simple Stud Earrings for Women", "Title from the Amazon page itself");
  assert.equal(byUrl.get(GIVA_STUD)?.price, 999, "GIVA verified after one rate-limit retry");
  const ajio = byUrl.get(AJIO_STUD);
  assert.ok(ajio, "Cited, bot-blocked AJIO product is kept");
  assert.equal(ajio!.productVerified, false, "...but never labelled verified");
  assert.equal(ajio!.priceVerified, false);
  assert.equal(ajio!.isVerified, false);
  assert.equal(ajio!.price, undefined, "No model-written price is shown");
  assert.equal(ajio!.productName, "Accessorize London Gold-Toned Circular Studs", "Title from the search index citation");
  for (const url of [NYKAA_FASHION_STUD, MYNTRA_LISTING, MYNTRA_HEELS_AS_JEWELLERY, DEAD_MYNTRA_STUD]) {
    assert.ok(!byUrl.has(url), `Not shown: ${url}`);
  }
  assert.ok(group!.products.every((p) => p.category === "jewellery"), "Only jewellery in the jewellery group");
  assert.ok(!fetchedPages.includes(MYNTRA_LISTING), "The listing page is rejected before any page fetch");
  // Relevant store searches now sit alongside verified products ("More matching options"),
  // but are never product cards and never typed as exact products.
  const searchLinks = group!.retailerSearchLinks ?? [];
  assert.ok(searchLinks.length > 0, "Relevant store-search links are kept alongside verified products");
  for (const link of searchLinks) {
    assert.equal(link.urlType, "search_result", "A store-search link is never an exact product");
    assert.ok(!byUrl.has(link.url), "A store-search link is never a product card");
    assert.ok(!/heel|sandal|shoe/i.test(link.url), "No footwear listing in the jewellery section");
  }

  const reasonFor = (url: string) => rejectionLogs.find((r) => r.url === url);
  for (const r of rejectionLogs) {
    for (const field of ["category", "provider", "retailer", "url", "reason", "priceVerification", "categoryValidation"]) {
      assert.ok(field in r, `Rejection log has ${field}`);
    }
    assert.ok(!JSON.stringify(r).includes("sk-test") && !JSON.stringify(r).includes("tvly-test"), "No API keys in logs");
  }
  assert.match(reasonFor(MYNTRA_LISTING)?.reason, /not an individual product page/i);
  assert.equal(reasonFor(MYNTRA_LISTING)?.categoryValidation, "not_run");
  assert.equal(reasonFor(NYKAA_FASHION_STUD)?.httpStatus, 503);
  assert.equal(reasonFor(NYKAA_FASHION_STUD)?.urlSource, "model_text");
  // A 503 is reported as the store being unavailable (Nykaa Fashion's CDN), not as a dead page
  assert.match(reasonFor(NYKAA_FASHION_STUD)?.reason, /(bot protection|temporarily unavailable).*not confirmed by a search index/i);
  assert.equal(reasonFor(MYNTRA_HEELS_AS_JEWELLERY)?.categoryValidation, "failed");
  assert.match(reasonFor(MYNTRA_HEELS_AS_JEWELLERY)?.categoryValidationDetail, /jewellery/i);
  assert.equal(reasonFor(DEAD_MYNTRA_STUD)?.httpStatus, 404);
  assert.equal(reasonFor(DEAD_MYNTRA_STUD)?.provider, "openai_web_search");
  assert.equal(reasonFor(DEAD_MYNTRA_STUD)?.category, "jewellery");

  const prompt: string = openaiBodies[0].input[0].content[0].text;
  assert.match(prompt, /for: women minimal gold stud earrings GIVA\./, "Cleaned query sent to web search");
  assert.ok(!/\bOR\b/.test(prompt.split("\n")[0]), "No boolean OR in the query");
  assert.match(prompt, /never a category, collection, brand, search or listing page/i);
  assert.match(prompt, /GIVA \(giva\.co\)/, "Jewellery search includes the approved jewellery specialist");
  console.log(`✓ Test 6 Passed (${group!.products.length} shown, ${rejectionLogs.length} rejections logged with reasons)`);

  // -------------------------------------------------------------------------
  console.log("\n[Test 7] 'Gold block heels': footwear verified from Amazon and Myntra; jewellery never shown as footwear...");
  rejectionLogs.length = 0;
  openaiPlan = () => ({
    products: [
      { pageUrl: AMAZON_HEELS, title: "Women Gold-Toned Heeled Sandals", brand: "Shoetopia", retailer: "Amazon" },
      { pageUrl: MYNTRA_HEELS, title: "DressBerry Women Open Toe Block Heel Sandals", brand: "DressBerry", retailer: "Myntra" },
      { pageUrl: MYNTRA_EARRING_AS_FOOTWEAR, title: "GIVA Gold Plated Studs Earrings", brand: "GIVA", retailer: "Myntra" },
    ],
    citations: [],
  });
  const footwear = await searchProductsForLook(lookFor("look-heels"), profile, "footwear", true);
  const footGroup = footwear.groups?.find((g) => g.category === "footwear");
  assert.ok(footGroup, "Footwear group planned");
  const footUrls = footGroup!.products.map((p) => p.productUrl).sort();
  assert.deepEqual(footUrls, [AMAZON_HEELS, MYNTRA_HEELS].sort(), "Both genuine heels verified (Amazon 'Heeled Sandals' no longer rejected)");
  assert.ok(footGroup!.products.every((p) => p.isVerified && p.category === "footwear"));
  assert.equal(footGroup!.products.find((p) => p.productUrl === AMAZON_HEELS)?.price, 1149);
  assert.equal(rejectionLogs.find((r) => r.url === MYNTRA_EARRING_AS_FOOTWEAR)?.categoryValidation, "failed", "Earrings rejected from footwear");
  const footPrompt: string = openaiBodies[openaiBodies.length - 1].input[0].content[0].text;
  assert.match(footPrompt, /for: women Gold block heels\./, "Footwear query without duplicated words or store names");
  console.log("✓ Test 7 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 8] When nothing verifies: honest empty state with causes and store-search retry links...");
  rejectionLogs.length = 0;
  openaiPlan = () => ({
    products: [
      { pageUrl: NYKAA_FASHION_STUD, title: "Gold-Toned Dainty Studs", brand: "Nykaa Fashion", retailer: "Nykaa Fashion" },
      { pageUrl: MYNTRA_LISTING, title: "Gold Stud Earrings", brand: "Myntra", retailer: "Myntra" },
      { pageUrl: DEAD_MYNTRA_STUD, title: "MINUTIAE Gold-Toned Tiny Studs Earrings", brand: "MINUTIAE", retailer: "Myntra" },
    ],
    citations: [],
  });
  const empty = await searchProductsForLook(lookFor("look-studs-empty"), profile, "jewellery", true);
  const emptyGroup = empty.groups?.find((g) => g.recommendedItemTitle === "Simple gold studs");
  assert.equal(emptyGroup?.products.length, 0, "Nothing unverifiable is padded in");
  assert.ok(empty.products.every((p) => p.source === "live_search"), "No benchmark/dummy products");
  const links = emptyGroup?.retailerSearchLinks ?? [];
  assert.ok(links.length >= 2, "Store-search retry links offered");
  for (const link of links) {
    assert.equal(determineUrlType(link.url), "search_result", "Links are store searches, not presented as products");
    assert.match(decodeURIComponent(link.url).toLowerCase(), /women/, "Gender preserved in the store search");
    assert.match(decodeURIComponent(link.url).toLowerCase(), /stud|earring/, "Item preserved in the store search");
  }
  const diag = empty.diagnostics?.find((d) => d.provider === "openai_web_search");
  assert.ok(diag, "Fallback outcome reported");
  assert.match(diag!.message, /category\/search pages/);
  assert.match(diag!.message, /blocks automated access/);
  assert.match(diag!.message, /no longer exist/);
  console.log(`✓ Test 8 Passed (links: ${links.map((l) => l.retailer).join(", ")})`);

  // -------------------------------------------------------------------------
  // "Gleaming silver juttis (Date appropriate)": the occasion must not override the
  // footwear the look actually names.
  const dateProfile = { ...profile, occasion: "Date Night", style: ["Indo-Western"], colorsLove: [] } as SkinTuneProfile;
  const juttiLook = (id: string, footwear = "Gleaming silver juttis"): LookRecommendation => {
    const base = JSON.parse(JSON.stringify(generateFallbackLooks(dateProfile)[0]));
    base.pieces = (base.pieces || []).filter((p: any) => !/foot|shoe/i.test(p.category || ""));
    return { ...base, id, footwear };
  };
  const footSpecFor = (look: LookRecommendation, p: SkinTuneProfile) => {
    const persona = detectPersona(p);
    return planRequirementSpecs(look, p, persona, getApplicableCategories(persona, "footwear")).find((s) => s.category === "footwear")!;
  };

  console.log("\n[Test 9] Named footwear decides the type; the occasion only fills in when none is named...");
  const juttiSpec = footSpecFor(juttiLook("plan"), dateProfile);
  assert.equal(juttiSpec.itemSubcategory, "mojaris", "Juttis for a date stay juttis (was: heels)");
  assert.equal(juttiSpec.itemTitle, "Gleaming silver juttis", "Recommended item unchanged");
  assert.equal(juttiSpec.targetGender, "women");
  assert.match(juttiSpec.stylingRequirement, /Date Night appropriate/, "Occasion kept in the requirement");
  assert.ok(!/\bheels?\b/i.test(juttiSpec.searchQuery), `No 'heels' in the jutti query (${juttiSpec.searchQuery})`);
  assert.match(juttiSpec.searchQuery, /silver/i, "Colour kept");
  assert.equal(footSpecFor(juttiLook("p2", "Embellished heeled juttis"), dateProfile).itemSubcategory, "mojaris", "Heeled juttis are juttis");
  assert.equal(footSpecFor(juttiLook("p3", "Tan suede loafers"), { ...dateProfile, occasion: "Goa vacation" } as SkinTuneProfile).itemSubcategory, "loafers", "Vacation no longer turns named loafers into sandals");
  assert.equal(footSpecFor(juttiLook("p4", "Gold block heels"), dateProfile).itemSubcategory, "heels");
  assert.equal(footSpecFor(juttiLook("p5", "Metallic footwear"), dateProfile).itemSubcategory, "heels", "Unnamed type: date inference unchanged");
  for (const title of ["Anouk Women Embellished Ethnic Mojaris Flats", "Women Silver-Toned Embroidered Juttis", "Women Silver Punjabi Nagra Flats", "Silver Kolhapuri Flats for Women"]) {
    const c = checkProductConsistency(title, "X", "footwear", "https://www.amazon.in/dp/B0D4JUTT1A", undefined, "woman", "mojaris", juttiSpec.dominantColor, undefined, 799, "Date Night", undefined, "women");
    assert.equal(c.isConsistent, true, `Genuine jutti accepted: ${title} (${c.reason})`);
  }
  for (const title of ["Women Silver-Toned Ethnic Open Toe Flats", "Women Metallic Block Heel Sandals", "Women Silver Ballet Flats"]) {
    const c = checkProductConsistency(title, "X", "footwear", "https://www.amazon.in/dp/B0D4JUTT1B", undefined, "woman", "mojaris", juttiSpec.dominantColor, undefined, 799, "Date Night", undefined, "women");
    assert.equal(c.isConsistent, false, `Not a jutti, rejected: ${title}`);
  }
  console.log("✓ Test 9 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 10] Silver juttis discovered under every store name, verified, and never swapped for heels...");
  const MYNTRA_JUTTI = "https://www.myntra.com/flats/anouk/anouk-women-embellished-ethnic-mojaris-flats/26571834/buy";
  const AMAZON_JUTTI = "https://www.amazon.in/dp/B0D4JUTT1C";
  const AJIO_JUTTI = "https://www.ajio.com/fashion-dream-women-silver-embellished-juttis/p/469731852_silver";
  const MYNTRA_HEEL_SUBSTITUTE = "https://www.myntra.com/heels/jm+looks/jm-looks-metallic-slingback-block-heel-sandals/29617453/buy";
  const MYNTRA_FLATS_LISTING = "https://www.myntra.com/women-silver-juttis";
  pages[MYNTRA_JUTTI] = () => ({ status: 200, html: jsonLdProduct("Anouk Women Silver-Toned Embellished Ethnic Mojaris Flats", "Anouk", "487", "https://assets.myntassets.com/jutti.jpg") });
  pages[AMAZON_JUTTI] = () => ({ status: 200, html: amazonPage("Women Silver Embroidered Punjabi Juttis", "699", "1,499", "Fashion Dream") });
  pages[AJIO_JUTTI] = () => ({ status: 403, html: "Access Denied" });
  pages[MYNTRA_HEEL_SUBSTITUTE] = () => ({ status: 200, html: jsonLdProduct("Jm Looks Metallic Slingback Block Heel Sandals", "Jm Looks", "702", "https://assets.myntassets.com/heel.jpg") });
  rejectionLogs.length = 0;
  fetchedPages.length = 0;
  openaiPlan = () => ({
    products: [
      { pageUrl: MYNTRA_JUTTI, title: "Anouk Women Embellished Ethnic Mojaris Flats", brand: "Anouk", retailer: "Myntra" },
      { pageUrl: AMAZON_JUTTI, title: "Women Silver Embroidered Punjabi Juttis", brand: "Fashion Dream", retailer: "Amazon" },
      { pageUrl: AJIO_JUTTI, title: "Fashion Dream Women Silver Embellished Juttis", brand: "Fashion Dream", retailer: "AJIO" },
      { pageUrl: MYNTRA_HEEL_SUBSTITUTE, title: "Jm Looks Metallic Slingback Block Heel Sandals", brand: "Jm Looks", retailer: "Myntra" },
      { pageUrl: MYNTRA_FLATS_LISTING, title: "Women Silver Juttis", brand: "Myntra", retailer: "Myntra" },
    ],
    citations: [{ url: AJIO_JUTTI, title: "Buy Fashion Dream Women Silver Embellished Juttis | AJIO" }],
  });
  const juttis = await searchProductsForLook(juttiLook("look-juttis"), dateProfile, "footwear", true);
  const juttiGroup = juttis.groups?.find((g) => g.category === "footwear");
  assert.equal(juttiGroup?.recommendedItemTitle, "Gleaming silver juttis");
  const shown = new Map(juttiGroup!.products.map((p) => [p.productUrl, p]));
  assert.equal(shown.get(MYNTRA_JUTTI)?.isVerified, true, "Myntra jutti verified");
  assert.equal(shown.get(MYNTRA_JUTTI)?.price, 487);
  assert.equal(shown.get(AMAZON_JUTTI)?.isVerified, true, "Amazon jutti verified");
  assert.equal(shown.get(AMAZON_JUTTI)?.price, 699);
  const ajioJutti = shown.get(AJIO_JUTTI);
  assert.ok(ajioJutti, "Cited, bot-blocked AJIO jutti shown");
  assert.equal(ajioJutti!.isVerified, false, "...as unverified");
  assert.equal(ajioJutti!.price, undefined, "...with no invented price");
  assert.ok(!shown.has(MYNTRA_HEEL_SUBSTITUTE), "Heels are never shown for a jutti recommendation");
  assert.ok(!shown.has(MYNTRA_FLATS_LISTING), "Listing page never shown as a product");
  assert.equal(rejectionLogs.find((r) => r.url === MYNTRA_HEEL_SUBSTITUTE)?.categoryValidation, "failed");
  assert.match(rejectionLogs.find((r) => r.url === MYNTRA_FLATS_LISTING)?.reason ?? "", /not an individual product page/i);
  const juttiPrompt: string = openaiBodies[openaiBodies.length - 1].input[0].content[0].text;
  assert.match(juttiPrompt, /footwear -> mojaris/);
  assert.match(juttiPrompt, /juttis, mojaris, kolhapuris, nagras or khussas/, "Alternative store names searched");
  assert.match(juttiPrompt, /never substitute a different footwear type/);
  assert.ok(!/\bheels?\b/i.test(juttiPrompt.split("\n")[0]), "Query line does not ask for heels");
  assert.match(juttiPrompt, /Myntra[\s\S]*AJIO[\s\S]*Tata CLiQ[\s\S]*Amazon India/, "All supported stores in discovery");
  console.log(`✓ Test 10 Passed (${juttiGroup!.products.length} shown)`);

  // -------------------------------------------------------------------------
  console.log("\n[Test 11] No verifiable jutti: store-search links for every supported store, keeping colour and type...");
  openaiPlan = () => ({
    products: [{ pageUrl: MYNTRA_HEEL_SUBSTITUTE, title: "Jm Looks Metallic Slingback Block Heel Sandals", brand: "Jm Looks", retailer: "Myntra" }],
    citations: [],
  });
  const noJuttis = await searchProductsForLook(juttiLook("look-juttis-empty"), dateProfile, "footwear", true);
  const emptyJuttiGroup = noJuttis.groups?.find((g) => g.category === "footwear");
  assert.equal(emptyJuttiGroup?.products.length, 0);
  const juttiLinks = emptyJuttiGroup?.retailerSearchLinks ?? [];
  assert.deepEqual(juttiLinks.map((l) => l.retailer), ["Myntra", "AJIO", "Tata CLiQ", "Amazon India"]);
  for (const link of juttiLinks) {
    const q = decodeURIComponent(link.url).toLowerCase();
    assert.match(q, /silver/, `Colour kept: ${link.url}`);
    assert.match(q, /jutti|mojari/, `Type kept: ${link.url}`);
    assert.match(q, /women/, `Gender kept: ${link.url}`);
    assert.ok(!/heel/.test(q), `No heels: ${link.url}`);
    assert.equal(determineUrlType(link.url), "search_result");
  }
  console.log("✓ Test 11 Passed");

  console.log("\n======================================================================");
  console.log("ALL JEWELLERY & FOOTWEAR DISCOVERY TESTS PASSED");
  console.log("======================================================================");
}

main().catch((err) => {
  console.error("\n✗ TEST FAILED:", err);
  process.exit(1);
});
