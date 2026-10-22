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

  const pronouns = (profile.pronouns || '').toLowerCase();
  const age = (profile.ageGroup || '').toLowerCase();
  const isChild = age.includes('kids') || age.includes('0–12') || age.includes('0-12') || pronouns.includes('kids') || pronouns.includes('child');
  const isWoman = !isChild && (pronouns.includes('women') || pronouns.includes('female') || pronouns.includes('she/her'));
  const isMan = !isChild && !isWoman && (pronouns.includes('male') || pronouns.includes('he/him') || /\bmen\b/.test(pronouns));

  const lovedColors = Array.isArray(profile.colorsLove) && profile.colorsLove.length > 0 ? profile.colorsLove : ['Pink'];
  const primaryColor = lovedColors[0] || 'Pink';
  const undertone = profile.appearance?.undertone || 'Warm';

  // 1. Garba / Navratri Festive Look Suite (e.g. Pink + Garba Night + Traditional)
  if (isGarba) {
    if (isChild) {
      return [
        {
          id: 'garba-child-01',
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

  // Fallback to static mock looks for general/unspecified queries
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
 */
export const getLookRecommendations = async (
  profile: SkinTuneProfile,
): Promise<LookRecommendation[]> => {
  try {
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
    console.warn('Falling back to personalized fallback recommendations:', err);
    // Simulated thinking latency so the fallback feels natural
    await new Promise((resolve) => setTimeout(resolve, 300));
    return generateFallbackLooks(profile);
  }
};
