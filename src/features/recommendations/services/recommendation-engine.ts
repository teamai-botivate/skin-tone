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
import { getStylingContext } from '@/lib/styling-context';

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
/**
 * Generates dynamically customized complete-look recommendations matching the user's
 * occasion, preferred colors, style world, demographic, and skin undertone when the API is unavailable.
 */
export function generateFallbackLooks(profile: SkinTuneProfile): LookRecommendation[] {
  const occ = (profile.occasion || '').toLowerCase();
  const styles = (profile.style || []).map((s) => s.toLowerCase());
  const allContext = `${occ} ${styles.join(' ')} ${(profile.impression || []).join(' ')}`.toLowerCase();

  const isGarba = allContext.includes('garba') || allContext.includes('navratri') || allContext.includes('dandiya');
  const isWedding = allContext.includes('wedding') || allContext.includes('shaadi') || allContext.includes('sangeet');
  const isOffice = allContext.includes('office') || allContext.includes('formal') || allContext.includes('corporate') || allContext.includes('work');
  const isDateNight = allContext.includes('date') || allContext.includes('dinner');
  const isParty = allContext.includes('party') || allContext.includes('cocktail');
  const isVacation =
    occ.includes('vacation') ||
    occ.includes('beach') ||
    occ.includes('resort') ||
    occ.includes('goa') ||
    occ.includes('holiday') ||
    occ.includes('summer');

  const ctx = getStylingContext(profile);
  const isBoy = ctx.isBoy;
  const isGirl = ctx.isGirl;
  const isChild = ctx.isKids;
  const isMan = ctx.isMan;
  const isWoman = ctx.isWoman;

  const lovedColors = Array.isArray(profile.colorsLove) && profile.colorsLove.length > 0 ? profile.colorsLove : ['Pink'];
  const primaryColor = lovedColors[0] || 'Pink';
  const undertone = profile.appearance?.undertone || 'Warm';

  const isFestive =
    !isVacation &&
    (isGarba ||
      isWedding ||
      allContext.includes('diwali') ||
      allContext.includes('festive') ||
      allContext.includes('ethnic') ||
      allContext.includes('puja'));

  // 1. Festive / Cultural Look Suite (e.g. Diwali, Garba, Navratri, Traditional Celebration)
  if (isGarba || isFestive) {
    if (isBoy) {
      return [
        {
          id: 'garba-boy-01',
          title: 'Festive Prince Splendor',
          note: `Vibrant ${primaryColor} embroidered kurta and dhoti set designed for comfortable high-energy Garba dancing.`,
          vibe: 'Playful',
          personaEnergy: 'Full of youthful excitement and confidence, ready to celebrate and dance with family.',
          palette: ['#ec4899', '#f59e0b', '#18181b'],
          imageUrl: '/replace-with-generated/garba-01.webp',
          outfit: `Boys ${primaryColor} embroidered cotton-silk festive kurta with white dhoti pants and contrast Nehru jacket.`,
          outfitColor: `${primaryColor} with rich gold embroidery and ivory contrasts.`,
          jewellery: 'None (child-safe styling).',
          hairstyle: 'Neat side part with clean, natural texture.',
          makeup: 'None (child-friendly natural skin).',
          footwear: 'Soft cushioned non-slip boys ethnic mojaris or ethnic sandals.',
          accessories: 'Contrasting silk pocket square pinned neatly to the Nehru jacket.',
          confidence: 96,
          applicableCategories: ['outfit', 'footwear', 'accessories'],
          reasoning: [
            `Vibrant ${primaryColor} brings festive celebratory energy appropriate for young boys.`,
            '100% breathable cotton-silk allows full freedom of movement for folk dancing.',
            'Padded non-slip mojaris protect little feet during long celebrations.',
          ],
          pieces: [
            { category: 'Outfit', name: `Boys ${primaryColor} Embroidered Festive Kurta Set`, detail: 'Mandarin collar kurta with soft lining and thread embroidery.' },
            { category: 'Bottom', name: 'Elasticized Traditional White Dhoti Pants', detail: 'Pre-stitched pleats for easy running and dance movement.' },
            { category: 'Layer', name: 'Festive Contrast Embroidered Nehru Jacket', detail: 'Lightweight sleeveless jacket with metallic buttons.' },
            { category: 'Shoe', name: 'Cushioned Boys Ethnic Mojaris', detail: 'Soft inner lining and flexible non-slip sole.' },
          ],
        },
        {
          id: 'garba-boy-02',
          title: 'Traditional Kedia Folk Charisma',
          note: `Authentic Gujarati flared ${primaryColor} kedia top with tulip dhoti pants and tribal threadwork.`,
          vibe: 'Festive',
          personaEnergy: 'Spirited, smiling, and lively in authentic Gujarati folk dance posture.',
          palette: ['#db2777', '#f59e0b', '#fdf2f8'],
          imageUrl: '/replace-with-generated/garba-02.webp',
          outfit: `Boys ${primaryColor} traditional flared kedia jacket top with colourful pom-pom latkans and tulip dhoti.`,
          outfitColor: `Rich ${primaryColor} with sunny yellow and mirror-work accents.`,
          jewellery: 'None (child-friendly natural styling).',
          hairstyle: 'Playful textured crop.',
          makeup: 'None (child-friendly natural skin).',
          footwear: 'Cushioned ethnic kolhapuri sandals.',
          accessories: 'Embroidered festive brooch and matching pocket square.',
          confidence: 94,
          applicableCategories: ['outfit', 'footwear', 'accessories'],
          reasoning: [
            'Traditional kedia cut celebrates authentic Gujarati Garba heritage.',
            'Elasticated tulip dhoti stays secure and comfortable all night.',
          ],
          pieces: [
            { category: 'Outfit', name: `Boys ${primaryColor} Flared Kedia Jacket Top`, detail: 'Angrakha tie-up front with mirror-work accents.' },
            { category: 'Bottom', name: 'Contrasting Tulip Dhoti Pants', detail: 'Lightweight breathable rayon-cotton.' },
            { category: 'Shoe', name: 'Cushioned Kolhapuri Sandals', detail: 'Secure ankle strap for dancing.' },
          ],
        },
        {
          id: 'garba-boy-03',
          title: 'Royal Bandhgala Elegance',
          note: `Regal ${primaryColor} silk-blend bandhgala waistcoat paired with cream kurta and churidar.`,
          vibe: 'Regal',
          personaEnergy: 'Composed, charming, and poised with a proud little smile.',
          palette: ['#be185d', '#d97706', '#fffbeb'],
          imageUrl: '/replace-with-generated/garba-03.webp',
          outfit: `Boys ${primaryColor} tailored silk-blend bandhgala waistcoat over a crisp cream kurta and churidar.`,
          outfitColor: `Deep ${primaryColor} and antique gold brocade.`,
          jewellery: 'None (child-friendly natural styling).',
          hairstyle: 'Gentle combed side-sweep.',
          makeup: 'None (child-friendly natural skin).',
          footwear: 'Slip-on handcrafted boys ethnic loafers.',
          accessories: 'Golden printed silk pocket square.',
          confidence: 93,
          applicableCategories: ['outfit', 'footwear', 'accessories'],
          reasoning: [
            'Bandhgala cut offers elevated polish for grand family gatherings.',
            'Soft cotton inner lining ensures no itching or discomfort.',
          ],
          pieces: [
            { category: 'Layer', name: `Boys ${primaryColor} Brocade Bandhgala Waistcoat`, detail: 'Structured mandarin collar with antique brass buttons.' },
            { category: 'Outfit', name: 'Cream Cotton Silk Kurta Set', detail: 'Breathable base layer with soft elasticized churidar.' },
            { category: 'Shoe', name: 'Handcrafted Boys Ethnic Loafers', detail: 'Flexible rubber sole with padded footbed.' },
          ],
        },
        {
          id: 'garba-boy-04',
          title: 'Vibrant Angrakha Festive',
          note: `Side-tie ${primaryColor} angrakha kurta with golden gota border and matching pyjama.`,
          vibe: 'Radiant',
          personaEnergy: 'Cheery and bright mid-twirl, full of laughter.',
          palette: ['#e11d48', '#fbbf24', '#f8fafc'],
          imageUrl: '/replace-with-generated/garba-04.webp',
          outfit: `Boys ${primaryColor} angrakha cotton kurta with gota patti border and comfortable pyjama.`,
          outfitColor: `${primaryColor} with golden gota work and pearl white.`,
          jewellery: 'None.',
          hairstyle: 'Natural clean styling.',
          makeup: 'None (child-friendly natural skin).',
          footwear: 'Soft cushioned ethnic juttis.',
          accessories: 'Mini matching brooch.',
          confidence: 92,
          applicableCategories: ['outfit', 'footwear', 'accessories'],
          reasoning: [
            'Angrakha overlap neckline creates authentic royal charm.',
            'Lightweight cotton keeps active boys cool and sweat-free.',
          ],
          pieces: [
            { category: 'Outfit', name: `Boys ${primaryColor} Angrakha Kurta Set`, detail: 'Asymmetrical overlap with soft cloth ties.' },
            { category: 'Bottom', name: 'White Cotton Pyjama', detail: 'Gentle elastic waistband.' },
            { category: 'Shoe', name: 'Padded Ethnic Juttis', detail: 'Genuine leather cushioned sole.' },
          ],
        },
        {
          id: 'garba-boy-05',
          title: 'Modern Indo-Western Fusion',
          note: `Stylishly modern ${primaryColor} asymmetrical festive kurta with dark tailored stretch pants.`,
          vibe: 'Daring',
          personaEnergy: 'Modern, confident, ready for festive photos and celebrations.',
          palette: ['#9d174d', '#1e1b4b', '#f1f5f9'],
          imageUrl: '/replace-with-generated/garba-05.webp',
          outfit: `Boys ${primaryColor} modern asymmetrical high-low festive kurta with tailored stretch pants.`,
          outfitColor: `${primaryColor} with midnight navy contrasts.`,
          jewellery: 'None.',
          hairstyle: 'Sleek brushed-up modern quiff.',
          makeup: 'None (child-friendly natural skin).',
          footwear: 'Clean leather low-top sneakers or loafers.',
          accessories: 'Sporty child-friendly wrist watch.',
          confidence: 91,
          applicableCategories: ['outfit', 'footwear', 'accessories'],
          reasoning: [
            'Indo-western cut blends traditional colour with modern boys streetwear comfort.',
            'Pairs effortlessly with sneakers for non-stop play.',
          ],
          pieces: [
            { category: 'Outfit', name: `Boys ${primaryColor} Asymmetrical Festive Kurta`, detail: 'Diagonal button placket with contrast piping.' },
            { category: 'Bottom', name: 'Navy Stretch Chino Trousers', detail: 'Comfort stretch for active kids.' },
            { category: 'Shoe', name: 'White Leather Low-Top Sneakers', detail: 'All-day cushioning.' },
          ],
        },
      ];
    }

    if (isChild && !isBoy) {
      return [
        {
          id: 'garba-girl-01',
          title: 'Festive Twirl Magic',
          note: `Joyful ${primaryColor} flared chaniya choli designed for comfortable festive dancing.`,
          vibe: 'Playful',
          personaEnergy: 'Full of excitement and smiles, ready to spin and celebrate with family.',
          palette: ['#ec4899', '#fbbf24', '#fdf2f8'],
          imageUrl: '/replace-with-generated/garba-01.webp',
          outfit: `Girls ${primaryColor} printed cotton flared chaniya choli with mirror-work border and light odhani.`,
          outfitColor: `${primaryColor} with sunny gold and mirror accents.`,
          jewellery: 'Lightweight child-friendly colourful bangles and tiny floral clip-ons.',
          hairstyle: 'High festive ponytail tied with a vibrant matching ribbon.',
          makeup: 'None (child-friendly natural skin).',
          footwear: 'Soft cushioned non-slip ethnic flats or sandals.',
          accessories: 'Mini matching festive potli purse.',
          confidence: 96,
          applicableCategories: ['outfit', 'footwear', 'accessories'],
          reasoning: [
            `Bright, celebratory ${primaryColor} brings playful festive energy.`,
            '100% breathable cotton keeps children comfortable through evening dancing.',
            'Cushioned non-slip footwear prevents tired feet.',
          ],
          pieces: [
            { category: 'Dress', name: `Girls ${primaryColor} Flared Chaniya Choli Set`, detail: 'Full flare skirt with soft elastic waistband for effortless movement.' },
            { category: 'Layer', name: 'Matching Embroidered Cotton Choli', detail: 'Comfortable breathable cotton top with soft inner lining.' },
            { category: 'Finish', name: 'Lightweight Bandhani Odhani', detail: 'Featherlight scarf pinned securely at the shoulder.' },
            { category: 'Shoe', name: 'Soft Cushioned Ethnic Flats', detail: 'Flexible sole with smooth lining to protect little feet.' },
          ],
        },
      ];
    }

    if (isMan) {
      return [
        {
          id: 'garba-men-01',
          title: 'Royal Festive Splendor',
          note: `Vibrant ${primaryColor} embroidered kurta set with traditional dhoti and festive mojaris.`,
          vibe: 'Regal',
          personaEnergy: 'Confident, rhythmic posture with an easy, celebratory smile.',
          palette: ['#ec4899', '#f59e0b', '#18181b'],
          imageUrl: '/replace-with-generated/garba-01.webp',
          outfit: `Men's ${primaryColor} embroidered silk-blend festive kurta set with white dhoti pants.`,
          outfitColor: `${primaryColor} with rich gold embroidery and ivory contrasts.`,
          jewellery: 'Classic brass metallic watch and engraved silver ring.',
          hairstyle: 'Neat side part with clean, groomed finish.',
          makeup: 'Clean natural grooming with hydrated lips.',
          footwear: 'Handcrafted genuine leather ethnic mojaris.',
          accessories: 'Contrasting silk pocket square and embroidered stole.',
          confidence: 94,
          applicableCategories: ['outfit', 'footwear', 'accessories', 'jewellery'],
          reasoning: [
            `Festive ${primaryColor} harmonizes with evening celebrations and Garba beats.`,
            'Breathable dhoti allows full range of motion for traditional Gujarati dance steps.',
            'Padded mojaris provide authentic aesthetic without compromising comfort.',
          ],
          pieces: [
            { category: 'Outfit', name: `Men's ${primaryColor} Embroidered Festive Kurta Set`, detail: 'Tailored mandarin collar kurta with intricate threadwork.' },
            { category: 'Bottom', name: 'Pleated Traditional White Dhoti', detail: 'Pre-stitched elasticized dhoti for effortless dancing.' },
            { category: 'Shoe', name: 'Handcrafted Ethnic Mojaris', detail: 'Genuine leather cushioned mojaris with metallic toe embroidery.' },
          ],
        },
        {
          id: 'garba-men-02',
          title: 'Heritage Silk Kurta Churidar',
          note: `Tailored ${primaryColor} raw silk festive kurta paired with crisp ivory churidar pyjama.`,
          vibe: 'Poised',
          personaEnergy: 'Stately and grounded, chin level with refined festive warmth.',
          palette: ['#db2777', '#d97706', '#fffbeb'],
          imageUrl: '/replace-with-generated/garba-02.webp',
          outfit: `Men's tailored ${primaryColor} raw silk festive kurta paired with crisp ivory churidar pyjama.`,
          outfitColor: `Deep ${primaryColor} with antique gold zari and ivory.`,
          jewellery: 'Solid stainless steel kada bracelet and classic analog watch.',
          hairstyle: 'Sleek brushed-back pompadour with groomed edges.',
          makeup: 'Clean natural grooming with hydrated lips.',
          footwear: 'Pointed ethnic zari-embroidered mojaris.',
          accessories: 'Royal gold-plated sherwani brooch pin.',
          confidence: 93,
          applicableCategories: ['outfit', 'footwear', 'accessories', 'jewellery'],
          reasoning: [
            'Raw silk fabric provides rich luminous texture that shines under festive lighting.',
            'Classic churidar pyjama creates an elongated, statuesque silhouette.',
            'Masculine metallic kada adds heritage authenticity without fuss.',
          ],
          pieces: [
            { category: 'Top', name: `Men's ${primaryColor} Raw Silk Festive Kurta`, detail: 'Concealed button placket with subtle collar embroidery.' },
            { category: 'Bottom', name: 'Ivory Pure Cotton Churidar', detail: 'Comfortable gathers around the ankles.' },
            { category: 'Shoe', name: 'Zari Embroidered Mojaris', detail: 'Cushioned leather sole with pointed toe.' },
          ],
        },
        {
          id: 'garba-men-03',
          title: 'Regal Embroidered Bandi Set',
          note: `Rich ${primaryColor} embroidered bandi waistcoat over cream tussar silk kurta and pyjama.`,
          vibe: 'Magnetic',
          personaEnergy: 'Magnetic presence, shoulders square, radiating poised celebration energy.',
          palette: ['#be185d', '#f59e0b', '#0f172a'],
          imageUrl: '/replace-with-generated/garba-03.webp',
          outfit: `Men's ${primaryColor} embroidered bandi waistcoat layered over a cream tussar silk kurta and pyjama.`,
          outfitColor: `${primaryColor} brocade with warm cream and antique gold.`,
          jewellery: 'Classic analog chronograph watch with metallic dial.',
          hairstyle: 'Clean high-fade with textured top.',
          makeup: 'Clean natural grooming.',
          footwear: 'Handcrafted leather ethnic juttis.',
          accessories: 'Pure silk pocket square in rich gold.',
          confidence: 95,
          applicableCategories: ['outfit', 'footwear', 'accessories', 'jewellery'],
          reasoning: [
            'Structured bandi waistcoat defines torso shape and adds regal festive layering.',
            'Cream silk base balances the saturated festive colour harmoniously.',
          ],
          pieces: [
            { category: 'Layer', name: `Men's ${primaryColor} Embroidered Bandi Waistcoat`, detail: 'Sleeveless Nehru bandi with metallic button detailing.' },
            { category: 'Top', name: 'Cream Tussar Silk Kurta', detail: 'Mandarin collar long tunic with natural silk sheen.' },
            { category: 'Bottom', name: 'Off-White Straight Pyjama', detail: 'Breathable cotton-silk blend with drawstring waist.' },
            { category: 'Shoe', name: 'Handcrafted Ethnic Juttis', detail: 'Genuine leather cushioned footbed.' },
          ],
        },
        {
          id: 'garba-men-04',
          title: 'Traditional Angrakha Heritage',
          note: `Authentic ${primaryColor} overlap angrakha festive kurta with pleated tulip dhoti.`,
          vibe: 'Playful',
          personaEnergy: 'Dynamic and spirited, easy laugh mid-turn on the dance floor.',
          palette: ['#e11d48', '#fbbf24', '#f8fafc'],
          imageUrl: '/replace-with-generated/garba-04.webp',
          outfit: `Men's ${primaryColor} side-tie angrakha festive kurta with off-white pleated dhoti pants.`,
          outfitColor: `Vibrant ${primaryColor} with golden gota work and pearl accents.`,
          jewellery: 'Engraved masculine silver signet ring.',
          hairstyle: 'Natural relaxed wave with groomed side part.',
          makeup: 'Clean natural grooming.',
          footwear: 'Handmade leather kolhapuri sandals.',
          accessories: 'Rich festive zari-bordered silk stole.',
          confidence: 92,
          applicableCategories: ['outfit', 'footwear', 'accessories', 'jewellery'],
          reasoning: [
            'Traditional Gujarati angrakha silhouette honors authentic folk dance heritage.',
            'Pleated dhoti ensures unrestricted leg mobility for high-energy Garba spins.',
          ],
          pieces: [
            { category: 'Top', name: `Men's ${primaryColor} Angrakha Kurta`, detail: 'Asymmetric crossover front with soft cloth dori ties.' },
            { category: 'Bottom', name: 'Pleated Traditional Dhoti Pants', detail: 'Pre-draped breathable cotton.' },
            { category: 'Shoe', name: 'Handmade Leather Kolhapuris', detail: 'T-strap design with braided detailing.' },
          ],
        },
        {
          id: 'garba-men-05',
          title: 'Modern Indo-Western Fusion',
          note: `Modern ${primaryColor} asymmetrical high-low festive kurta with tailored midnight stretch trousers.`,
          vibe: 'Daring',
          personaEnergy: 'Sharp, fashion-forward posture with effortless modern charisma.',
          palette: ['#9d174d', '#1e1b4b', '#f1f5f9'],
          imageUrl: '/replace-with-generated/garba-05.webp',
          outfit: `Men's ${primaryColor} asymmetrical high-low festive kurta with tailored midnight stretch trousers.`,
          outfitColor: `${primaryColor} with midnight navy accents.`,
          jewellery: 'Solid metallic wrist kada and sleek minimalist watch.',
          hairstyle: 'Textured modern taper cut.',
          makeup: 'Clean natural grooming.',
          footwear: 'Handcrafted leather monk-strap loafers.',
          accessories: 'Classic polarized UV-protected sunglasses.',
          confidence: 91,
          applicableCategories: ['outfit', 'footwear', 'accessories', 'jewellery'],
          reasoning: [
            'Contemporary high-low hemline bridges traditional festival spirit and modern menswear cuts.',
            'Dark tailored trousers ground the silhouette for evening celebrations.',
          ],
          pieces: [
            { category: 'Top', name: `Men's ${primaryColor} Asymmetrical Festive Kurta`, detail: 'Diagonal button placket with structured high-low hem.' },
            { category: 'Bottom', name: 'Midnight Navy Tailored Trousers', detail: 'Flat-front stretch fabric for mobility.' },
            { category: 'Shoe', name: 'Leather Double Monk-Strap Loafers', detail: 'Polished calfskin with cushioned footbed.' },
          ],
        },
      ];
    }

    // Women's Garba Looks (Pink + Garba + Traditional)
    return [
      {
        id: 'garba-look-01',
        title: 'Vibrant Garba Radiance',
        note: `Authentic ${primaryColor} flared mirror-work chaniya choli with embroidered blouse and festive bandhani dupatta.`,
        vibe: 'Festive',
        personaEnergy: 'Joyful and magnetic mid-spin, shoulders relaxed, radiating warmth and high celebration energy.',
        palette: ['#ec4899', '#f59e0b', '#fdf2f8'],
        imageUrl: '/replace-with-generated/garba-01.webp',
        outfit: `Fuschia ${primaryColor} flared mirror-work chaniya choli with embroidered sweetheart choli blouse and bandhani dupatta.`,
        outfitColor: `Vibrant ${primaryColor} with warm gold and authentic glass mirror accents.`,
        jewellery: 'Traditional oxidised silver floral dome jhumkas with stacked tribal bangles.',
        hairstyle: 'Textured side fishtail braid woven with festive paranda and delicate baby-breath flowers.',
        makeup: 'Layer A: Infallible 24H Fresh Wear base foundation (shortlisted for Warm Medium), followed by Layer B: bold crimson festive lip, gold metallic shimmer eye, and sunlit golden highlighter.',
        footwear: 'Handcrafted embroidered pink ethnic Punjabi juttis with cushioned sole.',
        accessories: `Pink velvet drawstring potli bag with pearl handle and festive latkans.`,
        confidence: 97,
        applicableCategories: ['outfit', 'jewellery', 'footwear', 'accessories', 'makeup'],
        reasoning: [
          `Vibrant ${primaryColor} harmonizes with your ${undertone} undertone under festive evening spotlights.`,
          'Broad-flared chaniya choli adorned with authentic mirror work delivers dramatic movement for Garba and Dandiya beats.',
          'Oxidised silver jewellery adds cultural Gujarati authenticity without weighing down your neck.',
          'Padded leather juttis ensure all-night dancing comfort without sacrificing festive elegance.',
        ],
        pieces: [
          { category: 'Dress', name: `${primaryColor} Flared Mirror-Work Chaniya Choli Lehenga`, detail: 'Heavy festive flared skirt with traditional Gujarati mirror-work border.' },
          { category: 'Layer', name: `${primaryColor} Embroidered Festive Choli Blouse`, detail: 'Tailored sweetheart-neck blouse with delicate back-tie tassels.' },
          { category: 'Finish', name: `${primaryColor} Bandhani Mirror-Work Dupatta`, detail: 'Lightweight contrast dupatta draped gracefully for effortless Garba dancing.' },
          { category: 'Shoe', name: 'Handcrafted Embroidered Ethnic Punjabi Juttis', detail: 'Cushioned genuine leather sole for hours of dancing comfort.' },
        ],
      },
      {
        id: 'garba-look-02',
        title: 'Royal Gujarati Heritage',
        note: `${primaryColor} & gold gota patti bandhani lehenga choli set with rich zari border.`,
        vibe: 'Regal',
        personaEnergy: 'Poised and stately, chin lifted with effortless grace and grounded presence.',
        palette: ['#db2777', '#d97706', '#fffbeb'],
        imageUrl: '/replace-with-generated/garba-02.webp',
        outfit: `Royal ${primaryColor} bandhani flared lehenga with broad gota patti border and raw silk embroidered choli.`,
        outfitColor: `Deep ${primaryColor} and antique gold zari.`,
        jewellery: 'Kundan & meenakari chandbali earrings with heavy gold-plated openable kada pair.',
        hairstyle: 'Low textured bun adorned with traditional gajra.',
        makeup: 'Hydrating satin foundation, sharp winged eyeliner, and warm berry matte lipstick.',
        footwear: 'Mirror-work and zari padded festive mojaris.',
        accessories: `Handcrafted raw silk potli clutch in ${primaryColor} with golden tassels.`,
        confidence: 93,
        applicableCategories: ['outfit', 'jewellery', 'footwear', 'accessories', 'makeup'],
        reasoning: [
          'Rich bandhani print and gota patti celebrate authentic heritage styling.',
          'Kundan chandbalis frame your face structure with traditional grandeur.',
          'Padded mojaris offer robust foot support through long standing ceremonies.',
        ],
        pieces: [
          { category: 'Dress', name: `${primaryColor} Gota Patti Bandhani Lehenga Skirt`, detail: 'Authentic tie-dye bandhani on pure silk with sweeping flare.' },
          { category: 'Layer', name: 'Raw Silk Embroidered Choli Blouse', detail: 'Structured elbow-sleeve blouse with antique zari motifs.' },
          { category: 'Finish', name: 'Zari Bordered Festive Dupatta', detail: 'Draped diagonally in classic Gujarati front-pallu style.' },
          { category: 'Shoe', name: 'Zari Padded Festive Mojaris', detail: 'Pointed ethnic mojaris with metallic thread detailing.' },
        ],
      },
      {
        id: 'garba-look-03',
        title: 'Contemporary Indo-Western Festive',
        note: `Modern ${primaryColor} mirror-work bustier crop top with tiered festive sharara and cape jacket.`,
        vibe: 'Daring',
        personaEnergy: 'Bold, modern, and spirited, moving with dynamic rhythm and contemporary confidence.',
        palette: ['#f43f5e', '#a855f7', '#1e1b4b'],
        imageUrl: '/replace-with-generated/garba-03.webp',
        outfit: `${primaryColor} mirror-work bustier top paired with high-waist tiered flared sharara and sheer floor-length cape.`,
        outfitColor: `Striking ${primaryColor} with silver mirror work and violet undertones.`,
        jewellery: 'Sculptural oxidised silver tribal ear cuffs and layered metallic statement rings.',
        hairstyle: 'Sleek high half-up pony with cascading soft waves.',
        makeup: 'Luminous skin tint, gold metallic liquid eyeshadow, and glossy rosewood lip.',
        footwear: 'Embellished metallic block-heel kolhapuris.',
        accessories: `Sleek embroidered envelope clutch in ${primaryColor}.`,
        confidence: 91,
        applicableCategories: ['outfit', 'jewellery', 'footwear', 'accessories', 'makeup'],
        reasoning: [
          'Fuses festive Gujarati mirror work with contemporary tiered silhouette.',
          'Lightweight cape adds dramatic flutter during fast Garba turns.',
          'Block heel kolhapuris provide steady balance on slick floors.',
        ],
        pieces: [
          { category: 'Base', name: `${primaryColor} Mirror-Work Festive Crop Top`, detail: 'Structured bustier top with mirror embroidery.' },
          { category: 'Bottom', name: `${primaryColor} Tiered Flared Sharara Skirt`, detail: 'High-waist tiered flare for freedom of dance movement.' },
          { category: 'Layer', name: 'Sheer Georgette Floor-Length Cape', detail: 'Flowing lightweight cape that billows dramatically on twirls.' },
          { category: 'Shoe', name: 'Metallic Block-Heel Kolhapuris', detail: 'Stable block heel supporting high-energy dancing.' },
        ],
      },
      {
        id: 'garba-look-04',
        title: 'Luminous Kalidar Radiance',
        note: `${primaryColor} raw silk 16-kali flared lehenga with brocade sweetheart blouse.`,
        vibe: 'Radiant',
        personaEnergy: 'Warm, luminous, caught mid-laugh with fluid movement.',
        palette: ['#e11d48', '#fbbf24', '#fff1f2'],
        imageUrl: '/replace-with-generated/garba-04.webp',
        outfit: `${primaryColor} raw silk 16-kali flared lehenga with brocade sweetheart choli and scalloped organza dupatta.`,
        outfitColor: `Lustrous ${primaryColor} with warm gold zari.`,
        jewellery: 'Oxidised German silver tribal choker necklace with hanging bell jhumkas.',
        hairstyle: 'Soft, voluminous side-swept waves pinned with embellished clips.',
        makeup: 'Layer A essentials with soft coral-peach blush and Layer B festive crimson matte lip.',
        footwear: 'Cushioned leather Punjabi juttis with intricate thread embroidery.',
        accessories: `Embroidered velvet potli bag with pearl tassel drawstrings.`,
        confidence: 95,
        applicableCategories: ['outfit', 'jewellery', 'footwear', 'accessories', 'makeup'],
        reasoning: [
          '16-kali skirt construction ensures a majestic 360-degree flare.',
          'Rich brocade and raw silk textures elevate the look for premium festive venues.',
          'Smudge-proof kajal and 24-hour lip color withstand festive humidity.',
        ],
        pieces: [
          { category: 'Dress', name: `${primaryColor} Raw Silk Kalidar Lehenga`, detail: '16-kali voluminous flare that catches light effortlessly.' },
          { category: 'Layer', name: 'Brocade Sweetheart Festive Blouse', detail: 'Rich woven texture contrasting with the smooth silk skirt.' },
          { category: 'Finish', name: 'Organza Foil Dupatta', detail: 'Featherlight organza with delicate scalloped border.' },
          { category: 'Shoe', name: 'Cushioned Floral Punjabi Juttis', detail: 'Non-slip rubber sole for indoor and outdoor dance floors.' },
        ],
      },
      {
        id: 'garba-look-05',
        title: 'Effortless Festive Joy',
        note: `Breathable ${primaryColor} printed cotton chaniya choli set with colourful latkans and tie-dye odhani.`,
        vibe: 'Playful',
        personaEnergy: 'Spontaneous and free-spirited, effortless movement with a radiant natural smile.',
        palette: ['#f43f5e', '#10b981', '#fef08a'],
        imageUrl: '/replace-with-generated/garba-05.webp',
        outfit: `Breathable ${primaryColor} printed cotton chaniya choli set with colourful thread latkans and tie-dye bandhani odhani.`,
        outfitColor: `Vibrant ${primaryColor} with lively multi-colour accents.`,
        jewellery: 'Lightweight oxidised silver ghungroo jhumkas and colourful thread bangles.',
        hairstyle: 'Crown Dutch braid melting into a playful low ponytail.',
        makeup: 'Clean glowing skin tint, smudge-proof kajal, and vibrant tinted lip balm.',
        footwear: 'Soft cushioned leather juttis.',
        accessories: `Embroidered mini potli bag with tassel strings.`,
        confidence: 92,
        applicableCategories: ['outfit', 'jewellery', 'footwear', 'accessories', 'makeup'],
        reasoning: [
          'Lightweight pure cotton keeps you cool through hours of high-tempo dancing.',
          'Playful latkans and multi-coloured accents capture authentic folk spirit.',
          'Minimal makeup touchups needed throughout the night.',
        ],
        pieces: [
          { category: 'Dress', name: `${primaryColor} Printed Cotton Chaniya Choli Set`, detail: '100% breathable festive cotton for non-stop celebration.' },
          { category: 'Layer', name: 'Embroidered Cotton Choli', detail: 'Breathable choli with back dori ties.' },
          { category: 'Finish', name: 'Tie-Dye Bandhani Odhani', detail: 'Vibrant contrasting odhani tucked neatly at waist.' },
          { category: 'Shoe', name: 'Handmade Floral Ethnic Juttis', detail: 'Ultra-flexible lightweight ethnic flats.' },
        ],
      },
    ];
  }

  // 2. Office / Formal Suits
  if (isOffice) {
    return [
      {
        id: 'office-look-01',
        title: 'Precision Power Tailoring',
        note: `Tailored structured ${primaryColor} single-breasted blazer with matching high-rise trousers and silk camisole.`,
        vibe: 'Poised',
        personaEnergy: 'Composed and capable, steady level gaze and quiet executive confidence.',
        palette: ['#0f172a', '#64748b', '#f8fafc'],
        imageUrl: '/replace-with-generated/look-05.webp',
        outfit: `Structured tailored ${primaryColor} blazer paired with matching high-rise formal trousers and ivory silk camisole.`,
        outfitColor: `${primaryColor} tailored suiting with crisp neutral balance.`,
        jewellery: 'Minimalist 14K gold-plated sphere stud earrings and sleek delicate cuff bangle.',
        hairstyle: 'Sleek low bun with a clean center part.',
        makeup: 'Even matte skin tint, soft neutral sculpting, and nude rosewood lip.',
        footwear: 'Pointed-toe block heel formal pumps.',
        accessories: 'Structured faux leather laptop work tote with dual handles.',
        confidence: 96,
        applicableCategories: ['outfit', 'jewellery', 'footwear', 'accessories', 'makeup'],
        reasoning: [
          'Sharp tailoring defines posture and commands respect in corporate settings.',
          'High-rise trouser line elongates silhouette comfortably for full workdays.',
          'Minimalist stud jewellery maintains polished executive elegance.',
        ],
        pieces: [
          { category: 'Outer', name: `Tailored Structured ${primaryColor} Blazer`, detail: 'Clean notch lapel blazer with functional flap pockets.' },
          { category: 'Bottom', name: `Matching ${primaryColor} High-Rise Trousers`, detail: 'Creased straight-leg suiting trousers.' },
          { category: 'Base', name: 'Ivory Silk Inner Camisole Top', detail: 'Breathable modal-silk blend with clean neckline.' },
          { category: 'Shoe', name: 'Pointed-Toe Block Heel Pumps', detail: 'Comfortable 2-inch block heel for corporate mobility.' },
        ],
      },
    ];
  }

  if (isBoy && isVacation) {
    return [
      {
        id: 'boy-vacation-01',
        title: 'Breezy Linen Resort Co-ord',
        note: `Breathable ${primaryColor} or off-white relaxed linen button-down shirt paired with matching lightweight linen drawstring shorts.`,
        vibe: 'Breezy',
        personaEnergy: 'Relaxed and happy along the sunny coast with an easy, sunlit smile.',
        palette: ['#f8fafc', '#38bdf8', '#f59e0b'],
        imageUrl: '/replace-with-generated/look-01.webp',
        outfit: `Boys breathable ${primaryColor} relaxed-fit linen button-down shirt with wide-leg breathable linen shorts.`,
        outfitColor: `${primaryColor} with coastal sky blue and sandy beige accents.`,
        jewellery: 'None (child-safe styling).',
        hairstyle: 'Natural wind-swept crop.',
        makeup: 'None (child-friendly natural skin).',
        footwear: 'Slip-on canvas boat shoes or cushioned woven sandals.',
        accessories: 'Woven child-friendly straw sun hat or UV sunglasses.',
        confidence: 97,
        applicableCategories: ['outfit', 'footwear', 'accessories'],
        reasoning: [
          '100% breathable pure linen ensures maximum cooling in tropical weather.',
          'Elasticated drawstring waistband provides non-restrictive comfort for beachside play.',
          'Cushioned non-slip resort footwear protects little feet on boardwalks and sand.',
        ],
        pieces: [
          { category: 'Top', name: `Boys ${primaryColor} Linen Resort Shirt`, detail: 'Relaxed camp collar with coconut shell buttons.' },
          { category: 'Bottom', name: 'Matching Breathable Linen Drawstring Shorts', detail: 'Soft elastic waistband with functional drawcord.' },
          { category: 'Shoe', name: 'Slip-On Canvas Boat Shoes', detail: 'Flexible rubber non-slip outsole.' },
          { category: 'Accessories', name: 'Woven Straw Sun Hat', detail: 'Lightweight sun protection with chin strap.' },
        ],
      },
      {
        id: 'boy-vacation-02',
        title: 'Sunlit Tropical Camp-Collar Set',
        note: `Playful tropical print cotton camp-collar shirt with khaki stretch chino shorts.`,
        vibe: 'Playful',
        personaEnergy: 'Full of excitement and sunny energy, mid-laugh on a coastal getaway.',
        palette: ['#0284c7', '#84cc16', '#fef08a'],
        imageUrl: '/replace-with-generated/look-02.webp',
        outfit: `Boys lightweight tropical print camp-collar cotton shirt with beige relaxed stretch chino shorts.`,
        outfitColor: 'Tropical ocean blue and palm green with sandy beige.',
        jewellery: 'None.',
        hairstyle: 'Textured playful crop.',
        makeup: 'None.',
        footwear: 'Water-friendly cushioned velcro sandals.',
        accessories: 'Polarized kids sunglasses.',
        confidence: 95,
        applicableCategories: ['outfit', 'footwear', 'accessories'],
        reasoning: [
          'Airy cotton poplin resists humidity and keeps kids cool.',
          'Casual stretch chino shorts transition effortlessly from beach to resort dining.',
        ],
        pieces: [
          { category: 'Top', name: 'Boys Tropical Camp-Collar Shirt', detail: 'Airy poplin cotton with tropical botanical print.' },
          { category: 'Bottom', name: 'Beige Stretch Chino Shorts', detail: 'Comfort stretch cotton with deep pockets.' },
          { category: 'Shoe', name: 'Cushioned Velcro Sandals', detail: 'Quick-drying waterproof straps.' },
        ],
      },
      {
        id: 'boy-vacation-03',
        title: 'Coastal Striped Cotton Classic',
        note: `Lightweight nautical stripe organic tee with relaxed navy drawstring shorts.`,
        vibe: 'Grounded',
        personaEnergy: 'Easy-going, comfortable, and content exploring seaside markets.',
        palette: ['#1e3a8a', '#f8fafc', '#fbbf24'],
        imageUrl: '/replace-with-generated/look-03.webp',
        outfit: `Boys navy and white striped lightweight cotton jersey tee with relaxed navy drawstring shorts.`,
        outfitColor: 'Navy blue and ocean white with sunny accents.',
        jewellery: 'None.',
        hairstyle: 'Clean natural short cut.',
        makeup: 'None.',
        footwear: 'Breathable slip-on canvas espadrille sneakers.',
        accessories: 'Navy cotton twill bucket hat.',
        confidence: 94,
        applicableCategories: ['outfit', 'footwear', 'accessories'],
        reasoning: [
          'Organic combed cotton is ultra-soft on sensitive skin during warm days.',
          'Relaxed navy shorts offer complete freedom of movement.',
        ],
        pieces: [
          { category: 'Top', name: 'Boys Striped Cotton Tee', detail: 'Breathable combed cotton crewneck.' },
          { category: 'Bottom', name: 'Navy Drawstring Cotton Shorts', detail: 'Relaxed leg opening for active mobility.' },
          { category: 'Shoe', name: 'Canvas Slip-On Sneakers', detail: 'Padded insole.' },
        ],
      },
      {
        id: 'boy-vacation-04',
        title: 'Seaside Chambray & Linen',
        note: `Short-sleeve featherweight chambray shirt with sage linen-blend shorts.`,
        vibe: 'Fresh',
        personaEnergy: 'Bright, smiling, standing poised for golden-hour family vacation photos.',
        palette: ['#0284c7', '#10b981', '#f1f5f9'],
        imageUrl: '/replace-with-generated/look-04.webp',
        outfit: `Boys featherlight short-sleeve sky blue chambray shirt with sage green linen-blend shorts.`,
        outfitColor: 'Sky blue chambray with earthy sage green.',
        jewellery: 'None.',
        hairstyle: 'Tidy side sweep.',
        makeup: 'None.',
        footwear: 'Perforated leather boat loafers.',
        accessories: 'Braided casual stretch belt.',
        confidence: 93,
        applicableCategories: ['outfit', 'footwear', 'accessories'],
        reasoning: [
          'Featherweight chambray adds a handsome, polished touch for vacation dinners.',
          'Linen-cotton blend dries quickly and stays soft.',
        ],
        pieces: [
          { category: 'Top', name: 'Boys Short-Sleeve Chambray Shirt', detail: 'Button-down collar with contrast buttons.' },
          { category: 'Bottom', name: 'Sage Linen-Blend Shorts', detail: 'Adjustable inner elastic.' },
          { category: 'Shoe', name: 'Perforated Boat Loafers', detail: 'Breathable footbed.' },
        ],
      },
      {
        id: 'boy-vacation-05',
        title: 'Sunset Boardwalk Waffle Co-ord',
        note: `Textured waffle cotton resort tee with terracotta breathable linen-cotton shorts.`,
        vibe: 'Radiant',
        personaEnergy: 'Warm, luminous smile watching the ocean sunset.',
        palette: ['#ea580c', '#fef3c7', '#334155'],
        imageUrl: '/replace-with-generated/look-05.webp',
        outfit: `Boys cream textured waffle-knit cotton resort tee with terracotta drawstring cotton-linen shorts.`,
        outfitColor: 'Warm terracotta and cream neutral with slate accents.',
        jewellery: 'None.',
        hairstyle: 'Natural tousled crop.',
        makeup: 'None.',
        footwear: 'Cushioned ergonomic slide sandals.',
        accessories: 'Woven friendship wristband.',
        confidence: 92,
        applicableCategories: ['outfit', 'footwear', 'accessories'],
        reasoning: [
          'Waffle knit provides tactile dimension without heavy layering.',
          'Warm terracotta tones flatter golden-hour vacation photography.',
        ],
        pieces: [
          { category: 'Top', name: 'Boys Cream Waffle Cotton Tee', detail: 'Open knit texture for airflow.' },
          { category: 'Bottom', name: 'Terracotta Linen-Cotton Shorts', detail: 'Soft pre-washed fabric.' },
          { category: 'Shoe', name: 'Ergonomic Slide Sandals', detail: 'Molded arch support.' },
        ],
      },
    ];
  }

  if (isBoy) {
    return [
      {
        id: 'boy-look-01',
        title: 'Casual Chore Polish',
        note: `Sage green chore jacket over an oat cotton tee and straight-leg denim.`,
        vibe: 'Grounded',
        personaEnergy: 'Relaxed, curious, easy shoulders and a cheerful natural smile.',
        palette: ['#283d3b', '#d8b27c', '#f2e6d4'],
        imageUrl: '/replace-with-generated/look-01.webp',
        outfit: 'Boys sage cotton chore jacket with an oat crewneck tee and ink straight-leg denim jeans.',
        outfitColor: 'Sage green with warm oat and ink denim accents.',
        jewellery: 'None (child-safe styling).',
        hairstyle: 'Natural clean crop.',
        makeup: 'None (child-friendly natural skin).',
        footwear: 'Clean leather low-top boys sneakers.',
        accessories: 'Structured boys canvas crossbody or backpack.',
        confidence: 95,
        applicableCategories: ['outfit', 'footwear', 'accessories'],
        reasoning: [
          'Durable cotton chore jacket provides stylish, comfortable layering for active boys.',
          'Relaxed straight-leg denim offers durability and easy playground movement.',
          'Neutral palette highlights natural warm undertones comfortably.',
        ],
        pieces: [
          { category: 'Outer', name: 'Boys Sage Chore Jacket', detail: 'Relaxed utility fit with durable metal buttons.' },
          { category: 'Base', name: 'Oatmeal Cotton Crewneck Tee', detail: '100% breathable combed cotton.' },
          { category: 'Bottom', name: 'Ink Straight-Leg Denim Jeans', detail: 'Adjustable inner elastic waistband for comfort.' },
          { category: 'Shoe', name: 'Clean White Low-Top Sneakers', detail: 'Non-marking rubber sole.' },
        ],
      },
      {
        id: 'boy-look-02',
        title: 'Smart Weekend Polo',
        note: `Brick knit polo, charcoal overshirt, and tailored chino trousers.`,
        vibe: 'Confident',
        personaEnergy: 'Sharp and enthusiastic with a bright, charming expression.',
        palette: ['#a94f3c', '#c88c68', '#302f35'],
        imageUrl: '/replace-with-generated/look-02.webp',
        outfit: 'Boys brick red knit polo with an open charcoal overshirt and khaki stretch chinos.',
        outfitColor: 'Brick red with charcoal and khaki accents.',
        jewellery: 'None.',
        hairstyle: 'Neat side part with natural wave.',
        makeup: 'None (child-friendly natural skin).',
        footwear: 'Boys slip-on penny loafers or casual boat shoes.',
        accessories: 'Sporty digital wrist watch.',
        confidence: 93,
        applicableCategories: ['outfit', 'footwear', 'accessories'],
        reasoning: [
          'Knit polo offers structured elegance without restricting playtime flexibility.',
          'Khaki stretch chinos transition effortlessly from family lunch to gatherings.',
        ],
        pieces: [
          { category: 'Top', name: 'Boys Brick Red Knit Polo', detail: 'Ribbed collar with two-button placket.' },
          { category: 'Layer', name: 'Charcoal Cotton Twill Overshirt', detail: 'Wear open as a lightweight layer.' },
          { category: 'Bottom', name: 'Khaki Stretch Chino Trousers', detail: 'Reinforced knee construction.' },
          { category: 'Shoe', name: 'Boys Casual Penny Loafers', detail: 'Padded insole.' },
        ],
      },
      {
        id: 'boy-look-03',
        title: 'Maritime Sport Classic',
        note: `Nautical striped cotton pullover with navy cargo joggers and sneakers.`,
        vibe: 'Playful',
        personaEnergy: 'Full of dynamic energy, mid-laugh, ready for an adventure.',
        palette: ['#1e3a8a', '#f8fafc', '#d97706'],
        imageUrl: '/replace-with-generated/look-03.webp',
        outfit: 'Boys navy and white striped cotton knit pullover with navy relaxed cargo joggers.',
        outfitColor: 'Navy blue and crisp white with warm tan highlights.',
        jewellery: 'None.',
        hairstyle: 'Sporty tousled hair.',
        makeup: 'None (child-friendly natural skin).',
        footwear: 'Cushioned athletic running sneakers.',
        accessories: 'Navy cotton baseball cap.',
        confidence: 92,
        applicableCategories: ['outfit', 'footwear', 'accessories'],
        reasoning: [
          'Timeless striped pullover brings playful seaside charm.',
          'Cargo joggers offer convenient pockets and elasticated cuffs.',
        ],
        pieces: [
          { category: 'Top', name: 'Boys Striped Cotton Pullover', detail: 'Soft loopback French terry cotton.' },
          { category: 'Bottom', name: 'Navy Relaxed Cargo Joggers', detail: 'Drawstring waist and cargo flap pockets.' },
          { category: 'Shoe', name: 'Cushioned Athletic Running Sneakers', detail: 'Breathable mesh upper.' },
          { category: 'Accessories', name: 'Cotton Twill Baseball Cap', detail: 'Adjustable snapback closure.' },
        ],
      },
      {
        id: 'boy-look-04',
        title: 'Modern Chambray Button-Down',
        note: `Crisp blue chambray button-down shirt with olive cotton shorts or chinos.`,
        vibe: 'Fresh',
        personaEnergy: 'Crisp, bright, and smiling with confident poise.',
        palette: ['#0284c7', '#65a30d', '#f8fafc'],
        imageUrl: '/replace-with-generated/look-04.webp',
        outfit: 'Boys light-wash chambray button-down shirt paired with olive twill chino pants.',
        outfitColor: 'Sky blue chambray with earthy olive green.',
        jewellery: 'None.',
        hairstyle: 'Textured taper cut.',
        makeup: 'None (child-friendly natural skin).',
        footwear: 'Tan leather boat shoes or slip-on canvas shoes.',
        accessories: 'Woven brown stretch belt.',
        confidence: 91,
        applicableCategories: ['outfit', 'footwear', 'accessories'],
        reasoning: [
          'Chambray delivers a handsome, polished silhouette suitable for all occasions.',
          'Breathable cotton twill keeps kids comfortable throughout warm days.',
        ],
        pieces: [
          { category: 'Top', name: 'Boys Chambray Button-Down Shirt', detail: 'Patch chest pocket and roll-up sleeve tabs.' },
          { category: 'Bottom', name: 'Olive Green Chino Trousers', detail: 'Durable stretch cotton twill.' },
          { category: 'Shoe', name: 'Tan Slip-On Canvas Shoes', detail: 'Flexible rubber outsole.' },
        ],
      },
      {
        id: 'boy-look-05',
        title: 'Celebration Tailored Blazer',
        note: `Tailored navy cotton-linen blazer with crisp white shirt and beige trousers.`,
        vibe: 'Poised',
        personaEnergy: 'Handsome, charming, standing tall with a bright smile.',
        palette: ['#1e293b', '#f8fafc', '#e2e8f0'],
        imageUrl: '/replace-with-generated/look-05.webp',
        outfit: 'Boys tailored navy cotton-linen blazer over a white poplin dress shirt and beige trousers.',
        outfitColor: 'Navy suiting with crisp white and beige.',
        jewellery: 'None.',
        hairstyle: 'Sleek side-part styling.',
        makeup: 'None (child-friendly natural skin).',
        footwear: 'Polished brown oxford shoes or loafers.',
        accessories: 'Matching striped silk bow tie or necktie.',
        confidence: 94,
        applicableCategories: ['outfit', 'footwear', 'accessories'],
        reasoning: [
          'Unlined cotton-linen blazer keeps young boys sharp without overheating.',
          'Classic color pairing makes any family event or ceremony memorable.',
        ],
        pieces: [
          { category: 'Outer', name: 'Boys Navy Cotton-Linen Blazer', detail: 'Notch lapel with two-button closure.' },
          { category: 'Base', name: 'White Cotton Poplin Dress Shirt', detail: 'Soft button-down collar.' },
          { category: 'Bottom', name: 'Beige Flat-Front Chino Trousers', detail: 'Clean front with elastic back waistband.' },
          { category: 'Shoe', name: 'Polished Brown Oxford Loafers', detail: 'Cushioned footbed.' },
        ],
      },
    ];
  }

  if (isMan) {
    return [
      {
        id: 'men-look-01',
        title: 'Modern Tailored Polish',
        note: `Tailored navy single-breasted blazer over crisp white shirt, stretch chinos, and leather loafers.`,
        vibe: 'Poised',
        personaEnergy: 'Composed, upright, radiating quiet executive capability and polished confidence.',
        palette: ['#0f172a', '#64748b', '#f8fafc'],
        imageUrl: '/replace-with-generated/look-01.webp',
        outfit: 'Men tailored navy single-breasted blazer over a crisp white cotton shirt and beige stretch chinos.',
        outfitColor: 'Navy suiting with crisp white and warm beige.',
        jewellery: 'Classic analog chronograph watch with brown leather strap.',
        hairstyle: 'Clean taper fade with styled side part.',
        makeup: 'Clean natural grooming with hydrated lips.',
        footwear: 'Handcrafted brown leather penny loafers.',
        accessories: 'Structured leather laptop messenger bag and UV sunglasses.',
        confidence: 96,
        applicableCategories: ['outfit', 'footwear', 'accessories', 'jewellery'],
        reasoning: [
          'Sharp tailoring elevates presence and commands respect across business and social settings.',
          'Classic navy and neutral palette complements your undertone effortlessly.',
          'Quality leather loafers ensure all-day comfort without sacrificing polish.',
        ],
        pieces: [
          { category: 'Outer', name: 'Men Tailored Navy Blazer', detail: 'Notch lapel structured blazer.' },
          { category: 'Top', name: 'White Cotton Dress Shirt', detail: 'Crisp spread collar.' },
          { category: 'Bottom', name: 'Beige Stretch Chino Trousers', detail: 'Tailored slim-straight fit.' },
          { category: 'Shoe', name: 'Brown Leather Penny Loafers', detail: 'Cushioned insole.' },
        ],
      },
      {
        id: 'men-look-02',
        title: 'Smart Weekend Polo',
        note: `Brick knit polo, charcoal overshirt, and dark tailored wool-blend trousers.`,
        vibe: 'Magnetic',
        personaEnergy: 'Sharp and self-possessed — chin level, direct eye contact with relaxed assurance.',
        palette: ['#a94f3c', '#302f35', '#f1f5f9'],
        imageUrl: '/replace-with-generated/look-02.webp',
        outfit: 'Men brick red knit polo with an open charcoal overshirt and dark tailored stretch trousers.',
        outfitColor: 'Brick red with charcoal and dark grey accents.',
        jewellery: 'Slim brushed-metal chain with a warm leather strap watch.',
        hairstyle: 'Low-volume side part with natural movement.',
        makeup: 'Clean natural grooming.',
        footwear: 'Polished black leather penny loafers.',
        accessories: 'Structured leather wallet and classic sunglasses.',
        confidence: 93,
        applicableCategories: ['outfit', 'footwear', 'accessories', 'jewellery'],
        reasoning: [
          'Knit polo offers structured elegance without restricting movement.',
          'Dark tailored trousers transition effortlessly from day to evening dining.',
        ],
        pieces: [
          { category: 'Top', name: 'Brick Knit Polo', detail: 'Open collar creates easy vertical lines.' },
          { category: 'Layer', name: 'Charcoal Cotton Overshirt', detail: 'Wear unbuttoned as a light frame.' },
          { category: 'Bottom', name: 'Dark Tailored Stretch Trousers', detail: 'Fluid wool blend with clean front.' },
          { category: 'Shoe', name: 'Polished Penny Loafers', detail: 'Low-profile genuine leather.' },
        ],
      },
      {
        id: 'men-look-03',
        title: 'Clean Minimalist Utility',
        note: `Sage chore jacket, oat waffle crewneck tee, and straight-leg indigo denim.`,
        vibe: 'Grounded',
        personaEnergy: 'Calm and unhurried — relaxed half-smile and easy, natural shoulders.',
        palette: ['#283d3b', '#d8b27c', '#1e293b'],
        imageUrl: '/replace-with-generated/look-03.webp',
        outfit: 'Men sage cotton chore jacket with an oat waffle crewneck tee and ink straight-leg denim jeans.',
        outfitColor: 'Sage green with warm oat and ink denim accents.',
        jewellery: 'Brushed gold analog watch and one fine metallic ring.',
        hairstyle: 'Natural texture, gently styled.',
        makeup: 'Clean natural grooming.',
        footwear: 'Clean white leather low-top sneakers.',
        accessories: 'Structured canvas messenger bag.',
        confidence: 92,
        applicableCategories: ['outfit', 'footwear', 'accessories', 'jewellery'],
        reasoning: [
          'Utility chore jacket provides relaxed, durable structure.',
          'Straight-leg denim balances relaxed proportions effortlessly.',
        ],
        pieces: [
          { category: 'Outer', name: 'Men Sage Chore Jacket', detail: 'Relaxed utility fit with durable buttons.' },
          { category: 'Base', name: 'Oatmeal Waffle Crewneck Tee', detail: 'Breathable textured cotton.' },
          { category: 'Bottom', name: 'Ink Straight-Leg Denim Jeans', detail: 'Clean dark wash denim.' },
          { category: 'Shoe', name: 'White Leather Low-Top Sneakers', detail: 'Non-marking rubber sole.' },
        ],
      },
      {
        id: 'men-look-04',
        title: 'Breezy Linen Coastal',
        note: `Sky blue linen-blend button-down shirt with olive cotton chinos and boat shoes.`,
        vibe: 'Breezy',
        personaEnergy: 'Easy-going, bright, sunlit expression walking outdoors.',
        palette: ['#0284c7', '#65a30d', '#f8fafc'],
        imageUrl: '/replace-with-generated/look-04.webp',
        outfit: 'Men light sky blue linen-blend button-down shirt with olive cotton chino pants.',
        outfitColor: 'Sky blue chambray with earthy olive green.',
        jewellery: 'Minimalist stainless steel wrist watch.',
        hairstyle: 'Textured taper cut.',
        makeup: 'Clean natural grooming.',
        footwear: 'Handcrafted tan leather boat loafers.',
        accessories: 'Polarized UV sunglasses.',
        confidence: 91,
        applicableCategories: ['outfit', 'footwear', 'accessories', 'jewellery'],
        reasoning: [
          'Linen-cotton blend breathes easily in warm environments.',
          'Olive chinos provide a modern versatile earthy foundation.',
        ],
        pieces: [
          { category: 'Top', name: 'Men Sky Blue Linen Shirt', detail: 'Breathable weave with roll-up sleeve tabs.' },
          { category: 'Bottom', name: 'Olive Green Chino Trousers', detail: 'Stretch cotton twill.' },
          { category: 'Shoe', name: 'Tan Leather Boat Loafers', detail: 'Cushioned footbed.' },
        ],
      },
      {
        id: 'men-look-05',
        title: 'Modern Monochrome Sophistication',
        note: `Charcoal merino wool knit sweater with slim grey formal trousers and derby shoes.`,
        vibe: 'Daring',
        personaEnergy: 'Sharp, modern, self-assured stance with quiet executive poise.',
        palette: ['#1e293b', '#64748b', '#f8fafc'],
        imageUrl: '/replace-with-generated/look-05.webp',
        outfit: 'Men charcoal fine-gauge knit crewneck sweater with light grey tailored slim trousers.',
        outfitColor: 'Charcoal and light slate grey monochrome.',
        jewellery: 'Solid stainless steel mesh watch.',
        hairstyle: 'Neat side part with groomed edges.',
        makeup: 'Clean natural grooming.',
        footwear: 'Polished black leather derby formal shoes.',
        accessories: 'Sleek leather bifold cardholder.',
        confidence: 94,
        applicableCategories: ['outfit', 'footwear', 'accessories', 'jewellery'],
        reasoning: [
          'Monochrome palette creates an elongated, statuesque silhouette.',
          'Fine-gauge knit offers tactile luxury without bulk.',
        ],
        pieces: [
          { category: 'Top', name: 'Charcoal Fine Knit Sweater', detail: 'Ribbed crewneck and cuffs.' },
          { category: 'Bottom', name: 'Grey Tailored Slim Trousers', detail: 'Creased front with tapered hem.' },
          { category: 'Shoe', name: 'Polished Black Derby Shoes', detail: 'Full-grain leather with cushioned sole.' },
        ],
      },
    ];
  }

  // Fallback to static mock looks for general/unspecified adult queries
  return mockLooks;
}

