import { TryOnRequestSchema, TryOnResponseSchema } from "@/lib/skintune-schemas";
import { getVtoProvider } from "@/lib/providers/vto";
import { executePaidOperation, CREDIT_COSTS } from "@/lib/credits";

export async function POST(req: Request) {
  return await executePaidOperation(
    req,
    {
      cost: CREDIT_COSTS.TRY_ON,
      operationType: "try_on",
      schema: TryOnRequestSchema,
      description: "Virtual try-on",
    },
    async (data) => {
      const { dress, profile, photoUrl } = data;
      const provider = getVtoProvider();
      const imageUrl = await provider.generateTryOn({
        avatarImageUrl: photoUrl,
        garmentImageUrl: dress.imageUrl,
        context: {
          occasion: profile.occasion,
          bodyBuild: profile.bodyBuild,
          fit: profile.fit,
          pronouns: profile.pronouns,
          garmentTitle: dress.title,
          garmentSiteName: dress.siteName,
        },
      });

      return TryOnResponseSchema.parse({ imageUrl });
    },
  );
}
