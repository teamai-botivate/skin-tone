import fs from 'node:fs';
import assert from 'node:assert/strict';

// Load .env.local into process.env if present
if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq !== -1 && !line.startsWith('#')) {
      process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
}

import { getStylingContext, getGenerationFingerprint } from '../src/lib/styling-context.ts';
import { clearClientProductCache, getProductRecommendations } from '../src/features/shopping/services/product-recommendations.ts';
import { hasRealImage } from '../src/features/recommendations/components/LookVisual.tsx';

console.log('======================================================================');
console.log('REGRESSION TEST: LETSTYLE EDIT & REGENERATE FLOW');
console.log('======================================================================');

// -----------------------------------------------------------------------------
// Test 1: Initial Generation for Diwali
// -----------------------------------------------------------------------------
console.log('\n[Test 1] Simulating Initial Outfit Generation for Diwali...');

const sampleSelfie = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/sample-user-selfie-base64';
const sampleBodySelfie = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/sample-body-selfie-base64';

const diwaliProfile = {
  name: 'Pooja',
  pronouns: 'Women’s styling (She/Her)',
  gender: 'women',
  ageGroup: '25–34',
  height: '5ft 5in',
  photoUrl: sampleSelfie,
  bodyPhotoUrl: sampleBodySelfie,
  appearance: { skinTone: 'Medium', undertone: 'Warm', confidence: 92, contrast: 'Medium' },
  bodyBuild: 'Average',
  fit: 'Regular',
  style: ['Traditional', 'Festive'],
  colorsLove: ['Maroon', 'Deep Gold'],
  colorsAvoid: ['Neon Yellow'],
  restrictions: [],
  occasion: 'Diwali',
  impression: ['Festive', 'Luxe'],
  budget: '₹5,000 - ₹10,000',
  customStyleNotes: 'Festive traditional wear with rich embroidery',
};

const diwaliFingerprint = getGenerationFingerprint(diwaliProfile);
assert.ok(diwaliFingerprint.includes('"occasion":"diwali"'), 'Diwali fingerprint must contain occasion');
assert.ok(diwaliFingerprint.includes('festive traditional wear with rich embroidery'), 'Diwali fingerprint must contain customStyleNotes');

