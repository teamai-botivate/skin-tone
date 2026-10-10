import {
  type DressResult,
  type ShopLink,
  type SkinTuneProfile,
  type SessionMemory,
} from "./skintune-schemas";
import {
  getSearchProvider,
  type SearchProductCandidate,
  type SearchPageResult,
} from "./providers/search";
import { getOpenAIClient, RECOMMENDATION_MODEL } from "./openai-client";
import { logger } from "./logger";

/**
 * Major shopping sites to fan out per-site searches across, so results
 * aren't dominated by whichever single site happens to rank highest for
 * one query (confirmed live: a single unscoped query for "men's terracotta
 * wedding suit" returned almost entirely Etsy images). This list itself
 * isn't a styling decision — it's just where to look — so it's fine as a
 * fixed list of real, general-purpose marketplaces; it does not encode any
 * per-user preference or category logic.
 */
const SHOPPING_SITES = ["amazon.in", "flipkart.com", "myntra.com", "ajio.com", "meesho.com", "etsy.com"];

/**
 * Builds a genuine shopping search query from the user's own profile —
 * gender, style world, colour preference, occasion, and budget — rather
 * than a fixed "dresses for women" string. Every clause here is
 * conditional on what the user actually answered, so two different
 * profiles produce two different queries and therefore different results;
 * there is no hardcoded product category or brand list.
 *
 * `colour` and `style` are passed in explicitly (rather than always reading
 * profile.colorsLove[0]/style[0]) so callers can round-robin across the
 * user's full colour/style lists — see buildQueryPlan below. Reusing only
 * index 0 was the root cause of a real reported bug: every single result
 * came back the same colour because every query, on every site and every
 * page, asked for the same one colour.
 */
function buildSearchQuery(
  profile: SkinTuneProfile,
  colour: string,
  style: string,
  // Optional session-memory-driven additions — see ResearchAgainRequestSchema/
  // RefineSearchRequestSchema. `refinement` is the user's own free-text
  // steering instruction (e.g. "less expensive", "dark green instead"),
  // appended verbatim as part of the search intent rather than parsed into
  // structured fields — GPT-based search (see openai-web-search-provider.ts)
  // can read and act on free text directly, unlike Tavily's plain keyword
  // matching, so there's no need for a separate NLU step here. `avoidTitles`
  // (rejected-product titles from memory) are named explicitly so a repeat
  // search steers away from what's already been shown/rejected, addressing
  // this branch's "Research Again must find NEW products" requirement.
  memory?: { refinement?: string; avoidTitles?: string[] },
): string {
  const normalizedPronouns = profile.pronouns.toLowerCase();
  const audience = normalizedPronouns.includes("women")
    ? "women's"
    : normalizedPronouns.includes("men")
      ? "men's"
      : "";
  const parts = [
    "buy",
    audience,
    // fit (e.g. "fitted", "relaxed") — added per direct request to make
    // the Tavily query more specific to the user's actual stated
    // preference. Genuinely conditional on what the user answered, same
    // as every other clause here — a user who left this blank produces a
    // query with no fit clause, not a default value.
    profile.fit || "",
    style,
    colour,
    // "clothing outfit" (not just "outfit") nudges the search toward
    // garments without needing exclusion syntax — see below for why the
    // exclusion terms that used to sit here were removed.
    profile.occasion ? `${profile.occasion} clothing outfit` : "clothing outfit",
    // bodyBuild (e.g. "athletic", "slim") — added alongside fit for the
    // same reason: Tavily's plain keyword search benefits from a more
    // specific query, and this field is already collected but was never
    // actually used to shape the search itself before this.
    profile.bodyBuild ? `for ${profile.bodyBuild} build` : "",
    "online",
    profile.budget ? `price ${profile.budget}` : "",
    memory?.refinement ?? "",
    memory?.avoidTitles?.length
      ? `(not: ${memory.avoidTitles.slice(0, 5).join(", ")})`
      : "",
  ].filter(Boolean);
  return parts.join(" ");
  // A real, live-reported regression: this function used to also append
  // "-jewellery -jewelry -pendant -necklace -earrings -eyewear -glasses
  // -sunglasses -watch -handbag" here, on the theory that Tavily supports
  // simple "-term" free-text exclusion the way a normal web search engine
  // does. The very next production deploy after that shipped, EVERY
  // per-site search task started returning zero usable results
  // ("No real dress results found across any site for this search — every
  // per-site task returned nothing usable") — a strictly worse outcome
  // than the accessories problem this was meant to fix. Ten "-term" tokens
  // stacked onto an already multi-clause query produces a long, unnatural
  // string that plausibly either returns nothing from Tavily itself, or
  // returns a thin result set that the OTHER two independent filter layers
  // (isRelevantToProfile's text denylist, filterByImageContent's vision
  // check — both still in place, see below) then squeeze down to zero
  // survivors. This was reverted rather than "fixed further" — accessory
  // exclusion belongs entirely in the two result-level filters, which
  // reject bad results AFTER they come back rather than risking the
  // search itself returning nothing. Do not re-add a query-level
  // exclusion string without first live-testing the exact resulting query
  // directly against api.tavily.com/search and confirming it still
  // returns a reasonable number of results — this is not a hypothetical
  // risk, it broke production immediately the one time it was tried.
}

