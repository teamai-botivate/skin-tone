import assert from "node:assert/strict";
import { logger } from "../src/lib/logger";
import {
  extractPriceFromSnippet,
  guessBrandFromTitle,
  isOutfitColorMismatch,
  planRequirementSpecs,
  prioritizeGarmentQuery,
} from "../src/lib/product-search";
logger.level = "fatal";

// Regression: every garment (not just sarees) is searched by its own design, then colour,
// then fabric — for women, men, boys and girls — even when the look's pieces have bare
// names like "Dress" or "Boys Kurta".

const profileOf = (gender: string, ageGroup: string, pronouns: string, style: string[], occasion: string): any => ({
  gender, ageGroup, pronouns, appearance: { skinTone: "Medium", undertone: "Warm" },
  style, colorsLove: [], colorsAvoid: [], occasion,
});

function plan(profile: any, persona: any, outfit: string, pieces: any[]) {
  const look: any = { id: "t", title: "t", outfit, outfitColor: outfit.split(/,| with /)[0], palette: [], pieces };
  return planRequirementSpecs(look, profile, persona, ["outfit"]).filter((s) => s.category === "outfit");
}

const beforeQuery = (q: string, a: RegExp, b: RegExp) => {
  const ia = q.search(a);
  const ib = q.search(b);
  assert.ok(ia >= 0 && ib >= 0 && ia < ib, `${a} comes before ${b} in "${q}"`);
};

// Boys: bare "Boys Kurta" gets the look's design, colour and fabric
{
  const specs = plan(
    profileOf("boy", "6–10", "Kids / Boys styling", ["Traditional"], "Festival"), "child",
    "Boys mustard yellow angrakha-style cotton kurta with gold buttons, paired with off-white cotton pyjama",
    [{ category: "Top", name: "Boys Kurta", detail: "" }, { category: "Bottom", name: "Boys Pyjama", detail: "" }],
  );
  const kurta = specs.find((s) => s.itemSubcategory === "kurta")!;
  assert.equal(kurta.dominantColor, "Mustard");
  assert.match(kurta.itemTitle, /^Boys .*mustard.*cotton Kurta$/i);
  beforeQuery(kurta.searchQuery, /angrakha/i, /mustard/i);
  beforeQuery(kurta.searchQuery, /mustard/i, /cotton/i);
  const pyjama = specs.find((s) => s.itemSubcategory === "ethnic_bottom")!;
  assert.equal(pyjama.dominantColor, "Off-White", "the pyjama keeps its own colour, not the kurta's");
}

// Girls: a one-piece look parsed from the outfit sentence keeps "puff sleeves"
{
  const [dress] = plan(
    profileOf("girl", "6–10", "Kids / Girls styling", ["Party"], "Birthday"), "child",
    "Blush pink tiered tulle party dress with puff sleeves",
    [{ category: "Outfit", name: "Dress", detail: "" }, { category: "Footwear", name: "Ballerinas", detail: "" }],
  );
  assert.equal(dress.dominantColor, "Blush Pink");
  assert.match(dress.searchQuery, /^girls tiered puff sleeve Blush Pink net/i);
}

// Men: each garment keeps its own colour/fabric; a polo's words never leak into the jacket
{
  const specs = plan(
    profileOf("male", "25–34", "he/him/men", ["Classic"], "Office"), "man",
    "Sky blue slim fit cotton oxford shirt, paired with charcoal grey pleated wool trousers",
    [{ category: "Top", name: "Shirt", detail: "Crisp" }, { category: "Bottom", name: "Trousers", detail: "" }],
  );
  const trousers = specs.find((s) => s.itemSubcategory === "trousers")!;
  assert.equal(trousers.dominantColor, "Charcoal");
  assert.match(trousers.searchQuery, /pleated/i);
  assert.match(trousers.searchQuery, /wool/i);
  assert.equal(trousers.materialHint, "Tailored Suiting Crepe / Wool Blend", "fabric hint from the trousers, not the cotton shirt");

  const jacketSpecs = plan(
    profileOf("male", "25–34", "he/him/men", ["Festive"], "Festive"), "man",
    "Sky Blue Nehru Jacket with Maroon Knit Polo and Beige Stretch Chinos",
    [
      { category: "Layer", name: "Sky Blue Nehru Jacket", detail: "" },
      { category: "Top", name: "Maroon Knit Polo", detail: "" },
      { category: "Bottom", name: "Beige Stretch Chinos", detail: "" },
    ],
  );
  const jacket = jacketSpecs.find((s) => /jacket/i.test(s.itemTitle))!;
  assert.doesNotMatch(jacket.searchQuery, /\b(knit|polo|maroon)\b/i, `jacket query stays the jacket: "${jacket.searchQuery}"`);
}

