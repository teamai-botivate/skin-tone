// OPTIONAL live integration test for product discovery. Makes REAL (paid) Tavily/OpenAI calls,
// so it only runs when explicitly enabled:
//   RUN_LIVE_SEARCH_TESTS=1 npx tsx scripts/live-product-search.integration.mjs
// Exit codes: 0 = verified live products returned, 1 = providers healthy but no verified
// products, 2 = search provider failure (quota, key, timeout), 3 = skipped/misconfigured.
import fs from 'node:fs';
import assert from 'node:assert/strict';

if (process.env.RUN_LIVE_SEARCH_TESTS !== '1') {
  console.log('Skipping live product search integration test (set RUN_LIVE_SEARCH_TESTS=1 to run; uses paid API credits).');
  process.exit(0);
}

if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq !== -1 && !line.startsWith('#')) {
      process.env[line.slice(0, eq).trim()] ??= line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
}
if (!process.env.TAVILY_API_KEY && !process.env.OPENAI_API_KEY) {
  console.error('Neither TAVILY_API_KEY nor OPENAI_API_KEY is configured.');
  process.exit(3);
}

const { generateFallbackLooks } = await import('../src/features/recommendations/services/recommendation-engine.ts');
const { searchProductsForLook } = await import('../src/lib/product-search.ts');

const profile = {
  pronouns: 'Kids / Boys styling',
  gender: 'boy',
  ageGroup: '6-10',
  appearance: { skinTone: 'Medium', undertone: 'Warm', confidence: 90, contrast: 'Medium' },
  style: ['Casual'],
  colorsLove: ['Maroon', 'Gold'],
  colorsAvoid: ['Neon Green'],
  restrictions: [],
  occasion: 'Goa vacation',
  impression: [],
  budget: '₹2,000 - ₹5,000',
  customStyleNotes: 'Comfortable, breathable fabrics for warm weather',
};
const look = generateFallbackLooks(profile)[0];

const res = await searchProductsForLook(look, profile, 'outfit', true);
const providerFailures = (res.diagnostics || []).filter((d) => d.status !== 'ok');

console.log(`Status: ${res.status}, products: ${res.products.length}`);
for (const d of res.diagnostics || []) console.log(`  [${d.provider}] ${d.status}: ${d.message}`);

if (res.products.length > 0) {
  for (const p of res.products) {
    assert.equal(p.source, 'live_search', `Non-live product returned: ${p.productName}`);
    assert.ok(!/kurta|dhoti/i.test(p.productName), `Resort look must not return ${p.productName}`);
    console.log(`  - ${p.productName} | ${p.retailer} | ${p.formattedPrice ?? 'price unverified'} | ${p.productUrl}`);
  }
  console.log('LIVE PASS: verified live products returned.');
  process.exit(0);
}

if (providerFailures.length > 0) {
  console.error('LIVE FAIL (provider): no products because a search provider failed; see diagnostics above.');
  process.exit(2);
}
console.error('LIVE FAIL (no verified products): providers responded but nothing passed verification. Check the "No product candidates discovered" / candidate drop logs.');
process.exit(1);