/**
 * One (site, colour, style) combination to search — see buildQueryPlan.
 */
type QueryTask = { site: string; colour: string; style: string };

/**
 * Builds the set of per-site, per-colour/style search tasks for one page of
 * results. Cycles through SHOPPING_SITES and the user's own colorsLove/
 * style lists (falling back to a single empty-string entry if the user
 * didn't provide any, so the query still forms without that clause) so
 * that across a page of results, both the SITE and the COLOUR/STYLE
 * genuinely vary instead of every task asking the same single-colour,
 * single-site question. `page` offsets which slice of the colour/style
 * lists this page starts from, so "More dresses" surfaces different
 * combinations rather than repeating page one's.
 */
function buildQueryPlan(
  profile: SkinTuneProfile,
  page: number,
  taskCount: number,
): QueryTask[] {
  const colours = profile.colorsLove.length ? profile.colorsLove : [""];
  const styles = profile.style.length ? profile.style : [""];
  const tasks: QueryTask[] = [];
  for (let i = 0; i < taskCount; i++) {
    const n = page * taskCount + i;
    tasks.push({
      site: SHOPPING_SITES[n % SHOPPING_SITES.length],
      colour: colours[n % colours.length],
      style: styles[n % styles.length],
    });
  }
  return tasks;
}

/** Extracts the hostname from a URL, or null if it isn't a valid absolute URL. */
function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Domains that are never a genuine shopping retailer, even though Tavily
 * can return images hosted on them — confirmed live: a search scoped
 * (via include_domains, which is only ever a ranking hint, not an
 * enforced filter — see tavily-client.ts) to a real shopping site still
 * returned an image hosted on lookaside.fbsbx.com (a Facebook CDN URL)
 * whose actual content was an unrelated biography snippet with no
 * connection to clothing at all. Text-based relevance filtering
 * (isRelevantToProfile) can't catch this class of problem, since the
 * image's title/description may not contain any of the off-topic
 * category keywords it checks for — the issue here is the SOURCE domain
 * itself, not the content matching a known-bad category. This is a
 * denylist of platforms that host arbitrary user/business content, not
 * dedicated storefronts, so nothing they serve should ever become a dress
 * card regardless of what the image title claims.
 */
const NEVER_RETAILER_DOMAINS = [
  "fbsbx.com",
  "facebook.com",
  "fbcdn.net",
  "instagram.com",
  "cdninstagram.com",
  "pinterest.com",
  "pinimg.com",
  "twitter.com",
  "x.com",
  "twimg.com",
  "tiktok.com",
  "youtube.com",
  "ytimg.com",
  "wikipedia.org",
  "wikimedia.org",
  "linkedin.com",
];

