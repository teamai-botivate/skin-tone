import { z } from "zod";

export const LetStyleProfileSchema = z.object({
  name: z.string().optional().default(''),
  pronouns: z.string().optional().default(''),
  ageGroup: z.string().optional().default(''),
  height: z.string().optional().default(''),
  photoUrl: z.string().optional().default(''),
  bodyPhotoUrl: z.string().optional().default(''),
  appearance: z
    .object({
      skinTone: z.string().optional().default(''),
      undertone: z.string().optional().default(''),
      confidence: z.number().optional().default(0),
      contrast: z.string().optional().default('Medium'),
    })
    .optional()
    .default({ skinTone: '', undertone: '', confidence: 0, contrast: 'Medium' }),
  bodyBuild: z.string().optional().default(''),
  fit: z.string().optional().default(''),
  style: z.array(z.string()).optional().default([]),
  colorsLove: z.array(z.string()).optional().default([]),
  colorsAvoid: z.array(z.string()).optional().default([]),
  restrictions: z.array(z.string()).optional().default([]),
  occasion: z.string().optional().default(''),
  impression: z.array(z.string()).optional().default([]),
  budget: z.string().optional().default(''),
  customStyleNotes: z.string().optional().default(''),
});
export type LetStyleProfile = z.infer<typeof LetStyleProfileSchema>;

export const SkinTuneProfileSchema = LetStyleProfileSchema;
export type SkinTuneProfile = LetStyleProfile;

export const LookPieceSchema = z.object({
  category: z.string().optional().default('outfit'),
  name: z.string().optional().default(''),
  detail: z.string().optional().default(''),
});

export const LookRecommendationSchema = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string().optional().default(''),
  category: z.string().optional().default(''),
  vibe: z.string().optional().default(''),
  personaEnergy: z.string().optional().default(''),
  palette: z.array(z.string()).optional().default([]),
  pieces: z.array(LookPieceSchema).optional().default([]),
  outfit: z.string().optional().default(''),
  outfitColor: z.string().optional().default(''),
  jewellery: z.string().optional().default(''),
  hairstyle: z.string().optional().default(''),
  makeup: z.string().optional().default(''),
  accessories: z.string().optional().default(''),
  footwear: z.string().optional().default(''),
  reasoning: z.array(z.string()).optional().default([]),
  confidence: z.number().optional().default(90),
  imageUrl: z.string().optional().default(''),
  applicableCategories: z.array(z.string()).optional().default([]),
});
export type LookRecommendation = z.infer<typeof LookRecommendationSchema>;

export const OccasionContextSchema = z.object({
  occasion: z.string(),
  details: z.string(),
});

// ---- /api/product-recommendations ----

export const ProductCategorySchema = z.enum([
  "outfit",
  "makeup",
  "jewellery",
  "accessories",
  "footwear",
]);
export type ProductCategory = z.infer<typeof ProductCategorySchema>;

export const PriceTierSchema = z.enum(["budget", "mid", "premium"]);
export type PriceTier = z.infer<typeof PriceTierSchema>;

export const ProductResultSchema = z.object({
  id: z.string(),
  category: ProductCategorySchema,
  subcategory: z.string(),
  recommendedItemTitle: z.string().optional(),
  brand: z.string(),
  productName: z.string(),
  retailer: z.string(),
  price: z.number().optional(),
  formattedPrice: z.string().optional(),
  originalPrice: z.number().optional(),
  formattedOriginalPrice: z.string().optional(),
  currency: z.string().default("INR"),
  priceTier: PriceTierSchema.optional(),
  priceVerified: z.boolean().default(false),
  productVerified: z.boolean().default(false),
  shade: z.string().optional(),
  color: z.string().optional(),
  itemType: z.string().optional(),
  targetGender: z.enum(["women", "men", "child", "unisex"]).optional(),
  style: z.string().optional(),
  occasion: z.string().optional(),
  material: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  productUrl: z.string().url(),
  urlType: z.enum(["exact_product", "search_result"]).default("exact_product"),
  isVerified: z.boolean().optional(),
  matchScore: z.number().min(0).max(100).optional(),
  matchConfidence: z.number().min(0).max(100).optional(),
  matchReason: z.string(),
  availability: z.string().optional(),
  source: z.string().optional(),
  lastChecked: z.string().optional(),
});
export type ProductResult = z.infer<typeof ProductResultSchema>;

export const ProductGroupSchema = z.object({
  category: ProductCategorySchema,
  recommendedItemTitle: z.string(),
  stylingRequirement: z.string(),
  products: z.array(ProductResultSchema),
});
export type ProductGroup = z.infer<typeof ProductGroupSchema>;

export const ProductRecommendationsRequestSchema = z.object({
  look: LookRecommendationSchema,
  profile: SkinTuneProfileSchema,
  category: z.enum(["outfit", "makeup", "jewellery", "accessories", "footwear", "all"]).optional(),
  forceRefresh: z.boolean().optional(),
});
export type ProductRecommendationsRequest = z.infer<typeof ProductRecommendationsRequestSchema>;

