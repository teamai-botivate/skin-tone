import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Fully offline regression for "CLIENT — Cause: Invalid request body" on product discovery.
//
// Root cause (builds up to commit c33919b): the Refresh / Retry control sends the ACTIVE TAB as
// `category`. The combined "Footwear & Accessories" tab's id is "footwear-accessories", but the
// server's request schema only allowed outfit|makeup|jewellery|accessories|footwear|all, so the
// shared Zod guard rejected every such request with HTTP 400 "Invalid request body" — for men,
// women and kids alike. The client then showed that 400 as a "CLIENT" diagnostic.
//
// A temp SQLite DB holds a real session; Tavily, OpenAI web search and retailer pages are mocked.
const dbFile = path.join(os.tmpdir(), `letstyle-validation-${process.pid}-${Date.now()}.db`);
process.env.SQLITE_DB_PATH = dbFile;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.OPENAI_API_KEY = "sk-test-stub-key-not-real";
process.env.TAVILY_API_KEY = "tvly-test-stub-key-not-real";

import { z } from "zod";
import { logger } from "../src/lib/logger";
import { getDb } from "../src/lib/db";
import { createSession } from "../src/lib/auth";
import { POST as productRoute } from "../src/app/api/product-recommendations/route";
import { getProductRecommendations, clearClientProductCache } from "../src/features/shopping/services/product-recommendations";
import { ProductRecommendationsRequestSchema, type LookRecommendation, type SkinTuneProfile } from "../src/lib/skintune-schemas";
logger.level = "fatal";

console.log("======================================================================");
console.log("REGRESSION: PRODUCT DISCOVERY 'Invalid request body' (category tab mismatch)");
console.log("======================================================================");

// ---------------------------------------------------------------------------
// One profile + look per audience (shape exactly as the browser state holds them)
// ---------------------------------------------------------------------------
const profileOf = (patch: Partial<SkinTuneProfile>): SkinTuneProfile =>
  ({
    name: "T", pronouns: "", gender: "", ageGroup: "25–34", height: "", photoUrl: "data:image/jpeg;base64,AAAA", bodyPhotoUrl: "",
    appearance: { skinTone: "Medium", undertone: "Warm", confidence: 88, contrast: "Medium" },
    bodyBuild: "", fit: "", style: ["Casual"], colorsLove: ["Navy"], colorsAvoid: [], restrictions: [],
    occasion: "Birthday", impression: [], budget: "₹2K–₹5K", customStyleNotes: "", ...patch,
  }) as SkinTuneProfile;

const lookOf = (id: string, pieces: Array<[string, string]>, footwear: string, accessories: string): LookRecommendation =>
  ({
    id, title: `Look ${id}`, note: "n", category: "", vibe: "easy", personaEnergy: "relaxed",
    palette: ["#1f2937", "#f5f5f4", "#9ca3af"], imageUrl: "/replace-with-generated/pending.webp",
    pieces: [...pieces.map(([category, name]) => ({ category, name, detail: "" })), { category: "Footwear", name: footwear, detail: "" }],
    outfit: pieces.map(([, n]) => n).join(" with "), outfitColor: "Navy", jewellery: "None", hairstyle: "Neat",
    makeup: "None", accessories, footwear,
    reasoning: ["a", "b", "c"], confidence: 90, applicableCategories: ["outfit", "footwear", "accessories"],
    // Looks generated since the last change also carry the reviewed brief
    styleIntent: { effectiveOccasion: "Birthday", themeOrAesthetic: "casual", styleDirection: "western", mustInclude: [], mustAvoid: [] },
  }) as unknown as LookRecommendation;

const AUDIENCES = [
  {
    name: "boys",
    profile: profileOf({ pronouns: "Kids / Boys styling", gender: "boy", ageGroup: "6-10" }),
    look: lookOf("look-boys", [["Top", "Navy Graphic Cotton T-shirt"], ["Bottom", "Grey Cotton Joggers"]], "White Canvas Sneakers", "Navy baseball cap"),
    footwearWord: "sneakers",
  },
  {
    name: "men",
    profile: profileOf({ pronouns: "Men’s styling", gender: "men" }),
    look: lookOf("look-men", [["Top", "Navy Linen Shirt"], ["Bottom", "Beige Chino Shorts"]], "Tan Leather Loafers", "Brown leather belt"),
    footwearWord: "loafers",
  },
  {
    name: "women",
    profile: profileOf({ pronouns: "Women’s styling", gender: "women" }),
    look: lookOf("look-women", [["Top", "Navy Linen Shirt"], ["Bottom", "White Wide-Leg Trousers"]], "Tan Block Heels", "Tan leather belt"),
    footwearWord: "heels",
  },
];