/** True if this domain (or a subdomain of it) is one of NEVER_RETAILER_DOMAINS. */
function isNeverRetailerDomain(domain: string): boolean {
  return NEVER_RETAILER_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

/**
 * Well-known image-CDN hostname patterns mapped to the actual retailer
 * domain they serve. Tavily's images[] frequently come from a store's asset
 * CDN (e.g. i.etsystatic.com, i5.walmartimages.com) rather than the store's
 * own domain, which would otherwise make a perfectly good real photo point
 * to a useless CDN root as its "visit store" link. This list only
 * normalizes hostnames to their real, well-known parent retailer — it does
 * not invent a product-page URL or a price; the link is still just that
 * store's domain, not a proven product page.
 */
const CDN_HOST_TO_RETAILER: Record<string, string> = {
  "i.etsystatic.com": "etsy.com",
  "i5.walmartimages.com": "walmart.com",
  "i2.walmartimages.com": "walmart.com",
  "images-na.ssl-images-amazon.com": "amazon.com",
  "m.media-amazon.com": "amazon.com",
  "xcdn.next.co.uk": "next.co.uk",
  "cdn.shopify.com": "shopify.com",
  "assets.ajio.com": "ajio.com",
  "n.nordstrommedia.com": "nordstrom.com",
  "images.asos-media.com": "asos.com",
};

/** Maps a real (possibly CDN) hostname to the retailer domain used for both the "visit store" link and the display site name. */
function retailerDomainOf(hostname: string): string {
  if (CDN_HOST_TO_RETAILER[hostname]) return CDN_HOST_TO_RETAILER[hostname];
  // Generic CDN-subdomain heuristic: an "images."/"img."/"cdn."/"assets." /
  // "i<digit>." prefix on an otherwise-unknown host usually still belongs to
  // that same parent domain (e.g. img.zara.com -> zara.com already works
  // without this table), so strip one such leading label if present.
  const genericCdnPrefix = /^(images?|img|cdn|assets?|static|media|i\d*)\./;
  return hostname.replace(genericCdnPrefix, "");
}

/** Turns a domain into a human-readable store name, e.g. "utsavfashion.com" -> "Utsavfashion". */
function siteNameFrom(domain: string): string {
  const base = domain.split(".").slice(0, -1).join(".") || domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Best-effort price extraction from a result's text snippet — looks for a currency symbol followed by digits. Returns undefined if nothing matches. */
function extractPrice(content: string): string | undefined {
  const match = /(₹|Rs\.?|\$|€|£)\s?[\d,]+(?:\.\d{1,2})?/.exec(content);
  return match?.[0].trim();
}

/**
 * Builds dress photo cards from one site-scoped Tavily search's images[] —
 * see this file's module doc comment for why images[] and results[] are
 * NOT paired by hostname (they come from largely different sites and
 * rarely overlap). Each card's "visit store" link is that same photo's own
 * ACTUAL source domain (not necessarily the site this task was scoped to),
 * normalized from any CDN hostname to the real retailer.
 *
 * Deliberately does NOT filter out images whose real domain differs from
 * the site this task searched for. Confirmed live: Tavily's
 * `include_domains` does not reliably keep `images[]` on that one domain —
 * a search scoped to amazon.in/flipkart.com/myntra.com/ajio.com/meesho.com
 * mostly still returned other sites' images for real test queries (these
 * sites are often just less crawlable/indexed by Tavily for niche fashion
 * items than Etsy is). An earlier version of this function hard-filtered
 * to the expected domain, which correctly avoided ever mislabeling an
 * image's source, but also threw away almost every result for four of five
 * target sites, leaving too few dresses to show. Every card here still
 * shows its OWN real, correct source site (never a wrong label) — the
 * site-scoping is a ranking hint that shifts what Tavily returns, not a
 * guarantee of which real site a given card ends up from. If site coverage
 * for a query is ever reported as still too Etsy-heavy, that's a genuine
 * data-availability gap in what Tavily has indexed for that query, not a
 * pairing bug in this function — verify with a live query first.
 */
function buildDressCards(
  images: SearchProductCandidate[],
  profile: SkinTuneProfile,
  limit: number,
  idOffset: number,
): DressResult[] {
  const cards: DressResult[] = [];
  for (const image of images) {
    if (cards.length >= limit) break;
    const host = hostnameOf(image.imageUrl);
    if (!host) continue;
    const domain = retailerDomainOf(host);
    if (isNeverRetailerDomain(domain) || isNeverRetailerDomain(host)) continue;
    if (image.title && !isRelevantToProfile(image.title, image.description, profile)) continue;
    cards.push({
      id: `dress-${idOffset + cards.length + 1}`,
      title: image.title || "Styled piece",
      imageUrl: image.imageUrl,
      siteName: siteNameFrom(domain),
      sourceUrl: image.pageUrl ?? `https://${domain}`,
    });
  }
  return cards;
}

/**
 * Filters out results that are clearly off-topic for a clothing search,
 * even though they matched the colour/occasion keywords — a real,
 * live-reported problem: a men's-profile "terracotta wedding" query
 * surfaced a women's bridal lehenga colour guide and a terracotta
 * pottery/gifts listing in "Shop these online", because those pages
 * genuinely contain the words "terracotta" and "wedding" without being
 * clothing for this person at all. This checks BOTH title and content
 * snippet (title alone missed cases where the mismatch only showed up in
 * the description) for two things: (1) an explicit mention of the
 * opposite gender's clothing when the profile states a gender, and (2)
 * clearly non-clothing product categories (gifts, home decor, pottery,
 * accessories-only listings) that colour/theme keywords can accidentally
 * match. This is a relevance filter on real search results, not a
 * styling decision — it doesn't invent or prefer any specific product.
 */
function isRelevantToProfile(title: string, content: string | undefined, profile: SkinTuneProfile): boolean {
  const text = `${title} ${content ?? ""}`.toLowerCase();
  const normalizedPronouns = profile.pronouns.toLowerCase();

  const nonClothingCategories = [
    "pottery",
    "gift set",
    "wedding gift",
    "home decor",
    "home décor",
    "wall art",
    "showpiece",
    "figurine",
    "candle",
    "vase",
    "mug",
    "cup set",
    "dinnerware",
    "kitchenware",
    // Added after a live report: "artificial flowers"/bouquet listings
    // (wedding decor, not clothing) matched a colour+occasion query
    // ("terracotta wedding") and slipped through as a dress card.
    "artificial flower",
    "bouquet",
    "boutonniere",
    "floral arrangement",
    "wedding decor",
    "wedding décor",
    // Added after a live report: a real test user got glasses/spectacles
    // and a pendant/jewellery-only listing back for what should have been
    // an outfit-only search. This product's dress search is explicitly
    // garments-only — jewellery, eyewear, watches, bags, and footwear-only
    // listings are a different product category and must never appear
    // here even though they're worn on the body and can share colour/
    // occasion keywords with a real outfit search ("gold wedding pendant"
    // matches the same "wedding"+colour terms a real query would use).
    "eyewear",
    "eyeglasses",
    "spectacles",
    "sunglasses",
    "reading glasses",
    "pendant",
    "necklace",
    "earring",
    "bracelet",
    "bangle",
    "anklet",
    "nose pin",
    "jewellery set",
    "jewelry set",
    "wristwatch",
    "handbag",
    "clutch bag",
    "footwear only",
  ];
  if (nonClothingCategories.some((term) => text.includes(term))) return false;

  if (normalizedPronouns.includes("men") && !normalizedPronouns.includes("women")) {
    const womenOnlyTerms = ["lehenga", "saree", "sari", "women's dress", "bridal makeup", "her wedding"];
    if (womenOnlyTerms.some((term) => text.includes(term))) return false;
  }
  if (normalizedPronouns.includes("women") && !normalizedPronouns.includes("men")) {
    const menOnlyTerms = ["men's suit", "men's blazer", "groom's sherwani", "his wedding"];
    if (menOnlyTerms.some((term) => text.includes(term))) return false;
  }
  return true;
}

/**
 * Builds the general "shop these online" links from Tavily's results[] —
 * real store category/search page URLs, each with a price when the page
 * snippet happened to contain one. Not tied to any specific dress photo
 * above; see this file's module doc comment.
 */
function buildShopLinks(results: SearchPageResult[], profile: SkinTuneProfile, limit: number): ShopLink[] {
  const links: ShopLink[] = [];
  const seenHosts = new Set<string>();
  for (const result of results) {
    if (links.length >= limit) break;
    const host = hostnameOf(result.url);
    if (!host || seenHosts.has(host)) continue;
    if (isNeverRetailerDomain(host)) continue;
    if (!isRelevantToProfile(result.title, result.content, profile)) continue;
    seenHosts.add(host);
    links.push({
      title: result.title,
      url: result.url,
      siteName: siteNameFrom(host),
      price: extractPrice(result.content),
    });
  }
  return links;
}

/**
 * Text-only filtering (isRelevantToProfile above) catches mismatches
 * visible in the title/description text, but a real, live-reported case
 * slipped through it: a card titled "Buy Men's Rust Brown 2 Piece Suit"
 * whose actual photo showed a bride-and-groom couple together, not the
 * suit alone — the mismatch was only visible in the IMAGE ITSELF, not
 * anything Tavily's text metadata said. Text filtering structurally can't
 * catch this class of problem.
 *
 * This does one batched GPT-5.5 vision call across ALL candidate images
 * for a page at once (not one call per image — that would multiply
 * latency and cost by the number of candidates) and asks it to flag which
 * ones are NOT a clean single-person shot of clothing matching the
 * profile's stated gender (e.g. a couple/group photo, or a photo of the
 * wrong gender's clothing that the text metadata didn't reveal). Runs
 * AFTER text filtering and de-duplication, on the final candidate list,
 * so it's checking a small, already-mostly-relevant set, not every raw
 * search result. If this call fails for any reason, it fails open (all
 * candidates kept) rather than blocking the whole search — a missed
 * visual mismatch is a lesser problem than the search failing outright.
 *
 * Also flags accessory-only photos (glasses, jewellery, watches, bags,
 * shoes shown alone) — added after a live test report: a real user's
 * search for an outfit returned glasses and a pendant/jewellery listing
 * alongside genuine dresses. isRelevantToProfile's text-based
 * nonClothingCategories list and buildSearchQuery's "-jewellery -eyewear
 * ..." exclusion terms are the other two layers guarding against this;
 * this vision check is the backstop for cases where an accessory listing's
 * title/description doesn't literally contain any of those blocked words
 * (e.g. a title that just says the product name and colour) but the photo
 * itself unmistakably shows only an accessory, not a garment. This product
 * is garments-only by explicit design — see this file's module doc
 * comment — so any one of these three layers rejecting an item is
 * intentional, not overly aggressive.
 */
async function filterByImageContent(
  dresses: DressResult[],
  profile: SkinTuneProfile,
): Promise<DressResult[]> {
  if (dresses.length === 0) return dresses;
  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: RECOMMENDATION_MODEL,
      messages: [
        {
          role: "system",
          content:
            `You are reviewing a set of product photos being shown to a person styling themselves for ${profile.pronouns || "an unspecified gender"}. This is a GARMENTS-ONLY search — the person is looking for clothing/an outfit, not accessories. For EACH numbered image, decide if it is a clean, usable product shot for THIS person: it should clearly show clothing/an outfit matching their stated gender (a dress, suit, kurta, top, etc.), ideally worn by a single person (or a flat/product-only shot of the garment itself). REJECT the image if it is: a couple or group photo, the wrong gender's clothing, an unrelated object, OR — just as importantly — a photo where the main subject is an ACCESSORY rather than a garment (e.g. glasses/sunglasses/eyewear, a pendant/necklace/earrings/other jewellery, a watch, a handbag, shoes shown alone) even if it was returned by a clothing-related search query. Respond with strict JSON: {"rejectedIndexes": [array of 0-based indexes to reject]}. Only reject images with a genuine, clear mismatch — when in doubt about garment-vs-not, reject rather than keep, since this product must never show non-clothing items as if they were outfit results.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Review these ${dresses.length} images (numbered 0 to ${dresses.length - 1} in order). Titles for context: ${dresses.map((d, i) => `${i}: "${d.title}"`).join("; ")}` },
            ...dresses.map((d) => ({ type: "image_url" as const, image_url: { url: d.imageUrl } })),
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "image_relevance_check",
          strict: true,
          schema: {
            type: "object",
            properties: { rejectedIndexes: { type: "array", items: { type: "integer" } } },
            required: ["rejectedIndexes"],
            additionalProperties: false,
          },
        },
      },
      // Raised from 500 to 1500 — confirmed live this was too low: a real
      // production call returned finish_reason "length" with genuinely
      // empty content, meaning gpt-5.5's internal reasoning over ~12
      // images consumed the entire budget before any visible JSON output
      // could be emitted. Same root cause and fix pattern as try-on.ts's
      // writeTryOnAddendum and generate-image.ts's writeStylingAddendum
      // (see CLAUDE.md) — gpt-5.5 is a reasoning-model-family model whose
      // internal reasoning tokens count against this same budget. This
      // call reasons over MORE images than those two calls reason over
      // fields, so it needs comparable or more headroom, not less.
      max_completion_tokens: 1500,
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      logger.warn({ finishReason: completion.choices[0]?.finish_reason }, "Image relevance check returned empty content; keeping all candidates");
      return dresses;
    }
    const { rejectedIndexes } = JSON.parse(raw) as { rejectedIndexes: number[] };
    const rejectedSet = new Set(rejectedIndexes);
    if (rejectedSet.size > 0) {
      logger.info({ rejected: dresses.filter((_, i) => rejectedSet.has(i)).map((d) => d.title) }, "Image relevance check rejected mismatched dress photos");
    }
    return dresses.filter((_, i) => !rejectedSet.has(i));
  } catch (err) {
    logger.warn({ err }, "Image relevance check failed; keeping all candidates");
    return dresses;
  }
}

