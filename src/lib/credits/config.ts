/**
 * Free Credits & Operation Cost Configuration
 * 
 * All costs and allowances are centrally configured and server-controlled.
 * They can be overridden via environment variables in production.
 */

export const INITIAL_FREE_CREDITS = parseInt(process.env.INITIAL_FREE_CREDITS || "20", 10);

export const CREDIT_COSTS = {
  // Outfit / style recommendation generation (5 detailed looks with LLM JSON schema)
  RECOMMENDATIONS: parseInt(process.env.CREDIT_COST_RECOMMENDATIONS || "2", 10),

  // High-resolution look image generation (OpenAI Responses API or images.edit + prompt agent)
  GENERATE_IMAGE: parseInt(process.env.CREDIT_COST_GENERATE_IMAGE || "3", 10),

  // Look refinement image generation
  REFINE_IMAGE: parseInt(process.env.CREDIT_COST_REFINE_IMAGE || "3", 10),

  // Virtual Try-On generation
  TRY_ON: parseInt(process.env.CREDIT_COST_TRY_ON || "3", 10),

  // User avatar generation
  AVATAR_CREATE: parseInt(process.env.CREDIT_COST_AVATAR_CREATE || "3", 10),

  // Live dress search via Tavily / OpenAI Web Search
  SEARCH_DRESSES: parseInt(process.env.CREDIT_COST_SEARCH_DRESSES || "1", 10),
  SEARCH_DRESSES_RESEARCH: parseInt(process.env.CREDIT_COST_SEARCH_DRESSES_RESEARCH || "1", 10),
  SEARCH_DRESSES_REFINE: parseInt(process.env.CREDIT_COST_SEARCH_DRESSES_REFINE || "1", 10),

  // Live product search and matching for looks
  PRODUCT_RECOMMENDATIONS: parseInt(process.env.CREDIT_COST_PRODUCT_RECOMMENDATIONS || "1", 10),

  // Photo analysis with OpenAI Vision
  ANALYZE_PHOTO: parseInt(process.env.CREDIT_COST_ANALYZE_PHOTO || "1", 10),
} as const;

export type OperationType =
  | "initial_grant"
  | "recommendations"
  | "generate_image"
  | "refine_image"
  | "try_on"
  | "avatar_create"
  | "search_dresses"
  | "search_dresses_research"
  | "search_dresses_refine"
  | "product_recommendations"
  | "analyze_photo"
  | "refund";
