// Centralized selection option lists for the onboarding wizard and returning-user flows.
// Keeping these here (instead of inline literals in App.tsx) avoids duplication and
// makes the option vocabulary easy to audit or extend in one place.

export type SelectOption = {
  label: string;
  description?: string;
  icon?: string;
  color?: string;
};

export const pronounOptions: SelectOption[] = [
  { label: 'Women’s styling', description: 'Tailored silhouettes, beauty, makeup & jewellery direction' },
  { label: 'Men’s styling', description: 'Sharp cuts, grooming, footwear & classic accessories' },
  { label: 'Kids / Boys styling', description: 'Playful, comfortable & tailored boys’ clothing, footwear & accessories' },
  { label: 'Kids / Girls styling', description: 'Playful dresses, coordinated sets, footwear & festive wear' },
];

export const kidsGenderOptions: SelectOption[] = [
  { label: 'Boy', description: 'Boys’ kidswear & styling' },
  { label: 'Girl', description: 'Girls’ kidswear & styling' },
  { label: 'Unisex / All', description: 'Versatile & gender-neutral kids styling' },
];

export const ageGroupOptions: SelectOption[] = [
  { label: 'Under 25' },
  { label: '25–34' },
  { label: '35–49' },
  { label: '50+' },
  { label: 'Prefer not to say' },
];

export const adultAgeGroupOptions = ageGroupOptions;

export const kidsAgeGroupOptions: SelectOption[] = [
  { label: '0-5' },
  { label: '6-10' },
  { label: '11-15' },
  { label: '15-19' },
];

export const bodyBuildOptions: SelectOption[] = [
  { label: 'Slim', icon: '🪶', description: 'A lean, narrower line through the frame.' },
  { label: 'Average', icon: '⚖️', description: 'A balanced line through shoulders and hips.' },
  { label: 'Athletic', icon: '🏋️', description: 'Defined or broader shoulders.' },
  { label: 'Curvy', icon: '🌸', description: 'A waist-led line with visible softness.' },
  { label: 'Broad', icon: '🧱', description: 'A fuller line through the shoulders or frame.' },
  { label: 'Prefer not to say', icon: '🤍', description: 'We’ll keep the fit advice flexible.' },
];

export const fitOptions: SelectOption[] = [
  { label: 'Fitted', icon: '✨', description: 'Closer to the body, more defined.' },
  { label: 'Regular', icon: '🙂', description: 'A classic, everyday fit.' },
  { label: 'Relaxed', icon: '🧸', description: 'Roomier, easy movement.' },
  { label: 'Oversized', icon: '🔥', description: 'Bold volume, statement proportion.' },
];

// Note: "priorities" (Style First / Comfort First / Balance Both) is no
// longer a separate onboarding question — the recommendation engine infers
// this balance from the user's style and impression choices instead, to
// keep the required form shorter. See artifacts/api-server/src/routes/
// recommendations.ts's buildUserPrompt().

export const styleOptions: SelectOption[] = [
  { label: 'Elegant', icon: '✨', description: 'Polished, graceful cuts & refined balance.' },
  { label: 'Glamorous', icon: '🪞', description: 'High-shine sparkle, drama & red-carpet allure.' },
  { label: 'Traditional', icon: '🪷', description: 'Authentic ethnic weaves, sarees & cultural craft.' },
  { label: 'Minimal', icon: '◻️', description: 'Clean lines, neutral tones & zero clutter.' },
  { label: 'Modern', icon: '⚡', description: 'Sharp current trends, crisp tailoring & fresh cuts.' },
  { label: 'Creative', icon: '🎨', description: 'Artistic color mixes, eclectic & quirky pairings.' },
  { label: 'Luxury', icon: '💎', description: 'Opulent rich fabrics, couture finish & fine details.' },
  { label: 'Casual', icon: '☕', description: 'Effortless, relaxed fits for daily comfort.' },
  { label: 'Bold', icon: '🔥', description: 'High-impact silhouettes & eye-catching confidence.' },
  { label: 'Classic & Timeless', icon: '🏛️', description: 'Enduring wardrobe essentials that never go out of style.' },
  { label: 'Indo-Western Fusion', icon: '🪡', description: 'Ethnic drapes blended with modern chic silhouettes.' },
  { label: 'Boho & Free-Spirited', icon: '🌿', description: 'Earthy textures, relaxed flow & artisanal layers.' },
  { label: 'Romantic & Soft', icon: '🌸', description: 'Dreamy pastels, delicate ruffles & feminine drape.' },
  { label: 'Old Money', icon: '🍸', description: 'Quiet luxury, understated neutrals & heritage quality.' },
  { label: 'Streetwear & Edgy', icon: '🛹', description: 'Oversized urban cuts, sneakers & rebellious energy.' },
  { label: 'Vintage & Retro', icon: '🎞️', description: 'Nostalgic 70s–90s revival & classic throwback charm.' },
  { label: 'Chic Contemporary', icon: '🕶️', description: 'Sleek metropolitan styling with trendy ease.' },
  { label: 'Royal & Regal', icon: '👑', description: 'Majestic silks, zardozi embroidery & heirloom pride.' },
  { label: 'Athleisure', icon: '👟', description: 'Sporty activewear elevated for casual chic.' },
  { label: 'Androgynous & Fluid', icon: '⚖️', description: 'Clean gender-fluid lines & neutral tailoring.' },
];

