import assert from "node:assert/strict";
import { logger } from "../src/lib/logger";
import {
  buildProductGroup,
  calculateOutfitSimilarity,
  checkProductConsistency,
  extractColorFromText,
  planRequirementSpecs,
} from "../src/lib/product-search";
import type { LookRecommendation, SkinTuneProfile } from "../src/lib/skintune-schemas";
logger.level = "fatal";

// Regression: a charcoal grey satin saree with gold embroidery was searched as "Women Gold
// Saree" with a white blouse, and Aza / Pernia's were never offered.

const profile = {
  name: "A", pronouns: "she/her/women", gender: "female", ageGroup: "25–34", height: "",
  photoUrl: "", bodyPhotoUrl: "",
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 90, contrast: "Medium" },
  bodyBuild: "", fit: "", style: ["Royal & Regal"], colorsLove: [], colorsAvoid: [], restrictions: [],
  occasion: "Wedding", impression: [], budget: "", customStyleNotes: "",
} as unknown as SkinTuneProfile;

const look = {
  id: "charcoal-beauty", title: "Charcoal Beauty",
  note: "A dramatic charcoal grey saree enriched with gold embroidery.",
  category: "outfit", vibe: "Regal", personaEnergy: "Poised",
  palette: ["#A9A9A9", "#C0C0C0", "#FFD700"],
  outfit: "Charcoal grey satin saree with gold embroidery, paired with a sleeveless charcoal satin blouse",
  outfitColor: "Charcoal grey with gold embroidery",
  pieces: [
    { category: "Outfit", name: "Saree", detail: "Charcoal grey satin with gold zari embroidered border" },
    { category: "Top", name: "Blouse", detail: "Sleeveless V-neck" },
    { category: "Jewellery", name: "Silver statement necklace", detail: "Bold" },
  ],
  jewellery: "Bold silver statement necklace and drop earrings", hairstyle: "Sleek straight", makeup: "Bold",
  accessories: "None", footwear: "Silver heels", reasoning: [], confidence: 90,
  applicableCategories: ["outfit"],
} as unknown as LookRecommendation;

assert.equal(extractColorFromText("Charcoal grey satin saree with gold embroidery"), "Charcoal");
assert.equal(extractColorFromText("Gold zari border on a black saree"), "Black");
assert.equal(extractColorFromText("Gold tissue saree"), "Gold");

const specs = planRequirementSpecs(look, profile, "woman", ["outfit"]).filter((s) => s.category === "outfit");
const saree = specs.find((s) => s.itemSubcategory === "saree");
const blouse = specs.find((s) => s.itemSubcategory === "inner_top");
console.log(specs.map((s) => [s.itemTitle, s.dominantColor, s.searchQuery]));
assert.ok(saree && blouse, "saree and blouse are both searched");
assert.equal(saree!.dominantColor, "Charcoal");
assert.match(saree!.itemTitle, /charcoal/i);
assert.match(saree!.itemTitle, /satin/i);
assert.match(saree!.searchQuery, /^women zari embroidered Charcoal grey satin saree /i, "design, then colour, then fabric");
assert.equal(blouse!.dominantColor, "Charcoal", "blouse matches the saree, never white");
assert.match(blouse!.searchQuery, /saree blouse/i);
assert.ok(saree!.preferredRetailers.includes("Aza Fashions"));
assert.ok(saree!.preferredRetailers.includes("Pernia's Pop-Up Shop"));

const links = buildProductGroup(saree!, []).retailerSearchLinks || [];
console.log(links.map((l) => l.url));
assert.ok(links.some((l) => l.retailer === "Aza Fashions"), "Aza store search offered");
assert.ok(links.some((l) => l.url.includes("perniaspopupshop.com/catalogsearch/result/?q=")), "Pernia's store search offered");
assert.ok(links.every((l) => !/gold/i.test(decodeURIComponent(l.url))), "links never search for a gold saree");

const check = (name: string, sp = blouse!) =>
  checkProductConsistency(name, "Brand", "outfit", "https://www.myntra.com/x/y/123/buy", undefined, "woman",
    sp.itemSubcategory, sp.dominantColor, undefined, 1000, "Wedding", undefined, "women", sp.itemTitle).isConsistent;
assert.equal(check("PUJIA MILLS White Embroidered Silk Saree Blouse"), false, "white blouse rejected");
assert.equal(check("Neerus Grey Embroidered Ready to Wear Lehenga & Blouse"), false, "lehenga set is not a blouse");
assert.equal(check("Charcoal Grey Sleeveless Satin Saree Blouse"), true);
assert.equal(check("Mustard Woven Banarasi Saree", saree!), false, "gold/yellow saree rejected");
assert.equal(check("Charcoal Grey Satin Saree with Gold Zari Embroidery", saree!), true);

const exact = calculateOutfitSimilarity({ productTitle: "Embroidered Charcoal Grey Satin Saree" }, look, saree!);
const colourOnly = calculateOutfitSimilarity({ productTitle: "Charcoal Grey Printed Georgette Saree" }, look, saree!);
const designOnly = calculateOutfitSimilarity({ productTitle: "Embroidered Satin Saree" }, look, saree!);
assert.ok(exact > colourOnly && exact > designOnly, `exact ${exact} > colour ${colourOnly}, design ${designOnly}`);

console.log("charcoal saree matching: all assertions passed");