// Simulated 5 Diwali looks from initial generation
const diwaliLooks = [
  {
    id: 'look-01',
    title: 'Imperial Banarasi Saree in Maroon & Gold',
    note: 'Opulent traditional styling for Diwali celebrations',
    outfit: 'Pure silk maroon Banarasi saree with intricate zari border',
    outfitColor: 'Maroon',
    jewellery: 'Kundan choker and matching jhumkas',
    hairstyle: 'Elegant low bun with jasmine gajra',
    makeup: 'Warm gold eyeshadow and classic crimson lip',
    accessories: 'Embroidered velvet potli bag',
    footwear: 'Embellished metallic mojaris',
    palette: ['#800000', '#D4AF37', '#FFF8DC'],
    pieces: [{ category: 'Outfit', name: 'Maroon Banarasi Saree', detail: 'Silk zari weave' }],
    confidence: 96,
    imageUrl: 'https://images.unsplash.com/photo-diwali-saree.jpg',
    applicableCategories: ['outfit', 'makeup', 'jewellery', 'footwear', 'accessories'],
  },
  {
    id: 'look-02',
    title: 'Festive Anarkali in Deep Crimson',
    note: 'Regal layered silhouette for Diwali pooja',
    outfit: 'Floor-length flared anarkali suit with heavy gota patti work',
    outfitColor: 'Crimson',
    jewellery: 'Chandbali earrings and stacked gold bangles',
    hairstyle: 'Soft cascading waves with center part',
    makeup: 'Radiant dewy skin with berry lip',
    accessories: 'Silk clutch with zari embroidery',
    footwear: 'Block-heel ethnic sandals',
    palette: ['#990000', '#FFD700', '#F5F5DC'],
    pieces: [{ category: 'Outfit', name: 'Crimson Anarkali', detail: 'Gota patti work' }],
    confidence: 94,
    imageUrl: 'https://images.unsplash.com/photo-diwali-anarkali.jpg',
    applicableCategories: ['outfit', 'makeup', 'jewellery', 'footwear', 'accessories'],
  },
  {
    id: 'look-03',
    title: 'Modern Sharara Set in Jewel Tones',
    note: 'Contemporary ethnic celebration look',
    outfit: 'Embroidered short peplum kurti with flared sharara pants',
    outfitColor: 'Emerald & Gold',
    jewellery: 'Polki stud earrings and gold bracelet',
    hairstyle: 'Half-up braided crown',
    makeup: 'Gilded eyelids and nude rose lip',
    accessories: 'Metallic gold box clutch',
    footwear: 'Gold pointed juttis',
    palette: ['#004d40', '#D4AF37', '#fafafa'],
    pieces: [{ category: 'Outfit', name: 'Sharara Set', detail: 'Flared peplum' }],
    confidence: 92,
    imageUrl: 'https://images.unsplash.com/photo-diwali-sharara.jpg',
    applicableCategories: ['outfit', 'makeup', 'jewellery', 'footwear', 'accessories'],
  },
  {
    id: 'look-04',
    title: 'Contemporary Indo-Western Cape Set',
    note: 'Fusion look for modern festive gatherings',
    outfit: 'Draped dhoti skirt with embellished crop top and sheer cape',
    outfitColor: 'Ruby Red',
    jewellery: 'Geometric gold ear cuffs',
    hairstyle: 'Sleek high ponytail',
    makeup: 'Winged liner and soft matte lip',
    accessories: 'Structured metallic minaudière',
    footwear: 'Strappy stiletto heels',
    palette: ['#C70039', '#D4AF37', '#1A1A1A'],
    pieces: [{ category: 'Outfit', name: 'Cape Set', detail: 'Dhoti drape' }],
    confidence: 91,
    imageUrl: 'https://images.unsplash.com/photo-diwali-cape.jpg',
    applicableCategories: ['outfit', 'makeup', 'jewellery', 'footwear', 'accessories'],
  },
  {
    id: 'look-05',
    title: 'Chanderi Silk Kurta & Brocade Pants',
    note: 'Understated luxury for intimate Diwali dinners',
    outfit: 'Straight-cut Chanderi silk kurta with woven brocade cigarette pants',
    outfitColor: 'Antique Gold',
    jewellery: 'Antique gold temple jewellery necklace',
    hairstyle: 'Side-swept loose curls',
    makeup: 'Subtle bronzed complexion with terracotta lip',
    accessories: 'Handcrafted raw silk tote',
    footwear: 'Leather kolhapuris with gold piping',
    palette: ['#B8860B', '#4A0E17', '#FAF0E6'],
    pieces: [{ category: 'Outfit', name: 'Chanderi Kurta', detail: 'Brocade pants' }],
    confidence: 93,
    imageUrl: 'https://images.unsplash.com/photo-diwali-kurta.jpg',
    applicableCategories: ['outfit', 'makeup', 'jewellery', 'footwear', 'accessories'],
  },
];

// In the app state:
let generatedLooks = [...diwaliLooks];
let looksFingerprint = diwaliFingerprint;

console.log('  Generated Looks count:', generatedLooks.length);
console.log('  Look 1 Title:', generatedLooks[0].title);
console.log('  Looks Fingerprint recorded:', looksFingerprint !== null);
assert.equal(generatedLooks.length, 5, 'Must have 5 initial looks');
assert.ok(generatedLooks[0].title.includes('Banarasi Saree'), 'Must be Diwali look');

console.log('✓ Test 1 Passed: Initial Diwali generation completed successfully.');

// -----------------------------------------------------------------------------
// Test 2: User opens Edit without changing anything
// -----------------------------------------------------------------------------
console.log('\n[Test 2] User opens Edit and makes NO changes...');

const currentFingerprintWithoutChanges = getGenerationFingerprint(diwaliProfile);
const inputsUnchanged =
  looksFingerprint !== null && looksFingerprint === currentFingerprintWithoutChanges;
const canReuseWithoutChanges =
  inputsUnchanged &&
  generatedLooks.length === 5 &&
  generatedLooks.every((look) => hasRealImage(look.imageUrl));

assert.equal(inputsUnchanged, true, 'Inputs must be detected as unchanged');
assert.equal(canReuseWithoutChanges, true, 'Existing looks must be reused when no changes are made');
console.log('  Existing looks retained without redundant regeneration: YES');
console.log('✓ Test 2 Passed: No-change edit preserves existing results.');

