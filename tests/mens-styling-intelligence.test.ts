import assert from "node:assert/strict";
import { logger } from "../src/lib/logger";
import {
  SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  buildUserPrompt,
} from "../src/lib/recommendation-prompt";
import {
  generateFallbackLooks,
} from "../src/features/recommendations/services/recommendation-engine";
import {
  buildLookEditPrompt,
} from "../src/lib/image-prompt";
import { getStylingContext } from "../src/lib/styling-context";
import type { SkinTuneProfile, LookRecommendation } from "../src/lib/skintune-schemas";

logger.level = "fatal";

console.log("======================================================================");
console.log("MEN'S STYLING INTELLIGENCE: COHESION, OCCASION, AESTHETIC & FIT TESTS");
console.log("======================================================================");

// -----------------------------------------------------------------------------
// Helper Profile Builders
// -----------------------------------------------------------------------------
function makeMenProfile(overrides: Partial<SkinTuneProfile> = {}): SkinTuneProfile {
  return {
    name: "Arjun",
    pronouns: "he/him/men",
    gender: "men",
    ageGroup: "25–34",
    height: "5ft 11in",
    photoUrl: "",
    bodyPhotoUrl: "",
    appearance: {
      skinTone: "Medium",
      undertone: "Warm",
      confidence: 95,
      contrast: "Medium",
    },
    bodyBuild: "Athletic",
    fit: "Tailored",
    style: ["Smart Casual"],
    colorsLove: ["Navy", "Olive", "Terracotta"],
    colorsAvoid: ["Hot Pink"],
    restrictions: [],
    occasion: "Office",
    impression: ["Polished", "Authoritative"],
    budget: "₹5K–₹10K",
    customStyleNotes: "",
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Test 1: System Prompt Menswear Expertise & Reviewer Quality Audit
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Verifying System Prompt Menswear Expertise & Reviewer Checklists...");
{
  assert.ok(
    SYSTEM_PROMPT.includes("MENSWEAR STYLING EXPERTISE"),
    "System prompt must contain dedicated MENSWEAR STYLING EXPERTISE section",
  );
  assert.ok(
    SYSTEM_PROMPT.includes("DYNAMIC AESTHETIC UNIVERSES"),
    "System prompt must articulate dynamic aesthetic universes for men",
  );
  assert.ok(
    /Minimal:/.test(SYSTEM_PROMPT) && /Smart Casual:/.test(SYSTEM_PROMPT) && /Formal \/ Business:/.test(SYSTEM_PROMPT) &&
    /Streetwear:/.test(SYSTEM_PROMPT) && /Old Money:/.test(SYSTEM_PROMPT) && /Indian traditional & festive/.test(SYSTEM_PROMPT),
    "System prompt must describe the principles of each requested menswear aesthetic",
  );
  assert.ok(
    /Any other aesthetic the user names: work out its principles/.test(SYSTEM_PROMPT),
    "Aesthetics are interpreted dynamically, not mapped to a fixed list",
  );
  assert.ok(
    /describe qualities, not outfits to copy/.test(SYSTEM_PROMPT) && /There is no fixed slot or template per look/.test(SYSTEM_PROMPT),
    "The prompt must not prescribe outfits or per-look templates",
  );
  const menSection = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf("MENSWEAR STYLING EXPERTISE"), SYSTEM_PROMPT.indexOf("AUDIENCE & DEMOGRAPHIC INTEGRITY"));
  assert.ok(
    !new RegExp("(^|[^a-z])(bandhgala|sherwani|achkan|chelsea|loafers?|oxfords?|cargo|espadrilles?|polos?|blazers?|cuban)([^a-z]|$)", "i").test(menSection.split("shirt + chino trousers + loafers").join("").split("shirt + chinos + loafers").join("")),
    "The menswear guidance names no specific garments or shoes to copy",
  );
  assert.ok(
    SYSTEM_PROMPT.includes("HEAD-TO-TOE OUTFIT COHESION:"),
    "System prompt must mandate head-to-toe coordination of tops, bottoms, footwear, and accessories",
  );
  assert.ok(
    SYSTEM_PROMPT.includes("PROPORTIONS, BODY BUILD & FIT ADAPTATION"),
    "System prompt must guide styling adaptations for broad, lean, fuller, and athletic builds",
  );
  assert.ok(
    SYSTEM_PROMPT.includes("NEVER generate 5 repetitive variations of \"shirt + chino trousers + loafers\""),
    "System prompt must explicitly ban 5 repetitive shirt-and-chinos variations",
  );

  // Reviewer prompt audit
  assert.ok(
    REVIEW_SYSTEM_PROMPT.includes("When styling men, check menswear styling cohesion and aesthetic fidelity"),
    "Reviewer prompt must audit menswear cohesion and aesthetic fidelity",
  );
  assert.ok(
    REVIEW_SYSTEM_PROMPT.includes("no running shoes with formal suits"),
    "Reviewer prompt must prohibit mismatched footwear like running shoes with formal suits",
  );
  assert.ok(
    REVIEW_SYSTEM_PROMPT.includes("repeating identical shirt-and-chinos variations across the looks"),
    "Reviewer prompt must penalize repeating identical shirt-and-chinos looks for men",
  );

  console.log("✓ Test 1 Passed: System prompt and reviewer prompt contain deep menswear expertise and strict cohesion rules.");
}

// -----------------------------------------------------------------------------
// Test 2: User Prompt & Brief Construction for Men
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Verifying User Prompt & Styling Context Construction for Men...");
{
  const profile = makeMenProfile({
    customStyleNotes: "Need a classy old money aesthetic outfit with pleated trousers and loafers for a garden polo event",
    bodyBuild: "Broad",
    fit: "Relaxed",
  });

  const prompt = buildUserPrompt(profile);
  assert.ok(prompt.includes("Audience: MEN — Adult man"), "Audience must be labeled as MEN — Adult man");
  assert.ok(prompt.includes("Broad"), "User body build must be preserved in prompt");
  assert.ok(prompt.includes("Relaxed"), "User fit preference must be preserved in prompt");
  assert.ok(
    prompt.includes("classy old money aesthetic outfit with pleated trousers"),
    "Verbatim styling request must lead the user prompt",
  );

  const ctx = getStylingContext(profile);
  assert.equal(ctx.isMan, true);
  assert.equal(ctx.isWoman, false);
  assert.equal(ctx.isKids, false);
  assert.equal(ctx.audience, "men");

  console.log("✓ Test 2 Passed: User prompt and styling context preserve male demographic and styling parameters.");
}


// -----------------------------------------------------------------------------
// Test 3: Image Edit Prompt Masculine Integrity
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Verifying Image Edit Prompt Generation for Men...");
{
  const profile = makeMenProfile({
    bodyBuild: "Muscular",
    fit: "Tailored",
    occasion: "Wedding Ceremony",
  });
  const looks = generateFallbackLooks(profile);
  const look = {
    ...looks[0],
    category: looks[0].category || "outfit",
  } as LookRecommendation;

  const editPrompt = buildLookEditPrompt(
    look,
    profile,
    { occasion: "Wedding Ceremony", details: "Attending best friend's royal wedding as groomsman" },
    null,
  );

  assert.ok(
    editPrompt.includes("DEMOGRAPHIC INTEGRITY: The subject is an adult man"),
    "Edit prompt must contain adult male demographic instruction",
  );
  assert.ok(
    editPrompt.includes("Strictly masculine tailoring, natural masculine grooming, correct shoulder posture"),
    "Edit prompt must instruct on masculine tailoring and posture",
  );
  assert.ok(
    editPrompt.includes("COMPOSITION & FRAMING: Strictly compose this as a full-length, head-to-toe fashion editorial photograph"),
    "Edit prompt must enforce head-to-toe full length framing",
  );
  assert.ok(
    editPrompt.includes("WAIST BELTS ARE STRICTLY FORBIDDEN OVER ETHNIC TUNICS"),
    "Edit prompt must forbid belts over ethnic tunics for men",
  );
  assert.ok(
    editPrompt.includes("STRICTLY NO FEMININE JEWELLERY"),
    "Edit prompt must forbid feminine jewellery for men",
  );
  assert.ok(
    editPrompt.includes("Preserve their natural build (Muscular)"),
    "Edit prompt must preserve user's body build without alteration",
  );

  console.log("✓ Test 3 Passed: Image edit prompt generates masculine demographic instructions and full-length composition.");
}

// -----------------------------------------------------------------------------
// Test 4: Body Proportions, Fit & Skin Tone Harmony
// -----------------------------------------------------------------------------
console.log("\n[Test 4] Verifying Body Proportions, Fit Preferences & Skin Tone reach the model...");
{
  const builds: Array<SkinTuneProfile["bodyBuild"]> = ["Broad", "Athletic", "Lean", "Fuller"];
  const fits: Array<SkinTuneProfile["fit"]> = ["Tailored", "Relaxed", "Oversized", "Slim"];
  const tones = ["Fair", "Medium", "Rich Deep", "Warm Olive"];

  for (let i = 0; i < builds.length; i++) {
    const prof = makeMenProfile({
      bodyBuild: builds[i],
      fit: fits[i],
      appearance: {
        skinTone: tones[i],
        undertone: "Warm",
        confidence: 95,
        contrast: "Medium",
      },
      occasion: "Corporate Office",
    });

    const userPrompt = buildUserPrompt(prof);
    assert.ok(userPrompt.includes(builds[i]!), `Body build ${builds[i]} must be included in user prompt`);
    assert.ok(userPrompt.includes(fits[i]!), `Fit preference ${fits[i]} must be included in user prompt`);
    assert.ok(userPrompt.includes(tones[i]!), `Skin tone ${tones[i]} must be included in user prompt`);

  }
  console.log("✓ Test 4 Passed: Body build, fit preferences, and skin tone attributes flow seamlessly into styling prompts.");
}

// -----------------------------------------------------------------------------
// Test 5: Women's and Kids' Styling Regression Safety
// -----------------------------------------------------------------------------
console.log("\n[Test 5] Verifying Women's & Kids' Styling Pipelines Remain 100% Intact...");
{
  // 8A: Adult Woman (Saree / Garba)
  const womanProfile: SkinTuneProfile = {
    name: "Pooja",
    pronouns: "she/her/women",
    gender: "women",
    height: "5ft 4in",
    photoUrl: "",
    bodyPhotoUrl: "",
    ageGroup: "25–34",
    appearance: { skinTone: "Medium", undertone: "Warm", confidence: 95, contrast: "High" },
    bodyBuild: "Average",
    fit: "Regular",
    style: ["Traditional"],
    colorsLove: ["Pink"],
    colorsAvoid: [],
    restrictions: [],
    occasion: "Garba Night",
    impression: ["Festive"],
    budget: "₹3K–₹7K",
    customStyleNotes: "",
  };
  const womanLooks = generateFallbackLooks(womanProfile);
  assert.ok(womanLooks.length >= 1, "Must generate women's looks");
  const wLook = womanLooks[0];
  assert.ok(
    wLook.outfit.toLowerCase().includes("chaniya choli") || wLook.outfit.toLowerCase().includes("lehenga"),
    "Women's garba look must remain chaniya choli or lehenga",
  );
  assert.ok(wLook.jewellery.toLowerCase().includes("jhumka"), "Women's garba look must recommend jhumkas");
  assert.ok(wLook.accessories.toLowerCase().includes("potli"), "Women's garba look must recommend potli bag");
  assert.deepEqual(
    wLook.applicableCategories,
    ["outfit", "jewellery", "footwear", "accessories", "makeup"],
    "Women's categories must include makeup and jewellery",
  );

  // 8B: Young Boy Child
  const boyProfile: SkinTuneProfile = {
    name: "Aarav",
    pronouns: "he/him/boy",
    gender: "boy",
    height: "3ft 8in",
    photoUrl: "",
    bodyPhotoUrl: "",
    ageGroup: "Child",
    appearance: { skinTone: "Fair", undertone: "Cool", confidence: 95, contrast: "Medium" },
    bodyBuild: "Average",
    fit: "Regular",
    style: ["Casual"],
    colorsLove: ["Blue"],
    colorsAvoid: [],
    restrictions: [],
    occasion: "Casual Playground",
    impression: ["Playful"],
    budget: "₹2K–₹4K",
    customStyleNotes: "",
  };
  const boyLooks = generateFallbackLooks(boyProfile);
  assert.ok(boyLooks.length >= 1, "Must generate boy kidswear looks");
  const bLook = boyLooks[0];
  assert.match(bLook.makeup.toLowerCase(), /none|child-friendly/i, "Boy makeup must be none/child-friendly");
  assert.match(bLook.jewellery.toLowerCase(), /none/i, "Boy jewellery must be none");
  assert.deepEqual(bLook.applicableCategories, ["outfit", "footwear", "accessories"]);

  // 8C: Saree Expertise in System Prompt intact
  assert.ok(SYSTEM_PROMPT.includes("SAREE EXPERTISE"), "Saree expertise in system prompt must remain intact");
  assert.ok(SYSTEM_PROMPT.includes("Banarasi"), "Banarasi saree weave rule must remain intact");
  assert.ok(SYSTEM_PROMPT.includes("Kanjeevaram"), "Kanjeevaram saree weave rule must remain intact");

  console.log("✓ Test 5 Passed: Adult women and kidswear styling pipelines and saree expertise remain 100% unaffected.");
}

console.log("\n======================================================================");
console.log("ALL MEN'S STYLING INTELLIGENCE TEST SUITES PASSED! 👔✨");
console.log("======================================================================");
