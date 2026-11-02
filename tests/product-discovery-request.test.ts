import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Fully offline. Covers the request path behind "Product links could not be loaded":
// browser service -> POST /api/product-recommendations -> discovery. A temp SQLite DB
// holds a real session; Tavily (432) and OpenAI web search are mocked.
const dbFile = path.join(os.tmpdir(), `letstyle-products-${process.pid}-${Date.now()}.db`);
process.env.SQLITE_DB_PATH = dbFile;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.OPENAI_API_KEY = "sk-test-stub-key-not-real";
process.env.TAVILY_API_KEY = "tvly-test-stub-key-not-real";

import { logger } from "../src/lib/logger";
import { getDb } from "../src/lib/db";
import { createSession } from "../src/lib/auth";
import { POST as productRoute } from "../src/app/api/product-recommendations/route";
import { getProductRecommendations, clearClientProductCache } from "../src/features/shopping/services/product-recommendations";
import type { LookRecommendation, SkinTuneProfile } from "../src/lib/skintune-schemas";

// Set the level first: pino reassigns its level methods when the level changes.
logger.level = "fatal";
const logs: Array<{ obj: any; msg?: string }> = [];
for (const level of ["info", "warn", "error"] as const) {
  const original = logger[level].bind(logger);
  (logger as any)[level] = (obj: any, msg?: string) => {
    logs.push({ obj, msg });
    return original(obj, msg);
  };
}

console.log("======================================================================");
console.log("REGRESSION TEST SUITE: PRODUCT DISCOVERY REQUEST PATH & ERROR REPORTING");
console.log("======================================================================");

const profile = {
  name: "A", pronouns: "she/her/women", gender: "female", ageGroup: "25–34", height: "", photoUrl: "", bodyPhotoUrl: "",
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 90, contrast: "Medium" }, bodyBuild: "", fit: "",
  style: ["Indo-Western"], colorsLove: [], colorsAvoid: [], restrictions: [], occasion: "Date Night", impression: [], budget: "", customStyleNotes: "",
} as SkinTuneProfile;
const look = {
  id: "look-01", title: "Silver Date Night Edit", note: "n", category: "", vibe: "romantic", personaEnergy: "warm",
  palette: ["#c0c0c0", "#1f2937", "#f5f5f4"], imageUrl: "/replace-with-generated/pending.webp",
  pieces: [{ category: "Outfit", name: "Ivory embroidered kurta set", detail: "" }],
  outfit: "Ivory embroidered kurta set", outfitColor: "Ivory", jewellery: "Simple gold studs", hairstyle: "Soft waves",
  makeup: "Nude lip", accessories: "Silver potli bag", footwear: "Gleaming silver juttis",
  reasoning: ["a", "b", "c"], confidence: 90, applicableCategories: ["outfit", "jewellery", "footwear", "accessories"],
} as unknown as LookRecommendation;

// ---------------------------------------------------------------------------
// Part 1: browser service, against a mocked browser fetch
// ---------------------------------------------------------------------------
type Handler = (url: string, init?: RequestInit) => Promise<Response>;
let browserFetch: Handler = async () => {
  throw new Error("unset");
};
let browserCalls = 0;

async function withBrowserFetch<T>(handler: Handler, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  browserFetch = handler;
  browserCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    browserCalls++;
    return browserFetch(String(input), init);
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}
const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

