// Image Generation Service
// -------------------------
// Architecture:
//
//   Recommendation Engine  →  5 LookRecommendation objects  →  Image Generation Service  →  5 images
//
// This module is the ONLY place in the frontend that talks about images. It
// sends each LookRecommendation's structured styling data — plus the user's
// own uploaded photo — to the backend (/api/generate-image, which calls
// OpenAI's gpt-image-2 images.edit endpoint), and returns each look with a
// real imageUrl showing THE SAME PERSON re-dressed in that look, not a
// generated stranger. It never decides the styling strategy itself — that's
// the recommendation engine's job (see services/recommendation-engine.ts).
// UI components must not import a provider SDK directly; they call
// generateLookImages() and stay unaware of how images are produced.
//
// The actual provider call (and the OpenAI API key) lives server-side in
// artifacts/api-server/src/routes/generate-image.ts — never in this file —
// so the key is never exposed to the browser.
//
// One request per look, not one batch request for all 5: a single generated
// image (even compressed) can run into a few MB, so bundling 5 into one
// JSON response risks tripping body-size limits somewhere in the deployment
// chain (this was a real production bug — see CLAUDE.md). Per-look requests
// keep each request/response small and let the UI show each image as soon
// as it's ready instead of waiting on the slowest of five.

import type { LookRecommendation, SkinTuneProfile } from '@/types';

export type OccasionContext = {
  occasion: string;
  details: string;
};

export const generateOneLookImage = async (
  look: LookRecommendation,
  profileForRequest: Omit<SkinTuneProfile, 'photoUrl'>,
  context: OccasionContext,
  photoUrl: string,
  siblingVibes: string[],
): Promise<LookRecommendation> => {
  const res = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      look,
      profile: profileForRequest,
      context,
      photoUrl: photoUrl || undefined,
      siblingVibes: siblingVibes.length ? siblingVibes : undefined,
    }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error || errData?.message || `Image generation request failed: ${res.status}`);
  }
  const data = (await res.json()) as { look: LookRecommendation };
  if (!data.look) throw new Error('Empty image generation response');
  return data.look;
};

/**
 * Generate visuals for a set of recommendations. Fires one request per look
 * (in parallel) rather than a single batched request. Each look falls back
 * independently to its existing placeholder imageUrl if its own request
 * fails, so one failure never blocks the other four.
 *
 * profile.photoUrl IS sent here (unlike recommendation-engine.ts, which
 * strips it) — the backend edits that photo so each look shows the same
 * person, not a generated stranger. If the user skipped the photo step,
 * the backend falls back to text-to-image generation.
 */
export const generateLookImages = async (
  recommendations: LookRecommendation[],
  profile: SkinTuneProfile,
  context: OccasionContext,
): Promise<LookRecommendation[]> => {
  const { photoUrl, ...profileForRequest } = profile;
  return Promise.all(
    recommendations.map(async (look) => {
      const siblingVibes = recommendations
        .filter((other) => other.id !== look.id)
        .map((other) => other.vibe)
        .filter((vibe): vibe is string => Boolean(vibe));
      try {
        return await generateOneLookImage(look, profileForRequest, context, photoUrl, siblingVibes);
      } catch (err) {
        console.warn(`Falling back to placeholder visual for ${look.id}:`, err);
        return look;
      }
    }),
  );
};

/**
 * Re-generate a single already-generated look using the user's own
 * follow-up correction (e.g. "make the sleeves longer"). Sends the look's
 * current imageUrl AND the user's original uploaded photo as reference
 * images to /api/refine-image, so the backend refines the existing result
 * rather than starting over blind. Throws on failure — callers should show
 * the error rather than silently keeping the old image, since a retry the
 * user explicitly asked for that silently no-ops would be confusing.
 */
export const refineLookImage = async (
  look: LookRecommendation,
  profile: SkinTuneProfile,
  context: OccasionContext,
  customization: string,
): Promise<LookRecommendation> => {
  const { photoUrl, ...profileForRequest } = profile;
  const res = await fetch('/api/refine-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ look, profile: profileForRequest, context, photoUrl: photoUrl || undefined, customization }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error || errData?.message || `Image refinement request failed: ${res.status}`);
  }
  const data = (await res.json()) as { look: LookRecommendation };
  if (!data.look) throw new Error('Empty image refinement response');
  return data.look;
};