/** Interleaves several arrays round-robin (a,b,c, a,b,c, ...) instead of concatenating them, so the merged list alternates sites/colours instead of running all of one site's cards before the next. */
function interleave<T>(lists: T[][]): T[] {
  const merged: T[] = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) if (list[i] !== undefined) merged.push(list[i]);
  }
  return merged;
}

/**
 * Core search pipeline shared by /search-dresses, /search-dresses/research,
 * and /search-dresses/refine — all three do the same fan-out-search ->
 * build-cards -> filter -> dedupe pipeline, differing only in how the
 * per-task query is built (plain profile-driven vs. memory/refinement-aware
 * — see buildSearchQuery's `memory` parameter) and in how many candidates
 * get excluded up front (memory.seenTitles/rejected for research/refine).
 * Pulled into one function specifically so "Research Again"/"Refine" reuse
 * every already-verified filtering layer (domain denylist, text relevance,
 * vision check) rather than duplicating this pipeline three times.
 */
async function runDressSearch(
  profile: SkinTuneProfile,
  offset: number,
  limit: number,
  memory?: { refinement?: string; avoidTitles?: string[] },
): Promise<{ dresses: DressResult[]; shopLinks: ShopLink[] }> {
  const provider = getSearchProvider();
  const page = Math.floor(offset / limit);

  // One task per site (see SHOPPING_SITES), each also varying colour and
  // style across the user's own lists — see buildQueryPlan's doc comment
  // for why this replaced a single unscoped query (it was the root cause
  // of both "only one site" and "only one colour" being reported live).
  //
  // Task COUNT is provider-dependent — confirmed live (Render logs, first
  // production deploys after the OpenAI web-search provider became the
  // default): a full search taking 3-5+ MINUTES, because each of the 6
  // parallel tasks was its own OpenAI Responses API call that has to
  // actually RUN the web_search tool (real multi-page browsing) before
  // returning — a fundamentally heavier operation per call than Tavily's
  // single direct-search-API request. Running 6 of these in parallel
  // doesn't cost 6x latency in theory, but in practice measured far worse
  // than Tavily's equivalent 6-way fan-out ever did on this same route.
  // Cutting task count for the OpenAI provider specifically (not touching
  // Tavily's, which was already fast at 6) trades a little site/colour
  // variety for a search that actually completes in a reasonable time —
  // if this is ever reported as still too slow, cut this further before
  // assuming something else is wrong; the model call itself is the cost,
  // not this route's own logic.
  const taskCount = provider.name === "openai-web-search" ? 3 : SHOPPING_SITES.length;
  const tasks = buildQueryPlan(profile, page, taskCount);
  const perTaskLimit = Math.max(2, Math.ceil((limit * 2) / tasks.length));

  const taskResults = await Promise.allSettled(
    tasks.map(async (task) => {
      const query = buildSearchQuery(profile, task.colour, task.style, memory);
      const { images, pages } = await provider.search(query, perTaskLimit * 2, [task.site]);
      return { task, images, pages };
    }),
  );

  const perTaskCards: DressResult[][] = [];
  const allPages: SearchPageResult[] = [];
  // Collected so that if EVERY task fails, the actual per-task reasons (a
  // real provider error message, not a generic string) can be surfaced in
  // the thrown error below — see that error's own comment for why this
  // matters: without it, genuinely different root causes (an invalid/
  // expired API key, a provider's own usage-cap error, a query that
  // returns zero results) were all indistinguishable from the frontend and
  // from this route's own logs alike.
  const taskFailureReasons: string[] = [];
  for (const outcome of taskResults) {
    if (outcome.status === "rejected") {
      logger.warn({ err: outcome.reason, provider: provider.name }, "One per-site dress search task failed; continuing with the others");
      const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      taskFailureReasons.push(reason);
      continue;
    }
    const { images, pages } = outcome.value;
    perTaskCards.push(buildDressCards(images, profile, perTaskLimit, 0));
    allPages.push(...pages);
  }

  // Interleave so the grid alternates across tasks (site/colour/style
  // combinations) instead of running all of one task's cards before the
  // next, de-duplicate by image URL (different tasks can surface the same
  // photo, especially when several fall back to the same well-indexed
  // site) AND by title (memory.avoidTitles — see this branch's product
  // spec's "Research Again must find NEW products" requirement; excluding
  // by title here is a deterministic, cheap backstop alongside the
  // query-level `(not: ...)` hint, which is only ever a soft steer, not a
  // guarantee, for either search provider). Collect a few more than
  // `limit` here (candidate buffer) since the image-content check below
  // can reject some of them — without the buffer, every rejection would
  // just shrink the final page instead of being backfilled.
  const seenImageUrls = new Set<string>();
  const avoidTitlesLower = new Set((memory?.avoidTitles ?? []).map((t) => t.toLowerCase()));
  const candidates: DressResult[] = [];
  const candidateBuffer = limit + 6;
  for (const dress of interleave(perTaskCards)) {
    if (candidates.length >= candidateBuffer) break;
    if (seenImageUrls.has(dress.imageUrl)) continue;
    if (avoidTitlesLower.has(dress.title.toLowerCase())) continue;
    seenImageUrls.add(dress.imageUrl);
    candidates.push(dress);
  }
  // See filterByImageContent's doc comment: text filtering can't catch a
  // mismatch that's only visible in the photo itself (e.g. a title saying
  // "men's suit" whose actual photo shows a bride and groom together) —
  // this is a live-reported real bug, not speculative.
  const visuallyChecked = await filterByImageContent(candidates, profile);
  const merged = visuallyChecked.slice(0, limit);
  const dresses: DressResult[] = merged.map((dress, i) => ({ ...dress, id: `dress-${offset + i + 1}` }));
  const shopLinks = buildShopLinks(allPages, profile, 8);

  if (dresses.length === 0) {
    // Include the REAL per-task failure reasons (a genuine provider error
    // message, e.g. a 401 invalid-key or a usage-cap response) when every
    // task actually failed, rather than only this generic sentence — a
    // real, live-reported gap: this message used to be identical whether
    // the cause was an invalid/expired API key, a provider's own usage
    // cap, or a genuinely zero-result query, making it impossible to tell
    // which from the frontend (or without separately pulling server logs)
    // every time this was reported.
    const detail = taskFailureReasons.length
      ? ` Per-site errors: ${taskFailureReasons.join(" | ")}`
      : " Every per-site task completed but returned zero usable results after filtering — this points at the search query/filters themselves, not a provider-side error.";
    throw new Error(
      `No real dress results found across any site for this search — every per-site task returned nothing usable.${detail}`,
    );
  }

  return { dresses, shopLinks };
}

export { runDressSearch };

export function collectAvoidTitles(memory: SessionMemory): string[] {
  return [...memory.seenTitles, ...memory.rejected.map((r) => r.title)];
}