// Women (western): design → colour → fabric
{
  const [dress] = plan(
    profileOf("female", "25–34", "she/her/women", ["Chic"], "Date night"), "woman",
    "Emerald green satin one-shoulder midi dress with a thigh slit",
    [{ category: "Outfit", name: "Dress", detail: "" }, { category: "Footwear", name: "Heels", detail: "" }],
  );
  assert.equal(dress.dominantColor, "Emerald Green");
  assert.match(dress.itemTitle, /emerald green satin one-shoulder midi dress/i);
}

// The reorder never drops words and adds only what is missing
assert.equal(
  prioritizeGarmentQuery("boys Royal Blue festive kurta set Myntra", { design: ["embroidered"], fabric: "silk" }, "Royal Blue"),
  "boys embroidered Royal Blue silk festive kurta set Myntra",
);

// Coral is a real colour: black / silver sarees are not shown for a coral look
assert.equal(isOutfitColorMismatch("Black Organza, Jersey Crystals Luna Pre-draped Saree Set", "Coral"), true);
assert.equal(isOutfitColorMismatch("Silver Net Crystals Square Neck Pre-draped Saree", "Coral"), true);
assert.equal(isOutfitColorMismatch("Coral Pink Hand Embroidered Pre-Draped Saree", "Coral"), false);
assert.equal(isOutfitColorMismatch("Peach Embellished Cape Saree", "Coral"), false);
assert.equal(isOutfitColorMismatch("Mauve Pre Draped Saree Set With Embellished High Neck Blouse", "Coral"), true);
assert.equal(guessBrandFromTitle("Mauve Pre Draped Saree Set", "Kalki Fashion"), "Kalki Fashion");

// A cape-saree is a saree (not a cape/shrug), searched without "shrug"
{
  const specs = plan(
    profileOf("female", "25–34", "she/her/women", ["Indo-Western Fusion"], "Cocktail"), "woman",
    "Embellished coral draped cape-saree with a sequinned coral bustier blouse",
    [
      { category: "Outfit", name: "Embellished Coral draped cape-saree", detail: "Pre-draped with attached sheer cape" },
      { category: "Top", name: "Coral sequinned bustier blouse", detail: "Sweetheart neckline" },
    ],
  );
  const saree = specs.find((s) => /cape-saree/i.test(s.itemTitle))!;
  assert.equal(saree.itemSubcategory, "saree");
  assert.doesNotMatch(saree.searchQuery, /shrug|aza|pernia/i, `saree query: "${saree.searchQuery}"`);
  assert.ok(saree.preferredRetailers.includes("Aza Fashions"), "Aza still offered as a store-search link");
}

// Search-result titles: a colour is never the brand; a designer after "by" is
assert.equal(guessBrandFromTitle("Black Organza Pre-draped Saree Set", "Aza Fashions"), "Aza Fashions");
assert.equal(guessBrandFromTitle("Coral Pre-Draped Saree For Women by Garima Karwariya Designs", "Aza Fashions"), "Garima Karwariya Designs");
assert.equal(guessBrandFromTitle("Biba Women Pink Anarkali", "Myntra"), "Biba");

// Promo banners are not prices
assert.equal(extractPriceFromSnippet("Free shipping on orders above ₹2,000. Coral saree ₹29,680"), 29680);
assert.equal(extractPriceFromSnippet("Flat ₹500 off on first order"), undefined);
assert.equal(extractPriceFromSnippet("Kasee silk saree Rs. 1,293"), 1293);

// Mumkins is offered for every kids outfit, not only ethnic ones
{
  const [dress] = plan(
    profileOf("girl", "6–10", "Kids / Girls styling", ["Party"], "Birthday"), "child",
    "Blush pink tiered tulle party dress with puff sleeves",
    [{ category: "Outfit", name: "Dress", detail: "" }],
  );
  assert.ok(dress.preferredRetailers.includes("Mumkins"), `Mumkins in ${dress.preferredRetailers}`);
}

console.log("outfit attribute matching (all audiences): all assertions passed");
