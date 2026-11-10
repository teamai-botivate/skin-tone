/**
 * Retailer search links ("More matching options").
 *
 * A product group has two kinds of results:
 *   1. Verified exact products — individual product pages that passed full verification.
 *   2. Relevant retailer search links — store search/listing pages for the same item,
 *      category and audience. These are never products: they carry no product name,
 *      price, image, brand or availability, and are always typed `search_result`.
 *
 * This module decides which search links are relevant enough to keep (strict category and
 * audience isolation) and how a group should be displayed. It is pure (no I/O) so the
 * same rules are shared by the server pipeline, the UI and offline tests.
 */
import {
  buildRetailerSearchUrl,
  determineUrlType,
  getRetailerFromUrl,
  isUrlConsistentWithProduct,
  isValidProductUrl,
} from "./retailer-urls";

export type RetailerSearchLink = {
  retailer: string;
  url: string;
  /** Always a search/listing page — never an exact verified product. */
  urlType?: "search_result";
  /** "discovered": a listing page returned by a search index; "store_search": a store search we built from the requirement. */
  source?: "discovered" | "store_search";
};

/** The parts of a requirement spec that decide what a search link must match. */
export type SearchLinkRequirement = {
  category: string;
  itemTitle: string;
  itemSubcategory?: string;
  targetGender?: string;
  dominantColor?: string;
  preferredRetailers: string[];
};

/** A listing/search page seen during discovery (rejected as a product, kept as a candidate link). */
export type DiscoveredSearchPage = { url: string; title?: string };

export const MAX_SEARCH_LINKS_PER_GROUP = 4;

// ---------------------------------------------------------------------------
// Category lexicon (whole words, singular/plural). Drapes and watches are shared between
// categories, so they never count as evidence of a *different* category.
// ---------------------------------------------------------------------------
const CATEGORY_TERMS: Record<string, RegExp> = {
  outfit:
    /\b(dress(es)?|frocks?|kurtas?|kurtis?|kurta[- ]?(pyjama|pajama)s?|sarees?|saris?|lehengas?|lehenga[- ]?choli|gowns?|shirts?|t[- ]?shirts?|tshirts?|tops|crop[- ]?tops?|blouses?|jeans|trousers?|pants|chinos?|shorts|skirts?|blazers?|jackets?|coats?|sherwanis?|churidars?|pyjamas?|pajamas?|dhotis?|salwars?|suits?|jumpsuits?|co[- ]?ords?|clothing|apparel|bandhgalas?|pathanis?|anarkalis?|nehru[- ]?jackets?|bundis?|waistcoats?|hoodies?|sweaters?|sweatshirts?|dungarees?|rompers?|leggings?|palazzos?|sharara|gharara|night[- ]?suits?|ethnic[- ]?wear|western[- ]?wear|outfits?)\b/i,
  footwear:
    /\b(shoes?|sandals?|heels?|heeled|sneakers?|boots?|loafers?|mojaris?|mojris?|juttis?|jootis?|flats|slippers?|flip[- ]?flops?|kolhapuris?|pumps|slides|ballerinas?|wedges|clogs?|oxfords?|brogues?|derbys?|footwear|espadrilles?|stilettos?|crocs)\b/i,
  jewellery:
    /\b(jewell?ery|jewelry|earrings?|jhumkas?|jhumkis?|necklaces?|pendants?|bangles?|bracelets?|rings?|kadas?|chains?|anklets?|payals?|maang[- ]?tikkas?|tikkas?|nose[- ]?pins?|chokers?|studs?|mangalsutras?|cufflinks?)\b/i,
  makeup:
    /\b(lipsticks?|lip[- ]?gloss|lip[- ]?balm|foundations?|concealers?|kajal|eyeliners?|mascaras?|blush(es|ers?)?|highlighters?|compacts?|primers?|make[- ]?up|beauty|eyeshadows?|eye[- ]?shadow|nail[- ]?polish|setting[- ]?spray|bb[- ]?cream|cc[- ]?cream|bronzers?|cosmetics?)\b/i,
  accessories:
    /\b(bags?|clutch(es)?|potlis?|totes?|handbags?|purses?|wallets?|belts?|sunglasses|eyewear|caps?|hats?|beanies?|hair|clips?|hair[- ]?clips?|hairbands?|headbands?|scrunchies?|bows?|hair[- ]?pins?|barrettes?|accessories|backpacks?|socks|gloves|ties|bow[- ]?ties?|pocket[- ]?squares?|umbrellas?|brooches?|turbans?|safas?|pagdis?)\b/i,
};

/** Words valid in more than one category; they never make a link "cross-category". */
const SHARED_TERMS_RE = /\b(dupattas?|stoles?|shawls?|scarf|scarves|watch(es)?|ethnic|festive|traditional|party|wedding)\b/gi;