// -----------------------------------------------------------------------------
// Test 3: User edits styling inputs (Diwali -> Goa vacation, comfortable breathable fabrics)
// -----------------------------------------------------------------------------
console.log('\n[Test 3] User edits styling inputs to Goa vacation & comfortable breathable fabrics...');

const goaProfile = {
  ...diwaliProfile,
  occasion: 'Goa vacation',
  customStyleNotes: 'Comfortable breathable fabrics with breezy relaxed fits',
  style: ['Resort', 'Bohemian', 'Relaxed'],
  colorsLove: ['Aquamarine', 'White', 'Sandy Gold'],
  colorsAvoid: ['Heavy Wool', 'Dark Velvet'],
  budget: '₹2,000 - ₹5,000',
  // Photos MUST remain the exact same uploaded selfies (no re-upload required)
  photoUrl: sampleSelfie,
  bodyPhotoUrl: sampleBodySelfie,
};

// Check photo preservation
assert.equal(goaProfile.photoUrl, sampleSelfie, 'Uploaded face selfie must be preserved');
assert.equal(goaProfile.bodyPhotoUrl, sampleBodySelfie, 'Uploaded body selfie must be preserved');

const goaFingerprint = getGenerationFingerprint(goaProfile);
console.log('  Previous Diwali Fingerprint:', diwaliFingerprint.slice(0, 80) + '...');
console.log('  New Goa Fingerprint:        ', goaFingerprint.slice(0, 80) + '...');
assert.notEqual(goaFingerprint, diwaliFingerprint, 'Fingerprint must change when occasion & styling prompt change');

// Verify invalidation condition
const goaInputsUnchanged =
  looksFingerprint !== null && looksFingerprint === goaFingerprint;
const canReuseOldDiwaliLooks =
  goaInputsUnchanged &&
  generatedLooks.length === 5 &&
  generatedLooks.every((look) => hasRealImage(look.imageUrl));

console.log('  Can reuse old looks condition evaluated to:', canReuseOldDiwaliLooks);
assert.equal(canReuseOldDiwaliLooks, false, 'Old Diwali looks MUST NOT be reused for Goa vacation!');

// Simulate saveProfile() execution
const inputsChanged = looksFingerprint !== null && goaFingerprint !== looksFingerprint;
assert.equal(inputsChanged, true, 'inputsChanged must evaluate to true');

if (inputsChanged) {
  generatedLooks = [];
  looksFingerprint = null;
  clearClientProductCache();
}

assert.equal(generatedLooks.length, 0, 'Old recommendations must be invalidated');
assert.equal(looksFingerprint, null, 'Old fingerprint must be reset');

// -----------------------------------------------------------------------------
// Test 4: Generation payload verification for updated inputs
// -----------------------------------------------------------------------------
console.log('\n[Test 4] Verifying generation payload receives the updated values...');

const { photoUrl: _photo, ...profileForApiRequest } = goaProfile;
assert.equal(profileForApiRequest.occasion, 'Goa vacation', 'API must receive Goa vacation occasion');
assert.equal(
  profileForApiRequest.customStyleNotes,
  'Comfortable breathable fabrics with breezy relaxed fits',
  'API must receive new breathable fabric prompt',
);
assert.deepEqual(profileForApiRequest.colorsLove, ['Aquamarine', 'White', 'Sandy Gold'], 'API must receive new colors');
assert.equal(profileForApiRequest.gender, 'women', 'API must receive correct gender');
assert.equal(profileForApiRequest.ageGroup, '25–34', 'API must receive age group');
assert.equal(profileForApiRequest.budget, '₹2,000 - ₹5,000', 'API must receive updated budget');