// Step 7 style worlds per audience. `styleOptions` above stays the list for a custom
// audience that matches none of these (see getStyleOptionsForAudience).
export type OnboardingAudience = 'women' | 'men' | 'boys' | 'girls' | 'kids' | 'neutral';

const womenStyleOptions: SelectOption[] = [
  { label: 'Elegant', icon: '✨', description: 'Polished, graceful cuts & refined balance.' },
  { label: 'Glamorous', icon: '🪞', description: 'High-shine sparkle, drama & red-carpet allure.' },
  { label: 'Minimal', icon: '◻️', description: 'Clean lines, neutral tones & zero clutter.' },
  { label: 'Romantic & Soft', icon: '🌸', description: 'Dreamy pastels, delicate ruffles & feminine drape.' },
  { label: 'Old Money', icon: '🍸', description: 'Quiet luxury, understated neutrals & heritage quality.' },
  { label: 'Indo-Western', icon: '🪡', description: 'Ethnic drapes and textiles blended with modern silhouettes.' },
  { label: 'Traditional', icon: '🪷', description: 'Authentic ethnic weaves, sarees, lehengas & cultural craft.' },
  { label: 'Modern', icon: '⚡', description: 'Sharp current trends, crisp tailoring & fresh cuts.' },
];

const menStyleOptions: SelectOption[] = [
  { label: 'Classic & Timeless', icon: '🏛️', description: 'Enduring essentials, clean fits & versatile colours.' },
  { label: 'Smart Casual', icon: '👔', description: 'Relaxed tailoring and refined texture without a full suit.' },
  { label: 'Formal & Tailored', icon: '🤵', description: 'Structured suiting, crisp shirting & refined leather shoes.' },
  { label: 'Streetwear', icon: '🛹', description: 'Relaxed urban cuts, layering & sneaker-led looks.' },
  { label: 'Minimal', icon: '◻️', description: 'Clean lines, tonal palettes & quiet details.' },
  { label: 'Old Money', icon: '🍸', description: 'Understated heritage quality, natural fibres & no logos.' },
  { label: 'Traditional', icon: '🪷', description: 'Kurtas, sherwanis, bandhgalas & heritage textiles.' },
  { label: 'Indo-Western', icon: '🪡', description: 'Ethnic cuts and textiles blended with modern tailoring.' },
];

const boysStyleOptions: SelectOption[] = [
  { label: 'Cute & Playful', icon: '🎈', description: 'Fun prints, bright colours & easy pieces.' },
  { label: 'Smart Casual', icon: '👕', description: 'Neat shirts and polos with comfy bottoms.' },
  { label: 'Traditional & Festive', icon: '🪔', description: 'Kurta sets, bundis & festive ethnic wear.' },
  { label: 'Mini Gentleman', icon: '🎩', description: 'Waistcoats, smart shirts & dressy little details.' },
  { label: 'Comfortable Everyday', icon: '🧸', description: 'Soft, breathable clothes for play and school days.' },
  { label: 'Sporty', icon: '⚽', description: 'Active tees, joggers & sneakers.' },
];

const girlsStyleOptions: SelectOption[] = [
  { label: 'Cute & Playful', icon: '🎈', description: 'Fun prints, bright colours & easy pieces.' },
  { label: 'Princess & Party', icon: '👑', description: 'Twirly party dresses, tulle & sparkle.' },
  { label: 'Floral & Pastel', icon: '🌸', description: 'Soft pastels, florals & pretty details.' },
  { label: 'Traditional & Festive', icon: '🪔', description: 'Lehengas, sharara sets & festive ethnic wear.' },
  { label: 'Casual & Comfy', icon: '🧸', description: 'Soft, breathable everyday clothes.' },
  { label: 'Modern', icon: '⚡', description: 'Trendy co-ords and fresh cuts.' },
];

const uniqueByLabel = (lists: SelectOption[][]): SelectOption[] => {
  const seen = new Set<string>();
  return lists.flat().filter((o) => (seen.has(o.label) ? false : (seen.add(o.label), true)));
};