async function main() {
  console.log("\n[Test 1] Server unreachable: reported as a connection failure, not an API key problem...");
  clearClientProductCache();
  let res = await withBrowserFetch(async () => {
    throw new TypeError("Failed to fetch");
  }, () => getProductRecommendations(look, profile, "all"));
  assert.equal(browserCalls, 2, "One automatic retry for a request that got no response");
  assert.equal(res.status, "unavailable");
  assert.equal(res.diagnostics?.[0].provider, "network");
  assert.equal(res.diagnostics?.[0].status, "network_error");
  assert.match(res.diagnostics![0].message, /never reached the LetStyle server/);
  assert.ok(!/api key|myntra|nykaa|ajio/i.test(res.diagnostics![0].message), "Does not blame keys or stores");
  console.log("✓ Test 1 Passed");

  console.log("\n[Test 2] A brief connection drop (e.g. dev server reload) recovers on the retry...");
  let first = true;
  res = await withBrowserFetch(async () => {
    if (first) {
      first = false;
      throw new TypeError("Failed to fetch");
    }
    return json({ lookId: "look-01", products: [{ productUrl: "u", category: "outfit" }], status: "success" }, 200, { "x-request-id": "abc12345" });
  }, () => getProductRecommendations(look, profile, "outfit", true));
  assert.equal(browserCalls, 2);
  assert.equal(res.status, "success");
  console.log("✓ Test 2 Passed");

  console.log("\n[Test 3] Timeout is reported as a timeout and not retried...");
  res = await withBrowserFetch(async () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  }, () => getProductRecommendations(look, profile, "all", true));
  assert.equal(browserCalls, 1);
  assert.equal(res.diagnostics?.[0].status, "timeout");
  console.log("✓ Test 3 Passed");

  console.log("\n[Test 4] HTTP errors carry their status, the server's message and the request id...");
  res = await withBrowserFetch(async () => json({ error: "Authentication required.", code: "UNAUTHORIZED" }, 401, { "x-request-id": "req401aa" }), () =>
    getProductRecommendations(look, profile, "all", true),
  );
  assert.equal(browserCalls, 1, "HTTP errors are not retried");
  assert.equal(res.diagnostics?.[0].status, "unauthorized");
  assert.match(res.diagnostics![0].message, /req401aa/);
  res = await withBrowserFetch(async () => json({ error: "Operation failed. Please try again." }, 500, { "x-request-id": "req500bb" }), () =>
    getProductRecommendations(look, profile, "all", true),
  );
  assert.equal(res.diagnostics?.[0].status, "http_error");
  assert.match(res.diagnostics![0].message, /HTTP 500: Operation failed.*req500bb/);
  res = await withBrowserFetch(async () => new Response("<html>Bad Gateway</html>", { status: 502 }), () => getProductRecommendations(look, profile, "all", true));
  assert.match(res.diagnostics![0].message, /HTTP 502/);
  res = await withBrowserFetch(async () => new Response("<html>not json</html>", { status: 200 }), () => getProductRecommendations(look, profile, "all", true));
  assert.equal(res.diagnostics?.[0].status, "http_error");
  assert.match(res.diagnostics![0].message, /not with product data/);
  console.log("✓ Test 4 Passed");

  // -------------------------------------------------------------------------
  // Part 2: the real route handler, Tavily rate-limited -> OpenAI fallback
  // -------------------------------------------------------------------------
  const db = await getDb();
  const now = new Date().toISOString();
  await db.query("INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)", ["user-1", "a@example.com", "A", "x", now, now]);
  const token = await createSession("user-1");

  const MYNTRA_STUD = "https://www.myntra.com/earrings/giva/giva-925-sterling-silver-gold-plated-contemporary-studs/24389998/buy";
  const MYNTRA_JUTTI = "https://www.myntra.com/flats/anouk/anouk-women-embellished-ethnic-mojaris-flats/26571834/buy";
  const MYNTRA_KURTA = "https://www.myntra.com/kurta-sets/anouk/anouk-women-ivory-embroidered-kurta-set/27651933/buy";
  const ld = (name: string, price: string) =>
    `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name, brand: { name: name.split(" ")[0] }, image: "https://assets.myntassets.com/x.jpg", offers: { price, priceCurrency: "INR" } })}</script>`;
  const retailerPages: Record<string, string> = {
    [MYNTRA_STUD]: ld("GIVA 925 Sterling Silver Gold-Plated Contemporary Studs Earrings", "759"),
    [MYNTRA_JUTTI]: ld("Anouk Women Silver-Toned Embellished Ethnic Mojaris Flats", "487"),
    [MYNTRA_KURTA]: ld("Anouk Women Ivory Embroidered Kurta Set", "1899"),
  };
  let tavilyCalls = 0;
  let webSearchCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("api.tavily.com")) {
      tavilyCalls++;
      return new Response(JSON.stringify({ detail: { error: "This request exceeds your plan's set usage limit." } }), { status: 432 });
    }
    if (url.endsWith("/responses")) {
      webSearchCalls++;
      const text: string = JSON.parse(String(init?.body)).input[0].content[0].text;
      const pageUrl = /jewellery/.test(text) ? MYNTRA_STUD : /mojaris/.test(text) ? MYNTRA_JUTTI : /outfit/.test(text) ? MYNTRA_KURTA : null;
      const products = pageUrl ? [{ pageUrl, title: retailerPages[pageUrl].match(/"name":"([^"]+)"/)![1], brand: "x", retailer: "Myntra" }] : [];
      return json({ id: "r", object: "response", status: "completed", model: "gpt-4o-mini", output: [{ id: "m", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ products }), annotations: [] }] }] }, 200);
    }
    if (retailerPages[url]) return new Response(retailerPages[url], { status: 200, headers: { "content-type": "text/html" } });
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const callRoute = (body: unknown, cookie?: string) =>
    productRoute(new Request("http://localhost/api/product-recommendations", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }));

  console.log("\n[Test 5] Route: signed-out requests get a real 401 with a request id...");
  const unauth = await callRoute({ look, profile });
  assert.equal(unauth.status, 401);
  assert.match(unauth.headers.get("x-request-id") ?? "", /^[0-9a-f]{8}$/);
  console.log("✓ Test 5 Passed");

  console.log("\n[Test 6] Route: jewellery, footwear and outfit discovery with Tavily 432 -> OpenAI fallback...");
  for (const [category, url, price] of [["jewellery", MYNTRA_STUD, 759], ["footwear", MYNTRA_JUTTI, 487], ["outfit", MYNTRA_KURTA, 1899]] as const) {
    tavilyCalls = 0;
    webSearchCalls = 0;
    logs.length = 0;
    const r = await callRoute({ look, profile, category, forceRefresh: true }, `letstyle_session=${token}`);
    assert.equal(r.status, 200, `${category}: HTTP 200`);
    const requestId = r.headers.get("x-request-id");
    assert.match(requestId ?? "", /^[0-9a-f]{8}$/);
    const data = await r.json();
    const product = data.products.find((p: any) => p.productUrl === url);
    assert.ok(product?.isVerified, `${category}: verified product returned`);
    assert.equal(product.price, price);
    assert.ok(tavilyCalls >= 1 && webSearchCalls >= 1, `${category}: Tavily tried first, OpenAI fallback used`);
    assert.equal(data.diagnostics?.find((d: any) => d.keyName === "TAVILY_API_KEY")?.status, "rate_limited");
    const finished = logs.find((l) => l.msg === "Product discovery request finished");
    assert.ok(finished, `${category}: request-level log written`);
    assert.equal(finished!.obj.requestId, requestId);
    assert.equal(finished!.obj.httpStatus, 200);
    assert.equal(finished!.obj.category, category);
    assert.ok(typeof finished!.obj.ms === "number");
    const logged = JSON.stringify(finished!.obj);
    assert.ok(!/sk-test|tvly-test|letstyle_session|a@example\.com|user-1/.test(logged), "No keys, tokens or personal data in the log");
  }
  console.log("✓ Test 6 Passed");

  console.log("\n[Test 7] End to end: the browser service against the real route...");
  clearClientProductCache();
  const realFetch = globalThis.fetch;
  res = await withBrowserFetch(async (url, init) => {
    assert.equal(url, "/api/product-recommendations", "Relative same-origin URL");
    const headers = new Headers(init?.headers);
    headers.set("cookie", `letstyle_session=${token}`); // the browser attaches the session cookie
    const prevFetch = globalThis.fetch;
    globalThis.fetch = realFetch; // let the route reach the provider mocks
    try {
      return await productRoute(new Request(`http://localhost${url}`, { ...init, headers }));
    } finally {
      globalThis.fetch = prevFetch;
    }
  }, () => getProductRecommendations(look, profile, "jewellery", true));
  assert.equal(res.status, "success");
  assert.ok(res.products.some((p) => p.productUrl === MYNTRA_STUD && p.isVerified));
  console.log("✓ Test 7 Passed");

  console.log("\n======================================================================");
  console.log("ALL PRODUCT DISCOVERY REQUEST TESTS PASSED");
  console.log("======================================================================");
}

main()
  .then(
    () => 0,
    (err) => {
      console.error("\n✗ TEST FAILED:", err);
      return 1;
    },
  )
  .then((code) => {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        fs.rmSync(dbFile + suffix, { force: true });
      } catch {
        // SQLite may still hold the file on Windows; it lives in the OS temp dir.
      }
    }
    process.exit(code);
  });
