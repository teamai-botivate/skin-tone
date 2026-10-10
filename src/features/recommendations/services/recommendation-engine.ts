// Recommendation Engine
// ----------------------
// Owns the "what to recommend" decision: given a user profile, produce 5 complete
// LookRecommendation strategies (outfit, colour, jewellery, hairstyle, makeup,
// accessories, reasoning). This is intentionally separate from image generation —
// see services/image-generation.ts — so an image provider only ever *visualizes*
// a styling decision made here, it never invents one.
//
// The current implementation is a mock: it returns a curated static set of five
// looks. A future version can swap this out for a real model call while keeping
// the same signature, so nothing in the UI needs to change.

import type { LookRecommendation, SkinTuneProfile } from '@/types';

export const mockLooks: LookRecommendation[] = [
  {
    id: 'look-01',
    title: 'Quietly magnetic',
    note: 'Soft structure, warm contrast, no extra fuss.',
    vibe: 'Grounded',
    personaEnergy: 'Calm and unhurried — the kind of presence that doesn’t need to perform, a relaxed half-smile and easy shoulders.',
    palette: ['#283d3b', '#d8b27c', '#f2e6d4'],
    imageUrl: '/replace-with-generated/look-01.webp',
    outfit: 'Sage chore jacket with an oat ribbed tee and ink straight-leg denim.',
    outfitColor: 'Sage green with warm oat and ink accents.',
    jewellery: 'Brushed gold watch and one fine gold ring.',
    hairstyle: 'Natural texture, gently tucked behind the ears.',
    makeup: 'Warm skin tint with a soft terracotta lip.',
    footwear: 'Clean leather low-top or almond loafer.',
    accessories: 'Structured canvas tote in oat.',
    confidence: 94,
    applicableCategories: ['outfit', 'footwear', 'jewellery', 'makeup', 'accessories'],
    reasoning: [
      'Matches your warm undertone with grounded, harmonious colour.',
      'The relaxed structure supports your comfort-first fit priority.',
      'Works for everyday and easy social settings without trying too hard.',
      'Keeps jewellery minimal so your natural colouring leads.',
    ],
    pieces: [
      { category: 'Layer', name: 'Sage chore jacket', detail: 'A relaxed shoulder and cropped hem keep the shape easy.' },
      { category: 'Base', name: 'Oat ribbed tee', detail: 'A warm near-neutral that lets your coloring lead.' },
      { category: 'Bottom', name: 'Ink straight-leg denim', detail: 'Clean, full-length denim balances the softer top half.' },
      { category: 'Finish', name: 'Brushed gold watch', detail: 'One warm metal detail; keep the rest intentionally spare.' },
    ],
  },
  {
    id: 'look-02',
    title: 'The considered entrance',
    note: 'A rich color moment with grounded, everyday polish.',
    vibe: 'Magnetic',
    personaEnergy: 'Sharp and self-possessed — chin level, direct eye contact, the look of someone who owns the room the moment they walk in.',
    palette: ['#a94f3c', '#c88c68', '#302f35'],
    imageUrl: '/replace-with-generated/look-02.webp',
    outfit: 'Brick knit polo, charcoal overshirt, and a dark tailored trouser.',
    outfitColor: 'Brick red with charcoal and warm leather accents.',
    jewellery: 'Slim brushed-metal chain with a warm leather strap watch.',
    hairstyle: 'Low-volume side part with natural movement.',
    makeup: 'Even skin, softly defined brows, and a muted berry tint.',
    footwear: 'Polished penny loafer.',
    accessories: 'Compact leather crossbody in espresso.',
    confidence: 91,
    applicableCategories: ['outfit', 'footwear', 'jewellery', 'makeup', 'accessories'],
    reasoning: [
      'A saturated warm colour that reads confident without being loud.',
      'Tailored trouser and structured overshirt suit a style-first priority.',
      'Reads well for evening or dinner-and-drinks settings.',
      'Grounded palette keeps the impression assured, not showy.',
    ],
    pieces: [
      { category: 'Top', name: 'Brick knit polo', detail: 'Open collar creates a little vertical ease.' },
      { category: 'Layer', name: 'Charcoal overshirt', detail: 'Wear open to frame the warmer center of the look.' },
      { category: 'Bottom', name: 'Dark tailored trouser', detail: 'A fluid wool blend keeps the look comfortable and sharp.' },
      { category: 'Shoe', name: 'Penny loafer', detail: 'Low-profile leather grounds the color without competing.' },
    ],
  },
  {
    id: 'look-03',
    title: 'Softly in focus',
    note: 'Tactile neutrals that feel personal, never precious.',
    vibe: 'Radiant',
    personaEnergy: 'Warm and glowing — a gentle, genuine smile reaching the eyes, soft shoulders turned slightly toward the light.',
    palette: ['#e6d2bb', '#7a5d50', '#536d68'],
    imageUrl: '/replace-with-generated/look-03.webp',
    outfit: 'Cocoa slip midi layered with a sea-glass cardigan.',
    outfitColor: 'Cocoa neutral with a cool sea-glass layer.',
    jewellery: 'Small gold hoops and a delicate pendant.',
    hairstyle: 'Relaxed low ponytail with a soft face-framing strand.',
    makeup: 'Cream blush, warm brown liner, and hydrated lip balm.',
    footwear: 'Almond ballet flat.',
    accessories: 'Small saddle bag with a short strap.',
    confidence: 89,
    applicableCategories: ['outfit', 'footwear', 'jewellery', 'makeup', 'accessories'],
    reasoning: [
      'A forgiving, fluid drape supports a comfort-first fit preference.',
      'Cool sea-glass layer offsets a warm base tone for balance.',
      'Soft, romantic styling suits an elegant desired impression.',
      'Easy to dress up or down across several occasions.',
    ],
    pieces: [
      { category: 'Dress', name: 'Cocoa slip midi', detail: 'A fluid line with adjustable straps and a forgiving drape.' },
      { category: 'Layer', name: 'Sea-glass cardigan', detail: 'Light texture adds dimension around the face.' },
      { category: 'Shoe', name: 'Almond ballet flat', detail: 'A softly pointed toe keeps the silhouette lengthened.' },
      { category: 'Bag', name: 'Small saddle bag', detail: 'Use the shorter strap to keep the waist visible.' },
    ],
  },
  {
    id: 'look-04',
    title: 'A little unexpected',
    note: 'Playful proportion, familiar pieces, a point of view.',
    vibe: 'Playful',
    personaEnergy: 'Light and spontaneous — caught mid-laugh or mid-turn, a candid moment rather than a posed one, energy that feels caught off guard on purpose.',
    palette: ['#e8a33d', '#213a4a', '#eadcc7'],
    imageUrl: '/replace-with-generated/look-04.webp',
    outfit: 'Marigold poplin shirt, navy barrel trouser, and a cream canvas vest.',
    outfitColor: 'Marigold with navy and cream contrast.',
    jewellery: 'A sculptural silver cuff for one cool counterpoint.',
    hairstyle: 'Sleek ponytail or close-cropped natural shape.',
    makeup: 'Fresh skin with a clear apricot cheek.',
    footwear: 'Tonal canvas low-top.',
    accessories: 'Soft navy shoulder bag.',
    confidence: 86,
    applicableCategories: ['outfit', 'footwear', 'jewellery', 'makeup', 'accessories'],
    reasoning: [
      'A bright, creative colour pairing suits a bold or creative style preference.',
      'Curved trouser volume gives a modern, memorable silhouette.',
      'Good for photoshoots or occasions where you want to stand out.',
      'Balances the strong colour with simple, tonal footwear.',
    ],
    pieces: [
      { category: 'Top', name: 'Marigold poplin shirt', detail: 'A half-tuck and rolled sleeve make the color feel lived-in.' },
      { category: 'Bottom', name: 'Navy barrel trouser', detail: 'Curved volume gives a crisp shirt a modern counterpoint.' },
      { category: 'Layer', name: 'Cream canvas vest', detail: 'Adds a clean, light frame without feeling formal.' },
      { category: 'Shoe', name: 'Canvas low-top', detail: 'Keep it tonal and simple so the shirt stays the spark.' },
    ],
  },
  {
    id: 'look-05',
    title: 'Your best kind of polished',
    note: 'A dependable formula for days that need a little more presence.',
    vibe: 'Poised',
    personaEnergy: 'Composed and capable — a steady, level gaze and quiet confidence, the energy of someone fully in command of the moment.',
    palette: ['#74423b', '#efe1cd', '#38484d'],
    imageUrl: '/replace-with-generated/look-05.webp',
    outfit: 'Cedar blazer, cream bateau tee, and slate wide-leg pant.',
    outfitColor: 'Cedar brown with cream and slate balance.',
    jewellery: 'Sculptural silver ring with small geometric studs.',
    hairstyle: 'Soft brushed-back shape with a clean part.',
    makeup: 'Warm neutral eye, softly sculpted cheek, and rosewood lip.',
    footwear: 'Low-profile pointed flat or polished sneaker.',
    accessories: 'Structured shoulder bag in deep slate.',
    confidence: 88,
    applicableCategories: ['outfit', 'footwear', 'jewellery', 'makeup', 'accessories'],
    reasoning: [
      'Soft tailoring signals capable and grounded for office or interview settings.',
      'A longer wide-leg line is flattering and comfortable across a full day.',
      'Cool slate offsets the warm blazer for a balanced, wearable palette.',
      'One accent piece keeps the look polished without overdoing it.',
    ],
    pieces: [
      { category: 'Outer', name: 'Cedar blazer', detail: 'Soft tailoring gives shape while keeping movement.' },
      { category: 'Base', name: 'Cream bateau tee', detail: 'An open neckline brings light up toward the face.' },
      { category: 'Bottom', name: 'Slate wide-leg pant', detail: 'A longer line feels confident with a low-profile shoe.' },
      { category: 'Finish', name: 'Sculptural silver ring', detail: 'One cool accent adds a small, memorable turn.' },
    ],
  },
];