export const audienceStyleOptions: Record<OnboardingAudience, SelectOption[]> = {
  women: womenStyleOptions,
  men: menStyleOptions,
  boys: boysStyleOptions,
  girls: girlsStyleOptions,
  // A child without a stated gender gets both kids lists
  kids: uniqueByLabel([boysStyleOptions, girlsStyleOptions]),
  neutral: styleOptions,
};

// Step 8 quick prompts per audience. They are starting points the user can tap, never
// recommendations; the user's own words in the text box always come first.
const womenQuickTags = [
  '🥻 Latest traditional saree look',
  '👗 Latest Indo-Western look',
  '🌸 Soft pastel ethnic',
  '✨ Minimal silver jewellery',
  '💎 Statement jewellery',
  '🧥 Tailored power suit',
  '⚡ Modern sleek cuts',
  '🌿 Comfortable breathable fabrics',
];

const menQuickTags = [
  '🪷 Classic kurta set',
  '🤵 Bandhgala or Indo-Western jacket',
  '🧥 Sharp tailored suit',
  '👔 Smart casual layers',
  '🛹 Clean streetwear',
  '⌚ Minimal watch & accessories',
  '🍸 Old-money neutrals',
  '🌿 Breathable linen & cotton',
];

const boysQuickTags = [
  '🪔 Festive kurta-pyjama set',
  '🎩 Mini gentleman waistcoat',
  '👕 Comfy tee & shorts',
  '⚽ Sporty joggers & sneakers',
  '🎈 Fun bright prints',
  '🌿 Soft breathable cotton',
];

const girlsQuickTags = [
  '👑 Twirly party dress',
  '🪔 Festive lehenga or sharara set',
  '🌸 Floral pastel dress',
  '🧸 Comfy everyday co-ord',
  '🎀 Cute hair accessories',
  '🌿 Soft breathable cotton',
];

const uniqueTags = (lists: string[][]): string[] => [...new Set(lists.flat())];

export const audienceQuickTags: Record<OnboardingAudience, string[]> = {
  women: womenQuickTags,
  men: menQuickTags,
  boys: boysQuickTags,
  girls: girlsQuickTags,
  kids: uniqueTags([boysQuickTags, girlsQuickTags]),
  neutral: uniqueTags([womenQuickTags, menQuickTags]),
};

export const getStyleOptionsForAudience = (audience: OnboardingAudience): SelectOption[] =>
  audienceStyleOptions[audience];

export const getQuickTagsForAudience = (audience: OnboardingAudience): string[] => audienceQuickTags[audience];

/** Every preset Step 7 label of any audience (anything else in profile.style is the user's own text). */
export const allPresetStyleLabels: ReadonlySet<string> = new Set(
  Object.values(audienceStyleOptions).flatMap((list) => list.map((o) => o.label)),
);

export const colorLoveOptions: SelectOption[] = [
  { label: 'Terracotta', color: '#C26A51' },
  { label: 'Cream', color: '#FDFBF7' },
  { label: 'Ink navy', color: '#1B2A4A' },
  { label: 'Olive', color: '#556B2F' },
  { label: 'Butter yellow', color: '#F6E294' },
  { label: 'Clear white', color: '#FFFFFF' },
  { label: 'Berry', color: '#8E2A59' },
  { label: 'Chocolate', color: '#4B2D17' },
  { label: 'Emerald green', color: '#097969' },
  { label: 'Dusty rose', color: '#DCAE96' },
  { label: 'Sage green', color: '#9CAF88' },
  { label: 'Burgundy / Wine', color: '#6A1B29' },
  { label: 'Royal blue', color: '#244CB2' },
  { label: 'Mustard gold', color: '#E1A126' },
  { label: 'Lilac / Lavender', color: '#C8B6E2' },
  { label: 'Charcoal grey', color: '#36454F' },
  { label: 'Teal', color: '#194343' },
  { label: 'Rust', color: '#B7410E' },
  { label: 'Plum', color: '#5A2A57' },
  { label: 'Champagne gold', color: '#F0E2C8' },
  { label: 'Coral', color: '#F88379' },
  { label: 'Forest green', color: '#1E3F20' },
];