// ---------------------------------------------------------------------------
// Mocked providers: Tavily returns one real-shaped product page per footwear type;
// retailer pages are synthetic JSON-LD fixtures. Any other request fails the test.
// ---------------------------------------------------------------------------
const FOOTWEAR_PAGES: Record<string, { url: string; title: string; price: number }> = {
  sneakers: { url: "https://www.myntra.com/casual-shoes/hrx/hrx-boys-white-canvas-sneakers/28457163/buy", title: "HRX Boys White Canvas Sneakers", price: 899 },
  loafers: { url: "https://www.myntra.com/casual-shoes/roadster/roadster-men-tan-leather-loafers/29468274/buy", title: "Roadster Men Tan Leather Loafers", price: 1799 },
  heels: { url: "https://www.myntra.com/heels/dressberry/dressberry-women-tan-block-heels/30579385/buy", title: "DressBerry Women Tan Block Heels", price: 1299 },
};
const ld = (name: string, price: number) =>
  `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name, brand: { name: name.split(" ")[0] }, image: "https://assets.myntassets.com/x.jpg", offers: { price: String(price), priceCurrency: "INR" } })}</script>`;
let tavilyQueries: string[] = [];

const providerFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("api.tavily.com")) {
    const query = String(JSON.parse(String(init?.body)).query);
    tavilyQueries.push(query);
    const hit = Object.entries(FOOTWEAR_PAGES).find(([word]) => new RegExp(`\\b${word}\\b`, "i").test(query));
    const results = hit ? [{ url: hit[1].url, title: `${hit[1].title} | Myntra`, content: "" }] : [];
    return new Response(JSON.stringify({ results, images: [] }), { status: 200 });
  }
  if (url.endsWith("/responses")) {
    const out = { id: "r", object: "response", status: "completed", model: "gpt-4o-mini", output: [{ id: "m", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ products: [] }), annotations: [] }] }] };
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  }
  const page = Object.values(FOOTWEAR_PAGES).find((p) => p.url === url);
  if (page) return new Response(ld(page.title, page.price), { status: 200, headers: { "content-type": "text/html" } });
  throw new Error(`Unexpected request: ${url}`);
}) as typeof fetch;