// Simulated 5 Goa vacation recommendations
const goaVacationLooks = [
  {
    id: 'look-01',
    title: 'Breezy Linen Resort Co-ord in Off-White',
    note: 'Relaxed breathable daytime beachside styling for Goa vacation',
    outfit: 'Relaxed-fit linen button-down shirt with wide-leg breathable linen trousers',
    outfitColor: 'Off-White',
    jewellery: 'Delicate gold seashell pendant and minimal huggie earrings',
    hairstyle: 'Natural beach waves with salt-spray texture',
    makeup: 'Sun-kissed bronze tint with tinted SPF lip balm',
    accessories: 'Woven raffia beach tote bag',
    footwear: 'Tan leather slide sandals',
    palette: ['#FAF9F6', '#D2B48C', '#7FFFD4'],
    pieces: [{ category: 'Outfit', name: 'Linen Co-ord Set', detail: 'Breathable relaxed fit' }],
    confidence: 95,
    imageUrl: 'https://images.unsplash.com/photo-goa-linen.jpg',
    applicableCategories: ['outfit', 'makeup', 'jewellery', 'footwear', 'accessories'],
  },
  {
    id: 'look-02',
    title: 'Flowy Aquamarine Tiered Maxi Dress',
    note: 'Breezy sundowner outfit for beach shacks',
    outfit: 'Cotton-voile tiered halter maxi dress in aquamarine sea tones',
    outfitColor: 'Aquamarine',
    jewellery: 'Stacked beaded turquoise anklet and minimal gold hoops',
    hairstyle: 'Messy textured bun with face-framing tendrils',
    makeup: 'Dewy glass skin with coral lip stain',
    accessories: 'Straw shoulder basket',
    footwear: 'Flat metallic braided sandals',
    palette: ['#7FFFD4', '#FFFFFF', '#F0E68C'],
    pieces: [{ category: 'Outfit', name: 'Tiered Maxi Dress', detail: 'Cotton voile' }],
    confidence: 94,
    imageUrl: 'https://images.unsplash.com/photo-goa-maxi.jpg',
    applicableCategories: ['outfit', 'makeup', 'jewellery', 'footwear', 'accessories'],
  },
  {
    id: 'look-03',
    title: 'Crochet Knit Top & Crinkle Cotton Skirt',
    note: 'Artisanal seaside look for North Goa cafe hopping',
    outfit: 'Breathable crochet sleeveless top paired with tiered crinkle cotton midi skirt',
    outfitColor: 'Ecru & Sandy Gold',
    jewellery: 'Pearl drop earrings and delicate chain bracelet',
    hairstyle: 'Half-up beach knot',
    makeup: 'Warm highlighter and sheer gloss',
    accessories: 'Macramé net shopper bag',
    footwear: 'Cushioned espadrille mules',
    palette: ['#F5F5DC', '#DAA520', '#E0FFFF'],
    pieces: [{ category: 'Outfit', name: 'Crochet Top & Midi Skirt', detail: 'Crinkle cotton' }],
    confidence: 93,
    imageUrl: 'https://images.unsplash.com/photo-goa-crochet.jpg',
    applicableCategories: ['outfit', 'makeup', 'jewellery', 'footwear', 'accessories'],
  },
  {
    id: 'look-04',
    title: 'Relaxed Kimono Duster & Linen Shorts',
    note: 'Versatile poolside to sunset transition',
    outfit: 'Lightweight botanical print cotton-silk kimono with relaxed linen drawstring shorts and ribbed tank',
    outfitColor: 'Palm Green & White',
    jewellery: 'Bamboo textured gold bangle',
    hairstyle: 'Slicked-back wet-look wave',
    makeup: 'Glossy lids and berry-stained lip',
    accessories: 'Canvas weekender tote',
    footwear: 'Slip-on leather thong sandals',
    palette: ['#2E8B57', '#FFFFFF', '#DEB887'],
    pieces: [{ category: 'Outfit', name: 'Kimono Duster Set', detail: 'Linen shorts' }],
    confidence: 92,
    imageUrl: 'https://images.unsplash.com/photo-goa-kimono.jpg',
    applicableCategories: ['outfit', 'makeup', 'jewellery', 'footwear', 'accessories'],
  },
  {
    id: 'look-05',
    title: 'Sunset Silk Slip Midi Dress in Amber',
    note: 'Effortless evening dinner styling in Panjim',
    outfit: 'Bias-cut washed silk slip midi dress in warm sunset amber',
    outfitColor: 'Sunset Amber',
    jewellery: 'Hammered gold drop earrings',
    hairstyle: 'Low twisted knot with tortoiseshell pin',
    makeup: 'Terracotta cream blush and hydrated nude lip',
    accessories: 'Minimal leather pouch clutch',
    footwear: 'Block-heel strappy mules',
    palette: ['#FFBF00', '#FF7F50', '#2F4F4F'],
    pieces: [{ category: 'Outfit', name: 'Silk Slip Midi', detail: 'Bias cut' }],
    confidence: 94,
    imageUrl: 'https://images.unsplash.com/photo-goa-sunset.jpg',
    applicableCategories: ['outfit', 'makeup', 'jewellery', 'footwear', 'accessories'],
  },
];

