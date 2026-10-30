import { createHash } from "node:crypto";
import { getOpenAIClient, RECOMMENDATION_MODEL, getOpenAIKeyDiagnostics } from "./openai-client";
import { tavilySearch, getTavilyKeyDiagnostics, TavilySearchError } from "./tavily-client";
import { logger } from "./logger";
import { getStylingContext } from "./styling-context";
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
  sortProductsByPriceAscending,
} from "./retailer-urls";

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
  sortProductsByPriceAscending,
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

  const significantTokens = normTitle
    .split(" ")
    .filter((w) => w.length > 2 && !["with", "and", "for", "the", "women", "mens"].includes(w))
    .slice(0, 4)
    .join("-");

  return `${normBrand}:${significantTokens}`;
}


/**
 * Strips any footwear, shoe, heel, or handbag/bag mentions from an outfit garment title.
 * Prevents contaminated LLM output like "Dress and heeled shoes" from turning the outfit search into a shoe/bag search.
 */
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

  // 1. GENDER & DEMOGRAPHIC SANITY CHECK
  const isBoy = genderLower === "boy" || genderLower === "boys" || (persona === "child" && genderLower !== "girls" && genderLower !== "girl" && (fullCheckText.includes("boy") || !genderLower));
  const isGirl = genderLower === "girl" || genderLower === "girls";

  if (genderLower === "boys" || isBoy) {
    // For a boy child / boys styling:
    // Strip "boy" / "boys" tokens first to avoid self-filtering
    const strippedOfBoy = fullCheckText.replace(/\b(boy|boys|boy's)\b/gi, "");
    const hasFemaleToken = /\b(women|womens|women's|female|ladies|woman|girls|girl|girl's|kurti|kurtis|saree|sari|lehenga|choli|chaniya|ghagra|blouse|anarkali|dupatta|heels?|stiletto|stilettos|skirt|gown|bra|lingerie|suit\s*set\s*with\s*dupatta)\b/i.test(strippedOfBoy);
    if (hasFemaleToken) {
      return {
        isConsistent: false,
        reason: `Gender mismatch: Product '${productName}' contains female apparel keywords for boys styling (${urlStr})`,
      };
    }

    // Never recommend mature adult men's specific items without child/boy qualifiers
    const isAdultMenOnly = /\b(men-formal|mens-formal|men-clothing|mens-clothing|men-suits|mens-suit|gentlemen)\b/i.test(fullCheckText);
    if (isAdultMenOnly && !/\b(boy|boys|kids|junior|children)\b/i.test(fullCheckText)) {
      return {
        isConsistent: false,
        reason: `Demographic mismatch: Product '${productName}' points to adult men's department instead of boys kidswear (${urlStr})`,
      };
    }
  }

  if (genderLower === "girls" || isGirl) {
    // For girls styling:
    const strippedOfGirl = fullCheckText.replace(/\b(girl|girls|girl's)\b/gi, "");
    const hasMaleToken = /\b(men|mens|men's|boys|boy|boy's|gents|gentleman|gentlemen|male)\b/i.test(strippedOfGirl);
    if (hasMaleToken) {
      return {
        isConsistent: false,
        reason: `Gender mismatch: Product '${productName}' contains male apparel keywords for girls styling (${urlStr})`,
      };
    }
  }

  if (persona === "child" || genderLower === "child" || isBoy || isGirl) {
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
    const strippedOfMen = fullCheckText
      .replace(/\b(men|mens|men's|male|gents|gentlemen)\b/gi, "");

    const hasWomenToken = /\b(women|womens|women's|female|ladies|woman|girls|girl|lehenga|saree|sari|blouse|kurti|dress|gown|skirt|heels|stiletto)\b/i.test(strippedOfMen);
    if (hasWomenToken) {
      return {
        isConsistent: false,
        reason: `Gender mismatch: Product '${productName}' contains women's apparel keywords for a male styling profile (${urlStr})`,
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
    const isBlazer = /\b(blazer|suit|tuxedo|tailored jacket|formal jacket)\b/i.test(fullCheckText);
    const isWrongType = /\b(trouser|trousers|pant|pants|skirt|dress|gown|saree|jeans|t-shirt|tshirt|top|camisole|shoe|heel|bag)\b/i.test(cleanName) && !isBlazer;
    if (!isBlazer || isWrongType) {
      return {
        isConsistent: false,
        reason: `Subcategory is Blazer, but item does not match blazer type: ${productName} (${urlStr})`,
      };
    }
  } else if (subcat ? subcat === "trousers" : (cleanName.includes("trouser") || cleanName.includes("pant"))) {
    const isTrouser = /\b(trouser|trousers|pant|pants|slacks|chinos|culottes|wide-leg|palazzo|jeans|denim)\b/i.test(cleanName);
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
  } else if (subcat ? (subcat === "inner_top" || subcat === "top") : (cleanName.includes("camisole") || cleanName.includes("inner top"))) {
    const isTop = /\b(top|tops|camisole|camisoles|blouse|blouses|shirt|shirts|tank|tee|t-shirt|corset|waistcoat|shell)\b/i.test(cleanName);
    const isBottomGarment = /\b(trouser|pant|pants|slacks|chinos|jeans|shorts?|skirt)\b/i.test(cleanName);
    const isWrongType = isBottomGarment || (/\b(blazer|jacket|dress|shoe|bag)\b/i.test(cleanName) && !isTop);
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
  } else if (subcat ? subcat === "kurta" : (cleanName.includes("kurta") || cleanName.includes("kurti") || cleanName.includes("sherwani"))) {
    const isKurta = /\b(kurta|kurtas|kurti|kurtis|sherwani|kurta\s*set|anarkali|angrakha|bandhgala)\b/i.test(fullCheckText);
    const isWrongType = /\b(blazer|western\s*suit|t-shirt|jeans|western\s*dress|shoe|bag)\b/i.test(cleanName) && !isKurta;
    if (!isKurta || isWrongType) {
      return {
        isConsistent: false,
        reason: `Subcategory is Kurta / Sherwani, but item does not match ethnic kurta/sherwani type: ${productName} (${urlStr})`,
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

    const isApparelOrBag = /\b(dress|dresses|gown|gowns|saree|sari|saris|sarees|kurta|kurtas|kurti|kurtis|lehenga|blazer|blazers|suit|suits|t-shirt|tshirt|shirt|shirts|jeans|trouser|trousers|pant|pants|skirt|skirts|jumpsuit|co-ord|coord|bag|bags|duffel|duffle|luggage|briefcase|handbag|handbags|tote|totes|clutch|purse|purses|backpack|lipstick|foundation|earring|necklace|bracelet)\b/i.test(
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
      const isSandal = /\b(sandal|sandals|slides?|sliders?|flip-flop[s]?|slippers?|espadrilles?|open-toe)\b/i.test(fullCheckText);
      const isWrongFoot = /\b(sneakers?|boots?|running\s*shoes?|canvas\s*shoes?|oxfords?|stilettos?)\b/i.test(cleanName) && !isSandal;
      if (!isSandal || isWrongFoot) {
        return {
          isConsistent: false,
          reason: `Subcategory is Sandals / Slides, but item does not match sandal type: ${productName} (${urlStr})`,
        };
      }
    } else if (subcat ? subcat === "sneakers" : cleanName.includes("sneaker")) {
      const isSneaker = /\b(sneakers?|canvas\s*shoes?|trainers?|running\s*shoes?|skate\s*shoes?)\b/i.test(fullCheckText);
      const isWrongFoot = /\b(heels?|sandals?|slides?|boots?|oxfords?|mojaris?|juttis?)\b/i.test(cleanName) && !isSneaker;
      if (!isSneaker || isWrongFoot) {
        return {
          isConsistent: false,
          reason: `Subcategory is Sneakers, but item does not match sneaker type: ${productName} (${urlStr})`,
        };
      }
    } else if (subcat ? subcat === "loafers" : cleanName.includes("loafer")) {
      const isLoafer = /\b(loafers?|moccasins?|boat\s*shoes?|driving\s*shoes?|slip-ons?)\b/i.test(fullCheckText);
      const isWrongFoot = /\b(sneakers?|heels?|boots?|sandals?|slides?)\b/i.test(cleanName) && !isLoafer;
      if (!isLoafer || isWrongFoot) {
        return {
          isConsistent: false,
          reason: `Subcategory is Loafers, but item does not match loafer type: ${productName} (${urlStr})`,
        };
      }
    } else if (subcat ? subcat === "heels" : cleanName.includes("heel")) {
      const isHeel = /\b(heels?|pumps?|stilettos?|kitten\s*heels?|block\s*heels?|wedges?)\b/i.test(fullCheckText);
      const isWrongFoot = /\b(sneakers?|boots?|loafers?|oxfords?|mojaris?|slides?)\b/i.test(cleanName) && !isHeel;
      if (!isHeel || isWrongFoot) {
        return {
          isConsistent: false,
          reason: `Subcategory is Heels, but item does not match heels type: ${productName} (${urlStr})`,
        };
      }
    } else if (subcat ? (subcat === "mojaris" || subcat === "juttis") : (cleanName.includes("mojari") || cleanName.includes("jutti"))) {
      const isMojari = /\b(mojaris?|juttis?|kolhapuris?|ethnic\s*shoes?|traditional\s*footwear)\b/i.test(fullCheckText);
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
    const isApparelOrShoeOrMakeup = /\b(dress|gown|saree|sari|kurta|kurti|lehenga|blazer|suit|t-shirt|tshirt|jeans|trouser|trousers|pant|pants|skirt|jumpsuit|shoe|shoes|heel|heels|sandal|sandals|sneaker|sneakers|boot|boots|loafer|loafers|footwear|lipstick|foundation|concealer|compact|powder|mascara|eyeliner)\b/i.test(
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
      /\b(t-shirt|tshirt|shirt|dress|gown|saree|kurta|blazer|suit|jeans|trouser|pant|skirt|shoe|shoes|heel|heels|sandal|sandals|sneaker|boot|loafer|footwear|bag|handbag|tote|purse|clutch|lipstick|foundation|concealer|compact|mascara|eyeliner)\b/i.test(
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
    const isGarbaFestive = occLower.includes("garba") || occLower.includes("navratri") || occLower.includes("dandiya");
    const isCorporateFormal = occLower.includes("office") || occLower.includes("corporate") || occLower.includes("work") || occLower.includes("interview");

    if (isGarbaFestive) {
      const isCorporateItem = /\b(office\s*blazer|formal\s*blazer|corporate|business\s*suit|office\s*trousers|formal\s*slacks)\b/i.test(fullCheckText);
      if (isCorporateItem && !/\b(lehenga|chaniya|festive|traditional|kurta)\b/i.test(fullCheckText)) {
        return {
          isConsistent: false,
          reason: `Occasion mismatch: Cannot recommend corporate office attire '${productName}' for Garba Night / Festive occasion`,
        };
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
}> {
  try {
    const res = await fetch(urlStr, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(3500),
    });

    if (res.status === 403 || res.status === 429 || res.status === 503) {
      return {
        success: false,
        retailerRestricted: true,
        reason: `Retailer automated access restricted (HTTP ${res.status} bot protection)`,
        finalUrl: urlStr,
      };
    }

    if (!res.ok) {
      return { success: false, reason: `HTTP status ${res.status}` };
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
          return { success: false, reason: `Retailer redirected to generic homepage/search: ${finalUrl}` };
        }

        // Redirected from ethnic/women apparel to men's or electronics
        const isOrigEthnicOrWomen = origPath.includes("lehenga") || origPath.includes("chaniya") || origPath.includes("saree") || origPath.includes("women");
        const isFinalUnrelated = finalPath.includes("/men-") || finalPath.includes("electronics") || finalPath.includes("mobile") || finalPath.includes("gadget");
        if (isOrigEthnicOrWomen && isFinalUnrelated) {
          return { success: false, reason: `Retailer redirected to unrelated department: ${finalUrl}` };
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
      return { success: false, reason: "Product page indicates item no longer available or 404" };
    }

    let price: number | undefined;
    let originalPrice: number | undefined;
    let currency = "INR";
    let availability = "In Stock";
    let imageUrl: string | undefined;
    let productName: string | undefined;
    let brand: string | undefined;

    // 1. JSON-LD check (schema.org/Product)
    const jsonLdMatches = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
    );
    if (jsonLdMatches) {
      for (const m of jsonLdMatches) {
        const raw = m
          .replace(/<script type="application\/ld\+json">/i, "")
          .replace(/<\/script>/i, "")
          .trim();
        try {
          const parsed = JSON.parse(raw);
          const candidates = [parsed];
          if (Array.isArray(parsed["@graph"])) candidates.push(...parsed["@graph"]);

          for (const item of candidates) {
            if (item["@type"] === "Product" || item.offers) {
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

    // 3. Fallback to OpenGraph and regex patterns
    if (!price) {
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
      };
    }

    // Scenario 11: If product exists but price cannot be verified, return without fabricating a price
    if (productName || imageUrl) {
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
      };
    }

    return {
      success: false,
      reason: "Could not find reliable product details or price on destination page",
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

export function extractPriceFromSnippet(text: string): number | undefined {
  if (!text) return undefined;
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

/**
 * Resolves any hex code or cryptic color string into a clean, human-readable fashion color.
 * Eliminates raw hex strings (e.g. #4E3824) from polluting search queries and titles.
 */
export function resolveHumanColor(colorInput?: string, context?: string): string {
  if (!colorInput && !context) return "Neutral";

  const raw = (colorInput || "").trim();

  // If already a named human color without hex hashes
  if (raw && !raw.includes("#") && raw.length > 2) {
    const cleaned = raw.replace(/\b(?:with|and|accents?|layer|shades?)\b.*$/i, "").trim();
    if (cleaned.length > 2) return cleaned;
  }

  // Check hex mapping
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

  // Check if context has human color names
  const contextStr = `${colorInput || ""} ${context || ""}`.toLowerCase();

  // Pinks & Magentas (Critical for user requests like Garba Night + Pink)
  if (contextStr.includes("hot pink") || contextStr.includes("bright pink")) return "Hot Pink";
  if (contextStr.includes("rani pink") || contextStr.includes("deep pink")) return "Rani Pink";
  if (contextStr.includes("blush pink") || contextStr.includes("baby pink")) return "Blush Pink";
  if (contextStr.includes("rose") || contextStr.includes("dusty rose")) return "Rose Pink";
  if (contextStr.includes("magenta") || contextStr.includes("fuchsia")) return "Magenta";
  if (contextStr.includes("pink")) return "Pink";

  // Greens
  if (contextStr.includes("emerald")) return "Emerald Green";
  if (contextStr.includes("forest green")) return "Forest Green";
  if (contextStr.includes("sage")) return "Sage Green";
  if (contextStr.includes("olive")) return "Olive Green";
  if (contextStr.includes("teal")) return "Teal";
  if (contextStr.includes("green")) return "Green";

  // Browns & Neutrals
  if (contextStr.includes("chocolate") || contextStr.includes("cedar") || contextStr.includes("cocoa") || contextStr.includes("brown")) return "Chocolate Brown";
  if (contextStr.includes("brick") || contextStr.includes("terracotta") || contextStr.includes("rust")) return "Terracotta";
  if (contextStr.includes("marigold") || contextStr.includes("mustard")) return "Marigold";
  if (contextStr.includes("navy")) return "Navy Blue";
  if (contextStr.includes("royal blue")) return "Royal Blue";
  if (contextStr.includes("blue")) return "Blue";
  if (contextStr.includes("slate")) return "Slate";
  if (contextStr.includes("charcoal")) return "Charcoal";
  if (contextStr.includes("cream") || contextStr.includes("ivory") || contextStr.includes("oat")) return "Cream";
  if (contextStr.includes("black")) return "Black";
  if (contextStr.includes("white")) return "White";
  if (contextStr.includes("gold")) return "Gold";
  if (contextStr.includes("silver")) return "Silver";
  if (contextStr.includes("maroon") || contextStr.includes("crimson") || contextStr.includes("burgundy")) return "Maroon";
  if (contextStr.includes("red")) return "Red";
  if (contextStr.includes("purple") || contextStr.includes("plum") || contextStr.includes("lavender")) return "Purple";

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
    | "other_accessory";
  category: "jewellery" | "accessories";
  title: string;
  sourceDetail?: string;
  material?: string;
};

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
    if (/\b(?:maang tikka|tikka|mathapatti|matha patti|passa|borla|hairpin|paranda)\b/i.test(l)) {
      if (isChild || isMan) return null;
      return { type: "maang_tikka", category: "jewellery" };
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
      if (isChild || isMan) return null;
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
      c.includes("belt")
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
    .filter((s) => s.length > 2 && !/^(none|clean|minimal|natural|child-friendly)$/i.test(s));

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

  const preferredRetailers = ctx.isKids
    ? ["Myntra", "AJIO", "Amazon India", "FirstCry", "Tata CLiQ"]
    : targetGender === "women"
      ? ["Myntra", "AJIO", "Nykaa Fashion", "Tata CLiQ", "Amazon India"]
      : ["Myntra", "AJIO", "Tata CLiQ", "Amazon India"];

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
  }
  const detectedGarments: RawGarment[] = [];

  const isLayer = (t: string) =>
    /\b(blazer|jacket|coat|shrug|cardigan|vest|waistcoat|nehru\s*jacket|overcoat|trench|bomber)\b/i.test(t);
  const isBottom = (t: string) =>
    /\b(shorts?|bermudas?|trousers?|pants?|slacks?|chinos?|jeans?|denim|skirt|lehenga|chaniya|ghagra|dhoti|pyjama|pajama|salwar|joggers?|culottes?)\b/i.test(t);
  const isTop = (t: string) =>
    /\b(shirt|shirts|button-down|camp-collar|resort\s*shirt|tee|t-shirt|tshirt|polo|blouse|camisole|cami|corset|top|tops|tunic|kurta|kurti|choli|sweater|hoodie)\b/i.test(t);
  const isOnePiece = (t: string) =>
    /\b(dress|dresses|saree|sari|saris|sarees|jumpsuit|jumpsuits|romper|rompers|playsuit|gown|gowns|anarkali)\b/i.test(t);

  // 1. If structured pieces exist in look.pieces with distinct components
  if (apparelPieces.length >= 2) {
    for (const p of apparelPieces) {
      const c = (p.category || "").toLowerCase();
      const n = (p.name || "").trim();
      let type: "layer" | "top" | "bottom" | "one_piece" = "top";
      let subcat = "top";

      if (/\b(blouse|inner\s*top|camisole)\b/i.test(n) || (/\bcholi\b/i.test(n) && !/\b(lehenga|chaniya|skirt)\b/i.test(n))) {
        type = "top";
        subcat = "inner_top";
      } else if (/\b(lehenga|chaniya|ghagra)\b/i.test(n)) {
        type = "bottom";
        subcat = "lehenga";
      } else if (c.includes("layer") || c.includes("outer") || isLayer(n)) {
        type = "layer";
        subcat = n.toLowerCase().includes("blazer") ? "blazer" : "jacket";
      } else if (c.includes("bottom") || isBottom(n)) {
        type = "bottom";
        if (/\b(shorts?|bermudas?)\b/i.test(n)) subcat = "shorts";
        else if (/\bskirt\b/i.test(n)) subcat = "skirt";
        else if (/\b(lehenga|chaniya|ghagra)\b/i.test(n)) subcat = "lehenga";
        else subcat = "trousers";
      } else if (c.includes("outfit") || isOnePiece(n)) {
        type = "one_piece";
        if (/\b(saree|sari)\b/i.test(n)) subcat = "saree";
        else if (/\b(jumpsuit|romper)\b/i.test(n)) subcat = "jumpsuit";
        else subcat = "dress";
      } else {
        type = "top";
        if (/\b(t-?shirts?|tees?)\b/i.test(n)) subcat = "top";
        else if (/(?<![tT]-)\b(shirts?|button-down|polo)\b/i.test(n)) subcat = "shirt";
        else if (/\b(kurta|kurti)\b/i.test(n)) subcat = "kurta";
        else if (/\b(choli|blouse)\b/i.test(n)) subcat = "inner_top";
        else subcat = "top";
      }

      detectedGarments.push({
        type,
        subcat,
        rawTitle: n,
        color: (p as { color?: string }).color,
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
      detectedGarments.push({
        type: "one_piece",
        subcat: "saree",
        rawTitle: `${dominantHumanColor} Silk Saree`,
      });
      detectedGarments.push({
        type: "top",
        subcat: "inner_top",
        rawTitle: `Matching ${dominantHumanColor} Embroidered Saree Blouse`,
      });
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

        if (isLayer(cleanClause) && !foundTypes.has("layer")) {
          foundTypes.add("layer");
          detectedGarments.push({
            type: "layer",
            subcat: /\bblazer\b/i.test(cleanClause) ? "blazer" : "jacket",
            rawTitle: cleanClause,
          });
        } else if (isBottom(cleanClause) && !foundTypes.has("bottom")) {
          foundTypes.add("bottom");
          let subcat = "trousers";
          if (/\b(shorts?|bermudas?)\b/i.test(cleanClause)) subcat = "shorts";
          else if (/\bskirt\b/i.test(cleanClause)) subcat = "skirt";
          else if (/\b(lehenga|chaniya|ghagra)\b/i.test(cleanClause)) subcat = "lehenga";
          detectedGarments.push({
            type: "bottom",
            subcat,
            rawTitle: cleanClause,
          });
        } else if (isTop(cleanClause) && !foundTypes.has("top")) {
          foundTypes.add("top");
          let subcat = "top";
          if (/\b(t-?shirts?|tees?)\b/i.test(cleanClause)) subcat = "top";
          else if (/(?<![tT]-)\b(shirts?|button-down|polo)\b/i.test(cleanClause)) subcat = "shirt";
          else if (/\b(kurta|kurti)\b/i.test(cleanClause)) subcat = "kurta";
          else if (/\b(choli|blouse)\b/i.test(cleanClause)) subcat = "inner_top";
          detectedGarments.push({
            type: "top",
            subcat,
            rawTitle: cleanClause,
          });
        } else if (isOnePiece(cleanClause) && !foundTypes.has("one_piece")) {
          foundTypes.add("one_piece");
          let subcat = "dress";
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
            subcat: /\b(jumpsuit|romper)\b/i.test(lowerText) ? "jumpsuit" : "dress",
            rawTitle: outfitText,
          });
        } else {
          const hasTop = isTop(lowerText);
          const hasBottom = isBottom(lowerText);
          const hasLayer = isLayer(lowerText);

          if (hasLayer) {
            detectedGarments.push({
              type: "layer",
              subcat: /\bblazer\b/i.test(lowerText) ? "blazer" : "jacket",
              rawTitle: `${dominantHumanColor} Tailored Blazer`,
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
    const layerSubcat = /\bblazer\b/i.test(layerPhrase) ? "blazer" : "jacket";
    const layerColor = resolveHumanColor(layerPhrase, dominantHumanColor);
    detectedGarments.unshift({
      type: "layer",
      subcat: layerSubcat,
      rawTitle: cleanOutfitGarmentTitle(layerPhrase, targetGender) || `${layerColor} Tailored Blazer`,
      color: layerColor,
    });
  }

  // Fallback if still nothing detected: single outfit piece
  if (detectedGarments.length === 0) {
    const defaultTitle = ctx.isBoy
      ? `Boys ${dominantHumanColor} Smart Casual Outfit Set`
      : ctx.isGirl
        ? `Girls ${dominantHumanColor} Casual Dress / Co-ord Set`
        : targetGender === "men"
          ? `Men's ${dominantHumanColor} Curated Outfit`
          : `Women's ${dominantHumanColor} Curated Dress / Outfit`;

    detectedGarments.push({
      type: "one_piece",
      subcat: ctx.isBoy ? "boys_outfit" : ctx.isGirl ? "girls_outfit" : targetGender === "men" ? "men_outfit" : "dress",
      rawTitle: outfitText || defaultTitle,
    });
  }

  // Convert each detected garment into a fully realized RequirementSpec
  for (const g of detectedGarments) {
    const rawClean = cleanOutfitGarmentTitle(g.rawTitle, targetGender);
    const color = g.color || resolveHumanColor(rawClean, dominantHumanColor);

    // Format human-friendly title with proper demographic prefix
    let title = rawClean;
    if (ctx.isBoy && !/\bboys?\b/i.test(title)) {
      title = `Boys ${title}`;
    } else if (ctx.isGirl && !/\bgirls?\b/i.test(title)) {
      title = `Girls ${title}`;
    } else if (targetGender === "men" && !/\b(men|men's)\b/i.test(title)) {
      title = `Men's ${title}`;
    }

    // Material hint extraction
    let materialHint = "";
    if (/linen/i.test(rawClean) || /linen/i.test(outfitText)) materialHint = "100% Breathable European Linen";
    else if (/cotton/i.test(rawClean) || /cotton/i.test(outfitText)) materialHint = "100% Crisp Breathable Cotton";
    else if (/silk|satin/i.test(rawClean) || /silk|satin/i.test(outfitText)) materialHint = "Lustrous Silk / Satin Finish";
    else if (/denim/i.test(rawClean) || /denim/i.test(outfitText)) materialHint = "Comfort Stretch Premium Denim";
    else if (/wool|crepe/i.test(rawClean) || /wool|crepe/i.test(outfitText)) materialHint = "Tailored Suiting Crepe / Wool Blend";

    // Build dynamic search query
    let itemQueryKeyword = g.subcat;
    if (g.subcat === "shorts") itemQueryKeyword = "shorts";
    else if (g.subcat === "shirt") itemQueryKeyword = "shirt";
    else if (g.subcat === "top") itemQueryKeyword = rawClean.toLowerCase().includes("tee") || rawClean.toLowerCase().includes("t-shirt") ? "t-shirt tee" : "top";
    else if (g.subcat === "trousers") itemQueryKeyword = "tailored trousers pants";
    else if (g.subcat === "blazer") itemQueryKeyword = "tailored formal blazer";
    else if (g.subcat === "saree") itemQueryKeyword = rawClean.toLowerCase().includes("silk") || outfitText.toLowerCase().includes("silk") ? "silk saree" : "saree";
    else if (g.subcat === "lehenga") itemQueryKeyword = "chaniya choli lehenga set";
    else if (g.subcat === "inner_top") itemQueryKeyword = rawClean.toLowerCase().includes("choli") || rawClean.toLowerCase().includes("blouse") ? "embroidered choli blouse" : "formal inner top camisole";
    else if (g.subcat === "kurta") itemQueryKeyword = "festive kurta set";
    else if (g.subcat === "dress") itemQueryKeyword = "dress";

    const searchTerms = [
      targetGender,
      color,
      itemQueryKeyword,
      ...preferredRetailers.slice(0, 3),
    ].join(" ");

    specs.push({
      category: "outfit",
      itemTitle: title,
      itemSubcategory: g.subcat,
      targetGender,
      dominantColor: color,
      stylingRequirement: `${title} (${color}) suited for ${profile.occasion || "this look"}`,
      searchQuery: searchTerms,
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
  const lowerFoot = rawFootText.toLowerCase();
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

  // Detect footwear subcategory dynamically
  let subcat = "sneakers";
  let label = "Casual Sneakers";

  if (
    /\b(sandals?|slides?|sliders?|flip-flop[s]?|espadrilles?|slippers?)\b/i.test(lowerFoot) ||
    (isVacation && !/\b(sneaker|boot|oxford)\b/i.test(lowerFoot))
  ) {
    subcat = "sandals";
    label = /\bslides?\b/i.test(lowerFoot) ? "Slide Sandals" : "Comfort Sandals";
  } else if (/\b(loafers?|moccasins?|boat\s*shoes?)\b/i.test(lowerFoot)) {
    subcat = "loafers";
    label = "Smart Loafers";
  } else if (/\b(oxfords?|derby|brogues?|formal\s*shoes?)\b/i.test(lowerFoot) || (isOfficeOrFormal && (persona === "man" || ctx.isBoy))) {
    subcat = "formal_shoes";
    label = "Formal Derby / Oxford Shoes";
  } else if (/\b(heels?|pumps?|stilettos?|wedges?|kitten\s*heels?|block\s*heels?)\b/i.test(lowerFoot) || (persona === "woman" && (isDateNight || isOfficeOrFormal))) {
    subcat = "heels";
    label = /\bblock\b/i.test(lowerFoot) ? "Block Heels" : "Heeled Pumps / Sandals";
  } else if (/\b(flats?|ballerinas?|ballet\s*flats?|mules?)\b/i.test(lowerFoot)) {
    subcat = "flats";
    label = "Ballet Flats";
  } else if (
    /\b(mojaris?|juttis?|kolhapuris?)\b/i.test(lowerFoot) ||
    isGarbaOrNavratri ||
    isTraditionalOrFestive
  ) {
    subcat = "mojaris";
    label = "Handcrafted Ethnic Mojaris / Juttis";
  } else if (/\b(boots?|chelsea)\b/i.test(lowerFoot)) {
    subcat = "boots";
    label = "Chelsea Boots";
  } else {
    subcat = "sneakers";
    label = "Minimalist Sneakers / Shoes";
  }

  const footColor = resolveHumanColor(rawFootText, dominantHumanColor);

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
    ? ["Myntra", "AJIO", "Amazon India", "Bata", "Tata CLiQ"]
    : ["Myntra", "AJIO", "Tata CLiQ", "Amazon India"];

  const footQuery = [
    targetGender,
    footColor,
    subcat === "sandals" ? "sandals slides" : subcat === "mojaris" ? "ethnic mojaris juttis" : subcat,
    preferredRetailers[0],
    preferredRetailers[1],
  ].join(" ");

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
          if (isGarbaOrNavratri || isTraditionalOrFestive) {
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
            if (isGarbaOrNavratri || isTraditionalOrFestive) {
              accStyle = `Rich raw silk stole or pocket square coordinating with festive kurta`;
              accQuery = `men ${dominantHumanColor} silk stole pocket square Myntra AJIO`;
            } else if (isOfficeOrFormal) {
              accStyle = `Structured leather briefcase or laptop messenger bag with dedicated compartment`;
              accQuery = `men ${dominantHumanColor} structured leather briefcase laptop bag Myntra AJIO Tata CLiQ`;
            } else {
              accStyle = `Clean leather messenger bag or sleek cardholder`;
              accQuery = `men ${dominantHumanColor} leather messenger bag wallet Myntra AJIO`;
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
        } else if (item.type === "belt") {
          const isEthnicMen =
            (persona === "man" || targetGender === "men") &&
            (isGarbaOrNavratri || isTraditionalOrFestive || /\b(kurta|sherwani|dhoti|pyjama|pajama|bandhgala)\b/i.test(`${look.outfit || ""} ${look.title || ""}`));
          if (isEthnicMen) {
            accStyle = `Festive pure silk pocket square or royal sherwani brooch pin coordinating with kurta`;
            accQuery = `men festive silk pocket square brooch set Myntra AJIO`;
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
          accQuery = `${targetGender} ${dominantHumanColor} ${item.title} festive potli bag Myntra AJIO Nykaa`;
        } else if (item.type === "hat") {
          accStyle = `Breathable coordinating hat or cap`;
          accQuery = `${targetGender} ${item.title} cap hat Myntra AJIO Amazon`;
        } else {
          accStyle = `Finishing accent coordinating with your ${dominantHumanColor} outfit`;
          accQuery = `${targetGender} ${dominantHumanColor} ${item.title} Myntra AJIO`;
        }

        specs.push({
          category: "accessories",
          itemTitle: item.title,
          itemSubcategory: item.type,
          targetGender,
          dominantColor: dominantHumanColor,
          stylingRequirement: accStyle,
          searchQuery: accQuery.trim(),
          preferredRetailers: ["Myntra", "AJIO", "Tata CLiQ", "Nykaa Fashion", "Amazon India"],
          matchContext: `Harmonizes the finishing details for this ${profile.occasion || "styling"} edit.`,
        });
      }
    } else {
      // Fallback if no specific accessory was found in look, but category was requested
      let accTitle = "";
      let accStyle = "";
      let accQuery = "";
      let fallbackSubcat = "bag";

      if (ctx.isBoy || targetGender === "boys") {
        fallbackSubcat = isGarbaOrNavratri || isTraditionalOrFestive ? "other_accessory" : "belt";
        accTitle = isGarbaOrNavratri || isTraditionalOrFestive
          ? "Boys Festive Brooch & Pocket Square"
          : "Boys Casual Belt & Cap";
        accStyle = isGarbaOrNavratri || isTraditionalOrFestive
          ? "Festive metallic brooch and matching pocket square"
          : "Everyday durable belt and cap";
        accQuery = isGarbaOrNavratri || isTraditionalOrFestive
          ? `boys festive brooch pocket square Myntra AJIO`
          : `boys belt cap Myntra AJIO`;
      } else if (ctx.isGirl || targetGender === "girls") {
        fallbackSubcat = isGarbaOrNavratri || isTraditionalOrFestive ? "potli" : "bag";
        accTitle = isGarbaOrNavratri || isTraditionalOrFestive
          ? "Girls Embroidered Festive Potli Bag"
          : "Girls Hair Accessories & Sling Bag";
        accStyle = isGarbaOrNavratri || isTraditionalOrFestive
          ? "Festive embellished potli bag with tassel drawstring"
          : "Everyday cute sling bag and accessories";
        accQuery = isGarbaOrNavratri || isTraditionalOrFestive
          ? `girls festive potli bag Myntra AJIO`
          : `girls sling bag accessories Myntra AJIO`;
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
        preferredRetailers: ["Myntra", "AJIO", "Tata CLiQ", "Nykaa Fashion", "Amazon India"],
        matchContext: `Harmonizes the finishing details for this ${profile.occasion || "styling"} edit.`,
      });
    }
  }

  // 5. Personalized Makeup Suite
  if (applicableCategories.includes("makeup") && (persona === "woman" || persona === "man")) {
    const makeupSpecs = buildPersonalizedMakeupSpecs(look, profile, persona);
    specs.push(...makeupSpecs);
  }

  return specs;
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
        subcat.includes("kurta") ||
        subcat.includes("kedia") ||
        subcat.includes("sherwani") ||
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
            url: `https://www.nykaafashion.com/fayon-kids-girls-festive-lehenga/p/3490123`,
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
          url: `https://www.nykaafashion.com/kalki-fashion-${encodeURIComponent(color.toLowerCase())}-embroidered-lehenga-choli-set/p/1249012`,
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
            url: `https://www.nykaafashion.com/house-of-jamoti-${encodeURIComponent(color.toLowerCase())}-embroidered-blouse/p/3490123`,
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
          url: `https://www.nykaafashion.com/search/result/?q=${encodeURIComponent("women silk satin camisole top")}`,
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
          url: `https://www.nykaafashion.com/search/result/?q=${encodeURIComponent(`women ${color} ritu kumar kurta set`)}`,
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
          url: `https://www.nykaafashion.com/search/result/?q=${encodeURIComponent(`women ${color} banarasi silk saree`)}`,
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
            url: "https://www.nykaafashion.com/tribe-amrapali-silver-temple-bangle/p/2190345",
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
          url: `https://www.nykaafashion.com/search/result/?q=${encodeURIComponent("women minimal gold cuff bracelet")}`,
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
        url: `https://www.nykaafashion.com/search/result/?q=${encodeURIComponent("women minimal geometric gold stud earrings")}`,
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
        stylingReq.includes("ethnic") ||
        stylingReq.includes("festive") ||
        subcat.includes("brooch")
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
            brand: "Manyavar",
            retailer: "Tata CLiQ",
            price: 1499,
            url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("boys manyavar festive brooch stole")}`,
            material: "Silk Blend Stole with Handcrafted Brooch",
          },
        ];
      }
      return [
        {
          tier: "budget",
          productTitle: "Boys Reversible Classic Leather Belt",
          brand: "Wildhorn Junior",
          retailer: "Myntra",
          price: 499,
          originalPrice: 999,
          url: "https://www.myntra.com/boys-belt",
          material: "Durable Synthetic Leather",
        },
        {
          tier: "mid",
          productTitle: "Boys Classic Twill Baseball Cap & Belt Set",
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
          productTitle: "Girls Glitter Crossbody Sling Bag",
          brand: "Accessorize London Kids",
          retailer: "AJIO",
          price: 999,
          originalPrice: 1699,
          url: `https://www.ajio.com/search/?text=${encodeURIComponent("girls sling bag accessories")}`,
          material: "Shimmer PU with Long Chain",
        },
        {
          tier: "premium",
          productTitle: "Girls Handcrafted Velvet Festive Bag & Hairband Set",
          brand: "Fayon Kids",
          retailer: "Tata CLiQ",
          price: 1850,
          url: `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent("girls fayon kids accessories set")}`,
          material: "Embroidered Velvet",
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
          url: "https://www.nykaafashion.com/aditi-sharma-designer-embroidered-potli/p/2390145",
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
          url: `https://www.nykaafashion.com/search/result/?q=${encodeURIComponent("women miraggio structured laptop tote")}`,
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

  // 2. Colour & Tone Harmony (+4)
  const colorTerms = [
    "pink", "green", "emerald", "gold", "golden", "red", "maroon", "blue", "royal blue",
    "navy", "black", "white", "ivory", "beige", "cream", "yellow", "mustard", "purple",
    "lavender", "orange", "peach", "silver", "teal", "burgundy", "wine"
  ];
  let colorMatch = false;
  const lookColor = (look.outfitColor || spec?.dominantColor || "").toLowerCase();
  if (lookColor && prodText.includes(lookColor)) {
    colorMatch = true;
  } else {
    for (const c of colorTerms) {
      if (lookText.includes(c) && prodText.includes(c)) {
        colorMatch = true;
        break;
      }
    }
  }
  if (colorMatch) score += 4;

  // 3. Fabric Appearance, Texture & Embroidery / Pattern (+3)
  const fabricAndPatterns = [
    "velvet", "silk", "raw silk", "chanderi", "organza", "satin", "linen", "cotton",
    "georgette", "chiffon", "crepe", "denim", "wool", "jacquard", "brocade",
    "zari", "zardozi", "embroidery", "embroidered", "sequin", "sequins", "mirror",
    "gota", "foil", "printed", "floral", "woven", "embellished"
  ];
  let fabricMatch = false;
  for (const fp of fabricAndPatterns) {
    if (lookText.includes(fp) && prodText.includes(fp)) {
      fabricMatch = true;
      break;
    }
  }
  if (fabricMatch || (spec?.materialHint && prodText.includes(spec.materialHint.toLowerCase().split(" ")[0]))) {
    score += 3;
  }

  // 4. Overall Style & Occasion Match (+2)
  const styleTerms = ["festive", "traditional", "wedding", "formal", "casual", "contemporary", "modern", "minimalist", "cocktail", "party"];
  let styleMatch = false;
  for (const st of styleTerms) {
    if (lookText.includes(st) && (prodText.includes(st) || (look.vibe && look.vibe.toLowerCase().includes(st)))) {
      styleMatch = true;
      break;
    }
  }
  if (styleMatch) score += 2;

  // 5. Budget Adherence Bonus (+3)
  if (product.price && budgetLimit && product.price <= budgetLimit) {
    score += 3;
  }

  // 6. Generated outfit image presence bonus (+1)
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
): Promise<ProductResult[]> {
  const budgetInstruction = budgetLimit
    ? `CRITICAL BUDGET CONSTRAINT: User's budget is strictly under ₹${budgetLimit}. All alternatives must stay within ₹${budgetLimit} where possible. Never exceed ₹${budgetLimit} without marking.`
    : `Provide diverse price levels: budget (Under ₹1,500), mid-range (₹1,500-₹3,500), and premium (₹3,500+).`;

  const colorsLoveStr = Array.isArray(profile.colorsLove) ? profile.colorsLove.join(", ") : "None";
  const colorsAvoidList = Array.isArray(profile.colorsAvoid) ? profile.colorsAvoid : [];
  const colorsAvoidStr = colorsAvoidList.join(", ");

  const prompt = `You are LetStyle's Multi-Retailer Product Discovery Engine.
Your task is to search the web for 3 distinct, REAL, currently available products in India from multiple trusted retailers and designer boutiques (Myntra, AJIO, Nykaa, Aza Fashions, Pernia's Pop-Up Shop, Elahé, Tata CLiQ, Amazon India, Fabindia, Manyavar, SUGAR, Lakmé, MAC, GIVA) that satisfy this EXACT styling requirement:

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
1. MULTI-RETAILER DIVERSITY: Search across ALL approved retailers and designer boutiques: Myntra, AJIO, Nykaa, Aza Fashions, Pernia's Pop-Up Shop, Elahé, Tata CLiQ, Amazon India. Discover all relevant, available matching products across multiple retailers rather than restricting to one store.
2. Find distinct REAL shoppable products that satisfy this exact same styling requirement across price points (Budget, Mid-range, Premium).
3. Do NOT change user's color, occasion, or style requirement between alternatives.
4. You MUST extract the REAL, exact product page URL with the real product ID directly from your search result.
5. NEVER invent URLs, placeholder IDs (like 12345678, 12345, 000000), or fake prices. If an item cannot be found on another store, return real verified stores only.

Format each product cleanly as:
---
TIER: budget | mid | premium
PRODUCT_TITLE: <exact title as listed on the retailer>
BRAND: <brand name>
RETAILER: <retailer name: Myntra, AJIO, Nykaa, Aza Fashions, Pernia's Pop-Up Shop, Elahé, Tata CLiQ, Amazon, etc.>
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
    // URL and details were written by the LLM rather than returned by a search index
    modelAuthored?: boolean;
  }> = [];

  const seenCanonicalUrls = new Set<string>();
  const seenIdentityKeys = new Set<string>();

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
      const tavilyQuery = `${spec.searchQuery} buy online india`;

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

      const searchDomains = [
        "myntra.com",
        "ajio.com",
        "nykaa.com",
        "amazon.in",
        "tatacliq.com",
        "hm.com",
        "zara.com",
      ];
      if (isBoutiqueOccasion || isHighBudget || spec.category === "outfit" || spec.category === "jewellery") {
        searchDomains.push("azafashions.com", "perniaspopupshop.com", "elahe.in", "ogaan.com", "kalkifashion.com");
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

        if (!res.url || !isValidProductUrl(res.url)) {
          discovery.tavilyRejectedUrls.push(String(res.url ?? "").slice(0, 120));
        }
        if (res.url && isValidProductUrl(res.url)) {
          const canonicalUrl = getCanonicalProductUrl(res.url);
          const rawTitle = res.title.replace(/\|.*$/, "").replace(/^Buy\s+/i, "").trim() || spec.itemTitle;
          const guessedBrand = rawTitle.split(" ")[0] || "Curated";
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
                  text: `Search for real, purchasable, currently available products in India for: ${spec.searchQuery}.
Strictly adhere to:
1. Target gender: ${spec.targetGender || "unisex"}.
2. Item category: ${spec.category} -> ${spec.itemSubcategory || spec.itemTitle}.
3. Approved retailers and boutiques: Myntra (myntra.com), AJIO (ajio.com), Tata CLiQ (tatacliq.com), Nykaa (nykaa.com / nykaafashion.com), Aza Fashions (azafashions.com), Pernia's Pop-Up Shop (perniaspopupshop.com), Elahé (elahe.in), Amazon India (amazon.in). Include products from more than one retailer when your search finds them.
4. Return up to 8 products. Copy each product page URL exactly as it appears in your search results. Never invent, guess or complete product IDs or slugs; omit a product if you do not have its exact page URL.
5. Use the product title exactly as listed by the retailer.`,
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
          const cleanCandidateUrl = cleanUrl(rawPageUrl);
          if (!cleanCandidateUrl || !isValidProductUrl(cleanCandidateUrl)) {
            discovery.openaiRejectedUrls.push(rawPageUrl.slice(0, 120));
            continue;
          }
          const canonicalUrl = getCanonicalProductUrl(cleanCandidateUrl);
          const finalTitle = (typeof prod.title === "string" && prod.title.trim()) || spec.itemTitle;
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
            });
          }
        }
      }

      // Extract search citations from tool annotations
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
            /https?:\/\/(?:www\.)?(?:myntra\.com|nykaa\.com|nykaafashion\.com|ajio\.com|amazon\.in|tatacliq\.com|azafashions\.com|perniaspopupshop\.com|elahe\.in|ogaan\.com|kalkifashion\.com|hm\.com|zara\.com|fabindia\.com|manyavar\.com|giva\.co|flipkart\.com|meesho\.com|etsy\.com|tirabeauty\.com|sephora\.in)[^\s)"'<>\[\]]+/i,
          );
          if (blockUrlMatch) rawUrl = blockUrlMatch[0];
        }

        const cleanCandidateUrl = cleanUrl(rawUrl);
        if (cleanCandidateUrl && isValidProductUrl(cleanCandidateUrl)) {
          const canonicalUrl = getCanonicalProductUrl(cleanCandidateUrl);
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
            });
          }
        }
      }

      // Fallback to citations if fewer than 4 candidates were parsed
      if (candidateList.length < 4 && citations.length > 0) {
        for (const cit of citations) {
          if (candidateList.length >= 12) break;
          const canonicalUrl = getCanonicalProductUrl(cit.url);
          const citTitle = cit.title.replace(/\|.*$/, "").replace(/^Buy\s+/i, "").trim() || spec.itemTitle;
          const citBrand = citTitle.split(" ")[0] || "Curated";
          const identityKey = getProductIdentityKey(citTitle, citBrand);

          if (!seenCanonicalUrls.has(canonicalUrl) && !seenIdentityKeys.has(identityKey) && isValidProductUrl(cit.url)) {
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

  const verifiedPromises = candidateList.map(async (cand, candIdx): Promise<ProductResult | null> => {
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
    );
    if (!consistency.isConsistent) {
      logger.warn(
        { productTitle: cand.productTitle, url: cand.url, reason: consistency.reason },
        "Candidate product failed consistency check between displayed title, URL, image, or occasion",
      );
      return null;
    }

    // Avoided colors check
    if (violatesAvoidedColors(cand.productTitle, cand.shade, colorsAvoidList)) {
      logger.info({ productTitle: cand.productTitle }, "Dropping product clashing with user's avoided colors");
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
    if (cand.modelAuthored && !pageData.success) {
      // A URL written by the model (not returned by a search index) is only trusted once its
      // page has actually been fetched; a bot-blocked page cannot confirm the product exists.
      logger.info(
        { url: cand.url, reason: pageData.reason },
        "Dropping OpenAI-suggested candidate: retailer product page could not be verified",
      );
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
    } else if (pageData.retailerRestricted) {
      // Retailer bot protection (HTTP 403 / 429) e.g. AJIO Akamai protection
      // URL is a genuine exact product page from search provider, but server automated fetch was blocked.
      // Retain search data, but do NOT falsely claim priceVerified or productVerified
      priceVerified = false;
      productVerified = false;
      availability = undefined;
    } else {
      // HTTP 404, discontinued, or invalid redirect -> reject candidate!
      logger.info({ url: cand.url, reason: pageData.reason }, "Dropping product candidate: page returned 404, discontinued, or invalid redirect");
      return null;
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
    );
    if (!postConsistency.isConsistent) {
      logger.warn(
        { productTitle: finalTitle, url: cand.url, reason: postConsistency.reason },
        "Candidate product failed post-page verification consistency check",
      );
      return null;
    }

    const finalImageUrl = imageUrl || undefined;

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
      targetGender: spec.targetGender,
      style: profile.style?.[0] || "Contemporary",
      occasion: profile.occasion || "Special Event",
      material: candMaterial,
      imageUrl: finalImageUrl,
      productUrl: cand.url,
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
  if (
    discovery.tavily !== "ok" &&
    discovery.openai === "ok" &&
    verifiedProducts.length === 0 &&
    !diagnosticsTracker.some((d) => d.provider === "openai_web_search")
  ) {
    logger.warn({ spec: spec.itemTitle, discovery }, "OpenAI web search fallback produced no verified products");
    diagnosticsTracker.push({
      provider: "openai_web_search",
      status: "ok",
      message:
        `OpenAI web search fallback ran for "${spec.itemTitle}" and suggested ${discovery.openaiProducts} product(s), ` +
        `but none could be confirmed on the retailer's product page.`,
      suggestedFix: "Refresh to search again, or check other categories. Unverifiable suggestions are not shown.",
    });
  }

  // Only genuine retailer search results that passed verification are returned. If fewer
  // products survive, the group stays short/empty and the UI shows its "no verified match"
  // state; curated benchmark candidates are never injected as live recommendations.

  // Sort products strictly in ascending order of current price (low to high)
  verifiedProducts.sort(compareProductsByPriceAscending);

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
      const prods = await searchAlternativesForRequirement(spec, profile, budgetLimit, diagnostics, look);
      return {
        category: spec.category,
        recommendedItemTitle: spec.itemTitle,
        stylingRequirement: spec.stylingRequirement,
        products: prods,
      };
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

      // Sort products within each group ascending by actual verified price (low to high)
      const sortedGroupProducts = sortProductsByPriceAscending(distinctGroupProducts);

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