async function main() {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.query("INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)", ["user-v", "v@example.com", "V", "x", now, now]);
  const cookie = `letstyle_session=${await createSession("user-v")}`;
  globalThis.fetch = providerFetch;

  const callRoute = (rawBody: string) =>
    productRoute(new Request("http://localhost/api/product-recommendations", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: rawBody,
    }));
  /** The exact JSON the browser service sends (same construction as getProductRecommendations). */
  const browserBody = (look: LookRecommendation, profile: SkinTuneProfile, category?: string, forceRefresh?: boolean) => {
    const { photoUrl: _photoUrl, ...profileForRequest } = profile;
    return JSON.stringify({ look, profile: profileForRequest, category: category && category !== "all" ? category : undefined, forceRefresh });
  };

  // -------------------------------------------------------------------------
  console.log("\n[Test 1] Root cause: the old schema rejects the Footwear & Accessories tab's category...");
  // The request schema as it was up to c33919b: identical except for the category enum
  const OldSchema = ProductRecommendationsRequestSchema.extend({
    category: z.enum(["outfit", "makeup", "jewellery", "accessories", "footwear", "all"]).optional(),
  });
  for (const a of AUDIENCES) {
    const failingPayload = JSON.parse(browserBody(a.look, a.profile, "footwear-accessories", true));
    const old = OldSchema.safeParse(failingPayload);
    assert.equal(old.success, false, `${a.name}: old schema rejected the tab request`);
    assert.deepEqual(Object.keys(old.error!.flatten().fieldErrors), ["category"], `${a.name}: 'category' was the only invalid field`);
    assert.equal(ProductRecommendationsRequestSchema.safeParse(failingPayload).success, true, `${a.name}: current schema accepts it`);
    // Every other tab value the UI can send is accepted, and the 'all' tab omits category
    for (const tab of ["all", "outfit", "makeup", "jewellery", "footwear-accessories"]) {
      assert.equal(ProductRecommendationsRequestSchema.safeParse(JSON.parse(browserBody(a.look, a.profile, tab, true))).success, true, `${a.name}: tab "${tab}"`);
    }
  }
  console.log("✓ Test 1 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 2] The exact failing request now succeeds on the real route (boys, men, women)...");
  for (const a of AUDIENCES) {
    tavilyQueries = [];
    const res = await callRoute(browserBody(a.look, a.profile, "footwear-accessories", true));
    assert.equal(res.status, 200, `${a.name}: HTTP 200, not 400`);
    const data = await res.json();
    assert.ok(!JSON.stringify(data).includes("Invalid request body"));
    assert.ok(data.groups.length > 0, `${a.name}: footwear/accessories requirements were planned`);
    assert.ok(data.groups.every((g: { category: string }) => ["footwear", "accessories", "jewellery"].includes(g.category)), `${a.name}: only the tab's categories are searched`);
    const page = FOOTWEAR_PAGES[a.footwearWord];
    const verified = data.products.find((p: { productUrl: string }) => p.productUrl === page.url);
    assert.ok(verified?.isVerified, `${a.name}: footwear verified on its product page`);
    assert.equal(verified.price, page.price, `${a.name}: price read from the retailer page`);
    assert.ok(tavilyQueries.length > 0, `${a.name}: live discovery ran`);
  }
  console.log("✓ Test 2 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 3] Initial discovery and Retry discovery through the browser service...");
  for (const a of AUDIENCES) {
    for (const [label, category, forceRefresh] of [
      ["initial discovery (All tab)", "all", undefined],
      ["Retry discovery", "all", undefined],
      ["Refresh on Footwear & Accessories tab", "footwear-accessories", true],
      ["Refresh on Outfit tab", "outfit", true],
    ] as const) {
      clearClientProductCache();
      const real = globalThis.fetch;
      const sent: { status?: number } = {};
      globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url) !== "/api/product-recommendations") return providerFetch(url, init);
        const headers = new Headers(init?.headers);
        headers.set("cookie", cookie);
        const r = await productRoute(new Request(`http://localhost${url}`, { ...init, headers }));
        sent.status = r.status;
        return r;
      }) as typeof fetch;
      try {
        const res = await getProductRecommendations(a.look, a.profile, category as never, forceRefresh);
        assert.equal(sent.status, 200, `${a.name} / ${label}: HTTP 200`);
        assert.notEqual(res.status, "unavailable", `${a.name} / ${label}: discovery ran`);
        assert.ok(!(res.diagnostics ?? []).some((d) => /Invalid request body/.test(d.message)), `${a.name} / ${label}: no request-validation error`);
      } finally {
        globalThis.fetch = real;
      }
    }
  }
  console.log("✓ Test 3 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 4] Genuinely invalid bodies are still rejected with the invalid field named...");
  const a = AUDIENCES[1];
  const base = JSON.parse(browserBody(a.look, a.profile, "footwear-accessories", true));
  const cases: Array<[string, unknown, string]> = [
    ["unknown category", { ...base, category: "shoes" }, "category"],
    ["forceRefresh as text", { ...base, forceRefresh: "yes" }, "forceRefresh"],
    ["missing look", { ...base, look: undefined }, "look"],
    ["look without title", { ...base, look: { ...base.look, title: undefined } }, "look"],
    ["null profile field", { ...base, profile: { ...base.profile, occasion: null } }, "profile"],
  ];
  for (const [label, body, field] of cases) {
    const res = await callRoute(JSON.stringify(body));
    assert.equal(res.status, 400, `${label}: HTTP 400`);
    const data = await res.json();
    assert.equal(data.error, "Invalid request body");
    assert.ok(field in data.details.fieldErrors, `${label}: '${field}' reported as the invalid field`);
  }
  const malformed = await callRoute("{not json");
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, "Invalid JSON request body");
  console.log("✓ Test 4 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 5] A real validation failure is still shown to the user, not hidden...");
  clearClientProductCache();
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookie);
    return productRoute(new Request(`http://localhost${url}`, { ...init, headers }));
  }) as typeof fetch;
  try {
    const res = await getProductRecommendations(a.look, a.profile, "shoes" as never, true);
    assert.equal(res.status, "unavailable");
    assert.match(res.diagnostics?.[0]?.message ?? "", /HTTP 400: Invalid request body/);
  } finally {
    globalThis.fetch = real;
  }
  console.log("✓ Test 5 Passed");

  console.log("\nAll product discovery request-validation tests passed.");
}

main()
  .then(() => 0, (err) => { console.error("\n✗ TEST FAILED:", err); return 1; })
  .then((code) => {
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.rmSync(dbFile + suffix, { force: true }); } catch { /* temp file; Windows may hold it */ }
    }
    process.exit(code);
  });