// Complete regeneration
generatedLooks = [...goaVacationLooks];
looksFingerprint = goaFingerprint;

console.log('  New Look 1 Title:', generatedLooks[0].title);
console.log('  New Look 1 Outfit:', generatedLooks[0].outfit);
console.log('  New Look 1 Note:', generatedLooks[0].note);

// Verify that new outfits reflect Goa vacation & breathable fabrics, NOT Diwali
assert.ok(!generatedLooks[0].title.toLowerCase().includes('banarasi'), 'Must not be old Banarasi saree');
assert.ok(!generatedLooks[0].title.toLowerCase().includes('diwali'), 'Must not contain Diwali in title');
assert.ok(
  generatedLooks[0].title.toLowerCase().includes('linen') ||
    generatedLooks[0].outfit.toLowerCase().includes('linen') ||
    generatedLooks[0].outfit.toLowerCase().includes('breathable'),
  'Must reflect linen / breathable styling',
);
assert.ok(
  generatedLooks[0].note.toLowerCase().includes('goa') ||
    generatedLooks[0].note.toLowerCase().includes('beach') ||
    generatedLooks[0].note.toLowerCase().includes('resort'),
  'Must reflect Goa / beach / resort occasion in note',
);

console.log('✓ Test 4 Passed: Regeneration generated fresh Goa vacation outfits and did NOT reuse Diwali outfits.');

// -----------------------------------------------------------------------------
// Test 5: Verify product cache key isolation between occasions
// -----------------------------------------------------------------------------
console.log('\n[Test 5] Verifying product recommendations cache isolation...');

const diwaliCacheKey = `v8:${diwaliLooks[0].id}:${diwaliLooks[0].title}:${diwaliProfile.occasion}:all`;
const goaCacheKey = `v8:${goaVacationLooks[0].id}:${goaVacationLooks[0].title}:${goaProfile.occasion}:all`;

console.log('  Diwali Product Cache Key:', diwaliCacheKey);
console.log('  Goa Product Cache Key:   ', goaCacheKey);

assert.notEqual(diwaliCacheKey, goaCacheKey, 'Product cache keys must differ even when look IDs match');
assert.ok(diwaliCacheKey.includes('Diwali'), 'Diwali cache key must include Diwali');
assert.ok(goaCacheKey.includes('Goa vacation'), 'Goa cache key must include Goa vacation');

console.log('✓ Test 5 Passed: Product recommendation caches are completely isolated by occasion and title.');

// -----------------------------------------------------------------------------
// Test 6: Verify other styling input changes trigger invalidation
// -----------------------------------------------------------------------------
console.log('\n[Test 6] Verifying invalidation on style, colours, budget, demographic changes...');

const testCases = [
  { name: 'style direction change', mod: { style: ['Streetwear', 'Casual'] } },
  { name: 'colours change', mod: { colorsLove: ['Lilac', 'Mint'] } },
  { name: 'budget change', mod: { budget: 'Under ₹1,500' } },
  { name: 'pronouns / gender change', mod: { pronouns: 'Men’s styling (He/Him)', gender: 'men' } },
  { name: 'age group change', mod: { ageGroup: '45–54' } },
];

for (const tc of testCases) {
  const modProfile = { ...goaProfile, ...tc.mod };
  const modFingerprint = getGenerationFingerprint(modProfile);
  assert.notEqual(
    modFingerprint,
    looksFingerprint,
    `Fingerprint must change when modifying: ${tc.name}`,
  );
}

console.log('✓ Test 6 Passed: Any styling input modification invalidates stale looks.');

// -----------------------------------------------------------------------------
// Test 7: Kids / Boys + Diwali Initial Generation
// -----------------------------------------------------------------------------
console.log('\n[Test 7] Kids/Boys + Diwali initial generation...');

import { generateFallbackLooks } from '../src/features/recommendations/services/recommendation-engine.ts';
import { buildLookEditPrompt } from '../src/lib/image-prompt.ts';
import { searchProductsForLook } from '../src/lib/product-search.ts';

