import {
  RecommendationsRequestSchema,
  RecommendationsResponseSchema,
  type LookRecommendation,
} from "@/lib/skintune-schemas";
import { getOpenAIClient } from "@/lib/openai-client";
import { generateLookRecommendations } from "@/lib/recommendation-prompt";

import { executePaidOperation, CREDIT_COSTS } from "@/lib/credits";

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
      const { looks } = await generateLookRecommendations(getOpenAIClient(), data.profile);
      const recommendations: LookRecommendation[] = looks.map((look) => ({
        ...look,
        imageUrl: "/replace-with-generated/pending.webp",
      }));

      return RecommendationsResponseSchema.parse({ recommendations });
    },
  );
}
