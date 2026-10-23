import { strict as assert } from 'node:assert';

const BASE_URL = 'http://localhost:3000';

const testProfile = {
  name: 'Anushka',
  pronouns: 'she/her/women',
  ageGroup: '25–34',
  height: '5ft 4in',
  bodyBuild: 'Average',
  appearance: {
    skinTone: 'Medium',
    undertone: 'Warm',
    confidence: 92,
    contrast: 'High',
  },
  fit: 'Regular',
  style: ['Traditional', 'Festive'],
  colorsLove: ['Pink', 'Rani Pink', 'Gold'],
  colorsAvoid: ['Neon Yellow'],
  restrictions: [],
  occasion: 'Garba',
  impression: ['Festive', 'Confident', 'Radiant'],
  budget: '₹5,000 - ₹10,000',
  customStyleNotes: 'Authentic Gujarati mirror-work for Navratri dancing',
};

async function testHealth() {
  console.log('========================================');
  console.log('1. Testing /api/healthz...');
  console.log('========================================');
  const res = await fetch(`${BASE_URL}/api/healthz`);
  console.log('HTTP Status:', res.status);
  assert.equal(res.status, 200, 'Health endpoint should return 200');
  const data = await res.json();
  console.log('Status payload:', JSON.stringify(data, null, 2));
  assert.equal(data.status, 'ok');
  assert.equal(data.keys.openai.configured, true);
  // Verify secrets are NOT leaked in response
  const rawString = JSON.stringify(data);
  assert.equal(rawString.includes('sk-proj'), false, 'Never leak OpenAI key');
  assert.equal(rawString.includes('tvly-'), false, 'Never leak Tavily key');
  console.log('✓ /api/healthz passed cleanly!\n');
}

async function testRecommendations() {
  console.log('========================================');
  console.log('2. Testing /api/recommendations...');
  console.log('========================================');
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: testProfile }),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`HTTP Status: ${res.status} (took ${elapsed}s)`);
  assert.equal(res.status, 200, 'Recommendations should return 200');
  const data = await res.json();
  assert.ok(Array.isArray(data.recommendations), 'Should return recommendations array');
  assert.equal(data.recommendations.length, 5, 'Should return exactly 5 recommendations');

  // Verify that these are REAL AI-tailored recommendations and NOT the static mockLooks ("Quietly magnetic")
  const firstLook = data.recommendations[0];
  console.log('Look 1 Title:', firstLook.title);
  console.log('Look 1 Outfit:', firstLook.outfit);
  console.log('Look 1 Vibe:', firstLook.vibe);
  console.log('Look 1 Palette:', firstLook.palette);
  console.log('Look 1 Pieces count:', firstLook.pieces?.length);

  assert.notEqual(firstLook.title, 'Quietly magnetic', 'Must NOT return static mock look!');
  assert.notEqual(firstLook.title, 'The considered entrance', 'Must NOT return static mock look!');

  // Verify festive Garba relevance
  const combinedText = JSON.stringify(data.recommendations).toLowerCase();
  const isOccasionRelevant =
    combinedText.includes('garba') ||
    combinedText.includes('choli') ||
    combinedText.includes('lehenga') ||
    combinedText.includes('mirror') ||
    combinedText.includes('navratri') ||
    combinedText.includes('festive');
  assert.ok(isOccasionRelevant, 'Recommendations must be culturally & occasion relevant to Garba');

  console.log('✓ /api/recommendations passed with 5 genuine AI-generated personalized looks!\n');
  return firstLook;
}

async function testImageGeneration(look) {
  console.log('========================================');
  console.log('3. Testing /api/generate-image...');
  console.log('========================================');
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      look,
      profile: testProfile,
      context: { occasion: 'Garba', details: testProfile.customStyleNotes },
      photoUrl: undefined,
      siblingVibes: ['Radiant', 'Celebratory'],
    }),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`HTTP Status: ${res.status} (took ${elapsed}s)`);
  assert.equal(res.status, 200, 'Image generation should return 200');
  const data = await res.json();
  assert.ok(data.look, 'Response should contain look object');
  const imageUrl = data.look.imageUrl;
  console.log('Image URL prefix:', imageUrl?.slice(0, 60));
  console.log('Image data length:', imageUrl?.length);
  assert.ok(imageUrl, 'Must return a valid image URL');
  assert.ok(
    imageUrl.startsWith('data:image/jpeg;base64,') || imageUrl.startsWith('https://'),
    'Must be a valid data URI or secure image URL',
  );
  assert.ok(imageUrl.length > 50000, 'Image payload must be a real rendered image');
  assert.equal(imageUrl.includes('/replace-with-generated/'), false, 'Must NOT be a placeholder link');

  console.log('✓ /api/generate-image passed with real generated fashion visual!\n');
  return data.look;
}

async function testProductRecommendations(look) {
  console.log('========================================');
  console.log('4. Testing /api/product-recommendations...');
  console.log('========================================');
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/product-recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      look,
      profile: testProfile,
      category: 'all',
      forceRefresh: true,
    }),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`HTTP Status: ${res.status} (took ${elapsed}s)`);
  assert.equal(res.status, 200, 'Product recommendations should return 200');
  const data = await res.json();
  console.log('Total Products Found:', data.totalFound);
  console.log('Status:', data.status);
  console.log('Persona:', data.persona);

  assert.equal(data.status, 'success', 'Product recommendations status should be success');
  assert.ok(data.products && data.products.length > 0, 'Must return real matching products');

  console.log(`\nSample matched products (First 3 of ${data.products.length}):`);
  for (let i = 0; i < Math.min(3, data.products.length); i++) {
    const p = data.products[i];
    console.log(`  [${i + 1}] ${p.brand} - ${p.productName}`);
    console.log(`      Retailer: ${p.retailer} | Category: ${p.category} | Price: ${p.formattedPrice || `₹${p.price}`}`);
    console.log(`      URL: ${p.productUrl}`);
    console.log(`      Match reason: ${p.matchReason}\n`);

    // Verify retailer domain is an approved legitimate store
    assert.ok(p.productUrl.startsWith('https://'), 'Product URL must be secure HTTPS');
    assert.equal(p.productUrl.includes('12345678'), false, 'Must not be placeholder ID');
    assert.equal(p.productUrl.includes('example.com'), false, 'Must not be example domain');
    assert.ok(p.retailer && p.retailer !== 'Unknown', 'Must have identified retailer');
  }

  console.log('✓ /api/product-recommendations passed with verified retailer products!\n');
}

async function runAll() {
  console.log('STARTING COMPLETE VERIFICATION OF SKINTUNE AI FLOWS...\n');
  await testHealth();
  const look = await testRecommendations();
  const lookWithImage = await testImageGeneration(look);
  await testProductRecommendations(lookWithImage);
  console.log('========================================================');
  console.log('🎉 ALL THREE CORE FEATURES INDEPENDENTLY TESTED & VERIFIED!');
  console.log('========================================================');
}

runAll().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