/** Words that should not count as item evidence (audience, colours, filler). */
const NON_ITEM_WORDS = new Set([
  "men", "mens", "man", "women", "womens", "woman", "ladies", "boys", "boy", "girls", "girl", "kids", "kid",
  "children", "child", "baby", "infant", "toddler", "junior", "unisex", "for", "with", "and", "the", "a", "an",
  "of", "in", "on", "buy", "online", "india", "best", "new", "latest", "cute", "stylish", "classic", "soft",
  "set", "pack", "pair", "piece", "pieces", "look", "style", "styled", "matching", "search", "result", "results",
  "text", "q", "k", "rawquery", "searchcategory", "all", "catalogsearch", "s",
]);

function decodeUrlText(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = [parsed.pathname];
    parsed.searchParams.forEach((v) => parts.push(v));
    return parts
      .join(" ")
      .replace(/[\/_+\-=?&.%]+/g, " ")
      .toLowerCase();
  } catch {
    return "";
  }
}

function normalizeText(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/\b(men|women|boys|girls|kids)['’]s\b/g, "$1")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Categories named by a piece of text (shared drape/watch words excluded). */
export function detectNamedCategories(text: string): Set<string> {
  const t = normalizeText(text).replace(SHARED_TERMS_RE, " ");
  const found = new Set<string>();
  for (const [cat, re] of Object.entries(CATEGORY_TERMS)) {
    if (re.test(t)) found.add(cat);
  }
  return found;
}

type AudienceKey = "women" | "men" | "girls" | "boys" | "kids";

function namedAudiences(text: string): Set<AudienceKey> {
  const t = normalizeText(text);
  const out = new Set<AudienceKey>();
  if (/\b(women|womens|woman|ladies|female)\b/.test(t)) out.add("women");
  if (/\b(men|mens|man|gents|gentlemen|male)\b/.test(t)) out.add("men");
  if (/\b(girls?)\b/.test(t)) out.add("girls");
  if (/\b(boys?)\b/.test(t)) out.add("boys");
  if (/\b(kids?|children|child|baby|babies|infants?|toddlers?|junior)\b/.test(t)) out.add("kids");
  return out;
}

function normalizeTargetAudience(gender?: string): AudienceKey | "unisex" | "unknown" {
  const g = (gender || "").toLowerCase();
  if (g === "women" || g === "woman" || g === "female") return "women";
  if (g === "men" || g === "man" || g === "male") return "men";
  if (g === "girls" || g === "girl" || g === "child_girl") return "girls";
  if (g === "boys" || g === "boy" || g === "child_boy") return "boys";
  if (g === "child" || g === "kids" || g === "children") return "kids";
  if (g === "unisex") return "unisex";
  return "unknown";
}

/**
 * Audience isolation: a link may not name a different gender or age group than the
 * requirement. Children's links must name a child audience (never adult catalogues).
 */
export function isSearchTextAudienceCompatible(text: string, targetGender?: string): boolean {
  const target = normalizeTargetAudience(targetGender);
  const named = namedAudiences(text);
  switch (target) {
    case "women":
      return !named.has("men") && !named.has("boys") && !named.has("girls") && !named.has("kids");
    case "men":
      return !named.has("women") && !named.has("boys") && !named.has("girls") && !named.has("kids");
    case "girls":
      return !named.has("boys") && !named.has("men") && !named.has("women") && (named.has("girls") || named.has("kids"));
    case "boys":
      return !named.has("girls") && !named.has("women") && !named.has("men") && (named.has("boys") || named.has("kids"));
    case "kids":
      return !named.has("men") && !named.has("women") && (named.has("kids") || named.has("boys") || named.has("girls"));
    default:
      return true;
  }
}

/** Distinctive item words from the requirement (e.g. "clips", "sherwani", "mojari"). */
function requirementItemWords(req: SearchLinkRequirement): string[] {
  const color = normalizeText(req.dominantColor || "");
  const words = normalizeText(`${req.itemTitle} ${(req.itemSubcategory || "").replace(/_/g, " ")}`)
    .split(" ")
    .filter((w) => w.length >= 3 && !NON_ITEM_WORDS.has(w) && !color.split(" ").includes(w));
  return [...new Set(words)];
}

/**
 * Strict category isolation: the link must point at the requirement's own category and
 * must not name any other category (outfits never in footwear, footwear never in
 * accessories, and so on).
 */
export function isSearchTextCategoryCompatible(text: string, req: SearchLinkRequirement): boolean {
  return !namesOtherCategory(text, req.category) && namesRequiredItem(text, req);
}

/** True when the text names any category other than the requirement’s own. */
function namesOtherCategory(text: string, category: string): boolean {
  const cat = (category || "").toLowerCase();
  if (!CATEGORY_TERMS[cat]) return true;
  for (const other of detectNamedCategories(text)) {
    if (other !== cat) return true;
  }
  return false;
}

function namesRequiredItem(text: string, req: SearchLinkRequirement): boolean {
  const category = (req.category || "").toLowerCase();
  if (!CATEGORY_TERMS[category]) return false;
  // Same category is not enough (a jacket listing is not a shawl): the link must name the
  // requirement's own item type, or a generic word for the whole category.
  const linkStems = new Set(normalizeText(text).split(" ").map(stem));
  const itemWords = requirementItemWords(req);
  const typeWords = itemWords.filter((w) => CATEGORY_TERMS[category].test(w) || new RegExp(SHARED_TERMS_RE.source, "i").test(w));
  const required = [...(typeWords.length > 0 ? typeWords : itemWords), ...(GENERIC_CATEGORY_WORDS[category] ?? [])];
  return required.some((w) => linkStems.has(stem(w)));
}

/** Words that name a whole category, accepted for any item in it. */
const GENERIC_CATEGORY_WORDS: Record<string, string[]> = {
  footwear: ["footwear"],
  jewellery: ["jewellery", "jewelry"],
  accessories: ["accessories"],
  makeup: ["makeup", "cosmetics"],
  outfit: [],
};

function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && /(ses|xes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * True when a URL is a relevant retailer search/listing page for the requirement:
 * an approved store, a search/listing page (never an exact product page), the same
 * category, and the same gender/age group. Optional `title` (from a search index) is
 * checked with the same rules as the URL.
 */
export function isRelevantRetailerSearchLink(
  url: string,
  req: SearchLinkRequirement,
  title?: string,
): boolean {
  if (!url || !isValidProductUrl(url)) return false;
  // A product page is never offered as a search link (and a search link is never a product).
  if (determineUrlType(url) !== "search_result") return false;
  if (!getRetailerFromUrl(url)) return false;
  // Existing shared URL audience/category/boutique rules still apply
  if (
    !isUrlConsistentWithProduct(url, {
      category: req.category,
      subcategory: req.itemSubcategory,
      targetGender: req.targetGender,
    })
  ) {
    return false;
  }

  const urlText = decodeUrlText(url);
  const combined = `${urlText} ${title || ""}`;
  if (!isSearchTextAudienceCompatible(combined, req.targetGender)) return false;
  // Strict category isolation on both the URL and the page title; the item itself may be
  // named by either.
  if (namesOtherCategory(urlText, req.category)) return false;
  if (title && namesOtherCategory(title, req.category)) return false;
  return namesRequiredItem(combined, req);
}

/**
 * Builds the relevant search links for one product group: listing pages found during
 * discovery first, then store searches built from the requirement for its preferred
 * stores. Every link is checked for relevance; irrelevant ones are dropped, never shown.
 */
export function buildRelevantSearchLinks(
  req: SearchLinkRequirement,
  discoveredPages: DiscoveredSearchPage[] = [],
  limit = MAX_SEARCH_LINKS_PER_GROUP,
): RetailerSearchLink[] {
  const links: RetailerSearchLink[] = [];
  const seenUrls = new Set<string>();
  const seenRetailers = new Set<string>();

  const add = (url: string, source: RetailerSearchLink["source"], title?: string) => {
    if (links.length >= limit) return;
    if (!isRelevantRetailerSearchLink(url, req, title)) return;
    const retailer = getRetailerFromUrl(url);
    if (!retailer) return;
    const key = retailer.toLowerCase();
    if (seenUrls.has(url) || seenRetailers.has(key)) return;
    seenUrls.add(url);
    seenRetailers.add(key);
    links.push({ retailer, url, urlType: "search_result", source });
  };

  for (const page of discoveredPages) add(page.url, "discovered", page.title);

  for (const retailer of req.preferredRetailers) {
    if (links.length >= limit) break;
    add(
      buildRetailerSearchUrl(retailer, {
        productName: req.itemTitle,
        category: req.category,
        subcategory: req.itemSubcategory?.replace(/_/g, " "),
        gender: req.targetGender,
        color: req.dominantColor,
      }),
      "store_search",
    );
  }

  return links;
}

// ---------------------------------------------------------------------------
// Display rules (shared by the UI and tests)
// ---------------------------------------------------------------------------

export type GroupDisplayState = "products" | "products_and_links" | "links_only" | "empty";

/**
 * 1. Verified products only → "products"
 * 2. Verified products and relevant links → "products_and_links"
 * 3. Relevant links only → "links_only" (no "No verified match" message)
 * 4. Neither → "empty" (the existing empty-state fallback)
 */
export function getGroupDisplayState(group: {
  products?: unknown[];
  retailerSearchLinks?: unknown[];
}): GroupDisplayState {
  const hasProducts = (group.products?.length ?? 0) > 0;
  const hasLinks = (group.retailerSearchLinks?.length ?? 0) > 0;
  if (hasProducts && hasLinks) return "products_and_links";
  if (hasProducts) return "products";
  if (hasLinks) return "links_only";
  return "empty";
}

/** The page-level empty state is shown only when no group has products or relevant links. */
export function shouldShowEmptyState(
  products: unknown[],
  groups: Array<{ products?: unknown[]; retailerSearchLinks?: unknown[] }>,
): boolean {
  if (products.length > 0) return false;
  return groups.every((g) => getGroupDisplayState(g) === "empty");
}
