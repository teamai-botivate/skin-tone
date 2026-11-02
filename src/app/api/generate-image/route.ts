import {
  GenerateImageRequestSchema,
  GenerateImageResponseSchema,
} from "@/lib/skintune-schemas";
import { generateLookImage } from "@/lib/server-image-generation";
import { executePaidOperation, CREDIT_COSTS } from "@/lib/credits";

// The prompt agent, provider calls and fallbacks live in
// src/lib/server-image-generation.ts so the background job runner
// (src/lib/generation-jobs.ts) reuses exactly the same pipeline.

export async function POST(req: Request) {
  return await executePaidOperation(
    req,
    {
      cost: CREDIT_COSTS.GENERATE_IMAGE,
      operationType: "generate_image",
      schema: GenerateImageRequestSchema,
      getOperationId: (data) => data.look.id,
      getDescription: (data) => `Visual generation for ${data.look.title}`,
    },
    async (data) => {
      const imageUrl = await generateLookImage(data);
      return GenerateImageResponseSchema.parse({ look: { ...data.look, imageUrl } });
    },
  );
}