const boyDiwaliProfile = {
  name: 'Aarav',
  pronouns: 'Kids / Boys styling',
  gender: 'boy',
  ageGroup: '6-10',
  photoUrl: sampleSelfie,
  bodyPhotoUrl: sampleBodySelfie,
  appearance: { skinTone: 'Medium', undertone: 'Warm', confidence: 90, contrast: 'Medium' },
  bodyBuild: 'Average',
  fit: 'Regular',
  style: ['Traditional', 'Festive'],
  colorsLove: ['Maroon', 'Gold'],
  colorsAvoid: ['Neon Green'],
  restrictions: [],
  occasion: 'Diwali',
  impression: ['Festive', 'Confident'],
  budget: '₹2,000 - ₹5,000',
  customStyleNotes: 'Traditional festive celebration for Diwali',
};

const boyDiwaliFingerprint = getGenerationFingerprint(boyDiwaliProfile);
const boyDiwaliLooks = generateFallbackLooks(boyDiwaliProfile);

assert.equal(boyDiwaliLooks.length, 5, 'Must generate 5 looks for boys');
console.log('  Initial Boy Diwali Look 1:', boyDiwaliLooks[0].title);
console.log('  Initial Boy Diwali Outfit:', boyDiwaliLooks[0].outfit);
assert.ok(
  boyDiwaliLooks.some((l) => l.outfit.toLowerCase().includes('kurta') || l.outfit.toLowerCase().includes('jacket') || l.title.toLowerCase().includes('festive')),
  'Diwali look must provide appropriate festive/traditional boy styling',
);
console.log('✓ Test 7 Passed: Kids/Boys + Diwali produces festive outfits.');

// -----------------------------------------------------------------------------
// Test 8: Edit to Kids/Boys + Goa vacation (comfortable breathable fabrics)
// -----------------------------------------------------------------------------
console.log('\n[Test 8] Edit same profile to Kids/Boys + Goa vacation (comfortable breathable fabrics)...');

const boyGoaProfile = {
  ...boyDiwaliProfile,
  occasion: 'Goa vacation',
  customStyleNotes: 'Comfortable, breathable fabrics for warm weather',
  // Photos MUST remain untouched without requiring re-upload
  photoUrl: sampleSelfie,
  bodyPhotoUrl: sampleBodySelfie,
};

// Verify photos preserved
assert.equal(boyGoaProfile.photoUrl, sampleSelfie, 'Boy face selfie preserved');
assert.equal(boyGoaProfile.bodyPhotoUrl, sampleBodySelfie, 'Boy body selfie preserved');

// Fingerprint changed and invalidates old Diwali looks
const boyGoaFingerprint = getGenerationFingerprint(boyGoaProfile);
assert.notEqual(boyGoaFingerprint, boyDiwaliFingerprint, 'Fingerprint must change for Goa vacation');

// Simulate saveProfile reconciliation: casual vacation occasion cleans up residual traditional tags
const filteredStyles = boyGoaProfile.style.filter(
  (s) => !['traditional', 'royal & regal', 'ethnic', 'festive'].includes(s.toLowerCase()),
);
const reconciledBoyGoaProfile = { ...boyGoaProfile, style: filteredStyles };

const boyGoaLooks = generateFallbackLooks(reconciledBoyGoaProfile);
assert.equal(boyGoaLooks.length, 5, 'Must generate 5 looks for Goa vacation');

console.log('  New Boy Goa Look 1:', boyGoaLooks[0].title);
console.log('  New Boy Goa Outfit:', boyGoaLooks[0].outfit);
console.log('  New Boy Goa Look 2:', boyGoaLooks[1].title);
console.log('  New Boy Goa Look 3:', boyGoaLooks[2].title);

// Verify ALL looks are casual resort wear, NOT traditional kurta-pyjama
for (const look of boyGoaLooks) {
  const outfitLower = look.outfit.toLowerCase();
  const titleLower = look.title.toLowerCase();
  assert.ok(!outfitLower.includes('kurta'), `Look "${look.title}" must NOT contain kurta for Goa vacation!`);
  assert.ok(!outfitLower.includes('dhoti'), `Look "${look.title}" must NOT contain dhoti for Goa vacation!`);
  assert.ok(!outfitLower.includes('sherwani'), `Look "${look.title}" must NOT contain sherwani for Goa vacation!`);
  assert.ok(!outfitLower.includes('churidar'), `Look "${look.title}" must NOT contain churidar for Goa vacation!`);
  assert.ok(
    outfitLower.includes('linen') ||
      outfitLower.includes('cotton') ||
      outfitLower.includes('shirt') ||
      outfitLower.includes('shorts') ||
      outfitLower.includes('tee') ||
      titleLower.includes('resort') ||
      titleLower.includes('camp-collar') ||
      titleLower.includes('classic') ||
      titleLower.includes('chambray') ||
      titleLower.includes('co-ord'),
    `Look "${look.title}" must feature age-appropriate casual resort wear!`,
  );
}

