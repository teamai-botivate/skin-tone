export interface AvatarGenerationInput {
  photoUrl: string;
  bodyBuild?: string;
}

export interface TryOnGenerationInput {
  avatarImageUrl: string;
  garmentImageUrl: string;
  context?: {
    occasion?: string;
    bodyBuild?: string;
    fit?: string;
    pronouns?: string;
    garmentTitle?: string;
    garmentSiteName?: string;
  };
}

export interface VtoProvider {
  readonly name: string;
  generateAvatar(input: AvatarGenerationInput): Promise<string>;
  generateTryOn(input: TryOnGenerationInput): Promise<string>;
}
