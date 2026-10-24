import { AvatarCreateRequestSchema, AvatarCreateResponseSchema, type Avatar } from "@/lib/skintune-schemas";
import { getVtoProvider } from "@/lib/providers/vto";
import { randomUUID } from "node:crypto";
import { executePaidOperation, CREDIT_COSTS } from "@/lib/credits";

export async function POST(req: Request) {
  return await executePaidOperation(
    req,
    {
      cost: CREDIT_COSTS.AVATAR_CREATE,
      operationType: "avatar_create",
      schema: AvatarCreateRequestSchema,
      description: "Styling avatar creation",
    },
    async (data) => {
      const { photoUrl, profile } = data;
      const provider = getVtoProvider();
      const imageUrl = await provider.generateAvatar({ photoUrl, bodyBuild: profile.bodyBuild });

      const avatar: Avatar = {
        id: randomUUID(),
        imageUrl,
        createdAt: new Date().toISOString(),
        active: true,
      };

      return AvatarCreateResponseSchema.parse({ avatar });
    },
  );
}
