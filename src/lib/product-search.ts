import { getOpenAIClient, RECOMMENDATION_MODEL, getOpenAIKeyDiagnostics } from "./openai-client";
import { tavilySearch, getTavilyKeyDiagnostics } from "./tavily-client";
import { logger } from "./logger";
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
 * based on their age group and pronouns/styling selection.
 */
export function detectPersona(profile: SkinTuneProfile): PersonaType {
  const age = (profile.ageGroup || "").toLowerCase();
  const pronouns = (profile.pronouns || "").toLowerCase();

  // Child detection: age group 0-12 / kids or pronouns indicating children
  if (
    age.includes("kids") ||
    age.includes("0–12") ||
    age.includes("0-12") ||
    age.includes("child") ||
    pronouns.includes("kids") ||
    pronouns.includes("children")
  ) {
    return "child";
  }

  // Women's styling (must check before "men" since "women" contains "men")
  if (pronouns.includes("women")) {
    return "woman";
  }

  // Men's styling
  if (pronouns.includes("men")) {
    return "man";
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
    const valid = requestedCategory as ProductCategory;
    if (categories.includes(valid)) {
      return [valid];
    }
  }

  return categories;
}

export const SHADE_MATCH_DISCLAIMER =
  "AI shade matching from a photograph is an estimate and may vary because of lighting, camera conditions, and screen display. We recommend patch-testing or swatch verification before purchase.";

// Approved retailer domains in India
export const APPROVED_RETAILERS = [
  "myntra.com",
  "nykaa.com",
  "nykaafashion.com",
  "ajio.com",
  "amazon.in",
  "tatacliq.com",
  "hm.com",
  "zara.com",
  "fabindia.com",
  "manyavar.com",
  "sugarcosmetics.com",
  "lakmeindia.com",
  "maccosmetics.in",
];

// Placeholder IDs and patterns that must NEVER be accepted as real product URLs
export const BANNED_PLACEHOLDER_PATTERNS = [
  "12345678",
  "1234567",
  "123456",
  "12345",
  "000000",
  "product-id",
  "example-product",
  "placeholder",
  "dummy",
  "fake",
  "random-id",
  "test-id",
];

/**
 * Cleans any trailing punctuation, markdown artifacts, or tracking parameters from URL strings.
 */
export function cleanUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  let cleaned = rawUrl.trim();
  const match = cleaned.match(/https?:\/\/[^\s"'<>[\]()]+/);
  if (match) {
    cleaned = match[0];
  }
  cleaned = cleaned.replace(/[)\]">.,;]+$/, "");

  try {
    const u = new URL(cleaned);
    // Remove search engine / marketing tracking tags while preserving canonical product path
    u.searchParams.delete("utm_source");
    u.searchParams.delete("utm_medium");
    u.searchParams.delete("utm_campaign");
    u.searchParams.delete("utm_term");
    u.searchParams.delete("utm_content");
    return u.toString();
  } catch {
    return cleaned;
  }
}

/**
 * Strict validator to ensure a URL is a REAL URL from an approved retailer,
 * has a valid product path, and contains NO placeholder IDs.
 */
export function isValidProductUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // 1. Must be from an approved retailer
    const isApproved = APPROVED_RETAILERS.some(
      (d) => host === d || host.endsWith("." + d),
    );
    if (!isApproved) {
      return false;
    }

    // 2. Reject placeholder IDs
    for (const pat of BANNED_PLACEHOLDER_PATTERNS) {
      if (pathname.includes(pat)) {
        return false;
      }
    }

    // 3. Must not be a generic homepage or bare domain
    if (pathname === "/" || pathname === "" || pathname.length < 3) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Determines whether a URL is an exact product page or a search/catalog page.
 */
export function determineUrlType(urlStr: string): "exact_product" | "search_result" {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (
      (host.includes("myntra.com") && path.includes("/buy") && /\/\d{5,10}\/buy/.test(path)) ||
      (host.includes("nykaa.com") && path.includes("/p/")) ||
      (host.includes("ajio.com") && path.includes("/p/")) ||
      (host.includes("amazon.in") && (path.includes("/dp/") || path.includes("/gp/product/"))) ||
      (host.includes("tatacliq.com") && path.includes("/p-")) ||
      (host.includes("hm.com") && path.includes(".productpage."))
    ) {
      return "exact_product";
    }

    return "search_result";
  } catch {
    return "search_result";
  }
}