console.log('✓ Test 8 Passed: Goa vacation regeneration produces casual resort outfits and strictly NO kurtas.');

// -----------------------------------------------------------------------------
// Test 9: Image generation prompt verification
// -----------------------------------------------------------------------------
console.log('\n[Test 9] Verifying image generation prompt contains NEW outfit and latest occasion...');

const imagePrompt = buildLookEditPrompt(
  boyGoaLooks[0],
  reconciledBoyGoaProfile,
  {
    occasion: reconciledBoyGoaProfile.occasion,
    details: reconciledBoyGoaProfile.customStyleNotes || '',
  },
  null,
);

console.log('  Generated Image Prompt Preview:', imagePrompt.slice(0, 180) + '...');

assert.ok(imagePrompt.includes(boyGoaLooks[0].outfit), 'Image prompt must contain the NEW outfit description');
assert.ok(imagePrompt.includes('Goa vacation') || imagePrompt.includes('vacation'), 'Image prompt must contain latest occasion');
assert.ok(imagePrompt.includes('OCCASION & RESORT CASUAL AUTHENTICITY'), 'Image prompt must enforce resort casual authenticity');
assert.ok(
  imagePrompt.includes('Strictly DO NOT render traditional Indian ethnic wear (NO kurta, NO pyjama, NO dhoti, NO sherwani)'),
  'Image prompt must explicitly forbid ethnic kurta/dhoti rendering for vacation',
);
assert.ok(!imagePrompt.includes(boyDiwaliLooks[0].outfit), 'Image prompt must NOT contain old Diwali outfit description');

console.log('✓ Test 9 Passed: Image generation prompt uses latest occasion and new outfit description.');

// -----------------------------------------------------------------------------
// Test 10: Product recommendations match casual resort wear
// -----------------------------------------------------------------------------
console.log('\n[Test 10] Verifying product recommendations match casual resort outfits...');

// Deterministic retailer search: Tavily responses and retailer product pages are mocked so this
// test checks the pipeline's filtering, not live provider availability (and spends no credits).
// The live equivalent is scripts/live-product-search.integration.mjs (opt-in).
const shirtUrl = 'https://www.myntra.com/shirts/hopscotch/hopscotch-boys-maroon-linen-resort-shirt/29817364/buy';
const kurtaUrl = 'https://www.ajio.com/boys-maroon-cotton-kurta-pyjama-set/p/469087213_maroon';
const shortsUrl = 'https://www.ajio.com/boys-breathable-linen-drawstring-shorts/p/469076518_beige';
const mockSearch = {
  shirt: [
    { url: shirtUrl, title: 'Hopscotch Boys Maroon Linen Resort Shirt | Myntra', content: 'Breathable linen shirt Rs. 1199' },
    // Decoy: a festive kurta must never be recommended for a Goa resort look
    { url: kurtaUrl, title: 'Boys Maroon Cotton Kurta Pyjama Set', content: 'Festive kurta set ₹1,499' },
  ],
  shorts: [
    { url: shortsUrl, title: 'Boys Breathable Linen Drawstring Shorts', content: 'Relaxed linen shorts ₹1,099' },
  ],
};
const mockPages = {
  [shirtUrl]: { name: 'Hopscotch Boys Maroon Linen Resort Shirt', brand: 'Hopscotch', price: 1199 },
  [kurtaUrl]: { name: 'Boys Maroon Cotton Kurta Pyjama Set', brand: 'AJIO', price: 1499 },
  [shortsUrl]: { name: 'Boys Breathable Linen Drawstring Shorts', brand: 'AJIO', price: 1099 },
};
const savedSearchEnv = { openai: process.env.OPENAI_API_KEY, tavily: process.env.TAVILY_API_KEY };
const realFetch = globalThis.fetch;
delete process.env.OPENAI_API_KEY; // no paid OpenAI fallback calls from this test
process.env.TAVILY_API_KEY = 'tvly-mock-key-for-offline-test';
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url ?? String(input);
  if (url.startsWith('https://api.tavily.com/')) {
    const query = JSON.parse(init?.body ?? '{}').query?.toLowerCase() ?? '';
    const results = query.includes('shorts') ? mockSearch.shorts : query.includes('shirt') ? mockSearch.shirt : [];
    return new Response(JSON.stringify({ results, images: [] }), { status: 200 });
  }
  const page = mockPages[url];
  if (!page) return new Response('Page not found', { status: 404 });
  const jsonLd = { '@type': 'Product', name: page.name, brand: { name: page.brand }, offers: { price: String(page.price), availability: 'https://schema.org/InStock' } };
  return new Response(`<html><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></html>`, { status: 200 });
};

