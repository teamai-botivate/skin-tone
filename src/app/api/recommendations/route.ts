import {
  RecommendationsRequestSchema,
  RecommendationsResponseSchema,
  type LookRecommendation,
} from "@/lib/skintune-schemas";
import { getOpenAIClient } from "@/lib/openai-client";
import { attachStyleIntent, createFallbackStyleBrief, generateLookRecommendations } from "@/lib/recommendation-prompt";
import { generateFallbackLooks } from "@/features/recommendations/services/recommendation-engine";
import { logger } from "@/lib/logger";

import { executePaidOperation, CREDIT_COSTS } from "@/lib/credits";

export const maxDuration = 300;

export async function POST(req: Request) {
  return await executePaidOperation(
    req,
    {
      cost: CREDIT_COSTS.RECOMMENDATIONS,
      operationType: "recommendations",
      schema: RecommendationsRequestSchema,
      description: "5 complete-look styling recommendations",
    },
    async (data) => {
      let recommendations: LookRecommendation[];
      try {
        const { looks: generated, styleBrief } = await generateLookRecommendations(getOpenAIClient(), data.profile);
        const looks = attachStyleIntent(generated, styleBrief);
        recommendations = looks.map((look) => ({
          ...look,
          imageUrl: "/replace-with-generated/pending.webp",
        }));
      } catch (err) {
        logger.warn({ err }, "Direct AI recommendations call failed; falling back to curated dynamic looks");
        const fallback = generateFallbackLooks(data.profile);
        const brief = createFallbackStyleBrief(data.profile);
        recommendations = attachStyleIntent(fallback, brief).map((look) => ({
          ...look,
          category: look.category || "",
          vibe: look.vibe || "Curated",
          personaEnergy: look.personaEnergy || "Sophisticated and polished",
          applicableCategories: look.applicableCategories || ["outfit", "footwear", "accessories"],
          imageUrl: "/replace-with-generated/pending.webp",
        }));
      }

      return RecommendationsResponseSchema.parse({ recommendations });
    },
  );
}