/**
 * Consistency check between DISPLAYED PRODUCT and TARGET PRODUCT URL.
 * Prevents cases where SkinTune displays "Ishin Banarasi Saree" but
 * the destination URL points to "H&M Boys T-Shirt".
 */
export function checkProductConsistency(
  productName: string,
  brand: string,
  category: ProductCategory,
  urlStr: string,
  citationTitle?: string,
): { isConsistent: boolean; reason?: string } {
  const targetText = `${urlStr} ${citationTitle || ""}`.toLowerCase();
  const cleanName = productName.toLowerCase();

  // 1. Clashing garment type detection
  if (cleanName.includes("saree") || cleanName.includes("sari")) {
    if (
      targetText.includes("t-shirt") ||
      targetText.includes("tshirt") ||
      targetText.includes("boys") ||
      targetText.includes("lipstick") ||
      targetText.includes("foundation") ||
      targetText.includes("jeans")
    ) {
      return {
        isConsistent: false,
        reason: `Product is Saree, but destination URL belongs to a clashing item: ${urlStr}`,
      };
    }
  }

  // If displayed product is jewellery/necklace/earrings, URL must not be clothing or makeup
  if (category === "jewellery") {
    if (
      targetText.includes("t-shirt") ||
      targetText.includes("dress") ||
      targetText.includes("saree") ||
      targetText.includes("lipstick") ||
      targetText.includes("foundation")
    ) {
      return {
        isConsistent: false,
        reason: `Category is Jewellery, but destination URL belongs to an unrelated item: ${urlStr}`,
      };
    }
  }

  // If displayed product is makeup/foundation/lipstick, URL must not be apparel or jewellery
  if (category === "makeup") {
    if (
      targetText.includes("saree") ||
      targetText.includes("necklace") ||
      targetText.includes("choker") ||
      targetText.includes("earring") ||
      targetText.includes("t-shirt") ||
      targetText.includes("dress")
    ) {
      return {
        isConsistent: false,
        reason: `Category is Makeup, but destination URL belongs to an apparel/jewellery item: ${urlStr}`,
      };
    }
  }

  // 2. Brand clash detection
  if (brand && brand.length > 2) {
    const brandLower = brand.toLowerCase();
    if (brandLower === "ishin" && targetText.includes("h&m")) {
      return {
        isConsistent: false,
        reason: `Displayed brand Ishin clashes with URL brand H&M: ${urlStr}`,
      };
    }
    if (brandLower === "maybelline" && targetText.includes("zara")) {
      return {
        isConsistent: false,
        reason: `Displayed brand Maybelline clashes with URL brand Zara: ${urlStr}`,
      };
    }
  }

  // 3. Keyword token overlap check
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
        ].includes(t),
    );

  let tokenMatchCount = 0;
  for (const token of nameTokens) {
    if (targetText.includes(token)) {
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
): { isMatch: boolean; diffRupees: number; reason?: string } {
  if (!destinationPrice || destinationPrice <= 0) {
    return { isMatch: false, diffRupees: -1, reason: "No valid price found on destination product page" };
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
  price?: number;
  originalPrice?: number;
  currency?: string;
  availability?: string;
  imageUrl?: string;
  productName?: string;
  brand?: string;
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
      signal: AbortSignal.timeout(1200),
    });

    if (!res.ok) {
      return { success: false, reason: `HTTP status ${res.status}` };
    }

    const html = await res.text();
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
                imageUrl =
                  imageUrl ||
                  (Array.isArray(item.image)
                    ? item.image[0]
                    : typeof item.image === "object"
                    ? item.image.url
                    : item.image);
              }

              const offers = item.offers;
              if (offers) {
                const offerObj = Array.isArray(offers) ? offers[0] : offers;
                if (offerObj.price) {
                  const pNum = parseFloat(
                    String(offerObj.price).replace(/[^0-9.]/g, ""),
                  );
                  if (!isNaN(pNum) && pNum > 0) price = Math.round(pNum);
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
        } catch {}
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
            if (pdp.media?.albums?.[0]?.images?.[0]?.src) imageUrl = pdp.media.albums[0].images[0].src;
            if (pdp.flags?.outOfStock) availability = "Out of Stock";
          }
        } catch {}
      }
    }

    // 3. Fallback to OpenGraph and regex patterns
    if (!price) {
      const priceMeta =
        html.match(/"discountedPrice":\s*(\d+)/i) ||
        html.match(/"price":\s*"?(\d+)"?/i) ||
        html.match(/<meta property="(?:product|og):price:amount" content="([^"]+)"/i) ||
        html.match(/content="(\d+)" property="(?:product|og):price:amount"/i);
      if (priceMeta) {
        const pNum = parseFloat(priceMeta[1]);
        if (!isNaN(pNum) && pNum > 0) price = Math.round(pNum);
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
      };
    }

    return {
      success: false,
      reason: "Could not find reliable price on destination page",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, reason: msg };
  }
}