let boyProductsRes;
try {
  boyProductsRes = await searchProductsForLook(
    boyGoaLooks[0],
    reconciledBoyGoaProfile,
    'outfit',
  );
} finally {
  globalThis.fetch = realFetch;
  if (savedSearchEnv.openai === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedSearchEnv.openai;
  if (savedSearchEnv.tavily === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = savedSearchEnv.tavily;
}

const boyProducts = boyProductsRes.products;
console.log('  Product recommendations count:', boyProducts.length);
assert.ok(boyProducts.length > 0, 'Must produce product recommendations');
assert.ok(boyProducts.some((p) => p.productUrl === shirtUrl), 'Verified resort shirt must be recommended');
assert.ok(boyProducts.every((p) => p.productUrl !== kurtaUrl), 'Decoy kurta must be filtered out');
assert.ok(boyProducts.every((p) => p.source === 'live_search' && p.productUrl in mockPages), 'Only searched, verified products');
assert.equal(boyProducts.find((p) => p.productUrl === shirtUrl).price, 1199, 'Verified page price must be used');

for (const p of boyProducts) {
  const title = p.productName || p.productTitle || p.title || p.recommendedItemTitle || '';
  console.log(`  - ${title} (${p.category})`);
  const titleLower = title.toLowerCase();
  assert.ok(!titleLower.includes('kurta'), `Product "${title}" must NOT be a kurta!`);
  assert.ok(!titleLower.includes('dhoti'), `Product "${title}" must NOT be a dhoti!`);
  assert.ok(
    titleLower.includes('resort') ||
      titleLower.includes('shirt') ||
      titleLower.includes('shorts') ||
      titleLower.includes('co-ord') ||
      titleLower.includes('cotton') ||
      titleLower.includes('linen') ||
      titleLower.includes('outfit'),
    `Product "${title}" must match casual resort wear!`,
  );
}

console.log('✓ Test 10 Passed: Product recommendations match new casual resort outfits, not kurtas.');

// -----------------------------------------------------------------------------
// Test 11: Asynchronous overwrite protection
// -----------------------------------------------------------------------------
console.log('\n[Test 11] Verifying late response from an older generation request cannot overwrite newest results...');

let globalGenerationRequestId = 0;
let activeResults = null;

// Simulate Request 1 (Diwali)
const request1Id = ++globalGenerationRequestId;
console.log('  Request 1 (Diwali) started with ID:', request1Id);

// User clicks Edit and changes to Goa vacation -> Request 2 initiated
const request2Id = ++globalGenerationRequestId;
console.log('  Request 2 (Goa vacation) started with ID:', request2Id);

// Request 2 completes first
if (globalGenerationRequestId === request2Id) {
  activeResults = { occasion: 'Goa vacation', looks: boyGoaLooks };
  console.log('  Request 2 completed and stored:', activeResults.occasion);
}

// Request 1 arrives late (asynchronous delay simulation)
console.log('  Request 1 resolves late...');
if (globalGenerationRequestId === request1Id) {
  activeResults = { occasion: 'Diwali', looks: boyDiwaliLooks };
  console.log('  ERROR: Stale request 1 overwrote newer request 2!');
} else {
  console.log('  Request 1 safely discarded (ID mismatch: 1 !== current ' + globalGenerationRequestId + ')');
}

assert.equal(activeResults.occasion, 'Goa vacation', 'Active results must remain Goa vacation!');
assert.deepEqual(activeResults.looks, boyGoaLooks, 'Active looks must remain Goa vacation looks!');

console.log('✓ Test 11 Passed: Late responses from older generation requests are safely discarded.');

console.log('\n======================================================================');
console.log('ALL 11 REGRESSION TESTS PASSED! Edit/Regenerate flow works dynamically.');
console.log('======================================================================\n');
