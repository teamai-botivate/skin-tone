/**
 * Safe Retailer URL Validation and Live Search URL Generator
 *
 * Handles deep links, search endpoints, and redirects across approved Indian retailers:
 * - Myntra: Uses `<slug>?rawQuery=<query>` (NEVER `/search` which opens kids' clothing)
 * - AJIO: Uses `/search/?text=<query>` (NEVER empty `/search` which redirects to men's polo shirts)
 * - Nykaa: Uses `nykaa.com/search/result/?q=<query>` for beauty/makeup, and
 *          `nykaafashion.com/search/result/?q=<query>` for apparel/jewellery
 * - Tata CLiQ: Uses `/search/?searchCategory=all&text=<query>`
 * - Amazon: Uses `/s?k=<query>`
 */

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
  "azafashions.com",
  "perniaspopupshop.com",
  "elahe.in",
  "ogaan.com",
  "kalkifashion.com",
  "giva.co",
  "flipkart.com",
  "meesho.com",
  "etsy.com",
  "tirabeauty.com",
  "sephora.in",
];

/**
 * Normalizes a retailer name into a lowercase alphanumeric key for comparison.
 */
export function normalizeRetailerName(name?: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Identifies the authentic canonical retailer name from a URL's hostname.
 */
export function getRetailerFromUrl(urlStr: string): string | null {
  if (!urlStr || typeof urlStr !== "string") return null;
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (host.includes("myntra.com")) return "Myntra";
    if (host.includes("ajio.com")) return "AJIO";
    if (host.includes("nykaafashion.com")) return "Nykaa Fashion";
    if (host.includes("nykaa.com")) return "Nykaa";
    if (host.includes("tatacliq.com")) return "Tata CLiQ";
    if (host.includes("amazon.in") || host.includes("amazon.com")) return "Amazon India";
    if (host.includes("azafashions.com")) return "Aza Fashions";
    if (host.includes("perniaspopupshop.com")) return "Pernia's Pop-Up Shop";
    if (host.includes("elahe.in")) return "Elahé";
    if (host.includes("ogaan.com")) return "Ogaan";
    if (host.includes("kalkifashion.com")) return "Kalki Fashion";
    if (host.includes("hm.com")) return "H&M";
    if (host.includes("zara.com")) return "Zara";
    if (host.includes("fabindia.com")) return "Fabindia";
    if (host.includes("manyavar.com")) return "Manyavar";
    if (host.includes("sugarcosmetics.com")) return "SUGAR Cosmetics";
    if (host.includes("lakmeindia.com")) return "Lakmé";
    if (host.includes("maccosmetics.in")) return "M.A.C";
    if (host.includes("giva.co")) return "GIVA";
    if (host.includes("flipkart.com")) return "Flipkart";
    if (host.includes("meesho.com")) return "Meesho";
    if (host.includes("etsy.com")) return "Etsy";
    if (host.includes("tirabeauty.com")) return "Tira Beauty";
    if (host.includes("sephora.in")) return "Sephora";

    // For any approved retailer domain, capitalize the primary brand segment
    for (const approved of APPROVED_RETAILERS) {
      if (host === approved || host.endsWith("." + approved)) {
        const seg = approved.split(".")[0];
        return seg.charAt(0).toUpperCase() + seg.slice(1);
      }
    }

    return null;
  } catch {
    return null;
  }
}

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
 * Cleans trailing punctuation, markdown artifacts, or tracking parameters from URL strings.
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
 * Generates an authentic live search URL for a given retailer, preserving
 * gender, brand, product category, product name, and colour attributes.
 */
