import assert from "node:assert/strict";
import { logger } from "../src/lib/logger";
import { searchProductsForLook, parseWebSearchProductsJson } from "../src/lib/product-search";
import { generateFallbackLooks } from "../src/features/recommendations/services/recommendation-engine";
import type { LookRecommendation, SkinTuneProfile } from "../src/lib/skintune-schemas";
logger.level = "fatal";

console.log("======================================================================");
console.log("REGRESSION TEST SUITE: TAVILY RATE LIMIT -> OPENAI WEB SEARCH FALLBACK");
console.log("======================================================================");

// Fully mocked: fake keys, and one fetch dispatcher installed before the lazily created OpenAI
// client exists (the SDK captures the global fetch when its singleton client is constructed).
// Any request no test expects fails loudly, so no paid or real network call can happen.
process.env.OPENAI_API_KEY = "sk-test-stub-key-not-real";
process.env.TAVILY_API_KEY = "tvly-test-stub-key-not-real";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handler: Handler = (url) => {
  throw new Error(`Unexpected network request: ${url}`);
};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return handler(url, init);
}) as typeof fetch;


const profile = {
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
const baseLook = generateFallbackLooks(profile)[0] as LookRecommendation;
const lookWithId = (id: string) => ({ ...JSON.parse(JSON.stringify(baseLook)), id }) as LookRecommendation;

// --- Retailer product pages (what verifyProductPage fetches) -------------------------------
const MYNTRA_URL = "https://www.myntra.com/lehenga-choli/ethniqlo/ethniqlo-pink-flared-lehenga-choli-with-thread-embroidery/38204067/buy";
const ELAHE_URL = "https://www.elahe.in/products/pink-mirror-work-lehenga-choli-set";
const AJIO_URL = "https://www.ajio.com/svaraa-women-embroidered-flared-lehenga-choli-set/p/701218616_pink";
const DEAD_URL = "https://www.myntra.com/lehenga-choli/ethniqlo/ethniqlo-pink-mirror-lehenga-choli/38999123/buy";

const pages: Record<string, { status: number; html: string }> = {
  [MYNTRA_URL]: {
    status: 200,
    html: `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: "EthniQlo Pink Flared Lehenga Choli With Thread Embroidery",
      brand: { name: "EthniQlo" },
      image: "https://assets.myntassets.com/images/38204067/real-1.jpg",
      offers: { price: "4353", priceCurrency: "INR", availability: "https://schema.org/InStock" },
    })}</script>`,
  },
  [ELAHE_URL]: {
    status: 200,
    html: `<meta property="og:title" content="Pink Mirror Work Lehenga Choli Set | Elahe">
<meta property="og:image" content="https://www.elahe.in/cdn/shop/files/pink-lehenga.jpg">
<meta property="og:price:amount" content="6,490.00">`,
  },
  [AJIO_URL]: { status: 403, html: "Access Denied" },
  [DEAD_URL]: { status: 404, html: "Page Not Found" },
};
const pageResponse = (url: string) => {
  const page = pages[url];
  if (!page) throw new Error(`Unexpected retailer page request: ${url}`);
  return new Response(page.html, { status: page.status, headers: { "Content-Type": "text/html" } });
};

// --- Provider responses ------------------------------------------------------------------
const tavilyQuota = () =>
  new Response(JSON.stringify({ detail: { error: "This request exceeds your plan's set usage limit." } }), { status: 432 });

/** A Responses API payload whose output_text is `text`, shaped as the real API returns it. */
const openaiResponse = (text: string) =>
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
          content: [{ type: "output_text", text, annotations: [] }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const lehengaProducts = [
  // A model-written price / image must never reach the UI; the page values must win
  { pageUrl: MYNTRA_URL, title: "EthniQlo Pink Flared Lehenga Choli With Thread Embroidery", brand: "EthniQlo", retailer: "Myntra", price: 4443, imageUrl: "https://assets.myntassets.com/0e8e8e8e-fake.jpg" },
  { pageUrl: `${ELAHE_URL}?utm_source=openai`, title: "Pink Mirror Work Lehenga Choli Set", brand: "Elahe", retailer: "Elahé" },
  // Bot-blocked page: cannot be confirmed, so a model-authored candidate is dropped
  { pageUrl: AJIO_URL, title: "SVARAA Women Embroidered Flared Lehenga Choli Set", brand: "SVARAA", retailer: "AJIO", price: 1224 },
  // Hallucinated / dead product page
  { pageUrl: DEAD_URL, title: "EthniQlo Pink Mirror Lehenga Choli", brand: "EthniQlo", retailer: "Myntra" },
  // Not an approved retailer
  { pageUrl: "https://www.randomshop.example/lehenga/1", title: "Lehenga", brand: "X", retailer: "X" },
];

const isLehengaRequest = (body: { input?: Array<{ content?: Array<{ text?: string }> }> }) =>
  /lehenga|chaniya/i.test(body.input?.[0]?.content?.[0]?.text ?? "") && !/blouse/i.test(body.input?.[0]?.content?.[0]?.text ?? "");

async function main() {
  // -----------------------------------------------------------------------------
  // Test 1: Tavily 432 -> OpenAI fallback is invoked and verified products are returned
  // -----------------------------------------------------------------------------
  console.log("\n[Test 1] Tavily rate limit falls back to OpenAI web search and returns verified products...");
  let tavilyCalls = 0;
  const openaiBodies: Array<Record<string, unknown>> = [];
  handler = async (url, init) => {
    if (url.startsWith("https://api.tavily.com/")) {
      tavilyCalls++;
      return tavilyQuota();
    }
    if (url.startsWith("https://api.openai.com/")) {
      const body = JSON.parse(String(init?.body));
      openaiBodies.push(body);
      return openaiResponse(JSON.stringify({ products: isLehengaRequest(body) ? lehengaProducts : [] }));
    }
    return pageResponse(url);
  };

  const res = await searchProductsForLook(lookWithId("fallback-ok"), profile, "outfit", true);
  const groupCount = res.groups?.length ?? 0;
  assert.ok(groupCount > 0, "Outfit requirements were planned");
  assert.equal(tavilyCalls, groupCount, "Tavily stays the primary provider and is tried first for every requirement");
  assert.equal(openaiBodies.length, groupCount, "OpenAI web search is invoked once per requirement after Tavily fails");

  const urls = res.products.map((p) => p.productUrl).sort();
  assert.deepEqual(urls, [ELAHE_URL, MYNTRA_URL].sort(), "Only page-verified products from multiple retailers survive");
  assert.equal(res.status, "success");

  const myntra = res.products.find((p) => p.productUrl === MYNTRA_URL)!;
  assert.equal(myntra.price, 4353, "Displayed price comes from the product page, not the model (4443)");
  assert.equal(myntra.imageUrl, "https://assets.myntassets.com/images/38204067/real-1.jpg", "Model-written image URL is discarded");
  assert.equal(myntra.priceVerified, true);
  assert.equal(myntra.productVerified, true);
  assert.equal(myntra.retailer, "Myntra");

  const elahe = res.products.find((p) => p.productUrl === ELAHE_URL)!;
  assert.equal(elahe.price, 6490, "og:price:amount on the boutique page is used");
  assert.equal(elahe.retailer, "Elahé");
  assert.ok(res.products.every((p) => p.source === "live_search"), "No static/benchmark products are injected");
  assert.ok(!res.products.some((p) => p.productUrl === AJIO_URL), "Unconfirmable (bot-blocked) model URL is not shown");

  const tvDiag = res.diagnostics?.find((d) => d.keyName === "TAVILY_API_KEY");
  assert.equal(tvDiag?.status, "rate_limited", "The Tavily rate limit is still reported");
  assert.ok(!res.diagnostics?.some((d) => d.keyName === "OPENAI_API_KEY"), "A healthy OpenAI fallback is not reported as failing");
  console.log(`✓ Test 1 Passed (${groupCount} requirement(s), ${res.products.length} verified products)`);

  // -----------------------------------------------------------------------------
  // Test 2: The OpenAI request asks only for identifying fields and is bounded
  // -----------------------------------------------------------------------------
  console.log("\n[Test 2] OpenAI request uses web_search, a bounded output and no price/image fields...");
  const body = openaiBodies[0] as {
    model: string;
    tools: Array<{ type: string }>;
    max_output_tokens: number;
    text: { format: { schema: { properties: { products: { items: { properties: Record<string, unknown> } } } } } };
  };
  assert.equal(body.model, "gpt-4o-mini");
  assert.deepEqual(body.tools.map((t) => t.type), ["web_search"]);
  assert.ok(body.max_output_tokens > 0 && body.max_output_tokens <= 2000, "Output is capped so a runaway string cannot hang the call");
  const fields = Object.keys(body.text.format.schema.properties.products.items.properties).sort();
  assert.deepEqual(fields, ["brand", "pageUrl", "retailer", "title"], "Model is not asked to supply prices, images or materials");
  console.log("✓ Test 2 Passed");

  // -----------------------------------------------------------------------------
  // Test 3: Truncated JSON (runaway string) still yields the complete products
  // -----------------------------------------------------------------------------
  console.log("\n[Test 3] Truncated OpenAI JSON output keeps every fully emitted product...");
  const complete = JSON.stringify({ products: lehengaProducts.slice(0, 2) });
  const truncated = complete.slice(0, -2) + `,{"pageUrl":"https://www.myntra.com/x/1/buy","title":"0e0e0e0e0e0e0e0e0e0e0e0e`;
  assert.throws(() => JSON.parse(truncated));
  assert.equal(parseWebSearchProductsJson(truncated).length, 2, "Both complete objects are recovered");
  assert.equal(parseWebSearchProductsJson(complete).length, 2);
  assert.deepEqual(parseWebSearchProductsJson('{"products":[{"title":"has } and \\" inside"}'), [{ title: 'has } and " inside' }]);
  assert.deepEqual(parseWebSearchProductsJson("not json"), []);
  assert.deepEqual(parseWebSearchProductsJson(""), []);

  handler = async (url, init) => {
    if (url.startsWith("https://api.tavily.com/")) return tavilyQuota();
    if (url.startsWith("https://api.openai.com/")) {
      const reqBody = JSON.parse(String(init?.body));
      return openaiResponse(isLehengaRequest(reqBody) ? truncated : JSON.stringify({ products: [] }));
    }
    return pageResponse(url);
  };
  const trunc = await searchProductsForLook(lookWithId("fallback-truncated"), profile, "outfit", true);
  assert.deepEqual(
    trunc.products.map((p) => p.productUrl).sort(),
    [ELAHE_URL, MYNTRA_URL].sort(),
    "Products before the truncation point are verified and shown",
  );
  console.log("✓ Test 3 Passed");

  // -----------------------------------------------------------------------------
  // Test 4: Fallback ran but nothing verifiable -> explicit diagnostic, no invented products
  // -----------------------------------------------------------------------------
  console.log("\n[Test 4] Unverifiable fallback suggestions are dropped and explained...");
  handler = async (url) => {
    if (url.startsWith("https://api.tavily.com/")) return tavilyQuota();
    if (url.startsWith("https://api.openai.com/")) {
      return openaiResponse(JSON.stringify({ products: [lehengaProducts[2], lehengaProducts[3]] }));
    }
    return pageResponse(url);
  };
  const none = await searchProductsForLook(lookWithId("fallback-unverifiable"), profile, "outfit", true);
  assert.equal(none.products.length, 0, "Bot-blocked and dead model URLs are never shown");
  const fbDiag = none.diagnostics?.find((d) => d.provider === "openai_web_search");
  assert.ok(fbDiag, "The empty state explains that the fallback ran");
  assert.ok(fbDiag.message.includes("none could be confirmed"), fbDiag.message);
  assert.equal(none.diagnostics?.find((d) => d.keyName === "TAVILY_API_KEY")?.status, "rate_limited");
  console.log("✓ Test 4 Passed");

  // -----------------------------------------------------------------------------
  // Test 5: OpenAI also rate limited -> both failures reported, nothing invented
  // -----------------------------------------------------------------------------
  console.log("\n[Test 5] OpenAI failure during fallback is reported...");
  let openai429Calls = 0;
  handler = async (url) => {
    if (url.startsWith("https://api.tavily.com/")) return tavilyQuota();
    if (url.startsWith("https://api.openai.com/")) {
      openai429Calls++;
      return new Response(JSON.stringify({ error: { message: "You exceeded your current quota", type: "insufficient_quota" } }), {
        status: 429,
        headers: { "Content-Type": "application/json", "retry-after-ms": "1" },
      });
    }
    return pageResponse(url);
  };
  const both = await searchProductsForLook(lookWithId("fallback-openai-429"), profile, "outfit", true);
  assert.equal(both.products.length, 0);
  assert.equal(both.diagnostics?.find((d) => d.keyName === "OPENAI_API_KEY")?.status, "rate_limited");
  assert.equal(both.diagnostics?.find((d) => d.keyName === "TAVILY_API_KEY")?.status, "rate_limited");
  assert.ok(!both.diagnostics?.some((d) => d.provider === "openai_web_search"), "No 'fallback ran' note when OpenAI itself failed");
  assert.ok(openai429Calls <= (both.groups?.length ?? 0) * 2, "At most one retry per requirement");
  console.log("✓ Test 5 Passed");

  // -----------------------------------------------------------------------------
  // Test 6: Healthy Tavily stays primary and OpenAI is not called
  // -----------------------------------------------------------------------------
  console.log("\n[Test 6] When Tavily returns enough diverse candidates, OpenAI is not called...");
  const tavilyUrls = [
    MYNTRA_URL,
    ELAHE_URL,
    "https://www.myntra.com/lehenga-choli/ethniqlo/ethniqlo-dusty-pink-net-lehenga-choli/37486401/buy",
    "https://www.myntra.com/lehenga-choli/suha/suha-womens-pink-silk-embroidered-flared-lehenga-choli/36884009/buy",
    "https://www.elahe.in/products/rose-pink-garba-lehenga-choli",
  ];
  for (const u of tavilyUrls.slice(2)) {
    pages[u] = {
      status: 200,
      html: `<meta property="og:title" content="Pink Garba Lehenga Choli ${u.length}"><meta property="og:price:amount" content="3,999">`,
    };
  }
  let openaiCallsWhenHealthy = 0;
  handler = async (url) => {
    if (url.startsWith("https://api.tavily.com/")) {
      return new Response(
        JSON.stringify({
          images: [],
          results: tavilyUrls.map((u, i) => ({
            url: u,
            title: ["EthniQlo Flared Lehenga Choli", "Elahe Mirror Lehenga Set", "EthniQlo Net Lehenga Choli", "Suha Silk Lehenga Choli", "Elahe Rose Garba Lehenga"][i],
            content: "Festive pink lehenga",
          })),
        }),
        { status: 200 },
      );
    }
    if (url.startsWith("https://api.openai.com/")) {
      openaiCallsWhenHealthy++;
      return openaiResponse(JSON.stringify({ products: [] }));
    }
    return pageResponse(url);
  };
  const healthy = await searchProductsForLook(lookWithId("tavily-healthy"), profile, "outfit", true);
  assert.equal(openaiCallsWhenHealthy, 0, "No paid OpenAI web search when Tavily already found enough");
  assert.ok(healthy.products.length > 0);
  assert.ok(!healthy.diagnostics?.length, "No diagnostics when the primary provider is healthy");
  console.log("✓ Test 6 Passed");

  console.log("\n======================================================================");
  console.log("ALL TAVILY -> OPENAI FALLBACK TESTS PASSED");
  console.log("======================================================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