export const colorAvoidOptions: SelectOption[] = [
  { label: 'Neon brights', color: 'linear-gradient(135deg, #FF007F, #00FFCC, #FFFF00)' },
  { label: 'Pastels', color: 'linear-gradient(135deg, #FFB6C1, #B0E0E6, #FFE4E1)' },
  { label: 'All black', color: '#111111' },
  { label: 'Orange', color: '#FF6F00' },
  { label: 'Cool grey', color: '#8E9CA8' },
  { label: 'Busy patterns', color: 'repeating-conic-gradient(#194343 0% 25%, #D7BD9B 0% 50%)' },
  { label: 'Acid / Lime green', color: '#A4DE02' },
  { label: 'Muddy brown', color: '#5C4033' },
  { label: 'Bright yellow', color: '#FFD700' },
  { label: 'Crimson / Red', color: '#DC143C' },
  { label: 'Nude / Beige washouts', color: '#E4D5B7' },
  { label: 'Metallics & Glitter', color: 'linear-gradient(135deg, #FFD700, #E5E4E2, #B87333)' },
  { label: 'Hot pink', color: '#FF1493' },
  { label: 'Khaki / Drab', color: '#7B7861' },
];

export const restrictionOptions: SelectOption[] = [
  { label: 'No wool or scratchy textures', icon: '🧶' },
  { label: 'Comfortable shoes only', icon: '👟' },
  { label: 'Modest coverage', icon: '🧕' },
  { label: 'Easy-care fabrics', icon: '🧺' },
  { label: 'No dry cleaning', icon: '🚫' },
  { label: 'Pure cotton & breathable fabrics only', icon: '🌿' },
  { label: 'No deep necklines', icon: '👚' },
  { label: 'Lightweight jewelry only (Sensitive ears/skin)', icon: '✨' },
  { label: 'Maternity / Nursing friendly', icon: '🤱' },
  { label: 'Wrinkle-resistant & travel ready', icon: '🧳' },
  { label: 'None of these', icon: '👌' },
];

export const occasionOptions: SelectOption[] = [
  { label: 'Birthday', icon: '🎂' },
  { label: 'Wedding', icon: '💍' },
  { label: 'Party', icon: '🎉' },
  { label: 'Festival', icon: '🪷' },
  { label: 'Office', icon: '💼' },
  { label: 'Date', icon: '❤️' },
  { label: 'Vacation', icon: '✈️' },
  { label: 'Photoshoot', icon: '📸' },
  { label: 'Everyday', icon: '☀️' },
  { label: 'Interview', icon: '🎓' },
  { label: 'Special Event', icon: '✨' },
];

export const impressionOptions: SelectOption[] = [
  { label: 'Powerful', icon: '👑' },
  { label: 'Elegant', icon: '🌸' },
  { label: 'Glamorous', icon: '💎' },
  { label: 'Traditional', icon: '🪷' },
  { label: 'Romantic', icon: '❤️' },
  { label: 'Confident', icon: '😎' },
  { label: 'Minimal', icon: '🤍' },
  { label: 'Creative', icon: '🎨' },
  { label: 'Approachable', icon: '😊' },
];

export const budgetOptions: SelectOption[] = [
  { label: '₹0–₹2K', description: 'Smart, accessible finds.' },
  { label: '₹2K–₹5K', description: 'A mix of high-street and investment.' },
  { label: '₹5K–₹10K', description: 'More room for fabric and construction.' },
  { label: '₹10K–₹25K', description: 'More room for special pieces.' },
  { label: '₹25K+', description: 'Keep the focus on the look.' },
  { label: 'No strict budget', description: 'Show the best options for the direction.' },
];

// Quick-start chips for the returning-user home screen.
export const homeOccasionShortcuts: SelectOption[] = [
  { label: 'Everyday', icon: '☀️' },
  { label: 'Office', icon: '💼' },
  { label: 'Wedding', icon: '💍' },
  { label: 'Party', icon: '🎉' },
  { label: 'Date', icon: '❤️' },
  { label: 'Festival', icon: '🪷' },
  { label: 'Special Event', icon: '✨' },
];

// Feedback "what should we change" chips.
export const feedbackChangeOptions: SelectOption[] = [
  { label: 'Colour', icon: '🎨' },
  { label: 'Outfit', icon: '👗' },
  { label: 'Jewellery', icon: '💎' },
  { label: 'Makeup', icon: '💄' },
  { label: 'Hairstyle', icon: '💇' },
  { label: 'Overall Style', icon: '✨' },
];

export const feedbackFeelingOptions: SelectOption[] = [
  { label: 'Love it', icon: '❤️' },
  { label: 'I would wear it', icon: '👍' },
  { label: 'Maybe', icon: '🤔' },
  { label: 'Not my style', icon: '👎' },
];

// Look category badges applied to the 5 results, in order.
export const lookCategoryBadges = [
  { label: 'Best Match', icon: '⭐' },
  { label: 'Glamorous', icon: '💎' },
  { label: 'Elegant', icon: '🌸' },
  { label: 'Minimal', icon: '🤍' },
  { label: 'Modern Alternative', icon: '🔥' },
] as const;