/**
 * Clean and normalize a price value into an integer number and formatted string.
 */
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
    const cleaned = priceInput.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed > 0) {
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

export interface RequirementSpec {
  category: ProductCategory;
  itemTitle: string;
  stylingRequirement: string;
  searchQuery: string;
  preferredRetailers: string[];
  shadeHint?: string;
  materialHint?: string;
  matchContext: string;
}

/**
 * Formulate specific styling requirements based on the recommended look and profile.
 * AI recommendation remains constant; we only search multiple shoppable alternatives for it.
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

  // 1. Outfit Requirement
  if (applicableCategories.includes("outfit")) {
    const outfitPiece = pieces.find(
      (p) =>
        (p?.category || "").toLowerCase().includes("main") ||
        (p?.category || "").toLowerCase().includes("outfit"),
    );
    const outfitName = outfitPiece?.name || (look.outfit || "").split(",")[0] || "Outfit";
    let query = `${outfitName} ${look.outfitColor || ""}`.trim();

    if (persona === "child") {
      query += " kids";
    } else if (persona === "man") {
      query += " men";
    } else if (persona === "woman") {
      query += " women";
    }

    const paletteStr = Array.isArray(look.palette) ? look.palette.join(", ") : "";
    specs.push({
      category: "outfit",
      itemTitle: outfitName,
      stylingRequirement: `${look.outfit || outfitName} (Palette: ${look.outfitColor || paletteStr})`,
      searchQuery: query,
      preferredRetailers: ["Myntra", "AJIO", "Tata CLiQ", "Nykaa Fashion"],
      matchContext: `Matches your recommended ${look.outfitColor || "style"} palette and ${profile.occasion || "event"} dress code.`,
    });
  }

  // 2. Jewellery Requirement (if applicable, never child)
  if (applicableCategories.includes("jewellery") && persona !== "child") {
    const jewPiece = pieces.find((p) =>
      (p?.category || "").toLowerCase().includes("jewel"),
    );
    const jewName = jewPiece?.name || (look.jewellery || "").split(",")[0] || "Jewellery";
    const query = `${jewName} ${persona === "man" ? "men" : "women"}`;

    specs.push({
      category: "jewellery",
      itemTitle: jewName,
      stylingRequirement: `${look.jewellery || jewName} (${undertone} undertone harmony)`,
      searchQuery: query,
      preferredRetailers: ["Myntra", "AJIO", "Nykaa Fashion", "Tata CLiQ"],
      materialHint: "Fashion jewellery / gold-tone plated / pearls / brass",
      matchContext: `Selected to balance your neckline geometry and ${undertone} undertone reflectivity.`,
    });
  }

  // 3. Footwear Requirement
  if (applicableCategories.includes("footwear")) {
    const footName = (look.footwear || "").split(",")[0] || "Footwear";
    const query = `${footName} ${persona === "child" ? "kids" : persona === "man" ? "men" : "women"}`;

    specs.push({
      category: "footwear",
      itemTitle: footName,
      stylingRequirement: `${look.footwear || footName} (${profile.occasion || "event"} appropriate)`,
      searchQuery: query,
      preferredRetailers: ["Myntra", "AJIO", "Tata CLiQ", "Amazon India"],
      matchContext: `Coordinates proportions and color balance with your ${look.outfitColor || "outfit"}.`,
    });
  } else if (applicableCategories.includes("accessories")) {
    const accPiece = pieces.find((p) =>
      (p?.category || "").toLowerCase().includes("acc"),
    );
    const accName = accPiece?.name || (look.accessories || "").split(",")[0] || "Accessory";
    const query = `${accName} ${persona === "child" ? "kids" : persona === "man" ? "men" : "women"}`;

    specs.push({
      category: "accessories",
      itemTitle: accName,
      stylingRequirement: `${look.accessories || accName}`,
      searchQuery: query,
      preferredRetailers: ["Myntra", "AJIO", "Tata CLiQ"],
      matchContext: `Harmonizes the finishing details for this ${profile.occasion || "styling"} edit.`,
    });
  }

  // 4. Makeup Requirement (Women only, with AI shade matching)
  if (applicableCategories.includes("makeup") && persona === "woman") {
    const makeupDetail = (look.makeup || "").toLowerCase();
    let shadeHint = `${skinTone} skin with ${undertone} undertone`;
    let query = "Maybelline New York Fit Me Matte Liquid Foundation";
    let itemTitle = "Foundation";

    if (makeupDetail.includes("lip")) {
      query = "Warm terracotta nude matte liquid lipstick";
      itemTitle = "Warm Terracotta / Nude Lip";
      shadeHint = `${undertone} flattering warm terracotta or nude rose`;
    }

    specs.push({
      category: "makeup",
      itemTitle,
      stylingRequirement: `${look.makeup || "Natural Makeup"} (${skinTone} depth, ${undertone} undertone)`,
      searchQuery: query,
      preferredRetailers: ["Nykaa", "Myntra", "Amazon India", "Tira"],
      shadeHint,
      matchContext: `AI shade-matched to complement your ${skinTone} depth and ${undertone} undertone.`,
    });
  }

  return specs;
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
): Promise<ProductResult[]> {
  const budgetInstruction = budgetLimit
    ? `CRITICAL BUDGET CONSTRAINT: User's budget is strictly under ₹${budgetLimit}. All alternatives must stay within ₹${budgetLimit} where possible. Never exceed ₹${budgetLimit} without marking.`
    : `Provide diverse price levels: budget (Under ₹1,500), mid-range (₹1,500-₹3,500), and premium (₹3,500+).`;

  const colorsLoveStr = Array.isArray(profile.colorsLove) ? profile.colorsLove.join(", ") : "None";
  const colorsAvoidList = Array.isArray(profile.colorsAvoid) ? profile.colorsAvoid : [];
  const colorsAvoidStr = colorsAvoidList.join(", ");

  const prompt = `You are SkinTune's Multi-Retailer Product Discovery Engine.
Your task is to search the web for 3 distinct, REAL, currently available products in India from multiple trusted retailers (Myntra, AJIO, Nykaa, Nykaa Fashion, Amazon India, Tata CLiQ, Fabindia, Manyavar, SUGAR, Lakmé, MAC, GIVA) that satisfy this EXACT styling requirement:

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
1. MULTI-RETAILER DIVERSITY: Search across MULTIPLE approved retailers: Myntra, AJIO, Nykaa, Tata CLiQ, Amazon India. If relevant products exist across multiple retailers, diversify the results (e.g. 1 from Myntra, 1 from AJIO, 1 from Nykaa/Tata CLiQ). Do NOT return all 3 from the same retailer if alternatives exist.
2. Find 3 distinct REAL shoppable products that satisfy this exact same styling requirement across different price levels (Budget, Mid-range, Premium).
3. Do NOT change user's color, occasion, or style requirement between alternatives.
4. You MUST extract the REAL, exact product page URL with the real product ID directly from your search result.
5. NEVER invent URLs, placeholder IDs (like 12345678, 12345, 000000), or fake prices. If an item cannot be found on another store, return real verified stores only.

Format each product cleanly as:
---
TIER: budget | mid | premium
PRODUCT_TITLE: <exact title as listed on the retailer>
BRAND: <brand name>
RETAILER: <retailer name: Myntra, AJIO, Nykaa, Tata CLiQ, Amazon, etc.>
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
  }> = [];

  let openAiSucceeded = false;
  let tavilySucceeded = false;

  // 1. Primary fast live web search: Tavily (direct <1.5s live search)
  const tavilyHealth = getTavilyKeyDiagnostics();
  if (tavilyHealth.isConfigured) {
    try {
      const tavilyQuery = `${spec.searchQuery} buy online india`;
      const tavilyResp = await tavilySearch(tavilyQuery, 6, [
        "myntra.com",
        "ajio.com",
        "nykaa.com",
        "amazon.in",
        "tatacliq.com",
        "hm.com",
        "zara.com",
      ]);

      for (const res of tavilyResp.results || []) {
        if (res.url && isValidProductUrl(res.url)) {
          const parsedHost = new URL(res.url).hostname.replace(/^www\./, "").split(".")[0];
          const retailer =
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
              : parsedHost.charAt(0).toUpperCase() + parsedHost.slice(1);

          // Extract price from snippet/title e.g. Rs. 1,499 or ₹1,499
          const priceMatch = (res.title + " " + res.content).match(/(?:₹|Rs\.?|INR)\s*([\d,]+)/i);
          let extractedPrice: number | undefined;
          if (priceMatch) {
            const p = parseFloat(priceMatch[1].replace(/,/g, ""));
            if (!isNaN(p) && p > 0) extractedPrice = Math.round(p);
          }

          // Match image from Tavily images if available
          let candidateImage: string | undefined;
          if (tavilyResp.images && tavilyResp.images.length > 0) {
            const matchedImg = tavilyResp.images.find(
              (img) =>
                img.url &&
                (img.url.includes(parsedHost) ||
                  (img.title && img.title.toLowerCase().includes(spec.itemTitle.toLowerCase()))),
            );
            if (matchedImg) candidateImage = matchedImg.url;
          }

          candidateList.push({
            tier: assignPriceTier(extractedPrice, budgetLimit),
            productTitle: res.title.replace(/\|.*$/, "").replace(/^Buy\s+/i, "").trim() || spec.itemTitle,
            brand: res.title.split(" ")[0] || "Curated",
            retailer: retailer || "Online Store",
            url: cleanUrl(res.url),
            price: extractedPrice,
            imageUrl: candidateImage,
          });
        }
      }

      if (candidateList.length >= 2) {
        tavilySucceeded = true;
      }
    } catch (tavilyErr: unknown) {
      logger.warn({ tavilyErr, spec: spec.itemTitle }, "Tavily fast search failed, falling back to OpenAI");
    }
  }

  // 2. Fallback: OpenAI Web Search Preview (if Tavily was unavailable or returned insufficient results)
  if (candidateList.length < 2) {
    try {
      const openai = getOpenAIClient();
      const response = await openai.responses.create({
        model: RECOMMENDATION_MODEL,
        tools: [{ type: "web_search_preview" }],
        input: prompt,
      });

      const outputText = response.output_text || "";

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
            /https?:\/\/(?:www\.)?(?:myntra\.com|nykaa\.com|nykaafashion\.com|ajio\.com|amazon\.in|tatacliq\.com|hm\.com|zara\.com)[^\s)"'<>\[\]]+/i,
          );
          if (blockUrlMatch) rawUrl = blockUrlMatch[0];
        }

        const cleanCandidateUrl = cleanUrl(rawUrl);
        if (cleanCandidateUrl && isValidProductUrl(cleanCandidateUrl)) {
          const { price } = normalizePrice(rawPrice, "INR");
          const { price: originalPrice } = normalizePrice(rawOriginalPrice, "INR");
          candidateList.push({
            tier,
            productTitle: productTitle || spec.itemTitle,
            brand: brand || productTitle.split(" ")[0] || "Curated",
            retailer,
            price,
            originalPrice,
            url: cleanCandidateUrl,
            shade: shade || undefined,
            material: material || undefined,
          });
        }
      }

      // Fallback to citations if fewer than 2 candidates were parsed
      if (candidateList.length < 2 && citations.length > 0) {
        for (const cit of citations) {
          if (!candidateList.some((c) => c.url === cit.url) && isValidProductUrl(cit.url)) {
            const parsedHost = new URL(cit.url).hostname.replace(/^www\./, "").split(".")[0];
            const guessedRetailer =
              parsedHost === "myntra"
                ? "Myntra"
                : parsedHost === "nykaa"
                ? "Nykaa"
                : parsedHost === "ajio"
                ? "AJIO"
                : parsedHost === "amazon"
                ? "Amazon India"
                : "Online Store";

            candidateList.push({
              tier: "mid",
              productTitle: cit.title.replace(/\|.*$/, "").replace(/^Buy\s+/i, "").trim() || spec.itemTitle,
              brand: cit.title.split(" ")[0] || "Curated",
              retailer: guessedRetailer,
              url: cit.url,
            });
          }
        }
      }

      if (candidateList.length > 0) {
        openAiSucceeded = true;
      }
    } catch (err: unknown) {
      const errObj = err as { status?: number; code?: string; message?: string };
      const errMsg = errObj.message || String(err);
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

  // 3. Fast Parallel Verification of candidates and build products list
  const verifiedPromises = candidateList.map(async (cand): Promise<ProductResult | null> => {
    // Consistency check
    const consistency = checkProductConsistency(
      cand.productTitle,
      cand.brand,
      spec.category,
      cand.url,
    );
    if (!consistency.isConsistent) {
      logger.warn(
        { productTitle: cand.productTitle, url: cand.url, reason: consistency.reason },
        "Candidate product failed consistency check between displayed title and URL",
      );
      return null;
    }

    // Avoided colors check
    if (violatesAvoidedColors(cand.productTitle, cand.shade, colorsAvoidList)) {
      logger.info({ productTitle: cand.productTitle }, "Dropping product clashing with user's avoided colors");
      return null;
    }

    let finalPrice = cand.price;
    let finalOriginalPrice = cand.originalPrice;
    let priceVerified = Boolean(cand.price);
    let productVerified = determineUrlType(cand.url) === "exact_product";
    let availability = "In Stock";
    let imageUrl = cand.imageUrl;
    let finalTitle = cand.productTitle;
    let finalBrand = cand.brand;

    // If price wasn't extracted from snippet, do a fast page verification
    if (!finalPrice) {
      const pageData = await verifyProductPage(cand.url);
      if (pageData.success && pageData.price) {
        finalPrice = pageData.price;
        if (pageData.originalPrice) finalOriginalPrice = pageData.originalPrice;
        priceVerified = true;
        productVerified = true;
        if (pageData.availability) availability = pageData.availability;
        if (pageData.imageUrl) imageUrl = pageData.imageUrl;
        if (pageData.productName && pageData.productName.length > 5) {
          finalTitle = pageData.productName;
        }
        if (pageData.brand) finalBrand = pageData.brand;
      }
    }

    const urlType = determineUrlType(cand.url);
    const computedTier = cand.tier || assignPriceTier(finalPrice, budgetLimit);

    // Match score calculation
    let matchScore = 88;
    if (finalPrice && budgetLimit && finalPrice <= budgetLimit) {
      matchScore += 6;
    }
    if (priceVerified) matchScore += 3;
    if (urlType === "exact_product") matchScore += 2;
    matchScore = Math.min(matchScore, 98);

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
      retailer: cand.retailer,
      price: finalPrice,
      formattedPrice,
      originalPrice: finalOriginalPrice,
      formattedOriginalPrice,
      currency: "INR",
      priceTier: computedTier,
      priceVerified,
      productVerified,
      shade: cand.shade,
      material: cand.material,
      imageUrl,
      productUrl: cand.url,
      urlType,
      isVerified: true,
      matchScore,
      matchReason: spec.matchContext,
      availability,
      source: "live_search",
      lastChecked: new Date().toISOString(),
    };
  });

  const verifiedRaw = await Promise.all(verifiedPromises);
  const verifiedProducts = verifiedRaw.filter((p): p is ProductResult => p !== null);

  // Sort in-stock products first, out-of-stock products last
  verifiedProducts.sort((a, b) => {
    const aInStock = a.availability !== "Out of Stock";
    const bInStock = b.availability !== "Out of Stock";
    if (aInStock && !bInStock) return -1;
    if (!aInStock && bInStock) return 1;
    return 0;
  });

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
 * Searches and returns MULTIPLE verified shoppable products across retailers and price points
 * for a LookRecommendation and SkinTuneProfile.
 */
export async function searchProductsForLook(
  look: LookRecommendation,
  profile: SkinTuneProfile,
  requestedCategory?: string,
): Promise<ProductRecommendationsResponse> {
  const cacheKey = `${look.id}:${requestedCategory || "all"}:${profile.occasion || ""}`;
  const cached = serverProductCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    logger.info({ lookId: look.id, cacheKey }, "Returning cached product recommendations");
    return cached.data;
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
      suggestedFix: "Add OPENAI_API_KEY or TAVILY_API_KEY to artifacts/skintune-next/.env.local and restart the server.",
    });
  }

  try {
    const plannedSpecs = planRequirementSpecs(look, profile, persona, applicableCategories);

    // Filter by requested category if specified (e.g. 'outfit')
    const specsToSearch =
      requestedCategory && requestedCategory !== "all"
        ? plannedSpecs.filter((s) => s.category === requestedCategory)
        : plannedSpecs;

    // Search alternatives for all requirements in parallel
    const alternativePromises = specsToSearch.map(async (spec) => {
      const prods = await searchAlternativesForRequirement(spec, profile, budgetLimit, diagnostics);
      return {
        category: spec.category,
        recommendedItemTitle: spec.itemTitle,
        stylingRequirement: spec.stylingRequirement,
        products: prods,
      };
    });

    const groupsRaw = await Promise.all(alternativePromises);

    // Flatten all verified products
    const allProducts: ProductResult[] = [];
    const validGroups: ProductGroup[] = [];

    for (const grp of groupsRaw) {
      if (grp.products.length > 0) {
        validGroups.push(grp);
        allProducts.push(...grp.products);
      }
    }

    const responseData: ProductRecommendationsResponse = {
      lookId: look.id,
      persona,
      applicableCategories,
      products: allProducts,
      groups: validGroups,
      status: allProducts.length > 0 ? "success" : "partial",
      disclaimer: SHADE_MATCH_DISCLAIMER,
      searchedAt: new Date().toISOString(),
      totalFound: allProducts.length,
      diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
    };

    if (allProducts.length > 0) {
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
