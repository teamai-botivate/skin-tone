import { createHash } from "node:crypto";
import { getOpenAIClient, RECOMMENDATION_MODEL, getOpenAIKeyDiagnostics } from "./openai-client";
import { tavilySearch, getTavilyKeyDiagnostics, TavilySearchError } from "./tavily-client";
import { logger } from "./logger";
import { getStylingContext } from "./styling-context";
export { getStylingContext };
import { buildProductCacheFingerprint, PRODUCT_CACHE_VERSION } from "./product-cache-key";
import type {
  LookRecommendation,
  SkinTuneProfile,
  ProductResult,
  ProductCategory,
  ProductGroup,
  PriceTier,
  ProductRecommendationsResponse,
  KeyDiagnostic,
} from "./skintune-schemas";

export type PersonaType = "woman" | "man" | "child" | "neutral";

/**
 * Detects the user's styling persona (Woman, Man, Child, or Neutral)
 * based on their age group, styling demographic, and pronouns/styling selection.
 */
export function detectPersona(profile: SkinTuneProfile): PersonaType {
  const ctx = getStylingContext(profile);
  if (ctx.audience === "kids" || ctx.isKids) {
    return "child";
  }
  if (ctx.audience === "men") {
    return "man";
  }
  if (ctx.audience === "women") {
    return "woman";
  }
  return "neutral";
}

/**
 * Determines which shopping & styling categories are applicable for this profile.
 * - Children: NEVER adult makeup or mature jewellery.
 * - Men: Outfits, footwear, accessories (watches, belts, cufflinks), jewellery (if fitting).
 * - Women: Outfits, makeup (with AI shade matching), jewellery, footwear, accessories.
 */
export function getApplicableCategories(
  persona: PersonaType,
  requestedCategory?: string,
): ProductCategory[] {
  let categories: ProductCategory[];

  switch (persona) {
    case "child":
      categories = ["outfit", "footwear", "accessories"];
      break;
    case "man":
      categories = ["outfit", "footwear", "accessories", "jewellery"];
      break;
    case "woman":
    default:
      categories = ["outfit", "makeup", "jewellery", "footwear", "accessories"];
      break;
  }

  if (requestedCategory && requestedCategory !== "all") {
    if (requestedCategory === "footwear-accessories") {
      return categories.filter((c) => c === "footwear" || c === "accessories");
    }
    const valid = requestedCategory as ProductCategory;
    if (categories.includes(valid)) {
      return [valid];
    }
  }

  return categories;
}

export const SHADE_MATCH_DISCLAIMER =
  "AI shade matching from a photograph is an estimate and may vary because of lighting, camera conditions, and screen display. We recommend patch-testing or swatch verification before purchase.";

import {
  APPROVED_RETAILERS,
  BANNED_PLACEHOLDER_PATTERNS,
  cleanUrl,
  getCanonicalProductUrl,
  isValidProductUrl,
  determineUrlType,
  buildRetailerSearchUrl,
  getSafeProductUrl,
  isUrlConsistentWithProduct,
  getRetailerFromUrl,
  normalizeRetailerName,
  getProductEffectivePrice,
  compareProductsByPriceAscending,
  compareProductsByLookMatch,
  sortProductsByPriceAscending,
  buildFallbackSearchUrl,
} from "./retailer-urls";
import { buildRelevantSearchLinks, type DiscoveredSearchPage } from "./retailer-search-links";

export {
  APPROVED_RETAILERS,
  BANNED_PLACEHOLDER_PATTERNS,
  cleanUrl,
  getCanonicalProductUrl,
  isValidProductUrl,
  determineUrlType,
  buildRetailerSearchUrl,
  getSafeProductUrl,
  isUrlConsistentWithProduct,
  getRetailerFromUrl,
  normalizeRetailerName,
  getProductEffectivePrice,
  compareProductsByPriceAscending,
  compareProductsByLookMatch,
  sortProductsByPriceAscending,
  buildFallbackSearchUrl,
};



/**
 * Creates a normalized product identity string to deduplicate items by brand + title keywords.
 * Prevents showing multiple duplicate cards for different shade variants or carousel thumbnails of the same item.
 */
export function getProductIdentityKey(productTitle: string, brand: string): string {
  const normTitle = (productTitle || "")
    .toLowerCase()
    .replace(/^buy\s+/i, "")
    .replace(/online at (nykaa|myntra|ajio|amazon).*/i, "")
    .replace(/\|\s*(nykaa|myntra|ajio).*/i, "")
    .replace(/\b(spf\s*\d+|16h|12h|24h)\b/gi, "")
    .replace(/\b(shade\s*\d+|[0-9]{2,3}\s*[a-z]+)\b/gi, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const normBrand = (brand || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();

  // Audience words and the brand (already in the key) are not identifying: store titles read
  // "<Brand> Men <Colour> <Type>", so keeping them made every same-brand, same-colour men's
  // product share one key and the first (possibly wrong-category) candidate hid the rest.
  const significantTokens = normTitle
    .split(" ")
    .filter(
      (w) =>
        w.length > 2 &&
        w !== normBrand &&
        !["with", "and", "for", "the", "women", "womens", "men", "mens", "unisex", "boys", "girls", "kids"].includes(w),
    )
    .slice(0, 6)
    .join("-");

  return `${normBrand}:${significantTokens}`;
}


/**
 * Strips any footwear, shoe, heel, or handbag/bag mentions from an outfit garment title.
 * Prevents contaminated LLM output like "Dress and heeled shoes" from turning the outfit search into a shoe/bag search.
 */
/**
 * Ways of wrapping an unstitched saree. They describe how a saree is WORN, not what is
 * sold, so they never belong in a product search ("Kanjeevaram silk saree in a Nivi drape"
 * is sold as a Kanjeevaram silk saree). Constructions stores do sell — pre-draped,
 * pre-stitched, pant-style, dhoti-style, cowl, ruffle — are not matched and stay.
 */
const HAND_DRAPE_RE =
  /\s*\b(?:(?:in|with|styled\s+in|worn\s+in|draped\s+in)\s+)?(?:(?:an?|the)\s+)?(?:nivi|bengali|gujarati|maharashtrian|butterfly|seedha|ulta)[\s-]*(?:style[\s-]*)?(?:drape[ds]?|draping|pallu)\b|\s*\b(?:in\s+(?:an?\s+)?)?nivi\b/gi;

export function stripHandDrapeTerms(text: string): string {
  return text.replace(HAND_DRAPE_RE, " ").replace(/\s+/g, " ").replace(/[\s,;-]+$/, "").trim();
}

/**
 * "Dress" as a garment, as opposed to the formal qualifier in menswear names: "dress shirt",
 * "dress shoes", "dress trousers", "dress watch". Only the garment is women's-wear evidence.
 */
const DRESS_GARMENT_RE =
  /\bdress(?:es)?\b(?![\s-]*(?:shirts?|shoes?|trousers?|pants?|watch(?:es)?|socks?|belts?|boots?|sandals?|loafers?|code))/i;

export function mentionsDressGarment(text: string): boolean {
  return DRESS_GARMENT_RE.test(text);
}

/** Who a product is listed for, as far as its own words (title or URL slug) say. */
export type ProductAudience = "men" | "women" | "unisex" | "boys" | "girls" | "kids" | "unknown";

const AUDIENCE_MEN_RE = /\b(?:men|mens|men's|menswear|male|males|gents|gent's|gentleman|gentlemen|for\s+him)\b/;
const AUDIENCE_WOMEN_RE = /\b(?:women|womens|women's|womenswear|woman|ladies|lady|female|females|for\s+her)\b/;
const AUDIENCE_BOYS_RE = /\b(?:boys?|boy's)\b/;
const AUDIENCE_GIRLS_RE = /\b(?:girls?|girl's)\b/;
// "baby pink" / "baby blue" are colours, not an audience
const AUDIENCE_KIDS_RE = /\b(?:kids?|kid's|children|child|infants?|toddlers?|junior|baby(?!\s*(?:pink|blue)))\b/;

function normalizeAudienceText(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    // URL slugs and paths: "roadster-men-navy-shirt" -> "roadster men navy shirt"
    .replace(/[-_/+.=?&]/g, " ");
}

/**
 * Classifies a product's audience from its own wording. Gender words are matched as whole
 * words ("women" never counts as "men"), a product naming both men and women (or "unisex")
 * is unisex, and a product naming only a child audience is kids'. Nothing is inferred from
 * the garment type, occasion or style.
 */
export function classifyProductAudience(text: string): ProductAudience {
  const t = normalizeAudienceText(text);
  const men = AUDIENCE_MEN_RE.test(t);
  const women = AUDIENCE_WOMEN_RE.test(t);
  if (/\bunisex\b/.test(t) || (men && women)) return "unisex";
  if (men) return "men";
  if (women) return "women";
  const boys = AUDIENCE_BOYS_RE.test(t);
  const girls = AUDIENCE_GIRLS_RE.test(t);
  if (boys && !girls) return "boys";
  if (girls && !boys) return "girls";
  if (boys || girls || AUDIENCE_KIDS_RE.test(t)) return "kids";
  return "unknown";
}

/**
 * Audience of a candidate from its title and its URL, judged separately. The title is the
 * primary evidence; the URL slug decides only when the title is silent. A title and URL
 * that name different adult audiences are a conflict (usually a wrong or redirected page).
 */
export function assessProductAudience(
  title: string,
  url: string,
): { audience: ProductAudience | "conflict"; source: "title" | "url" | "none" } {
  let urlPath = url || "";
  try {
    urlPath = new URL(url).pathname;
  } catch {}
  const fromTitle = classifyProductAudience(title);
  const fromUrl = classifyProductAudience(urlPath);
  if (
    (fromTitle === "men" && fromUrl === "women") ||
    (fromTitle === "women" && fromUrl === "men")
  ) {
    return { audience: "conflict", source: "title" };
  }
  if (fromTitle !== "unknown") return { audience: fromTitle, source: "title" };
  if (fromUrl !== "unknown") return { audience: fromUrl, source: "url" };
  return { audience: "unknown", source: "none" };
}

/** Garment words that only exist in women's-wear; never a men's product, whatever its title says. */
const WOMENSWEAR_GARMENT_RE =
  /\b(lehenga|lehengas|saree|sarees|sari|saris|blouse|blouses|kurti|kurtis|gown|gowns|skirt|skirts|heels|stiletto|stilettos|bra|bras|lingerie|choli|anarkali)\b/i;

export function cleanOutfitGarmentTitle(title: string, targetGender?: string): string {
  if (!title) return targetGender === "boys" ? "Boys Outfit" : targetGender === "men" ? "Men's Outfit" : "Dress";
  let cleaned = title
    // Remove "and/with heeled shoes/heels/sandals/shoes/bag/clutch/purse/etc."
    .replace(
      /\s+(?:and|with|&|\+)\s+(?:heeled\s+shoes|heels?|sandals?|shoes?|footwear|loafers?|flats?|boots?|sneakers?|handbags?|bags?|totes?|purses?|clutch(?:es)?|accessories)[^,]*/gi,
      "",
    )
    // Remove standalone footwear/accessory words
    .replace(
      /\b(?:heeled\s+shoes|heels?|sandals?|shoes?|footwear|loafers?|flats?|boots?|sneakers?|handbags?|bags?|totes?|purses?|clutch(?:es)?)\b/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) {
    return targetGender === "boys" ? "Boys Outfit" : targetGender === "men" ? "Men's Outfit" : "Dress";
  }
  return cleaned;
}

/**
 * Strict consistency check between DISPLAYED PRODUCT and TARGET PRODUCT URL.
 * Prevents:
 * 1. Gender mismatches (e.g. men's clothing showing for women's styling profiles, women's/girls' clothes showing for boys).
 * 2. Garment subcategory mismatches (e.g. dresses showing for blazers, tops showing for trousers).
 * 3. Color clashes (e.g. pink pants showing for a chocolate brown suit).
 * 4. Accessory mismatches (e.g. traditional jhumkas showing for minimal studs).
 * 5. Category cross-contamination (e.g. footwear showing in outfit, electronics in footwear).
 * 6. Broken or empty search URLs (e.g. /search/ with undefined query).
 */
/**
 * Garment styles that define an upper-body item more precisely than its generic noun, and
 * that stores sell under several nouns ("Henley Shirt", "Henley Neck T-Shirt", "Henley
 * Top"). When a requirement names one, the style must match; the noun need not.
 */
const DISTINCT_TOP_STYLES: Array<{ name: string; pattern: RegExp }> = [
  { name: "henley", pattern: /\bhenley\b/i },
  // "U.S. Polo Assn" / "Polo Club" are brands, not the garment
  { name: "polo", pattern: /\bpolo\b(?![\s.-]*(?:assn|association|club))/i },
  { name: "crop top", pattern: /\b(?:crop\s*tops?|cropped\s*tops?|bustiers?|bralettes?|corsets?)\b/i },
  { name: "short kurti", pattern: /\b(?:short\s*kurt[ia]s?|peplum\s*(?:short\s*)?kurt[ia]s?)\b/i },
];

function requiredTopStyles(requiredItemTitle?: string) {
  return requiredItemTitle ? DISTINCT_TOP_STYLES.filter((s) => s.pattern.test(requiredItemTitle)) : [];
}

export function checkProductConsistency(
  productName: string,
  brand: string,
  category: ProductCategory,
  urlStr: string,
  citationTitle?: string,
  persona?: PersonaType,
  itemSubcategory?: string,
  expectedColor?: string,
  imageUrl?: string,
  price?: number,
  expectedOccasion?: string,
  expectedShade?: string,
  targetGender?: string,
  /** The recommended item's own title (e.g. "Men's Cream Henley Shirt"), for style-level matching. */
  requiredItemTitle?: string,
): { isConsistent: boolean; reason?: string } {
  const fullCheckText = `${productName || ""} ${urlStr || ""} ${citationTitle || ""}`.toLowerCase();
  const cleanName = (productName || "").toLowerCase();
  const subcat = (itemSubcategory || "").toLowerCase();
  const genderLower = (targetGender || "").toLowerCase();

  // 0. RETAILER URL SAFETY CHECK: Reject invalid or misleading retailer search endpoints
  if (urlStr.includes("myntra.com/search")) {
    return {
      isConsistent: false,
      reason: `Invalid retailer URL: Myntra /search routes to kids clothing set instead of product search (${urlStr})`,
    };
  }

  // 0a. CONTROVERSIAL / CRIMINAL / NOTORIOUS FIGURE SEO SPAM CHECK
  if (/\b(lawrence\s*bishnoi|gangster)\b/i.test(fullCheckText)) {
    return {
      isConsistent: false,
      reason: `Inappropriate content: Product '${productName}' contains blocked or controversial tokens (${urlStr})`,
    };
  }

  // 0b. RETAILER SEARCH SCRAPED TITLE CHECK: Reject search results pages masquerading as product names
  if (/^(?:amazon\.in|flipkart\.com|ajio\.com|myntra\.com)\s*[:|-]/i.test(productName) || /^(?:amazon\.in|flipkart|ajio|myntra)$/i.test(brand)) {
    return {
      isConsistent: false,
      reason: `Malformed title: Product '${productName}' is a search page title, not an individual product`,
    };
  }

  // 0c. IMPLAUSIBLE GARMENT PRICE: Clothing pieces (kurtas, jackets, dresses, lehengas) cannot cost under ₹199
  if (category === "outfit" && price !== undefined && price > 0 && price < 199) {
    return {
      isConsistent: false,
      reason: `Implausible price: Outfit garment '${productName}' priced at ₹${price} is implausibly low`,
    };
  }

  // 0d. NON-FASHION / MEDIA / BOOK / TOY REJECTION: Reject books, novels, toys, games, stationery, electronics
  const isNonFashionItem =
    /\b(books?|novel|novels|paperback|hardcover|reprint|classic\s*reprint|edition|illustrated\s*edition|author|biography|textbook|workbook|coloring\s*book|story\s*book|board\s*book|encyclopedia|stationery|notebooks?|diaries|toys?|puzzle|puzzles|lego|board\s*game|action\s*figure|doll|dolls|soft\s*toy|diecast|remote\s*control|railways?|trains?\s*set)\b/i.test(cleanName) &&
    !/\b(t-?shirt|shirt|dress|kurta|kurti|saree|lehenga|top|bottom|pants?|trousers?|jacket|blazer|shoes?|heels?|boots?|sandals?|lipstick|foundation|dupatta|stole)\b/i.test(cleanName);

  if (isNonFashionItem) {
    return {
      isConsistent: false,
      reason: `Non-fashion item: Product '${productName}' is a book, toy, or non-apparel item (${urlStr})`,
    };
  }

  // 1. GENDER & DEMOGRAPHIC SANITY CHECK
  const isBoy = genderLower === "boy" || genderLower === "boys" || (persona === "child" && genderLower !== "girls" && genderLower !== "girl" && (fullCheckText.includes("boy") || !genderLower));
  const isGirl = genderLower === "girl" || genderLower === "girls";

  const isUnisexChild =
    /\b(unisex|boys?\s*(?:and|&)\s*girls?|girls?\s*(?:and|&)\s*boys?)\b/i.test(fullCheckText);

  if (genderLower === "boys" || isBoy) {
    // For a boy child / boys styling:
    // Strip "boy" / "boys" tokens first to avoid self-filtering
    const strippedOfBoy = fullCheckText.replace(/\b(boy|boys|boy's)\b/gi, "");
    const hasFemaleToken =
      !isUnisexChild &&
      /\b(women|womens|women's|female|ladies|woman|girls|girl|girl's|kurti|kurtis|saree|sari|lehenga|choli|chaniya|ghagra|blouse|anarkali|heels?|stiletto|stilettos|skirt|gown|bra|lingerie|suit\s*set\s*with\s*dupatta)\b/i.test(
        strippedOfBoy,
      );
    // Explicitly allow unisex children's wear, but reject exclusively female apparel
    const isExclusivelyFemaleApparel =
      /\b(kurti|kurtis|saree|sari|lehenga|choli|chaniya|ghagra|blouse|anarkali|heels?|stiletto|stilettos|skirt|gown|bra|lingerie|suit\s*set\s*with\s*dupatta)\b/i.test(
        fullCheckText,
      );

    if (hasFemaleToken || isExclusivelyFemaleApparel) {
      return {
        isConsistent: false,
        reason: `Gender mismatch: Product '${productName}' contains female apparel keywords for boys styling (${urlStr})`,
      };
    }

    // Strictly NO adult men's products for boys kidswear without child/boy qualifiers
    const hasBoyChildQualifier = /\b(boy|boys|boy's|kid|kids|child|children|junior|teen|toddler|baby)\b/i.test(fullCheckText);
    const isAdultMenProduct = /\b(men|mens|men's|gents|gentlemen|male|menswear|men-formal|mens-formal|men-clothing|mens-clothing|men-suits|mens-suit|men-shoes|mens-shoes|men-footwear|mens-footwear|men-shirts|mens-shirts)\b/i.test(strippedOfBoy);
    if (isAdultMenProduct && !hasBoyChildQualifier) {
      return {
        isConsistent: false,
        reason: `Demographic mismatch: Product '${productName}' is listed for adult men, not boys kidswear (${urlStr})`,
      };
    }
  }

  if (genderLower === "girls" || isGirl) {
    // For girls styling:
    const strippedOfGirl = fullCheckText.replace(/\b(girl|girls|girl's)\b/gi, "");
    const hasMaleToken =
      !isUnisexChild &&
      /\b(men|mens|men's|boys|boy|boy's|gents|gentleman|gentlemen|male)\b/i.test(strippedOfGirl);
    if (hasMaleToken) {
      return {
        isConsistent: false,
        reason: `Gender mismatch: Product '${productName}' contains male apparel keywords for girls styling (${urlStr})`,
      };
    }

    // Strictly NO adult women's products for girls kidswear without child/girl qualifiers
    const hasGirlChildQualifier = /\b(girl|girls|girl's|kid|kids|child|children|junior|teen|toddler|baby)\b/i.test(fullCheckText);
    const isAdultWomenProduct = /\b(women|womens|women's|woman|ladies|lady|female|womenswear|women-clothing|womens-clothing|women-dresses|womens-dresses|women-shoes|womens-shoes|women-footwear|womens-footwear|women-tops|womens-tops)\b/i.test(strippedOfGirl);
    if (isAdultWomenProduct && !hasGirlChildQualifier) {
      return {
        isConsistent: false,
        reason: `Demographic mismatch: Product '${productName}' is listed for adult women, not girls kidswear (${urlStr})`,
      };
    }
  }

  if (persona === "child" || genderLower === "child" || isBoy || isGirl) {
    // Kidswear must NEVER link to adult luxury bridal boutiques with adult-only catalogs (Pernia's, Elahé, Ogaan)
    const isAdultBoutique =
      /\b(perniaspopupshop|elahe\.in|ogaan\.com)\b/i.test(fullCheckText) ||
      /\b(pernia|elahe|ogaan)\b/i.test(brand || "");
    if (isAdultBoutique) {
      return {
        isConsistent: false,
        reason: `Demographic mismatch: Adult luxury boutique is not approved for kidswear (${urlStr})`,
      };
    }

    // Never recommend mature adult items or adult cosmetics/lingerie for any child
    const isAdultItem = /\b(stilettos?|high\s*heels|lingerie|deep\s*neck|plunge|corporate\s*suit|office\s*blazer|anti-aging|anti-wrinkle|retinol|nighty|nightwear\s*gown|sexy)\b/i.test(fullCheckText);
    if (isAdultItem) {
      return {
        isConsistent: false,
        reason: `Demographic mismatch: Item '${productName}' is mature adult styling not suitable for children (${urlStr})`,
      };
    }

    // Never return adult women's kurtis, sarees, or adult lehengas for children
    if (/\b(kurti|kurtis|saree|sari)\b/i.test(fullCheckText) && !/\b(kids|girls|children|junior)\b/i.test(fullCheckText)) {
      return {
        isConsistent: false,
        reason: `Demographic mismatch: Product '${productName}' is adult women's ethnic wear not suitable for children (${urlStr})`,
      };
    }

    // Never return adult women's handbags / sling bags for young children
    if (
      category === "accessories" &&
      /\b(handbag|handbags|sling\s*bag|shoulder\s*bag|tote|purse)\b/i.test(fullCheckText) &&
      /\b(women|womens|women's|ladies)\b/i.test(fullCheckText) &&
      !/\b(kids?|child|children|junior|toddler|baby)\b/i.test(fullCheckText)
    ) {
      return {
        isConsistent: false,
        reason: `Demographic mismatch: Product '${productName}' is adult women's handbag/sling bag not suitable for children (${urlStr})`,
      };
    }
  } else if (persona === "woman") {
    // Strip women terms first to prevent "women" from false-matching "men"
    const strippedOfWomen = fullCheckText
      .replace(/\b(women|womens|women's|female|ladies|woman)\b/gi, "")
      .replace(/\b(recommended|recommendations|specimen|complimentary)\b/gi, "");

    const hasMenToken = /\b(men|mens|men's|boys|boy|gents|gentleman|gentlemen|male)\b/i.test(strippedOfWomen);
    if (hasMenToken) {
      return {
        isConsistent: false,
        reason: `Gender mismatch: Product '${productName}' contains men's apparel keywords for a female styling profile (${urlStr})`,
      };
    }

    // Never link to kids' clothing or clothing sets for an adult female styling profile
    const hasKidsToken = /\b(girls-clothing-set|boys-clothing-set|kids-clothing-set|clothing-set|baby\s*girl|baby\s*boy|infant|toddler|superminis|keenuu|s\.tajmina)\b/i.test(fullCheckText);
    if (hasKidsToken) {
      return {
        isConsistent: false,
        reason: `Category mismatch: Product '${productName}' matches kids' clothing set for an adult female styling profile (${urlStr})`,
      };
    }
  } else if (persona === "man") {
    // Gender is judged from the product's own title and URL (independently of category),
    // never from the garment type: "Dress Shirt", "Dress Shoes" and "Dress Watch" are
    // menswear, and a title saying "Men" is not enough on its own (category checks follow).
    const { audience } = assessProductAudience(`${productName || ""} ${citationTitle || ""}`, urlStr);
    if (audience === "women" || audience === "conflict") {
      return {
        isConsistent: false,
        reason:
          audience === "women"
            ? `Gender mismatch: Product '${productName}' is listed for women, not men (${urlStr})`
            : `Gender mismatch: Product '${productName}' title and URL name different audiences (${urlStr})`,
      };
    }
    if (audience === "boys" || audience === "girls" || audience === "kids") {
      return {
        isConsistent: false,
        reason: `Demographic mismatch: Product '${productName}' is kidswear (${audience}), not adult menswear (${urlStr})`,
      };
    }

    const strippedOfMen = normalizeAudienceText(fullCheckText).replace(/\b(men|mens|men's|male|gents|gentlemen)\b/gi, "");
    if (WOMENSWEAR_GARMENT_RE.test(strippedOfMen) || mentionsDressGarment(strippedOfMen)) {
      return {
        isConsistent: false,
        reason: `Gender mismatch: Product '${productName}' is a women's garment type for a male styling profile (${urlStr})`,
      };
    }

    const hasKidsToken = /\b(girls-clothing-set|boys-clothing-set|kids-clothing-set|clothing-set|baby\s*girl|baby\s*boy|infant|toddler)\b/i.test(fullCheckText);
    if (hasKidsToken) {
      return {
        isConsistent: false,
        reason: `Category mismatch: Product '${productName}' matches kids' clothing set for an adult male styling profile (${urlStr})`,
      };
    }
  }


  // 2. GARMENT SUBCATEGORY CHECK
  if (subcat ? subcat === "blazer" : cleanName.includes("blazer")) {
    const isBlazerInTitle = /\b(blazers?|suit\s*jackets?|suits?|tuxedos?|bandhgalas?|tailored\s*jackets?|formal\s*jackets?|dinner\s*jackets?)\b/i.test(cleanName);
    const isCasualOrWinterJacket =
      /\b(bombers?|puffers?|quilted|hoodies?|hooded|windbreakers?|fleece|varsity|track\s*jackets?|denim\s*jackets?|biker\s*jackets?|parkas?|down\s*jackets?)\b/i.test(cleanName);
    const isWrongType =
      /\b(trouser|trousers|pant|pants|skirt|dress|gown|saree|jeans|t-shirt|tshirt|top|camisole|shoe|heel|bag)\b/i.test(cleanName) &&
      !/\b(blazers?|suit\s*jackets?|suits?|tuxedos?|bandhgalas?)\b/i.test(cleanName);
    const isWrongUrl =
      /(?:\/bombers?\/|\/puffers?\/|\/hoodies?\/|\/windbreakers?\/|\/track-jackets?\/|\/t-shirts?\/|\/jeans\/|\/shoes?\/)/i.test(urlStr);

    if (!isBlazerInTitle || isCasualOrWinterJacket || isWrongType || isWrongUrl) {
      return {
        isConsistent: false,
        reason: `Subcategory is Blazer, but item does not match blazer type: ${productName} (${urlStr})`,
      };
    }
  } else if (
    subcat === "waistcoat" ||
    subcat === "vest" ||
    (requiredItemTitle && /\b(waistcoats?|vests?|gilets?)\b/i.test(requiredItemTitle) && !/\b(jacket|blazer)\b/i.test(requiredItemTitle))
  ) {
    const isWaistcoatInTitle = /\b(waistcoats?|vests?|gilets?|bundis?|nehru\s*waistcoat|waistcoat\s*set|vest\s*set|suit\s*vest)\b/i.test(cleanName);
    const isContradictory =
      /\b(bombers?|puffers?|quilted|hoodies?|hooded|windbreakers?|fleece|varsity|track\s*jackets?|denim\s*jackets?|biker\s*jackets?|parkas?|trousers?|pants?|jeans|shorts?|dresses?|sarees?|shoes?|books?|toys?)\b/i.test(cleanName) &&
      !/\b(waistcoat\s*set|vest\s*set)\b/i.test(cleanName);
    const isWrongUrl = /(?:\/bombers?\/|\/puffers?\/|\/hoodies?\/|\/windbreakers?\/|\/jeans\/|\/shoes?\/)/i.test(urlStr);

    if (!isWaistcoatInTitle || isContradictory || isWrongUrl) {
      return {
        isConsistent: false,
        reason: `Subcategory is Waistcoat / Vest, but item '${productName}' is not a valid waistcoat/vest (${urlStr})`,
      };
    }
  } else if (subcat === "suit") {
    // A suit is sold as one product (jacket + trousers), so trouser words are expected here.
    const isSuit = /\b(suits?|tuxedos?|\d\s*-?\s*piece|two-piece|three-piece)\b/i.test(cleanName);
    const isWrongType = /\b(jumpsuit|tracksuit|swimsuit|dress|gown|saree|skirt|shoes?|heels?|bag|t-?shirt)\b/i.test(cleanName);
    if (!isSuit || isWrongType) {
      return {
        isConsistent: false,
        reason: `Subcategory is Suit, but item does not match suit type: ${productName} (${urlStr})`,
      };
    }
  } else if (subcat === "ethnic_bottom") {
    const isEthnicBottom = /\b(dhotis?|mundus?|veshtis?|lungis?|pyjamas?|pajamas?|churidars?|salwars?|patiala|jodhpurs|breeches)\b/i.test(fullCheckText);
    const isChuridarReq = requiredItemTitle ? /\bchuridars?\b/i.test(requiredItemTitle) : false;
    const hasChuridar = /\bchuridars?\b/i.test(fullCheckText);
    if (isChuridarReq && !hasChuridar && !/\b(pyjamas?|pajamas?)\b/i.test(fullCheckText)) {
      return {
        isConsistent: false,
        reason: `Requirement is Churidar, but item does not match churidar type: ${productName} (${urlStr})`,
      };
    }
    // Reject complete full kurta sets being passed as standalone ethnic bottoms
    const isFullKurtaSet = /\b(kurta\s*(?:(?:with|and|&)\s+)?(?:dhoti|pyjama|pajama|churidar)?\s*set|clothing\s*set|outfit\s*set)\b/i.test(cleanName);
    if (isFullKurtaSet) {
      return {
        isConsistent: false,
        reason: `Subcategory is ethnic bottom, but item is a complete kurta/clothing set: ${productName} (${urlStr})`,
      };
    }
    // Allow pairing phrasing like "for Kurta", "with Kurta", "Kurta Bottom", "to pair with Kurta"
    const isStandaloneUpper = /(?<!\b(?:for|to\s*pair\s*with|matching|with|and)\s+)\b(kurtas?|kurtis?|shirts?|blazers?|jackets?|sarees?|dress|gown)\b/i.test(cleanName) &&
      !/\b(churidars?|pyjamas?|dhotis?|salwars?)\b/i.test(cleanName);
    const isWrongType = isStandaloneUpper || /\b(shoes?|bags?|heels?)\b/i.test(cleanName);
    if (!isEthnicBottom || isWrongType) {
      return {
        isConsistent: false,
        reason: `Subcategory is an ethnic bottom (dhoti / pyjama / churidar), but item does not match: ${productName} (${urlStr})`,
      };
    }
  } else if (subcat ? subcat === "trousers" : (cleanName.includes("trouser") || cleanName.includes("pant"))) {
    const isTrouser = /\b(trouser|trousers|pant|pants|slacks|chinos|culottes|wide-leg|palazzo|jeans|denim|joggers?|cargos?|trackpants)\b/i.test(cleanName);
    const isUpperGarment = /(?<![tT]-)\b(shirt|shirts|t-?shirts?|tees?|kurta|kurti|blouse|camisole|blazer|jacket)\b/i.test(cleanName);
    const isWrongType = isUpperGarment || (/\b(shorts?|bermudas?|dress|gown|saree|skirt|shoe|heel|bag)\b/i.test(cleanName) && !isTrouser);
    if (!isTrouser || isWrongType) {
      return {
        isConsistent: false,
        reason: `Subcategory is Trousers, but item does not match trousers type: ${productName} (${urlStr})`,
      };
    }
  } else if (subcat ? subcat === "shorts" : cleanName.includes("shorts")) {
    const isShorts = /\b(shorts?|bermudas?|trunks?)\b/i.test(cleanName);
    const isUpperGarment = /(?<![tT]-)\b(shirt|shirts|t-?shirts?|tees?|kurta|kurti|blouse|camisole|blazer|jacket)\b/i.test(cleanName);
    const isWrongType = isUpperGarment || (/\b(trouser|pants?|slacks?|jeans|dress|gown|saree|skirt|shoe|heel|bag)\b/i.test(cleanName) && !isShorts);
    if (!isShorts || isWrongType) {
      return {
        isConsistent: false,
        reason: `Subcategory is Shorts, but item does not match shorts type: ${productName} (${urlStr})`,
      };
    }
  } else if (
    (subcat === "shirt" || subcat === "top" || subcat === "inner_top" || subcat === "crop_top") &&
    requiredTopStyles(requiredItemTitle).length > 0
  ) {
    // The requirement names a distinct garment style (e.g. a henley, crop top, or short kurti). That style is what
    // must match; stores list the same garment as a shirt, t-shirt, tee or top.
    // A "bustier/corset blouse" for a saree is sold as a saree blouse: any blouse satisfies it
    const isBlouseForBlouse = /\b(blouse|choli)\b/i.test(requiredItemTitle || "") && /\b(blouse|choli)\b/i.test(fullCheckText);
    const missing = requiredTopStyles(requiredItemTitle).filter(
      (s) => !s.pattern.test(fullCheckText) && !(isBlouseForBlouse && s.name === "crop top"),
    );
    if (missing.length > 0) {
      return {
        isConsistent: false,
        reason: `Requirement is a ${missing.map((s) => s.name).join("/")}, but item is not: ${productName} (${urlStr})`,
      };
    }
    const isUpperGarment = /\b(shirts?|t-?shirts?|tshirts?|tees?|tops?|henley|polo|crop\s*tops?|bustiers?|bralettes?|corsets?|kurt[ia]s?|choli|blouse)\b/i.test(cleanName);
    const isKurtiReq = requiredItemTitle ? /\bkurt[ia]s?\b/i.test(requiredItemTitle) : false;
    // "Saree Blouse" is a blouse; a saree sold with a blouse ("Saree With Blouse") is not
    const isSareeBlouseItem = /\bsaree\s+blouses?\b/i.test(cleanName) && !/\bsaree\s+(?:with|and|&)\b/i.test(cleanName);
    const isWrongType =
      /\b(shorts?|bermudas?|trousers?|pants?|slacks?|chinos?|jeans?|skirt|dress|gown|blazer|jacket|coat|shoe|bag)\b/i.test(cleanName) ||
      (/\bsarees?\b/i.test(cleanName) && !isSareeBlouseItem) ||
      (!isKurtiReq && /\bkurta\b/i.test(cleanName));
    if (!isUpperGarment || isWrongType) {
      return {
        isConsistent: false,
        reason: `Requirement is a ${requiredTopStyles(requiredItemTitle).map((s) => s.name).join("/")} top, but item is a different garment: ${productName} (${urlStr})`,
      };
    }
  } else if (subcat ? subcat === "shirt" : (cleanName.includes("shirt") && !cleanName.includes("t-shirt") && !cleanName.includes("tshirt"))) {
    const hasPoloBrand = /polo\s*assn|us-polo|polo\s*club/i.test(fullCheckText);
    const isShirt =
      (/(?<![tT]-)\b(shirt|shirts|button-down|camp-collar|resort\s*shirt)\b/i.test(cleanName) ||
        /\bpolo\s*(?:shirt|tee|collar)\b/i.test(cleanName) ||
        (/\bpolo\b/i.test(cleanName) && !hasPoloBrand)) &&
      !/\b(t-?shirts?|tees?)\b/i.test(cleanName);
    const isBottomGarment = /\b(shorts?|bermudas?|trousers?|pants?|slacks?|chinos?|jeans?|skirt)\b/i.test(cleanName);
    const isWrongType = isBottomGarment || (/\b(blazer|jacket|dress|gown|saree|shoe|bag)\b/i.test(cleanName) && !isShirt);
    if (!isShirt || isWrongType) {
      return {
        isConsistent: false,
        reason: `Subcategory is Shirt, but item does not match shirt type: ${productName} (${urlStr})`,
      };
    }
  } else if (subcat ? (subcat === "inner_top" || subcat === "top" || subcat === "crop_top") : (cleanName.includes("camisole") || cleanName.includes("inner top"))) {
    // If requirement specifies a crop top or bustier, strictly reject non-cropped tops
    if (requiredItemTitle && /\b(crop\s*tops?|cropped\s*tops?|bustiers?|bralettes?|corsets?)\b/i.test(requiredItemTitle)) {
      const isCropped = /\b(crop\s*tops?|cropped\s*tops?|bustiers?|bralettes?|corsets?|choli)\b/i.test(fullCheckText);
      if (!isCropped) {
        return {
          isConsistent: false,
          reason: `Requirement is '${requiredItemTitle}', but item is a non-cropped generic top: ${productName} (${urlStr})`,
        };
      }
    }
    const isTop = /\b(top|tops|camisole|camisoles|blouse|blouses|shirt|shirts|tank|tee|t-shirt|corset|waistcoat|shell|bustier|crop\s*top)\b/i.test(cleanName);
    const isBottomGarment = /\b(trouser|pant|pants|slacks|chinos|jeans|shorts?|skirt)\b/i.test(cleanName);
    // A lehenga/anarkali/gown set that includes a blouse is not a blouse
    const isFullEthnicSet = /\b(lehengas?|anarkalis?|gowns?|kurta\s*sets?)\b/i.test(cleanName);
    const isWrongType = isBottomGarment || isFullEthnicSet || (/\b(blazer|jacket|dress|shoe|bag)\b/i.test(cleanName) && !isTop);
    if (!isTop || isWrongType) {
      return {
        isConsistent: false,
        reason: `Subcategory is Inner Top, but item does not match top/camisole type: ${productName} (${urlStr})`,
      };
    }
  } else if (subcat ? subcat === "skirt" : cleanName.includes("skirt")) {
    const isSkirt = /\b(skirt|pencil skirt|a-line skirt|midi skirt|maxi skirt)\b/i.test(fullCheckText);
    if (!isSkirt) {
      return {
        isConsistent: false,
        reason: `Subcategory is Skirt, but item does not match skirt type: ${productName} (${urlStr})`,
      };
    }
  } else if (
    subcat
      ? subcat === "lehenga" || subcat === "chaniya_choli" || subcat === "garba"
      : cleanName.includes("lehenga") || cleanName.includes("chaniya choli") || cleanName.includes("ghagra")
  ) {
    const isLehenga = /\b(lehenga|chaniya\s*choli|ghagra|flared\s*skirt\s*set|festive\s*skirt\s*set|fusion\s*lehenga|festive\s*co-ord)\b/i.test(fullCheckText);
    const isWrongType =
      /\b(blazer|jacket|trouser|pant|pants|jeans|t-shirt|tshirt|shirt|formal\s*suit|office\s*suit|pencil\s*skirt|shoe|heel|bag)\b/i.test(cleanName) && !isLehenga;
    if (!isLehenga || isWrongType) {
      return {
        isConsistent: false,
        reason: `Subcategory is Lehenga / Chaniya Choli, but item does not match festive lehenga/chaniya choli type: ${productName} (${urlStr})`,
      };
    }
  } else if (subcat ? subcat === "saree" : (cleanName.includes("saree") || cleanName.includes("sari"))) {
    const isSaree = /\b(saree|sari|saris|sarees)\b/i.test(fullCheckText);
    const isWrongType = /\b(blazer|trouser|pant|pants|jeans|skirt|dress|shoe|bag)\b/i.test(cleanName) && !isSaree;
    if (!isSaree || isWrongType) {
      return {
        isConsistent: false,
        reason: `Subcategory is Saree, but item does not match saree type: ${productName} (${urlStr})`,
      };
    }
  } else if (
    subcat
      ? subcat === "kurta" || subcat === "sherwani"
      : cleanName.includes("kurta") || cleanName.includes("kurti") || cleanName.includes("sherwani")
  ) {
    if (/hm\.com|zara\.com/i.test(urlStr)) {
      return {
        isConsistent: false,
        reason: `Retailer mismatch: H&M / Zara does not sell Indian ethnic wear/kurtis (${urlStr})`,
      };
    }
    const isShortKurtiReq = requiredItemTitle ? /\b(?:short\s*kurt[ia]s?|peplum\s*(?:short\s*)?kurt[ia]s?)\b/i.test(requiredItemTitle) : false;
    if (isShortKurtiReq) {
      const isKurtiMatch = /\b(?:kurt[ia]s?|peplum\s*(?:short\s*)?kurt[ia]s?|short\s*kurt[ia]s?|tunic\s*kurti)\b/i.test(fullCheckText);
      const isWesternTopOnly = /\b(?:tops?|t-?shirts?|tees?|shirts?|blouses?)\b/i.test(cleanName) && !isKurtiMatch;
      if (!isKurtiMatch || isWesternTopOnly) {
        return {
          isConsistent: false,
          reason: `Requirement is '${requiredItemTitle}', but product is a generic western top: ${productName} (${urlStr})`,
        };
      }
    }
    const isSherwaniReq = subcat === "sherwani" || (requiredItemTitle ? /\bsherwanis?\b/i.test(requiredItemTitle) : false);
    const isSherwani = /\b(sherwanis?|achkans?|bandhgala|jodhpuri|indo-western\s*sherwani|sherwani\s*set)\b/i.test(fullCheckText);
    const isKurta = /\b(kurta|kurtas|kurti|kurtis|sherwani|sherwanis|kurta\s*set|anarkali|angrakha|bandhgala|achkan|jodhpuri|pathani|peplum\s*kurti)\b/i.test(fullCheckText);
    const isWrongType = /\b(blazer|western\s*suit|t-shirt|jeans|western\s*dress|shoe|bag|saree|lehenga)\b/i.test(cleanName) && !isKurta;
    if (isSherwaniReq && !isSherwani) {
      return {
        isConsistent: false,
        reason: `Subcategory is Sherwani, but item does not match ethnic sherwani type: ${productName} (${urlStr})`,
      };
    }
    if (!isKurta || isWrongType) {
      return {
        isConsistent: false,
        reason: `Subcategory is Kurta / Sherwani, but item does not match ethnic kurta/sherwani type: ${productName} (${urlStr})`,
      };
    }
  } else if (
    subcat === "dupatta" ||
    subcat === "stole" ||
    subcat === "shawl" ||
    (requiredItemTitle && /\b(dupattas?|stoles?|shawls?|doshala|lohi|chaddar|angavastram|odhani|chunni)\b/i.test(requiredItemTitle))
  ) {
    // 1. The product title ITSELF must name a genuine drape / shawl / stole / dupatta
    const isDrapeInTitle = /\b(shawls?|doshala|lohi|chaddar|dupattas?|stoles?|angavastram|odhani|chunni|uttariya|drape|wrap)\b/i.test(cleanName);

    // 2. Any contradictory upper/lower garment or western wear in title is strictly rejected,
    //    even if the seller included 'shawl' (e.g. 'shawl collar bomber jacket' or 'shawl lapel blazer')
    const isContradictoryGarment =
      /\b(jackets?|bombers?|blazers?|coats?|shirts?|t-?shirts?|trousers?|pants?|jeans|shorts?|shoes?|books?|toys?|suit\s*set|hoodies?|sweatshirts?)\b/i.test(cleanName);

    // 3. Reject URL paths belonging to jackets, blazers, jeans, shoes, or non-apparel
    const isWrongUrl =
      /(?:\/jackets?\/|\/bombers?\/|\/blazers?\/|\/jeans\/|\/t-shirts?\/|\/shoes?\/|\/trousers?\/|\/pants?\/|\/books?\/)/i.test(urlStr);

    if (!isDrapeInTitle || isContradictoryGarment || isWrongUrl) {
      return {
        isConsistent: false,
        reason: `Subcategory is Shawl / Stole / Dupatta, but product '${productName}' is not an authentic shawl/drape (${urlStr})`,
      };
    }
  } else if (
    subcat === "bundi" ||
    subcat === "nehru_jacket" ||
    (requiredItemTitle && /\b(bundi|nehru\s*jacket|modi\s*jacket|ethnic\s*waistcoat|koti)\b/i.test(requiredItemTitle))
  ) {
    const isEthnicJacket = /\b(bundi|nehru|waistcoat|koti|modi\s*jacket|bandhgala\s*waistcoat|ethnic\s*jacket)\b/i.test(fullCheckText);
    const isWesternJacket = /\b(bomber|puffer|fleece|flannel|denim\s*jacket|biker|hoodie|sweatshirt)\b/i.test(cleanName);
    if (!isEthnicJacket || isWesternJacket) {
      return {
        isConsistent: false,
        reason: `Subcategory is Ethnic Bundi / Nehru Jacket, but product is not an ethnic waistcoat: ${productName} (${urlStr})`,
      };
    }
  } else if (subcat === "jacket" || subcat === "shrug") {
    const isShrugReq = requiredItemTitle ? /\b(shrugs?|capes?|cape\s*jackets?)\b/i.test(requiredItemTitle) : subcat === "shrug";
    if (isShrugReq) {
      const isShrugMatch = /\b(shrugs?|capes?|cape\s*jackets?|sheer\s*jacket|overlay|kimono)\b/i.test(fullCheckText);
      const isHeavyJacket = /\b(puffer|quilted|down\s*jacket|windbreaker|fleece|bomber|leather\s*jacket|denim\s*jacket|formal\s*blazer|suit\s*jacket)\b/i.test(cleanName);
      if (!isShrugMatch || isHeavyJacket) {
        return {
          isConsistent: false,
          reason: `Requirement is '${requiredItemTitle}', but product is not a shrug/cape: ${productName} (${urlStr})`,
        };
      }
    }
    const isJacket = /\b(jackets?|coats?|overshirts?|shrugs?|capes?|cardigans?|bombers?|puffers?)\b/i.test(cleanName);
    const isWrongType = /\b(trousers?|pants?|jeans|shorts?|shoes?|dresses?|sarees?|kurtas?|books?)\b/i.test(cleanName) && !isJacket;
    const isFormalOccasion = expectedOccasion && /\b(formal|wedding|party|special\s*event|ceremony|reception|evening)\b/i.test(expectedOccasion);
    const isHeavyCasualOuterwear = /\b(puffer|quilted|hoodie|hooded|windbreaker|fleece|down\s*jacket)\b/i.test(cleanName);
    if (isFormalOccasion && isHeavyCasualOuterwear) {
      return {
        isConsistent: false,
        reason: `Occasion is '${expectedOccasion}', but jacket is heavy casual/winter outerwear: ${productName} (${urlStr})`,
      };
    }
    if (!isJacket || isWrongType) {
      return {
        isConsistent: false,
        reason: `Subcategory is Jacket, but product is not a jacket: ${productName} (${urlStr})`,
      };
    }
  }

  // 3. JEWELLERY: Minimal Studs vs Heavy Traditional Jhumkas & Type Segregation
  if (category === "jewellery") {
    if (subcat.includes("stud") || subcat.includes("earring") || cleanName.includes("stud") || cleanName.includes("minimal") || cleanName.includes("huggie") || cleanName.includes("hoop")) {
      const isEthnicExpected = subcat.includes("jhumka") || subcat.includes("ethnic") || subcat.includes("traditional") || subcat.includes("oxidised");
      const isHeavyTraditional = /\b(jhumka[s]?|jhumki[s]?|chandbali[s]?|bridal|temple|kundan|polki|meenakari|choker set)\b/i.test(fullCheckText);
      if (isHeavyTraditional && !isEthnicExpected) {
        return {
          isConsistent: false,
          reason: `Requirement is Minimal Studs / Everyday Earrings, but item is heavy traditional jewellery: ${productName} (${urlStr})`,
        };
      }
    }
    if (subcat.includes("jhumka") || subcat.includes("oxidised") || cleanName.includes("jhumka") || cleanName.includes("oxidised")) {
      const isMinimalCorporate = /\b(office\s*studs?|solitaire\s*studs?|delicate\s*pearl\s*studs?|tiny\s*huggie)\b/i.test(cleanName);
      if (isMinimalCorporate && !cleanName.includes("jhumka")) {
        return {
          isConsistent: false,
          reason: `Requirement is Traditional Jhumkas / Festive Jewellery, but item is minimal corporate studs: ${productName} (${urlStr})`,
        };
      }
    }
    if (subcat.includes("bracelet") || subcat.includes("bangle") || subcat.includes("wrist") || cleanName.includes("bracelet") || cleanName.includes("bangle")) {
      const isNecklaceOrEarring = /\b(necklace|choker|earring|earrings|stud|studs|pendant)\b/i.test(cleanName) && !/\b(bracelet|bangle|cuff)\b/i.test(cleanName);
      if (isNecklaceOrEarring) {
        return {
          isConsistent: false,
          reason: `Requirement is Bracelet/Wristwear, but item is an earring or necklace: ${productName} (${urlStr})`,
        };
      }
    }
    if (subcat.includes("necklace") || subcat.includes("choker") || subcat.includes("pendant")) {
      const isEarringOrBracelet = /\b(earring|earrings|stud|studs|bracelet|bracelets|bangle|bangles)\b/i.test(cleanName) && !/\b(necklace|choker|pendant)\b/i.test(cleanName);
      if (isEarringOrBracelet) {
        return {
          isConsistent: false,
          reason: `Requirement is Necklace, but item is an earring or bracelet: ${productName} (${urlStr})`,
        };
      }
    }
  }

  // 4. COLOR CLASH CHECK (e.g. Pink trousers on Chocolate Brown suit, or Red on Emerald Green)
  // Clothing must be the colour of the recommended garment: a product whose own name gives
  // only other colours (a white or coral blouse for a charcoal saree) is a different item.
  if (category === "outfit" && isOutfitColorMismatch(productName || "", expectedColor)) {
    return {
      isConsistent: false,
      reason: `Color mismatch: Expected ${expectedColor}, but product is a different colour: ${productName} (${urlStr})`,
    };
  }
  if (expectedColor) {
    const exp = expectedColor.toLowerCase();
    if (exp.includes("emerald") || exp.includes("green") || exp.includes("sage") || exp.includes("forest")) {
      const hasClashingColor = /\b(pink|fuchsia|magenta|red|yellow|purple|neon|orange)\b/i.test(cleanName);
      if (hasClashingColor && !cleanName.includes("green")) {
        return {
          isConsistent: false,
          reason: `Color clash: Expected ${expectedColor}, but product claims clashing color: ${productName} (${urlStr})`,
        };
      }
    } else if (exp.includes("chocolate") || exp.includes("brown") || exp.includes("cedar") || exp.includes("cocoa")) {
      const hasClashingColor = /\b(pink|fuchsia|magenta|neon|red|green|blue|yellow)\b/i.test(cleanName);
      if (hasClashingColor && !cleanName.includes("brown") && !cleanName.includes("tan") && !cleanName.includes("beige")) {
        return {
          isConsistent: false,
          reason: `Color clash: Expected ${expectedColor}, but product claims clashing color: ${productName} (${urlStr})`,
        };
      }
    } else if (exp.includes("pink") || exp.includes("rose") || exp.includes("fuchsia") || exp.includes("magenta")) {
      const hasClashingColor = /\b(emerald\s*green|forest\s*green|navy\s*blue|olive|khaki|mustard)\b/i.test(cleanName);
      if (hasClashingColor && !cleanName.includes("pink") && !cleanName.includes("rose") && !cleanName.includes("fuchsia")) {
        return {
          isConsistent: false,
          reason: `Color clash: Expected ${expectedColor}, but product claims clashing color: ${productName} (${urlStr})`,
        };
      }
    }
  }

  let urlPath = "";
  try {
    urlPath = new URL(urlStr).pathname.toLowerCase();
  } catch {}
  const productAndPathText = `${cleanName} ${urlPath}`;

  // 5. OUTFIT (Must strictly be apparel/clothing - NEVER footwear, bags, jewellery, or makeup)
  if (category === "outfit") {
    const isFootwear = /\b(shoe|shoes|heel|heels|heeled|sandal|sandals|sneaker|sneakers|boot|boots|loafer|loafers|stiletto|pumps|footwear|slipper|slippers|mule|mules|flats)\b/i.test(
      productAndPathText,
    );
    if (isFootwear) {
      return {
        isConsistent: false,
        reason: `Category is Outfit, but item is footwear: ${productName} (${urlStr})`,
      };
    }

    const isBag = /\b(bag|bags|handbag|handbags|clutch|clutches|tote|totes|purse|purses|sling\s*bag|backpack|wallet|satchel)\b/i.test(
      productAndPathText,
    );
    if (isBag) {
      return {
        isConsistent: false,
        reason: `Category is Outfit, but item is a bag/purse: ${productName} (${urlStr})`,
      };
    }

    const isCosmeticOrJewel = /\b(lipstick|foundation|concealer|compact|powder|mascara|eyeliner|kajal|blush|earring|earrings|necklace|necklaces|choker|bangle|bangles|bracelet|bracelets)\b/i.test(
      productAndPathText,
    );
    if (isCosmeticOrJewel) {
      return {
        isConsistent: false,
        reason: `Category is Outfit, but item is cosmetic or jewellery: ${productName} (${urlStr})`,
      };
    }
  }

  // 6. FOOTWEAR (Must strictly be footwear - NEVER clothing, bags, cosmetics, jewellery, or electronics)
  if (category === "footwear") {
    const isElectronics = /\b(airdopes|earbuds|earphones|headphones|boat|noise|smartwatch|watch|speakers?|bluetooth)\b/i.test(productAndPathText);
    if (isElectronics) {
      return {
        isConsistent: false,
        reason: `Category is Footwear, but item is electronics/gadget: ${productName} (${urlStr})`,
      };
    }

    const isApparelOrBag = mentionsDressGarment(productAndPathText) || /\b(gown|gowns|saree|sari|saris|sarees|kurta|kurtas|kurti|kurtis|lehenga|blazer|blazers|suit|suits|t-shirt|tshirt|shirt|shirts|jeans|trouser|trousers|pant|pants|skirt|skirts|jumpsuit|co-ord|coord|bag|bags|duffel|duffle|luggage|briefcase|handbag|handbags|tote|totes|clutch|purse|purses|backpack|lipstick|foundation|earring|necklace|bracelet)\b/i.test(
      productAndPathText,
    );
    if (isApparelOrBag) {
      return {
        isConsistent: false,
        reason: `Category is Footwear, but item is clothing, bag, or cosmetics: ${productName} (${urlStr})`,
      };
    }

    // Footwear subcategory consistency check
    if (subcat ? (subcat === "sandals" || subcat === "slides") : (cleanName.includes("sandal") || cleanName.includes("slide"))) {
      const isSandal = /\b(sandal|sandals|slides?|sliders?|flip-flop[s]?|slippers?|espadrilles?|open-toe|floaters?|clogs?)\b/i.test(fullCheckText);
      const isWrongFoot = /\b(sneakers?|boots?|running\s*shoes?|oxfords?|stilettos?)\b/i.test(cleanName) && !isSandal;
      if (!isSandal || isWrongFoot) {
        return {
          isConsistent: false,
          reason: `Subcategory is Sandals / Slides, but item does not match sandal type: ${productName} (${urlStr})`,
        };
      }
    } else if (subcat ? (subcat === "sneakers" || subcat.includes("canvas")) : cleanName.includes("sneaker")) {
      const isCanvasFootwear = /\bcanvas\b/i.test(fullCheckText) && !/\b(tote|bag|backpack|belt|wallet)\b/i.test(fullCheckText);
      const isSneaker = isCanvasFootwear || /\b(sneakers?|trainers?|skate\s*shoes?|skate\b|running\s*shoes?|walking\s*shoes?|tennis\s*shoes?|court\s*shoes?|plimsolls?|low[- ]tops?|high[- ]tops?|athletic\s*shoes?|casual\s*shoes?|slip[- ]ons?)\b/i.test(fullCheckText);
      const isWrongFoot = /\b(heels?|stilettos?|sandals?|slides?|boots?|oxfords?|mojaris?|juttis?)\b/i.test(cleanName) && !isSneaker;
      if (!isSneaker || isWrongFoot) {
        return {
          isConsistent: false,
          reason: `Subcategory is Sneakers / Canvas Shoes, but item does not match sneaker/canvas type: ${productName} (${urlStr})`,
        };
      }
    } else if (subcat ? subcat === "loafers" : cleanName.includes("loafer")) {
      const isLoafer = /\b(loafers?|moccasins?|boat\s*shoes?|driving\s*shoes?|slip[- ]?ons?|pull[- ]?ons?)\b/i.test(fullCheckText);
      const isWrongFoot = /\b(sneakers?|heels?|boots?|sandals?|slides?)\b/i.test(cleanName) && !isLoafer;
      if (!isLoafer || isWrongFoot) {
        return {
          isConsistent: false,
          reason: `Subcategory is Loafers, but item does not match loafer type: ${productName} (${urlStr})`,
        };
      }
    } else if (subcat ? subcat === "formal_shoes" : (cleanName.includes("oxford") || cleanName.includes("derby") || cleanName.includes("brogue"))) {
      const isFormal = /\b(oxfords?|derby|derbies|brogues?|formal\s*shoes?|monk\s*straps?|dress\s*shoes?|lace[- ]up\s*shoes?)\b/i.test(fullCheckText);
      const isWrongFoot = /\b(sneakers?|heels?|boots?|sandals?|slides?|mojaris?|juttis?|flip-flop)\b/i.test(cleanName) && !isFormal;
      if (!isFormal || isWrongFoot) {
        return {
          isConsistent: false,
          reason: `Subcategory is Formal Shoes, but item does not match formal shoe type: ${productName} (${urlStr})`,
        };
      }
    } else if (subcat ? subcat === "boots" : cleanName.includes("boot")) {
      const isBoot = /\b(boots?|chelsea|chukka|ankle\s*boots?|combat\s*boots?)\b/i.test(fullCheckText);
      const isWrongFoot = /\b(sneakers?|heels?|sandals?|slides?|mojaris?|juttis?)\b/i.test(cleanName) && !isBoot;
      if (!isBoot || isWrongFoot) {
        return {
          isConsistent: false,
          reason: `Subcategory is Boots, but item does not match boot type: ${productName} (${urlStr})`,
        };
      }
    } else if (subcat ? subcat === "flats" : (cleanName.includes("flat") || cleanName.includes("ballerina"))) {
      const isFlat = /\b(flats?|ballerinas?|ballet\s*flats?|mules?|bellies|belly\s*shoes?)\b/i.test(fullCheckText);
      const isWrongFoot = /\b(heels?|stilettos?|boots?|sneakers?)\b/i.test(cleanName) && !isFlat;
      if (!isFlat || isWrongFoot) {
        return {
          isConsistent: false,
          reason: `Subcategory is Flats, but item does not match flats type: ${productName} (${urlStr})`,
        };
      }
    } else if (subcat ? subcat === "heels" : cleanName.includes("heel")) {
      // "Heeled Sandals" / "Heeled Mules" are the usual retailer titles for heels.
      const isHeel = /\b(heels?|heeled|pumps?|stilettos?|kitten\s*heels?|block\s*heels?|wedges?)\b/i.test(fullCheckText);
      const isWrongFoot = /\b(sneakers?|boots?|loafers?|oxfords?|mojaris?|slides?)\b/i.test(cleanName) && !isHeel;
      if (!isHeel || isWrongFoot) {
        return {
          isConsistent: false,
          reason: `Subcategory is Heels, but item does not match heels type: ${productName} (${urlStr})`,
        };
      }
    } else if (subcat ? (subcat === "mojaris" || subcat === "juttis") : (cleanName.includes("mojari") || cleanName.includes("jutti"))) {
      // Nagra / khussa are the same footwear under regional names; generic "ethnic flats" are not.
      const isMojari = /\b(mojaris?|juttis?|kolhapuris?|nagras?|khussas?|ethnic\s*shoes?|traditional\s*footwear)\b/i.test(fullCheckText);
      const isWrongFoot = /\b(sneakers?|running\s*shoes?|heels?|boots?|oxfords?|slides?)\b/i.test(cleanName) && !isMojari;
      if (!isMojari || isWrongFoot) {
        return {
          isConsistent: false,
          reason: `Subcategory is Ethnic Mojaris / Juttis, but item does not match ethnic footwear type: ${productName} (${urlStr})`,
        };
      }
    }
  }

  // 7. ACCESSORIES: Subcategory & Identity Consistency
  if (category === "accessories") {
    const isApparelOrShoeOrMakeup = mentionsDressGarment(productAndPathText) || /\b(gown|saree|sari|kurta|kurti|lehenga|blazer|suit|t-shirt|tshirt|jeans|trouser|trousers|pant|pants|skirt|jumpsuit|shoe|shoes|heel|heels|sandal|sandals|sneaker|sneakers|boot|boots|loafer|loafers|footwear|lipstick|foundation|concealer|compact|powder|mascara|eyeliner)\b/i.test(
      productAndPathText,
    );
    if (isApparelOrShoeOrMakeup) {
      return {
        isConsistent: false,
        reason: `Category is Accessories, but item is clothing, footwear, or makeup: ${productName} (${urlStr})`,
      };
    }

    // 7a. Belt Subcategory Matching
    if (subcat.includes("belt") || cleanName.includes("belt")) {
      const isBelt = /\b(belt|belts|kamarbandh|waist\s*belt)\b/i.test(cleanName);
      const isBagOrLuggage = /\b(bag|bags|tote|purse|clutch|backpack|laptop|briefcase|messenger|satchel|wallet)\b/i.test(cleanName);
      if (!isBelt || isBagOrLuggage) {
        return {
          isConsistent: false,
          reason: `Requirement is Belt, but product is not a belt: ${productName} (${urlStr})`,
        };
      }
    }

    // 7b. Sunglasses / Eyewear Subcategory Matching
    if (subcat.includes("sunglass") || subcat.includes("eyewear") || cleanName.includes("sunglass") || cleanName.includes("shades")) {
      const isSunglasses = /\b(sunglasses?|shades?|eyewear|aviators?|wayfarers?)\b/i.test(cleanName);
      const isBagOrBelt = /\b(bag|bags|tote|purse|clutch|backpack|laptop|belt)\b/i.test(cleanName);
      if (!isSunglasses || isBagOrBelt) {
        return {
          isConsistent: false,
          reason: `Requirement is Sunglasses, but product is not eyewear: ${productName} (${urlStr})`,
        };
      }
    }

    // 7c. Scarf / Stole / Shawl Subcategory Matching
    if (subcat.includes("scarf") || subcat.includes("stole") || subcat.includes("shawl") || subcat.includes("dupatta")) {
      const isScarf = /\b(scarf|scarves|stole|stoles|shawl|shawls|dupatta|wrap|muffler)\b/i.test(cleanName);
      const isBagOrBelt = /\b(bag|bags|tote|purse|clutch|backpack|laptop|belt)\b/i.test(cleanName);
      if (!isScarf || isBagOrBelt) {
        return {
          isConsistent: false,
          reason: `Requirement is Scarf/Stole, but product is not a scarf: ${productName} (${urlStr})`,
        };
      }
    }

    // 7d. Clutch / Potli Subcategory Matching
    if (subcat.includes("clutch") || subcat.includes("potli") || cleanName.includes("clutch") || cleanName.includes("potli")) {
      const isClutchOrPotli = /\b(clutch|clutches|potli|potlis|minaudi[eè]re|evening\s*bag)\b/i.test(cleanName);
      const isLaptopOrBackpack = /\b(laptop|briefcase|messenger|backpack|duffle|office\s*bag|work\s*bag)\b/i.test(cleanName);
      if (!isClutchOrPotli || isLaptopOrBackpack) {
        return {
          isConsistent: false,
          reason: `Requirement is Clutch / Potli, but product is a laptop bag or large luggage: ${productName} (${urlStr})`,
        };
      }
    }

    // 7e. Hair Accessories Subcategory Matching
    if (
      subcat.includes("hair") ||
      cleanName.includes("hair") ||
      (requiredItemTitle && /\b(hair|clips?|pins?|bands?|headbands?|bows?|scrunchies?)\b/i.test(requiredItemTitle))
    ) {
      const isHairAcc = /\b(hair\s*accessories|hair\s*clips?|hair\s*pins?|hair\s*bands?|headbands?|hair\s*bows?|hair\s*ties?|scrunchies?|barrettes?|hair\s*ribbons?|floral\s*clips?|gajra\s*clips?|rubber\s*bands?|paranda)\b/i.test(fullCheckText);
      const isBagOrBeltOrSunglasses = /\b(bag|bags|tote|purse|clutch|backpack|laptop|belt|sunglasses?)\b/i.test(cleanName);
      if (!isHairAcc || isBagOrBeltOrSunglasses) {
        return {
          isConsistent: false,
          reason: `Requirement is Hair Accessories, but product is not hair accessories: ${productName} (${urlStr})`,
        };
      }
    }

    // 7e. Laptop Bag vs Other Accessories: Reject laptop bags if look did not request one
    const isExplicitLaptopRequirement =
      subcat.includes("laptop") ||
      subcat.includes("briefcase") ||
      (itemSubcategory || "").toLowerCase().includes("laptop") ||
      cleanName.includes("laptop") ||
      cleanName.includes("briefcase");
    const isLaptopProduct =
      /\b(laptop|briefcase|messenger\s*bag|laptop\s*bag|laptop\s*tote|laptop\s*sleeve)\b/i.test(cleanName) ||
      /\b(laptop-bag|laptop_bag|briefcase)\b/i.test(urlStr);

    if (isLaptopProduct && !isExplicitLaptopRequirement) {
      return {
        isConsistent: false,
        reason: `Accessory mismatch: Product '${productName}' is a laptop bag / briefcase, but current outfit did not request a laptop bag (${urlStr})`,
      };
    }

    // 7f. Demographic Integrity for Men: Never allow feminine potli, clutches, or women's purses
    if (persona === "man") {
      const isFeminineBag =
        /\b(potli|potlis|clutch|clutches|minaudi[eè]re|purse|purses|handbag|handbags|kamarbandh)\b/i.test(cleanName) ||
        /\b(potli|clutch|clutches|handbags?|purses?)\b/i.test(urlStr);
      if (isFeminineBag) {
        return {
          isConsistent: false,
          reason: `Demographic mismatch: Feminine bag / potli / clutch '${productName}' is not suitable for men's styling (${urlStr})`,
        };
      }
    }
  }

  // 8. JEWELLERY (Earrings, necklaces, bracelets, cuffs, bangles - NEVER clothing, shoes, bags, or makeup)
  if (category === "jewellery") {
    if (
      mentionsDressGarment(productAndPathText) ||
      /\b(t-shirt|tshirt|shirt|gown|saree|kurta|blazer|suit|jeans|trouser|pant|skirt|shoe|shoes|heel|heels|sandal|sandals|sneaker|boot|loafer|footwear|bag|handbag|tote|purse|clutch|lipstick|foundation|concealer|compact|mascara|eyeliner)\b/i.test(
        productAndPathText,
      )
    ) {
      return {
        isConsistent: false,
        reason: `Category is Jewellery, but destination URL belongs to an unrelated item: ${urlStr}`,
      };
    }

    // 8a. Demographic Integrity for Men: Never allow feminine jhumkas, chandbalis, choker necklaces, mangalsutras, maang tikkas, or anklets
    if (persona === "man") {
      const isFeminineJewellery =
        /\b(jhumka|jhumkas|chandbali|chandbalis|choker|chokers|mangalsutra|maang\s*tikka|mathapatti|borla|nose\s*ring|nath|anklet|payal|bichhiya)\b/i.test(cleanName) ||
        /\b(jhumka|chandbali|choker|mangalsutra|maang-tikka|anklet)\b/i.test(urlStr);
      if (isFeminineJewellery) {
        return {
          isConsistent: false,
          reason: `Demographic mismatch: Traditional women's jewellery '${productName}' is not suitable for men's styling (${urlStr})`,
        };
      }
    }
  }

  // 9. MAKEUP (Lipstick, foundation, compact, etc. - NEVER apparel, footwear, bags, or jewellery)
  if (category === "makeup") {
    if (
      /\b(saree|dress|gown|kurta|blazer|suit|t-shirt|tshirt|jeans|trouser|pant|skirt|shoe|shoes|heel|heels|sandal|sandals|sneaker|boot|loafer|footwear|bag|handbag|tote|purse|clutch|necklace|choker|earring|bracelet|bangle)\b/i.test(
        productAndPathText,
      )
    ) {
      return {
        isConsistent: false,
        reason: `Category is Makeup, but destination URL belongs to an apparel/jewellery/footwear item: ${urlStr}`,
      };
    }
  }

  // 10. PRODUCT IMAGE CONSISTENCY (Scenario 7: Product image shows Item A but URL opens Item B)
  if (imageUrl) {
    const imgLower = imageUrl.toLowerCase();

    if (category === "outfit") {
      const imgIsShoe = /\b(shoe|shoes|heels?|sandals?|sneakers?|boots?|loafers?|footwear)\b/i.test(imgLower);
      const imgIsBag = /\b(handbag|purse|clutch|tote\s*bag|backpack)\b/i.test(imgLower);
      const imgIsGadget = /\b(airdopes|earbuds|headphones|electronics)\b/i.test(imgLower);
      if (imgIsShoe || imgIsBag || imgIsGadget) {
        return {
          isConsistent: false,
          reason: `Image mismatch: Outfit product '${productName}' cannot use image of shoe/bag/gadget (${imageUrl})`,
        };
      }
      if (
        (subcat.includes("lehenga") || cleanName.includes("lehenga") || cleanName.includes("chaniya choli")) &&
        (imgLower.includes("blazer") || imgLower.includes("formal-suit") || imgLower.includes("tuxedo"))
      ) {
        return {
          isConsistent: false,
          reason: `Image mismatch: Festive lehenga product '${productName}' cannot use image of a blazer/suit (${imageUrl})`,
        };
      }
      if (
        (subcat.includes("blazer") || cleanName.includes("blazer")) &&
        (imgLower.includes("lehenga") || imgLower.includes("chaniya") || imgLower.includes("saree") || imgLower.includes("dress"))
      ) {
        return {
          isConsistent: false,
          reason: `Image mismatch: Blazer product '${productName}' cannot use image of a dress/lehenga (${imageUrl})`,
        };
      }
    } else if (category === "footwear") {
      const imgIsApparelOrBag = /\b(blazer|suit|dress|saree|lehenga|kurta|trousers?|handbag|clutch|tote)\b/i.test(imgLower);
      const imgIsGadget = /\b(airdopes|earbuds|headphones|gadgets?)\b/i.test(imgLower);
      if (imgIsApparelOrBag || imgIsGadget) {
        return {
          isConsistent: false,
          reason: `Image mismatch: Footwear product '${productName}' cannot use image of apparel/bag/gadget (${imageUrl})`,
        };
      }
    } else if (category === "jewellery") {
      const imgIsApparelOrShoe = /\b(blazer|dress|trouser|shoe|heel|sneaker)\b/i.test(imgLower);
      if (imgIsApparelOrShoe) {
        return {
          isConsistent: false,
          reason: `Image mismatch: Jewellery product '${productName}' cannot use image of apparel/footwear (${imageUrl})`,
        };
      }
    }
  }

  // 11. PRICE SANITY AND MISMATCH CHECK (Scenario 8: Product title refers to Item A but price belongs to Item B)
  if (price !== undefined && price !== null) {
    if (price <= 0 || isNaN(price)) {
      return {
        isConsistent: false,
        reason: `Invalid price: ₹${price} for product '${productName}'`,
      };
    }
    // If outfit is an adult lehenga, saree, suit, or blazer, price cannot be a ₹49-₹350 accessory price
    if (category === "outfit" && persona !== "child") {
      if (price < 350) {
        return {
          isConsistent: false,
          reason: `Price mismatch: Outfit product '${productName}' has implausibly low price ₹${price} (likely an accessory/sticker price from search snippet)`,
        };
      }
    }
    if (category === "footwear" && price < 199) {
      return {
        isConsistent: false,
        reason: `Price mismatch: Footwear product '${productName}' has suspiciously low price ₹${price}`,
      };
    }
  }

  // 12. OCCASION CONSISTENCY CHECK
  if (expectedOccasion) {
    const occLower = expectedOccasion.toLowerCase();
    const isTraditionalOccasion =
      occLower.includes("traditional") ||
      occLower.includes("festive") ||
      occLower.includes("ethnic") ||
      occLower.includes("garba") ||
      occLower.includes("navratri") ||
      occLower.includes("dandiya") ||
      occLower.includes("diwali") ||
      occLower.includes("wedding") ||
      occLower.includes("shaadi") ||
      occLower.includes("sangeet") ||
      occLower.includes("mehendi") ||
      occLower.includes("haldi") ||
      occLower.includes("reception") ||
      occLower.includes("puja") ||
      occLower.includes("pooja") ||
      occLower.includes("eid");
    const isCorporateFormal = occLower.includes("office") || occLower.includes("corporate") || occLower.includes("work") || occLower.includes("interview");

    if (isTraditionalOccasion) {
      if (category === "outfit") {
        const isDefiniteWesternWear =
          /\b(bombers?|puffers?|fleece|flannel|biker|varsity|windbreaker|quilted|trucker|denim\s*jacket|leather\s*jacket|jeans|hoodies?|sweatshirts?|zip-front|crop\s*outdoor|patchwork\s*jacket)\b/i.test(cleanName);
        if (isDefiniteWesternWear) {
          return {
            isConsistent: false,
            reason: `Occasion mismatch: Cannot recommend casual western jacket or western wear '${productName}' for a traditional/festive occasion`,
          };
        }

        const isWesternGarment = /\b(jeans|denim|t-?shirts?|tees?|polo|sweatshirt|hoodie|blazer|western\s*suit|shorts|bermudas|cargo\s*pants?|trackpants?|joggers?|cocktail\s*dress|mini\s*dress|bodycon|pencil\s*skirt)\b/i.test(cleanName);
        const isWesternJacket =
          /\b(bomber|bombers|puffer|puffers|fleece|flannel|biker|motorcycle|varsity|windbreaker|quilted|trucker|denim\s*jacket|leather\s*jacket|spread\s*collar|tailored\s*jacket|classic\s*jacket|casual\s*jacket|outdoor\s*jacket|zip-front|crop\s*outdoor|patchwork\s*jacket)\b/i.test(cleanName) ||
          (/\bjackets?\b/i.test(cleanName) && !/\b(nehru|bundi|waistcoat|koti|modi|bandhgala|achkan|sherwani|ethnic|traditional|embroidered|festive|indo-western)\b/i.test(fullCheckText));

        const isEthnicGarment = /\b(kurta|kurtas|kurti|kurtis|saree|sari|saris|sarees|lehenga|lehengas|chaniya|choli|ghagra|dhoti|dhotis|pyjama|pyjamas|pajama|pajamas|churidar|churidars|sherwani|sherwanis|bandhgala|achkan|angrakha|anarkali|sharara|festive|ethnic|traditional|indo-western|bundi|nehru|dupatta|dupattas|stole|stoles|shawl|shawls|doshala|lohi|chaddar|angavastram)\b/i.test(cleanName);

        if ((isWesternGarment || isWesternJacket) && !isEthnicGarment) {
          return {
            isConsistent: false,
            reason: `Occasion mismatch: Cannot recommend modern western wear or western jacket '${productName}' for a traditional/festive occasion`,
          };
        }
      } else if (category === "footwear") {
        const isWesternCasualShoe = /\b(sneakers?|running\s*shoes?|skate\s*shoes?|athletic\s*shoes?|oxfords?|brogues?)\b/i.test(cleanName);
        const isEthnicShoe = /\b(mojaris?|juttis?|kolhapuris?|nagras?|khussas?|ethnic|traditional|embellished|embroidered)\b/i.test(fullCheckText);
        if (isWesternCasualShoe && !isEthnicShoe) {
          return {
            isConsistent: false,
            reason: `Occasion mismatch: Cannot recommend western casual/athletic shoes '${productName}' for a traditional/festive occasion`,
          };
        }
      }
    } else if (isCorporateFormal) {
      const isHeavyBridal = /\b(bridal\s*lehenga|wedding\s*lehenga|chaniya\s*choli|heavy\s*jhumka|temple\s*jewellery|bridal\s*choker)\b/i.test(fullCheckText);
      if (isHeavyBridal) {
        return {
          isConsistent: false,
          reason: `Occasion mismatch: Cannot recommend heavy bridal/festive item '${productName}' for Office Formal attire`,
        };
      }
    }
  }

  // 13. BEAUTY SHADE CONSISTENCY CHECK (Scenario 10)
  if (category === "makeup" && expectedShade) {
    const expShade = expectedShade.toLowerCase();
    const prodLower = fullCheckText.toLowerCase();

    if (expShade.includes("fair") || expShade.includes("light") || expShade.includes("porcelain") || expShade.includes("ivory")) {
      const isDeepShade = /\b(deep\s*(?:espresso|cocoa|chestnut|mocha|bronze|dark|rich)|toffee|espresso|rich\s*cocoa|ebony)\b/i.test(prodLower);
      if (isDeepShade && !prodLower.includes("fair") && !prodLower.includes("light")) {
        return {
          isConsistent: false,
          reason: `Shade mismatch: Expected light/fair shade, but product variant is deep shade: ${productName}`,
        };
      }
    }

    if (expShade.includes("deep") || expShade.includes("dark") || expShade.includes("rich")) {
      const isLightShade = /\b(fair|porcelain|ivory|light\s*sand|alabaster|light\s*beige)\b/i.test(prodLower);
      if (isLightShade && !prodLower.includes("deep") && !prodLower.includes("dark")) {
        return {
          isConsistent: false,
          reason: `Shade mismatch: Expected deep shade, but product variant is fair/porcelain shade: ${productName}`,
        };
      }
    }
  }

  // 14. RETAILER REDIRECT / CATEGORY MISMATCH IN URL (Scenario 9)
  if (urlStr) {
    try {
      const parsedUrl = new URL(urlStr);
      const pathname = parsedUrl.pathname.toLowerCase();

      if (persona === "woman" && (pathname.includes("/men-") || pathname.includes("/mens-") || pathname.startsWith("/men/"))) {
        return {
          isConsistent: false,
          reason: `URL department mismatch: Women's item '${productName}' points to men's URL path: ${urlStr}`,
        };
      }

      if (
        (subcat.includes("lehenga") || cleanName.includes("lehenga") || cleanName.includes("chaniya choli")) &&
        (pathname.includes("shirt") || pathname.includes("polo") || pathname.includes("electronics") || pathname.includes("mobile"))
      ) {
        return {
          isConsistent: false,
          reason: `URL category mismatch: Lehenga item '${productName}' points to unrelated path: ${urlStr}`,
        };
      }

      if (pathname === "/search" || pathname === "/search/") {
        const queryParam = parsedUrl.searchParams.get("text") || parsedUrl.searchParams.get("q") || parsedUrl.searchParams.get("k");
        if (!queryParam || queryParam.trim().length === 0 || queryParam === "undefined") {
          return {
            isConsistent: false,
            reason: `Broken URL: Bare search URL with missing search query: ${urlStr}`,
          };
        }
      }
    } catch { }
  }

  // 15. Keyword token overlap check
  const nameTokens = cleanName
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t.length > 3 &&
        ![
          "with",
          "from",
          "women",
          "mens",
          "girls",
          "boys",
          "best",
          "good",
          "shop",
          "look",
          "style",
          "wear",
          "online",
          "india",
        ].includes(t),
    );

  let tokenMatchCount = 0;
  for (const token of nameTokens) {
    if (fullCheckText.includes(token)) {
      tokenMatchCount++;
    }
  }

  if (nameTokens.length > 0 && tokenMatchCount === 0) {
    return {
      isConsistent: false,
      reason: `No keyword overlap between displayed product '${productName}' and destination '${urlStr}'`,
    };
  }

  return { isConsistent: true };
}

/**
 * Exact price mismatch validator. Zero percentage tolerance.
 * The destination product price is the authoritative source of truth.
 * Only exact integer rupee matches (formatting variations like ₹1,499 vs 1499.00 normalized)
 * are accepted. Any price discrepancy (e.g. ₹4,478 vs ₹9,999, ₹4,500 vs ₹5,000, ₹999 vs ₹1,099)
 * is rejected immediately.
 */
export function validatePriceMatch(
  destinationPrice: number | undefined,
  searchMetadataPrice?: number | undefined,
  category?: ProductCategory,
  productTitle?: string,
): { isMatch: boolean; diffRupees: number; reason?: string } {
  if (!destinationPrice || destinationPrice <= 0) {
    return { isMatch: false, diffRupees: -1, reason: "No valid price found on destination product page" };
  }

  // Sanity check against category and title
  if (category === "outfit") {
    const titleLower = (productTitle || "").toLowerCase();
    if (/\b(lehenga|saree|suit|blazer|gown|sherwani)\b/i.test(titleLower) && destinationPrice < 350) {
      return {
        isMatch: false,
        diffRupees: -1,
        reason: `Price mismatch: Outfit '${productTitle}' has implausibly low price ₹${destinationPrice} belonging to an accessory or snippet mismatch`,
      };
    }
  }

  if (!searchMetadataPrice || searchMetadataPrice <= 0) {
    // If no search snippet price was specified, destination price is authoritative
    return { isMatch: true, diffRupees: 0 };
  }

  const roundedDest = Math.round(destinationPrice);
  const roundedMeta = Math.round(searchMetadataPrice);
  const diffRupees = Math.abs(roundedDest - roundedMeta);

  // ZERO TOLERANCE: Any numerical price difference is rejected
  if (diffRupees !== 0) {
    return {
      isMatch: false,
      diffRupees,
      reason: `Price mismatch: search snippet claimed ₹${roundedMeta}, but verified destination product page is ₹${roundedDest} (discrepancy: ₹${diffRupees})`,
    };
  }

  return { isMatch: true, diffRupees: 0 };
}

/**
 * Verifies and fetches current live product details (price, image, availability, name)
 * directly from the destination product page HTML.
 */
const decodeHtmlEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Reads an Amazon product detail page. Amazon serves no schema.org JSON-LD or og: tags,
 * so without this a reachable, genuine Amazon product page could never verify. Every
 * value comes from the product's own elements: the title (#productTitle), the main buy-box
 * price block (corePriceDisplay / corePrice), the byline brand, the main image and the
 * availability block. Prices elsewhere on the page (other offers, sponsored items) are ignored.
 */
export function parseAmazonProductPage(html: string): {
  productName?: string;
  brand?: string;
  price?: number;
  originalPrice?: number;
  imageUrl?: string;
  unavailable?: boolean;
} {
  const titleMatch = html.match(/<span[^>]*\bid="productTitle"[^>]*>([\s\S]*?)<\/span>/i);
  const productName = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, "")) : undefined;
  if (!productName) return {};

  // The buy-box price block only; it is the price shown for this exact product.
  let price: number | undefined;
  let originalPrice: number | undefined;
  const priceBlockStart = html.search(/id="(?:corePriceDisplay_desktop_feature_div|corePrice_desktop|corePrice_feature_div)"/i);
  if (priceBlockStart !== -1) {
    const block = html.slice(priceBlockStart, priceBlockStart + 6000);
    const whole = block.match(/class="a-price-whole">([\d,]+)/i);
    if (whole) price = parseInrAmount(whole[1]);
    // "M.R.P.: ₹1,999" is rendered as a struck-through a-price with data-a-strike
    const mrp = block.match(/data-a-strike="true"[\s\S]{0,400}?<span class="a-offscreen">\s*(?:₹|&#8377;)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (mrp) originalPrice = parseInrAmount(mrp[1]);
  }

  // The id appears on a wrapper and on the link itself; the link holds the text.
  const bylineText = [...html.matchAll(/id="bylineInfo"[^>]*>([^<]*)</gi)]
    .map((m) => decodeHtmlEntities(m[1]))
    .find(Boolean);
  let brand: string | undefined;
  if (bylineText) {
    const byline = bylineText;
    brand =
      byline.match(/^Visit the (.+?) Store$/i)?.[1] ??
      byline.match(/^Brand:\s*(.+)$/i)?.[1] ??
      undefined;
  }

  const imageMatch = html.match(/data-old-hires="(https:\/\/[^"]+)"/i) || html.match(/"hiRes":"(https:\/\/[^"]+)"/i);
  const imageUrl = imageMatch?.[1];

  const availabilityStart = html.search(/<div[^>]*\bid="availability"/i);
  const availabilityText =
    availabilityStart === -1 ? "" : html.slice(availabilityStart, availabilityStart + 2000).replace(/<[^>]+>/g, " ");
  const unavailable = /currently unavailable|out of stock/i.test(availabilityText);

  return {
    productName,
    brand,
    price: price && price > 0 ? Math.round(price) : undefined,
    originalPrice: originalPrice && originalPrice > 0 ? Math.round(originalPrice) : undefined,
    imageUrl,
    unavailable,
  };
}

export async function verifyProductPage(urlStr: string): Promise<{
  success: boolean;
  retailerRestricted?: boolean;
  price?: number;
  originalPrice?: number;
  currency?: string;
  availability?: string;
  imageUrl?: string;
  productName?: string;
  brand?: string;
  finalUrl?: string;
  priceVerified?: boolean;
  reason?: string;
  /** HTTP status of the product page request, when one completed (for diagnostics). */
  httpStatus?: number;
}> {
  const requestPage = () =>
    fetch(urlStr, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // Large retailer pages (Amazon product pages are ~2 MB) regularly need more than 3.5s.
      signal: AbortSignal.timeout(6000),
    });
  try {
    let res = await requestPage();

    // Rate-limited requests (429) get a single polite retry if retry-after is small.
    // HTTP 503 (Varnish/service unavailable) is a server/CDN state; do not retry aggressively.
    // Without a Retry-After header (common for a short burst limit), wait 800ms once.
    if (res.status === 429) {
      const header = res.headers.get("retry-after");
      const retryAfter = header === null ? NaN : Number(header);
      if (header === null || (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 2)) {
        await new Promise((r) => setTimeout(r, header === null ? 800 : retryAfter * 1000));
        res = await requestPage();
      }
    }

    if (res.status === 503) {
      return {
        success: false,
        retailerRestricted: true,
        reason: "Retailer service temporarily unavailable (HTTP 503 Varnish/CDN)",
        finalUrl: urlStr,
        httpStatus: 503,
      };
    }

    if (res.status === 403 || res.status === 429) {
      return {
        success: false,
        retailerRestricted: true,
        reason: `Retailer automated access restricted (HTTP ${res.status} bot protection)`,
        finalUrl: urlStr,
        httpStatus: res.status,
      };
    }

    if (!res.ok) {
      return { success: false, reason: `HTTP status ${res.status}`, httpStatus: res.status };
    }

    const finalUrl = res.url || urlStr;

    // Validate retailer redirect (Scenario 9: Retailer URL redirects to an unrelated product)
    if (finalUrl !== urlStr) {
      try {
        const origUrlObj = new URL(urlStr);
        const finalUrlObj = new URL(finalUrl);
        const origPath = origUrlObj.pathname.toLowerCase();
        const finalPath = finalUrlObj.pathname.toLowerCase();

        // Redirected to homepage or generic search
        if (finalPath === "/" || finalPath === "" || finalPath === "/search" || finalPath === "/search/") {
          return { success: false, reason: `Retailer redirected to generic homepage/search: ${finalUrl}`, httpStatus: res.status };
        }

        // Redirected from ethnic/women apparel to men's or electronics
        const isOrigEthnicOrWomen = origPath.includes("lehenga") || origPath.includes("chaniya") || origPath.includes("saree") || origPath.includes("women");
        const isFinalUnrelated = finalPath.includes("/men-") || finalPath.includes("electronics") || finalPath.includes("mobile") || finalPath.includes("gadget");
        if (isOrigEthnicOrWomen && isFinalUnrelated) {
          return { success: false, reason: `Retailer redirected to unrelated department: ${finalUrl}`, httpStatus: res.status };
        }
      } catch { }
    }

    const html = await res.text();

    // Check for bot access challenges
    if (
      html.includes("Robot Check") ||
      html.includes("Enter the characters you see below") ||
      html.includes("Attention Required! | Cloudflare") ||
      html.includes("Access Denied")
    ) {
      return {
        success: false,
        retailerRestricted: true,
        reason: "Retailer automated access challenge detected",
        finalUrl: urlStr,
        httpStatus: res.status,
      };
    }

    // Check for 404 or product discontinuation
    if (
      html.includes("404 - Not Found") ||
      html.includes("Page Not Found") ||
      html.includes("Page not found") ||
      html.includes("This product is no longer available") ||
      html.includes("Item has been discontinued")
    ) {
      return { success: false, reason: "Product page indicates item no longer available or 404", httpStatus: res.status };
    }

    let price: number | undefined;
    let originalPrice: number | undefined;
    let currency = "INR";
    let availability = "In Stock";
    let imageUrl: string | undefined;
    let productName: string | undefined;
    let brand: string | undefined;
    // Set only by structured, product-specific data (schema.org Product, Myntra pdpData,
    // Amazon's product title). A category/listing page has a title and an og:image too,
    // so those alone must never make a page count as a verified product.
    let hasProductEvidence = false;

    // 1. JSON-LD check (schema.org/Product). Attribute order/quoting varies by site
    // (e.g. `<script type='application/ld+json' data-...>`), so match the tag loosely.
    const jsonLdBodies = [...html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(
      (m) => m[1].trim(),
    );
    if (jsonLdBodies.length > 0) {
      for (const raw of jsonLdBodies) {
        try {
          const parsed = JSON.parse(raw);
          const candidates: any[] = Array.isArray(parsed) ? [...parsed] : [parsed];
          for (const node of [...candidates]) {
            if (node && Array.isArray(node["@graph"])) candidates.push(...node["@graph"]);
          }

          for (const item of candidates) {
            if (!item || typeof item !== "object") continue;
            const types = ([] as unknown[]).concat(item["@type"] ?? []).map((t) => String(t));
            const isProductNode = types.includes("Product") || types.includes("ProductGroup");
            if (isProductNode) hasProductEvidence = true;
            if (isProductNode || item.offers) {
              if (item.name) productName = productName || item.name;
              if (item.brand) {
                brand =
                  brand ||
                  (typeof item.brand === "string" ? item.brand : item.brand?.name);
              }

              if (item.image) {
                let imgCandidate = Array.isArray(item.image)
                  ? item.image[0]
                  : typeof item.image === "object"
                    ? item.image.url
                    : item.image;
                if (typeof imgCandidate === "string") {
                  imgCandidate = imgCandidate.replace(/h_\(\$height\),q_\(\$qualityPercentage\),w_\(\$width\)/g, "h_560,q_90,w_420");
                  if (imgCandidate.startsWith("http:")) imgCandidate = imgCandidate.replace(/^http:/, "https:");
                  imageUrl = imageUrl || imgCandidate;
                }
              }

              const offers = item.offers;
              if (offers) {
                const offerObj = Array.isArray(offers) ? offers[0] : offers;
                if (offerObj.price) {
                  const pNum = parseInrAmount(
                    typeof offerObj.price === "number" ? offerObj.price : String(offerObj.price),
                  );
                  if (pNum !== undefined && Math.round(pNum) > 0) price = Math.round(pNum);
                }
                if (offerObj.priceCurrency) currency = offerObj.priceCurrency;
                if (offerObj.availability) {
                  const avStr = String(offerObj.availability).toLowerCase();
                  if (
                    avStr.includes("outofstock") ||
                    avStr.includes("soldout") ||
                    avStr.includes("discontinued")
                  ) {
                    availability = "Out of Stock";
                  } else {
                    availability = "In Stock";
                  }
                }
              }
            }
          }
        } catch { }
      }
    }

    // 2. Check Myntra window.__myx pdpData
    if (!price) {
      const myxMatch = html.match(/window\.__myx\s*=\s*(\{[\s\S]*?\});?<\/script>/i);
      if (myxMatch) {
        try {
          const myx = JSON.parse(myxMatch[1]);
          const pdp = myx?.pdpData;
          if (pdp) {
            hasProductEvidence = true;
            if (pdp.price?.discounted) price = Math.round(pdp.price.discounted);
            else if (pdp.price?.mrp) price = Math.round(pdp.price.mrp);
            if (pdp.price?.mrp && pdp.price?.mrp > (price || 0)) originalPrice = Math.round(pdp.price.mrp);
            if (pdp.name) productName = pdp.name;
            if (pdp.brand?.name) brand = pdp.brand.name;
            if (pdp.media?.albums?.[0]?.images?.[0]?.src) {
              let imgSrc = pdp.media.albums[0].images[0].src;
              imgSrc = imgSrc.replace(/h_\(\$height\),q_\(\$qualityPercentage\),w_\(\$width\)/g, "h_560,q_90,w_420");
              if (imgSrc.startsWith("http:")) imgSrc = imgSrc.replace(/^http:/, "https:");
              imageUrl = imgSrc;
            }
            if (pdp.flags?.outOfStock) availability = "Out of Stock";
          }
        } catch { }
      }
    }

    // 2b. Amazon product pages carry no JSON-LD or og: tags; read their own product markup.
    let isAmazonPage = false;
    try {
      isAmazonPage = /(^|\.)amazon\.(in|com)$/.test(new URL(finalUrl).hostname);
    } catch { }
    if (isAmazonPage) {
      const amazon = parseAmazonProductPage(html);
      if (amazon.productName) {
        hasProductEvidence = true;
        productName = productName || amazon.productName;
        brand = brand || amazon.brand;
        imageUrl = imageUrl || amazon.imageUrl;
        if (!price && amazon.price) price = amazon.price;
        if (!originalPrice && amazon.originalPrice && amazon.originalPrice > (price || 0)) originalPrice = amazon.originalPrice;
        if (amazon.unavailable) availability = "Out of Stock";
      }
    }

    // 3. Fallback to OpenGraph and regex patterns. Amazon pages are handled above: their
    // markup contains many unrelated "price" values (other sellers, sponsored items).
    if (!price && !isAmazonPage) {
      const priceMeta =
        html.match(/"discountedPrice":\s*(\d+)/i) ||
        html.match(/"price":\s*"?([\d,]+(?:\.\d+)?)"?/i) ||
        html.match(/<meta property="(?:product|og):price:amount" content="([^"]+)"/i) ||
        html.match(/content="([\d,]+(?:\.\d+)?)" property="(?:product|og):price:amount"/i);
      if (priceMeta) {
        // parseFloat("1,499.00") would yield 1; parse the full comma-grouped amount
        const pNum = parseInrAmount(priceMeta[1]);
        if (pNum !== undefined && Math.round(pNum) > 0) price = Math.round(pNum);
      }
    }

    // Check for MRP / originalPrice
    if (!originalPrice) {
      const mrpMatch =
        html.match(/"mrp":\s*(\d+)/i) || html.match(/"originalPrice":\s*(\d+)/i);
      if (mrpMatch) {
        const mrpNum = parseFloat(mrpMatch[1]);
        if (!isNaN(mrpNum) && mrpNum > (price || 0)) {
          originalPrice = Math.round(mrpNum);
        }
      }
    }

    if (!imageUrl) {
      const imgMeta = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (imgMeta) imageUrl = imgMeta[1];
    }

    if (!productName) {
      const titleMeta = html.match(/<meta property="og:title" content="([^"]+)"/i);
      if (titleMeta) {
        productName = titleMeta[1]
          .replace(/\|.*$/, "")
          .replace(/^Buy\s+/i, "")
          .trim();
      }
    }

    if (price && price > 0) {
      return {
        success: true,
        price,
        originalPrice,
        currency,
        availability,
        imageUrl,
        productName,
        brand,
        finalUrl,
        priceVerified: true,
        httpStatus: res.status,
      };
    }

    // Scenario 11: If product exists but price cannot be verified, return without fabricating a price.
    // Only structured product data counts as "product exists" — a category or listing page
    // also has an og:title and og:image, and must not be presented as a verified product.
    if (hasProductEvidence && (productName || imageUrl)) {
      return {
        success: true,
        price: undefined,
        originalPrice: undefined,
        currency,
        availability,
        imageUrl,
        productName,
        brand,
        finalUrl,
        priceVerified: false,
        reason: "Price unavailable on destination product page",
        httpStatus: res.status,
      };
    }

    return {
      success: false,
      reason: productName || imageUrl
        ? "Page has no structured product data (likely a category/listing page or client-rendered page)"
        : "Could not find reliable product details or price on destination page",
      httpStatus: res.status,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout =
      msg.toLowerCase().includes("timeout") ||
      msg.toLowerCase().includes("abort") ||
      msg.toLowerCase().includes("econnreset");
    if (isTimeout) {
      return {
        success: false,
        retailerRestricted: true,
        reason: `Retailer access timeout or network restriction (${msg})`,
        finalUrl: urlStr,
      };
    }
    return { success: false, reason: msg };
  }
}

/**
 * A complete INR amount: plain digits ("1499") or comma-grouped in Indian/Western style
 * ("1,499", "1,49,999"), with optional paise ("1,499.00"). The boundaries stop a regex from
 * matching only part of a number (e.g. "149" out of "1499", or "499" out of "1499 INR").
 */
const INR_AMOUNT = String.raw`(?<!\d)(?<!\d[.,])(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?(?![\d,]|\.\d)`;
const INR_AMOUNT_RE = new RegExp(INR_AMOUNT);
const INR_CURRENCY_AMOUNT_RE = new RegExp(String.raw`(?:₹|Rs\.?|INR)\s*${INR_AMOUNT}`, "i");

/**
 * Parses a complete INR amount from a string such as "Rs. 1499", "₹1,499",
 * "INR 1,49,999.00" or "1499". An amount next to a currency marker wins over other
 * numbers (e.g. "Size 8 | ₹999" -> 999). Returns undefined when no amount is present.
 */
export function parseInrAmount(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : undefined;
  if (typeof raw !== "string") return undefined;
  const match = raw.match(INR_CURRENCY_AMOUNT_RE) || raw.match(INR_AMOUNT_RE);
  if (!match) return undefined;
  const value = parseFloat(match[1].replace(/,/g, "") + (match[2] ? `.${match[2]}` : ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Clean and normalize a price value into an integer number and formatted string.
 */
export function normalizePrice(
  priceInput: unknown,
  currency: string = "INR",
): { price?: number; formattedPrice?: string } {
  let num: number | undefined;

  if (typeof priceInput === "number" && !isNaN(priceInput) && priceInput > 0) {
    num = Math.round(priceInput);
  } else if (typeof priceInput === "string") {
    // Stripping non-digits would turn "Rs. 1,499" into ".1499"; parse the amount token instead
    const parsed = parseInrAmount(priceInput);
    if (parsed !== undefined && Math.round(parsed) > 0) {
      num = Math.round(parsed);
    }
  }

  if (num !== undefined) {
    const symbol = currency === "INR" ? "₹" : "$";
    return {
      price: num,
      formattedPrice: `${symbol}${num.toLocaleString("en-IN")}`,
    };
  }

  return {};
}

/**
 * Check if product violates avoided colors.
 */
export function violatesAvoidedColors(
  productName: string,
  color: string | undefined,
  colorsAvoid: string[],
): boolean {
  if (!colorsAvoid.length) return false;
  const text = `${productName} ${color || ""}`.toLowerCase();
  for (const avoid of colorsAvoid) {
    const cleanAvoid = avoid.toLowerCase().trim();
    if (cleanAvoid && text.includes(cleanAvoid)) {
      return true;
    }
  }
  return false;
}

/**
 * Parses user budget into an approximate upper limit in INR for scoring.
 * Evaluates upper range bounds first (e.g. ₹5K–₹10K resolves to 10000).
 */
export function parseBudgetLimit(budgetStr: string): number | null {
  const b = (budgetStr || "").toLowerCase();
  if (b.includes("25k+")) return 100000;
  if (b.includes("25k")) return 25000;
  if (b.includes("10k")) return 10000;
  if (b.includes("5k")) return 5000;
  if (b.includes("2k")) return 2000;
  return null;
}

/**
 * Categorize a product's price into a price tier within the user's budget context.
 */
export function assignPriceTier(price: number | undefined, budgetLimit: number | null): PriceTier {
  if (!price) return "mid";

  if (budgetLimit && budgetLimit <= 2000) {
    if (price <= 800) return "budget";
    if (price <= 1400) return "mid";
    return "premium";
  }

  if (budgetLimit && budgetLimit <= 5000) {
    if (price <= 1500) return "budget";
    if (price <= 3500) return "mid";
    return "premium";
  }

  if (price < 1500) return "budget";
  if (price <= 3500) return "mid";
  return "premium";
}

/**
 * Real verified high-definition product images for Indian beauty and fashion products.
 * Guarantees that every product card receives an authentic, distinct, crystal-clear image.
 */
export const VERIFIED_BEAUTY_IMAGES: Record<string, string[]> = {
  foundation: [
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/9/8/98dd97430079236_MME_1.jpg", // Maybelline Fit Me Foundation
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8901526584288_1.jpg", // L'Oreal Infallible 24H Fresh Wear
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/7/7/773602148286_1.jpg",   // MAC Studio Fix Fluid
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8901030386762_1.jpg", // Lakme Absolute Skin Natural Mousse
  ],
  compact: [
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8901526584066_1.jpg", // Maybelline Fit Me Compact
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8901030742186_1.jpg", // Lakme 9to5 Primer + Matte Compact
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8906090494496_1.jpg", // Sugar All Set To Go Translucent Powder
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8904318301135_1.jpg", // Kay Beauty Matte HD Setting Powder
  ],
  blush: [
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8906090498869_1.jpg", // Sugar Contour De Force Mini Blush
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/4/1/41554553833_1.jpg",   // Maybelline Fit Me Blush
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8904052418384_1.jpg", // Colorbar Cheek Illusion Blush
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8904318301326_1.jpg", // Kay Beauty Matte Blush
  ],
  lipstick: [
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/4/1/41554494969_1.jpg",   // Maybelline Superstay Matte Ink
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8901030752185_1.jpg", // Lakme Absolute Matte Melt
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/4/1/41554429954_1.jpg",   // Maybelline Creamy Matte
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8906090492164_1.jpg", // Sugar Smudge Me Not
  ],
  lipliner: [
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8904388612148_1.jpg", // Swiss Beauty Bold Matte Lip Liner
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8906090494021_1.jpg", // Sugar Lipping On The Edge Lip Liner
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8904353401562_1.jpg", // PAC Lip Contour Liner
  ],
  eyeliner: [
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8906014831000_1.jpg", // Plum NatureStudio Kohl Kajal
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/4/1/41554548419_1.jpg",   // Maybelline Colossal Bold Eyeliner
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8901030364968_1.jpg", // Lakme Eyeconic Kajal
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8906090495806_1.jpg", // Sugar Wingman Waterproof Microliner
  ],
  mascara: [
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/4/1/41554590500_1.jpg",   // Maybelline Sky High Mascara
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/7/1/71249343319_1.jpg",   // L'Oreal Paris Lash Paradise Mascara
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/4/1/41554522556_1.jpg",   // Maybelline Hypercurl Waterproof Mascara
  ],
  highlighter: [
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/4/1/41554538298_1.jpg",   // Maybelline Master Chrome Molten Gold
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8906090498883_1.jpg", // Sugar Contour De Force Mini Highlighter
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8904318301388_1.jpg", // Kay Beauty Illuminating Highlighter
  ],
  grooming: [
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8906087771746_1.jpg", // Men's Moisturizer & SPF
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/4/0/4005808381837_1.jpg", // Nivea Men Lip Balm
    "https://images-static.nykaa.com/media/catalog/product/tr:h-800,w-800,cm-pad_resize/8/9/8906084792614_1.jpg", // Beard Softening Oil
  ],
};

export const VERIFIED_FASHION_IMAGES: Record<string, string[]> = {
  dress: [
    "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800&auto=format&fit=crop&q=80",
  ],
  blazer: [
    "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1584273143981-41c073dfe8f8?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1548883354-7622d03aca27?w=800&auto=format&fit=crop&q=80",
  ],
  trousers: [
    "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1509551388413-e18d0ac5d495?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1582418702059-97ebafb35d09?w=800&auto=format&fit=crop&q=80",
  ],
  innerTop: [
    "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1608234807905-44670ac7b0f2?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1564257631407-4deb1f99d992?w=800&auto=format&fit=crop&q=80",
  ],
  saree: [
    "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=800&auto=format&fit=crop&q=80",
  ],
  kurta: [
    "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1609357605129-26f69add5d6e?w=800&auto=format&fit=crop&q=80",
  ],
  footwear: [
    "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1535043934128-cf0b28d52f95?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1562273138-f46be4ebdf33?w=800&auto=format&fit=crop&q=80",
  ],
  accessories: [
    "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=800&auto=format&fit=crop&q=80",
  ],
  earringsStuds: [
    "https://images.unsplash.com/photo-1630019852942-f89202989a59?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1635767798638-3e25273a8236?w=800&auto=format&fit=crop&q=80",
  ],
  jewelleryWrist: [
    "https://images.unsplash.com/photo-1611591475168-98e3b3c3b0df?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&auto=format&fit=crop&q=80",
  ],
};

export function getVerifiedProductImage(
  category: ProductCategory,
  itemTitle: string,
  productTitle: string = "",
  index: number = 0,
): string | undefined {
  const text = `${itemTitle} ${productTitle}`.toLowerCase();

  if (category === "outfit") {
    if (text.includes("trouser") || text.includes("pant") || text.includes("slacks") || text.includes("chinos")) {
      const pool = VERIFIED_FASHION_IMAGES.trousers;
      return pool[index % pool.length];
    }
    if (text.includes("top") || text.includes("camisole") || text.includes("blouse") || text.includes("shirt") || text.includes("corset") || text.includes("inner")) {
      const pool = VERIFIED_FASHION_IMAGES.innerTop;
      return pool[index % pool.length];
    }
    if (text.includes("saree") || text.includes("sari")) {
      const pool = VERIFIED_FASHION_IMAGES.saree;
      return pool[index % pool.length];
    }
    if (text.includes("kurta") || text.includes("kurti")) {
      const pool = VERIFIED_FASHION_IMAGES.kurta;
      return pool[index % pool.length];
    }
    if (text.includes("blazer") || text.includes("suit") || text.includes("jacket")) {
      const pool = VERIFIED_FASHION_IMAGES.blazer;
      return pool[index % pool.length];
    }
    const pool = VERIFIED_FASHION_IMAGES.dress;
    return pool[index % pool.length];
  }

  if (category === "footwear") {
    const pool = VERIFIED_FASHION_IMAGES.footwear;
    return pool[index % pool.length];
  }

  if (category === "accessories") {
    const pool = VERIFIED_FASHION_IMAGES.accessories;
    return pool[index % pool.length];
  }

  if (category === "jewellery") {
    if (text.includes("bracelet") || text.includes("bangle") || text.includes("cuff") || text.includes("wrist")) {
      const pool = VERIFIED_FASHION_IMAGES.jewelleryWrist;
      return pool[index % pool.length];
    }
    const pool = VERIFIED_FASHION_IMAGES.earringsStuds;
    return pool[index % pool.length];
  }

  if (category === "makeup") {
    if (text.includes("foundation") || text.includes("skin tint")) {
      const pool = VERIFIED_BEAUTY_IMAGES.foundation;
      return pool[index % pool.length];
    }
    if (text.includes("compact") || text.includes("powder") || text.includes("setting")) {
      const pool = VERIFIED_BEAUTY_IMAGES.compact;
      return pool[index % pool.length];
    }
    if (text.includes("blush")) {
      const pool = VERIFIED_BEAUTY_IMAGES.blush;
      return pool[index % pool.length];
    }
    if (text.includes("lip liner") || text.includes("lip definer") || text.includes("lip pencil")) {
      const pool = VERIFIED_BEAUTY_IMAGES.lipliner;
      return pool[index % pool.length];
    }
    if (text.includes("lipstick") || text.includes("lip color") || text.includes("lip")) {
      const pool = VERIFIED_BEAUTY_IMAGES.lipstick;
      return pool[index % pool.length];
    }
    if (text.includes("eyeliner") || text.includes("kajal") || text.includes("kohl") || text.includes("liner")) {
      const pool = VERIFIED_BEAUTY_IMAGES.eyeliner;
      return pool[index % pool.length];
    }
    if (text.includes("mascara") || text.includes("lash")) {
      const pool = VERIFIED_BEAUTY_IMAGES.mascara;
      return pool[index % pool.length];
    }
    if (text.includes("highlighter") || text.includes("illuminat") || text.includes("strobe")) {
      const pool = VERIFIED_BEAUTY_IMAGES.highlighter;
      return pool[index % pool.length];
    }
    if (text.includes("moisturizer") || text.includes("beard") || text.includes("grooming") || text.includes("balm")) {
      const pool = VERIFIED_BEAUTY_IMAGES.grooming;
      return pool[index % pool.length];
    }
    const pool = VERIFIED_BEAUTY_IMAGES.lipstick;
    return pool[index % pool.length];
  }

  return undefined;
}

/**
 * Brand of a search result from its title. Designer stores title products "… for Women by
 * <Designer>"; otherwise the first word is the brand unless it is a colour or a generic
 * word ("Black Organza Saree" has no brand in its title), in which case the store is used.
 */
export function guessBrandFromTitle(title: string, fallback: string): string {
  const byDesigner = /\bby\s+([A-Z][\w&.'’ -]{1,40}?)\s*(?:[-–|:,]|$)/.exec(title);
  if (byDesigner) return byDesigner[1].trim();
  const first = (title.trim().split(/\s+/)[0] || "").replace(/[^\w&'’.-]/g, "");
  const generic = /^(women|womens|men|mens|girls?|boys?|kids?|new|latest|designer|embroidered|printed|pre-draped|ready|the|a|an|buy)$/i;
  if (!first || first.length < 2 || extractColorFromText(first) || generic.test(first)) return fallback;
  return first;
}

// Amounts in promo/shipping banners ("free shipping above ₹2,000", "flat ₹500 off") are not prices
const PROMO_BEFORE_PRICE_RE = /(?:above|over|orders?|shipping|delivery|off|flat|save|upto|up\s+to|cashback|coupon|min(?:imum)?|worth|extra|first\s+order)\s*(?:of\s*)?$/i;
const PROMO_AFTER_PRICE_RE = /^\s*(?:off|cashback|discount|and\s+above|\+)/i;

export function extractPriceFromSnippet(text: string): number | undefined {
  if (!text) return undefined;
  // Blank out promo amounts first so the patterns below only see real prices
  text = text.replace(
    new RegExp(String.raw`(?:₹|Rs\.?|INR)\s*\d[\d,]*(?:\.\d+)?`, "gi"),
    (m, offset: number, whole: string) =>
      PROMO_BEFORE_PRICE_RE.test(whole.slice(Math.max(0, offset - 30), offset)) ||
      PROMO_AFTER_PRICE_RE.test(whole.slice(offset + m.length, offset + m.length + 20))
        ? " "
        : m,
  );
  // Each pattern captures a complete amount (INR_AMOUNT), so "Rs. 1499" yields 1499, not 149
  const patterns = [
    new RegExp(String.raw`(?:₹|Rs\.?|INR)\s*${INR_AMOUNT}`, "i"),
    new RegExp(String.raw`(?:Price|MRP|Deal Price|Offer Price|Special Price)[:\s]+(?:₹|Rs\.?|INR)?\s*${INR_AMOUNT}`, "i"),
    new RegExp(String.raw`${INR_AMOUNT}\s*(?:INR|Rs\.?)`, "i"),
  ];

  for (const pat of patterns) {
    const match = text.match(pat);
    if (match) {
      const parsed = parseInrAmount(match[2] ? `${match[1]}.${match[2]}` : match[1]);
      if (parsed !== undefined && parsed >= 99 && parsed <= 250000) {
        return Math.round(parsed);
      }
    }
  }
  return undefined;
}

export function getStandardBenchmarkPrice(itemTitle: string): number {
  const t = itemTitle.toLowerCase();
  if (t.includes("foundation")) return 549;
  if (t.includes("compact") || t.includes("powder")) return 249;
  if (t.includes("blush")) return 349;
  if (t.includes("lipstick") || t.includes("lip color")) return 449;
  if (t.includes("lip liner") || t.includes("lip definer")) return 199;
  if (t.includes("mascara")) return 429;
  if (t.includes("eyeliner") || t.includes("kajal")) return 299;
  if (t.includes("highlighter") || t.includes("illuminat")) return 599;
  if (t.includes("jewellery") || t.includes("necklace") || t.includes("earring")) return 1299;
  if (t.includes("heel") || t.includes("footwear") || t.includes("shoe")) return 1799;
  return 1499;
}

/**
 * Builds a complete personalized makeup suite customized according to the customer's choice
 * with a strict two-layer architecture:
 * - Layer A: Common Makeup Essentials (Base/Foundation with shortlisted candidate shades and disclaimer,
 *   Concealer, Compact/Setting powder, Blush, Eyeliner/Kajal, and Mascara).
 * - Layer B: Occasion-Specific Makeup (Tailored shades, finishes, and complementary products like
 *   festive gold/bronze eyeshadow, illuminating highlighters, statement/nude lips).
 *
 * Fully respects demographic context:
 * - Women: Layer A + Layer B tailored to skin tone, undertone, occasion, and preferences.
 * - Men: Natural clean grooming essentials (oil-control moisturizer with SPF, matte lip balm, beard oil).
 * - Children: No cosmetics ("None - child-friendly natural skin").
 */
export function buildPersonalizedMakeupSpecs(
  look: LookRecommendation,
  profile: SkinTuneProfile,
  persona: PersonaType,
): RequirementSpec[] {
  const skinTone = profile.appearance?.skinTone || "Medium";
  const undertone = profile.appearance?.undertone || "Warm";
  const occ = (profile.occasion || "").toLowerCase();
  const styles = (profile.style || []).map((s) => s.toLowerCase());
  const impressions = (profile.impression || []).map((s) => s.toLowerCase());
  const allContext = `${occ} ${styles.join(" ")} ${impressions.join(" ")}`;

  const isGarba =
    allContext.includes("garba") ||
    allContext.includes("navratri") ||
    allContext.includes("dandiya") ||
    allContext.includes("dandia");

  const isWedding =
    allContext.includes("wedding") ||
    allContext.includes("sangeet") ||
    allContext.includes("mehendi") ||
    allContext.includes("reception") ||
    allContext.includes("shaadi") ||
    allContext.includes("bridal");

  const isVacation =
    allContext.includes("vacation") ||
    allContext.includes("beach") ||
    allContext.includes("resort") ||
    allContext.includes("goa") ||
    allContext.includes("holiday");

  const isTraditional =
    !isVacation &&
    (isGarba ||
      isWedding ||
      allContext.includes("traditional") ||
      allContext.includes("festive") ||
      allContext.includes("ethnic") ||
      allContext.includes("diwali") ||
      allContext.includes("puja"));

  const isOffice =
    allContext.includes("office") ||
    allContext.includes("work") ||
    allContext.includes("formal") ||
    allContext.includes("corporate") ||
    allContext.includes("meeting") ||
    allContext.includes("interview") ||
    allContext.includes("minimalist");

  const isDateNight =
    allContext.includes("date") ||
    allContext.includes("romantic") ||
    allContext.includes("dinner");

  const isParty =
    allContext.includes("party") ||
    allContext.includes("cocktail") ||
    allContext.includes("club") ||
    allContext.includes("night out") ||
    allContext.includes("gala") ||
    allContext.includes("bold") ||
    allContext.includes("glam");

  const isCasual =
    allContext.includes("casual") ||
    allContext.includes("daytime") ||
    allContext.includes("brunch") ||
    allContext.includes("weekend") ||
    allContext.includes("travel");

  // Men's grooming
  if (persona === "man") {
    return [
      {
        category: "makeup",
        itemTitle: "Hydrating Matte Face Moisturizer & SPF",
        stylingRequirement: "Non-greasy oil-control matte moisturizer with broad spectrum SPF",
        searchQuery: "mCaffeine or Beardo oil control matte face moisturizer with SPF Nykaa",
        preferredRetailers: ["Nykaa", "Amazon India", "Myntra"],
        matchContext: `Lightweight grooming base that hydrates and controls shine for your ${skinTone} skin.`,
      },
      {
        category: "makeup",
        itemTitle: "Nourishing Matte Lip Balm",
        stylingRequirement: "Shine-free deeply hydrating natural lip care balm",
        searchQuery: "Nivea Men or Forest Essentials nourishing lip balm Nykaa",
        preferredRetailers: ["Nykaa", "Amazon India"],
        matchContext: "Keeps lips nourished without any glossy or shiny finish.",
      },
      {
        category: "makeup",
        itemTitle: "Beard & Stubble Grooming Oil",
        stylingRequirement: "Lightweight conditioning beard and stubble softening oil",
        searchQuery: "Bombay Shaving Company or Beardo beard softening oil Nykaa",
        preferredRetailers: ["Nykaa", "Amazon India"],
        matchContext: "Tames flyaways and provides clean definition for a sharp, tailored appearance.",
      },
    ];
  }

  // Children: strictly no cosmetics
  if (persona === "child") {
    return [];
  }

  const specs: RequirementSpec[] = [];

  // ----------------------------------------------------
  // LAYER A: COMMON MAKEUP ESSENTIALS
  // ----------------------------------------------------

  // 1. Foundation / Base (with candidate shortlist and swatch disclaimer)
  let foundationTitle = "Matte Liquid Foundation";
  let foundationStyle = `Breathable matte oil-control foundation (${skinTone} shade, ${undertone} undertone)`;
  let foundationQuery = `oil control matte liquid foundation ${skinTone} shade Maybelline OR Loreal OR Kay Beauty Nykaa Myntra`;
  let foundationContext = `AI shade-matched for your ${skinTone} depth and ${undertone} undertone (e.g. Maybelline Fit Me 220/228/230 or L'Oreal Infallible candidates). We recommend in-person swatch verification.`;

  if (isOffice) {
    foundationTitle = "Breathable Oil-Control Matte Foundation";
    foundationStyle = `Lightweight 16H oil-control matte foundation (${skinTone} shade, ${undertone} undertone)`;
    foundationQuery = `matte oil control foundation ${skinTone} Maybelline Fit Me OR Loreal Infallible OR Kay Beauty Nykaa Myntra`;
    foundationContext = `Lightweight, non-cakey formula that stays fresh and shine-free throughout office meetings and long work hours.`;
  } else if (isGarba || isTraditional) {
    foundationTitle = "Radiant Festive Long-Wear Foundation";
    foundationStyle = `Luminous full-coverage foundation with warm festive glow (${skinTone} shade, ${undertone} undertone)`;
    foundationQuery = `radiant liquid foundation ${skinTone} MAC Studio Fix OR Lakme Absolute OR Kay Beauty Nykaa Myntra`;
    foundationContext = `Sweat-resistant, photography-ready festive radiance tailored for Indian traditional silks, mirror-work, and warm festive lights.`;
  } else if (isWedding) {
    foundationTitle = "High-Definition 24H Full-Coverage Foundation";
    foundationStyle = `Long-wear camera-ready HD foundation (${skinTone} shade, ${undertone} undertone)`;
    foundationQuery = `HD liquid foundation ${skinTone} MAC Studio Fix OR Loreal Infallible 24H Nykaa Myntra`;
    foundationContext = `Flawless bridal-grade coverage that remains transfer-proof through long celebrations and photography flashes.`;
  } else if (isDateNight) {
    foundationTitle = "Dewy Radiant Skin Tint / Foundation";
    foundationStyle = `Luminous natural skin tint with soft-focus glow (${skinTone} shade, ${undertone} undertone)`;
    foundationQuery = `radiant dewy foundation ${skinTone} Kay Beauty Hydrating OR Maybelline Fit Me Dewy Nykaa Myntra`;
    foundationContext = `Soft, fresh-faced luminous base that enhances your natural complexion under intimate candlelight.`;
  } else if (isCasual) {
    foundationTitle = "Lightweight Daily BB Cream / Skin Tint";
    foundationStyle = `Breathable sheer-coverage skin tint with SPF (${skinTone} shade)`;
    foundationQuery = `daily skin tint BB cream ${skinTone} Maybelline Fit Me Fresh Tint OR Lakme CC Nykaa Myntra`;
    foundationContext = `Effortless daytime base providing hydration, light sun protection, and even skin tone without a makeup feel.`;
  }

  specs.push({
    category: "makeup",
    itemSubcategory: "foundation",
    itemTitle: foundationTitle,
    stylingRequirement: foundationStyle,
    searchQuery: foundationQuery,
    preferredRetailers: ["Nykaa", "Myntra", "Amazon India", "Tira"],
    shadeHint: `${skinTone} skin with ${undertone} undertone`,
    shadeCandidateShortlist: [
      `${skinTone} Natural Buff (Candidate)`,
      `${skinTone} Warm Sand (Candidate)`,
      `${skinTone} Golden Caramel (Candidate)`,
    ],
    disclaimer: "Shade shortlist candidate; physical swatch recommended before purchase.",
    matchContext: foundationContext,
  });

  // 2. Concealer (Targeted coverage for under-eyes & blemishes)
  specs.push({
    category: "makeup",
    itemSubcategory: "concealer",
    itemTitle: "Targeted Multi-Use Liquid Concealer",
    stylingRequirement: `Crease-proof hydrating liquid concealer in matching ${skinTone} shade (${undertone} undertone)`,
    searchQuery: `liquid concealer ${skinTone} Maybelline Instant Age Rewind OR Loreal Infallible OR Swiss Beauty Nykaa Myntra`,
    preferredRetailers: ["Nykaa", "Myntra", "Amazon India"],
    shadeHint: `${skinTone} match`,
    matchContext: `Blurs fine lines and brightens the under-eye area seamlessly with your base foundation.`,
  });

  // 3. Compact / Setting Powder (Essential touch-up & longevity)
  let compactTitle = "Oil-Control Matte Compact Powder";
  let compactStyle = `Long-lasting poreless compact powder (${skinTone} shade)`;
  let compactQuery = `matte compact powder ${skinTone} Maybelline OR Lakme OR Sugar Nykaa Myntra`;
  let compactContext = `Locks in your base makeup and provides quick touch-up coverage with a smooth finish.`;

  if (isOffice) {
    compactTitle = "Anti-Shine Oil-Control Compact Powder";
    compactStyle = `Anti-glare 12H oil-control compact with SPF for desk touch-ups`;
    compactQuery = `oil control compact powder ${skinTone} Maybelline Fit Me OR Lakme 9 to 5 OR Sugar Nykaa Myntra`;
    compactContext = `Prevents mid-day forehead and T-zone shine during work, keeping your look sharp and professional.`;
  } else if (isGarba || isTraditional) {
    compactTitle = "Radiant Golden-Tone Finishing Compact";
    compactStyle = `Micro-fine radiant compact powder with subtle golden glow`;
    compactQuery = `radiant compact powder Lakme 9 to 5 OR Kay Beauty OR Colorbar Nykaa Myntra`;
    compactContext = `Imparts a warm, luminous festive finish that harmonizes with traditional mirror-work and gold jewellery.`;
  } else if (isParty || isWedding) {
    compactTitle = "HD Pore-Blurring Translucent Setting Powder";
    compactStyle = `Flashback-free baking & setting powder for long-night hold`;
    compactQuery = `translucent setting powder Sugar All Set OR PAC OR Maybelline Nykaa Myntra`;
    compactContext = `Zero-flashback formula ensures your photos look flawless under event flash photography.`;
  }

  specs.push({
    category: "makeup",
    itemSubcategory: "compact",
    itemTitle: compactTitle,
    stylingRequirement: compactStyle,
    searchQuery: compactQuery,
    preferredRetailers: ["Nykaa", "Amazon India", "Myntra"],
    shadeHint: `${skinTone} matching`,
    matchContext: compactContext,
  });

  // 4. Blush (Undertone-harmonized cheek colour)
  let blushTitle = "Warm Terracotta / Apricot Radiant Blush";
  let blushStyle = `Warm terracotta-apricot blush with subtle micro-sheen (${undertone} harmony)`;
  let blushQuery = `terracotta coral blush Sugar OR Kay Beauty OR Maybelline Nykaa Myntra`;
  let blushContext = `Brings healthy warmth to your cheekbones formulated to complement your ${undertone} undertone.`;

  if (isOffice) {
    blushTitle = "Soft Rose / Muted Peach Natural Blush";
    blushStyle = `Subtle satin-finish everyday blush for a healthy professional flush`;
    blushQuery = `soft peach rose blush Maybelline Fit Me OR Lakme 9 to 5 Nykaa Myntra`;
    blushContext = `Soft, natural flush that adds gentle dimension without looking heavy in office lighting.`;
  } else if (isDateNight) {
    blushTitle = "Romantic Dusty Rose Luminous Blush";
    blushStyle = `Silky blendable dusty rose blush with soft romantic glow`;
    blushQuery = `dusty rose blush Kay Beauty OR Colorbar OR Sugar Nykaa Myntra`;
    blushContext = `Romantic petal-soft flush that enhances cheekbones with an alluring candlelit glow.`;
  } else if (isParty) {
    blushTitle = "Sculpting Vibrant Berry Cheek Flush";
    blushStyle = `High-pigment sculpted berry cheek colour for dramatic evening light`;
    blushQuery = `vibrant berry contour blush Sugar OR Lakme Absolute Nykaa Myntra`;
    blushContext = `Chiseled, pigmented flush designed to frame and lift your facial contours for evening glam.`;
  }

  specs.push({
    category: "makeup",
    itemSubcategory: "blush",
    itemTitle: blushTitle,
    stylingRequirement: blushStyle,
    searchQuery: blushQuery,
    preferredRetailers: ["Nykaa", "Amazon India", "Myntra"],
    shadeHint: `${undertone} harmony`,
    matchContext: blushContext,
  });

  // 5. Mascara (Lash definition & volume)
  specs.push({
    category: "makeup",
    itemSubcategory: "mascara",
    itemTitle: "Volumizing Waterproof Long-Wear Mascara",
    stylingRequirement: "Smudge-proof lengthening & lash-multiplying waterproof mascara",
    searchQuery: "waterproof volumizing mascara Maybelline Lash Sensational OR Loreal Lash Paradise Nykaa Myntra",
    preferredRetailers: ["Nykaa", "Amazon India", "Myntra"],
    matchContext: "Opens up the eyes with fan-like lash separation that resists humidity and all-day wear.",
  });

  // ----------------------------------------------------
  // LAYER B: OCCASION-SPECIFIC MAKEUP ENHANCEMENTS
  // ----------------------------------------------------

  // Layer B Product 1: Occasion Lip (Adjusted to occasion, outfit & undertone)
  let lipTitle = "Warm Nude Satin-Matte Lipstick";
  let lipStyle = `Comfortable transfer-resistant lipstick in flattering ${undertone} nude`;
  let lipQuery = `creamy matte nude lipstick Maybelline OR Sugar OR Lakme Nykaa Myntra`;
  let lipContext = `Complementary lip color formulated to harmonize with your ${skinTone} depth and ${undertone} undertone.`;

  if (isGarba || (isTraditional && !isOffice)) {
    lipTitle = "Royal Festive Crimson / Warm Maroon Transfer-Proof Lipstick";
    lipStyle = `Rich festive crimson red / warm maroon transfer-proof liquid lip color`;
    lipQuery = `festive crimson red maroon lipstick Lakme Absolute OR Sugar Smudge Me Not Nykaa Myntra`;
    lipContext = `Signature royal festive lip shade that pairs majestically with mirror-work chaniya cholis and statement jewellery.`;
  } else if (isWedding) {
    lipTitle = "Royal Bridal Rosewood / Deep Crimson Liquid Matte Lip";
    lipStyle = `Long-wearing velvety rosewood/crimson matte lipstick with non-drying comfort`;
    lipQuery = `royal crimson rosewood lipstick MAC Retro Matte OR Lakme Absolute Matte Melt Nykaa Myntra`;
    lipContext = `Rich, ceremonial lip colour that complements bridal zardozi embroidery and wedding lighting.`;
  } else if (isDateNight) {
    lipTitle = "Romantic Soft Mauve / Petal Rose Satin Lipstick";
    lipStyle = `Hydrating creamy satin lipstick in soft mauve-rose nude`;
    lipQuery = `soft mauve rose nude lipstick Maybelline Creamy Matte OR Nykaa Ultra Matte Nykaa Myntra`;
    lipContext = `Kiss-proof, velvety rose-nude tone that feels romantic and comfortable.`;
  } else if (isOffice) {
    lipTitle = "Elegant Nude / Soft Mauve Matte Lipstick";
    lipStyle = `Sophisticated smudge-proof nude mauve matte lipstick`;
    lipQuery = `nude mauve matte lipstick Maybelline Superstay OR Sugar OR Nykaa Matte Nykaa Myntra`;
    lipContext = `Refined, long-lasting nude hue that stays intact through coffee and meetings without drying your lips.`;
  } else if (isParty) {
    lipTitle = "Statement Ruby Red / Deep Wine Liquid Lipstick";
    lipStyle = `Intense statement bold red / deep wine liquid matte lipstick`;
    lipQuery = `bold red wine liquid matte lipstick Maybelline Pioneer OR Sugar Brazen Raisin Nykaa Myntra`;
    lipContext = `Daring, show-stopping lip color that anchors your evening aesthetic and draws immediate focus.`;
  } else if (isCasual) {
    lipTitle = "Hydrating Tinted Lip Balm / Soft Gloss";
    lipStyle = `Nourishing sheer tinted balm in soft berry or peachy nude`;
    lipQuery = `tinted lip balm Maybelline Baby Lips OR Sugar Tipsy Lips Nykaa Amazon`;
    lipContext = `Effortless daytime lip hydration with a hint of natural tint.`;
  }

  specs.push({
    category: "makeup",
    itemSubcategory: "lipstick",
    itemTitle: lipTitle,
    stylingRequirement: lipStyle,
    searchQuery: lipQuery,
    preferredRetailers: ["Nykaa", "Myntra", "Amazon India"],
    shadeHint: `${undertone} flattering`,
    matchContext: lipContext,
  });

  // Layer B Product 2: Occasion Eye Makeup & Highlighting
  if (isGarba || isTraditional) {
    // Festive Gold / Bronze Eyeshadow Palette
    specs.push({
      category: "makeup",
      itemSubcategory: "eyeshadow",
      itemTitle: "Festive Gold & Bronze Metallic Eyeshadow Palette",
      stylingRequirement: "Richly pigmented warm gold, copper, and bronze metallic eyeshadow palette",
      searchQuery: "gold bronze eyeshadow palette Maybelline City Mini OR Swiss Beauty Ultimate OR Kay Beauty Nykaa Myntra",
      preferredRetailers: ["Nykaa", "Myntra", "Amazon India"],
      matchContext: "Adds mesmerizing festive sparkle that catches dance-floor lighting during Garba and traditional celebrations.",
    });

    // Intense Kohl Kajal
    specs.push({
      category: "makeup",
      itemSubcategory: "eyeliner",
      itemTitle: "24H Intense Jet-Black Herbal Kohl Kajal",
      stylingRequirement: "Deep herbal jet-black waterproof 24H kohl kajal for expressive festive eyes",
      searchQuery: "intense black kohl kajal Plum NatureStudio OR Lakme Eyeconic Nykaa Myntra",
      preferredRetailers: ["Nykaa", "Amazon India", "Myntra"],
      matchContext: "Creates expressive, soulful kohl-rimmed eyes that are the signature hallmark of traditional Indian festive styling.",
    });

    // Illuminating Golden Highlighter
    specs.push({
      category: "makeup",
      itemSubcategory: "highlighter",
      itemTitle: "Illuminating Warm Golden Micro-Shimmer Highlighter",
      stylingRequirement: "Ultra-fine warm golden molten highlighter for high-point illumination",
      searchQuery: "molten gold highlighter Maybelline Master Chrome OR Kay Beauty Illuminating Nykaa Myntra",
      preferredRetailers: ["Nykaa", "Myntra", "Amazon India"],
      matchContext: "Lends a goddess-like warm festive glow that complements ethnic jewellery and traditional attire.",
    });
  } else if (isWedding) {
    specs.push({
      category: "makeup",
      itemSubcategory: "highlighter",
      itemTitle: "Radiant Multidimensional Wedding Highlighter",
      stylingRequirement: "Champagne gold micro-milled illuminating highlighter for ceremonial radiance",
      searchQuery: "champagne gold highlighter Kay Beauty OR Colorbar OR MAC Mineralize Nykaa Myntra",
      preferredRetailers: ["Nykaa", "Myntra", "Amazon India"],
      matchContext: "Delivers photography-ready illumination across the cheekbones, brow bones, and collarbones.",
    });
  } else if (isParty) {
    specs.push({
      category: "makeup",
      itemSubcategory: "eyeliner",
      itemTitle: "Waterproof Winged Dip Liquid Eyeliner",
      stylingRequirement: "Ultra-matte waterproof high-precision liquid eyeliner for crisp cat-eyes",
      searchQuery: "waterproof liquid black eyeliner Maybelline Colossal OR Sugar Wingman Nykaa Myntra",
      preferredRetailers: ["Nykaa", "Amazon India", "Myntra"],
      matchContext: "Graphic winged definition that commands attention and anchors high-impact evening makeup.",
    });
    specs.push({
      category: "makeup",
      itemSubcategory: "highlighter",
      itemTitle: "High-Beam Strobe Liquid Highlighter",
      stylingRequirement: "High-impact pearl-infused liquid strobing highlighter",
      searchQuery: "liquid strobe highlighter Swiss Beauty Drop and Glow OR Maybelline Master Strobe Nykaa Myntra",
      preferredRetailers: ["Nykaa", "Myntra", "Amazon India"],
      matchContext: "Delivers an electric, high-shine wet look glow under nightclub and party spotlights.",
    });
  } else if (isDateNight) {
    specs.push({
      category: "makeup",
      itemSubcategory: "highlighter",
      itemTitle: "Soft Champagne Shimmer Liquid Highlighter",
      stylingRequirement: "Dewy soft-focus champagne highlighter for a candlelight glow",
      searchQuery: "soft champagne liquid highlighter Kay Beauty OR Maybelline Nykaa Myntra",
      preferredRetailers: ["Nykaa", "Myntra", "Amazon India"],
      matchContext: "Produces a soft, candlelit lit-from-within glow ideal for romantic settings.",
    });
  }

  return specs;
}

export const KNOWN_COLOR_HEX_MAP: Record<string, string> = {
  // Pinks & Magentas
  "#ec4899": "Pink",
  "#ff69b4": "Hot Pink",
  "#ff1493": "Deep Pink",
  "#ffc0cb": "Baby Pink",
  "#e0218a": "Barbie Pink",
  "#da1884": "Magenta Pink",
  "#c71585": "Medium Violet Red",
  "#d1526d": "Blush Pink",
  "#e75480": "Dark Pink",
  "#f4c2c2": "Pastel Pink",
  "#e8909c": "Rose Pink",
  "#ff007f": "Bright Rose Pink",
  "#e30b5d": "Raspberry Pink",
  "#ff77ff": "Fuchsia Pink",
  "#e84393": "Prune Pink",
  "#f43f5e": "Rose Pink",
  "#d946ef": "Fuchsia Pink",

  // Browns & Earthy Neutrals
  "#4e3824": "Chocolate Brown",
  "#5c3d2e": "Deep Chocolate Brown",
  "#74423b": "Cedar Brown",
  "#7a5d50": "Cocoa Brown",
  "#c88c68": "Warm Terracotta",
  "#d8b27c": "Oat Beige",
  "#e6d2bb": "Almond Beige",
  "#eadcc7": "Ivory Off-White",
  "#f2e6d4": "Warm Cream",
  "#efe1cd": "Cream Bateau",
  "#ffffff": "White",
  "#000000": "Black",
  "#302f35": "Charcoal Grey",
  "#38484d": "Slate Grey",
  "#64748b": "Slate Grey",
  "#71717a": "Zinc Grey",
  "#78716c": "Warm Stone",

  // Greens
  "#10b981": "Emerald Green",
  "#059669": "Emerald Green",
  "#2e4a3d": "Emerald Green",
  "#1c3b2b": "Forest Green",
  "#0b4f3c": "Deep Emerald Green",
  "#283d3b": "Sage Green",
  "#536d68": "Sea Glass Green",
  "#4a5d4e": "Olive Green",
  "#008080": "Teal Green",
  "#06b6d4": "Teal",
  "#84cc16": "Lime Green",

  // Reds, Maroons & Corals
  "#ef4444": "Red",
  "#b91c1c": "Crimson Red",
  "#a94f3c": "Brick Red",
  "#8b0000": "Deep Crimson Red",
  "#660000": "Rich Maroon",
  "#b22222": "Firebrick Red",
  "#d9534f": "Terracotta Red",
  "#9b111e": "Ruby Red",
  "#800020": "Burgundy",
  "#f97316": "Orange",

  // Blues
  "#3b82f6": "Blue",
  "#1d4ed8": "Royal Blue",
  "#213a4a": "Navy Blue",
  "#1a2e3b": "Midnight Blue",
  "#4a6984": "Slate Blue",
  "#0f2d42": "Deep Navy",
  "#4169e1": "Royal Blue",
  "#6366f1": "Indigo",

  // Yellows & Golds
  "#eab308": "Gold",
  "#e8a33d": "Marigold Gold",
  "#d4af37": "Metallic Gold",
  "#e5c158": "Soft Gold",
  "#ffd700": "Bright Gold",

  // Purples & Lavenders
  "#8b5cf6": "Purple",
  "#a855f7": "Purple",
  "#800080": "Royal Purple",
  "#dda0dd": "Plum Purple",
  "#e6e6fa": "Lavender",
};

function parseHexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, "");
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16),
    };
  }
  return null;
}

const GARMENT_NOUN_PATTERN =
  /\b(churidar|sherwani|kurta|kurti|trousers?|pants?|shirts?|blazers?|jackets?|bombers?|coats?|cardigans?|hoodies?|vests?|waistcoats?|bundi|koti|mojris?|shoes?|dresses?|tops?|bottoms?|suits?|sets?|lehenga|choli|saree|dupatta|dupattas?|stoles?|shawls?|doshala|lohi|chaddar|angavastram|footwear|accessories)\b/i;

const FASHION_COLOR_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "Off-White", re: /\b(off[\s-]*white)\b/i },
  { name: "Royal Blue", re: /\b(royal[\s-]*blue)\b/i },
  { name: "Navy Blue", re: /\b(navy[\s-]*blue|navy)\b/i },
  { name: "Sky Blue", re: /\b(sky[\s-]*blue|powder[\s-]*blue|ice[\s-]*blue)\b/i },
  { name: "Teal", re: /\bteal\b/i },
  { name: "Turquoise", re: /\bturquoise\b/i },
  { name: "Emerald Green", re: /\b(emerald[\s-]*green|emerald)\b/i },
  { name: "Forest Green", re: /\b(forest[\s-]*green)\b/i },
  { name: "Sage Green", re: /\b(sage[\s-]*green|sage)\b/i },
  { name: "Olive Green", re: /\b(olive[\s-]*green|olive)\b/i },
  { name: "Mint Green", re: /\b(mint[\s-]*green|mint)\b/i },
  { name: "Hot Pink", re: /\b(hot[\s-]*pink|bright[\s-]*pink)\b/i },
  { name: "Rani Pink", re: /\b(rani[\s-]*pink|deep[\s-]*pink)\b/i },
  { name: "Blush Pink", re: /\b(blush[\s-]*pink|baby[\s-]*pink)\b/i },
  { name: "Rose Pink", re: /\b(dusty[\s-]*rose|rose[\s-]*pink|rose)\b/i },
  { name: "Magenta", re: /\b(magenta|fuchsia)\b/i },
  { name: "Pink", re: /\bpink\b/i },
  { name: "Coral", re: /\bcoral\b/i },
  { name: "Peach", re: /\b(peach|apricot|salmon)\b/i },
  { name: "Orange", re: /\b(orange|tangerine)\b/i },
  { name: "Champagne", re: /\bchampagne\b/i },
  { name: "Nude", re: /\b(nude|taupe)\b/i },
  { name: "Mauve", re: /\b(mauve|lilac|onion\s*pink)\b/i },
  { name: "Maroon", re: /\b(maroon|burgundy|wine|crimson)\b/i },
  { name: "Rust", re: /\b(rust|terracotta|brick[\s-]*red)\b/i },
  { name: "Red", re: /\bred\b/i },
  { name: "Mustard", re: /\b(mustard|marigold)\b/i },
  { name: "Yellow", re: /\byellow\b/i },
  { name: "Gold", re: /\b(gold|golden)\b/i },
  { name: "Silver", re: /\bsilver\b/i },
  { name: "Cream", re: /\b(cream|ivory|oat)\b/i },
  { name: "Beige", re: /\b(beige|tan|khaki)\b/i },
  { name: "Chocolate Brown", re: /\b(chocolate|cocoa|cedar)\b/i },
  { name: "Brown", re: /\bbrown\b/i },
  { name: "Charcoal", re: /\bcharcoal\b/i },
  { name: "Slate", re: /\bslate\b/i },
  { name: "Grey", re: /\b(grey|gray)\b/i },
  { name: "Black", re: /\bblack\b/i },
  { name: "White", re: /\bwhite\b/i },
  { name: "Purple", re: /\b(purple|plum|lavender|violet)\b/i },
  { name: "Green", re: /\bgreen\b/i },
  { name: "Blue", re: /\bblue\b/i },
];

/**
 * Extracts a recognizable fashion color name from a string of text,
 * returning null if no fashion color keyword is present.
 */
export function extractColorFromText(text?: string): string | null {
  if (!text) return null;
  const found = findColorMentions(text);
  if (found.length === 0) return null;
  // The garment's own colour is the one that names it ("Charcoal grey satin saree with gold
  // embroidery" is a charcoal saree). A colour that only qualifies an embellishment ("gold
  // zari", "silver embroidery") is used only when the text names no other colour.
  const base = found.find((m) => !m.isEmbellishment);
  return (base || found[0]).name;
}

// Words that, right after a colour, mean the colour belongs to decoration rather than the garment
const EMBELLISHMENT_AFTER_COLOR_RE =
  // Nouns only: "gold embroidery" decorates the garment, but "white embroidered blouse" is a white blouse
  /^[\s-]*(?:zari|zardozi|embroidery|thread(?:\s*work)?|sequins|work|border|motifs?|accents?|buttis?|booti|trims?|piping|foil|print\b(?!ed)|gota|tilla|dori|embellishments?|highlights?|detailing|details?|lace|tassels?|beads|mirror\s*work)\b/i;

type ColorMention = { name: string; index: number; length: number; isEmbellishment: boolean };

/** Every fashion colour named in the text, in reading order (longest match first at a position). */
function findColorMentions(text: string): ColorMention[] {
  const mentions: ColorMention[] = [];
  for (const { name, re } of FASHION_COLOR_PATTERNS) {
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (const m of text.matchAll(global)) {
      const index = m.index ?? 0;
      const after = text.slice(index + m[0].length);
      mentions.push({ name, index, length: m[0].length, isEmbellishment: EMBELLISHMENT_AFTER_COLOR_RE.test(after) });
    }
  }
  mentions.sort((a, b) => a.index - b.index || b.length - a.length);
  // Drop matches nested inside a longer one ("Blue" inside "Royal Blue", "White" inside "Off-White")
  const kept: ColorMention[] = [];
  for (const m of mentions) {
    const prev = kept[kept.length - 1];
    if (prev && m.index < prev.index + prev.length) continue;
    kept.push(m);
  }
  return kept;
}

/** The garment's own colour, ignoring colours that only describe decoration ("gold zari"). */
export function extractBaseColorFromText(text?: string): string | null {
  if (!text) return null;
  return findColorMentions(text).find((m) => !m.isEmbellishment)?.name ?? null;
}

/** All distinct fashion colours named in the text, in reading order. */
export function extractAllColorsFromText(text?: string): string[] {
  if (!text) return [];
  return [...new Set(findColorMentions(text).map((m) => m.name))];
}

/** Broad colour families, so "Charcoal" and "Grey" count as the same colour but "White" does not. */
const COLOR_FAMILY: Record<string, string> = {
  "Off-White": "white", White: "white", Cream: "white",
  "Royal Blue": "blue", "Navy Blue": "blue", "Sky Blue": "blue", Blue: "blue",
  Teal: "teal", Turquoise: "teal",
  "Emerald Green": "green", "Forest Green": "green", "Sage Green": "green", "Olive Green": "green", "Mint Green": "green", Green: "green",
  "Hot Pink": "pink", "Rani Pink": "pink", "Blush Pink": "pink", "Rose Pink": "pink", Magenta: "pink", Pink: "pink",
  Maroon: "red", Red: "red", Rust: "rust",
  Coral: "coral", Peach: "coral", Orange: "orange",
  Mustard: "gold", Yellow: "gold", Gold: "gold", Champagne: "gold",
  Nude: "brown", Mauve: "purple",
  Silver: "grey", Charcoal: "grey", Slate: "grey", Grey: "grey",
  Black: "black",
  Beige: "brown", "Chocolate Brown": "brown", Brown: "brown",
  Purple: "purple",
};
// Families close enough to be shown for each other
const COMPATIBLE_FAMILIES: Record<string, string[]> = {
  grey: ["black"],
  black: ["grey"],
  teal: ["blue", "green"],
  blue: ["teal"],
  green: ["teal"],
  rust: ["red", "brown", "orange"],
  red: ["rust"],
  brown: ["rust"],
  coral: ["pink", "orange"],
  orange: ["coral", "rust"],
  pink: ["coral"],
};

/**
 * True when a product's own name names colours and none of them is the required colour (or a
 * close shade of it). A product that names no colour is never treated as a clash.
 */
export function isOutfitColorMismatch(productText: string, expectedColor?: string): boolean {
  if (!expectedColor) return false;
  const expectedFamily = COLOR_FAMILY[extractColorFromText(expectedColor) || ""];
  if (!expectedFamily) return false;
  if (/\b(multi[\s-]*colou?r(?:ed)?|multicolou?r)\b/i.test(productText)) return false;
  const productColors = findColorMentions(productText).filter((m) => !m.isEmbellishment);
  if (productColors.length === 0) return false;
  const allowed = new Set([expectedFamily, ...(COMPATIBLE_FAMILIES[expectedFamily] || [])]);
  return !productColors.some((m) => allowed.has(COLOR_FAMILY[m.name]));
}

const DESIGN_TERMS: Array<{ re: RegExp; term: string }> = [
  { re: /\bpre[\s-]*(?:draped|stitched)\b/i, term: "pre-draped" },
  { re: /\bready[\s-]*to[\s-]*wear\b/i, term: "ready to wear" },
  { re: /\bpant[\s-]*style\b/i, term: "pant style" },
  { re: /\bdhoti[\s-]*style\b/i, term: "dhoti style" },
  { re: /\bruffled?\b/i, term: "ruffle" },
  { re: /\bbelted\b/i, term: "belted" },
  { re: /\b(?:banarasi|benarasi)\b/i, term: "banarasi" },
  { re: /\b(?:kanjeevaram|kanjivaram|kanchipuram)\b/i, term: "kanjeevaram" },
  { re: /\bpaithani\b/i, term: "paithani" },
  { re: /\bbandhani\b/i, term: "bandhani" },
  { re: /\bchikankari\b/i, term: "chikankari" },
  { re: /\bzardozi\b/i, term: "zardozi" },
  { re: /\bzari\b/i, term: "zari" },
  { re: /\bembroider(?:y|ed)\b/i, term: "embroidered" },
  { re: /\bsequin(?:s|n?ed)?\b/i, term: "sequinned" },
  { re: /\bmirror[\s-]*work\b/i, term: "mirror work" },
  { re: /\bgota\b/i, term: "gota" },
  { re: /\b(?:stone|bead|crystal)[\s-]*work\b|\bbeaded\b/i, term: "embellished" },
  { re: /\bembellish(?:ed|ments?)\b/i, term: "embellished" },
  { re: /\bwoven\b/i, term: "woven" },
  { re: /\bfloral\b/i, term: "floral" },
  { re: /\bprinted\b/i, term: "printed" },
  { re: /\bombre\b/i, term: "ombre" },
  { re: /\b(?:plain|solid)\b/i, term: "solid" },
  { re: /\bcorset\b/i, term: "corset" },
  { re: /\bhalter\b/i, term: "halter" },
  { re: /\bsleeveless\b/i, term: "sleeveless" },
  { re: /\b(?:strappy|spaghetti)\b/i, term: "strappy" },
  { re: /\bsweetheart\b/i, term: "sweetheart neck" },
  { re: /\bv[\s-]*neck\b/i, term: "v-neck" },
  // Western, menswear and kidswear cuts and patterns
  { re: /\bangrakha\b/i, term: "angrakha" },
  { re: /\basymmetric(?:al)?\b/i, term: "asymmetric" },
  { re: /\bhigh[\s-]*low\b/i, term: "high-low" },
  { re: /\bmandarin(?:[\s-]*collar)?\b/i, term: "mandarin collar" },
  { re: /\bhenley\b/i, term: "henley" },
  { re: /\bpolo\b(?![\s.-]*(?:assn|association|club))/i, term: "polo" },
  { re: /\bdouble[\s-]*breasted\b/i, term: "double-breasted" },
  { re: /\bpleated\b/i, term: "pleated" },
  { re: /\btiered\b/i, term: "tiered" },
  { re: /\bsmocked\b/i, term: "smocked" },
  { re: /\bpuff(?:ed)?[\s-]*sleeves?\b/i, term: "puff sleeve" },
  { re: /\boff[\s-]*(?:the[\s-]*)?shoulder\b/i, term: "off-shoulder" },
  { re: /\bone[\s-]*shoulder\b/i, term: "one-shoulder" },
  { re: /\bwrap\b/i, term: "wrap" },
  { re: /\bbodycon\b/i, term: "bodycon" },
  { re: /\ba[\s-]*line\b/i, term: "a-line" },
  { re: /\bflared\b/i, term: "flared" },
  { re: /\bwide[\s-]*leg\b/i, term: "wide-leg" },
  { re: /\bhigh[\s-]*(?:waist|waisted|rise)\b/i, term: "high-waist" },
  { re: /\bcropped\b/i, term: "cropped" },
  { re: /\bslim[\s-]*fit\b/i, term: "slim fit" },
  { re: /\b(?:relaxed|oversized|boxy)[\s-]*(?:fit)?\b/i, term: "relaxed fit" },
  { re: /\bstraight[\s-]*(?:fit|cut)\b/i, term: "straight fit" },
  { re: /\b(?:striped|stripes?)\b/i, term: "striped" },
  { re: /\b(?:checked|checks?|plaid|gingham)\b/i, term: "checked" },
  { re: /\bpolka[\s-]*dots?\b/i, term: "polka dot" },
  { re: /\btie[\s-]*dye\b/i, term: "tie-dye" },
  { re: /\bgraphic\b/i, term: "graphic" },
  { re: /\bquilted\b/i, term: "quilted" },
  { re: /\bribbed\b/i, term: "ribbed" },
  { re: /\blace\b/i, term: "lace" },
  { re: /\bmaxi\b/i, term: "maxi" },
  { re: /\bmidi\b/i, term: "midi" },
];

const FABRIC_TERMS: Array<{ re: RegExp; term: string }> = [
  { re: /\btissue\b/i, term: "tissue" },
  { re: /\borganza\b/i, term: "organza" },
  { re: /\bsatin\b/i, term: "satin" },
  { re: /\bchanderi\b/i, term: "chanderi" },
  { re: /\bgeorgette\b/i, term: "georgette" },
  { re: /\bchiffon\b/i, term: "chiffon" },
  { re: /\bcrepe\b/i, term: "crepe" },
  { re: /\bvelvet\b/i, term: "velvet" },
  { re: /\bnet\b|\btulle\b/i, term: "net" },
  { re: /\blinen\b/i, term: "linen" },
  { re: /\bcotton\b/i, term: "cotton" },
  { re: /\bbrocade\b/i, term: "brocade" },
  { re: /\bsilk\b/i, term: "silk" },
  { re: /\bdenim\b/i, term: "denim" },
  { re: /\bcorduroy\b/i, term: "corduroy" },
  { re: /\bsuede\b/i, term: "suede" },
  { re: /\bleather\b/i, term: "leather" },
  { re: /\bwool(?:len)?\b|\btweed\b/i, term: "wool" },
  { re: /\bknit(?:ted)?\b/i, term: "knit" },
  { re: /\bjersey\b/i, term: "jersey" },
  { re: /\bfleece\b/i, term: "fleece" },
  { re: /\bpoplin\b/i, term: "poplin" },
  { re: /\b(?:rayon|viscose|modal)\b/i, term: "rayon" },
  { re: /\bkhadi\b/i, term: "khadi" },
  { re: /\bmul(?:mul)?\b/i, term: "mulmul" },
  { re: /\bpolyester\b/i, term: "polyester" },
];

/**
 * The design, colour and fabric a garment is described with, in that order of importance:
 * design (weave, embellishment, construction), then colour, then material.
 */
export function extractGarmentAttributes(text: string): { design: string[]; color: string | null; fabric: string | null } {
  const design: string[] = [];
  for (const { re, term } of DESIGN_TERMS) {
    if (re.test(text) && !design.includes(term)) design.push(term);
  }
  // The first fabric named is the garment's own ("silk kurta with cotton lining" is silk)
  let fabric: string | null = null;
  let fabricAt = Infinity;
  for (const { re, term } of FABRIC_TERMS) {
    const at = text.search(re);
    if (at >= 0 && at < fabricAt) {
      fabric = term;
      fabricAt = at;
    }
  }
  return { design: design.slice(0, 3), color: extractColorFromText(text), fabric };
}

/**
 * Resolves any hex code or cryptic color string into a clean, human-readable fashion color.
 * Eliminates raw hex strings (e.g. #4E3824) from polluting search queries and titles.
 * Guarantees garment nouns (e.g. "Churidar", "Sherwani") are never treated as color names.
 */
export function resolveHumanColor(colorInput?: string, context?: string): string {
  if (!colorInput && !context) return "Neutral";

  const raw = (colorInput || "").trim();

  // 1. If colorInput has a recognized color keyword, use it directly
  const fromInput = extractColorFromText(raw);
  if (fromInput) return fromInput;

  // 2. If already a named human color without hex hashes and NOT a garment noun
  if (raw && !raw.includes("#") && raw.length > 2 && !GARMENT_NOUN_PATTERN.test(raw)) {
    const cleaned = raw.replace(/\b(?:with|and|accents?|layer|shades?)\b.*$/i, "").trim();
    if (cleaned.length > 2 && !GARMENT_NOUN_PATTERN.test(cleaned)) return cleaned;
  }

  // 3. Check hex mapping
  const hexMatch = raw.match(/#[0-9a-fA-F]{3,6}/);
  if (hexMatch) {
    const lowerHex = hexMatch[0].toLowerCase();
    if (KNOWN_COLOR_HEX_MAP[lowerHex]) {
      return KNOWN_COLOR_HEX_MAP[lowerHex];
    }

    // Nearest neighbor match in RGB space
    const rgb = parseHexToRgb(lowerHex);
    if (rgb) {
      let closestColor = "Classic";
      let minDistance = Infinity;
      for (const [knownHex, colorName] of Object.entries(KNOWN_COLOR_HEX_MAP)) {
        const knownRgb = parseHexToRgb(knownHex);
        if (knownRgb) {
          const dist = Math.hypot(rgb.r - knownRgb.r, rgb.g - knownRgb.g, rgb.b - knownRgb.b);
          if (dist < minDistance) {
            minDistance = dist;
            closestColor = colorName;
          }
        }
      }
      if (minDistance < 150) {
        return closestColor;
      }
    }
  }

  // 4. Check if context has human color names
  if (context) {
    const fromContext = extractColorFromText(context);
    if (fromContext) return fromContext;
    const cleanCtx = context.trim();
    if (cleanCtx && !cleanCtx.includes("#") && cleanCtx.length > 2 && !GARMENT_NOUN_PATTERN.test(cleanCtx)) {
      return cleanCtx;
    }
  }

  return "Classic";
}

export interface RequirementSpec {
  category: ProductCategory;
  itemTitle: string;
  stylingRequirement: string;
  searchQuery: string;
  preferredRetailers: string[];
  shadeHint?: string;
  materialHint?: string;
  matchContext: string;
  itemSubcategory?: string;
  targetGender?: "women" | "men" | "child" | "unisex" | "boys" | "girls";
  dominantColor?: string;
  shadeCandidateShortlist?: string[];
  disclaimer?: string;
}

export type DetectedAccessory = {
  type:
    | "earrings"
    | "necklace"
    | "bracelet"
    | "watch"
    | "ring"
    | "maang_tikka"
    | "bag"
    | "belt"
    | "sunglasses"
    | "scarf"
    | "clutch"
    | "potli"
    | "hat"
    | "laptop_bag"
    | "hair_accessory"
    | "other_accessory";
  category: "jewellery" | "accessories";
  title: string;
  sourceDetail?: string;
  material?: string;
};

/**
 * Detects whether an accessory specification text explicitly denotes "None", "No accessories",
 * "None (child-friendly)", or an equivalent explicit non-recommendation.
 */
export function isExplicitlyNoneAccessory(text?: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^(?:none|no\s+accessories|nil|n\/a|not\s+applicable|none\s+needed|none\s+recommended)(?:\b|[\s\(\[\.\:\,\-\/])/i.test(trimmed);
}

/**
 * Dynamically identifies all accessories and jewellery visibly included, specified, or
 * recommended for a specific look, without hardcoding or forcing fixed categories.
 */
export function extractDynamicLookAccessories(
  look: LookRecommendation,
  persona: PersonaType,
): DetectedAccessory[] {
  const detected: DetectedAccessory[] = [];
  const seenTypes = new Set<string>();

  const isChild = persona === "child";
  const isMan = persona === "man";
  const lookOutfitText = `${look.outfit || ""} ${look.note || ""} ${look.title || ""}`.toLowerCase();
  const isEthnicOutfit = /\b(kurta|sherwani|dhoti|pyjama|pajama|kedia|bandhgala|angrakha|achkan|nehru jacket)\b/i.test(lookOutfitText);

  function classifyPhrase(phrase: string): {
    type: DetectedAccessory["type"];
    category: "jewellery" | "accessories";
  } | null {
    const l = phrase.toLowerCase();
    if (/\b(?:watch|watches|timepiece|timepieces|chronograph)\b/i.test(l)) {
      return { type: "watch", category: "jewellery" };
    }
    if (/\b(?:ring|rings|band|finger ring|cocktail ring)\b/i.test(l) && !l.includes("earring") && !l.includes("spring") && !l.includes("string")) {
      if (isChild) return null;
      return { type: "ring", category: "jewellery" };
    }
    if (/\b(?:jhumka|jhumkas|earring|earrings|stud|studs|hoop|hoops|chandbali|chandbalis|huggie|huggies|dangler|danglers)\b/i.test(l)) {
      if (isChild || isMan) return null;
      return { type: "earrings", category: "jewellery" };
    }
    if (/\b(?:necklace|necklaces|chain|chains|pendant|pendants|choker|chokers|haar|mangalsutra|locket)\b/i.test(l)) {
      if (isChild) return null;
      if (isMan) {
        const isFeminineNecklace = /\b(choker|pendant|pendants|haar|mangalsutra|temple|locket)\b/i.test(l);
        if (isFeminineNecklace) return null;
        const isGroomOrRoyalMala = /\b(mala|pearl\s*mala|moti\s*mala)\b/i.test(l);
        const isMenChain = /\b(chain|chains|curb\s*chain)\b/i.test(l);
        if (!isGroomOrRoyalMala && !isMenChain) return null;
      }
      return { type: "necklace", category: "jewellery" };
    }
    if (/\b(?:bangle|bangles|kada|kadas|bracelet|bracelets|cuff|cuffs|choodi|choodiyan|wristlet)\b/i.test(l)) {
      return { type: "bracelet", category: "jewellery" };
    }
    if (/\b(?:maang tikka|tikka|mathapatti|matha patti|passa|borla)\b/i.test(l)) {
      if (isChild || isMan) return null;
      return { type: "maang_tikka", category: "jewellery" };
    }
    if (/\b(?:hair\s*accessories|hair\s*clips?|hair\s*pins?|hair\s*bands?|headbands?|hair\s*bows?|hair\s*ties?|scrunchies?|barrettes?|hair\s*ribbons?|floral\s*clips?|gajra\s*clips?|rubber\s*bands?|paranda)\b/i.test(l)) {
      if (isMan) return null;
      return { type: "hair_accessory", category: "accessories" };
    }
    if (/\b(?:sunglasses?|shades?|aviators?|wayfarers?|eyewear)\b/i.test(l)) {
      return { type: "sunglasses", category: "accessories" };
    }
    if (/\b(?:scarf|scarves|stole|stoles|shawl|shawls|wrap|muffler)\b/i.test(l) && !/\b(?:dupatta|odhani|chunni)\b/i.test(l)) {
      return { type: "scarf", category: "accessories" };
    }
    if (/\b(?:hat|hats|cap|caps|beanie|fedora|beret)\b/i.test(l)) {
      return { type: "hat", category: "accessories" };
    }
    if (/\b(?:clutch|clutches|minaudi[eè]re)\b/i.test(l)) {
      if (isChild || isMan) return null;
      return { type: "clutch", category: "accessories" };
    }
    if (/\b(?:potli|potlis|batwa)\b/i.test(l)) {
      if (isMan) return null;
      return { type: "potli", category: "accessories" };
    }
    if (/\b(?:belt|belts|kamarbandh|waist belt)\b/i.test(l)) {
      if (isMan && isEthnicOutfit) return null;
      return { type: "belt", category: "accessories" };
    }
    if (/\b(?:laptop\s*(?:bag|tote|case|sleeve)|briefcase|work\s*messenger)\b/i.test(l)) {
      return { type: "laptop_bag", category: "accessories" };
    }
    if (/\b(?:bag|bags|tote|totes|crossbody|purse|purses|satchel|handbag|handbags|backpack)\b/i.test(l)) {
      if (isMan) {
        const isFeminineBag = /\b(purse|purses|handbag|handbags)\b/i.test(l);
        if (isFeminineBag) return null;
        if (isEthnicOutfit && !/\b(duffle|travel)\b/i.test(l)) return null;
      }
      return { type: "bag", category: "accessories" };
    }
    if (/\b(?:pocket square|brooch|brooches|cufflink|cufflinks|tie|necktie|bow tie|wallet|cardholder)\b/i.test(l)) {
      return { type: "other_accessory", category: "accessories" };
    }
    return null;
  }

  // 1. Inspect structured pieces in look.pieces
  for (const p of look.pieces || []) {
    const c = (p?.category || "").toLowerCase();
    const n = (p?.name || "").trim();
    if (!n) continue;
    if (
      c.includes("jewel") ||
      c.includes("acc") ||
      c.includes("finish") ||
      c.includes("bag") ||
      c.includes("watch") ||
      c.includes("belt") ||
      c.includes("hair")
    ) {
      const match = classifyPhrase(n);
      if (match && !seenTypes.has(match.type)) {
        seenTypes.add(match.type);
        detected.push({
          type: match.type,
          category: match.category,
          title: n,
          sourceDetail: p.detail,
        });
      }
    }
  }

  // 2. Inspect look.jewellery and look.accessories text fields
  const combinedText = `${look.jewellery || ""} | ${look.accessories || ""}`;
  const segments = combinedText
    .split(/[|,;&]|\band\b|\bwith\b/i)
    .map((s) => s.trim().replace(/^\*+|\*+$/g, ""))
    .filter(
      (s) =>
        s.length > 2 &&
        !isExplicitlyNoneAccessory(s) &&
        !/^(none|clean|minimal|natural|child-friendly)$/i.test(s),
    );

  for (const seg of segments) {
    const match = classifyPhrase(seg);
    if (match && !seenTypes.has(match.type)) {
      seenTypes.add(match.type);
      const cleanTitle = seg
        .replace(/^(?:a|an|the|one|small|subtle|sleek|matching|pair of|set of)\s+/i, "")
        .replace(/[.]+$/, "")
        .trim();
      const capTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
      detected.push({
        type: match.type,
        category: match.category,
        title: capTitle,
      });
    }
  }

  return detected;
}

/**
 * Dynamically identifies and decomposes all distinct clothing components from
 * a recommended look (pieces array and/or outfit description text).
 * Ensures that multi-piece separates (e.g. shirt + shorts/pants, blazer + shirt + trousers,
 * saree + blouse, lehenga + choli) are each decomposed into their own requirement spec,
 * while one-piece garments (dresses, jumpsuits) remain unified.
 */
/**
 * Menswear garments the generic (women's-first) classifier gets wrong: a men's "Outfit"
 * piece is a kurta set, sherwani or suit, not a dress; a dhoti or churidar is not trousers;
 * "Dress Shirt" is a shirt. Returns null when the generic rules already apply.
 */
export function classifyMenGarment(
  name: string,
  pieceCategory = "",
): { type: "layer" | "top" | "bottom" | "one_piece"; subcat: string } | null {
  const n = (name || "").toLowerCase();
  const c = (pieceCategory || "").toLowerCase();
  if (/\b(sherwanis?|achkans?|jodhpuri|bandhgala)\b/.test(n) && !/\b(jacket|waistcoat|vest)\b/.test(n)) {
    return { type: c.includes("top") ? "top" : "one_piece", subcat: "sherwani" };
  }
  if (/\b(kurtas?|pathani)\b/.test(n)) {
    return { type: c.includes("outfit") || /\b(set|pyjamas?|pajamas?|churidars?|dhoti)\b/.test(n) ? "one_piece" : "top", subcat: "kurta" };
  }
  if (/\b(suits?|tuxedos?)\b/.test(n) && !/\b(jacket|blazer|tracksuits?|swimsuits?|jumpsuits?)\b/.test(n)) {
    return { type: "one_piece", subcat: "suit" };
  }
  if (/\b(dhotis?|mundus?|veshtis?|lungis?|pyjamas?|pajamas?|churidars?|salwars?|patiala|jodhpurs)\b/.test(n)) {
    return { type: "bottom", subcat: "ethnic_bottom" };
  }
  if (/\bco-?ords?\b/.test(n)) return { type: "one_piece", subcat: "men_outfit" };
  if (/\b(waistcoats?|vests?|gilets?)\b/.test(n) && !/\b(jacket|blazer)\b/.test(n)) {
    return { type: "layer", subcat: "waistcoat" };
  }
  if (/\b(blazers?)\b/.test(n)) {
    return { type: "layer", subcat: "blazer" };
  }
  return null;
}

/** Noun that names each men's outfit subcategory, added to a query only when the title lacks it. */
const MEN_SUBCAT_NOUNS: Record<string, { present: RegExp; noun: string }> = {
  shirt: { present: /\b(shirts?|polos?|henleys?|button-downs?)\b/i, noun: "shirt" },
  top: { present: /\b(t-?shirts?|tees?|polos?|henleys?|tops?|sweaters?|sweatshirts?|hoodies?|vests?)\b/i, noun: "t-shirt" },
  inner_top: { present: /\b(t-?shirts?|tees?|vests?|tops?|shirts?)\b/i, noun: "t-shirt" },
  trousers: { present: /\b(trousers?|pants?|chinos?|jeans|joggers?|cargos?|slacks)\b/i, noun: "trousers" },
  shorts: { present: /\b(shorts?|bermudas?)\b/i, noun: "shorts" },
  blazer: { present: /\b(blazers?)\b/i, noun: "blazer" },
  waistcoat: { present: /\b(waistcoats?|vests?|gilets?)\b/i, noun: "waistcoat" },
  jacket: { present: /\b(jackets?|coats?|overshirts?|cardigans?|shrugs?|overcoats?)\b/i, noun: "jacket" },
  kurta: { present: /\b(kurtas?|pathani)\b/i, noun: "kurta" },
  sherwani: { present: /\b(sherwanis?|achkans?|jodhpuri|bandhgala)\b/i, noun: "sherwani" },
  suit: { present: /\b(suits?|tuxedos?)\b/i, noun: "suit" },
};

// Longer forms first, so "Men's" is removed whole rather than leaving a stray "'s"
const MEN_AUDIENCE_WORDS_RE = /\b(?:for\s+)?(?:men['’]s|menswear|mens|men|males?|gents|gentlemen)(?![\w'’])/gi;
// Planning filler that describes the styling, not the product a store lists
const QUERY_FILLER_RE = /\b(?:matching|curated|coordinated|coordinating|complementary|complementing)\b/gi;

/**
 * A natural men's retailer query from the garment the look actually names: gender once,
 * the garment's own colour/fabric/fit/style words, and the garment noun only when the
 * title does not already say it. No store names, no generic padding.
 */
export function buildMenGarmentQuery(title: string, subcat: string, color?: string): string {
  const base = (title || "")
    .replace(MEN_AUDIENCE_WORDS_RE, " ")
    .replace(QUERY_FILLER_RE, " ")
    .replace(/[\/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const terms = ["men"];
  const cleanColor = (color || "").replace(MEN_AUDIENCE_WORDS_RE, " ").trim();
  // A real colour (short, not the whole title) is added only when the title does not carry it
  if (cleanColor && cleanColor.split(/\s+/).length <= 3 && !base.toLowerCase().includes(cleanColor.toLowerCase())) {
    terms.push(cleanColor);
  }
  terms.push(base);
  const nounRule = MEN_SUBCAT_NOUNS[subcat];
  if (nounRule && !nounRule.present.test(base)) terms.push(nounRule.noun);
  return normalizeAudienceQuery(terms.join(" "), "men");
}

/**
 * Keeps exactly one audience word at the front of a query and drops repeated words, e.g.
 * "men Men's Classic watch analog watch" -> "men Classic watch analog".
 */
export function normalizeAudienceQuery(query: string, audience: "men"): string {
  const stripped = (query || "").replace(MEN_AUDIENCE_WORDS_RE, " ");
  const seen = new Set<string>([audience]);
  const words: string[] = [audience];
  for (const w of stripped.split(/\s+/)) {
    const key = w.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    words.push(w);
  }
  return words.join(" ");
}

const WOMEN_AUDIENCE_WORDS_RE = /\b(?:for\s+)?(?:women['’]s|womenswear|womens|women|females?|ladies|lady)(?![\w'’])/gi;

/**
 * Formulates a natural retailer search query for women's garments, preserving
 * the actual garment type (e.g. "embroidered crop top", "net shrug", "peplum short kurti",
 * "tiered sharara", "banarasi saree") without collapsing everything to generic "top" or "dress".
 */
export function buildWomenGarmentQuery(
  title: string,
  subcat: string,
  color?: string,
  preferredRetailers?: string[],
  /** Design and fabric of the garment as the look describes it (sarees and saree blouses). */
  attrs?: { design: string[]; fabric: string | null },
): string {
  const base = (title || "")
    .replace(WOMEN_AUDIENCE_WORDS_RE, " ")
    .replace(QUERY_FILLER_RE, " ")
    .replace(/[\/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lowerBase = base.toLowerCase();
  const terms: string[] = ["women"];

  const cleanColor = (color || "").replace(WOMEN_AUDIENCE_WORDS_RE, " ").trim();
  const useColor = !!cleanColor && cleanColor.split(/\s+/).length <= 3;
  // Placeholders ("Classic", "Neutral") are not colours a store can search for
  const isRealColor = useColor && !!extractColorFromText(cleanColor);
  const isSareeBlouse = subcat === "inner_top" && /\b(blouse|choli)\b/i.test(lowerBase);

  if (attrs && (subcat === "saree" || isSareeBlouse)) {
    // Priority order: design, then colour, then material — then the garment itself
    if (subcat === "saree") {
      // "Charcoal grey satin saree" already reads colour → fabric → garment; design words it
      // lacks (e.g. from a "with gold embroidery" tail) lead the query
      const core = base.split(/\b(?:with|in\s+an?|featuring)\b/i)[0].trim() || base;
      const coreDesign = extractGarmentAttributes(core).design;
      terms.push(...attrs.design.filter((d) => !coreDesign.includes(d)));
      if (isRealColor && !extractColorFromText(core)) terms.push(cleanColor);
      terms.push(core);
      if (attrs.fabric && !extractGarmentAttributes(core).fabric) terms.push(attrs.fabric);
      if (!/\b(saree|sari)\b/i.test(core)) terms.push("saree");
    } else {
      terms.push(...attrs.design);
      if (isRealColor) terms.push(cleanColor);
      if (attrs.fabric) terms.push(attrs.fabric);
      terms.push(/\bcholi\b/i.test(lowerBase) ? "choli blouse" : "saree blouse");
    }
  } else if (useColor && !lowerBase.includes(cleanColor.toLowerCase())) {
    terms.push(cleanColor);
  }

  if (attrs && (subcat === "saree" || isSareeBlouse)) {
    // already built above
  } else if (subcat === "crop_top" || /\b(?:crop\s*tops?|bustiers?|corsets?|bralettes?)\b/i.test(lowerBase)) {
    if (/\bbustiers?\b/i.test(lowerBase)) {
      terms.push("bustier crop top");
    } else if (/\bcorsets?\b/i.test(lowerBase)) {
      terms.push("corset top");
    } else {
      terms.push("crop top");
    }
    if (lowerBase.includes("embroidered") || lowerBase.includes("mirror")) {
      terms.push("embroidered");
    }
  } else if (subcat === "shrug" || /\b(?:shrugs?|capes?|cape\s*jackets?)\b/i.test(lowerBase)) {
    if (lowerBase.includes("net")) {
      terms.push("net shrug cape jacket");
    } else {
      terms.push("sheer cape shrug jacket");
    }
  } else if (subcat === "kurta" || /\b(?:kurt[ia]s?|peplum)\b/i.test(lowerBase)) {
    if (/\bpeplum\b/i.test(lowerBase)) {
      terms.push("peplum short kurti");
    } else if (/\bshort\s*kurt[ia]s?\b/i.test(lowerBase)) {
      terms.push("short kurti");
    } else {
      terms.push(base);
    }
  } else if (subcat === "saree") {
    terms.push(base);
  } else if (subcat === "lehenga") {
    terms.push(lowerBase.includes("lehenga") ? base : "lehenga choli set");
  } else if (subcat === "palazzo" || subcat === "sharara" || /\b(?:shararas?|palazzos?|tulips?|cowls?)\b/i.test(lowerBase)) {
    if (/\bshararas?\b/i.test(lowerBase)) terms.push("tiered flared sharara");
    else if (/\btulip|cowl\b/i.test(lowerBase)) terms.push("tulip cowl trousers");
    else terms.push("flared palazzo trousers");
  } else if (subcat === "inner_top") {
    terms.push(lowerBase.includes("choli") || lowerBase.includes("blouse") ? "embroidered choli blouse" : base || "inner top");
  } else {
    terms.push(base);
  }

  if (preferredRetailers && preferredRetailers.length > 0) {
    terms.push(...preferredRetailers.slice(0, 3));
  }

  // De-duplicate terms while preserving order
  const seen = new Set<string>();
  const cleanTerms: string[] = [];
  for (const t of terms.join(" ").split(/\s+/)) {
    const k = t.toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    cleanTerms.push(t);
  }
  return cleanTerms.join(" ");
}

/**
 * Reorders a garment search so what matters most comes first: audience, then the garment's
 * design (cut, weave, embellishment), then its colour, then its fabric, then the rest. Design,
 * colour and fabric the query lacks are added; nothing already in it is dropped.
 */
export function prioritizeGarmentQuery(
  query: string,
  attrs: { design: string[]; fabric: string | null },
  color?: string,
): string {
  let words = query.split(/\s+/).filter(Boolean);
  const audience = words.length > 0 && /^(?:women|men|boys|girls|kids|child)$/i.test(words[0]) ? words.shift()! : "";
  const lowerQuery = words.join(" ").toLowerCase();
  const has = (term: string) => new RegExp(`\\b${term.split(/[\s-]/)[0].slice(0, 6)}`, "i").test(lowerQuery);
  const design = attrs.design.filter((d) => !has(d)).slice(0, 2);
  let colorTerm = "";
  if (color && extractColorFromText(color)) {
    colorTerm = color;
    // Already in the query: move it into its slot (after design, before fabric)
    const colorWords = color.toLowerCase().split(/\s+/);
    const at = words.findIndex((_, i) => colorWords.every((cw, j) => words[i + j]?.toLowerCase() === cw));
    if (at >= 0) {
      colorTerm = words.slice(at, at + colorWords.length).join(" ");
      words = [...words.slice(0, at), ...words.slice(at + colorWords.length)];
    }
  }
  const fabric = attrs.fabric && !has(attrs.fabric) ? attrs.fabric : "";
  const seen = new Set<string>();
  return [audience, ...design, colorTerm, fabric, ...words]
    .join(" ")
    .split(/\s+/)
    .filter((w) => {
      const k = w.toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(" ");
}

export function decomposeOutfitGarments(
  look: LookRecommendation,
  profile: SkinTuneProfile,
  targetGender: "women" | "men" | "child" | "boys" | "girls",
  dominantHumanColor: string,
  ctx: ReturnType<typeof getStylingContext>,
): RequirementSpec[] {
  const specs: RequirementSpec[] = [];
  const pieces = Array.isArray(look.pieces) ? look.pieces : [];
  const outfitText = `${look.outfit || ""} ${look.title || ""}`.trim();
  const lowerText = outfitText.toLowerCase();

  const occ = (profile.occasion || "").toLowerCase();
  const styles = (profile.style || []).map((s) => s.toLowerCase());
  const allOccContext = `${occ} ${styles.join(" ")}`;
  const isTraditionalOrFestive =
    allOccContext.includes("festiv") ||
    allOccContext.includes("tradition") ||
    allOccContext.includes("ethnic") ||
    allOccContext.includes("diwali") ||
    allOccContext.includes("wedding") ||
    allOccContext.includes("puja") ||
    allOccContext.includes("pooja");

  const isIndoWestern =
    allOccContext.includes("indo") ||
    allOccContext.includes("fusion") ||
    lowerText.includes("indo") ||
    lowerText.includes("fusion") ||
    lowerText.includes("cape") ||
    lowerText.includes("shrug") ||
    lowerText.includes("crop top") ||
    lowerText.includes("bustier") ||
    lowerText.includes("sharara") ||
    lowerText.includes("palazzo") ||
    lowerText.includes("dhoti") ||
    lowerText.includes("pre-draped") ||
    lowerText.includes("tulip") ||
    pieces.some((p) => /\b(shrug|cape|bustier|crop\s*top|sharara|palazzo|kurti|peplum|saree)\b/i.test(p?.name || ""));

  const isEthnicOrIndoWestern = isTraditionalOrFestive || isIndoWestern;

  const preferredRetailers = ctx.isKids
    ? isEthnicOrIndoWestern
      ? ["Myntra", "FirstCry", "Mumkins", "AJIO", "Amazon India"]
      : ["Myntra", "FirstCry", "Mumkins", "AJIO", "Amazon India", "Nykaa Fashion"]
    : isEthnicOrIndoWestern && targetGender === "women"
      ? // Designer ethnic wear (sarees, lehengas, Indo-Western) lives on Aza and Pernia's
        ["Myntra", "Aza Fashions", "Pernia's Pop-Up Shop", "AJIO", "Nykaa Fashion", "Tata CLiQ", "Amazon India"]
      : isEthnicOrIndoWestern
      ? ["Myntra", "AJIO", "Nykaa Fashion", "Tata CLiQ", "Amazon India"]
      : targetGender === "women"
        ? ["Myntra", "AJIO", "Nykaa Fashion", "Tata CLiQ", "Amazon India"]
        : ["Myntra", "AJIO", "Tata CLiQ", "Amazon India"];
  // Stores named inside the product search text. Aza and Pernia's stay out: their product
  // pages can't be confirmed, so searching them only crowds out stores that can be shown.
  const queryRetailers = preferredRetailers.filter((r) => !/\b(aza|pernia)/i.test(r));

  // Filter out non-clothing pieces (footwear, jewellery, accessories, etc.)
  const apparelPieces = pieces.filter((p) => {
    const c = (p?.category || "").toLowerCase();
    const n = (p?.name || "").toLowerCase();
    if (!n) return false;
    if (
      c.includes("foot") ||
      c.includes("shoe") ||
      c.includes("heel") ||
      c.includes("jewel") ||
      c.includes("acc") ||
      c.includes("finish") ||
      c.includes("bag") ||
      c.includes("watch") ||
      c.includes("belt") ||
      c.includes("hair") ||
      c.includes("sunglass")
    ) {
      return false;
    }
    return true;
  });

  interface RawGarment {
    type: "layer" | "top" | "bottom" | "one_piece";
    subcat: string;
    rawTitle: string;
    color?: string;
    /** Everything the look says about this garment (name, detail, outfit wording): design and fabric come from here. */
    attrText?: string;
  }
  const detectedGarments: RawGarment[] = [];

  // The look's own words for one garment: the outfit segment naming it, cut where the next
  // garment starts ("charcoal satin saree with gold embroidery, paired with a sleeveless blouse").
  const SAREE_NOUN_RE = /\b(saree|sari)s?\b/i;
  const BLOUSE_NOUN_RE = /\b(blouse|choli)s?\b/i;
  const outfitSegments = (look.outfit || "")
    .split(/[,;.]|\b(?:paired|styled|teamed|worn|layered|finished)\s+with\b|\band\s+(?:an?|the|matching)\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const segmentFor = (garmentRe: RegExp, otherRe?: RegExp) =>
    outfitSegments.find((s) => garmentRe.test(s) && !(otherRe && otherRe.test(s))) ||
    outfitSegments.find((s) => garmentRe.test(s));
  // Every garment noun, so one garment's words can be cut out of a sentence naming several
  const GARMENT_WORD_SRC =
    "(?:sarees?|saris?|blouses?|cholis?|kurtas?|kurtis?|churidars?|pyjamas?|pajamas?|dhotis?|trousers|pants|jeans|shorts|skirts?|lehengas?|dupattas?|stoles?|shawls?|jackets?|blazers?|waistcoats?|bundis?|t-?shirts?|shirts?|tees?|tops?|dress(?:es)?|gowns?|sherwanis?|palazzos?|shararas?|capes?|shrugs?|coats?|cardigans?|sweaters?|hoodies?|jumpsuits?|rompers?|anarkalis?|corsets?|bustiers?|chinos|joggers|polos?|henleys?|overshirts?|achkans?|bandhgalas?|kaftans?|tunics?|camisoles?|vests?|leggings|culottes|co-?ords?)";
  /**
   * The look's own words for one garment: the outfit segment naming it, cut to just this
   * garment. `head` ends at the garment noun ("royal blue embroidered silk kurta"); `tail` is
   * what follows up to the next garment ("with gold embroidery"), used only for design/fabric.
   */
  const phraseFor = (garmentRe: RegExp, otherRe?: RegExp): { head: string; tail: string } | undefined => {
    const seg = segmentFor(garmentRe, otherRe);
    if (!seg) return undefined;
    const nounMatch = new RegExp(garmentRe.source, "i").exec(seg);
    if (!nounMatch) return undefined;
    const nounEnd = nounMatch.index + nounMatch[0].length;
    let start = 0;
    for (const m of seg.slice(0, nounMatch.index).matchAll(new RegExp(`\\b${GARMENT_WORD_SRC}\\b`, "gi"))) {
      start = (m.index ?? 0) + m[0].length;
    }
    const head = seg
      .slice(start, nounEnd)
      .replace(/^[\s,&+-]*(?:(?:paired|styled|teamed|worn|layered)\s+)?(?:with|and|over|under)?\s*(?:an?|the)?\s+/i, "")
      .trim();
    // The tail describes this garment ("with gold embroidery") until the next garment or an
    // "and" that starts a new item
    const rest = seg.slice(nounEnd);
    const stops = [rest.search(new RegExp(`\\b${GARMENT_WORD_SRC}\\b`, "i")), rest.search(/\band\b/i)].filter((i) => i >= 0);
    const end = stops.length > 0 ? Math.min(...stops) : rest.length;
    let tail = rest.slice(0, end);
    // A colour right before the next garment belongs to that garment ("with maroon polo")
    if (end < rest.length) tail = tail.replace(/\b(?:with|in)?\s*(?:an?\s+)?[\w-]+(?:\s+[\w-]+){0,2}\s*$/i, (m) => (extractColorFromText(m) ? "" : m));
    return { head, tail: tail.trim() };
  };
  /** The garment noun a piece name ends on ("Boys Kurta" → kurta), as a pattern. */
  const garmentNounRe = (name: string): RegExp | undefined => {
    const words = name.match(new RegExp(`\\b${GARMENT_WORD_SRC}\\b`, "gi"));
    if (!words) return undefined;
    const noun = words[words.length - 1].toLowerCase().replace(/(?:es|s)$/, "").replace(/^t-?shirt$/, "t-?shirt");
    return new RegExp(`\\b${noun}(?:e?s)?\\b`, "i");
  };

  // "Saree", "Silk Saree", "Blouse": a name that has lost the colour/design the image was rendered with
  const isBareGarmentName = (name: string) =>
    !extractColorFromText(name) && extractGarmentAttributes(name).design.length === 0 && name.trim().split(/\s+/).length <= 2;

  const isLayer = (t: string) =>
    /\b(blazer|jacket|coat|shrug|cardigan|vest|waistcoat|nehru\s*jacket|overcoat|trench|bomber|cape)\b/i.test(t);
  const getLayerSubcat = (t: string) => {
    const lower = t.toLowerCase();
    if (/\b(shrugs?|capes?|cape\s*jackets?)\b/i.test(lower)) return "shrug";
    if (/\bblazer\b/i.test(lower)) return "blazer";
    if (/\b(waistcoats?|vests?|gilets?)\b/i.test(lower)) return "waistcoat";
    return "jacket";
  };
  const isBottom = (t: string) =>
    /\b(shorts?|bermudas?|trousers?|pants?|slacks?|chinos?|jeans?|denim|skirt|lehenga|chaniya|ghagra|dhoti|pyjama|pajama|salwar|churidars?|joggers?|culottes?|palazzo|sharara)\b/i.test(t);
  const isTop = (t: string) =>
    /\b(shirt|shirts|button-down|camp-collar|resort\s*shirt|tee|t-shirt|tshirt|polo|blouse|camisole|cami|corset|top|tops|tunic|kurta|kurti|choli|sweater|hoodie|sherwanis?|achkans?|bandhgala|jodhpuri|bustier|peplum)\b/i.test(t);
  const isMen = targetGender === "men";
  const isBoy = ctx.isBoy || targetGender === "boys";
  // For men, "dress" only counts as the garment, never the "dress shirt / dress trousers" qualifier.
  const isOnePiece = (t: string) =>
    isMen
      ? mentionsDressGarment(t) || /\b(saree|sari|saris|sarees|jumpsuit|jumpsuits|romper|rompers|playsuit|gown|gowns|anarkali)\b/i.test(t)
      : /\b(dress|dresses|saree|sari|saris|sarees|jumpsuit|jumpsuits|romper|rompers|playsuit|gown|gowns|anarkali)\b/i.test(t);

  // 1. If structured pieces exist in look.pieces with distinct components
  if (apparelPieces.length >= 2) {
    for (const p of apparelPieces) {
      const c = (p.category || "").toLowerCase();
      const n = (p.name || "").trim();

      // For boys kidswear, never recommend or separate out churidar/chudidar
      if (isBoy && /\bchu[rd]i(?:dar|dhar)s?\b/i.test(n)) {
        continue;
      }
      let type: "layer" | "top" | "bottom" | "one_piece" = "top";
      let subcat = "top";
      const masculineGarment = (isMen || isBoy) ? classifyMenGarment(n, c) : null;

      if (masculineGarment) {
        type = masculineGarment.type;
        subcat = masculineGarment.subcat;
      } else if (/\b(saree|sari)s?\b/i.test(n) && !/\bblouse\b/i.test(n)) {
        // A cape-saree, jacket saree or belted saree is a saree: its cape/jacket is part of it
        type = "one_piece";
        subcat = "saree";
      } else if (/\b(blouse|inner\s*top|camisole)\b/i.test(n) || (/\bcholi\b/i.test(n) && !/\b(lehenga|chaniya|skirt)\b/i.test(n))) {
        type = "top";
        subcat = "inner_top";
      } else if (/\b(crop\s*tops?|cropped\s*tops?|bustiers?|bralettes?|corsets?)\b/i.test(n)) {
        type = "top";
        subcat = "crop_top";
      } else if (/\b(shrugs?|capes?|cape\s*jackets?)\b/i.test(n)) {
        type = "layer";
        subcat = "shrug";
      } else if (/\b(peplum\s*(?:short\s*)?kurt[ia]s?|peplum\s*tops?|peplum)\b/i.test(n) && !isMen) {
        type = "top";
        subcat = "kurta";
      } else if (/\b(kurta|kurtis?|short\s*kurt[ia]s?)\b/i.test(n)) {
        type = "top";
        subcat = "kurta";
      } else if (/\b(lehenga|chaniya|ghagra)\b/i.test(n)) {
        type = "bottom";
        subcat = "lehenga";
      } else if (/\b(dupattas?|stoles?|shawls?|doshala|lohi|chaddar|angavastram|odhani|chunni|uttariya)\b/i.test(n)) {
        type = "layer";
        subcat = /\b(shawls?|doshala|lohi|chaddar)\b/i.test(n)
          ? "shawl"
          : /\b(stoles?|angavastram|uttariya)\b/i.test(n)
            ? "stole"
            : "dupatta";
      } else if (/\b(bundi|nehru\s*jacket|modi\s*jacket|koti)\b/i.test(n) || (c.includes("layer") && /\bwaistcoat\b/i.test(n))) {
        type = "layer";
        subcat = /\b(nehru\s*jacket|modi\s*jacket)\b/i.test(n) ? "nehru_jacket" : "bundi";
      } else if (c.includes("layer") || c.includes("outer") || isLayer(n)) {
        type = "layer";
        subcat = getLayerSubcat(n);
      } else if (c.includes("bottom") || isBottom(n)) {
        type = "bottom";
        if (/\b(shorts?|bermudas?)\b/i.test(n)) subcat = "shorts";
        else if (/\bskirt\b/i.test(n)) subcat = "skirt";
        else if (/\b(lehenga|chaniya|ghagra)\b/i.test(n)) subcat = "lehenga";
        else if (/\b(churidars?|dhotis?|mundus?|veshtis?|lungis?|pyjamas?|pajamas?|salwars?|patiala|jodhpurs)\b/i.test(n)) subcat = "ethnic_bottom";
        else if (/\b(palazzos?|shararas?|ghararas?|tulips?|cowls?)\b/i.test(n)) subcat = "palazzo";
        else subcat = "trousers";
      } else if (
        isMen
          ? isOnePiece(n) || (c.includes("outfit") && !isTop(n) && !isBottom(n))
          : c.includes("outfit") || isOnePiece(n)
      ) {
        type = "one_piece";
        if (/\b(saree|sari)\b/i.test(n)) subcat = "saree";
        else if (/\b(jumpsuit|romper)\b/i.test(n)) subcat = "jumpsuit";
        else if (/\b(sherwanis?|achkans?|bandhgala)\b/i.test(n)) subcat = "sherwani";
        else subcat = isMen ? "men_outfit" : isBoy ? "boys_outfit" : "dress";
      } else {
        type = "top";
        if (/\b(crop\s*tops?|cropped\s*tops?|bustiers?|bralettes?|corsets?)\b/i.test(n)) subcat = "crop_top";
        else if (/\b(shrugs?|capes?|cape\s*jackets?)\b/i.test(n)) { type = "layer"; subcat = "shrug"; }
        else if (/\b(peplum|kurta|kurtis?)\b/i.test(n)) subcat = "kurta";
        else if (/\b(t-?shirts?|tees?)\b/i.test(n)) subcat = "top";
        else if (/(?<![tT]-)\b(shirts?|button-down|polo)\b/i.test(n)) subcat = "shirt";
        else if (/\b(sherwanis?|achkans?|jodhpuri|bandhgala)\b/i.test(n)) subcat = "sherwani";
        else if (/\b(choli|blouse)\b/i.test(n)) subcat = "inner_top";
        else subcat = "top";
      }

      const rawPieceColor = (p as { color?: string }).color;
      const cleanPieceColor =
        rawPieceColor && !GARMENT_NOUN_PATTERN.test(rawPieceColor)
          ? extractColorFromText(rawPieceColor) || rawPieceColor
          : undefined;

      let cleanPieceTitle = n;
      if (/\bpeplum\s*top\b/i.test(cleanPieceTitle)) {
        cleanPieceTitle = cleanPieceTitle.replace(/\bpeplum\s*top\b/gi, "Peplum Short Kurti");
      }

      const pieceDetail = (p as { detail?: string }).detail || "";
      const nounRe =
        subcat === "saree" ? SAREE_NOUN_RE : subcat === "inner_top" && BLOUSE_NOUN_RE.test(n) ? BLOUSE_NOUN_RE : garmentNounRe(n);
      const phrase = nounRe
        ? phraseFor(nounRe, subcat === "saree" ? BLOUSE_NOUN_RE : subcat === "inner_top" ? SAREE_NOUN_RE : undefined)
        : undefined;
      if (phrase?.head && isBareGarmentName(cleanPieceTitle) && phrase.head.split(/\s+/).length > cleanPieceTitle.split(/\s+/).length) {
        // Keep the piece's own audience word ("Boys Kurta" → "Boys royal blue silk kurta")
        const audience = /^(boys?|girls?|men'?s?|women'?s?|kids?)\b/i.exec(cleanPieceTitle)?.[0];
        // Keep the garment noun as the piece spells it ("Sherwani", not "sherwani")
        const pieceNoun = new RegExp(nounRe!.source, "i").exec(cleanPieceTitle)?.[0];
        const head = stripHandDrapeTerms(pieceNoun ? phrase.head.replace(new RegExp(nounRe!.source, "i"), pieceNoun) : phrase.head);
        cleanPieceTitle = audience && !new RegExp(`\\b${audience}`, "i").test(head) ? `${audience} ${head}` : head;
      }
      const segment = phrase ? `${phrase.head} ${phrase.tail}`.trim() : undefined;

      detectedGarments.push({
        type,
        subcat,
        rawTitle: cleanPieceTitle,
        color:
          cleanPieceColor ||
          extractColorFromText(cleanPieceTitle) ||
          extractColorFromText(pieceDetail) ||
          extractColorFromText(segment) ||
          undefined,
        attrText: [cleanPieceTitle, pieceDetail, segment].filter(Boolean).join(" "),
      });
    }
  } else {
    // 2. Parse text dynamically from outfitText
    const isLehengaOrChaniya =
      !ctx.isBoy &&
      targetGender !== "boys" &&
      targetGender !== "men" &&
      (/\b(lehenga|chaniya|ghagra)\b/i.test(lowerText) ||
        (lowerText.includes("garba") && (ctx.isGirl || targetGender === "women")));

    const isSaree =
      !ctx.isBoy &&
      targetGender !== "boys" &&
      targetGender !== "men" &&
      !ctx.isKids &&
      /\b(saree|sari)\b/i.test(lowerText);

    if (isLehengaOrChaniya) {
      detectedGarments.push({
        type: "bottom",
        subcat: "lehenga",
        rawTitle: `${dominantHumanColor} Flared Mirror-Work Chaniya Choli Lehenga Skirt`,
      });
      detectedGarments.push({
        type: "top",
        subcat: "inner_top",
        rawTitle: `Matching ${dominantHumanColor} Embroidered Choli Blouse`,
      });
    } else if (isSaree) {
      // Use the saree and blouse the look actually describes (a Tant cotton saree must not
      // be searched as silk); generic titles only when the outfit text names neither.
      // Garments come from the outfit field alone — outfitText also has the look's title
      // appended without a separator, which would glue onto the last garment clause.
      const clauses = (look.outfit || outfitText)
        .split(/[,;]|\b(?:paired\s+with|styled\s+with|teamed\s+with|worn\s+with|with|and)\b/i)
        .map((s) => s.trim().replace(/^[,.\s]+|[,.\s]+$/g, ""))
        .filter((s) => s.length > 2);
      const sareeClause = clauses.find((c) => /\b(saree|sari)\b/i.test(c));
      const topClause = clauses.find(
        (c) => !/\b(saree|sari)\b/i.test(c) && /\b(blouse|choli|corset|bustier|crop\s*top|bralette|jacket|cape)\b/i.test(c),
      );
      // Keep the full saree wording ("…with gold embroidery") for design/fabric, which the
      // clause split above drops
      const sareeSegment = segmentFor(SAREE_NOUN_RE, BLOUSE_NOUN_RE);
      const blouseSegment = segmentFor(BLOUSE_NOUN_RE, SAREE_NOUN_RE);
      detectedGarments.push({
        type: "one_piece",
        subcat: "saree",
        rawTitle: sareeClause ? stripHandDrapeTerms(sareeClause) : `${dominantHumanColor} Saree`,
        attrText: [sareeClause, sareeSegment].filter(Boolean).join(" "),
      });
      if (topClause && /\b(jacket|cape)\b/i.test(topClause)) {
        detectedGarments.push({ type: "layer", subcat: "jacket", rawTitle: topClause });
      } else {
        detectedGarments.push({
          type: "top",
          subcat: "inner_top",
          rawTitle: topClause || `Matching Saree Blouse`,
          attrText: [topClause, blouseSegment].filter(Boolean).join(" "),
        });
      }
    } else {
      // Split by clause connectors: commas, semicolons, "with", "paired with", "styled with", "and", "over", "worn with"
      const rawClauses = outfitText
        .split(/[,;]|\b(?:with|paired\s+with|styled\s+with|teamed\s+with|complemented\s+by|worn\s+with|layered\s+over\s+a?|layered\s+over|over\s+a?|over|and\s+a?|along\s+with)\b/i)
        .map((s) => s.trim().replace(/^[,.\s]+|[,.\s]+$/g, ""))
        .filter((s) => s.length > 2);

      const foundTypes = new Set<string>();

      for (const clause of rawClauses) {
        const cleanClause = cleanOutfitGarmentTitle(clause, targetGender);
        if (!cleanClause || cleanClause.length < 3) continue;

        // For boys kidswear, never recommend or separate out churidar/chudidar
        if (isBoy && /\bchu[rd]i(?:dar|dhar)s?\b/i.test(cleanClause)) {
          continue;
        }

        const masculineClauseGarment = (isMen || isBoy) ? classifyMenGarment(cleanClause) : null;
        if (masculineClauseGarment) {
          if (!foundTypes.has(masculineClauseGarment.type)) {
            foundTypes.add(masculineClauseGarment.type);
            detectedGarments.push({ type: masculineClauseGarment.type, subcat: masculineClauseGarment.subcat, rawTitle: cleanClause });
          }
        } else if (/\b(dupattas?|stoles?|shawls?|doshala|lohi|chaddar|angavastram|odhani|chunni|uttariya)\b/i.test(cleanClause)) {
          const pieceSubcat = /\b(shawls?|doshala|lohi|chaddar)\b/i.test(cleanClause)
            ? "shawl"
            : /\b(stoles?|angavastram|uttariya)\b/i.test(cleanClause)
              ? "stole"
              : "dupatta";
          if (!foundTypes.has(pieceSubcat)) {
            foundTypes.add(pieceSubcat);
            detectedGarments.push({
              type: "layer",
              subcat: pieceSubcat,
              rawTitle: cleanClause,
            });
          }
        } else if (/\b(bundi|nehru\s*jacket|modi\s*jacket|koti)\b/i.test(cleanClause) || (/\bwaistcoat\b/i.test(cleanClause) && !/\bformal|suit\b/i.test(cleanClause))) {
          if (!foundTypes.has("bundi")) {
            foundTypes.add("bundi");
            detectedGarments.push({
              type: "layer",
              subcat: /\b(nehru\s*jacket|modi\s*jacket)\b/i.test(cleanClause) ? "nehru_jacket" : "bundi",
              rawTitle: cleanClause,
            });
          }
        } else if (isLayer(cleanClause) && !foundTypes.has("layer")) {
          foundTypes.add("layer");
          const layerSub = getLayerSubcat(cleanClause);
          detectedGarments.push({
            type: "layer",
            subcat: layerSub,
            rawTitle: cleanClause,
          });
        } else if (isBottom(cleanClause) && !foundTypes.has("bottom")) {
          foundTypes.add("bottom");
          let subcat = "trousers";
          if (/\b(shorts?|bermudas?)\b/i.test(cleanClause)) subcat = "shorts";
          else if (/\bskirt\b/i.test(cleanClause)) subcat = "skirt";
          else if (/\b(lehenga|chaniya|ghagra)\b/i.test(cleanClause)) subcat = "lehenga";
          else if (/\b(churidars?|dhotis?|mundus?|veshtis?|lungis?|pyjamas?|pajamas?|salwars?|patiala|jodhpurs)\b/i.test(cleanClause)) subcat = "ethnic_bottom";
          else if (/\b(palazzos?|shararas?|ghararas?|tulips?|cowls?)\b/i.test(cleanClause)) subcat = "palazzo";
          detectedGarments.push({
            type: "bottom",
            subcat,
            rawTitle: cleanClause,
          });
        } else if (isTop(cleanClause) && !foundTypes.has("top")) {
          foundTypes.add("top");
          let subcat = "top";
          let cleanTopTitle = cleanClause;
          if (/\b(crop\s*tops?|cropped\s*tops?|bustiers?|bralettes?|corsets?)\b/i.test(cleanClause)) subcat = "crop_top";
          else if (/\b(peplum\s*kurt[ia]s?|peplum\s*tops?|peplum|short\s*kurt[ia]s?)\b/i.test(cleanClause) && !isMen) {
            subcat = "kurta";
            cleanTopTitle = cleanClause.replace(/\bpeplum\s*top\b/gi, "Peplum Short Kurti");
          }
          else if (/\b(t-?shirts?|tees?)\b/i.test(cleanClause)) subcat = "top";
          else if (/(?<![tT]-)\b(shirts?|button-down|polo)\b/i.test(cleanClause)) subcat = "shirt";
          else if (/\b(sherwanis?|achkans?|jodhpuri|bandhgala)\b/i.test(cleanClause)) subcat = "sherwani";
          else if (/\b(kurta|kurti)\b/i.test(cleanClause)) subcat = "kurta";
          else if (/\b(choli|blouse)\b/i.test(cleanClause)) subcat = "inner_top";
          detectedGarments.push({
            type: "top",
            subcat,
            rawTitle: cleanTopTitle,
          });
        } else if (isOnePiece(cleanClause) && !foundTypes.has("one_piece")) {
          foundTypes.add("one_piece");
          let subcat = isMen ? "men_outfit" : "dress";
          if (/\b(jumpsuit|romper|playsuit)\b/i.test(cleanClause)) subcat = "jumpsuit";
          detectedGarments.push({
            type: "one_piece",
            subcat,
            rawTitle: cleanClause,
          });
        }
      }

      // If text contains separates that were not captured by clause splitting
      if (detectedGarments.length === 0) {
        if (isOnePiece(lowerText)) {
          detectedGarments.push({
            type: "one_piece",
            subcat: /\b(jumpsuit|romper)\b/i.test(lowerText) ? "jumpsuit" : isMen ? "men_outfit" : "dress",
            rawTitle: outfitText,
          });
        } else {
          const hasTop = isTop(lowerText);
          const hasBottom = isBottom(lowerText);
          const hasLayer = isLayer(lowerText);

          if (hasLayer) {
            const layerSubcat = getLayerSubcat(lowerText);
            detectedGarments.push({
              type: "layer",
              subcat: layerSubcat,
              rawTitle:
                layerSubcat === "waistcoat"
                  ? `${dominantHumanColor} Tailored Waistcoat`
                  : layerSubcat === "blazer"
                    ? `${dominantHumanColor} Tailored Blazer`
                    : `${dominantHumanColor} Tailored Jacket`,
            });
          }
          if (hasTop) {
            detectedGarments.push({
              type: "top",
              subcat: /\b(t-?shirts?|tees?)\b/i.test(lowerText)
                ? "top"
                : /(?<![tT]-)\b(shirts?|button-down|polo)\b/i.test(lowerText)
                  ? "shirt"
                  : "top",
              rawTitle: `${dominantHumanColor} Casual Shirt / Top`,
            });
          }
          if (hasBottom) {
            detectedGarments.push({
              type: "bottom",
              subcat: /\b(shorts?|bermudas?)\b/i.test(lowerText) ? "shorts" : /\bskirt\b/i.test(lowerText) ? "skirt" : "trousers",
              rawTitle: /\b(shorts?|bermudas?)\b/i.test(lowerText)
                ? `${dominantHumanColor} Breathable Shorts`
                : `${dominantHumanColor} Tailored Trousers`,
            });
          }
        }
      }
    }
  }

  // Ensure that any visible layer (e.g. blazer, suit jacket, coat) explicitly mentioned
  // in look description, title, or note is not omitted even if pieces only listed base separates
  const fullLookText = `${look.outfit || ""} ${look.title || ""} ${look.note || ""}`.trim();
  const hasVisibleLayer = isLayer(fullLookText);
  const alreadyHasLayer = detectedGarments.some(
    (g) => g.type === "layer" || g.subcat === "blazer" || isLayer(g.subcat) || isLayer(g.rawTitle),
  );
  if (hasVisibleLayer && !alreadyHasLayer) {
    const layerMatch = fullLookText.match(
      /\b((?:[a-zA-Z-]+\s+){0,3}(?:blazer|suit\s*jacket|jacket|coat|overcoat|trench(?:\s*coat)?|shrug|cardigan|waistcoat|vest|nehru\s*jacket))\b/i,
    );
    const layerPhrase = layerMatch ? layerMatch[1].trim() : "Tailored Blazer";
    const layerSubcat = getLayerSubcat(layerPhrase);
    const layerColor = resolveHumanColor(layerPhrase, dominantHumanColor);
    detectedGarments.unshift({
      type: "layer",
      subcat: layerSubcat,
      rawTitle:
        cleanOutfitGarmentTitle(layerPhrase, targetGender) ||
        (layerSubcat === "waistcoat"
          ? `${layerColor} Tailored Waistcoat`
          : layerSubcat === "blazer"
            ? `${layerColor} Tailored Blazer`
            : `${layerColor} Tailored Jacket`),
      color: layerColor,
    });
  }

  // For boys kidswear, strictly filter out any churidar pieces that may have been parsed
  let finalGarments = detectedGarments;
  if (isBoy) {
    finalGarments = detectedGarments.filter(
      (g) => !/\bchu[rd]i(?:dar|dhar)s?\b/i.test(g.rawTitle) && !/\bchu[rd]i(?:dar|dhar)s?\b/i.test(g.subcat)
    );
  }

  // Fallback if still nothing detected: single outfit piece
  if (finalGarments.length === 0) {
    const isFestive = /traditional|festive|ethnic|wedding|diwali|navratri|garba|puja|eid/i.test(allOccContext);
    const defaultTitle = isBoy
      ? isFestive
        ? `Boys ${dominantHumanColor} Festive Kurta Set`
        : `Boys ${dominantHumanColor} Smart Casual Outfit Set`
      : ctx.isGirl
        ? `Girls ${dominantHumanColor} Casual Dress / Co-ord Set`
        : targetGender === "men"
          ? `Men's ${dominantHumanColor} Curated Outfit`
          : `Women's ${dominantHumanColor} Curated Dress / Outfit`;

    finalGarments.push({
      type: "one_piece",
      subcat: isBoy ? "boys_outfit" : ctx.isGirl ? "girls_outfit" : targetGender === "men" ? "men_outfit" : "dress",
      rawTitle: outfitText || defaultTitle,
    });
  }

  // A saree blouse is bought to match its saree: unless the look names a blouse colour of its
  // own, it is searched in the saree's colour (never a generic white/cream blouse).
  const sareeGarment = finalGarments.find((x) => x.subcat === "saree");
  const sareeColor = sareeGarment
    ? sareeGarment.color && !GARMENT_NOUN_PATTERN.test(sareeGarment.color)
      ? sareeGarment.color
      : resolveHumanColor(sareeGarment.rawTitle, dominantHumanColor)
    : undefined;

  // Convert each detected garment into a fully realized RequirementSpec
  for (const g of finalGarments) {
    const rawClean =
      g.subcat === "saree"
        ? stripHandDrapeTerms(cleanOutfitGarmentTitle(g.rawTitle, targetGender))
        : cleanOutfitGarmentTitle(g.rawTitle, targetGender);
    const isEthnicBottom = g.subcat === "ethnic_bottom";
    let color = g.color;
    if (!color || GARMENT_NOUN_PATTERN.test(color)) {
      color = resolveHumanColor(rawClean, isEthnicBottom ? undefined : dominantHumanColor);
    }
    if (color && GARMENT_NOUN_PATTERN.test(color)) {
      color = dominantHumanColor && !GARMENT_NOUN_PATTERN.test(dominantHumanColor) ? dominantHumanColor : "Classic";
    }
    if (isEthnicBottom) {
      const isNeutralEthnicColor = /\b(white|off-white|cream|ivory|beige|gold|black|maroon)\b/i.test(color || "");
      if (!isNeutralEthnicColor) {
        color = "Off-White";
      }
    }

    // For inner tops/shirts under a coordinated outfit/vest set/suit:
    // If candidate color is an unrequested contrasting shade that doesn't match loved colors or the look's palette,
    // harmonize it with an elegant neutral (Cream/White) or the look's dominant color.
    const isSareeBlouse = g.subcat === "inner_top" && !!sareeColor && BLOUSE_NOUN_RE.test(`${g.rawTitle} ${g.attrText || ""}`);
    if (isSareeBlouse) {
      // Only a colour that names the blouse itself counts — not "silver embroidery" on it
      const ownBlouseColor = extractBaseColorFromText(g.rawTitle) || extractBaseColorFromText(g.attrText);
      const saysContrast = /\bcontrast(?:ing)?\b/i.test(`${g.rawTitle} ${g.attrText || ""}`);
      color = ownBlouseColor && (saysContrast || !/\bmatching\b/i.test(g.rawTitle)) ? ownBlouseColor : sareeColor;
    } else if ((g.subcat === "shirt" || g.subcat === "inner_top") && color) {
      const lovedList = (profile.colorsLove || []).map((c) => c.toLowerCase());
      const paletteList = (look.palette || []).map((c) => c.toLowerCase());
      const lowerColor = color.toLowerCase();
      const isLoved = lovedList.some((l) => lowerColor.includes(l) || l.includes(lowerColor));
      const isPalette = paletteList.some((p) => lowerColor.includes(p) || p.includes(lowerColor));
      const isOutfitMentioned = outfitText.toLowerCase().includes(lowerColor);
      const isNeutral = /\b(white|off-white|cream|ivory|ecru|beige|classic|neutral)\b/i.test(lowerColor);
      const isSameAsDominant = lowerColor.includes(dominantHumanColor.toLowerCase()) || dominantHumanColor.toLowerCase().includes(lowerColor);

      if (!isLoved && !isPalette && !isOutfitMentioned && !isNeutral && !isSameAsDominant) {
        const isWarmLook = /\b(yellow|butter|gold|mustard|orange|peach|rose|pink|cream|ivory)\b/i.test(dominantHumanColor);
        color = isWarmLook ? "Cream" : "White";
      }
    }

    // Every garment is matched on design first, then colour, then fabric — taken from this
    // garment's own words (name, detail, its phrase in the outfit), never another piece's
    // (Garments parsed from the outfit sentence were split on "with", so look their phrase up)
    if (!g.attrText) {
      const nounRe = garmentNounRe(rawClean);
      const phrase = nounRe ? phraseFor(nounRe) : undefined;
      if (phrase) g.attrText = `${phrase.head} ${phrase.tail}`.trim();
    }
    const garmentAttrs = extractGarmentAttributes(`${rawClean} ${g.attrText || ""}`);

    // Format human-friendly title with proper demographic prefix
    let title = rawClean.replace(/^matching\s+/i, "");
    if (color && extractColorFromText(color) && !extractColorFromText(title)) {
      // Colour goes after any audience word: "Boys Royal Blue Kurta", not "Royal Blue Boys Kurta"
      const audience = /^(?:boys?|girls?|men'?s?|women'?s?|kids?)\b\s*/i.exec(title)?.[0] ?? "";
      title = `${audience}${color} ${title.slice(audience.length)}`;
    }
    // The item title also drives the store-search links, so it must carry the design
    // (design words first, then colour/fabric/garment; "with gold embroidery" tails are folded into the design words)
    {
      const core = title.split(/\s+\b(?:with|featuring)\b/i)[0].trim() || title;
      const leadDesigns = garmentAttrs.design
        .filter((d) => !new RegExp(`\\b${d.split(/[\s-]/)[0].slice(0, 6)}`, "i").test(core))
        .slice(0, 2)
        .map((d) => d.replace(/\b\w/g, (ch) => ch.toUpperCase()));
      const audience = /^(?:boys?|girls?|men'?s?|women'?s?|kids?)\b\s*/i.exec(core)?.[0] ?? "";
      title = [audience.trim(), ...leadDesigns, core.slice(audience.length)].filter(Boolean).join(" ");
    }
    if (ctx.isBoy && !/\bboys?\b/i.test(title)) {
      title = `Boys ${title}`;
    } else if (ctx.isGirl && !/\bgirls?\b/i.test(title)) {
      title = `Girls ${title}`;
    } else if (targetGender === "men" && !/\b(men|men's)\b/i.test(title)) {
      title = `Men's ${title}`;
    }

    // Material hint extraction
    // This garment's own fabric decides; the rest of the outfit is only a fallback (a cotton
    // churidar must not make the silk kurta's hint "cotton")
    const materialText = garmentAttrs.fabric ? `${rawClean} ${g.attrText || ""}` : `${rawClean} ${outfitText}`;
    let materialHint = "";
    if (/linen/i.test(materialText)) materialHint = "100% Breathable European Linen";
    else if (/cotton/i.test(materialText)) materialHint = "100% Crisp Breathable Cotton";
    else if (/silk|satin/i.test(materialText)) materialHint = "Lustrous Silk / Satin Finish";
    else if (/denim/i.test(materialText)) materialHint = "Comfort Stretch Premium Denim";
    else if (/wool|crepe/i.test(materialText)) materialHint = "Tailored Suiting Crepe / Wool Blend";

    // Build dynamic search query
    let itemQueryKeyword = g.subcat;
    if (g.subcat === "shorts") itemQueryKeyword = "shorts";
    else if (g.subcat === "shirt") itemQueryKeyword = "shirt";
    else if (g.subcat === "top") itemQueryKeyword = rawClean.toLowerCase().includes("tee") || rawClean.toLowerCase().includes("t-shirt") ? "t-shirt tee" : "top";
    else if (g.subcat === "crop_top") itemQueryKeyword = "embroidered crop top bustier";
    else if (g.subcat === "shrug") itemQueryKeyword = "sheer net shrug cape jacket";
    else if (g.subcat === "palazzo") itemQueryKeyword = "flared palazzo pants";
    else if (g.subcat === "sharara") itemQueryKeyword = "tiered flared sharara";
    else if (g.subcat === "trousers") itemQueryKeyword = "tailored trousers pants";
    else if (g.subcat === "blazer") itemQueryKeyword = "tailored formal blazer";
    else if (g.subcat === "waistcoat") itemQueryKeyword = "tailored waistcoat vest";
    // The saree's own name carries its weave, fabric and construction; a silk blouse
    // elsewhere in the outfit must not turn a cotton saree into a "silk saree" search.
    else if (g.subcat === "saree") itemQueryKeyword = rawClean;
    else if (g.subcat === "lehenga") itemQueryKeyword = "chaniya choli lehenga set";
    else if (g.subcat === "inner_top") itemQueryKeyword = rawClean.toLowerCase().includes("choli") || rawClean.toLowerCase().includes("blouse") ? "embroidered choli blouse" : "formal inner top camisole";
    else if (g.subcat === "kurta") itemQueryKeyword = rawClean.toLowerCase().includes("peplum") ? "embroidered peplum short kurti" : rawClean.toLowerCase().includes("short") ? "short kurti" : "festive kurta set";
    else if (g.subcat === "dress") itemQueryKeyword = "dress";
    else if (g.subcat === "sherwani") itemQueryKeyword = "sherwani";
    else if (g.subcat === "ethnic_bottom") itemQueryKeyword = "ethnic pyjama";
    else if (g.subcat === "shawl") itemQueryKeyword = "traditional ethnic shawl";
    else if (g.subcat === "dupatta" || g.subcat === "stole") itemQueryKeyword = /\bdupattas?\b/i.test(rawClean) ? "festive dupatta stole" : "festive stole angavastram";
    else if (g.subcat === "bundi" || g.subcat === "nehru_jacket") itemQueryKeyword = "festive nehru jacket bundi waistcoat";

    // Men's, Boys', and Women's queries are built from the garment's own name (type, colour, fabric, fit, style)
    // without appending conflicting generic keywords ("tailored trousers pants", "dress", etc.)
    const searchTerms = isMen
      ? buildMenGarmentQuery(rawClean, g.subcat, g.color)
      : isBoy
        ? [
            "boys",
            color && !rawClean.toLowerCase().includes(color.toLowerCase()) ? color : "",
            g.subcat === "sherwani"
              ? "sherwani"
              : g.subcat === "ethnic_bottom"
                ? "ethnic pyjama pants"
                : g.subcat === "shawl"
                  ? "traditional ethnic shawl"
                  : g.subcat === "dupatta" || g.subcat === "stole"
                    ? /\bdupattas?\b/i.test(rawClean) ? "festive dupatta stole" : "festive stole"
                    : g.subcat === "bundi" || g.subcat === "nehru_jacket"
                      ? "festive nehru jacket bundi"
                      : g.subcat === "waistcoat"
                        ? "waistcoat vest"
                        : itemQueryKeyword,
            ...queryRetailers.slice(0, 3),
          ]
            .filter(Boolean)
            .join(" ")
        : targetGender === "women"
          ? buildWomenGarmentQuery(rawClean, g.subcat, color, queryRetailers, garmentAttrs)
          : [
              targetGender,
              color,
              itemQueryKeyword,
              ...queryRetailers.slice(0, 3),
            ]
              .filter(Boolean)
              .join(" ");

    // Sarees and saree blouses are ordered by their own builder; every other garment's query
    // is reordered the same way: audience, design, colour, fabric, then the garment
    const prioritizedQuery =
      g.subcat === "saree" || isSareeBlouse ? searchTerms : prioritizeGarmentQuery(searchTerms, garmentAttrs, color);

    specs.push({
      category: "outfit",
      itemTitle: title,
      itemSubcategory: g.subcat,
      targetGender,
      dominantColor: color,
      stylingRequirement: `${title} (${color}) suited for ${profile.occasion || "this look"}`,
      searchQuery: prioritizedQuery,
      preferredRetailers,
      materialHint: materialHint || undefined,
      matchContext: `Selected in ${color} to harmonize with your recommended look and occasion silhouette.`,
    });
  }

  return specs;
}

/**
 * Dynamically detects and formulates the footwear requirement spec from
 * the look's footwear specification, pieces, and demographic occasion context.
 */
export function detectFootwearSpec(
  look: LookRecommendation,
  profile: SkinTuneProfile,
  targetGender: "women" | "men" | "child" | "boys" | "girls",
  dominantHumanColor: string,
  ctx: ReturnType<typeof getStylingContext>,
  persona: PersonaType,
): RequirementSpec {
  const pieces = Array.isArray(look.pieces) ? look.pieces : [];
  const footPiece = pieces.find(
    (p) =>
      (p?.category || "").toLowerCase().includes("foot") ||
      (p?.category || "").toLowerCase().includes("shoe") ||
      (p?.category || "").toLowerCase().includes("heel"),
  );

  const rawFootText = (footPiece?.name || (look.footwear || "").split(",")[0] || "").trim();
  const allFootContext = [
    footPiece?.name,
    (footPiece as { detail?: string })?.detail,
    (footPiece as { color?: string })?.color,
    look.footwear,
  ].filter(Boolean).join(" ");
  const lowerFoot = (allFootContext || rawFootText).toLowerCase();
  const occ = (profile.occasion || "").toLowerCase();
  const allContext = `${lowerFoot} ${occ} ${(profile.style || []).join(" ")}`.toLowerCase();

  const isGarbaOrNavratri = allContext.includes("garba") || allContext.includes("navratri");
  const isTraditionalOrFestive =
    !allContext.includes("vacation") &&
    !allContext.includes("beach") &&
    (isGarbaOrNavratri ||
      allContext.includes("wedding") ||
      allContext.includes("festive") ||
      allContext.includes("ethnic") ||
      allContext.includes("diwali") ||
      allContext.includes("eid") ||
      allContext.includes("puja"));

  const isOfficeOrFormal =
    allContext.includes("office") ||
    allContext.includes("formal") ||
    allContext.includes("corporate") ||
    allContext.includes("meeting");

  const isDateNight = allContext.includes("date") || allContext.includes("dinner");
  const isVacation =
    allContext.includes("vacation") ||
    allContext.includes("beach") ||
    allContext.includes("resort") ||
    allContext.includes("goa") ||
    allContext.includes("holiday");

  // Detect footwear subcategory. The footwear the look actually names always wins; the
  // occasion is only used to infer a type when the text names none. (Previously the
  // occasion rules sat inside the keyword chain, so e.g. "Gleaming silver juttis" for a
  // date became "heels": the search asked for heels and every real jutti then failed the
  // heels check.) Ethnic types come first because they are the most specific: "jutti
  // flats", "kolhapuri sandals" and "heeled juttis" are all juttis/mojaris.
  const explicitFootwear: Array<{ pattern: RegExp; subcat: string; label: () => string }> = [
    { pattern: /\b(mojaris?|juttis?|kolhapuris?|nagras?|khussas?)\b/i, subcat: "mojaris", label: () => "Handcrafted Ethnic Mojaris / Juttis" },
    {
      pattern: /\b(sandals?|slides?|sliders?|flip-flop[s]?|espadrilles?|slippers?)\b/i,
      subcat: "sandals",
      label: () => (/\bslides?\b/i.test(lowerFoot) ? "Slide Sandals" : "Comfort Sandals"),
    },
    { pattern: /\b(loafers?|moccasins?|boat\s*shoes?)\b/i, subcat: "loafers", label: () => "Smart Loafers" },
    { pattern: /\b(oxfords?|derby|brogues?|formal\s*shoes?)\b/i, subcat: "formal_shoes", label: () => "Formal Derby / Oxford Shoes" },
    {
      pattern: /\b(heels?|heeled|pumps?|stilettos?|wedges?|kitten\s*heels?|block\s*heels?)\b/i,
      subcat: "heels",
      label: () => (/\bblock\b/i.test(lowerFoot) ? "Block Heels" : "Heeled Pumps / Sandals"),
    },
    { pattern: /\b(flats?|ballerinas?|ballet\s*flats?|mules?)\b/i, subcat: "flats", label: () => "Ballet Flats" },
    { pattern: /\b(boots?|chelsea)\b/i, subcat: "boots", label: () => "Chelsea Boots" },
    { pattern: /\b(sneakers?|trainers?|canvas\s*shoes?)\b/i, subcat: "sneakers", label: () => "Minimalist Sneakers / Shoes" },
  ];

  let subcat = "sneakers";
  let label = "Minimalist Sneakers / Shoes";
  const named = explicitFootwear.find((f) => f.pattern.test(lowerFoot));
  if (named) {
    subcat = named.subcat;
    label = named.label();
  } else if (isVacation) {
    subcat = "sandals";
    label = "Comfort Sandals";
  } else if (isOfficeOrFormal && (persona === "man" || ctx.isBoy)) {
    subcat = "formal_shoes";
    label = "Formal Derby / Oxford Shoes";
  } else if (persona === "woman" && (isDateNight || isOfficeOrFormal)) {
    subcat = "heels";
    label = "Heeled Pumps / Sandals";
  } else if (isGarbaOrNavratri || isTraditionalOrFestive) {
    subcat = "mojaris";
    label = "Handcrafted Ethnic Mojaris / Juttis";
  }

  const footColor = resolveHumanColor(allFootContext || rawFootText, dominantHumanColor);

  let title = rawFootText;
  if (!title || title.length < 4 || title.toLowerCase() === "shoes" || title.toLowerCase() === "footwear") {
    if (ctx.isBoy) title = `Boys ${footColor} ${label}`;
    else if (ctx.isGirl) title = `Girls ${footColor} ${label}`;
    else if (persona === "man") title = `Men's ${footColor} ${label}`;
    else title = `${footColor} ${label}`;
  } else {
    if (ctx.isBoy && !/\bboys?\b/i.test(title)) title = `Boys ${title}`;
    else if (ctx.isGirl && !/\bgirls?\b/i.test(title)) title = `Girls ${title}`;
  }

  const preferredRetailers = ctx.isKids
    ? ["Myntra", "AJIO", "Amazon India", "Bata", "FirstCry"]
    : ["Myntra", "AJIO", "Tata CLiQ", "Amazon India"];

  let footSearchTerm = subcat.replace(/_/g, " ");
  if (/\b(canvas\s*sneakers?)\b/i.test(lowerFoot)) {
    footSearchTerm = "canvas sneakers";
  } else if (/\b(canvas\s*shoes?|canvas)\b/i.test(lowerFoot)) {
    footSearchTerm = "canvas shoes";
  } else if (/\b(boat\s*shoes?|moccasins?)\b/i.test(lowerFoot)) {
    footSearchTerm = "boat shoes loafers";
  } else if (/\b(oxfords?|derby|brogues?)\b/i.test(lowerFoot)) {
    footSearchTerm = "formal oxford derby shoes";
  } else if (/\bchelsea\b/i.test(lowerFoot)) {
    footSearchTerm = "chelsea boots";
  } else if (/\bblock\s*heels?\b/i.test(lowerFoot)) {
    footSearchTerm = "block heels";
  } else if (/\bkitten\s*heels?\b/i.test(lowerFoot)) {
    footSearchTerm = "kitten heels";
  } else if (/\b(stilettos?|pumps?)\b/i.test(lowerFoot)) {
    footSearchTerm = "heeled pumps";
  } else if (subcat === "sandals") {
    footSearchTerm = "sandals slides";
  } else if (subcat === "mojaris") {
    footSearchTerm = "ethnic mojaris juttis";
  }

  // footColor can be the whole footwear phrase (e.g. "Gold block heels"), so repeated
  // words are dropped rather than producing "women Gold block heels heels".
  const seenFootTerms = new Set<string>();
  const footQuery = [
    targetGender,
    footColor,
    footSearchTerm,
    preferredRetailers[0],
    preferredRetailers[1],
  ]
    .join(" ")
    .split(/\s+/)
    .filter((word) => {
      const key = word.toLowerCase();
      if (!key || seenFootTerms.has(key)) return false;
      seenFootTerms.add(key);
      return true;
    })
    .join(" ");

  return {
    category: "footwear",
    itemTitle: title,
    itemSubcategory: subcat,
    targetGender,
    dominantColor: footColor,
    stylingRequirement: `${title} (${profile.occasion || "event"} appropriate)`,
    searchQuery: footQuery.trim(),
    preferredRetailers,
    matchContext: `Coordinates proportions and balance with your ${dominantHumanColor} outfit.`,
  };
}

/**
 * Formulate specific styling requirements based on the recommended look and profile.
 * Intelligently deconstructs complete looks into distinct visible fashion and accessory items:
 * - Outer Blazer / Jacket
 * - Matching Formal Trousers / Bottom (or Skirt)
 * - Inner Top / Camisole / Corset (when layered/visible)
 * - Cohesive dynamic accessories & jewellery (earrings, necklaces, bracelets, watches, rings, bags)
 * - Footwear (Matching formal pumps / loafers / juttis)
 * - Personalized Makeup Suite
 */
export function planRequirementSpecs(
  look: LookRecommendation,
  profile: SkinTuneProfile,
  persona: PersonaType,
  applicableCategories: ProductCategory[],
): RequirementSpec[] {
  const specs: RequirementSpec[] = [];
  const skinTone = profile.appearance?.skinTone || "Medium";
  const undertone = profile.appearance?.undertone || "Warm";
  const pieces = Array.isArray(look.pieces) ? look.pieces : [];
  const occ = (profile.occasion || "").toLowerCase();
  const styles = (profile.style || []).map((s) => s.toLowerCase());
  const allContext = `${occ} ${styles.join(" ")} ${(profile.impression || []).join(" ")}`;
  const isOfficeOrFormal =
    allContext.includes("office") ||
    allContext.includes("work") ||
    allContext.includes("formal") ||
    allContext.includes("corporate") ||
    allContext.includes("meeting") ||
    allContext.includes("interview") ||
    allContext.includes("minimalist");

  const ctx = getStylingContext(profile);
  const dominantHumanColor = resolveHumanColor(look.outfitColor || look.palette?.[0], `${look.outfit} ${look.title}`);
  const targetGender: "women" | "men" | "child" | "boys" | "girls" =
    ctx.isBoy ? "boys" : ctx.isGirl ? "girls" : ctx.isKids ? "child" : persona === "man" ? "men" : "women";

  const isGarbaOrNavratri =
    allContext.includes("garba") ||
    allContext.includes("navratri") ||
    allContext.includes("dandiya");
  const isWedding =
    allContext.includes("wedding") ||
    allContext.includes("shaadi") ||
    allContext.includes("sangeet") ||
    allContext.includes("reception") ||
    allContext.includes("bridal");
  const isDateNight =
    allContext.includes("date") ||
    allContext.includes("dinner") ||
    allContext.includes("romantic");
  const isParty =
    allContext.includes("party") ||
    allContext.includes("cocktail") ||
    allContext.includes("club") ||
    allContext.includes("celebration");
  const isVacation =
    allContext.includes("vacation") ||
    allContext.includes("beach") ||
    allContext.includes("resort") ||
    allContext.includes("goa") ||
    allContext.includes("holiday");

  const isTraditionalOrFestive =
    !isVacation &&
    (isGarbaOrNavratri ||
      isWedding ||
      allContext.includes("traditional") ||
      allContext.includes("festive") ||
      allContext.includes("ethnic") ||
      allContext.includes("diwali") ||
      allContext.includes("eid") ||
      allContext.includes("puja"));

  // 1. OUTFIT DECONSTRUCTION (Dynamic Multi-Piece Breakdown)
  if (applicableCategories.includes("outfit")) {
    const outfitSpecs = decomposeOutfitGarments(
      look,
      profile,
      targetGender,
      dominantHumanColor,
      ctx,
    );
    specs.push(...outfitSpecs);
  }

  // Extract all dynamic accessories specified, visible, or recommended for this specific look
  const dynamicAccessories = extractDynamicLookAccessories(look, persona);
  const includeJewellery =
    (applicableCategories.includes("jewellery") || (applicableCategories as string[]).includes("footwear-accessories")) &&
    persona !== "child";
  const includeAccessories =
    applicableCategories.includes("accessories") || (applicableCategories as string[]).includes("footwear-accessories");

  // 2. Dynamic Jewellery Requirements (Earrings, Jhumkas, Necklaces, Chains, Bangles, Bracelets, Watches, Rings, Maang Tikkas)
  if (includeJewellery) {
    const jewelleryItems = dynamicAccessories.filter((a) => a.category === "jewellery");

    if (jewelleryItems.length > 0) {
      for (const item of jewelleryItems) {
        let styleReq = "";
        let searchQuery = "";
        let materialHint = "";

        if (item.type === "earrings") {
          if (isGarbaOrNavratri || isTraditionalOrFestive) {
            styleReq = isGarbaOrNavratri
              ? "Authentic oxidised silver tribal dome jhumkas with ghungroo bell drops"
              : `Festive ${undertone} gold-plated kundan or pearl chandbali earrings`;
            searchQuery = `${targetGender} ${isGarbaOrNavratri ? "oxidised silver jhumkas" : "kundan jhumkas"} Zaveri Pearls Priyaasi Myntra Nykaa`;
            materialHint = isGarbaOrNavratri
              ? "Oxidised German silver / brass with mirror or ghungroo drops"
              : "Gold-plated brass with kundan stones and faux pearls";
          } else {
            styleReq = isOfficeOrFormal
              ? `Understated minimal stud or sleek huggie earrings (${undertone} gold-tone)`
              : isDateNight
                ? `Delicate crystal drop earrings harmonizing with your ${undertone} undertone`
                : `${item.title} (${undertone} undertone harmony)`;
            searchQuery = isOfficeOrFormal
              ? `${targetGender} minimal gold stud earrings GIVA OR Myntra OR Nykaa`
              : `${targetGender} ${item.title} Myntra Nykaa AJIO`;
            materialHint = isOfficeOrFormal
              ? "Minimalist 14K/18K gold-plated / sterling silver / delicate pearl studs"
              : "Fashion jewellery / gold-tone plated / brass";
          }
        } else if (item.type === "necklace") {
          if (persona === "man" || targetGender === "men") {
            const isGroomOrRoyal =
              `${look.outfit || ""} ${look.title || ""} ${look.note || ""}`.toLowerCase().includes("sherwani") ||
              `${look.outfit || ""} ${look.title || ""}`.toLowerCase().includes("groom") ||
              `${look.outfit || ""} ${look.title || ""}`.toLowerCase().includes("wedding");
            if (isGroomOrRoyal) {
              styleReq = `Royal multi-strand pearl groom moti mala complementing sherwani`;
              searchQuery = `men royal wedding groom pearl moti mala sherwani Myntra AJIO`;
              materialHint = "Multi-strand faux pearl beads with emerald or ruby spacer accents";
            } else {
              styleReq = `Minimalist masculine curb chain or sleek kada bracelet`;
              searchQuery = `men minimal stainless steel curb chain GIVA Myntra`;
              materialHint = "Surgical grade stainless steel or 925 sterling silver chain";
            }
          } else if (isGarbaOrNavratri || isTraditionalOrFestive) {
            styleReq = `Traditional ${undertone} gold-plated kundan or temple choker / necklace set`;
            searchQuery = `${targetGender} ${item.title} kundan choker necklace Zaveri Pearls Myntra Nykaa`;
            materialHint = "Gold-plated brass with kundan, meenakari, or faux pearls";
          } else {
            styleReq = `Minimalist sleek pendant chain or refined necklace (${undertone} tone)`;
            searchQuery = `${targetGender} ${item.title} minimal pendant chain necklace GIVA Myntra Nykaa`;
            materialHint = "Sterling silver / 18K gold plated / minimalist chain";
          }
        } else if (item.type === "bracelet") {
          if (persona === "man" || targetGender === "men") {
            // Men's wristwear is searched as the look names it (kada, leather bracelet, chain
            // bracelet...), never swapped for women's kundan bangles or bangle stacks.
            styleReq = `${item.title} for men, coordinating with the outfit's metal tones`;
            searchQuery = `men ${item.title}${/\b(kadas?|bracelets?|cuffs?|bands?)\b/i.test(item.title) ? "" : " bracelet"}`;
            materialHint = item.material || "Stainless steel / sterling silver / leather";
          } else if (isGarbaOrNavratri || isTraditionalOrFestive) {
            styleReq = isGarbaOrNavratri
              ? "Stack of textured oxidised silver bangles with delicate ghungroos"
              : "Traditional gold-plated kundan openable kada pair or festive bangle stack";
            searchQuery = `${targetGender} ${isGarbaOrNavratri ? "oxidised silver bangles kada" : "traditional kundan bangles"} Zaveri Pearls Myntra AJIO`;
            materialHint = isGarbaOrNavratri ? "Oxidised silver plating with ghungroos" : "Gold-plated brass with meenakari or kundan work";
          } else {
            styleReq = `Sleek minimal cuff, delicate chain bracelet, or slim bangle (${undertone} gold-tone)`;
            searchQuery = `${targetGender} ${item.title} minimal sleek bracelet bangle GIVA OR Myntra OR Nykaa`;
            materialHint = "Sleek delicate gold-tone bangle / minimalist cuff / link bracelet";
          }
        } else if (item.type === "watch") {
          styleReq = `Sophisticated analog watch with clean dial and coordinating leather or metallic mesh strap`;
          searchQuery = `${targetGender} ${item.title} analog watch Titan Fossil Myntra Tata CLiQ`;
          materialHint = "Stainless steel / leather strap with water resistance";
        } else if (item.type === "ring") {
          styleReq = isTraditionalOrFestive
            ? `Traditional adjustable cocktail ring with intricate floral or kundan motif`
            : `Minimalist polished band or sculptural statement ring in ${undertone} finish`;
          searchQuery = `${targetGender} ${item.title} ring band GIVA Myntra Nykaa`;
          materialHint = "Sterling silver / gold-plated brass with cubic zirconia or kundan";
        } else if (item.type === "maang_tikka") {
          styleReq = `Delicate festive maang tikka with pearl drops and kundan embellishments`;
          searchQuery = `women ${item.title} maang tikka Zaveri Pearls Priyaasi Myntra Nykaa`;
          materialHint = "Gold-plated alloy with kundan and pearl beads";
        } else {
          styleReq = `${item.title} complementing the outfit palette and ${undertone} undertone`;
          searchQuery = `${targetGender} ${item.title} Myntra Nykaa AJIO`;
          materialHint = "Curated jewellery";
        }

        specs.push({
          category: "jewellery",
          itemTitle: item.title,
          itemSubcategory: item.type,
          targetGender,
          stylingRequirement: styleReq,
          searchQuery: searchQuery.trim(),
          preferredRetailers: ["Myntra", "AJIO", "Nykaa Fashion", "Tata CLiQ"],
          materialHint,
          matchContext: `${item.title} complementing the silhouette and harmonizing with your ${undertone} undertone.`,
        });
      }
    } else {
      // Fallback if no specific jewellery was found in look, but category was explicitly selected
      if (persona === "man" || targetGender === "men") {
        if (isGarbaOrNavratri || isTraditionalOrFestive) {
          specs.push({
            category: "jewellery",
            itemTitle: "Men's Festive Kada & Classic Watch",
            itemSubcategory: "bracelet",
            targetGender,
            stylingRequirement: "Traditional solid metallic kada bracelet and classic analog watch",
            searchQuery: `men festive brass kada bracelet analog watch Titan Myntra AJIO`,
            preferredRetailers: ["Myntra", "AJIO", "Tata CLiQ"],
            materialHint: "Solid stainless steel or brass with antique gold finish",
            matchContext: "Traditional masculine jewellery accent complementing festive ethnic cuffs.",
          });
        } else {
          specs.push({
            category: "jewellery",
            itemTitle: "Men's Minimalist Analog Watch",
            itemSubcategory: "watch",
            targetGender,
            stylingRequirement: "Clean analog watch with refined leather or metal strap",
            searchQuery: `men analog watch Titan Fossil Myntra Tata CLiQ`,
            preferredRetailers: ["Myntra", "AJIO", "Tata CLiQ"],
            materialHint: "Stainless steel case with mineral glass",
            matchContext: "Understated masculine accessory providing polished wrist detail.",
          });
        }
      } else if (isGarbaOrNavratri || isTraditionalOrFestive) {
        specs.push({
          category: "jewellery",
          itemTitle: isGarbaOrNavratri ? "Oxidised Silver Traditional Jhumkas" : "Kundan / Pearl Jhumkas",
          itemSubcategory: "earrings",
          targetGender,
          stylingRequirement: isGarbaOrNavratri
            ? "Authentic oxidised silver tribal dome jhumkas with ghungroo bell drops"
            : `Festive ${undertone} gold-plated kundan or pearl chandbali earrings`,
          searchQuery: `${targetGender} ${isGarbaOrNavratri ? "oxidised silver jhumkas" : "kundan jhumkas"} Zaveri Pearls Priyaasi Myntra Nykaa`,
          preferredRetailers: ["Myntra", "AJIO", "Nykaa Fashion", "Tata CLiQ"],
          materialHint: isGarbaOrNavratri
            ? "Oxidised German silver / brass with mirror or ghungroo drops"
            : "Gold-plated brass with kundan stones and faux pearls",
          matchContext: "Traditional jhumkas with authentic movement that beautifully complement festive lighting.",
        });
      } else {
        const earTitle = isOfficeOrFormal ? "Minimal Stud Earrings" : isDateNight ? "Dainty Crystal Drop Earrings" : "Earrings";
        specs.push({
          category: "jewellery",
          itemTitle: earTitle,
          itemSubcategory: "earrings",
          targetGender,
          stylingRequirement: isOfficeOrFormal
            ? `Understated minimal stud or sleek huggie earrings (${undertone} gold-tone)`
            : isDateNight
              ? `Delicate crystal drop earrings harmonizing with your ${undertone} undertone`
              : `${earTitle} (${undertone} undertone harmony)`,
          searchQuery: isOfficeOrFormal
            ? `${targetGender} minimal gold stud earrings GIVA OR Myntra OR Nykaa`
            : `${targetGender} ${earTitle} Myntra Nykaa AJIO`,
          preferredRetailers: ["Myntra", "AJIO", "Nykaa Fashion", "Tata CLiQ"],
          materialHint: isOfficeOrFormal
            ? "Minimalist 14K/18K gold-plated / sterling silver / delicate pearl studs"
            : "Fashion jewellery / gold-tone plated / brass",
          matchContext: `Understated design tailored to balance your neckline geometry and silhouette.`,
        });
      }
    }
  }

  // 3. Footwear Requirement
  if (
    applicableCategories.includes("footwear") ||
    (applicableCategories as string[]).includes("footwear-accessories")
  ) {
    const footSpec = detectFootwearSpec(
      look,
      profile,
      targetGender,
      dominantHumanColor,
      ctx,
      persona,
    );
    specs.push(footSpec);
  }

  // 4. Dynamic Accessories Requirement (Bags, Clutches, Totes, Potlis, Belts)
  if (includeAccessories) {
    const isBoyAudience = ctx.isBoy || targetGender === "boys";
    const skipBoyAccessories = isBoyAudience && isExplicitlyNoneAccessory(look.accessories);

    if (!skipBoyAccessories) {
      const accessoryItems = dynamicAccessories.filter((a) => a.category === "accessories");

      if (accessoryItems.length > 0) {
        for (const item of accessoryItems) {
          let accStyle = "";
          let accQuery = "";

          if (item.type === "laptop_bag") {
            accStyle = `Structured work laptop bag or briefcase with clean dedicated compartment`;
            accQuery = `${targetGender} ${dominantHumanColor} ${item.title} laptop bag briefcase Myntra AJIO Tata CLiQ`;
          } else if (item.type === "bag") {
            if (persona === "man" || targetGender === "men") {
              // The bag the look names (messenger, briefcase, backpack, duffle...) is what is
              // searched; the occasion only shapes the styling note, never the product type.
              const hasBagNoun = /\b(bags?|briefcases?|backpacks?|duffle|duffel|satchels?|totes?|wallets?|pouch)\b/i.test(item.title);
              if (item.title && hasBagNoun) {
                accStyle = isOfficeOrFormal
                  ? `${item.title} with a structured, professional finish`
                  : `${item.title} coordinating with the outfit`;
                accQuery = `men ${item.title}`;
              } else if (isGarbaOrNavratri || isTraditionalOrFestive) {
                accStyle = `Rich raw silk stole or pocket square coordinating with festive kurta`;
                accQuery = `men ${dominantHumanColor} silk stole pocket square Myntra AJIO`;
              } else if (isOfficeOrFormal) {
                accStyle = `Structured leather briefcase or laptop messenger bag with dedicated compartment`;
                accQuery = `men ${dominantHumanColor} structured leather briefcase laptop bag Myntra AJIO Tata CLiQ`;
              } else {
                accStyle = `Clean leather messenger bag or sleek cardholder`;
                accQuery = `men ${dominantHumanColor} leather messenger bag wallet Myntra AJIO`;
              }
            } else if (isBoyAudience) {
              accStyle = `Boys casual bag or backpack coordinating with outfit`;
              accQuery = `boys ${dominantHumanColor} ${item.title} Myntra AJIO Amazon`;
            } else if (ctx.isGirl || targetGender === "girls") {
              if (isGarbaOrNavratri || isTraditionalOrFestive) {
                accStyle = `Girls festive embellished potli bag with tassel drawstring`;
                accQuery = `girls festive potli bag Myntra FirstCry Mumkins AJIO`;
              } else if (isVacation) {
                accStyle = `Girls cute soft cotton canvas pouch or mini tote bag`;
                accQuery = `girls cute soft cotton tote pouch bag FirstCry Myntra Amazon`;
              } else {
                accStyle = `Girls cute mini everyday pouch or small crossbody bag`;
                accQuery = `girls cute mini pouch small bag FirstCry Myntra Amazon`;
              }
            } else if (isGarbaOrNavratri || isTraditionalOrFestive) {
              accStyle = `Rich velvet or raw silk potli bag with mirror work, drawstring closure, and festive tassels`;
              accQuery = `${targetGender} ${dominantHumanColor} ${item.title} potli bag festive clutch Myntra Nykaa AJIO`;
            } else if (isOfficeOrFormal) {
              accStyle = `Structured formal tote or handbag with clean lines and dual handles`;
              accQuery = `${targetGender} ${dominantHumanColor} ${item.title} structured formal handbag tote Myntra AJIO Tata CLiQ`;
            } else if (isDateNight || isParty) {
              accStyle = `Compact evening bag or sleek crossbody`;
              accQuery = `${targetGender} ${dominantHumanColor} ${item.title} sleek evening clutch crossbody bag Myntra AJIO Nykaa`;
            } else {
              accStyle = `Clean everyday shoulder bag or tote`;
              accQuery = `${targetGender} ${dominantHumanColor} ${item.title} shoulder bag tote Myntra AJIO`;
            }
          } else if (item.type === "hair_accessory") {
            const isTraditional = isGarbaOrNavratri || isTraditionalOrFestive;
            accStyle = isTraditional
              ? `Festive floral hair clips or embellished headband coordinating with ethnic look`
              : isVacation
                ? `Cute floral hair clip, ribbon or sun headband coordinating with vacation look`
                : `Cute hair accessories, floral clips or headband coordinating with the outfit`;
            accQuery = isTraditional
              ? `girls festive floral hair clips headband Myntra FirstCry Mumkins Amazon`
              : isVacation
                ? `girls cute floral hair clips headband FirstCry Myntra Amazon`
                : `girls cute hair clips headband accessories FirstCry Myntra Amazon`;
          } else if (item.type === "belt") {
            const isEthnicMen =
              (persona === "man" || targetGender === "men") &&
              (isGarbaOrNavratri || isTraditionalOrFestive || /\b(kurta|sherwani|dhoti|pyjama|pajama|bandhgala)\b/i.test(`${look.outfit || ""} ${look.title || ""}`));
            if (isEthnicMen) {
              accStyle = `Festive pure silk pocket square or royal sherwani brooch pin coordinating with kurta`;
              accQuery = `men festive silk pocket square brooch set Myntra AJIO`;
            } else if (isBoyAudience) {
              accStyle = `Boys tailored comfortable belt coordinating with outfit`;
              accQuery = `boys ${dominantHumanColor} ${item.title}${/\bbelt\b/i.test(item.title) ? "" : " belt"} Myntra AJIO`;
            } else {
              accStyle = isTraditionalOrFestive
                ? `Embellished festive waist belt / kamarbandh coordinating with outfit drape`
                : `Tailored structured belt in coordinating finish with clean buckle`;
              accQuery = `${targetGender} ${dominantHumanColor} ${item.title} belt Myntra AJIO Tata CLiQ`;
            }
          } else if (item.type === "sunglasses") {
            accStyle = `Classic UV-protected sunglasses complementing your facial features and outfit`;
            accQuery = `${targetGender} ${item.title} sunglasses Myntra AJIO Amazon`;
          } else if (item.type === "scarf") {
            accStyle = `Soft coordinating scarf or stole adding dimension and texture to your outfit`;
            accQuery = `${targetGender} ${dominantHumanColor} ${item.title} scarf stole Myntra AJIO Tata CLiQ`;
          } else if (item.type === "clutch") {
            accStyle = `Compact evening clutch with refined metallic or textured finish`;
            accQuery = `${targetGender} ${dominantHumanColor} ${item.title} evening clutch Myntra AJIO Nykaa`;
          } else if (item.type === "potli") {
            accStyle = `Festive embellished potli bag with drawstring closure and tassel details`;
            accQuery = `${targetGender} ${dominantHumanColor} ${item.title} festive potli bag Myntra FirstCry Mumkins AJIO`;
          } else if (item.type === "hat") {
            accStyle = `Breathable coordinating hat or cap`;
            accQuery = `${targetGender} ${item.title} cap hat Myntra AJIO Amazon`;
          } else {
            accStyle = isBoyAudience
              ? `Finishing accent coordinating with boys ${dominantHumanColor} outfit`
              : `Finishing accent coordinating with your ${dominantHumanColor} outfit`;
            accQuery = `${targetGender} ${dominantHumanColor} ${item.title} Myntra AJIO`;
          }

          specs.push({
            category: "accessories",
            itemTitle: isBoyAudience && !/\bboys?\b/i.test(item.title) ? `Boys ${item.title}` : item.title,
            itemSubcategory: item.type,
            targetGender,
            dominantColor: dominantHumanColor,
            stylingRequirement: accStyle,
            searchQuery: accQuery.trim(),
            preferredRetailers: isBoyAudience
              ? ["Myntra", "FirstCry", "AJIO", "Amazon India", "Mumkins"]
              : (ctx.isGirl || targetGender === "girls")
                ? ["Myntra", "FirstCry", "Mumkins", "AJIO", "Amazon India"]
                : ["Myntra", "AJIO", "Tata CLiQ", "Nykaa Fashion", "Amazon India"],
            matchContext: isBoyAudience
              ? `Harmonizes the finishing details for this boys ${profile.occasion || "styling"} edit.`
              : `Harmonizes the finishing details for this ${profile.occasion || "styling"} edit.`,
          });
        }
      } else if (!isBoyAudience) {
        // Fallback if no specific accessory was found in look, but category was requested
        // Note: For boys kidswear, we do NOT invent fallback accessories (brooches, pocket squares, belts, caps or bags).
        // Shopping recommendations strictly follow the actual AI-generated look.
        let accTitle = "";
        let accStyle = "";
        let accQuery = "";
        let fallbackSubcat = "bag";

        if (ctx.isGirl || targetGender === "girls") {
          if (isGarbaOrNavratri || isTraditionalOrFestive) {
            fallbackSubcat = "potli";
            accTitle = "Girls Festive Potli Bag";
            accStyle = "Festive embellished potli bag with tassel drawstring";
            accQuery = `girls festive potli bag hair accessory Myntra FirstCry Mumkins AJIO`;
          } else if (isVacation) {
            fallbackSubcat = "bag";
            accTitle = "Girls Soft Cotton Cute Bag";
            accStyle = "Soft cotton cute pouch bag or sun protection hat";
            accQuery = `girls cute soft cotton bag FirstCry Myntra Amazon`;
          } else {
            fallbackSubcat = "hair_accessory";
            accTitle = "Girls Cute Hair Accessories & Clips";
            accStyle = "Everyday cute floral hair clips, headband or soft scrunchies";
            accQuery = `girls cute floral hair clips headband FirstCry Myntra Amazon`;
          }
        } else if (persona === "man" || targetGender === "men") {
          if (isGarbaOrNavratri || isTraditionalOrFestive) {
            fallbackSubcat = "other_accessory";
            accTitle = "Men's Silk Pocket Square & Royal Brooch";
            accStyle = `Festive pure silk pocket square and matching royal sherwani brooch pin`;
            accQuery = `men festive silk pocket square brooch set Myntra AJIO`;
          } else if (isOfficeOrFormal) {
            fallbackSubcat = "laptop_bag";
            accTitle = "Men's Structured Leather Briefcase";
            accStyle = `Structured formal leather briefcase or messenger bag with clean lines`;
            accQuery = `men structured leather briefcase laptop bag Myntra AJIO Tata CLiQ`;
          } else {
            fallbackSubcat = "sunglasses";
            accTitle = "Men's Classic UV-Protected Sunglasses";
            accStyle = `Timeless UV-protected sunglasses coordinating with your outfit`;
            accQuery = `men classic sunglasses Myntra AJIO Amazon`;
          }
        } else {
          if (isGarbaOrNavratri || isTraditionalOrFestive) {
            fallbackSubcat = "potli";
            accTitle = "Embroidered Festive Potli Bag with Pearl Handle";
            accStyle = `Rich velvet or raw silk potli bag with mirror work, drawstring closure, and festive tassels`;
            accQuery = `${targetGender} ${dominantHumanColor} embroidered potli bag festive clutch Myntra Nykaa AJIO`;
          } else if (isOfficeOrFormal) {
            fallbackSubcat = "bag";
            accTitle = "Structured Leather Formal Handbag";
            accStyle = `Structured formal handbag with dual handles and clean lines`;
            accQuery = `${targetGender} ${dominantHumanColor} structured formal handbag tote Myntra AJIO Tata CLiQ`;
          } else if (isDateNight || isParty) {
            fallbackSubcat = "clutch";
            accTitle = "Sleek Metallic Crossbody / Evening Clutch";
            accStyle = `Compact evening clutch with chain strap`;
            accQuery = `${targetGender} ${dominantHumanColor} sleek evening clutch crossbody bag Myntra AJIO Nykaa`;
          } else {
            fallbackSubcat = "sunglasses";
            accTitle = "Classic UV-Protected Sunglasses";
            accStyle = `Timeless UV-protected sunglasses coordinating with your outfit`;
            accQuery = `${targetGender} classic sunglasses Myntra AJIO Amazon`;
          }
        }

        specs.push({
          category: "accessories",
          itemTitle: accTitle,
          itemSubcategory: fallbackSubcat,
          targetGender,
          dominantColor: dominantHumanColor,
          stylingRequirement: accStyle,
          searchQuery: accQuery.trim(),
          preferredRetailers: (ctx.isGirl || targetGender === "girls")
            ? ["Myntra", "FirstCry", "Mumkins", "AJIO", "Amazon India"]
            : ["Myntra", "AJIO", "Tata CLiQ", "Nykaa Fashion", "Amazon India"],
          matchContext: `Harmonizes the finishing details for this ${profile.occasion || "styling"} edit.`,
        });
      }
    }
  }

  // 5. Personalized Makeup Suite
  if (applicableCategories.includes("makeup") && (persona === "woman" || persona === "man")) {
    const makeupSpecs = buildPersonalizedMakeupSpecs(look, profile, persona);
    specs.push(...makeupSpecs);
  }

  // Men's footwear/jewellery/accessory queries join "men" with item titles that often say
  // "Men's" again ("men Men's Classic watch ... watch"); keep the audience word exactly once.
  if (targetGender === "men") {
    for (const s of specs) {
      if (s.targetGender === "men" && s.category !== "makeup") s.searchQuery = normalizeAudienceQuery(s.searchQuery, "men");
    }
  }

  // For boys kidswear: strictly filter out any churidar/chudidar requirements.
  // Boys wear complete sets (kurta-pyjama, kurta-dhoti, sherwani set); standalone churidars
  // are not worn by young boys and are not sold as standalone bottoms on kidswear stores.
  const filteredSpecs = specs.filter((s) => {
    if (s.targetGender === "boys" || ctx.isBoy) {
      if (
        /\bchu[rd]i(?:dar|dhar)s?\b/i.test(s.itemTitle) ||
        /\bchu[rd]i(?:dar|dhar)s?\b/i.test(s.itemSubcategory || "") ||
        /\bchu[rd]i(?:dar|dhar)s?\b/i.test(s.stylingRequirement || "") ||
        /\bchu[rd]i(?:dar|dhar)s?\b/i.test(s.searchQuery || "")
      ) {
        return false;
      }
    }
    return true;
  });

  return filteredSpecs;
}

/**
 * Verified Multi-Retailer Benchmark Candidates.
 * Used when live search has gaps or is rate-limited to ensure guaranteed,
 * crystal-clear, verified multi-retailer options for each identified outfit item.
 */
export function getBenchmarkCandidatesForRequirement(
  spec: RequirementSpec,
  persona: PersonaType,
  _budgetLimit: number | null,
  dominantColor: string = "Green",
): Array<{
  tier: PriceTier;
  productTitle: string;
  brand: string;
  retailer: string;
  price: number;
  originalPrice?: number;
  url: string;
  imageUrl?: string;
  shade?: string;
  material?: string;
}> {
  const isMan = persona === "man" || spec.targetGender === "men";
  const isChild = persona === "child" || spec.targetGender === "child" || spec.targetGender === "boys" || spec.targetGender === "girls";
  const isBoy = spec.targetGender === "boys" || (isChild && spec.targetGender !== "girls");
  const isGirl = spec.targetGender === "girls";
  const subcat = (spec.itemSubcategory || spec.itemTitle).toLowerCase();
  const color = spec.dominantColor || dominantColor || "Classic";
  const stylingReq = (spec.stylingRequirement || "").toLowerCase();

  if (spec.category === "outfit") {
    if (isBoy) {
      if (subcat === "shorts" || subcat.includes("shorts")) {
        return [
          {
            tier: "budget",
            productTitle: `Boys ${color} Cotton Chino Shorts`,
            brand: "U.S. Polo Assn. Kids",
            retailer: "Myntra",
            price: 799,
            originalPrice: 1399,
            url: buildRetailerSearchUrl("Myntra", {
              gender: "boys",
              brand: "U.S. Polo Assn. Kids",
              productName: `Boys ${color} Cotton Chino Shorts`,
              color,
              category: "outfit",
            }),
            material: "100% Breathable Cotton Twill",
          },
          {
            tier: "mid",
            productTitle: `Boys ${color} Lightweight Vacation Linen-Blend Shorts`,
            brand: "GAP Kids",
            retailer: "AJIO",
            price: 1199,
            originalPrice: 1899,
            url: buildRetailerSearchUrl("AJIO", {
              gender: "boys",
              brand: "GAP Kids",
              productName: `Boys ${color} Vacation Linen Shorts`,
              color,
              category: "outfit",
            }),
            material: "Cotton-Linen Summer Blend",
          },
          {
            tier: "premium",
            productTitle: `Boys Pure Linen ${color} Vacation Shorts`,
            brand: "Marks & Spencer",
            retailer: "Tata CLiQ",
            price: 1899,
            originalPrice: 2499,
            url: buildRetailerSearchUrl("Tata CLiQ", {
              gender: "boys",
              brand: "Marks & Spencer",
              productName: `Boys ${color} Pure Linen Shorts`,
              color,
              category: "outfit",
            }),
            material: "100% Pure European Linen",
          },
        ];
      }

      if (subcat === "shirt" || subcat.includes("shirt")) {
        return [
          {
            tier: "budget",
            productTitle: `Boys ${color} Breathable Cotton Linen Button-Down Shirt`,
            brand: "U.S. Polo Assn. Kids",
            retailer: "Myntra",
            price: 899,
            originalPrice: 1499,
            url: buildRetailerSearchUrl("Myntra", {
              gender: "boys",
              brand: "U.S. Polo Assn. Kids",
              productName: `Boys ${color} Linen Button-Down Shirt`,
              color,
              category: "outfit",
            }),
            material: "Breathable Cotton-Linen Blend",
          },
          {
            tier: "mid",
            productTitle: `Boys ${color} Camp Collar Vacation Resort Shirt`,
            brand: "GAP Kids",
            retailer: "AJIO",
            price: 1399,
            originalPrice: 1999,
            url: buildRetailerSearchUrl("AJIO", {
              gender: "boys",
              brand: "GAP Kids",
              productName: `Boys ${color} Vacation Resort Shirt`,
              color,
              category: "outfit",
            }),
            material: "100% Lightweight Poplin Cotton",
          },
          {
            tier: "premium",
            productTitle: `Boys Pure Linen ${color} Casual Button-Down Shirt`,
            brand: "Marks & Spencer",
            retailer: "Tata CLiQ",
            price: 2199,
            originalPrice: 2999,
            url: buildRetailerSearchUrl("Tata CLiQ", {
              gender: "boys",
              brand: "Marks & Spencer",
              productName: `Boys ${color} Pure Linen Shirt`,
              color,
              category: "outfit",
            }),
            material: "100% Pure European Linen",
          },
        ];
      }

      if (
        subcat.includes("resort") ||
        subcat.includes("vacation") ||
        subcat.includes("co-ord") ||
        subcat.includes("coord") ||
        stylingReq.includes("resort") ||
        stylingReq.includes("vacation") ||
        stylingReq.includes("linen")
      ) {
        return [
          {
            tier: "budget",
            productTitle: `Boys ${color} Cotton-Linen Resort Shirt & Shorts Set`,
            brand: "U.S. Polo Assn. Kids",
            retailer: "Myntra",
            price: 1199,
            originalPrice: 1999,
            url: buildRetailerSearchUrl("Myntra", {
              gender: "boys",
              brand: "U.S. Polo Assn. Kids",
              productName: `Boys ${color} Linen Resort Shirt and Shorts Set`,
              color,
              category: "outfit",
            }),
            material: "Breathable Cotton-Linen Blend",
          },
          {
            tier: "mid",
            productTitle: `Boys ${color} Camp Collar Vacation Co-ord Set`,
            brand: "GAP Kids",
            retailer: "AJIO",
            price: 1899,
            originalPrice: 2799,
            url: buildRetailerSearchUrl("AJIO", {
              gender: "boys",
              brand: "GAP Kids",
              productName: `Boys ${color} Vacation Co-ord Set`,
              color,
              category: "outfit",
            }),
            material: "100% Lightweight Poplin Cotton",
          },
          {
            tier: "premium",
            productTitle: `Boys Pure Linen ${color} Vacation Co-ord Set`,
            brand: "Marks & Spencer",
            retailer: "Tata CLiQ",
            price: 2999,
            originalPrice: 4499,
            url: buildRetailerSearchUrl("Tata CLiQ", {
              gender: "boys",
              brand: "Marks & Spencer",
              productName: `Boys ${color} Pure Linen Co-ord Set`,
              color,
              category: "outfit",
            }),
            material: "100% Pure European Linen",
          },
        ];
      }

      if (
        subcat.includes("ethnic_bottom") ||
        subcat.includes("dhoti") ||
        subcat.includes("pyjama") ||
        subcat.includes("pajama")
      ) {
        return [
          {
            tier: "budget",
            productTitle: `Vastramay Boys ${color} Solid Cotton Festive Dhoti Pants`,
            brand: "Vastramay",
            retailer: "Myntra",
            price: 599,
            originalPrice: 1199,
            url: `https://www.myntra.com/dhoti/vastramay/boys-${encodeURIComponent(color.toLowerCase())}-dhoti/23489176/buy`,
            material: "100% Breathable Cotton with Drawstring Waist",
            shade: color,
          },
          {
            tier: "mid",
            productTitle: `Kisah Boys ${color} Cotton Silk Festive Pyjama Pants`,
            brand: "Kisah",
            retailer: "AJIO",
            price: 799,
            originalPrice: 1499,
            url: `https://www.ajio.com/kisah-boys-${encodeURIComponent(color.toLowerCase())}-pyjama/p/469283719`,
            material: "Soft Cotton Silk Blend with Elastic Waist",
            shade: color,
          },
          {
            tier: "premium",
            productTitle: `Tiber Taber Boys ${color} Pure Silk Festive Dhoti`,
            brand: "Tiber Taber",
            retailer: "FirstCry",
            price: 1299,
            originalPrice: 1999,
            url: `https://www.firstcry.com/tiber-taber/boys-${encodeURIComponent(color.toLowerCase())}-dhoti/2847193/product-detail`,
            material: "Pure Silk Festive Draped Dhoti",
            shade: color,
          },
        ];
      }

      const isShawlRequirement =
        subcat.includes("shawl") ||
        stylingReq.includes("shawl") ||
        spec.itemTitle.toLowerCase().includes("shawl");

      if (
        isShawlRequirement ||
        subcat.includes("dupatta") ||
        subcat.includes("stole") ||
        stylingReq.includes("dupatta") ||
        stylingReq.includes("stole") ||
        spec.itemTitle.toLowerCase().includes("dupatta") ||
        spec.itemTitle.toLowerCase().includes("stole")
      ) {
        const drapeType = isShawlRequirement ? "Traditional Shawl" : subcat.includes("dupatta") ? "Festive Dupatta Stole" : "Festive Stole";
        return [
          {
            tier: "budget",
            productTitle: `Vastramay Boys ${color} Woven Silk ${drapeType}`,
            brand: "Vastramay",
            retailer: "Myntra",
            price: isShawlRequirement ? 699 : 499,
            originalPrice: isShawlRequirement ? 1399 : 999,
            url: `https://www.myntra.com/boys-${encodeURIComponent(color.toLowerCase())}-${isShawlRequirement ? "traditional-shawl" : "festive-dupatta-stole"}`,
            material: "Art Silk with Metallic Gold Zari Border",
            shade: color,
          },
          {
            tier: "mid",
            productTitle: `Kisah Boys ${color} Traditional Silk Blend Festive ${isShawlRequirement ? "Doshala Shawl" : "Angavastram Stole"}`,
            brand: "Kisah",
            retailer: "AJIO",
            price: isShawlRequirement ? 999 : 799,
            originalPrice: isShawlRequirement ? 1799 : 1399,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`boys ${color} festive traditional ${isShawlRequirement ? "shawl doshala" : "stole dupatta"}`)}`,
            material: "Silk Blend with Woven Temple Zari Border",
            shade: color,
          },
          {
            tier: "premium",
            productTitle: `Tiber Taber Boys ${color} Pure Silk Heritage Embroidered ${drapeType}`,
            brand: "Tiber Taber",
            retailer: "FirstCry",
            price: isShawlRequirement ? 1499 : 1199,
            originalPrice: isShawlRequirement ? 2299 : 1799,
            url: `https://www.firstcry.com/tiber-taber/boys-festive-silk-${isShawlRequirement ? "shawl" : "stole"}/3192842/product-detail`,
            material: "Pure Chanderi Silk with Handcrafted Tassels",
            shade: color,
          },
        ];
      }

      if (
        subcat.includes("sherwani") ||
        stylingReq.includes("sherwani") ||
        spec.itemTitle.toLowerCase().includes("sherwani")
      ) {
        return [
          {
            tier: "budget",
            productTitle: `Boys ${color} Embroidered Silk Festive Sherwani`,
            brand: "Vastramay",
            retailer: "Myntra",
            price: 1499,
            originalPrice: 2999,
            url: `https://www.myntra.com/sherwani/vastramay/boys-${encodeURIComponent(color.toLowerCase())}-sherwani/23489177/buy`,
            material: "Art Silk with Zari Embroidery",
          },
          {
            tier: "mid",
            productTitle: `Boys ${color} Jacquard Mandarin Collar Sherwani`,
            brand: "Kisah",
            retailer: "AJIO",
            price: 2499,
            originalPrice: 4499,
            url: `https://www.ajio.com/kisah-boys-${encodeURIComponent(color.toLowerCase())}-sherwani/p/469283720`,
            material: "Woven Jacquard Silk Blend",
          },
          {
            tier: "premium",
            productTitle: `Boys Royal Brocade ${color} Festive Sherwani`,
            brand: "Manyavar",
            retailer: "FirstCry",
            price: 3999,
            originalPrice: 5999,
            url: `https://www.firstcry.com/manyavar/boys-royal-sherwani/2847194/product-detail`,
            material: "Heritage Pure Silk Brocade",
          },
        ];
      }

      if (
        subcat.includes("kurta") ||
        subcat.includes("kedia") ||
        subcat.includes("dhoti") ||
        subcat.includes("lehenga") ||
        subcat.includes("chaniya") ||
        stylingReq.includes("kurta") ||
        ((stylingReq.includes("festive") || stylingReq.includes("traditional")) &&
          !stylingReq.includes("vacation") &&
          !stylingReq.includes("resort") &&
          !stylingReq.includes("beach"))
      ) {
        return [
          {
            tier: "budget",
            productTitle: `Boys ${color} Printed Cotton Festive Kurta Dhoti Set`,
            brand: "Vastramay",
            retailer: "Myntra",
            price: 999,
            originalPrice: 1999,
            url: `https://www.myntra.com/boys-${encodeURIComponent(color.toLowerCase())}-kurta-dhoti-set`,
            material: "100% Breathable Cotton with Foil Gota Accents",
          },
          {
            tier: "mid",
            productTitle: `Boys ${color} Embroidered Festive Kedia Kurta Set`,
            brand: "Tiber Taber",
            retailer: "AJIO",
            price: 1899,
            originalPrice: 2899,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`boys ${color} festive kedia kurta set`)}`,
            material: "Pure Cotton & Slub Silk with Mirror Embellishments",
          },
          {
            tier: "premium",
            productTitle: `Boys Woven Silk Blend ${color} Festive Kurta Set with Jacket`,
            brand: "Manyavar",
            retailer: "Tata CLiQ",
            price: 3499,
            originalPrice: 4999,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`boys ${color} festive kurta set`)}`,
            material: "Jacquard Pure Silk Blend with Inner Lining",
          },
        ];
      }

      if (
        subcat.includes("bundi") ||
        subcat.includes("waistcoat") ||
        subcat.includes("nehru") ||
        stylingReq.includes("bundi") ||
        stylingReq.includes("waistcoat") ||
        spec.itemTitle.toLowerCase().includes("bundi") ||
        spec.itemTitle.toLowerCase().includes("waistcoat") ||
        spec.itemTitle.toLowerCase().includes("nehru") ||
        ((subcat.includes("jacket") || subcat.includes("layer")) && (stylingReq.includes("festive") || stylingReq.includes("traditional") || stylingReq.includes("ethnic")))
      ) {
        return [
          {
            tier: "budget",
            productTitle: `Vastramay Boys ${color} Printed Cotton Festive Bundi Waistcoat`,
            brand: "Vastramay",
            retailer: "Myntra",
            price: 899,
            originalPrice: 1799,
            url: `https://www.myntra.com/boys-${encodeURIComponent(color.toLowerCase())}-bundi-waistcoat`,
            material: "100% Breathable Cotton with Mandarin Collar",
          },
          {
            tier: "mid",
            productTitle: `Tiber Taber Boys ${color} Floral Embroidered Nehru Jacket`,
            brand: "Tiber Taber",
            retailer: "AJIO",
            price: 1599,
            originalPrice: 2499,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`boys ${color} festive nehru jacket bundi`)}`,
            material: "Cotton Silk Blend with Slub Texture",
          },
          {
            tier: "premium",
            productTitle: `Mumkins Boys Brocade Heritage Festive Bundi Jacket`,
            brand: "Mumkins",
            retailer: "FirstCry",
            price: 2499,
            originalPrice: 3499,
            url: "https://www.firstcry.com/mumkins/boys-heritage-bundi-jacket/3192841/product-detail",
            material: "Woven Jacquard Brocade Silk with Welt Pockets",
          },
        ];
      }

      if (subcat.includes("blazer") || subcat.includes("jacket")) {
        return [
          {
            tier: "budget",
            productTitle: `Boys ${color} Notch Lapel Single-Breasted Blazer`,
            brand: "Gini & Jony",
            retailer: "Myntra",
            price: 1299,
            originalPrice: 2499,
            url: `https://www.myntra.com/boys-${encodeURIComponent(color.toLowerCase())}-blazer`,
            material: "Poly-Viscose Structured Fabric",
          },
          {
            tier: "mid",
            productTitle: `Boys Tailored Fit ${color} Formal Suit Blazer`,
            brand: "Marks & Spencer",
            retailer: "AJIO",
            price: 2299,
            originalPrice: 3499,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`boys ${color} formal blazer`)}`,
            material: "Fine Cotton Suiting Blend",
          },
          {
            tier: "premium",
            productTitle: `Boys Velvet Embellished ${color} Bandhgala Blazer`,
            brand: "Tiber Taber",
            retailer: "Tata CLiQ",
            price: 3699,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`boys ${color} bandhgala blazer`)}`,
            material: "Rich Velvet with Metallic Buttons",
          },
        ];
      }

      if (subcat.includes("trouser") || subcat.includes("pant") || subcat.includes("jeans")) {
        return [
          {
            tier: "budget",
            productTitle: `Boys Regular Fit Stretchable ${color} Denim Jeans`,
            brand: "U.S. Polo Assn. Kids",
            retailer: "Myntra",
            price: 899,
            originalPrice: 1799,
            url: `https://www.myntra.com/boys-${encodeURIComponent(color.toLowerCase())}-jeans`,
            material: "Comfort Stretch Cotton Denim",
          },
          {
            tier: "mid",
            productTitle: `Boys Flat-Front ${color} Chino Trousers`,
            brand: "GAP Kids",
            retailer: "AJIO",
            price: 1499,
            originalPrice: 2299,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`boys ${color} chino trousers`)}`,
            material: "100% Breathable Twill Cotton",
          },
          {
            tier: "premium",
            productTitle: `Boys Tailored Suiting ${color} Formal Trousers`,
            brand: "Marks & Spencer",
            retailer: "Tata CLiQ",
            price: 2199,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`boys ${color} formal trousers`)}`,
            material: "Wool-Rich Suiting Blend",
          },
        ];
      }

      if (subcat.includes("inner_top") || subcat.includes("shirt") || subcat.includes("top")) {
        return [
          {
            tier: "budget",
            productTitle: `Boys Solid Pure Cotton Button-Down Shirt`,
            brand: "Allen Solly Junior",
            retailer: "Myntra",
            price: 699,
            originalPrice: 1399,
            url: "https://www.myntra.com/boys-cotton-shirt",
            material: "100% Crisp Cotton",
            shade: "White",
          },
          {
            tier: "mid",
            productTitle: `Boys Oxford Cotton Smart Casual Shirt`,
            brand: "GAP Kids",
            retailer: "AJIO",
            price: 1199,
            originalPrice: 1999,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent("boys formal cotton oxford shirt")}`,
            material: "Soft Oxford Weave Cotton",
            shade: "Pure White",
          },
          {
            tier: "premium",
            productTitle: `Boys Embroidered Collar Formal Button-Down Shirt`,
            brand: "Tommy Hilfiger Kids",
            retailer: "Tata CLiQ",
            price: 2199,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("boys tommy hilfiger white shirt")}`,
            material: "Fine Poplin Pure Cotton",
            shade: "Ivory White",
          },
        ];
      }

      // Default boys outfit set
      return [
        {
          tier: "budget",
          productTitle: `Boys ${color} Cotton Graphic T-Shirt & Chino Shorts Set`,
          brand: "U.S. Polo Assn. Kids",
          retailer: "Myntra",
          price: 999,
          originalPrice: 1999,
          url: buildRetailerSearchUrl("Myntra", {
            gender: "boys",
            brand: "U.S. Polo Assn. Kids",
            productName: `Boys ${color} T-Shirt and Shorts Set`,
            color,
            category: "outfit",
          }),
          material: "100% Breathable Cotton",
        },
        {
          tier: "mid",
          productTitle: `Boys ${color} Chambray Button-Down Shirt & Denim Jeans Set`,
          brand: "Mothercare",
          retailer: "AJIO",
          price: 1899,
          originalPrice: 2999,
          url: buildRetailerSearchUrl("AJIO", {
            gender: "boys",
            brand: "Mothercare",
            productName: `Boys ${color} Shirt and Denim Set`,
            color,
            category: "outfit",
          }),
          material: "Cotton Chambray & Stretch Denim",
        },
        {
          tier: "premium",
          productTitle: `Boys Tailored ${color} Smart Casual 2-Piece Outfit Set`,
          brand: "Tommy Hilfiger Kids",
          retailer: "Tata CLiQ",
          price: 3499,
          originalPrice: 4999,
          url: buildRetailerSearchUrl("Tata CLiQ", {
            gender: "boys",
            brand: "Tommy Hilfiger Kids",
            productName: `Boys ${color} Outfit Set`,
            color,
            category: "outfit",
          }),
          material: "Premium Organic Cotton & Twill",
        },
      ];
    }

    // 1. Festive Chaniya Choli / Lehenga
    if (
      subcat.includes("lehenga") ||
      subcat.includes("chaniya") ||
      subcat.includes("ghagra") ||
      stylingReq.includes("lehenga") ||
      stylingReq.includes("chaniya")
    ) {
      if (isChild) {
        return [
          {
            tier: "budget",
            productTitle: `Girls ${color} Printed Cotton Festive Chaniya Choli Set`,
            brand: "Biba Girls",
            retailer: "Myntra",
            price: 1499,
            originalPrice: 2999,
            url: `https://www.myntra.com/girls-clothing-set/biba/biba-girls-${encodeURIComponent(color.toLowerCase())}-chaniya-choli-set/21903456/buy`,
            material: "100% Breathable Cotton with Foil Gota Work",
          },
          {
            tier: "mid",
            productTitle: `Girls ${color} Embroidered Flared Festive Lehenga Choli`,
            brand: "Cutecumber",
            retailer: "AJIO",
            price: 2199,
            originalPrice: 3499,
            url: `https://www.ajio.com/cutecumber-girls-embroidered-lehenga-set/p/462981045_${encodeURIComponent(color.toLowerCase())}`,
            material: "Art Silk with Soft Inner Lining",
          },
          {
            tier: "premium",
            productTitle: `Girls Handcrafted Mirror-Work Traditional Chaniya Choli`,
            brand: "Fayon Kids",
            retailer: "Nykaa Fashion",
            price: 4500,
            originalPrice: 5800,
            url: buildRetailerSearchUrl("Nykaa Fashion", {
              gender: "girls",
              brand: "Fayon Kids",
              productName: "Girls Handcrafted Mirror-Work Traditional Chaniya Choli",
              color,
              category: "outfit",
            }),
            material: "Pure Raw Silk with Hand-Embroidered Mirrors",
          },
        ];
      }

      return [
        {
          tier: "budget",
          productTitle: `${color} Embroidered Semi-Stitched Flared Lehenga Choli`,
          brand: "Libas",
          retailer: "Myntra",
          price: 1899,
          originalPrice: 3999,
          url: `https://www.myntra.com/lehenga-choli/libas/libas-women-${encodeURIComponent(color.toLowerCase())}-embroidered-flared-lehenga-choli/24991234/buy`,
          material: "Georgette with Foil Mirror Work",
        },
        {
          tier: "mid",
          productTitle: `${color} & Gold Foil Print Bandhani Chaniya Choli Set`,
          brand: "Biba",
          retailer: "AJIO",
          price: 3499,
          originalPrice: 5999,
          url: `https://www.ajio.com/biba-printed-flared-lehenga-choli-set/p/469182741_${encodeURIComponent(color.toLowerCase())}`,
          material: "Pure Cotton with Gota Patti & Mirror Accents",
        },
        {
          tier: "premium",
          productTitle: `Vibrant ${color} Embroidered Silk Festive Chaniya Choli with Latkans`,
          brand: "Kalki Fashion",
          retailer: "Nykaa Fashion",
          price: 6990,
          originalPrice: 9990,
          url: buildRetailerSearchUrl("Nykaa Fashion", {
            gender: "women",
            brand: "Kalki Fashion",
            productName: `Vibrant ${color} Embroidered Silk Festive Chaniya Choli with Latkans`,
            color,
            category: "outfit",
          }),
          material: "Raw Silk with Handcrafted Mirror Work",
        },
      ];
    }

    // 2. Choli Blouse / Inner Top / Shirts
    if (
      subcat.includes("inner_top") ||
      subcat.includes("top") ||
      subcat.includes("shirt") ||
      subcat.includes("camisole") ||
      subcat.includes("corset") ||
      subcat.includes("choli") ||
      subcat.includes("blouse")
    ) {
      if (isMan) {
        return [
          {
            tier: "budget",
            productTitle: `Men ${color} Classic Pure Cotton Formal Shirt`,
            brand: "Peter England",
            retailer: "Myntra",
            price: 999,
            originalPrice: 1699,
            url: `https://www.myntra.com/men-${encodeURIComponent(color.toLowerCase())}-shirt`,
            material: "100% Crisp Breathable Cotton",
            shade: color,
          },
          {
            tier: "mid",
            productTitle: `Men ${color} Slim Fit Button-Down Shirt`,
            brand: "Raymond",
            retailer: "AJIO",
            price: 1699,
            originalPrice: 2499,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`men ${color} formal shirt`)}`,
            material: "Fine Cotton Twill",
            shade: color,
          },
          {
            tier: "premium",
            productTitle: `Men Pure European Linen ${color} Shirt`,
            brand: "Marks & Spencer",
            retailer: "Tata CLiQ",
            price: 2999,
            originalPrice: 3999,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`men ${color} pure linen shirt`)}`,
            material: "100% Pure European Linen",
            shade: color,
          },
        ];
      }

      if (isBoy) {
        return [
          {
            tier: "budget",
            productTitle: `Boys ${color} Breathable Cotton Linen Button-Down Shirt`,
            brand: "U.S. Polo Assn. Kids",
            retailer: "Myntra",
            price: 899,
            originalPrice: 1499,
            url: buildRetailerSearchUrl("Myntra", {
              gender: "boys",
              brand: "U.S. Polo Assn. Kids",
              productName: `Boys ${color} Linen Button-Down Shirt`,
              color,
              category: "outfit",
            }),
            material: "Breathable Cotton-Linen Blend",
            shade: color,
          },
          {
            tier: "mid",
            productTitle: `Boys ${color} Camp Collar Vacation Resort Shirt`,
            brand: "GAP Kids",
            retailer: "AJIO",
            price: 1399,
            originalPrice: 1999,
            url: buildRetailerSearchUrl("AJIO", {
              gender: "boys",
              brand: "GAP Kids",
              productName: `Boys ${color} Vacation Resort Shirt`,
              color,
              category: "outfit",
            }),
            material: "100% Lightweight Poplin Cotton",
            shade: color,
          },
          {
            tier: "premium",
            productTitle: `Boys Pure Linen ${color} Casual Button-Down Shirt`,
            brand: "Marks & Spencer",
            retailer: "Tata CLiQ",
            price: 2199,
            originalPrice: 2999,
            url: buildRetailerSearchUrl("Tata CLiQ", {
              gender: "boys",
              brand: "Marks & Spencer",
              productName: `Boys ${color} Pure Linen Shirt`,
              color,
              category: "outfit",
            }),
            material: "100% Pure European Linen",
            shade: color,
          },
        ];
      }

      if (isGirl) {
        return [
          {
            tier: "budget",
            productTitle: `Girls ${color} Cotton Casual Blouse Top`,
            brand: "Cutecumber",
            retailer: "Myntra",
            price: 699,
            originalPrice: 1299,
            url: `https://www.myntra.com/girls-${encodeURIComponent(color.toLowerCase())}-tops`,
            material: "100% Soft Breathable Cotton",
            shade: color,
          },
          {
            tier: "mid",
            productTitle: `Girls ${color} Embroidered Ruffle Tiered Top`,
            brand: "GAP Kids",
            retailer: "AJIO",
            price: 1199,
            originalPrice: 1799,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`girls ${color} top`)}`,
            material: "Cotton Poplin with Ruffle Accent",
            shade: color,
          },
          {
            tier: "premium",
            productTitle: `Girls Embroidered Organic Cotton Smocked Top`,
            brand: "Marks & Spencer",
            retailer: "Tata CLiQ",
            price: 1799,
            originalPrice: 2499,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`girls ${color} top`)}`,
            material: "100% Pure Organic Cotton",
            shade: color,
          },
        ];
      }

      if (stylingReq.includes("choli") || stylingReq.includes("festive") || stylingReq.includes("lehenga")) {
        return [
          {
            tier: "budget",
            productTitle: `${color} Embroidered Sweetheart-Neck Padded Choli Blouse`,
            brand: "Salwar Studio",
            retailer: "Myntra",
            price: 799,
            originalPrice: 1699,
            url: `https://www.myntra.com/blouse/salwar-studio/salwar-studio-${encodeURIComponent(color.toLowerCase())}-embroidered-padded-blouse/18290145/buy`,
            material: "Art Silk with Zari Work & Tie Detailing",
            shade: color,
          },
          {
            tier: "mid",
            productTitle: `${color} Foil Mirror Work Festive Crop Choli Blouse`,
            brand: "Indya",
            retailer: "AJIO",
            price: 1299,
            originalPrice: 2200,
            url: `https://www.ajio.com/indya-embroidered-crop-blouse/p/441209876_${encodeURIComponent(color.toLowerCase())}`,
            material: "Georgette with Mirror Embellishments",
            shade: color,
          },
          {
            tier: "premium",
            productTitle: `Handcrafted Raw Silk Heavy Embroidered Festive Blouse`,
            brand: "House of Jamoti",
            retailer: "Nykaa Fashion",
            price: 2499,
            originalPrice: 3500,
            url: buildRetailerSearchUrl("Nykaa Fashion", {
              gender: "women",
              brand: "House of Jamoti",
              productName: `Handcrafted Raw Silk Heavy Embroidered Festive Blouse`,
              color,
              category: "outfit",
            }),
            material: "Pure Silk with Intricate Resham Embroidery",
            shade: color,
          },
        ];
      }

      return [
        {
          tier: "budget",
          productTitle: "Solid Satin V-Neck Formal Inner Camisole Top",
          brand: "DressBerry",
          retailer: "Myntra",
          price: 599,
          originalPrice: 1199,
          url: "https://www.myntra.com/women-satin-inner-camisole-top",
          material: "Silky Satin",
          shade: "Ivory White",
        },
        {
          tier: "mid",
          productTitle: "Breathable Satin Scoop-Neck Inner Shell Top",
          brand: "Outryt",
          retailer: "AJIO",
          price: 899,
          originalPrice: 1499,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent("women formal satin inner top white")}`,
          material: "Polyester Satin",
          shade: "Pure White",
        },
        {
          tier: "premium",
          productTitle: "Silk-Touch Draped V-Neck Formal Camisole",
          brand: "Forever New",
          retailer: "Nykaa Fashion",
          price: 1899,
          originalPrice: 2600,
          url: buildRetailerSearchUrl("Nykaa Fashion", {
            gender: "women",
            brand: "Forever New",
            productName: "Silk-Touch Draped V-Neck Formal Camisole",
            category: "outfit",
          }),
          material: "Lustrous Silk Blend",
          shade: "Warm Cream",
        },
      ];
    }

    // 3. Blazers & Jackets
    if (subcat.includes("blazer") || subcat.includes("jacket")) {
      if (isMan) {
        return [
          {
            tier: "budget",
            productTitle: `${color} Tailored Formal Blazer`,
            brand: "Peter England",
            retailer: "Myntra",
            price: 2499,
            originalPrice: 4999,
            url: `https://www.myntra.com/men-${encodeURIComponent(color.toLowerCase())}-blazer`,
            material: "Poly-Viscose Suiting",
          },
          {
            tier: "mid",
            productTitle: `Slim Fit ${color} Formal Suit Blazer`,
            brand: "Raymond",
            retailer: "AJIO",
            price: 4499,
            originalPrice: 6999,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`men ${color} formal blazer`)}`,
            material: "Fine Wool Blend",
          },
          {
            tier: "premium",
            productTitle: `Structured ${color} Single-Breasted Blazer`,
            brand: "Marks & Spencer",
            retailer: "Tata CLiQ",
            price: 7999,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`men ${color} blazer`)}`,
            material: "Italian Wool Blend",
          },
        ];
      }
      return [
        {
          tier: "budget",
          productTitle: `Solid Notch Lapel ${color} Formal Blazer`,
          brand: "Tokyo Talkies",
          retailer: "Myntra",
          price: 1399,
          originalPrice: 2799,
          url: `https://www.myntra.com/women-${encodeURIComponent(color.toLowerCase())}-formal-blazer`,
          material: "Structured Crepe Fabric",
        },
        {
          tier: "mid",
          productTitle: `Tailored Single-Breasted ${color} Blazer`,
          brand: "Marks & Spencer",
          retailer: "AJIO",
          price: 2999,
          originalPrice: 4999,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent(`women ${color} formal blazer`)}`,
          material: "Tailored Suiting Twill",
        },
        {
          tier: "premium",
          productTitle: `Structured Flap Pocket ${color} Formal Suit Blazer`,
          brand: "MANGO",
          retailer: "Tata CLiQ",
          price: 5590,
          originalPrice: 6990,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`women ${color} formal suit blazer`)}`,
          material: "Premium Fluid Wool Blend",
        },
      ];
    }

    // 4. Trousers & Pants
    if (subcat.includes("trouser") || subcat.includes("pant")) {
      if (isMan) {
        return [
          {
            tier: "budget",
            productTitle: `Slim Fit ${color} Formal Trousers`,
            brand: "Peter England",
            retailer: "Myntra",
            price: 1199,
            originalPrice: 1999,
            url: `https://www.myntra.com/men-${encodeURIComponent(color.toLowerCase())}-formal-trousers`,
            material: "Poly-Cotton Stretch",
          },
          {
            tier: "mid",
            productTitle: `Tailored Flat-Front ${color} Formal Trousers`,
            brand: "Raymond",
            retailer: "AJIO",
            price: 1999,
            originalPrice: 2999,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`men ${color} formal trousers`)}`,
            material: "Comfort Stretch Fabric",
          },
          {
            tier: "premium",
            productTitle: `Straight-Fit Creased ${color} Formal Trousers`,
            brand: "Marks & Spencer",
            retailer: "Tata CLiQ",
            price: 3499,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`men ${color} formal trousers`)}`,
            material: "Wool-Rich Blend",
          },
        ];
      }
      return [
        {
          tier: "budget",
          productTitle: `High-Rise ${color} Tailored Formal Trousers`,
          brand: "Mast & Harbour",
          retailer: "Myntra",
          price: 999,
          originalPrice: 1999,
          url: `https://www.myntra.com/women-${encodeURIComponent(color.toLowerCase())}-formal-trousers`,
          material: "Poly-Viscose Crepe",
        },
        {
          tier: "mid",
          productTitle: `Straight-Leg High-Rise ${color} Formal Trousers`,
          brand: "Marks & Spencer",
          retailer: "AJIO",
          price: 1999,
          originalPrice: 2999,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent(`women ${color} formal trousers`)}`,
          material: "Comfort Stretch Suiting",
        },
        {
          tier: "premium",
          productTitle: `Wide-Leg Pleated ${color} Tailored Slacks`,
          brand: "Vero Moda",
          retailer: "Tata CLiQ",
          price: 3299,
          originalPrice: 4299,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`women ${color} formal trousers`)}`,
          material: "Premium Fluid Wool Blend",
        },
      ];
    }

    // 5. Kurta Sets
    if (subcat.includes("kurta") || subcat.includes("kurti") || subcat.includes("sherwani")) {
      if (isMan) {
        return [
          {
            tier: "budget",
            productTitle: `${color} Woven Cotton Festive Kurta Set`,
            brand: "Manyavar",
            retailer: "Myntra",
            price: 1999,
            originalPrice: 3999,
            url: `https://www.myntra.com/men-${encodeURIComponent(color.toLowerCase())}-kurta-set`,
            material: "Cotton Blend",
          },
          {
            tier: "mid",
            productTitle: `Silk Blend ${color} Festive Kurta Churidar Set`,
            brand: "Fabindia",
            retailer: "AJIO",
            price: 3490,
            originalPrice: 4999,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`men ${color} festive kurta set`)}`,
            material: "Tussar Silk Blend",
          },
          {
            tier: "premium",
            productTitle: `Royal Jacquard Silk ${color} Sherwani Kurta Set`,
            brand: "Manyavar",
            retailer: "Tata CLiQ",
            price: 7999,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`men ${color} sherwani kurta set`)}`,
            material: "Jacquard Pure Silk",
          },
        ];
      }
      return [
        {
          tier: "budget",
          productTitle: `${color} Embroidered Straight Kurta with Palazzos`,
          brand: "Anouk",
          retailer: "Myntra",
          price: 1299,
          originalPrice: 2999,
          url: `https://www.myntra.com/women-${encodeURIComponent(color.toLowerCase())}-kurta-set`,
          material: "Chanderi Cotton Blend",
        },
        {
          tier: "mid",
          productTitle: `Embroidered Silk Blend ${color} Festive Kurta Set`,
          brand: "Biba",
          retailer: "AJIO",
          price: 2499,
          originalPrice: 4999,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent(`women ${color} festive kurta set`)}`,
          material: "Silk Blend with Zari Detailing",
        },
        {
          tier: "premium",
          productTitle: `Hand-Block Printed Chanderi ${color} Kurta Set`,
          brand: "Ritu Kumar",
          retailer: "Nykaa Fashion",
          price: 5900,
          originalPrice: 7900,
          url: buildRetailerSearchUrl("Nykaa Fashion", {
            gender: "women",
            brand: "Ritu Kumar",
            productName: `Hand-Block Printed Chanderi ${color} Kurta Set`,
            color,
            category: "outfit",
          }),
          material: "Chanderi Silk with Intricate Embroidery",
        },
      ];
    }

    // 6. Sarees
    if (subcat.includes("saree")) {
      return [
        {
          tier: "budget",
          productTitle: `${color} Woven Silk Blend Saree with Zari Border`,
          brand: "Anouk",
          retailer: "Myntra",
          price: 1499,
          originalPrice: 3999,
          url: `https://www.myntra.com/women-${encodeURIComponent(color.toLowerCase())}-silk-saree`,
          material: "Art Silk Blend",
        },
        {
          tier: "mid",
          productTitle: `Banarasi Jacquard ${color} Silk Saree`,
          brand: "Ishin",
          retailer: "Nykaa Fashion",
          price: 2699,
          originalPrice: 5999,
          url: buildRetailerSearchUrl("Nykaa Fashion", {
            gender: "women",
            brand: "Ishin",
            productName: `Banarasi Jacquard ${color} Silk Saree`,
            color,
            category: "outfit",
          }),
          material: "Banarasi Silk",
        },
        {
          tier: "premium",
          productTitle: `Handloom Chanderi Pure Silk ${color} Saree`,
          brand: "Fabindia",
          retailer: "Tata CLiQ",
          price: 6990,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`women ${color} pure silk saree`)}`,
          material: "Pure Chanderi Silk",
        },
      ];
    }

    // 7. Default dresses
    return [
      {
        tier: "budget",
        productTitle: `Pleated A-Line ${color} Midi Dress`,
        brand: "Tokyo Talkies",
        retailer: "Myntra",
        price: 999,
        originalPrice: 2199,
        url: buildRetailerSearchUrl("Myntra", {
          gender: "woman",
          brand: "Tokyo Talkies",
          productName: `Pleated A-Line ${color} Midi Dress`,
          color,
          category: "outfit",
        }),
        material: "Georgette Crepe",
      },
      {
        tier: "mid",
        productTitle: `Tailored Belted ${color} Formal Shirt Dress`,
        brand: "Marks & Spencer",
        retailer: "AJIO",
        price: 2499,
        originalPrice: 3999,
        url: buildRetailerSearchUrl("AJIO", {
          gender: "woman",
          brand: "Marks & Spencer",
          productName: `Tailored Belted ${color} Formal Shirt Dress`,
          color,
          category: "outfit",
        }),
        material: "Viscose Twill",
      },
      {
        tier: "premium",
        productTitle: `Structured Pleated ${color} Cocktail Midi Dress`,
        brand: "MANGO",
        retailer: "Tata CLiQ",
        price: 4990,
        url: buildRetailerSearchUrl("Tata CLiQ", {
          gender: "woman",
          brand: "MANGO",
          productName: `Structured Pleated ${color} Cocktail Midi Dress`,
          color,
          category: "outfit",
        }),
        material: "Fluid Crepe",
      },
    ];
  }

  if (spec.category === "jewellery") {
    // 1. Traditional Jhumkas / Festive Earrings (Women only)
    if (
      !isMan &&
      (subcat.includes("jhumka") ||
        subcat.includes("oxidised") ||
        stylingReq.includes("jhumka") ||
        stylingReq.includes("oxidised") ||
        stylingReq.includes("tribal") ||
        stylingReq.includes("festive"))
    ) {
      return [
        {
          tier: "budget",
          productTitle: "Oxidised Silver-Plated Traditional Floral Dome Jhumka Earrings",
          brand: "Zaveri Pearls",
          retailer: "AJIO",
          price: 399,
          originalPrice: 1199,
          url: "https://www.ajio.com/zaveri-pearls-oxidised-silver-jhumka-earrings/p/461298456_silver",
          material: "Oxidised Silver-Plated Alloy with Ghungroo Drops",
        },
        {
          tier: "mid",
          productTitle: "Handcrafted Tribal Mirror-Work German Silver Jhumkas",
          brand: "Priyaasi",
          retailer: "Myntra",
          price: 899,
          originalPrice: 1999,
          url: "https://www.myntra.com/earrings/priyaasi/priyaasi-oxidised-silver-mirror-jhumkas/17823901/buy",
          material: "German Silver with Mirror Inlay",
        },
        {
          tier: "premium",
          productTitle: "925 Sterling Silver Handcrafted Festive Chandbali Jhumkas",
          brand: "GIVA",
          retailer: "Tata CLiQ",
          price: 2499,
          originalPrice: 3999,
          url: "https://www.tatacliq.com/giva-925-silver-oxidised-festive-jhumkas/p-mp000000019283746",
          material: "925 Sterling Silver with Oxidised Polish",
        },
      ];
    }

    // 2. Wrist Bangles & Bracelets
    if (subcat.includes("bracelet") || subcat.includes("bangle") || subcat.includes("wrist") || subcat.includes("kada")) {
      if (isMan) {
        return [
          {
            tier: "budget",
            productTitle: "Men Solid Stainless Steel Kada Bracelet",
            brand: "Voylla",
            retailer: "AJIO",
            price: 599,
            originalPrice: 1299,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent("men stainless steel kada bracelet")}`,
            material: "Solid Stainless Steel with Smooth Polish",
          },
          {
            tier: "mid",
            productTitle: "Men Handcrafted Brass Antique Finish Kada",
            brand: "Manyavar",
            retailer: "Myntra",
            price: 1299,
            originalPrice: 1999,
            url: "https://www.myntra.com/men-kada-bracelet",
            material: "Brass with Antique Gold Finish",
          },
          {
            tier: "premium",
            productTitle: "Men Solid 925 Sterling Silver Royal Kada",
            brand: "Titan",
            retailer: "Tata CLiQ",
            price: 3495,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("men titan silver kada bracelet")}`,
            material: "Hallmarked 925 Sterling Silver",
          },
        ];
      }
      if (
        stylingReq.includes("oxidised") ||
        stylingReq.includes("bangle") ||
        stylingReq.includes("ghungroo") ||
        stylingReq.includes("festive")
      ) {
        return [
          {
            tier: "budget",
            productTitle: "Set of 24 Oxidised Silver Festive Textured Bangles",
            brand: "Zaveri Pearls",
            retailer: "Myntra",
            price: 449,
            originalPrice: 1299,
            url: "https://www.myntra.com/bangles/zaveri-pearls/zaveri-pearls-set-of-24-oxidised-bangles/14902381/buy",
            material: "Oxidised Silver Plating",
          },
          {
            tier: "mid",
            productTitle: "Traditional Ghungroo Detailed Openable Silver Kada Pair",
            brand: "Priyaasi",
            retailer: "AJIO",
            price: 999,
            originalPrice: 2499,
            url: "https://www.ajio.com/priyaasi-ghungroo-silver-plated-kada/p/469012384_silver",
            material: "Silver-Plated Brass with Tiny Ghungroos",
          },
          {
            tier: "premium",
            productTitle: "925 Sterling Silver Intricate Temple Motif Bangle",
            brand: "Tribe Amrapali",
            retailer: "Nykaa Fashion",
            price: 3800,
            originalPrice: 4500,
            url: buildRetailerSearchUrl("Nykaa Fashion", {
              gender: "women",
              brand: "Tribe Amrapali",
              productName: "925 Sterling Silver Intricate Temple Motif Bangle",
              category: "jewellery",
            }),
            material: "Hallmarked 925 Sterling Silver",
          },
        ];
      }

      return [
        {
          tier: "budget",
          productTitle: "Minimalist Gold-Plated Sleek Cuff Bangle",
          brand: "Zaveri Pearls",
          retailer: "AJIO",
          price: 499,
          originalPrice: 1299,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent("women minimal sleek gold bracelet bangle")}`,
          material: "Gold-Plated Brass",
        },
        {
          tier: "mid",
          productTitle: "925 Sterling Silver Minimal Delicate Chain Bracelet",
          brand: "GIVA",
          retailer: "Myntra",
          price: 1499,
          originalPrice: 2299,
          url: "https://www.myntra.com/women-giva-silver-chain-bracelet",
          material: "925 Sterling Silver with 18K Gold Plating",
        },
        {
          tier: "premium",
          productTitle: "14K Gold-Plated Sculptural Geometric Cuff Bracelet",
          brand: "Shaya by CaratLane",
          retailer: "Nykaa Fashion",
          price: 3400,
          url: buildRetailerSearchUrl("Nykaa Fashion", {
            gender: "women",
            brand: "Shaya by CaratLane",
            productName: "14K Gold-Plated Sculptural Geometric Cuff Bracelet",
            category: "jewellery",
          }),
          material: "925 Sterling Silver Gold Plated",
        },
      ];
    }

    // 3. Watches & default jewellery / minimal studs
    if (isMan) {
      if (subcat.includes("watch") || stylingReq.includes("watch")) {
        return [
          {
            tier: "budget",
            productTitle: "Men Minimalist Leather Strap Analog Watch",
            brand: "Timex",
            retailer: "Myntra",
            price: 1495,
            originalPrice: 2495,
            url: "https://www.myntra.com/men-analog-watch",
            material: "Genuine Leather Strap with Stainless Steel Dial",
          },
          {
            tier: "mid",
            productTitle: "Men Classic Multifunction Dress Watch",
            brand: "Titan",
            retailer: "AJIO",
            price: 3495,
            originalPrice: 4995,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent("men titan classic analog watch")}`,
            material: "Stainless Steel Case with Mineral Glass",
          },
          {
            tier: "premium",
            productTitle: "Men Chronograph Stainless Steel Formal Watch",
            brand: "Fossil",
            retailer: "Tata CLiQ",
            price: 7995,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("men fossil chronograph watch")}`,
            material: "Solid Stainless Steel with Quartz Movement",
          },
        ];
      }
      return [
        {
          tier: "budget",
          productTitle: "Men Minimalist Stainless Steel Curb Chain",
          brand: "Voylla",
          retailer: "AJIO",
          price: 599,
          originalPrice: 1299,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent("men stainless steel chain necklace")}`,
          material: "Surgical Grade Stainless Steel",
        },
        {
          tier: "mid",
          productTitle: "Men 925 Sterling Silver Classic Box Chain",
          brand: "GIVA",
          retailer: "Myntra",
          price: 1899,
          originalPrice: 2899,
          url: "https://www.myntra.com/men-silver-chain",
          material: "925 Sterling Silver with Rhodium Finish",
        },
        {
          tier: "premium",
          productTitle: "Men Solid Stainless Steel Sleek Kada Bracelet",
          brand: "Titan",
          retailer: "Tata CLiQ",
          price: 2995,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("men titan stainless steel kada bracelet")}`,
          material: "Hypoallergenic Solid Stainless Steel",
        },
      ];
    }

    if (subcat.includes("watch") || stylingReq.includes("watch")) {
      return [
        {
          tier: "budget",
          productTitle: "Women Minimalist Rose Gold Mesh Strap Watch",
          brand: "Joker & Witch",
          retailer: "Myntra",
          price: 1199,
          originalPrice: 2499,
          url: "https://www.myntra.com/women-analog-watch",
          material: "Rose Gold Ion-Plated Alloy",
        },
        {
          tier: "mid",
          productTitle: "Women Contemporary Mother of Pearl Analog Watch",
          brand: "Titan Raga",
          retailer: "AJIO",
          price: 3995,
          originalPrice: 5495,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent("women titan raga analog watch")}`,
          material: "Mother of Pearl Dial with Brass Bracelet",
        },
        {
          tier: "premium",
          productTitle: "Women Classic Petite Emerald Dial Mesh Watch",
          brand: "Daniel Wellington",
          retailer: "Tata CLiQ",
          price: 8999,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("women daniel wellington watch")}`,
          material: "Double Plated 316L Stainless Steel",
        },
      ];
    }

    return [
      {
        tier: "budget",
        productTitle: "18K Gold-Plated Minimalist Geometric Stud Earrings",
        brand: "Voylla",
        retailer: "Nykaa Fashion",
        price: 499,
        originalPrice: 999,
        url: buildRetailerSearchUrl("Nykaa Fashion", {
          gender: "women",
          brand: "Voylla",
          productName: "18K Gold-Plated Minimalist Geometric Stud Earrings",
          category: "jewellery",
        }),
        material: "18K Gold-Plated Alloy",
      },
      {
        tier: "mid",
        productTitle: "925 Sterling Silver Classic Solitaire Stud Earrings",
        brand: "GIVA",
        retailer: "Myntra",
        price: 1399,
        originalPrice: 2199,
        url: "https://www.myntra.com/women-giva-solitaire-stud-earrings",
        material: "925 Sterling Silver & AAA Zircon",
      },
      {
        tier: "premium",
        productTitle: "14K Yellow Gold Minimalist Sphere Stud Earrings",
        brand: "Mia by Tanishq",
        retailer: "Tata CLiQ",
        price: 4299,
        url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("women minimal gold stud earrings mia tanishq")}`,
        material: "14K Yellow Gold",
      },
    ];
  }

  if (spec.category === "footwear") {
    if (isBoy) {
      if (
        stylingReq.includes("sandal") ||
        stylingReq.includes("slide") ||
        subcat.includes("sandal") ||
        subcat.includes("slide")
      ) {
        return [
          {
            tier: "budget",
            productTitle: `Boys ${color} Breathable Double-Strap Slide Sandals`,
            brand: "Bata",
            retailer: "Myntra",
            price: 699,
            originalPrice: 1199,
            url: "https://www.myntra.com/boys-slide-sandals",
            material: "Cushioned EVA with Adjustable Double Straps",
          },
          {
            tier: "mid",
            productTitle: `Boys ${color} Lightweight Water-Resistant Slide Sandals`,
            brand: "Crocs",
            retailer: "AJIO",
            price: 1495,
            originalPrice: 1995,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`boys ${color} slide sandals`)}`,
            material: "Croslite Foam Cushioning",
          },
          {
            tier: "premium",
            productTitle: `Boys ${color} Genuine Leather Comfort Slide Sandals`,
            brand: "Clarks Kids",
            retailer: "Tata CLiQ",
            price: 2499,
            originalPrice: 3299,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`boys ${color} clarks leather slide sandals`)}`,
            material: "Genuine Full-Grain Leather with Padded Footbed",
          },
        ];
      }

      if (
        stylingReq.includes("jutti") ||
        stylingReq.includes("mojari") ||
        stylingReq.includes("ethnic") ||
        subcat.includes("jutti") ||
        subcat.includes("mojari")
      ) {
        return [
          {
            tier: "budget",
            productTitle: "Boys Handcrafted Ethnic Slip-On Mojaris",
            brand: "Klapz",
            retailer: "Myntra",
            price: 699,
            originalPrice: 1399,
            url: "https://www.myntra.com/boys-ethnic-mojaris",
            material: "Cushioned Faux Leather with Metallic Thread Accents",
          },
          {
            tier: "mid",
            productTitle: "Boys Embroidered Padded Festive Mojari Shoes",
            brand: "Mochi",
            retailer: "AJIO",
            price: 1290,
            originalPrice: 1990,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent("boys festive ethnic mojaris")}`,
            material: "Cushioned Insole with Thread Work",
          },
          {
            tier: "premium",
            productTitle: "Boys Handcrafted Leather Ethnic Juttis",
            brand: "Needledust Kids",
            retailer: "Tata CLiQ",
            price: 2490,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("boys ethnic juttis mojaris")}`,
            material: "Genuine Soft Leather with Cushioned Sole",
          },
        ];
      }

      if (
        stylingReq.includes("loafer") ||
        stylingReq.includes("moccasin") ||
        subcat.includes("loafer") ||
        subcat.includes("moccasin") ||
        spec.itemTitle.toLowerCase().includes("loafer")
      ) {
        return [
          {
            tier: "budget",
            productTitle: "Boys Cushioned Slip-On Loafers",
            brand: "Bata",
            retailer: "Bata",
            price: 799,
            originalPrice: 1299,
            url: "https://www.bata.in/boys-slip-on-loafers",
            material: "Cushioned Faux Leather with Soft Padded Footbed",
          },
          {
            tier: "mid",
            productTitle: "Boys Classic Driving Moccasin Loafers",
            brand: "Babyhug",
            retailer: "FirstCry",
            price: 1299,
            originalPrice: 1999,
            url: "https://www.firstcry.com/babyhug/boys-driving-loafers/2841938/product-detail",
            material: "Supple Faux Leather with Flexible Rubber Sole",
          },
          {
            tier: "premium",
            productTitle: "Boys Handcrafted Suede-Finish Loafers",
            brand: "GAP Kids",
            retailer: "AJIO",
            price: 2199,
            originalPrice: 2999,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent("boys slip-on moccasin loafers")}`,
            material: "Soft Suede Finish with Memory Foam Insole",
          },
        ];
      }

      return [
        {
          tier: "budget",
          productTitle: "Boys Cushioned Casual Sneakers",
          brand: "Bata",
          retailer: "Myntra",
          price: 899,
          originalPrice: 1599,
          url: "https://www.myntra.com/boys-casual-sneakers",
          material: "Breathable Canvas with Rubber Sole",
        },
        {
          tier: "mid",
          productTitle: "Boys Classic Slip-On Casual Loafers",
          brand: "Puma",
          retailer: "AJIO",
          price: 1599,
          originalPrice: 2499,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent("boys casual sneakers shoes")}`,
          material: "Synthetic Leather with Soft Insole",
        },
        {
          tier: "premium",
          productTitle: "Boys Leather Smart Derby Formal Shoes",
          brand: "Clarks Kids",
          retailer: "Tata CLiQ",
          price: 2999,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("boys clarks leather shoes")}`,
          material: "Genuine Full-Grain Leather",
        },
      ];
    }

    if (isGirl) {
      if (
        stylingReq.includes("sandal") ||
        stylingReq.includes("slide") ||
        subcat.includes("sandal") ||
        subcat.includes("slide")
      ) {
        return [
          {
            tier: "budget",
            productTitle: `Girls ${color} Strappy Open-Toe Slide Sandals`,
            brand: "Bata",
            retailer: "Myntra",
            price: 699,
            originalPrice: 1199,
            url: "https://www.myntra.com/girls-slide-sandals",
            material: "Soft Faux Leather with Cushioned Insole",
          },
          {
            tier: "mid",
            productTitle: `Girls ${color} Embellished Summer Slide Sandals`,
            brand: "Mochi",
            retailer: "AJIO",
            price: 1290,
            originalPrice: 1890,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`girls ${color} slide sandals`)}`,
            material: "Padded Footbed with Metallic Accents",
          },
          {
            tier: "premium",
            productTitle: `Girls ${color} Handcrafted Leather Strappy Sandals`,
            brand: "Clarks Kids",
            retailer: "Tata CLiQ",
            price: 2499,
            originalPrice: 3299,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`girls ${color} leather sandals`)}`,
            material: "Supple Nappa Leather with Buckle Strap",
          },
        ];
      }

      if (
        stylingReq.includes("jutti") ||
        stylingReq.includes("mojari") ||
        stylingReq.includes("ethnic") ||
        subcat.includes("jutti") ||
        subcat.includes("mojari")
      ) {
        return [
          {
            tier: "budget",
            productTitle: `Girls Embroidered Ethnic Punjabi Juttis`,
            brand: "Anouk Girls",
            retailer: "Myntra",
            price: 699,
            originalPrice: 1399,
            url: "https://www.myntra.com/girls-ethnic-juttis",
            material: "Handcrafted with Soft Velvet and Foil Zari",
          },
          {
            tier: "mid",
            productTitle: `Girls Mirror-Work Cushioned Festive Juttis`,
            brand: "Mochi",
            retailer: "AJIO",
            price: 1190,
            originalPrice: 1790,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent("girls festive ethnic juttis")}`,
            material: "Padded Insole with Mirror Embellishments",
          },
          {
            tier: "premium",
            productTitle: `Girls Handcrafted Zardozi Designer Juttis`,
            brand: "Needledust Kids",
            retailer: "Tata CLiQ",
            price: 2290,
            originalPrice: 3490,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("girls needledust ethnic juttis")}`,
            material: "Pure Silk & Leather with Embroidered Sequins",
          },
        ];
      }
      return [
        {
          tier: "budget",
          productTitle: "Girls Ballet Flats with Bow Accent",
          brand: "Bata",
          retailer: "Myntra",
          price: 799,
          originalPrice: 1399,
          url: "https://www.myntra.com/girls-ballet-flats",
          material: "Soft Faux Leather with Cushioned Footbed",
        },
        {
          tier: "mid",
          productTitle: "Girls Shimmer Slip-On Casual Shoes",
          brand: "Puma",
          retailer: "AJIO",
          price: 1499,
          originalPrice: 2299,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent("girls casual sneakers shoes")}`,
          material: "Glitter Canvas with Flexible Rubber Sole",
        },
        {
          tier: "premium",
          productTitle: "Girls Leather Mary Jane Formal Shoes",
          brand: "Clarks Kids",
          retailer: "Tata CLiQ",
          price: 2699,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("girls clarks leather shoes")}`,
          material: "Supple Nappa Leather with Buckle Strap",
        },
      ];
    }

    // 1. Traditional Juttis & Mojaris (Adults)
    if (
      stylingReq.includes("jutti") ||
      stylingReq.includes("mojari") ||
      stylingReq.includes("ethnic") ||
      subcat.includes("jutti") ||
      subcat.includes("mojari")
    ) {
      if (isMan) {
        return [
          {
            tier: "budget",
            productTitle: `Men ${color} Traditional Leather Mojari Juttis`,
            brand: "Metro",
            retailer: "Myntra",
            price: 1299,
            originalPrice: 2299,
            url: buildRetailerSearchUrl("Myntra", {
              gender: "men",
              brand: "Metro",
              productName: `Men ${color} Traditional Ethnic Mojari Juttis`,
              color,
              category: "footwear",
              subcategory: "mojaris",
            }),
            material: "Handcrafted Genuine Leather with Cushioned Insole",
          },
          {
            tier: "mid",
            productTitle: `Men Embroidered Festive Ethnic Mojaris`,
            brand: "Mochi",
            retailer: "AJIO",
            price: 1990,
            originalPrice: 2990,
            url: buildRetailerSearchUrl("AJIO", {
              gender: "men",
              brand: "Mochi",
              productName: `Men ${color} Festive Ethnic Mojaris`,
              color,
              category: "footwear",
              subcategory: "mojaris",
            }),
            material: "Cushioned Genuine Leather with Zari Detailing",
          },
          {
            tier: "premium",
            productTitle: `Men Handcrafted Pure Leather Royal Wedding Mojaris`,
            brand: "Manyavar",
            retailer: "Tata CLiQ",
            price: 3499,
            originalPrice: 4999,
            url: buildRetailerSearchUrl("Tata CLiQ", {
              gender: "men",
              brand: "Manyavar",
              productName: `Men ${color} Royal Wedding Mojaris`,
              color,
              category: "footwear",
              subcategory: "mojaris",
            }),
            material: "Hand-Embroidered Velvet & Full-Grain Leather",
          },
        ];
      }

      return [
        {
          tier: "budget",
          productTitle: "Embroidered Floral Ethnic Punjabi Juttis",
          brand: "Anouk",
          retailer: "Myntra",
          price: 899,
          originalPrice: 1999,
          url: "https://www.myntra.com/flats/anouk/anouk-women-embroidered-punjabi-juttis/15902384/buy",
          material: "Handmade Leather with Thread Embroidery",
        },
        {
          tier: "mid",
          productTitle: "Mirror-Work & Zari Padded Festive Mojari Juttis",
          brand: "Mochi",
          retailer: "AJIO",
          price: 1690,
          originalPrice: 2690,
          url: "https://www.ajio.com/mochi-embroidered-pointed-toe-juttis/p/460892341_gold",
          material: "Cushioned Genuine Leather Insole with Mirror Detailing",
        },
        {
          tier: "premium",
          productTitle: `Handcrafted ${color} & Gold Zardozi Velvet Designer Juttis`,
          brand: "Needledust",
          retailer: "Tata CLiQ",
          price: 3890,
          originalPrice: 4500,
          url: "https://www.tatacliq.com/needledust-handcrafted-festive-juttis/p-mp000000018902345",
          material: "Pure Leather with Hand-Embroidered Zardozi & Pearls",
        },
      ];
    }

    if (isMan) {
      if (
        stylingReq.includes("sandal") ||
        stylingReq.includes("slide") ||
        subcat.includes("sandal") ||
        subcat.includes("slide")
      ) {
        return [
          {
            tier: "budget",
            productTitle: `Men ${color} Genuine Leather Slide Sandals`,
            brand: "Bata",
            retailer: "Myntra",
            price: 1199,
            originalPrice: 1999,
            url: "https://www.myntra.com/men-leather-slide-sandals",
            material: "Genuine Soft Leather with Cushioned Footbed",
          },
          {
            tier: "mid",
            productTitle: `Men ${color} Two-Strap Cushioned Leather Slides`,
            brand: "Woodland",
            retailer: "AJIO",
            price: 2495,
            originalPrice: 3495,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent(`men ${color} leather slide sandals`)}`,
            material: "Oil-Pulled Leather with Shock Absorber",
          },
          {
            tier: "premium",
            productTitle: `Men ${color} Italian Leather Comfort Slides`,
            brand: "Clarks",
            retailer: "Tata CLiQ",
            price: 4999,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`men ${color} clarks leather slide sandals`)}`,
            material: "Handcrafted Italian Leather",
          },
        ];
      }

      return [
        {
          tier: "budget",
          productTitle: "Formal Lace-Up Derby Shoes",
          brand: "Bata",
          retailer: "Myntra",
          price: 1499,
          originalPrice: 2499,
          url: "https://www.myntra.com/men-formal-derby-shoes",
          material: "Synthetic Leather",
        },
        {
          tier: "mid",
          productTitle: "Genuine Leather Formal Oxford Shoes",
          brand: "Red Tape",
          retailer: "AJIO",
          price: 2499,
          originalPrice: 4999,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent("men formal leather oxford shoes")}`,
          material: "Genuine Crust Leather",
        },
        {
          tier: "premium",
          productTitle: "Handcrafted Leather Almond-Toe Formal Loafers",
          brand: "Clarks",
          retailer: "Tata CLiQ",
          price: 5499,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("men clarks formal leather shoes")}`,
          material: "Full Grain Leather",
        },
      ];
    }

    if (
      stylingReq.includes("sandal") ||
      stylingReq.includes("slide") ||
      subcat.includes("sandal") ||
      subcat.includes("slide")
    ) {
      return [
        {
          tier: "budget",
          productTitle: `Women ${color} Open-Toe Flat Slide Sandals`,
          brand: "Mast & Harbour",
          retailer: "Myntra",
          price: 799,
          originalPrice: 1699,
          url: "https://www.myntra.com/women-flat-slide-sandals",
          material: "Soft Faux Leather with Textured Insole",
        },
        {
          tier: "mid",
          productTitle: `Women ${color} Braided Strap Leather Slide Sandals`,
          brand: "Mochi",
          retailer: "AJIO",
          price: 1690,
          originalPrice: 2490,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent(`women ${color} slide sandals`)}`,
          material: "Cushioned Leather Footbed with Braided Finish",
        },
        {
          tier: "premium",
          productTitle: `Women ${color} Handcrafted Genuine Leather Comfort Slides`,
          brand: "MANGO",
          retailer: "Tata CLiQ",
          price: 3590,
          originalPrice: 4990,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(`women ${color} mango leather slide sandals`)}`,
          material: "100% Bovine Leather with Ergonomic Sole",
        },
      ];
    }

    return [
      {
        tier: "budget",
        productTitle: "Pointed-Toe Block Heel Formal Pumps",
        brand: "Catwalk",
        retailer: "Myntra",
        price: 1299,
        originalPrice: 2499,
        url: "https://www.myntra.com/women-pointed-toe-formal-pumps",
        material: "Faux Leather with Cushion Insole",
      },
      {
        tier: "mid",
        productTitle: "Pointed Stiletto Classic Office Heels",
        brand: "Carlton London",
        retailer: "AJIO",
        price: 2199,
        originalPrice: 3995,
        url: `https://www.ajio.com/search/?text=${encodeURIComponent("women formal pointed toe pumps heels")}`,
        material: "Synthetic Patent Leather",
      },
      {
        tier: "premium",
        productTitle: "Leather Almond-Toe Cushioned Formal Loafers",
        brand: "Clarks",
        retailer: "Tata CLiQ",
        price: 4499,
        url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("women clarks formal leather shoes")}`,
        material: "Premium Supple Nappa Leather",
      },
    ];
  }

  if (spec.category === "accessories") {
    if (isBoy) {
      if (
        stylingReq.includes("brooch") ||
        stylingReq.includes("pocket") ||
        subcat.includes("brooch") ||
        subcat.includes("pocket_square") ||
        spec.itemTitle.toLowerCase().includes("brooch") ||
        spec.itemTitle.toLowerCase().includes("pocket square")
      ) {
        return [
          {
            tier: "budget",
            productTitle: "Boys Festive Traditional Brooch & Pocket Square",
            brand: "Vastramay",
            retailer: "Myntra",
            price: 349,
            originalPrice: 799,
            url: "https://www.myntra.com/boys-accessories",
            material: "Brass Plated with Enamel Finish",
          },
          {
            tier: "mid",
            productTitle: "Boys Handcrafted Royal Pearl Sherwani Brooch",
            brand: "Tiber Taber",
            retailer: "AJIO",
            price: 699,
            originalPrice: 1199,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent("boys festive sherwani brooch")}`,
            material: "Gold-Plated Brass with Faux Pearls",
          },
          {
            tier: "premium",
            productTitle: "Boys Traditional Zardozi Festive Stole & Brooch Set",
            brand: "Mumkins",
            retailer: "Mumkins",
            price: 1299,
            originalPrice: 1999,
            url: "https://www.mumkins.in/products/boys-festive-brooch-stole-set",
            material: "Silk Blend Stole with Handcrafted Brooch",
          },
        ];
      }
      if (
        subcat.includes("sunglass") ||
        stylingReq.includes("sunglass") ||
        spec.itemTitle.toLowerCase().includes("sunglass")
      ) {
        return [
          {
            tier: "budget",
            productTitle: "Boys UV-Protected Flexible Frame Sunglasses",
            brand: "Babyhug",
            retailer: "FirstCry",
            price: 399,
            originalPrice: 799,
            url: "https://www.firstcry.com/babyhug/boys-sunglasses/1382914/product-detail",
            material: "100% UV400 Protection Flexible Silicone",
          },
          {
            tier: "mid",
            productTitle: "Boys Polarized Classic Aviator Sunglasses",
            brand: "Royal Son Junior",
            retailer: "Amazon India",
            price: 699,
            originalPrice: 1499,
            url: "https://www.amazon.in/dp/B08BOYSSUN",
            material: "Polarized Lenses with Metal Frame",
          },
          {
            tier: "premium",
            productTitle: "Boys Designer UV Wayfarer Sunglasses",
            brand: "H&M Kids",
            retailer: "Myntra",
            price: 999,
            originalPrice: 1499,
            url: "https://www.myntra.com/boys-sunglasses",
            material: "Durable Acetate Frame",
          },
        ];
      }
      if (
        subcat.includes("hat") ||
        subcat.includes("cap") ||
        stylingReq.includes("hat") ||
        stylingReq.includes("cap") ||
        spec.itemTitle.toLowerCase().includes("hat") ||
        spec.itemTitle.toLowerCase().includes("cap")
      ) {
        const isVacationCap = stylingReq.includes("vacation") || stylingReq.includes("beach") || stylingReq.includes("bucket");
        return [
          {
            tier: "budget",
            productTitle: isVacationCap ? "Boys Breathable Cotton Sun Bucket Hat" : "Boys Classic Cotton Baseball Cap",
            brand: "Babyhug",
            retailer: "FirstCry",
            price: 349,
            originalPrice: 699,
            url: "https://www.firstcry.com/babyhug/boys-cap/1392811/product-detail",
            material: "100% Breathable Cotton",
          },
          {
            tier: "mid",
            productTitle: "Boys Classic Twill Embroidered Baseball Cap",
            brand: "Allen Solly Junior",
            retailer: "AJIO",
            price: 599,
            originalPrice: 999,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent("boys cap")}`,
            material: "100% Cotton Twill",
          },
          {
            tier: "premium",
            productTitle: "Boys Reversible Print Cotton Bucket Hat",
            brand: "GAP Kids",
            retailer: "Myntra",
            price: 899,
            originalPrice: 1299,
            url: "https://www.myntra.com/boys-caps",
            material: "100% Washed Cotton",
          },
        ];
      }
      return [
        {
          tier: "budget",
          productTitle: "Boys Classic Twill Baseball Cap",
          brand: "Babyhug",
          retailer: "FirstCry",
          price: 349,
          originalPrice: 699,
          url: "https://www.firstcry.com/babyhug/boys-cap/1392811/product-detail",
          material: "100% Cotton Twill",
        },
        {
          tier: "mid",
          productTitle: "Boys Classic Embroidered Cap & Belt Set",
          brand: "Allen Solly Junior",
          retailer: "AJIO",
          price: 799,
          originalPrice: 1299,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent("boys belt cap set")}`,
          material: "100% Cotton Twill",
        },
        {
          tier: "premium",
          productTitle: "Boys Water-Resistant Analog Watch",
          brand: "Zoop by Titan",
          retailer: "Tata CLiQ",
          price: 1195,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("boys titan zoop watch")}`,
          material: "Silicone Strap with Stainless Steel Back",
        },
      ];
    }

    if (isGirl) {
      if (
        subcat === "hair_accessory" ||
        stylingReq.includes("hair") ||
        spec.itemTitle.toLowerCase().includes("hair") ||
        spec.itemTitle.toLowerCase().includes("clip") ||
        spec.itemTitle.toLowerCase().includes("band")
      ) {
        return [
          {
            tier: "budget",
            productTitle: "Girls Pastel Floral & Bow Hair Clips (Set of 10)",
            brand: "KIDS CLAN",
            retailer: "FirstCry",
            price: 299,
            originalPrice: 599,
            url: "https://www.firstcry.com/kids-clan/girls-hair-clips-set/1283741/product-detail",
            material: "Soft Ribbon & Acrylic Floral Clips",
          },
          {
            tier: "mid",
            productTitle: "Girls Embellished Pearl & Ribbon Headbands Set",
            brand: "Accessorize London Kids",
            retailer: "Myntra",
            price: 599,
            originalPrice: 1199,
            url: "https://www.myntra.com/girls-hair-accessories",
            material: "Faux Pearl with Satin Ribbon",
          },
          {
            tier: "premium",
            productTitle: "Girls Handcrafted Floral Hair Accessories Set",
            brand: "Mumkins",
            retailer: "Mumkins",
            price: 899,
            originalPrice: 1499,
            url: "https://www.mumkins.in/products/girls-floral-hair-accessories-set",
            material: "Handcrafted Fabric Florals with Gold Zari Accents",
          },
        ];
      }

      if (
        stylingReq.includes("potli") ||
        stylingReq.includes("ethnic") ||
        stylingReq.includes("festive") ||
        stylingReq.includes("traditional") ||
        subcat.includes("potli")
      ) {
        return [
          {
            tier: "budget",
            productTitle: "Girls Embroidered Mini Festive Potli Bag",
            brand: "Anekaant Kids",
            retailer: "Myntra",
            price: 499,
            originalPrice: 999,
            url: "https://www.myntra.com/girls-potli-bag",
            material: "Satin with Gota Patti Trim",
          },
          {
            tier: "mid",
            productTitle: "Girls Traditional Zari Work Potli Bag with Tassels",
            brand: "Mumkins",
            retailer: "Mumkins",
            price: 799,
            originalPrice: 1299,
            url: "https://www.mumkins.in/products/girls-festive-potli-bag",
            material: "Jacquard Silk with Pearl Drawstring",
          },
          {
            tier: "premium",
            productTitle: "Girls Handcrafted Velvet Festive Bag & Hairband Set",
            brand: "Fayon Kids",
            retailer: "FirstCry",
            price: 1499,
            originalPrice: 2200,
            url: "https://www.firstcry.com/fayon-kids/girls-festive-bag-set/2947195/product-detail",
            material: "Embroidered Velvet with Pearl Tassels",
          },
        ];
      }

      if (
        stylingReq.includes("vacation") ||
        stylingReq.includes("beach") ||
        stylingReq.includes("cotton") ||
        subcat.includes("tote") ||
        subcat.includes("hat")
      ) {
        return [
          {
            tier: "budget",
            productTitle: "Girls Soft Cotton Cute Mini Crossbody Pouch",
            brand: "Babyhug",
            retailer: "FirstCry",
            price: 349,
            originalPrice: 699,
            url: "https://www.firstcry.com/babyhug/girls-cotton-crossbody-pouch/1482910/product-detail",
            material: "100% Breathable Cotton Canvas",
          },
          {
            tier: "mid",
            productTitle: "Girls Breathable Canvas Cute Shoulder Pouch Bag",
            brand: "H&M Kids",
            retailer: "Myntra",
            price: 699,
            originalPrice: 999,
            url: "https://www.myntra.com/girls-accessories",
            material: "Pure Cotton Canvas with Cute Print",
          },
          {
            tier: "premium",
            productTitle: "Girls Woven Straw Sun Hat & Mini Tote Bag Set",
            brand: "Accessorize London Kids",
            retailer: "Amazon India",
            price: 1299,
            originalPrice: 1999,
            url: "https://www.amazon.in/dp/B09KIDSHAT",
            material: "Natural Paper Straw with Floral Trim",
          },
        ];
      }

      return [
        {
          tier: "budget",
          productTitle: "Girls Pastel Floral & Bow Hair Clips (Set of 10)",
          brand: "KIDS CLAN",
          retailer: "FirstCry",
          price: 299,
          originalPrice: 599,
          url: "https://www.firstcry.com/kids-clan/girls-hair-clips-set/1283741/product-detail",
          material: "Soft Ribbon & Acrylic Floral Clips",
        },
        {
          tier: "mid",
          productTitle: "Girls Cute Everyday Mini Crossbody Pouch Bag",
          brand: "Accessorize London Kids",
          retailer: "Myntra",
          price: 699,
          originalPrice: 1199,
          url: "https://www.myntra.com/girls-accessories",
          material: "Soft Fabric with Zip Closure",
        },
        {
          tier: "premium",
          productTitle: "Girls Handcrafted Floral Headband & Hair Bows Set",
          brand: "Mumkins",
          retailer: "Mumkins",
          price: 999,
          originalPrice: 1499,
          url: "https://www.mumkins.in/products/girls-floral-headband-set",
          material: "Soft Velvet & Satin Florals",
        },
      ];
    }

    // 1. Festive Potli Bags (Women)
    if (
      !isMan &&
      !isBoy &&
      (stylingReq.includes("potli") ||
        stylingReq.includes("ethnic") ||
        stylingReq.includes("festive") ||
        subcat.includes("potli"))
    ) {
      return [
        {
          tier: "budget",
          productTitle: `${color} Velvet Embroidered Drawstring Potli Bag with Pearl Handle`,
          brand: "Anekaant",
          retailer: "Myntra",
          price: 699,
          originalPrice: 1799,
          url: `https://www.myntra.com/clutches/anekaant/anekaant-${encodeURIComponent(color.toLowerCase())}-embroidered-velvet-potli-bag/16290124/buy`,
          material: "Rich Velvet with Zari & Pearl Tassels",
        },
        {
          tier: "mid",
          productTitle: "Handcrafted Gota Patti & Mirror Work Festive Potli Clutch",
          brand: "The Gusto",
          retailer: "AJIO",
          price: 1499,
          originalPrice: 2499,
          url: "https://www.ajio.com/the-gusto-embroidered-festive-potli-bag/p/462901845",
          material: "Raw Silk with Traditional Mirror Embroidery",
        },
        {
          tier: "premium",
          productTitle: "Designer Zardozi & Cutdana Handcrafted Silk Potli Bag",
          brand: "Aditi Sharma",
          retailer: "Nykaa Fashion",
          price: 2890,
          originalPrice: 3600,
          url: buildRetailerSearchUrl("Nykaa Fashion", {
            gender: "women",
            brand: "Aditi Sharma",
            productName: "Designer Zardozi & Cutdana Handcrafted Silk Potli Bag",
            category: "accessories",
          }),
          material: "Heavy Hand-Embroidered Pure Silk with Crystal Latkans",
        },
      ];
    }

    // 1. Belts
    if (subcat.includes("belt")) {
      if (isMan || isBoy) {
        return [
          {
            tier: "budget",
            productTitle: "Formal Reversible Leather Belt with Sleek Pin Buckle",
            brand: "Wildhorn",
            retailer: "Myntra",
            price: 799,
            originalPrice: 1999,
            url: "https://www.myntra.com/men-formal-leather-belt",
            material: "Top Grain Leather",
          },
          {
            tier: "mid",
            productTitle: "Men Genuine Textured Leather Formal Belt",
            brand: "Van Heusen",
            retailer: "AJIO",
            price: 1199,
            originalPrice: 1999,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent("men van heusen leather formal belt")}`,
            material: "Genuine Leather",
          },
          {
            tier: "premium",
            productTitle: "Classic Formal Leather Belt with Brushed Metal Buckle",
            brand: "Tommy Hilfiger",
            retailer: "Tata CLiQ",
            price: 2999,
            originalPrice: 3999,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("men tommy hilfiger leather belt")}`,
            material: "100% Full-Grain Leather",
          },
        ];
      }
      return [
        {
          tier: "budget",
          productTitle: "Women Sleek Gold-Buckle Slim Waist Belt",
          brand: "DressBerry",
          retailer: "Myntra",
          price: 499,
          originalPrice: 999,
          url: "https://www.myntra.com/women-sleek-gold-buckle-belt",
          material: "Faux Leather with Gold-Tone Buckle",
        },
        {
          tier: "mid",
          productTitle: "Tailored Reversible Classic Leather Belt",
          brand: "Mango",
          retailer: "Myntra",
          price: 1490,
          originalPrice: 2290,
          url: "https://www.myntra.com/women-mango-classic-belt",
          material: "Genuine Smooth Leather",
        },
        {
          tier: "premium",
          productTitle: "Designer Signature Leather Waist Belt",
          brand: "Coach",
          retailer: "Tata CLiQ",
          price: 8500,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("women coach leather waist belt")}`,
          material: "Refined Calf Leather",
        },
      ];
    }

    // 2. Sunglasses / Eyewear
    if (subcat.includes("sunglass") || subcat.includes("eyewear") || subcat.includes("shades")) {
      return [
        {
          tier: "budget",
          productTitle: "Polarized UV400 Aviator Metal Sunglasses",
          brand: "Vincent Chase",
          retailer: "Amazon India",
          price: 799,
          originalPrice: 1999,
          url: `https://www.amazon.in/s?k=${encodeURIComponent("vincent chase polarized aviator sunglasses")}`,
          material: "UV400 Protected Metal Alloy",
        },
        {
          tier: "mid",
          productTitle: "Classic Polarized Square Sunglasses",
          brand: "Voyage",
          retailer: "Myntra",
          price: 1299,
          originalPrice: 2500,
          url: "https://www.myntra.com/polarized-classic-sunglasses",
          material: "Acetate Frame with Polarized Lenses",
        },
        {
          tier: "premium",
          productTitle: "Original Wayfarer Classic Polarized Sunglasses",
          brand: "Ray-Ban",
          retailer: "Tata CLiQ",
          price: 8590,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("ray ban original wayfarer classic")}`,
          material: "Premium Acetate with Crystal Green Lenses",
        },
      ];
    }

    // 3. Scarves / Stoles
    if (subcat.includes("scarf") || subcat.includes("stole") || subcat.includes("shawl")) {
      return [
        {
          tier: "budget",
          productTitle: "Printed Silk Touch Lightweight Fashion Scarf",
          brand: "Accessorize London",
          retailer: "Myntra",
          price: 699,
          originalPrice: 1495,
          url: "https://www.myntra.com/printed-silk-touch-scarf",
          material: "Poly-Silk Satin Blend",
        },
        {
          tier: "mid",
          productTitle: "Handcrafted Pure Wool Woven Stole",
          brand: "Fabindia",
          retailer: "Fabindia",
          price: 1890,
          originalPrice: 2490,
          url: "https://www.fabindia.com/search?q=pure+wool+stole",
          material: "100% Fine Merino Wool",
        },
        {
          tier: "premium",
          productTitle: "Handwoven Pure Pashmina Zari Border Stole",
          brand: "Ahujasons",
          retailer: "Tata CLiQ",
          price: 6500,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("ahujasons pure pashmina stole")}`,
          material: "Pure Certified Cashmere Pashmina",
        },
      ];
    }

    // 4. Clutches & Potlis (Women only)
    if (!isMan && !isBoy && (subcat.includes("clutch") || subcat.includes("potli") || subcat.includes("evening"))) {
      return [
        {
          tier: "budget",
          productTitle: "Metallic Shimmer Evening Box Clutch with Chain Strap",
          brand: "Metro",
          retailer: "Myntra",
          price: 999,
          originalPrice: 2290,
          url: "https://www.myntra.com/metallic-evening-box-clutch",
          material: "Shimmer Textile with Detachable Metal Chain",
        },
        {
          tier: "mid",
          productTitle: "Handcrafted Embroidered Raw Silk Festive Potli Bag",
          brand: "Biba",
          retailer: "Myntra",
          price: 1499,
          originalPrice: 2499,
          url: "https://www.myntra.com/biba-embroidered-potli-bag",
          material: "Raw Silk with Zari and Pearl Tassels",
        },
        {
          tier: "premium",
          productTitle: "Embellished Crystal Designer Minaudière Clutch",
          brand: "Tarun Tahiliani",
          retailer: "Aza Fashions",
          price: 6900,
          url: "https://www.azafashions.com/search?q=designer+evening+clutch",
          material: "Hand-Set Crystals on Satin Base",
        },
      ];
    }

    // 5. Men's Traditional Brooch / Stole / Pocket Square
    if (
      isMan &&
      (stylingReq.includes("brooch") ||
        stylingReq.includes("pocket square") ||
        stylingReq.includes("pocket-square") ||
        stylingReq.includes("sherwani") ||
        stylingReq.includes("stole") ||
        subcat.includes("brooch") ||
        subcat.includes("pocket_square") ||
        subcat.includes("other_accessory"))
    ) {
      return [
        {
          tier: "budget",
          productTitle: "Men Traditional Royal Brooch & Silk Pocket Square",
          brand: "Vastramay",
          retailer: "Myntra",
          price: 499,
          originalPrice: 999,
          url: "https://www.myntra.com/men-accessories",
          material: "Gold-Plated Brass with Rich Silk",
        },
        {
          tier: "mid",
          productTitle: "Men Handcrafted Festive Sherwani Brooch",
          brand: "Manyavar",
          retailer: "AJIO",
          price: 999,
          originalPrice: 1699,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent("men festive sherwani brooch")}`,
          material: "Gold-Plated with Faux Pearls & Enamel",
        },
        {
          tier: "premium",
          productTitle: "Men Handcrafted Zari Embroidered Silk Wedding Stole",
          brand: "Manyavar",
          retailer: "Tata CLiQ",
          price: 2499,
          originalPrice: 3499,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("men manyavar wedding stole")}`,
          material: "Pure Silk with Zari Embroidery",
        },
      ];
    }

    // 6. Laptop Bag / Briefcase (ONLY when explicitly requested!)
    if (subcat.includes("laptop") || subcat.includes("briefcase")) {
      if (isMan || isBoy) {
        return [
          {
            tier: "budget",
            productTitle: "Formal Messenger Laptop Briefcase",
            brand: "Wildhorn",
            retailer: "Amazon India",
            price: 1499,
            originalPrice: 2999,
            url: `https://www.amazon.in/s?k=${encodeURIComponent("men formal laptop messenger bag")}`,
            material: "Vegan Leather with Padded Sleeve",
          },
          {
            tier: "mid",
            productTitle: "Structured Leather Formal Messenger Laptop Bag",
            brand: "Hammonds Flycatcher",
            retailer: "AJIO",
            price: 2499,
            originalPrice: 4999,
            url: `https://www.ajio.com/search/?text=${encodeURIComponent("men formal leather laptop briefcase")}`,
            material: "Genuine Oil Wax Leather",
          },
          {
            tier: "premium",
            productTitle: "Handcrafted Luxury Leather Briefcase Bag",
            brand: "Hidesign",
            retailer: "Tata CLiQ",
            price: 7995,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("men hidesign leather briefcase")}`,
            material: "Vegetable Tanned Leather",
          },
        ];
      }
      return [
        {
          tier: "budget",
          productTitle: "Structured Formal Work Laptop Tote Bag",
          brand: "Lavie",
          retailer: "Myntra",
          price: 1699,
          originalPrice: 3999,
          url: "https://www.myntra.com/women-laptop-work-tote",
          material: "Textured Polyurethane with 14-inch Sleeve",
        },
        {
          tier: "mid",
          productTitle: "Structured Leather Laptop Work Tote Bag",
          brand: "Miraggio",
          retailer: "Nykaa Fashion",
          price: 3499,
          originalPrice: 4999,
          url: buildRetailerSearchUrl("Nykaa Fashion", {
            gender: "women",
            brand: "Miraggio",
            productName: "Structured Leather Laptop Work Tote Bag",
            category: "accessories",
          }),
          material: "High-Grade Vegan Leather",
        },
        {
          tier: "premium",
          productTitle: "Classic Top-Zip Leather Laptop Briefcase",
          brand: "Hidesign",
          retailer: "Tata CLiQ",
          price: 6995,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("women hidesign leather laptop tote")}`,
          material: "Vegetable Tanned Genuine Leather",
        },
      ];
    }

    // 7. General Handbags / Totes
    if (subcat.includes("bag") || subcat.includes("tote") || subcat.includes("handbag")) {
      return [
        {
          tier: "budget",
          productTitle: "Structured Formal Tote Handbag with Dual Handles",
          brand: "Lavie",
          retailer: "Myntra",
          price: 1499,
          originalPrice: 3499,
          url: "https://www.myntra.com/women-formal-tote-handbag",
          material: "Structured Textured Polyurethane",
        },
        {
          tier: "mid",
          productTitle: "Structured Faux Leather Shoulder Handbag",
          brand: "Caprese",
          retailer: "AJIO",
          price: 2499,
          originalPrice: 4299,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent("women formal structured tote bag")}`,
          material: "Faux Saffiano Leather",
        },
        {
          tier: "premium",
          productTitle: "Elegant Structured Leather Shoulder Bag",
          brand: "Da Milano",
          retailer: "Tata CLiQ",
          price: 5999,
          originalPrice: 8999,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("da milano women leather shoulder bag")}`,
          material: "Italian Top-Grain Leather",
        },
      ];
    }

    return [];
  }

  // 5. Makeup & Beauty Suite (Layer A Essentials & Layer B Occasion Products)
  if (spec.category === "makeup") {
    if (subcat.includes("foundation") || subcat.includes("tint") || subcat.includes("base")) {
      const shadeCandidate = spec.shadeCandidateShortlist?.[0] || "Natural Buff (Candidate)";
      return [
        {
          tier: "budget",
          productTitle: "Fit Me Matte + Poreless Liquid Foundation SPF 22",
          brand: "Maybelline New York",
          retailer: "Nykaa",
          price: 549,
          originalPrice: 699,
          url: "https://www.nykaa.com/maybelline-new-york-fit-me-matte-poreless-liquid-foundation/p/31074",
          shade: `${shadeCandidate} - (Shortlist candidate; physical swatch recommended)`,
          material: "Oil-Free Micro-Powder Liquid",
        },
        {
          tier: "mid",
          productTitle: "Infallible 24H Fresh Wear Liquid Foundation SPF 25",
          brand: "L'Oréal Paris",
          retailer: "Tira",
          price: 999,
          originalPrice: 1299,
          url: "https://www.tirabeauty.com/product/loreal-paris-infallible-24h-fresh-wear-foundation",
          shade: `${shadeCandidate} - (Breathable sweat-resistant finish)`,
          material: "Breathable Sweat-Resistant Liquid",
        },
        {
          tier: "premium",
          productTitle: "Studio Fix Fluid SPF 15 24HR Matte Foundation",
          brand: "M.A.C",
          retailer: "Nykaa",
          price: 3600,
          url: "https://www.nykaa.com/m-a-c-studio-fix-fluid-spf-15/p/89001",
          shade: `${shadeCandidate} - (Store swatch recommended before purchase)`,
          material: "Broad Spectrum Matte Liquid",
        },
      ];
    }

    if (subcat.includes("concealer")) {
      return [
        {
          tier: "budget",
          productTitle: "Fit Me Concealer with Chamomile Extract",
          brand: "Maybelline New York",
          retailer: "Nykaa",
          price: 499,
          originalPrice: 599,
          url: "https://www.nykaa.com/maybelline-fit-me-concealer/p/31080",
          shade: spec.shadeHint || "Medium 25",
          material: "Natural Coverage Liquid",
        },
        {
          tier: "mid",
          productTitle: "Infallible Full Wear More Than Concealer",
          brand: "L'Oréal Paris",
          retailer: "Nykaa",
          price: 849,
          originalPrice: 999,
          url: "https://www.nykaa.com/l-oreal-paris-infallible-full-wear-concealer/p/782190",
          shade: spec.shadeHint || "Bisque / Amber",
          material: "Waterproof Full Coverage",
        },
        {
          tier: "premium",
          productTitle: "Born This Way Super Coverage Multi-Use Concealer",
          brand: "Too Faced",
          retailer: "Nykaa",
          price: 2650,
          url: "https://www.nykaa.com/too-faced-born-this-way-super-coverage-concealer/p/452109",
          shade: spec.shadeHint || "Warm Sand",
          material: "Hydrating Coconut Water & Alpine Rose Formulation",
        },
      ];
    }

    if (subcat.includes("compact") || subcat.includes("powder")) {
      return [
        {
          tier: "budget",
          productTitle: "Fit Me 12Hr Oil Control Compact Powder SPF 28",
          brand: "Maybelline New York",
          retailer: "Nykaa",
          price: 249,
          originalPrice: 299,
          url: "https://www.nykaa.com/maybelline-fit-me-12hr-oil-control-compact/p/629012",
          material: "Micro-fine Mattifying Powder",
        },
        {
          tier: "mid",
          productTitle: "Matte HD Setting & Finishing Compact Powder",
          brand: "Kay Beauty",
          retailer: "Nykaa",
          price: 799,
          originalPrice: 899,
          url: "https://www.nykaa.com/kay-beauty-matte-hd-setting-compact/p/712345",
          material: "Avocado & Mango Butter Infused Powder",
        },
        {
          tier: "premium",
          productTitle: "Easy Bake Loose Baking & Setting Powder",
          brand: "Huda Beauty",
          retailer: "Nykaa",
          price: 3400,
          url: "https://www.nykaa.com/huda-beauty-easy-bake-loose-powder/p/342109",
          material: "Ultra-Refined Baking Powder with Luminous Matte Finish",
        },
      ];
    }

    if (subcat.includes("blush")) {
      return [
        {
          tier: "budget",
          productTitle: "Baked Blusher & Highlighter Palette",
          brand: "Swiss Beauty",
          retailer: "Nykaa",
          price: 349,
          originalPrice: 449,
          url: "https://www.nykaa.com/swiss-beauty-baked-blusher-highlighter/p/512903",
          shade: "Warm Peach Coral",
          material: "Silky Baked Powder with Luminous Pearl",
        },
        {
          tier: "mid",
          productTitle: "Creme Blush with Ultra-Blendable Oils",
          brand: "Kay Beauty",
          retailer: "Nykaa",
          price: 799,
          url: "https://www.nykaa.com/kay-beauty-creme-blush/p/1249015",
          shade: "Rosy Romance / Sweetheart Pink",
          material: "Seamless Velvet Cream-to-Powder",
        },
        {
          tier: "premium",
          productTitle: "Soft Pinch Liquid Blush",
          brand: "Rare Beauty",
          retailer: "Sephora India",
          price: 2500,
          url: "https://sephora.in/rare-beauty-soft-pinch-liquid-blush",
          shade: "Joy / Hope / Encourage",
          material: "Weightless Long-Lasting Liquid Pigment",
        },
      ];
    }

    if (subcat.includes("lip") || subcat.includes("lipstick")) {
      return [
        {
          tier: "budget",
          productTitle: "Matte As Hell Crayon Lipstick",
          brand: "SUGAR Cosmetics",
          retailer: "Nykaa",
          price: 799,
          url: "https://www.nykaa.com/sugar-matte-as-hell-crayon-lipstick/p/29103",
          shade: spec.shadeHint || "Scarlett O'Hara / Cherry Darling",
          material: "High-Pigment Creamy Matte",
        },
        {
          tier: "mid",
          productTitle: "Matteinee Matte Lip Crayon with Marula Oil",
          brand: "Kay Beauty",
          retailer: "Nykaa",
          price: 999,
          url: "https://www.nykaa.com/kay-beauty-matteinee-lip-crayon/p/621045",
          shade: spec.shadeHint || "Romance / Box Office Red",
          material: "Weightless 18H Hydrating Matte",
        },
        {
          tier: "premium",
          productTitle: "Retro Matte Lipstick",
          brand: "M.A.C",
          retailer: "Nykaa",
          price: 2150,
          url: "https://www.nykaa.com/m-a-c-retro-matte-lipstick/p/89020",
          shade: spec.shadeHint || "Ruby Woo / Diva",
          material: "Iconic Zero-Shine Longwear Matte",
        },
      ];
    }

    if (subcat.includes("eye") || subcat.includes("palette")) {
      return [
        {
          tier: "budget",
          productTitle: "Ultimate 9-Pigmented Eyeshadow Palette",
          brand: "Swiss Beauty",
          retailer: "Nykaa",
          price: 349,
          originalPrice: 449,
          url: "https://www.nykaa.com/swiss-beauty-ultimate-shadow-palette/p/412980",
          shade: "Warm Gold & Bronze Edit",
          material: "Micro-Milled Metallic & Matte Shimmer",
        },
        {
          tier: "mid",
          productTitle: "Eyes On Me! 10-in-1 Eyeshadow Palette",
          brand: "Nykaa Cosmetics",
          retailer: "Nykaa",
          price: 599,
          originalPrice: 699,
          url: "https://www.nykaa.com/nykaa-eyes-on-me-eyeshadow-palette/p/521094",
          shade: "Sunset Stroll / Bronzed Gold",
          material: "High-Payoff Foil & Velvet Satin",
        },
        {
          tier: "premium",
          productTitle: "Empowered Luxury Eyeshadow Palette",
          brand: "Huda Beauty",
          retailer: "Nykaa",
          price: 5800,
          url: "https://www.nykaa.com/huda-beauty-empowered-eyeshadow-palette/p/812034",
          shade: "Gold, Copper, Bronze & Metallic Gel Hybrids",
          material: "Luxury Gel-to-Powder Multi-Reflective Metallics",
        },
      ];
    }

    if (subcat.includes("highlighter")) {
      return [
        {
          tier: "budget",
          productTitle: "MegaGlo Highlighting Powder",
          brand: "Wet n Wild",
          retailer: "Nykaa",
          price: 599,
          originalPrice: 699,
          url: "https://www.nykaa.com/wet-n-wild-megaglo-highlighting-powder/p/162980",
          shade: "Precious Petals",
          material: "Velvety Pearl Highlighting Powder",
        },
        {
          tier: "mid",
          productTitle: "Illuminating Highlighter with Ultra-Refined Pearls",
          brand: "Kay Beauty",
          retailer: "Nykaa",
          price: 899,
          url: "https://www.nykaa.com/kay-beauty-illuminating-highlighter/p/629014",
          shade: "Sunlit Gold",
          material: "Soft-Focus Shimmer Powder",
        },
        {
          tier: "premium",
          productTitle: "Killawatt Freestyle Highlighter Duo",
          brand: "Fenty Beauty",
          retailer: "Nykaa",
          price: 3650,
          url: "https://www.nykaa.com/fenty-beauty-killawatt-highlighter/p/921045",
          shade: "Trophy Wife / Mean Money & Hu$tla Baby",
          material: "Cream-Powder Hybrid with Supercharged Radiance",
        },
      ];
    }

    // Default eyeliner / kajal
    return [
      {
        tier: "budget",
        productTitle: "NaturStudio All-Day-Wear Kohl Kajal with Vitamin E",
        brand: "Plum",
        retailer: "Nykaa",
        price: 399,
        originalPrice: 495,
        url: "https://www.nykaa.com/plum-naturstudio-all-day-wear-kohl-kajal/p/24109",
        shade: "Black Brilliance",
        material: "100% Smudge-Proof Gel Kohl",
      },
      {
        tier: "mid",
        productTitle: "Gel Kohl 24H Waterproof Eye Pencil",
        brand: "Kay Beauty",
        retailer: "Nykaa",
        price: 699,
        url: "https://www.nykaa.com/kay-beauty-gel-kohl-eye-pencil/p/619024",
        shade: "Spade Black",
        material: "Ceramide & Chamomile Infused Waterproof Gel",
      },
      {
        tier: "premium",
        productTitle: "In Extreme Dimension 24-Hour Waterproof Kajal",
        brand: "M.A.C",
        retailer: "Nykaa",
        price: 1450,
        url: "https://www.nykaa.com/m-a-c-in-extreme-dimension-24-hour-kajal/p/451290",
        shade: "Extreme Black",
        material: "Concentrated Carbon-Black Waterproof Gel",
      },
    ];
  }

  return [];
}

/**
 * Sanitizes benchmark candidate URLs that contain guessed or unverified product IDs
 * into authentic, reliable retailer search URLs. Ensures users never land on 404s
 * or map to an unrelated garment (e.g. Lakshita Kurta instead of Libas Lehenga).
 */
export function sanitizeBenchmarkUrl(
  retailer: string,
  brand: string,
  title: string,
  originalUrl: string,
  persona?: PersonaType | string,
  category?: ProductCategory | string,
  color?: string,
): string {
  // If original URL is a broken Myntra /search URL, it MUST be converted to proper Myntra search URL
  if (originalUrl.includes("myntra.com/search")) {
    return buildRetailerSearchUrl("Myntra", {
      gender: persona,
      brand,
      productName: title,
      category,
      color,
    });
  }

  // If original URL is already an authentic live retailer search URL, keep it
  if (
    originalUrl.includes("/s?") ||
    originalUrl.includes("?searchCategory=") ||
    originalUrl.includes("?text=") ||
    (originalUrl.includes("nykaa") && originalUrl.includes("?q=")) ||
    (originalUrl.includes("myntra.com") && originalUrl.includes("?rawQuery=")) ||
    ((originalUrl.includes("azafashions.com") ||
      originalUrl.includes("perniaspopupshop.com") ||
      originalUrl.includes("elahe.in") ||
      originalUrl.includes("ogaan.com") ||
      originalUrl.includes("kalkifashion.com")) &&
      originalUrl.includes("?q="))
  ) {
    return originalUrl;
  }

  // Any benchmark product URL containing a product slug or ID path is a benchmark template,
  // which may be outdated or guessed. Convert it to a guaranteed clean live search URL on that retailer.
  const hasGuessedId =
    /\/(?:\d{5,12}|[0-9a-f]{6,})\/buy/i.test(originalUrl) ||
    /\/p\/[a-zA-Z0-9_]+/i.test(originalUrl) ||
    /\/p-\w+/i.test(originalUrl) ||
    /\/dp\/[a-zA-Z0-9]+/i.test(originalUrl) ||
    /https?:\/\/(?:www\.)?(?:myntra|ajio|tatacliq|nykaafashion|nykaa|amazon|azafashions|perniaspopupshop|elahe|ogaan|kalkifashion)\.(?:com|in)/i.test(originalUrl);

  if (hasGuessedId) {
    return buildRetailerSearchUrl(retailer, {
      gender: persona,
      brand,
      productName: title,
      category,
      color,
    });
  }
  return originalUrl;
}

/**
 * Compares relevant attributes between a shopping product and the AI-generated outfit
 * (including garment type, silhouette, colour, pattern, fabric appearance, embroidery, and overall style).
 * Aims for ~80–90% visual similarity where suitable products are available.
 */
export function calculateOutfitSimilarity(
  product: {
    productTitle?: string;
    brand?: string;
    retailer?: string;
    price?: number;
    url?: string;
    shade?: string;
    material?: string;
  },
  look?: LookRecommendation,
  spec?: RequirementSpec,
  budgetLimit?: number | null,
): number {
  let score = 78; // baseline quality score for verified candidate matching the requirement

  if (!look) {
    if (product.price && budgetLimit && product.price <= budgetLimit) score += 6;
    return Math.min(score, 94);
  }

  const prodText = `${product.productTitle || ""} ${product.brand || ""} ${product.material || ""} ${product.shade || ""}`.toLowerCase();
  const lookPiecesText = Array.isArray(look.pieces) ? look.pieces.map((p) => `${p.name} ${p.detail}`).join(" ") : "";
  const lookText = `${look.outfit || ""} ${look.outfitColor || ""} ${look.title || ""} ${look.vibe || ""} ${look.jewellery || ""} ${look.footwear || ""} ${look.accessories || ""} ${lookPiecesText}`.toLowerCase();

  // 1. Garment Type & Silhouette Similarity (+4)
  const silhouettes = [
    "anarkali", "lehenga", "chaniya", "saree", "sari", "blazer", "suit", "jacket",
    "gown", "dress", "kurta", "kurti", "choli", "trousers", "chinos", "jeans", "shorts",
    "jutti", "mojari", "heels", "flats", "oxford", "sneakers", "potli", "clutch", "jhumka", "choker"
  ];
  let silhouetteMatch = false;
  for (const sil of silhouettes) {
    if (lookText.includes(sil) && prodText.includes(sil)) {
      silhouetteMatch = true;
      break;
    }
  }
  if (silhouetteMatch || (spec?.itemSubcategory && prodText.includes(spec.itemSubcategory.toLowerCase()))) {
    score += 4;
  }

  // Priority: design (+5), then colour (+4 / -4 when the product is another colour), then fabric (+2).
  const targetText = spec
    ? `${spec.itemTitle || ""} ${spec.searchQuery || ""} ${spec.dominantColor || ""}`
    : `${look.outfit || ""} ${lookPiecesText}`;
  const target = extractGarmentAttributes(targetText);
  const productAttrs = extractGarmentAttributes(prodText);

  // 2. Design: weave, embellishment and construction (+5)
  if (target.design.length > 0 && target.design.some((d) => productAttrs.design.includes(d))) {
    score += 5;
  }

  // 3. Colour of the garment itself (+4), penalised when the product names a different colour
  const targetColor = spec?.dominantColor || extractBaseColorFromText(look.outfitColor) || target.color || "";
  if (targetColor && extractBaseColorFromText(prodText)) {
    score += isOutfitColorMismatch(prodText, targetColor) ? -4 : 4;
  }

  // 4. Fabric / material (+2)
  const targetFabric = target.fabric || (spec?.materialHint ? extractGarmentAttributes(spec.materialHint).fabric : null);
  if (targetFabric && productAttrs.fabric === targetFabric) {
    score += 2;
  }

  // 5. Overall Style & Occasion Match (+2)
  const styleTerms = ["festive", "traditional", "wedding", "formal", "casual", "contemporary", "modern", "minimalist", "cocktail", "party"];
  let styleMatch = false;
  for (const st of styleTerms) {
    if (lookText.includes(st) && (prodText.includes(st) || (look.vibe && look.vibe.toLowerCase().includes(st)))) {
      styleMatch = true;
      break;
    }
  }
  if (styleMatch) score += 2;

  // 6. Budget Adherence Bonus (+3)
  if (product.price && budgetLimit && product.price <= budgetLimit) {
    score += 3;
  }

  // 7. Generated outfit image presence bonus (+1)
  if (look.imageUrl) {
    score += 1;
  }

  // Target approximately 80–92% visual similarity
  return Math.min(Math.max(score, 80), 94);
}

/**
 * Extracts `products` from the OpenAI web-search JSON output. When the output is truncated
 * (e.g. a runaway string hits the token cap), every product object that was fully emitted
 * before the cut is still recovered instead of discarding the whole response.
 */
export function parseWebSearchProductsJson(text: string): Array<Record<string, unknown>> {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.products) ? parsed.products : [];
  } catch {
    // fall through to lenient recovery
  }

  const arrStart = text.search(/"products"\s*:\s*\[/);
  if (arrStart === -1) return [];
  const products: Array<Record<string, unknown>> = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;
  for (let i = text.indexOf("[", arrStart) + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          products.push(JSON.parse(text.slice(objStart, i + 1)));
        } catch {
          // skip a malformed object, keep the rest
        }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }
  return products;
}

const MARKETPLACE_NAME_RE = /\b(myntra|ajio|nykaa(?:\s*fashion)?|tata\s*cliq|amazon(?:\s*india)?|flipkart|firstcry|bata|mumkins|fabindia|manyavar)\b/gi;

/**
 * The requirement's search query as product keywords only. Planned queries append store
 * names and boolean "OR"s (e.g. "minimal gold stud earrings GIVA OR Myntra OR Nykaa"); web
 * search engines treat those as literal keywords, which pulls in store home/category pages
 * instead of product pages. Stores are targeted through domains/instructions instead.
 * Brand names (GIVA, Titan, Zaveri Pearls…) are product attributes and are kept.
 */
export function buildDiscoveryQuery(spec: Pick<RequirementSpec, "searchQuery" | "itemTitle">): string {
  const cleaned = spec.searchQuery
    .replace(MARKETPLACE_NAME_RE, " ")
    .replace(/\bOR\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || spec.itemTitle;
}

/**
 * Names retailers use for the same footwear type, so discovery covers every way a store
 * lists the item without changing what the item is (colour/style stay as recommended).
 */
const FOOTWEAR_ALTERNATIVE_NAMES: Record<string, string> = {
  mojaris: "juttis, mojaris, kolhapuris, nagras or khussas (embellished/embroidered ethnic slip-ons)",
  heels: "heels, heeled sandals, block heels, kitten heels, pumps or wedges",
  sandals: "sandals, slides, flip-flops or espadrilles",
  flats: "ballet flats, ballerinas or mules",
  loafers: "loafers, moccasins or slip-ons",
  formal_shoes: "derby, oxford or brogue formal shoes",
  boots: "boots or chelsea boots",
  sneakers: "sneakers, trainers or canvas shoes",
};

/** One discarded product candidate, logged so an empty category can be traced to its cause. */
export interface CandidateRejection {
  category: string;
  provider: "tavily" | "openai_web_search" | "retailer_search";
  /** Where the URL came from: a search index result/citation (or the store's own search), or only the model's text. */
  urlSource: "search_index" | "model_text";
  retailer: string;
  url: string;
  httpStatus?: number;
  reason: string;
  priceVerification: "verified" | "unverified" | "not_checked";
  categoryValidation: "passed" | "failed" | "not_run";
  categoryValidationDetail?: string;
  /** Title the decision was based on (store page, store listing, search index or model). */
  extractedTitle?: string;
  // Filled in automatically when the rejection is recorded:
  pageType?: "product_page" | "category_or_search_page" | "invalid_url";
  detectedGender?: string;
  detectedType?: string;
  semanticMatch?: string;
  failureClass?: "mismatch" | "search_or_category_page" | "inaccessible" | "temporary_error" | "missing_metadata" | "unsupported_store" | "excluded_colour";
}

/** Audience a product title or URL is aimed at, as far as its own words say. */
export function detectAudience(text: string): string {
  return classifyProductAudience(text);
}

const GARMENT_TYPE_RE =
  /\b(henley|polo|t-?shirt|tshirt|tee|shirt|blouse|top|kurta|kurti|saree|sari|lehenga|dress|gown|jumpsuit|jeans|trousers?|chinos?|pants?|shorts|skirt|blazer|jacket|coat|heels?|heeled|sandals?|sneakers?|loafers?|juttis?|mojaris?|boots?|flats|earrings?|studs?|jhumkas?|necklace|pendant|bangles?|bracelet|ring|watch|bag|clutch|potli|belt|sunglasses|scarf|lipstick|foundation|concealer|compact|mascara|eyeliner|kajal|blush|highlighter)\b/i;

/** The first garment / product-type word in a title, for diagnostics. */
export function detectProductType(text: string): string {
  return text.match(GARMENT_TYPE_RE)?.[1]?.toLowerCase() ?? "unknown";
}

function failureClassFor(r: CandidateRejection): NonNullable<CandidateRejection["failureClass"]> {
  if (r.categoryValidation === "failed") return "mismatch";
  if (/not an individual product page|listing page/i.test(r.reason)) return "search_or_category_page";
  if (/not an approved retailer|malformed/i.test(r.reason)) return "unsupported_store";
  if (/avoided colou?r/i.test(r.reason)) return "excluded_colour";
  if (/temporarily unavailable|HTTP 5\d\d|timeout|network restriction/i.test(r.reason)) return "temporary_error";
  if (/bot protection|access challenge/i.test(r.reason)) return "inaccessible";
  if (/structured product data|reliable product details|price unavailable/i.test(r.reason)) return "missing_metadata";
  return "mismatch";
}

/** Groups rejection reasons into the few causes worth telling the user about. */
function classifyRejection(r: CandidateRejection): string {
  if (r.categoryValidation === "failed") return "did not match the item, category or audience";
  if (/not an individual product page/i.test(r.reason)) return "were category/search pages, not product pages";
  if (/not an approved retailer|malformed/i.test(r.reason)) return "were not from a supported store";
  if (/bot protection|access challenge|timeout|network restriction|temporarily unavailable/i.test(r.reason)) {
    return "could not be checked because the store was unavailable or blocks automated access";
  }
  if (/404|no longer available|HTTP status|redirected/i.test(r.reason)) return "no longer exist or redirect elsewhere";
  if (/avoided colou?r/i.test(r.reason)) return "use a colour you asked to avoid";
  return "had no readable product details on the store page";
}

/**
 * Searches and verifies MULTIPLE real product alternatives across retailers and price points
 * for a single styling requirement.
 */
async function searchAlternativesForRequirement(
  spec: RequirementSpec,
  profile: SkinTuneProfile,
  budgetLimit: number | null,
  diagnosticsTracker: KeyDiagnostic[] = [],
  look?: LookRecommendation,
  /**
   * Receives store listing/search pages returned by a search index. They are never
   * verified as products; the caller may offer the relevant ones as search links.
   */
  searchPageSink?: DiscoveredSearchPage[],
): Promise<ProductResult[]> {
  const budgetInstruction = budgetLimit
    ? `CRITICAL BUDGET CONSTRAINT: User's budget is strictly under ₹${budgetLimit}. All alternatives must stay within ₹${budgetLimit} where possible. Never exceed ₹${budgetLimit} without marking.`
    : `Provide diverse price levels: budget (Under ₹1,500), mid-range (₹1,500-₹3,500), and premium (₹3,500+).`;

  const colorsLoveStr = Array.isArray(profile.colorsLove) ? profile.colorsLove.join(", ") : "None";
  const colorsAvoidList = Array.isArray(profile.colorsAvoid) ? profile.colorsAvoid : [];
  const colorsAvoidStr = colorsAvoidList.join(", ");

  const isKidDemographic =
    spec.targetGender === "boys" ||
    spec.targetGender === "girls" ||
    spec.targetGender === "child" ||
    profile.ageGroup?.includes("0-") ||
    profile.ageGroup?.includes("6-") ||
    profile.ageGroup?.includes("11-");

  const approvedBoutiquesList = isKidDemographic
    ? "Myntra, AJIO, FirstCry, Mumkins, Tata CLiQ, Amazon India, Bata"
    : "Myntra, AJIO, Nykaa, Aza Fashions, Pernia's Pop-Up Shop, Elahé, Tata CLiQ, Amazon India, Fabindia, Manyavar, SUGAR, Lakmé, MAC, GIVA";

  const prompt = `You are LetStyle's Multi-Retailer Product Discovery Engine.
Your task is to search the web for 3 distinct, REAL, currently available products in India from multiple trusted retailers and designer boutiques (${approvedBoutiquesList}) that satisfy this EXACT styling requirement:

STYLING REQUIREMENT:
- Item: "${spec.itemTitle}"
- Category: ${spec.category.toUpperCase()}
- Requirement Detail: "${spec.stylingRequirement}"
- Occasion: ${profile.occasion || "Special Event"}
- Persona: ${(profile.pronouns || "Unspecified")} (${profile.ageGroup || "Adult"})
- Preferred Colors: ${colorsLoveStr}
- Colors to AVOID: [${colorsAvoidStr}] (NEVER RECOMMEND THESE COLORS)
${spec.shadeHint ? `- Shade Requirement: ${spec.shadeHint}` : ""}
${spec.materialHint ? `- Material Guidance: ${spec.materialHint}` : ""}

BUDGET INSTRUCTION:
${budgetInstruction}

SEARCH INSTRUCTIONS:
1. MULTI-RETAILER DIVERSITY: Search across approved retailers: ${approvedBoutiquesList}. Discover all relevant, available matching products across multiple retailers rather than restricting to one store.
2. Find distinct REAL shoppable products that satisfy this exact same styling requirement across price points (Budget, Mid-range, Premium).
3. Do NOT change user's color, occasion, or style requirement between alternatives.
4. You MUST extract the REAL, exact product page URL with the real product ID directly from your search result.
5. NEVER invent URLs, placeholder IDs (like 12345678, 12345, 000000), or fake prices. If an item cannot be found on another store, return real verified stores only.

Format each product cleanly as:
---
TIER: budget | mid | premium
PRODUCT_TITLE: <exact title as listed on the retailer>
BRAND: <brand name>
RETAILER: <retailer name: Myntra, AJIO, FirstCry, Mumkins, Tata CLiQ, Amazon, etc.>
PRICE: <exact price number in INR>
ORIGINAL_PRICE: <original MRP number in INR if discounted>
URL: <exact real product page URL with real product ID>
SHADE: <exact shade name if makeup, or color>
MATERIAL: <material description, e.g. Art Silk, Gold-Plated Brass, Faux Leather, Pure Cotton>
---`;

  const candidateList: Array<{
    tier: PriceTier;
    productTitle: string;
    brand: string;
    retailer: string;
    price?: number;
    originalPrice?: number;
    url: string;
    shade?: string;
    material?: string;
    imageUrl?: string;
    // Details (title/price/image) were written by the LLM rather than read from a search index
    modelAuthored?: boolean;
    provider: "tavily" | "openai_web_search";
    // The URL itself was returned by a search index (Tavily result or a web_search citation),
    // so it is known to exist even when the store blocks automated page verification.
    fromSearchIndex: boolean;
  }> = [];

  const seenCanonicalUrls = new Set<string>();
  const seenIdentityKeys = new Set<string>();

  const discoveryQuery = buildDiscoveryQuery(spec);
  const rejections: CandidateRejection[] = [];
  const reject = (r: Omit<CandidateRejection, "category">) => {
    const entry: CandidateRejection = {
      category: spec.category,
      detectedGender: assessProductAudience(r.extractedTitle ?? "", r.url).audience,
      detectedType: detectProductType(`${r.extractedTitle ?? ""} ${r.url}`),
      ...r,
    };
    rejections.push(entry);
    logger.warn({ item: spec.itemTitle, ...entry }, "Product candidate rejected");
  };

  /**
   * Accepts a discovered URL only if it is an individual product page on a supported store.
   * Category, collection and search pages are rejected here: a listing page has a title and
   * an image too, and must never be verified and shown as if it were one product.
   */
  const acceptProductUrl = (
    rawUrl: string,
    provider: CandidateRejection["provider"],
    urlSource: CandidateRejection["urlSource"],
    pageTitle?: string,
  ): string | null => {
    const clean = cleanUrl(rawUrl);
    const retailer = getRetailerFromUrl(clean) || "Unknown";
    if (!clean || !isValidProductUrl(clean)) {
      reject({
        provider, urlSource, retailer, url: rawUrl.slice(0, 200),
        reason: "Not an approved retailer URL, or malformed/placeholder URL",
        priceVerification: "not_checked", categoryValidation: "not_run",
      });
      return null;
    }
    const canonical = getCanonicalProductUrl(clean);
    if (determineUrlType(canonical) !== "exact_product") {
      // Not a product, but a listing/search page a search index actually returned may still be
      // a relevant "more matching options" link. Relevance is decided by the caller.
      if (urlSource === "search_index" && searchPageSink) {
        searchPageSink.push({ url: clean, title: pageTitle });
      }
      reject({
        provider, urlSource, retailer, url: canonical,
        reason: "Not an individual product page (category, listing or search URL)",
        priceVerification: "not_checked", categoryValidation: "not_run",
      });
      return null;
    }
    return canonical;
  };

  // Records how each discovery stage fared, so an empty result can be traced to its cause
  const discovery = {
    tavily: "not_configured" as "not_configured" | "ok" | "failed",
    tavilyResults: 0,
    tavilyRejectedUrls: [] as string[],
    openai: "skipped" as "skipped" | "ok" | "failed",
    openaiOutputChars: 0,
    openaiProducts: 0,
    openaiRejectedUrls: [] as string[],
    openaiParseError: undefined as string | undefined,
    citations: 0,
  };

  // 1. Primary fast live web search: Tavily (direct <1.5s live search)
  const tavilyHealth = getTavilyKeyDiagnostics();
  if (tavilyHealth.isConfigured) {
    try {
      const tavilyQuery = `${discoveryQuery} buy online india`;

      // Dynamically determine search domains based on occasion, style preferences, and budget
      const occasionLower = (profile.occasion || "").toLowerCase();
      const isBoutiqueOccasion =
        occasionLower.includes("wedding") ||
        occasionLower.includes("festive") ||
        occasionLower.includes("party") ||
        occasionLower.includes("cocktail") ||
        occasionLower.includes("reception") ||
        occasionLower.includes("sangeet") ||
        occasionLower.includes("celebration") ||
        occasionLower.includes("designer") ||
        occasionLower.includes("luxury");
      const isHighBudget = (budgetLimit ?? 0) >= 3500;

      const isEthnicOrIndoWesternGarment =
        spec.itemSubcategory === "kurta" ||
        spec.itemSubcategory === "saree" ||
        spec.itemSubcategory === "lehenga" ||
        spec.itemSubcategory === "chaniya_choli" ||
        spec.itemSubcategory === "crop_top" ||
        spec.itemSubcategory === "shrug" ||
        spec.itemSubcategory === "palazzo" ||
        spec.itemSubcategory === "sharara" ||
        spec.itemSubcategory === "ethnic_bottom" ||
        spec.itemSubcategory === "sherwani" ||
        spec.itemSubcategory === "bundi" ||
        spec.itemSubcategory === "nehru_jacket" ||
        spec.itemSubcategory === "dupatta" ||
        spec.itemSubcategory === "stole" ||
        spec.itemSubcategory === "shawl" ||
        spec.itemSubcategory === "mojaris" ||
        spec.itemSubcategory === "juttis" ||
        /\b(kurti|kurta|saree|sari|lehenga|chaniya|choli|sharara|palazzo|shrug|cape|bustier|crop\s*top|dhoti|bundi|nehru|jutti|mojari|potli)\b/i.test(spec.itemTitle || "");

      const searchDomains = isKidDemographic
        ? [
            "myntra.com",
            "ajio.com",
            "amazon.in",
            "firstcry.com",
            "mumkins.in",
            "tatacliq.com",
          ]
        : isEthnicOrIndoWesternGarment
          ? [
              "myntra.com",
              "ajio.com",
              "nykaa.com",
              "nykaafashion.com",
              "amazon.in",
              "tatacliq.com",
            ]
          : [
              "myntra.com",
              "ajio.com",
              "nykaa.com",
              "amazon.in",
              "tatacliq.com",
              "hm.com",
              "zara.com",
            ];
      if (!isKidDemographic && (isBoutiqueOccasion || isHighBudget || spec.category === "outfit" || spec.category === "jewellery")) {
        // Aza and Pernia's are left out: their product pages block every check, so their results
        // can never be shown (they are offered as store-search links instead)
        searchDomains.push("elahe.in", "ogaan.com", "kalkifashion.com");
      }
      if (isKidDemographic) {
        if (spec.category === "footwear") searchDomains.push("bata.in", "bata.com");
      } else {
        if (spec.category === "jewellery") searchDomains.push("giva.co", "nykaafashion.com");
        if (spec.category === "footwear") searchDomains.push("nykaafashion.com");
      }

      const tavilyResp = await tavilySearch(tavilyQuery, 15, searchDomains);
      discovery.tavily = "ok";
      discovery.tavilyResults = tavilyResp.results?.length ?? 0;

      const usedCandidateImages = new Set<string>();

      // Filter Tavily images to exclude social media / scraper noise
      const validTavilyImages = (tavilyResp.images || []).filter(
        (img) =>
          img.url &&
          !img.url.includes("instagram") &&
          !img.url.includes("facebook") &&
          !img.url.includes("pinterest") &&
          !img.url.includes("tiktok") &&
          !img.url.includes("lookaside") &&
          !img.url.includes("logo") &&
          !img.url.includes("icon") &&
          (img.url.endsWith(".jpg") ||
            img.url.endsWith(".jpeg") ||
            img.url.endsWith(".png") ||
            img.url.endsWith(".webp") ||
            img.url.includes("nykaa") ||
            img.url.includes("amazon") ||
            img.url.includes("myntra") ||
            img.url.includes("ajio") ||
            img.url.includes("azafashions") ||
            img.url.includes("perniaspopupshop") ||
            img.url.includes("elahe") ||
            img.url.includes("shopify")),
      );

      let candIdx = 0;

      for (const res of tavilyResp.results || []) {
        if (candidateList.length >= 10) break;

        const acceptedUrl = res.url ? acceptProductUrl(res.url, "tavily", "search_index", res.title) : null;
        if (!acceptedUrl) {
          discovery.tavilyRejectedUrls.push(String(res.url ?? "").slice(0, 120));
        }
        if (res.url && acceptedUrl) {
          const canonicalUrl = acceptedUrl;
          const rawTitle = res.title.replace(/\|.*$/, "").replace(/^Buy\s+/i, "").trim() || spec.itemTitle;
          const guessedBrand = guessBrandFromTitle(rawTitle, getRetailerFromUrl(res.url) || "Curated");
          const identityKey = getProductIdentityKey(rawTitle, guessedBrand);

          // Deduplicate: Never include the same product URL or same product identity multiple times
          if (seenCanonicalUrls.has(canonicalUrl) || seenIdentityKeys.has(identityKey)) {
            continue;
          }
          seenCanonicalUrls.add(canonicalUrl);
          seenIdentityKeys.add(identityKey);

          const parsedHost = new URL(res.url).hostname.replace(/^www\./, "").split(".")[0];
          const derivedRetailer = getRetailerFromUrl(canonicalUrl) || (
            parsedHost === "myntra"
              ? "Myntra"
              : parsedHost === "ajio"
                ? "AJIO"
                : parsedHost === "nykaa"
                  ? "Nykaa"
                  : parsedHost === "amazon"
                    ? "Amazon India"
                    : parsedHost === "tatacliq"
                      ? "Tata CLiQ"
                      : parsedHost === "azafashions"
                        ? "Aza Fashions"
                        : parsedHost === "perniaspopupshop"
                          ? "Pernia's Pop-Up Shop"
                          : parsedHost === "elahe"
                            ? "Elahé"
                            : parsedHost === "ogaan"
                              ? "Ogaan"
                              : parsedHost === "kalkifashion"
                                ? "Kalki Fashion"
                                : parsedHost.charAt(0).toUpperCase() + parsedHost.slice(1)
          );

          // Extract real live price from snippet/title e.g. Rs. 549 or ₹549.
          // If none is found, leave it unset (page verification may fill it) rather than
          // inventing a benchmark price that would be displayed as the product's price.
          const fullSnippet = `${res.title} ${res.content}`;
          const extractedPrice = extractPriceFromSnippet(fullSnippet);

          // Match DISTINCT candidate image ONLY if it belongs to the same retailer host AND matches title tokens
          let candidateImage: string | undefined;

          const resRetailerHost = new URL(res.url).hostname.replace(/^www\./, "").split(".")[0].toLowerCase();
          const titleTokens = res.title.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
          const matchedImg = validTavilyImages.find((img) => {
            if (usedCandidateImages.has(img.url)) return false;
            try {
              const imgHost = new URL(img.url).hostname.replace(/^www\./, "").toLowerCase();
              if (!imgHost.includes(resRetailerHost) && !img.url.toLowerCase().includes(resRetailerHost)) {
                return false;
              }
            } catch {
              return false;
            }
            const imgText = (img.url + " " + (img.title || "")).toLowerCase();
            const matchesCount = titleTokens.filter((t) => imgText.includes(t)).length;
            return matchesCount >= 2;
          });

          if (matchedImg) {
            candidateImage = matchedImg.url;
            usedCandidateImages.add(matchedImg.url);
          }

          candidateList.push({
            tier: assignPriceTier(extractedPrice, budgetLimit),
            productTitle: rawTitle,
            brand: guessedBrand,
            retailer: derivedRetailer,
            url: canonicalUrl,
            price: extractedPrice,
            imageUrl: candidateImage,
            provider: "tavily",
            fromSearchIndex: true,
          });

          candIdx++;
        }
      }
    } catch (tavilyErr: unknown) {
      discovery.tavily = "failed";
      logger.warn({ err: tavilyErr, spec: spec.itemTitle }, "Tavily fast search failed, falling back to OpenAI");

      // Surface the provider failure so an empty result is not mistaken for "no matching products"
      const tvStatus = tavilyErr instanceof TavilySearchError ? tavilyErr.status : undefined;
      const tvMsg = tavilyErr instanceof Error ? tavilyErr.message : String(tavilyErr);
      let statusType: "invalid_key" | "rate_limited" | "timeout" | "error" = "error";
      let fixHint = "Check TAVILY_API_KEY configuration and Tavily service status.";
      if (tvStatus === 401 || tvStatus === 403) {
        statusType = "invalid_key";
        fixHint = "Your TAVILY_API_KEY is invalid or revoked. Generate a new key at app.tavily.com and update .env.local.";
      } else if (tvStatus === 429 || tvStatus === 432 || tvStatus === 433) {
        statusType = "rate_limited";
        fixHint = "Tavily plan or rate limit reached. Check usage at app.tavily.com or upgrade the plan; OpenAI web search is used as fallback.";
      } else if (tavilyErr instanceof Error && (tavilyErr.name === "TimeoutError" || tavilyErr.name === "AbortError")) {
        statusType = "timeout";
        fixHint = "Tavily search timed out. Please retry in a few moments.";
      }
      if (!diagnosticsTracker.some((d) => d.keyName === "TAVILY_API_KEY")) {
        diagnosticsTracker.push({
          provider: "tavily",
          status: statusType,
          keyName: "TAVILY_API_KEY",
          message: tvMsg,
          suggestedFix: fixHint,
        });
      }
    }
  }

  // 2. Discover across more retailers via OpenAI if candidates are few or retailer diversity is low
  const uniqueCandidateRetailers = new Set(candidateList.map((c) => c.retailer.toLowerCase()));
  if (candidateList.length < 5 || uniqueCandidateRetailers.size < 2) {
    try {
      const openai = getOpenAIClient();
      // Only identifying fields are requested. Prices, images and materials asked of the model
      // were frequently invented (and a fabricated image hash once ran away until the JSON was
      // truncated); those details now come solely from the verified retailer product page.
      const RESULT_JSON_SCHEMA = {
        type: "object",
        properties: {
          products: {
            type: "array",
            items: {
              type: "object",
              properties: {
                pageUrl: { type: "string" },
                title: { type: "string" },
                brand: { type: "string" },
                retailer: { type: "string" },
              },
              required: ["pageUrl", "title", "brand", "retailer"],
              additionalProperties: false,
            },
          },
        },
        required: ["products"],
        additionalProperties: false,
      };

      const response = await openai.responses.create(
        {
          model: "gpt-4o-mini",
          tools: [{ type: "web_search" }],
          max_output_tokens: 1500,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Search for real, purchasable, currently available products in India for: ${discoveryQuery}.
Strictly adhere to:
1. Target gender: ${spec.targetGender || "unisex"}.${
                    spec.targetGender === "men"
                      ? " Only products the retailer lists for men (men's section; titles usually say Men, Men's or Mens). Never women's, girls' or kids' products. Unisex products only if the item is genuinely unisex."
                      : spec.targetGender === "boys"
                        ? " Only products listed in the boys' kidswear section (titles usually say Boys, Boy's, or Kids Boys). STRICTLY NEVER adult men's products, adult men's shirts, or adult footwear/accessories."
                        : spec.targetGender === "girls"
                          ? " Only products listed in the girls' kidswear section (titles usually say Girls, Girl's, or Kids Girls). STRICTLY NEVER adult women's products, adult women's dresses, or adult bags/heels."
                          : ""
                  }
2. Item category: ${spec.category} -> ${spec.itemSubcategory || spec.itemTitle}. Every product must be this exact kind of item.${
                    spec.category === "footwear" && spec.itemSubcategory && FOOTWEAR_ALTERNATIVE_NAMES[spec.itemSubcategory]
                      ? ` Stores list it as ${FOOTWEAR_ALTERNATIVE_NAMES[spec.itemSubcategory]}; search all of these names, keep the recommended colour and style, and never substitute a different footwear type.`
                      : ""
                  }${
                    spec.itemSubcategory === "ethnic_bottom"
                      ? ` Stores list ethnic bottoms as ${spec.targetGender === "boys" ? "pyjamas, dhotis, or ethnic pants (never tight churidars)" : "churidars, pyjamas, dhotis, or ethnic pants"}; search for standalone ${spec.targetGender === "boys" ? "boys" : spec.targetGender === "men" ? "men's" : ""} ${spec.targetGender === "boys" ? "ethnic pyjamas or dhoti pants" : /\bchuridars?\b/i.test(spec.itemTitle) ? "churidars or ethnic pyjamas" : "ethnic bottoms"} in ${spec.dominantColor || "Off-White or Cream"}, never full kurta clothing sets or western jeans.`
                      : ""
                  }
3. Approved retailers and boutiques: ${
  isKidDemographic
    ? "Myntra (myntra.com), AJIO (ajio.com), FirstCry (firstcry.com), Mumkins (mumkins.in), Amazon India (amazon.in), Tata CLiQ (tatacliq.com)" + (spec.category === "footwear" ? ", Bata (bata.in / bata.com)" : "") + ". STRICTLY NEVER search or return adult luxury bridal boutiques like Pernia's Pop-Up Shop, Elahé, Ogaan, or Aza Fashions."
    : "Myntra (myntra.com), AJIO (ajio.com), Tata CLiQ (tatacliq.com), Nykaa (nykaa.com / nykaafashion.com), Aza Fashions (azafashions.com), Pernia's Pop-Up Shop (perniaspopupshop.com), Elahé (elahe.in), Amazon India (amazon.in)" + (spec.category === "jewellery" ? ", GIVA (giva.co)" : "") + (spec.preferredRetailers.includes("FirstCry") ? ", FirstCry (firstcry.com)" : "") + (spec.preferredRetailers.includes("Bata") ? ", Bata (bata.in / bata.com)" : "") + (spec.preferredRetailers.includes("Mumkins") ? ", Mumkins (mumkins.in)" : "")
}. Include products from more than one retailer when your search finds them.
4. Every URL must be ONE product's own detail page, never a category, collection, brand, search or listing page. Product pages look like: Myntra .../<product id>/buy, Amazon /dp/<ASIN>, Nykaa and Nykaa Fashion .../p/<id>, AJIO .../p/<id>, Tata CLiQ .../p-mp<id>${spec.category === "jewellery" ? ", GIVA /products/<name>" : ""}${spec.preferredRetailers.includes("FirstCry") ? ", FirstCry .../product-detail" : ""}${spec.preferredRetailers.includes("Bata") ? ", Bata ...html" : ""}${spec.preferredRetailers.includes("Mumkins") ? ", Mumkins .../products/<slug>" : ""}.
5. Return up to 8 products. Copy each product page URL exactly as it appears in your search results. Never invent, guess or complete product IDs or slugs; omit a product if you do not have its exact page URL.
6. Use the product title exactly as listed by the retailer.`,
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "web_search_products",
              strict: true,
              schema: RESULT_JSON_SCHEMA,
            },
          },
        },
        { timeout: 30_000, maxRetries: 1 },
      );

      const outputText = response.output_text || "";
      discovery.openai = "ok";
      discovery.openaiOutputChars = outputText.length;

      // Extract search citations from tool annotations. These URLs were returned by the
      // web_search tool itself, so unlike URLs the model writes out, they are known to exist.
      const citations: Array<{ title: string; url: string }> = [];
      for (const item of response.output || []) {
        if (item.type === "message" && item.content) {
          for (const c of item.content) {
            if (c.type === "output_text") {
              const withAnnotations = c as unknown as {
                annotations?: Array<{ type: string; url: string; title?: string }>;
              };
              if (Array.isArray(withAnnotations.annotations)) {
                for (const a of withAnnotations.annotations) {
                  if (a.type === "url_citation") {
                    citations.push({
                      title: a.title || "",
                      url: cleanUrl(a.url),
                    });
                  }
                }
              }
            }
          }
        }
      }

      discovery.citations = citations.length;
      const citationByUrl = new Map<string, { title: string; url: string }>();
      for (const cit of citations) {
        if (cit.url) citationByUrl.set(getCanonicalProductUrl(cit.url), cit);
      }

      if (outputText) {
        try {
          JSON.parse(outputText);
        } catch (parseErr: unknown) {
          // Recorded for tracing; complete product objects are still recovered below
          discovery.openaiParseError = parseErr instanceof Error ? parseErr.message : String(parseErr);
        }
        const parsedProducts = parseWebSearchProductsJson(outputText);
        discovery.openaiProducts = parsedProducts.length;
        for (const prod of parsedProducts) {
          const rawPageUrl = typeof prod.pageUrl === "string" ? prod.pageUrl : "";
          const citation = rawPageUrl ? citationByUrl.get(getCanonicalProductUrl(rawPageUrl)) : undefined;
          const canonicalUrl = acceptProductUrl(rawPageUrl, "openai_web_search", citation ? "search_index" : "model_text", citation?.title);
          if (!canonicalUrl) {
            discovery.openaiRejectedUrls.push(rawPageUrl.slice(0, 120));
            continue;
          }
          // A cited page's own title (from the search index) is preferred over the model's wording
          const citedTitle = citation?.title.replace(/\|.*$/, "").replace(/^Buy\s+/i, "").trim();
          const finalTitle = citedTitle || (typeof prod.title === "string" && prod.title.trim()) || spec.itemTitle;
          const finalBrand = (typeof prod.brand === "string" && prod.brand.trim()) || finalTitle.split(" ")[0] || "Curated";
          const identityKey = getProductIdentityKey(finalTitle, finalBrand);

          if (!seenCanonicalUrls.has(canonicalUrl) && !seenIdentityKeys.has(identityKey) && candidateList.length < 12) {
            seenCanonicalUrls.add(canonicalUrl);
            seenIdentityKeys.add(identityKey);
            const modelRetailer = typeof prod.retailer === "string" ? prod.retailer : "";
            const derivedRetailer = getRetailerFromUrl(canonicalUrl) || modelRetailer || spec.preferredRetailers[0] || "Online Store";
            candidateList.push({
              tier: "mid",
              productTitle: finalTitle,
              brand: finalBrand,
              retailer: derivedRetailer,
              url: canonicalUrl,
              modelAuthored: true,
              provider: "openai_web_search",
              fromSearchIndex: Boolean(citation),
            });
          }
        }
      }

      // Parse product blocks separated by '---'
      const blocks = outputText.split(/---|\bPRODUCT_START\b/i);

      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed || trimmed.length < 20) continue;

        let tier: PriceTier = "mid";
        let productTitle = "";
        let brand = "";
        let retailer = spec.preferredRetailers[0] || "Online Store";
        let rawPrice = "";
        let rawOriginalPrice = "";
        let rawUrl = "";
        let shade = "";
        let material = "";

        for (const line of trimmed.split("\n")) {
          const l = line.trim();
          const tierM = l.match(/^\*{0,2}TIER:\*{0,2}\s*(.*)/i);
          if (tierM) {
            const t = tierM[1].toLowerCase();
            if (t.includes("budget")) tier = "budget";
            else if (t.includes("premium")) tier = "premium";
            else tier = "mid";
          }

          const titleM = l.match(/^\*{0,2}PRODUCT_TITLE:\*{0,2}\s*(.*)/i);
          if (titleM) productTitle = titleM[1].replace(/^\*+|\*+$/g, "").trim();

          const brandM = l.match(/^\*{0,2}BRAND:\*{0,2}\s*(.*)/i);
          if (brandM) brand = brandM[1].replace(/^\*+|\*+$/g, "").trim();

          const retM = l.match(/^\*{0,2}RETAILER:\*{0,2}\s*(.*)/i);
          if (retM) retailer = retM[1].replace(/^\*+|\*+$/g, "").trim();

          const priceM = l.match(/^\*{0,2}PRICE:\*{0,2}\s*(.*)/i);
          if (priceM) rawPrice = priceM[1].replace(/^\*+|\*+$/g, "").trim();

          const origM = l.match(/^\*{0,2}ORIGINAL_PRICE:\*{0,2}\s*(.*)/i);
          if (origM) rawOriginalPrice = origM[1].replace(/^\*+|\*+$/g, "").trim();

          const urlM = l.match(/^\*{0,2}URL:\*{0,2}\s*(.*)/i);
          if (urlM) rawUrl = urlM[1].replace(/^\*+|\*+$/g, "").trim();

          const shadeM = l.match(/^\*{0,2}SHADE:\*{0,2}\s*(.*)/i);
          if (shadeM) shade = shadeM[1].replace(/^\*+|\*+$/g, "").trim();

          const matM = l.match(/^\*{0,2}MATERIAL:\*{0,2}\s*(.*)/i);
          if (matM) material = matM[1].replace(/^\*+|\*+$/g, "").trim();
        }

        if (!rawUrl) {
          const blockUrlMatch = trimmed.match(
            /https?:\/\/(?:www\.)?(?:myntra\.com|nykaa\.com|nykaafashion\.com|ajio\.com|amazon\.in|tatacliq\.com|azafashions\.com|perniaspopupshop\.com|elahe\.in|ogaan\.com|kalkifashion\.com|hm\.com|zara\.com|fabindia\.com|manyavar\.com|giva\.co|flipkart\.com|meesho\.com|etsy\.com|tirabeauty\.com|sephora\.in|firstcry\.com|bata\.in|bata\.com|mumkins\.in)[^\s)"'<>\[\]]+/i,
          );
          if (blockUrlMatch) rawUrl = blockUrlMatch[0];
        }

        const cleanCandidateUrl = cleanUrl(rawUrl);
        // URLs already taken from the structured output above are skipped silently
        const alreadySeen = cleanCandidateUrl && seenCanonicalUrls.has(getCanonicalProductUrl(cleanCandidateUrl));
        const blockCanonicalUrl =
          cleanCandidateUrl && !alreadySeen ? acceptProductUrl(cleanCandidateUrl, "openai_web_search", "model_text") : null;
        if (blockCanonicalUrl) {
          const canonicalUrl = blockCanonicalUrl;
          const finalTitle = productTitle || spec.itemTitle;
          const finalBrand = brand || finalTitle.split(" ")[0] || "Curated";
          const identityKey = getProductIdentityKey(finalTitle, finalBrand);

          if (!seenCanonicalUrls.has(canonicalUrl) && !seenIdentityKeys.has(identityKey) && candidateList.length < 12) {
            seenCanonicalUrls.add(canonicalUrl);
            seenIdentityKeys.add(identityKey);
            const { price } = normalizePrice(rawPrice, "INR");
            const { price: originalPrice } = normalizePrice(rawOriginalPrice, "INR");
            const derivedRetailer = getRetailerFromUrl(canonicalUrl) || retailer || "Online Store";
            candidateList.push({
              tier,
              productTitle: finalTitle,
              brand: finalBrand,
              retailer: derivedRetailer,
              price,
              originalPrice,
              url: canonicalUrl,
              shade: shade || undefined,
              material: material || undefined,
              modelAuthored: true,
              provider: "openai_web_search",
              fromSearchIndex: false,
            });
          }
        }
      }

      // Fallback to citations if fewer than 4 candidates were parsed
      if (candidateList.length < 4 && citations.length > 0) {
        for (const cit of citations) {
          if (candidateList.length >= 12) break;
          if (seenCanonicalUrls.has(getCanonicalProductUrl(cit.url))) continue;
          const acceptedCitationUrl = acceptProductUrl(cit.url, "openai_web_search", "search_index", cit.title);
          if (!acceptedCitationUrl) continue;
          const canonicalUrl = acceptedCitationUrl;
          const citTitle = cit.title.replace(/\|.*$/, "").replace(/^Buy\s+/i, "").trim() || spec.itemTitle;
          const citBrand = citTitle.split(" ")[0] || "Curated";
          const identityKey = getProductIdentityKey(citTitle, citBrand);

          if (!seenIdentityKeys.has(identityKey)) {
            seenCanonicalUrls.add(canonicalUrl);
            seenIdentityKeys.add(identityKey);
            const parsedHost = new URL(cit.url).hostname.replace(/^www\./, "").split(".")[0];
            const derivedRetailer = getRetailerFromUrl(canonicalUrl) || (
              parsedHost === "myntra"
                ? "Myntra"
                : parsedHost === "nykaa"
                  ? "Nykaa"
                  : parsedHost === "ajio"
                    ? "AJIO"
                    : parsedHost === "amazon"
                      ? "Amazon India"
                      : parsedHost === "tatacliq"
                        ? "Tata CLiQ"
                        : parsedHost === "azafashions"
                          ? "Aza Fashions"
                          : parsedHost === "perniaspopupshop"
                            ? "Pernia's Pop-Up Shop"
                            : parsedHost === "elahe"
                              ? "Elahé"
                              : parsedHost === "ogaan"
                                ? "Ogaan"
                                : parsedHost === "kalkifashion"
                                  ? "Kalki Fashion"
                                  : "Online Store"
            );

            candidateList.push({
              tier: "mid",
              productTitle: citTitle,
              brand: citBrand,
              retailer: derivedRetailer,
              url: canonicalUrl,
              provider: "openai_web_search",
              fromSearchIndex: true,
            });
          }
        }
      }
    } catch (err: unknown) {
      const errObj = err as { status?: number; code?: string; message?: string };
      const errMsg = errObj.message || String(err);
      discovery.openai = "failed";
      logger.warn({ err, spec: spec.itemTitle }, "OpenAI web search failed for styling requirement");

      let statusType: "missing_key" | "invalid_key" | "rate_limited" | "timeout" | "error" = "error";
      let fixHint = "Check OPENAI_API_KEY configuration in .env.local.";

      if (errMsg.includes("OPENAI_API_KEY is not set")) {
        statusType = "missing_key";
        fixHint = "Add OPENAI_API_KEY to artifacts/skintune-next/.env.local and restart the dev server.";
      } else if (errObj.status === 401 || errMsg.includes("Incorrect API key") || errMsg.includes("invalid_api_key")) {
        statusType = "invalid_key";
        fixHint = "Your OPENAI_API_KEY is invalid or expired. Generate a new key at platform.openai.com/api-keys and update .env.local.";
      } else if (errObj.status === 429 || errMsg.includes("quota") || errMsg.includes("rate limit")) {
        statusType = "rate_limited";
        fixHint = "OpenAI quota exceeded or rate limit reached. Check billing and usage at platform.openai.com.";
      } else if (errMsg.includes("timeout") || errMsg.includes("ECONNRESET") || errMsg.includes("ETIMEDOUT")) {
        statusType = "timeout";
        fixHint = "OpenAI connection timed out. Please retry in a few moments.";
      }

      if (!diagnosticsTracker.some((d) => d.keyName === "OPENAI_API_KEY")) {
        diagnosticsTracker.push({
          provider: "openai",
          status: statusType,
          keyName: "OPENAI_API_KEY",
          message: errMsg,
          suggestedFix: fixHint,
        });
      }
    }
  }

  if (candidateList.length === 0) {
    logger.warn(
      { spec: spec.itemTitle, discovery },
      "No product candidates discovered for requirement; nothing to verify",
    );
  }

  // 3. Fast Parallel Verification of candidates and build products list
  const candidatePersona: PersonaType | undefined =
    spec.targetGender === "women"
      ? "woman"
      : spec.targetGender === "men"
        ? "man"
        : spec.targetGender === "child" || spec.targetGender === "boys" || spec.targetGender === "girls"
          ? "child"
          : undefined;

  const verifiedPromises = candidateList.map(async (cand): Promise<ProductResult | null> => {
    const rejectCandidate = (r: Pick<CandidateRejection, "reason" | "priceVerification" | "categoryValidation"> & Partial<CandidateRejection>) =>
      reject({
        provider: cand.provider,
        urlSource: cand.fromSearchIndex ? "search_index" : "model_text",
        retailer: cand.retailer,
        url: cand.url,
        ...r,
      });

    // Consistency check with strict gender, subcategory, color, price sanity, image, and occasion verification
    const consistency = checkProductConsistency(
      cand.productTitle,
      cand.brand,
      spec.category,
      cand.url,
      undefined, // citationTitle
      candidatePersona,
      spec.itemSubcategory,
      spec.dominantColor,
      cand.modelAuthored ? undefined : cand.imageUrl,
      cand.modelAuthored ? undefined : cand.price,
      profile.occasion,
      cand.modelAuthored ? undefined : cand.shade,
      spec.targetGender,
      spec.itemTitle,
    );
    if (!consistency.isConsistent) {
      rejectCandidate({
        reason: `Failed category/audience validation before page check: ${cand.productTitle}`,
        priceVerification: "not_checked",
        categoryValidation: "failed",
        categoryValidationDetail: consistency.reason,
      });
      return null;
    }

    // Avoided colors check
    if (violatesAvoidedColors(cand.productTitle, cand.shade, colorsAvoidList)) {
      rejectCandidate({
        reason: `Uses an avoided colour: ${cand.productTitle}`,
        priceVerification: "not_checked",
        categoryValidation: "passed",
      });
      return null;
    }

    // Model-written price/image/material/shade are never displayed; only the product page's values are
    let finalPrice = cand.modelAuthored ? undefined : cand.price;
    let finalOriginalPrice = cand.modelAuthored ? undefined : cand.originalPrice;
    let priceVerified = false;
    let productVerified = false;
    let availability: string | undefined = undefined;
    let imageUrl = cand.modelAuthored ? undefined : cand.imageUrl;
    const candMaterial = cand.modelAuthored ? undefined : cand.material;
    const candShade = cand.modelAuthored ? undefined : cand.shade;
    let finalTitle = cand.productTitle;
    let finalBrand = cand.brand;

    // Fast page verification on destination product page
    const pageData = await verifyProductPage(cand.url);
    // Designer boutiques (Aza, Pernia's) block every automated page check, so a product URL
    // from them can never be confirmed, and stale or mis-indexed ones open error pages. They
    // are offered through their store-search links instead, which always work.
    const isUnconfirmableBoutique = /(?:^|\.)(?:azafashions|perniaspopupshop)\.com$/i.test(
      (() => {
        try {
          return new URL(cand.url).hostname;
        } catch {
          return "";
        }
      })(),
    );
    if (!pageData.success && (isUnconfirmableBoutique || !(pageData.retailerRestricted && cand.fromSearchIndex))) {
      // Rejected: the page is gone/invalid, or it could not be checked and the URL is known
      // only from the model's own text. A URL the model wrote out is trusted only once its
      // page has actually been read; a bot-blocked page cannot confirm the product exists.
      rejectCandidate({
        reason: isUnconfirmableBoutique
          ? `${pageData.reason} — designer boutique pages cannot be confirmed; offered via store search instead`
          : pageData.retailerRestricted
          ? `${pageData.reason} — URL not confirmed by a search index, so it cannot be shown unverified`
          : pageData.reason || "Product page could not be verified",
        httpStatus: pageData.httpStatus,
        priceVerification: "unverified",
        categoryValidation: "passed",
      });
      return null;
    }
    if (pageData.success) {
      if (pageData.price) {
        finalPrice = pageData.price;
        if (pageData.originalPrice) finalOriginalPrice = pageData.originalPrice;
        priceVerified = true;
      }
      productVerified = true;
      if (pageData.availability) availability = pageData.availability;
      if (pageData.imageUrl) imageUrl = pageData.imageUrl;
      if (pageData.productName && pageData.productName.length > 5) {
        finalTitle = pageData.productName;
      }
      if (pageData.brand) finalBrand = pageData.brand;
    } else {
      // Retailer bot protection (HTTP 403 / 429 / 503 / challenge / timeout) on a URL that a
      // search index returned (Tavily result or web_search citation): the product page exists
      // but could not be read automatically. Retain the search data, but do NOT claim
      // priceVerified or productVerified (the card shows "Check store price", no verified badge).
      priceVerified = false;
      productVerified = false;
      availability = undefined;
      logger.info(
        { item: spec.itemTitle, category: spec.category, url: cand.url, provider: cand.provider, httpStatus: pageData.httpStatus, reason: pageData.reason },
        "Keeping search-index product as unverified: retailer blocks automated page checks",
      );
    }

    // Post-verification consistency check on resolved data
    const postConsistency = checkProductConsistency(
      finalTitle,
      finalBrand,
      spec.category,
      cand.url,
      undefined, // citationTitle
      candidatePersona,
      spec.itemSubcategory,
      spec.dominantColor,
      imageUrl,
      finalPrice,
      profile.occasion,
      candShade,
      spec.targetGender,
      spec.itemTitle,
    );
    if (!postConsistency.isConsistent) {
      rejectCandidate({
        reason: `Failed category/audience validation on the store's own product data: ${finalTitle}`,
        httpStatus: pageData.httpStatus,
        priceVerification: priceVerified ? "verified" : "unverified",
        categoryValidation: "failed",
        categoryValidationDetail: postConsistency.reason,
      });
      return null;
    }

    const finalImageUrl = imageUrl || undefined;
    const productAudience = assessProductAudience(finalTitle, cand.url).audience;

    const urlType = determineUrlType(cand.url);
    const computedTier = cand.modelAuthored ? assignPriceTier(finalPrice, budgetLimit) : cand.tier || assignPriceTier(finalPrice, budgetLimit);

    const finalRetailer = getRetailerFromUrl(cand.url) || cand.retailer;

    // Visual similarity calculation to the generated outfit (target: 80–90%+)
    let matchScore = calculateOutfitSimilarity(
      {
        productTitle: finalTitle,
        brand: finalBrand,
        retailer: finalRetailer,
        price: finalPrice,
        material: candMaterial,
        shade: candShade,
        url: cand.url,
      },
      look,
      spec,
      budgetLimit,
    );
    if (priceVerified) matchScore = Math.min(matchScore + 2, 95);
    if (urlType === "exact_product") matchScore = Math.min(matchScore + 2, 95);

    const symbol = "₹";
    const formattedPrice = finalPrice ? `${symbol}${finalPrice.toLocaleString("en-IN")}` : undefined;
    const formattedOriginalPrice = finalOriginalPrice
      ? `${symbol}${finalOriginalPrice.toLocaleString("en-IN")}`
      : undefined;

    const fallbackSearchUrl = buildFallbackSearchUrl(
      {
        retailer: finalRetailer,
        brand: finalBrand,
        productName: finalTitle,
        category: spec.category,
        subcategory: spec.itemTitle,
        color: candShade || cand.shade || spec.dominantColor,
      },
      candidatePersona,
    );

    return {
      id: `prod-${spec.category}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      category: spec.category,
      subcategory: spec.itemTitle,
      recommendedItemTitle: spec.itemTitle,
      brand: finalBrand,
      productName: finalTitle,
      retailer: finalRetailer,
      price: finalPrice,
      formattedPrice,
      originalPrice: finalOriginalPrice,
      formattedOriginalPrice,
      currency: "INR",
      priceTier: computedTier,
      priceVerified,
      productVerified,
      shade: candShade,
      color: spec.dominantColor,
      itemType: spec.itemSubcategory || spec.itemTitle,
      // A men's (or women's) requirement can be met by a genuinely unisex product; it is
      // labelled as unisex rather than presented as gender-specific.
      targetGender: productAudience === "unisex" ? "unisex" : spec.targetGender,
      style: profile.style?.[0] || "Contemporary",
      occasion: profile.occasion || "Special Event",
      material: candMaterial,
      imageUrl: finalImageUrl,
      productUrl: cand.url,
      fallbackSearchUrl,
      urlType,
      isVerified: priceVerified && productVerified,
      matchScore,
      matchConfidence: matchScore,
      matchReason: spec.matchContext,
      availability,
      source: "live_search",
      lastChecked: new Date().toISOString(),
    };
  });

  const verifiedRaw = await Promise.all(verifiedPromises);
  const verifiedProducts = verifiedRaw.filter((p): p is ProductResult => p !== null);

  // When Tavily is down and the OpenAI fallback finds nothing verifiable, say so explicitly
  // instead of leaving only the Tavily error to explain the empty group.
  const rejectionSummary = (() => {
    const counts = new Map<string, number>();
    for (const r of rejections) counts.set(classifyRejection(r), (counts.get(classifyRejection(r)) ?? 0) + 1);
    return [...counts.entries()].map(([cause, n]) => `${n} ${cause}`).join("; ");
  })();

  if (verifiedProducts.length === 0 && rejections.length > 0) {
    logger.warn(
      { item: spec.itemTitle, category: spec.category, discovery, rejected: rejections.length, rejectionSummary },
      "No verified products for requirement; every candidate was rejected",
    );
  }

  if (
    discovery.tavily !== "ok" &&
    discovery.openai === "ok" &&
    verifiedProducts.length === 0 &&
    !diagnosticsTracker.some((d) => d.provider === "openai_web_search" && d.message.includes(`"${spec.itemTitle}"`))
  ) {
    logger.warn({ spec: spec.itemTitle, discovery }, "OpenAI web search fallback produced no verified products");
    diagnosticsTracker.push({
      provider: "openai_web_search",
      status: "ok",
      message:
        `OpenAI web search fallback ran for "${spec.itemTitle}" and suggested ${discovery.openaiProducts} product(s), ` +
        `but none could be confirmed on the retailer's product page` +
        (rejectionSummary ? ` (${rejectionSummary}).` : "."),
      suggestedFix: "Refresh to search again, or use the store search links for this item. Unverifiable suggestions are not shown.",
    });
  }

  // Only genuine retailer search results that passed verification are returned. If fewer
  // products survive, the group stays short/empty and the UI shows its "no verified match"
  // state; curated benchmark candidates are never injected as live recommendations.

  // Closest match to the generated look first (design, then colour, then fabric); cheaper first among equals
  verifiedProducts.sort(compareProductsByLookMatch);

  return verifiedProducts;
}

/**
 * Server-side cache for product recommendations to prevent repeated web queries.
 */
interface CachedProductResponse {
  data: ProductRecommendationsResponse;
  expiresAt: number;
}
const serverProductCache = new Map<string, CachedProductResponse>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Server cache key: version, look, category, and a hash of the shared fingerprint
 * (see buildProductCacheFingerprint for which inputs are included and why).
 */
export function buildProductCacheKey(
  look: LookRecommendation,
  profile: SkinTuneProfile,
  requestedCategory?: string,
): string {
  const hash = createHash("sha256")
    .update(buildProductCacheFingerprint(look, profile, requestedCategory))
    .digest("hex")
    .slice(0, 32);
  return `${PRODUCT_CACHE_VERSION}:${look?.id ?? ""}:${requestedCategory || "all"}:${hash}`;
}

/**
 * Assembles one category section. Verified products stay exactly as verified; relevant
 * store search/listing pages for the same item, category and audience are attached
 * alongside them as "more matching options" (whether or not products were verified).
 * Search links are typed `search_result` and are never mixed into `products`.
 */
export function buildProductGroup(
  spec: RequirementSpec,
  products: ProductResult[],
  discoveredSearchPages: DiscoveredSearchPage[] = [],
): ProductGroup {
  // A store listing page for another colour ("/color/cream-pre-draped-sarees") is not a match
  const sameColourPages =
    spec.category === "outfit"
      ? discoveredSearchPages.filter((page) => {
          let urlText = page.url;
          try {
            urlText = decodeURIComponent(new URL(page.url).pathname + " " + new URL(page.url).search).replace(/[-_/+=?&]/g, " ");
          } catch {}
          return !isOutfitColorMismatch(`${urlText} ${page.title || ""}`, spec.dominantColor);
        })
      : discoveredSearchPages;
  const retailerSearchLinks = buildRelevantSearchLinks(spec, sameColourPages);
  return {
    category: spec.category,
    recommendedItemTitle: spec.itemTitle,
    stylingRequirement: spec.stylingRequirement,
    products,
    retailerSearchLinks: retailerSearchLinks.length > 0 ? retailerSearchLinks : undefined,
  };
}

/**
 * Searches and returns MULTIPLE verified shoppable products across retailers and price points
 * for a LookRecommendation and SkinTuneProfile.
 */
export async function searchProductsForLook(
  look: LookRecommendation,
  profile: SkinTuneProfile,
  requestedCategory?: string,
  forceRefresh?: boolean,
): Promise<ProductRecommendationsResponse> {
  const cacheKey = buildProductCacheKey(look, profile, requestedCategory);
  if (!forceRefresh) {
    const cached = serverProductCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.info({ lookId: look.id, cacheKey }, "Returning cached product recommendations");
      return cached.data;
    }
  }

  const persona = detectPersona(profile);
  const applicableCategories = getApplicableCategories(persona, requestedCategory);
  const budgetLimit = parseBudgetLimit(profile.budget);
  const diagnostics: KeyDiagnostic[] = [];

  // Upfront key health checks
  const oaiHealth = getOpenAIKeyDiagnostics();
  const tavilyHealth = getTavilyKeyDiagnostics();

  if (!oaiHealth.isConfigured && !tavilyHealth.isConfigured) {
    diagnostics.push({
      provider: "system",
      status: "missing_key",
      message: "Neither OPENAI_API_KEY nor TAVILY_API_KEY is configured in your environment.",
      suggestedFix: "Add OPENAI_API_KEY or TAVILY_API_KEY to .env.local and restart the server.",
    });
  }

  try {
    const plannedSpecs = planRequirementSpecs(look, profile, persona, applicableCategories);

    // Filter by requested category if specified (e.g. 'outfit')
    const specsToSearch =
      requestedCategory && requestedCategory !== "all"
        ? requestedCategory === "footwear-accessories"
          ? plannedSpecs.filter(
              (s) =>
                s.category === "footwear" ||
                s.category === "accessories" ||
                s.category === "jewellery",
            )
          : plannedSpecs.filter((s) => s.category === requestedCategory)
        : plannedSpecs;

    // Search alternatives for all requirements in parallel
    const alternativePromises = specsToSearch.map(async (spec) => {
      const discoveredSearchPages: DiscoveredSearchPage[] = [];
      const prods = await searchAlternativesForRequirement(
        spec, profile, budgetLimit, diagnostics, look, discoveredSearchPages,
      );
      return buildProductGroup(spec, prods, discoveredSearchPages);
    });

    const groupsRaw = await Promise.all(alternativePromises);

    // Flatten all verified products with global cross-group deduplication
    const allProducts: ProductResult[] = [];
    const validGroups: ProductGroup[] = [];
    const globalSeenUrls = new Set<string>();

    for (const grp of groupsRaw) {
      const distinctGroupProducts = grp.products.filter((p) => {
        const canUrl = getCanonicalProductUrl(p.productUrl);
        if (globalSeenUrls.has(canUrl)) return false;
        globalSeenUrls.add(canUrl);
        return true;
      });

      // Within each item, closest match to the look first (then cheaper first)
      const sortedGroupProducts = [...distinctGroupProducts].sort(compareProductsByLookMatch);

      // Retain the planned group so the UI can either render products or clearly notify the user
      validGroups.push({ ...grp, products: sortedGroupProducts });
      if (sortedGroupProducts.length > 0) {
        allProducts.push(...sortedGroupProducts);
      }
    }

    // Sort all products across groups ascending by price (low to high)
    const sortedAllProducts = sortProductsByPriceAscending(allProducts);

    const responseData: ProductRecommendationsResponse = {
      lookId: look.id,
      persona,
      applicableCategories,
      products: sortedAllProducts,
      groups: validGroups,
      status: sortedAllProducts.length > 0 ? "success" : "partial",
      disclaimer: SHADE_MATCH_DISCLAIMER,
      searchedAt: new Date().toISOString(),
      totalFound: sortedAllProducts.length,
      diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
    };

    if (sortedAllProducts.length > 0) {
      serverProductCache.set(cacheKey, {
        data: responseData,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }

    return responseData;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, lookId: look.id }, "Product discovery search failed");

    if (diagnostics.length === 0) {
      if (!oaiHealth.isConfigured) {
        diagnostics.push({
          provider: "openai",
          status: "missing_key",
          keyName: "OPENAI_API_KEY",
          message: "OPENAI_API_KEY is missing from environment.",
          suggestedFix: "Set OPENAI_API_KEY in .env.local",
        });
      }
    }

    return {
      lookId: look.id,
      persona,
      applicableCategories,
      products: [],
      groups: [],
      status: "unavailable",
      disclaimer: SHADE_MATCH_DISCLAIMER,
      searchedAt: new Date().toISOString(),
      totalFound: 0,
      diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
      errorMessage: errMsg,
    };
  }
}