export const KeyDiagnosticSchema = z.object({
  provider: z.string(),
  status: z.enum(["ok", "missing_key", "invalid_key", "rate_limited", "timeout", "degraded", "error"]),
  keyName: z.string().optional(),
  message: z.string(),
  suggestedFix: z.string().optional(),
});
export type KeyDiagnostic = z.infer<typeof KeyDiagnosticSchema>;

export const ProductRecommendationsResponseSchema = z.object({
  lookId: z.string(),
  persona: z.enum(["woman", "man", "child", "neutral"]),
  applicableCategories: z.array(z.string()),
  products: z.array(ProductResultSchema),
  groups: z.array(ProductGroupSchema).optional(),
  status: z.enum(["success", "partial", "unavailable"]),
  disclaimer: z.string().optional(),
  searchedAt: z.string(),
  totalFound: z.number(),
  diagnostics: z.array(KeyDiagnosticSchema).optional(),
  errorMessage: z.string().optional(),
});
export type ProductRecommendationsResponse = z.infer<typeof ProductRecommendationsResponseSchema>;

// ---- /api/recommendations ----

export const RecommendationsRequestSchema = z.object({
  profile: SkinTuneProfileSchema,
});

export const RecommendationsResponseSchema = z.object({
  recommendations: z.array(LookRecommendationSchema).length(5),
});

// ---- /api/generate-image ----

export const GenerateImageRequestSchema = z.object({
  look: LookRecommendationSchema,
  profile: SkinTuneProfileSchema,
  context: OccasionContextSchema,
  photoUrl: z.string().optional(),
  siblingVibes: z.array(z.string()).optional(),
});

export const GenerateImageResponseSchema = z.object({
  look: LookRecommendationSchema,
});

// ---- /api/refine-image ----

export const RefineImageRequestSchema = z.object({
  look: LookRecommendationSchema,
  profile: SkinTuneProfileSchema,
  context: OccasionContextSchema,
  photoUrl: z.string().optional(),
  customization: z.string().min(1).max(500),
});

export const RefineImageResponseSchema = z.object({
  look: LookRecommendationSchema,
});

// ---- /api/analyze-photo ----

export const AnalyzePhotoRequestSchema = z.object({
  photoUrl: z.string().min(1),
});

export const PhotoAnalysisStatusSchema = z.enum([
  "good",
  "low-light",
  "warm-light",
  "blurry",
  "angle",
  "filter",
  "occluded",
  "low-confidence",
]);

export const AnalyzePhotoResponseSchema = z.object({
  status: PhotoAnalysisStatusSchema,
  skinTone: z.string(),
  undertone: z.string(),
  confidence: z.number().min(0).max(100),
  contrast: z.string(),
});
export type AnalyzePhotoResponse = z.infer<typeof AnalyzePhotoResponseSchema>;

// ---- /api/search-dresses ----

export const DressResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  imageUrl: z.string(),
  siteName: z.string(),
  sourceUrl: z.string(),
});
export type DressResult = z.infer<typeof DressResultSchema>;

export const ShopLinkSchema = z.object({
  title: z.string(),
  url: z.string(),
  siteName: z.string(),
  price: z.string().optional(),
});
export type ShopLink = z.infer<typeof ShopLinkSchema>;

export const SearchDressesRequestSchema = z.object({
  profile: SkinTuneProfileSchema,
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(20).default(10),
});

export const SearchDressesResponseSchema = z.object({
  results: z.array(DressResultSchema),
  shopLinks: z.array(ShopLinkSchema),
  hasMore: z.boolean(),
});

// ---- /api/try-on ----

export const TryOnRequestSchema = z.object({
  dress: DressResultSchema,
  profile: SkinTuneProfileSchema,
  photoUrl: z.string().min(1),
});

export const TryOnResponseSchema = z.object({
  imageUrl: z.string(),
});

// ---- /api/avatar ----

export const AvatarCreateRequestSchema = z.object({
  photoUrl: z.string().min(1),
  profile: SkinTuneProfileSchema,
});

export const AvatarSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  createdAt: z.string(),
  active: z.boolean(),
});
export type Avatar = z.infer<typeof AvatarSchema>;

export const AvatarCreateResponseSchema = z.object({
  avatar: AvatarSchema,
});

// ---- /api/products/feedback ----

export const ProductFeedbackTypeSchema = z.enum(["INTERESTED", "NOT_INTERESTED"]);

export const ProductFeedbackRequestSchema = z.object({
  dress: DressResultSchema,
  feedbackType: ProductFeedbackTypeSchema,
  reason: z.string().optional(),
  sessionId: z.string().optional(),
});

// ---- session-aware search ----

export const SessionMemorySchema = z.object({
  seenTitles: z.array(z.string()).default([]),
  rejected: z.array(z.object({ title: z.string(), reason: z.string().optional() })).default([]),
  interested: z.array(z.string()).default([]),
});
export type SessionMemory = z.infer<typeof SessionMemorySchema>;

export const ResearchAgainRequestSchema = z.object({
  profile: SkinTuneProfileSchema,
  limit: z.number().int().min(1).max(20).default(10),
  memory: SessionMemorySchema,
});

export const RefineSearchRequestSchema = z.object({
  profile: SkinTuneProfileSchema,
  limit: z.number().int().min(1).max(20).default(10),
  memory: SessionMemorySchema,
  refinement: z.string().min(1).max(300),
});