/**
 * Produce 5 complete-look recommendations for the given profile.
 *
 * Calls the backend's /api/recommendations route, which uses GPT-4o to
 * generate 5 genuinely personalized styling strategies from the profile
 * (appearance, body, taste, occasion, budget). If that call fails for any
 * reason (no OPENAI_API_KEY configured, network issue, backend not
 * deployed yet, etc.) this falls back to the curated static mock set so the
 * UI always has something to show — never a dead end.
 */
export const getLookRecommendations = async (
  profile: SkinTuneProfile,
): Promise<LookRecommendation[]> => {
  try {
    // The recommendation prompt only ever uses the already-derived
    // appearance.skinTone/undertone, never the raw photo — strip photoUrl
    // (a multi-megabyte base64 data URL) before sending so this call stays
    // small and fast regardless of body-size limits.
    const { photoUrl: _photoUrl, ...profileForRequest } = profile;
    const res = await fetch('/api/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: profileForRequest }),
    });
    if (!res.ok) throw new Error(`Recommendations request failed: ${res.status}`);
    const data = (await res.json()) as { recommendations: LookRecommendation[] };
    if (!data.recommendations?.length) throw new Error('Empty recommendations response');
    return data.recommendations;
  } catch (err) {
    console.warn('Falling back to mock recommendations:', err);
    // Simulated "thinking" latency so the fallback still feels intentional.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return mockLooks;
  }
};
