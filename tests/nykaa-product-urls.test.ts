import assert from "node:assert/strict";
import {
  buildRetailerSearchUrl,
  isValidProductUrl,
  getCanonicalProductUrl,
  determineUrlType,
  getSafeProductUrl,
  buildFallbackSearchUrl,
} from "../src/lib/retailer-urls";
import { verifyProductPage } from "../src/lib/product-search";

console.log("======================================================================");
console.log("TEST SUITE: NYKAA FASHION 503 FIX, PDP URLS & FALLBACK SEARCH ARCHITECTURE");
console.log("======================================================================");

async function runTests() {
  // Test 1: Genuine individual Nykaa Fashion product URLs
  console.log("\n[Test 1] Genuine Nykaa Fashion PDP URLs recognized with exact_product...");
  const validPdp = "https://www.nykaafashion.com/gajra-gang-by-nykaa-fashion-yellow-embroidered-kurta/p/8920141";
  assert.strictEqual(isValidProductUrl(validPdp), true, "Genuine Nykaa Fashion PDP must be valid");
  assert.strictEqual(determineUrlType(validPdp), "exact_product", "Nykaa Fashion /p/<id> must be exact_product");
  console.log("✓ Test 1 Passed");

  // Test 2: Redirected and canonical URLs
  console.log("\n[Test 2] Canonicalization strips tracking params from Nykaa Fashion PDPs...");
  const trackingUrl =
    "https://www.nykaafashion.com/gajra-gang-yellow-kurta/p/8920141?utm_source=google&utm_medium=cpc&utm_campaign=brand";
  const canonical = getCanonicalProductUrl(trackingUrl);
  assert.strictEqual(
    canonical,
    "https://www.nykaafashion.com/gajra-gang-yellow-kurta/p/8920141",
    "Canonical URL must preserve clean PDP path without UTM tracking"
  );
  console.log("✓ Test 2 Passed");

  // Test 3: Reject broken /search/ paths on Nykaa Fashion that cause Varnish 503
  console.log("\n[Test 3] Reject broken /search/ paths on Nykaa Fashion that trigger Varnish 503...");
  const brokenSearch = "https://www.nykaafashion.com/search/result/?q=lehenga";
  assert.strictEqual(isValidProductUrl(brokenSearch), false, "Nykaa Fashion /search/ path must be rejected as invalid");
  console.log("✓ Test 3 Passed");

  // Test 4: Canonicalize legacy Nykaa Fashion search URL to /catalogsearch/result/?q=...
  console.log("\n[Test 4] Canonicalize legacy Nykaa Fashion search to /catalogsearch/result/?q=...");
  const legacySearch = "https://www.nykaafashion.com/search/result/?q=silk+saree";
  const canonicalSearch = getCanonicalProductUrl(legacySearch);
  assert.strictEqual(
    canonicalSearch,
    "https://www.nykaafashion.com/catalogsearch/result/?q=silk%20saree",
    "Legacy /search/ path must be canonicalized to /catalogsearch/result/?q=... with trailing slash"
  );
  console.log("✓ Test 4 Passed");

  // Test 5: Fallback search URL generation with trailing slash
  console.log("\n[Test 5] Generate correct Nykaa Fashion search URL with /catalogsearch/result/ and trailing slash...");
  const searchUrl = buildRetailerSearchUrl("Nykaa Fashion", {
    gender: "women",
    brand: "Kalki Fashion",
    productName: "Embroidered Silk Festive Chaniya Choli",
    color: "Red",
    category: "outfit",
  });
  assert.ok(searchUrl.startsWith("https://www.nykaafashion.com/catalogsearch/result/?q="), "Must use /catalogsearch/result/?q=");
  assert.ok(searchUrl.includes("/catalogsearch/result/?q="), "Must have trailing slash before ?q=");
  assert.ok(!searchUrl.includes("/search/result/"), "Must NEVER use /search/result/ for Nykaa Fashion");
  assert.ok(searchUrl.includes("Kalki") || searchUrl.includes("kalki"), "Must include brand/product in query");
  console.log("✓ Test 5 Passed");

  // Test 6: buildFallbackSearchUrl
  console.log("\n[Test 6] buildFallbackSearchUrl generates valid search URL from product object...");
  const fallback = buildFallbackSearchUrl(
    {
      retailer: "Nykaa Fashion",
      brand: "Tribe Amrapali",
      productName: "925 Sterling Silver Bangle",
      category: "jewellery",
    },
    "women"
  );
  assert.ok(fallback.startsWith("https://www.nykaafashion.com/catalogsearch/result/?q="));
  assert.ok(fallback.includes("Tribe"));
  console.log("✓ Test 6 Passed");

  // Test 7: Direct product link vs Fallback search separation
  console.log("\n[Test 7] Ensure direct product link remains direct and fallback is separate...");
  const product = {
    id: "test-prod-1",
    retailer: "Nykaa Fashion",
    brand: "Fayon Kids",
    productName: "Handcrafted Mirror-Work Traditional Chaniya Choli",
    productUrl: "https://www.nykaafashion.com/fayon-kids-festive-lehenga/p/8910234",
    urlType: "exact_product" as const,
    category: "outfit" as const,
  };
  const directSafeUrl = getSafeProductUrl(product, "girls");
  const fallbackSearch = buildFallbackSearchUrl(product, "girls");
  assert.strictEqual(directSafeUrl, "https://www.nykaafashion.com/fayon-kids-festive-lehenga/p/8910234");
  assert.ok(fallbackSearch.includes("/catalogsearch/result/?q="));
  assert.notStrictEqual(directSafeUrl, fallbackSearch, "Direct URL and fallback search URL must be separate");
  console.log("✓ Test 7 Passed");

  // Test 8: Safe rewriting of legacy/broken search URLs passed as productUrl
  console.log("\n[Test 8] Rewrites broken nykaafashion /search/ URLs to safe /catalogsearch/result/?q=...");
  const productWithBrokenSearch = {
    id: "test-prod-2",
    retailer: "Nykaa Fashion",
    brand: "Ishin",
    productName: "Banarasi Silk Saree",
    productUrl: "https://www.nykaafashion.com/search/result/?q=banarasi+silk+saree",
    urlType: "search_result" as const,
    category: "outfit" as const,
  };
  const safeUrl = getSafeProductUrl(productWithBrokenSearch, "women");
  assert.ok(safeUrl.includes("catalogsearch/result/?q=banarasi%20silk%20saree"), "Must rewrite to /catalogsearch/result/?q=");
  assert.ok(!safeUrl.includes("/search/result/"), "Must not keep broken /search/result/");
  console.log("✓ Test 8 Passed");

  // Test 9: HTTP 503 handling without aggressive retry and without treating as non-existent
  console.log("\n[Test 9] Handles HTTP 503 as retailer service temporarily unavailable without aggressive retry...");
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = (async () => {
    callCount++;
    return new Response("Service Unavailable", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/html" },
    });
  }) as any;

  try {
    const result = await verifyProductPage("https://www.nykaafashion.com/some-product/p/12345");
    assert.strictEqual(callCount, 1, "503 must not trigger aggressive retry loops");
    assert.strictEqual(result.success, false, "503 page must not be verified");
    assert.strictEqual(result.retailerRestricted, true, "503 must be marked as retailerRestricted");
    assert.strictEqual(result.httpStatus, 503, "HTTP status must be recorded as 503");
    assert.ok(result.reason?.includes("503") || result.reason?.includes("unavailable"), "Reason must indicate 503/unavailable");
    console.log("✓ Test 9 Passed");
  } finally {
    global.fetch = originalFetch;
  }

  // Test 10: HTTP 403 handling (bot protection)
  console.log("\n[Test 10] Handles HTTP 403 bot restriction without marking product as non-existent...");
  global.fetch = (async () => {
    return new Response("Access Denied", {
      status: 403,
      statusText: "Forbidden",
    });
  }) as any;

  try {
    const result = await verifyProductPage("https://www.nykaafashion.com/some-product/p/12345");
    assert.strictEqual(result.success, false, "403 page must not be verified");
    assert.strictEqual(result.retailerRestricted, true, "403 must be marked as retailerRestricted");
    assert.strictEqual(result.httpStatus, 403, "HTTP status must be recorded as 403");
    console.log("✓ Test 10 Passed");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("\n======================================================================");
  console.log("ALL 10 NYKAA FASHION TESTS PASSED SUCCESSFULLY! 🚀");
  console.log("======================================================================");
}

runTests().catch((err) => {
  console.error("\n❌ Test Suite Failed:", err);
  process.exit(1);
});