export function buildRetailerSearchUrl(
  retailer: string,
  params: {
    query?: string;
    brand?: string;
    productName?: string;
    category?: string;
    subcategory?: string;
    gender?: string;
    color?: string;
  },
): string {
  const r = (retailer || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const rawTerms: string[] = [];

  const gender = (params.gender || "").toLowerCase();
  const isBoy = gender === "boy" || gender === "boys" || gender === "child_boy";
  const isGirl = gender === "girl" || gender === "girls" || gender === "child_girl";
  const isChild = isBoy || isGirl || gender === "child" || gender === "kids" || gender === "children";
  const isMan = !isChild && (gender === "man" || gender === "men" || gender === "male");
  const isWoman = !isChild && (gender === "woman" || gender === "women" || gender === "female");

  const isMakeup =
    params.category === "makeup" ||
    (params.productName || "").toLowerCase().includes("foundation") ||
    (params.productName || "").toLowerCase().includes("lipstick") ||
    (params.productName || "").toLowerCase().includes("shade") ||
    (params.productName || "").toLowerCase().includes("concealer");

  // Include gender prefix for apparel/shoes/accessories (skip for beauty/makeup)
  if (!isMakeup) {
    if (isBoy) rawTerms.push("boys");
    else if (isGirl) rawTerms.push("girls");
    else if (isChild) rawTerms.push("kids");
    else if (isMan) rawTerms.push("men");
    else if (isWoman) rawTerms.push("women");
  }

  if (params.brand) rawTerms.push(params.brand);

  if (params.color) {
    const cleanColor = params.color.trim();
    const prodLower = (params.productName || "").toLowerCase();
    if (!prodLower.includes(cleanColor.toLowerCase())) {
      rawTerms.push(cleanColor);
    }
  }

  const cleanProductName = (params.productName || "");
  let filteredName = cleanProductName;
  if (isMan) {
    filteredName = filteredName.replace(/\b(women|womens|women's|female|ladies|woman|girls|girl)\b/gi, "").trim();
  } else if (isWoman) {
    filteredName = filteredName.replace(/\b(men|mens|men's|male|gents|gentlemen|boys|boy)\b/gi, "").trim();
  } else if (isChild) {
    filteredName = filteredName.replace(/\b(women|womens|women's|female|ladies|woman|men|mens|men's|male|gents|gentlemen)\b/gi, "").trim();
  }

  if (filteredName) {
    rawTerms.push(filteredName);
  } else if (params.subcategory) {
    rawTerms.push(params.subcategory);
  } else if (params.query) {
    rawTerms.push(params.query);
  }

  // Ensure essential item type keyword is present if not already contained
  const currentTokensLower = rawTerms.join(" ").toLowerCase();
  if (params.subcategory && !currentTokensLower.includes(params.subcategory.toLowerCase())) {
    rawTerms.push(params.subcategory);
  } else if (params.category === "footwear" && !/\b(shoe|shoes|flats?|heels?|sandals?|slides?|sneakers?|boots?|loafers?|mojaris?|juttis?|pumps?|kolhapuris?)\b/i.test(currentTokensLower)) {
    rawTerms.push("shoes");
  } else if (params.category === "jewellery" && !/\b(jewellery|jewelry|earrings?|jhumkas?|necklace|choker|pendant|bracelet|bangle|kada|ring|watch)\b/i.test(currentTokensLower)) {
    rawTerms.push("jewellery");
  } else if (params.category === "accessories" && !/\b(bag|bags|potli|clutch|tote|handbag|purse|sunglasses?|belt)\b/i.test(currentTokensLower)) {
    rawTerms.push("bag");
  }

  // Deduplicate tokens while preserving order
  const combined = rawTerms
    .join(" ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = combined.split(" ").filter(Boolean);
  const seenWords = new Set<string>();
  const cleanTokens: string[] = [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (!seenWords.has(lower)) {
      seenWords.add(lower);
      cleanTokens.push(w);
    }
  }
  const cleanQuery = cleanTokens.join(" ");
  const q = encodeURIComponent(cleanQuery);

  // 1. Myntra: MUST use <slug>?rawQuery=<query>
  // NEVER use /search (which is an internal kids' clothing category on Myntra)
  if (r.includes("myntra")) {
    const slug = cleanTokens
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    const defaultSlug =
      params.category === "footwear"
        ? isMan ? "men-footwear" : isWoman ? "women-footwear" : "kids-footwear"
        : params.category === "makeup"
          ? "makeup"
          : params.category === "jewellery"
            ? isMan ? "men-jewellery" : "jewellery"
            : params.category === "accessories"
              ? isMan ? "men-accessories" : "accessories"
              : isMan ? "men-clothing" : isWoman ? "women-clothing" : "clothing";
    return `https://www.myntra.com/${slug || defaultSlug}?rawQuery=${q}`;
  }

  // 2. AJIO: MUST use /search/?text=<query> (with non-empty text param)
  if (r.includes("ajio")) {
    return `https://www.ajio.com/search/?text=${q}`;
  }

  // 3. Tata CLiQ: MUST use /search/?searchCategory=all&text=<query>
  if (r.includes("tata") || r.includes("cliq")) {
    return `https://www.tatacliq.com/search/?searchCategory=all&text=${q}`;
  }

  // 4. Nykaa: Beauty items must go to nykaa.com; apparel goes to nykaafashion.com
  if (r.includes("nykaa")) {
    if (r.includes("fashion") || (!isMakeup && params.category !== "makeup")) {
      return `https://www.nykaafashion.com/search/result/?q=${q}`;
    }
    return `https://www.nykaa.com/search/result/?q=${q}`;
  }

  // 5. Amazon India
  if (r.includes("amazon")) {
    return `https://www.amazon.in/s?k=${q}`;
  }

  // 6. Specialist brands
  if (r.includes("fabindia")) {
    return `https://www.fabindia.com/search?q=${q}`;
  }
  if (r.includes("manyavar")) {
    return `https://www.manyavar.com/en-in/search?q=${q}`;
  }
  if (r.includes("sugar")) {
    return `https://sugarcosmetics.com/search?q=${q}`;
  }
  if (r.includes("lakme")) {
    return `https://www.lakmeindia.com/search?q=${q}`;
  }
  if (r.includes("mac")) {
    return `https://www.maccosmetics.in/esearch?search=${q}`;
  }

  // 7. Designer Boutiques & Multi-Brand Luxury Stores
  if (r.includes("aza")) {
    return `https://www.azafashions.com/search?q=${q}`;
  }
  if (r.includes("pernia")) {
    return `https://www.perniaspopupshop.com/search?q=${q}`;
  }
  if (r.includes("elahe")) {
    return `https://www.elahe.in/search?q=${q}`;
  }
  if (r.includes("ogaan")) {
    return `https://www.ogaan.com/search?q=${q}`;
  }
  if (r.includes("kalki")) {
    return `https://www.kalkifashion.com/search?q=${q}`;
  }

  // 8. Fashion & Jewellery Platforms
  if (r.includes("zara")) {
    return `https://www.zara.com/in/en/search?searchTerm=${q}`;
  }
  if (r === "hm" || r.includes("h&m") || r.includes("hm.com")) {
    return `https://www2.hm.com/en_in/search-results.html?q=${q}`;
  }
  if (r.includes("giva")) {
    return `https://www.giva.co/search?q=${q}`;
  }
  if (r.includes("flipkart")) {
    return `https://www.flipkart.com/search?q=${q}`;
  }
  if (r.includes("meesho")) {
    return `https://www.meesho.com/search?q=${q}`;
  }
  if (r.includes("etsy")) {
    return `https://www.etsy.com/in-en/search?q=${q}`;
  }
  if (r.includes("tira")) {
    return `https://www.tirabeauty.com/search?q=${q}`;
  }
  if (r.includes("sephora")) {
    return `https://sephora.in/search?q=${q}`;
  }

  // If retailer specifies a domain (e.g. store.com / store.in), construct a search URL on that store
  if (r.includes(".com") || r.includes(".in") || r.includes(".co")) {
    const cleanHost = r.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    return `https://www.${cleanHost}/search?q=${q}`;
  }

  // Fallback safe URL for Myntra or unspecified retailer
  const slug = cleanTokens
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `https://www.myntra.com/${slug || "clothing"}?rawQuery=${q}`;
}

/**
 * Strict validator to ensure a URL is a REAL URL from an approved retailer,
 * has a valid product path, and contains NO placeholder IDs.
 * Rejects bare /search endpoints and Myntra's buggy /search path.
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
      if (pat === "000000" && (host.includes("tatacliq.com") || pathname.includes("mp000000"))) {
        continue;
      }
      if (pathname.includes(pat)) {
        return false;
      }
    }

    // 3. Must not be a generic homepage or bare domain
    if (pathname === "/" || pathname === "" || pathname.length < 3) {
      return false;
    }

    // 4. Reject Myntra /search URLs (which land on kids' clothing set category "Search")
    if (host.includes("myntra.com") && pathname.includes("/search")) {
      return false;
    }

    // 5. Reject search URLs missing their required query parameters
    if (pathname.includes("/search") || pathname === "/s" || pathname.startsWith("/s/")) {
      const text = parsed.searchParams.get("text") || parsed.searchParams.get("q") || parsed.searchParams.get("k");
      if (!text || text.trim().length < 2 || text === "undefined" || text === "null") {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes a product URL to its canonical form.
 */
export function getCanonicalProductUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  const cleaned = cleanUrl(rawUrl);
  try {
    const u = new URL(cleaned);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    // Nykaa: /p/<id> or /<slug>/p/<id>
    if (host.includes("nykaa.com")) {
      const pMatch = u.pathname.match(/(.*\/p\/\d+)/i);
      if (pMatch) {
        return `https://www.nykaa.com${pMatch[1]}`;
      }
      if (u.pathname.includes("/search")) {
        const q = u.searchParams.get("q");
        if (q && q.trim().length > 0 && q !== "undefined") {
          return `https://www.nykaa.com/search/result/?q=${encodeURIComponent(q.trim())}`;
        }
      }
      return `${u.origin}${u.pathname}`;
    }

    // Amazon: /dp/<ASIN> or /gp/product/<ASIN>
    if (host.includes("amazon.in") || host.includes("amazon.com")) {
      const asinMatch = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      if (asinMatch) {
        return `https://www.amazon.in/dp/${asinMatch[1]}`;
      }
      if (u.pathname === "/s" || u.pathname.startsWith("/s/")) {
        const k = u.searchParams.get("k");
        if (k && k.trim().length > 0 && k !== "undefined") {
          return `https://www.amazon.in/s?k=${encodeURIComponent(k.trim())}`;
        }
      }
      return `${u.origin}${u.pathname}`;
    }

    // Myntra: /<brand>/<name>/<id>/buy -> keep pathname
    if (host.includes("myntra.com")) {
      const buyMatch = u.pathname.match(/(.*\/buy)/i);
      if (buyMatch) {
        return `https://www.myntra.com${buyMatch[1]}`;
      }
      if (u.pathname.includes("/search")) {
        const q = u.searchParams.get("q") || u.searchParams.get("rawQuery") || "";
        const cleanQ = q.trim();
        if (cleanQ && cleanQ !== "undefined") {
          const slug = cleanQ.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
          return `https://www.myntra.com/${slug || "clothing"}?rawQuery=${encodeURIComponent(cleanQ)}`;
        }
      }
      return `${u.origin}${u.pathname}${u.search ? u.search : ""}`;
    }

    // AJIO: /p/<id>
    if (host.includes("ajio.com")) {
      const ajioMatch = u.pathname.match(/(.*\/p\/[a-zA-Z0-9_]+)/i);
      if (ajioMatch) {
        return `https://www.ajio.com${ajioMatch[1]}`;
      }
      if (u.pathname.includes("/search")) {
        const text = u.searchParams.get("text");
        if (text && text.trim().length > 0 && text !== "undefined") {
          return `https://www.ajio.com/search/?text=${encodeURIComponent(text.trim())}`;
        }
      }
      return `${u.origin}${u.pathname}${u.search ? u.search : ""}`;
    }

    // Tata CLiQ: /p-<id>
    if (host.includes("tatacliq.com")) {
      const cliqMatch = u.pathname.match(/(.*\/p-[a-zA-Z0-9]+)/i);
      if (cliqMatch) {
        return `https://www.tatacliq.com${cliqMatch[1]}`;
      }
      if (u.pathname.includes("/search")) {
        const text = u.searchParams.get("text") || u.searchParams.get("searchCategory");
        if (text && text.trim().length > 0 && text !== "undefined") {
          return `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(text.trim())}`;
        }
      }
      return `${u.origin}${u.pathname}${u.search ? u.search : ""}`;
    }

    // Designer Boutiques: Aza Fashions, Pernia's Pop-Up Shop, Elahé, Ogaan, Kalki Fashion
    if (host.includes("azafashions.com")) {
      if (u.pathname.includes("/products/")) {
        return `https://www.azafashions.com${u.pathname.replace(/\/+$/, "")}`;
      }
      if (u.pathname.includes("/search")) {
        const q = u.searchParams.get("q");
        if (q && q.trim().length > 0 && q !== "undefined") {
          return `https://www.azafashions.com/search?q=${encodeURIComponent(q.trim())}`;
        }
      }
      return `${u.origin}${u.pathname}`;
    }

    if (host.includes("perniaspopupshop.com")) {
      if (u.pathname.includes("/products/") || /\.html$/i.test(u.pathname)) {
        return `https://www.perniaspopupshop.com${u.pathname.replace(/\/+$/, "")}`;
      }
      if (u.pathname.includes("/search")) {
        const q = u.searchParams.get("q");
        if (q && q.trim().length > 0 && q !== "undefined") {
          return `https://www.perniaspopupshop.com/search?q=${encodeURIComponent(q.trim())}`;
        }
      }
      return `${u.origin}${u.pathname}`;
    }

    if (host.includes("elahe.in")) {
      if (u.pathname.includes("/products/")) {
        return `https://www.elahe.in${u.pathname.replace(/\/+$/, "")}`;
      }
      if (u.pathname.includes("/search")) {
        const q = u.searchParams.get("q");
        if (q && q.trim().length > 0 && q !== "undefined") {
          return `https://www.elahe.in/search?q=${encodeURIComponent(q.trim())}`;
        }
      }
      return `${u.origin}${u.pathname}`;
    }

    if (host.includes("ogaan.com")) {
      if (u.pathname.includes("/products/") || /\.html$/i.test(u.pathname)) {
        return `https://www.ogaan.com${u.pathname.replace(/\/+$/, "")}`;
      }
      if (u.pathname.includes("/search")) {
        const q = u.searchParams.get("q");
        if (q && q.trim().length > 0 && q !== "undefined") {
          return `https://www.ogaan.com/search?q=${encodeURIComponent(q.trim())}`;
        }
      }
      return `${u.origin}${u.pathname}`;
    }

    if (host.includes("kalkifashion.com")) {
      if (u.pathname.includes("/products/") || /\.html$/i.test(u.pathname)) {
        return `https://www.kalkifashion.com${u.pathname.replace(/\/+$/, "")}`;
      }
      if (u.pathname.includes("/search")) {
        const q = u.searchParams.get("q");
        if (q && q.trim().length > 0 && q !== "undefined") {
          return `https://www.kalkifashion.com/search?q=${encodeURIComponent(q.trim())}`;
        }
      }
      return `${u.origin}${u.pathname}`;
    }

    if (u.search && (u.pathname.includes("/search") || u.pathname === "/s" || u.pathname.startsWith("/s/") || u.searchParams.has("q") || u.searchParams.has("text") || u.searchParams.has("k"))) {
      return `${u.origin}${u.pathname}${u.search}`;
    }

    return `${u.origin}${u.pathname}`;
  } catch {
    return cleaned;
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

    // Placeholder IDs are never exact products
    for (const pat of BANNED_PLACEHOLDER_PATTERNS) {
      if (pat === "000000" && (host.includes("tatacliq.com") || path.includes("mp000000"))) continue;
      if (path.includes(pat)) return "search_result";
    }

    if (
      (host.includes("myntra.com") && path.includes("/buy") && /\/\d+\/buy/.test(path)) ||
      (host.includes("nykaa.com") && path.includes("/p/")) ||
      (host.includes("ajio.com") && path.includes("/p/")) ||
      (host.includes("amazon.in") && (path.includes("/dp/") || path.includes("/gp/product/"))) ||
      (host.includes("tatacliq.com") && path.includes("/p-")) ||
      (host.includes("hm.com") && path.includes(".productpage.")) ||
      (host.includes("azafashions.com") && path.includes("/products/")) ||
      (host.includes("perniaspopupshop.com") && (path.includes("/products/") || /\.html$/i.test(path))) ||
      (host.includes("elahe.in") && path.includes("/products/")) ||
      (host.includes("ogaan.com") && (path.includes("/products/") || /\.html$/i.test(path))) ||
      (host.includes("kalkifashion.com") && (path.includes("/products/") || /\.html$/i.test(path)))
    ) {
      return "exact_product";
    }

    return "search_result";
  } catch {
    return "search_result";
  }
}

/**
 * Verifies whether a product URL is consistent with the selected audience (persona/gender),
 * product category, and intended item subcategory.
 */
export function isUrlConsistentWithProduct(
  urlStr: string,
  product: {
    productName?: string;
    brand?: string;
    category?: string;
    subcategory?: string;
    retailer?: string;
  },
  persona?: string,
): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const fullUrlText = `${parsed.pathname} ${parsed.search}`.toLowerCase();
    const gender = (persona || "").toLowerCase();
    const isBoy = gender === "boy" || gender === "boys" || gender === "child_boy";
    const isGirl = gender === "girl" || gender === "girls" || gender === "child_girl";
    const isChild = isBoy || isGirl || gender === "child" || gender === "kids";
    const isMan = !isChild && (gender === "man" || gender === "men" || gender === "male");
    const isWoman = !isChild && (gender === "woman" || gender === "women" || gender === "female");

    // 0. Retailer consistency check: card retailer and URL destination MUST belong to the same retailer
    if (product.retailer) {
      const urlRetailer = getRetailerFromUrl(urlStr);
      if (urlRetailer) {
        const normUrlRet = normalizeRetailerName(urlRetailer);
        const normExpectedRet = normalizeRetailerName(product.retailer);
        if (normUrlRet && normExpectedRet) {
          const isNykaaBoth = normUrlRet.includes("nykaa") && normExpectedRet.includes("nykaa");
          if (!isNykaaBoth && normUrlRet !== normExpectedRet) {
            return false;
          }
        }
      }
    }

    // 1. Audience consistency check
    if (isMan) {
      const hasFemaleKeyword = /(?:\/flats\/|\/women-|\/womens-|\/girls-|-women-|-womens-|\banouk-women\b|\bladies\b|\bwomen\b)/i.test(fullUrlText);
      const hasMaleKeyword = /(?<!wo)(?:men-|mens-|\bmen\b|\bmens\b|\bmale\b)/i.test(fullUrlText);
      if (hasFemaleKeyword && !hasMaleKeyword) {
        return false;
      }
    } else if (isWoman) {
      const hasMaleKeyword = /(?<!wo)(?:men-|mens-|\/boys-|-boys-|\bgents\b|\bboys?\b)/i.test(fullUrlText);
      if (hasMaleKeyword && !/women/i.test(fullUrlText)) {
        return false;
      }
    } else if (isChild) {
      if (/(?:\/men-formal-|\/women-formal-)/i.test(fullUrlText)) {
        return false;
      }
    }

    // 2. Category consistency check
    const cat = (product.category || "").toLowerCase();
    if (cat === "footwear") {
      if (/(?:\/clothing\/|\/dresses\/|\/sarees\/|\/kurtas\/|\/shirts\/|\/jeans\/|\/t-shirts\/|\/makeup\/|\/beauty\/)/i.test(fullUrlText)) {
        return false;
      }
    } else if (cat === "outfit") {
      if (/(?:\/flats\/|\/heels\/|\/footwear\/|\/shoes\/|\/sandals\/|\/makeup\/|\/lipstick\/)/i.test(fullUrlText)) {
        return false;
      }
      const sub = (product.subcategory || "").toLowerCase();
      if (sub === "blazer") {
        if (/(?:\/t-shirts?\/|\/jeans\/|\/dresses?\/|\/shoes?\/|\/flats?\/)/i.test(fullUrlText) && !/blazer|suit/i.test(fullUrlText)) {
          return false;
        }
      }
    } else if (cat === "makeup") {
      if (/(?:\/shoes\/|\/footwear\/|\/clothing\/|\/dresses\/|\/shirts\/)/i.test(fullUrlText)) {
        return false;
      }
      if (host.includes("nykaafashion.com")) {
        return false;
      }
    } else if (cat === "jewellery") {
      if (/(?:\/shoes\/|\/footwear\/|\/clothing\/|\/dresses\/|\/shirts\/|\/lipstick\/)/i.test(fullUrlText)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Safely sanitizes or resolves a product's destination URL for the UI card button.
 * If the direct product URL is verified, authentic, and consistent with audience/category/retailer, returns it.
 * Otherwise, generates an authentic live search URL on that retailer using the product's
 * actual attributes (gender, category, brand, productName, and color).
 */
export function getSafeProductUrl(
  product: {
    productUrl?: string;
    retailer: string;
    productName: string;
    brand: string;
    category?: string;
    subcategory?: string;
    color?: string;
    urlType?: string;
  },
  persona: string,
): string {
  const url = product.productUrl;
  const isConsistent = url ? isUrlConsistentWithProduct(url, product, persona) : false;
  const isExact = product.urlType === "exact_product" && isValidProductUrl(url || "");

  // If already a valid exact product URL and consistent with product/audience/retailer, return it safely
  if (isExact && url && isConsistent) {
    return url;
  }

  // If already a valid, safe retailer search URL and consistent, keep it
  if (url && isConsistent && isValidProductUrl(url)) {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      if (!host.includes("myntra.com") || !u.pathname.includes("/search")) {
        const urlRet = getRetailerFromUrl(url);
        const normCardRet = normalizeRetailerName(product.retailer);
        const normUrlRet = urlRet ? normalizeRetailerName(urlRet) : "";
        const isRetMatch = !normCardRet || normCardRet === normUrlRet || (normCardRet.includes("nykaa") && normUrlRet.includes("nykaa"));

        if (isRetMatch) {
          if (host.includes("ajio.com") && u.searchParams.get("text")) return url;
          if (host.includes("nykaa.com") && u.searchParams.get("q")) return url;
          if (host.includes("tatacliq.com") && (u.searchParams.get("text") || u.searchParams.get("searchCategory"))) return url;
          if (host.includes("amazon") && u.searchParams.get("k")) return url;
          if (
            (host.includes("azafashions.com") ||
              host.includes("perniaspopupshop.com") ||
              host.includes("elahe.in") ||
              host.includes("ogaan.com") ||
              host.includes("kalkifashion.com") ||
              host.includes("giva.co") ||
              host.includes("flipkart.com") ||
              host.includes("meesho.com") ||
              host.includes("etsy.com") ||
              host.includes("tirabeauty.com") ||
              host.includes("sephora.in")) &&
            (u.searchParams.get("q") || u.searchParams.get("searchTerm"))
          ) {
            return url;
          }
        }
      }
    } catch {
      // Fall through to buildRetailerSearchUrl
    }
  }

  // Otherwise, construct an authentic live search URL strictly belonging to product.retailer
  return buildRetailerSearchUrl(product.retailer, {
    gender: persona,
    brand: product.brand,
    productName: product.productName,
    category: product.category,
    subcategory: product.subcategory,
    color: product.color,
  });
}