/**
 * Produce 5 complete-look recommendations for the given profile.
 *
 * Calls the backend's /api/recommendations route, which uses GPT-4o to
 * generate 5 genuinely personalized styling strategies from the profile
 * (appearance, body, taste, occasion, budget). If that call fails for any
 * reason (no OPENAI_API_KEY configured, network issue, backend not
 * deployed yet, etc.) this falls back to the dynamically generated
 * occasion/color/persona-aware look suite so the UI always has an accurate,
 * culturally faithful recommendation — never a generic mismatch.
 *
 * The curated suite cannot interpret free-text styling instructions, so when the
 * user has written a custom styling request the failure is surfaced (the UI offers
 * a retry) instead of substituting looks that ignore that request.
 */
export const getLookRecommendations = async (
  profile: SkinTuneProfile,
): Promise<LookRecommendation[]> => {
  let failureReason = 'The styling service could not be reached.';
  try {
    const { photoUrl: _photoUrl, ...profileForRequest } = profile;
    const res = await fetch('/api/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: profileForRequest }),
    });

    if (res.ok) {
      const data = (await res.json()) as { recommendations: LookRecommendation[] };
      if (data.recommendations?.length) {
        return data.recommendations;
      }
    } else {
      const errData = await res.json().catch(() => null);
      failureReason = errData?.message || errData?.error || `The styling service returned HTTP ${res.status}.`;
      console.warn(
        `Backend recommendations returned HTTP ${res.status}: ${errData?.message || errData?.error || 'falling back to curated looks'}`,
      );
    }
  } catch (err) {
    console.warn('Backend recommendations call failed, falling back to dynamic look generation:', err);
  }

  if (profile.customStyleNotes?.trim()) {
    throw new Error(
      `${failureReason} Your custom styling request needs live AI styling, so no pre-made looks were substituted. Please try again.`,
    );
  }
  return generateFallbackLooks(profile);
};

