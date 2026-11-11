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
    throw new ImageRequestError(
      errData?.error || errData?.message || `Image generation request failed: ${res.status}`,
      res.status,
    );
  }
  const data = (await res.json()) as { look: LookRecommendation };
  if (!data.look) throw new Error('Empty image generation response');
  return data.look;
};

/** A non-2xx answer from /api/generate-image, keeping the HTTP status for retry decisions. */
export class ImageRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ImageRequestError';
    this.status = status;
  }
}

/**
 * Whether another request for this look could succeed. Network failures,
 * timeouts, rate limits and server errors are transient, as is a moderation
 * block (judged per generated image). Any other 4xx (content policy, invalid
 * input, signed out) fails the same way every time, so retrying it only
 * repeats a slow paid call.
 */
export function isTransientImageFailure(err: unknown): boolean {
  if (!(err instanceof ImageRequestError)) return true;
  const { status } = err;
  if (status === 408 || status === 409 || status === 429 || status >= 500) return true;
  return status === 400 && /moderation/i.test(err.message);
}

/** Exponential backoff with jitter before retry `attempt` (1-based): ~1s, 2s, 4s, capped at 8s. */
export function imageRetryDelayMs(attempt: number, random: () => number = Math.random): number {
  if (attempt <= 0) return 0;
  const base = Math.min(1000 * 2 ** (attempt - 1), 8000);
  return Math.round(base * (0.8 + random() * 0.4));
}

import { hasRealImage } from '../components/LookVisual';

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

export interface GenerateLookImagesOptions {
  maxRetries?: number;
  concurrency?: number;
  onProgress?: (looks: LookRecommendation[]) => void;
  /** Injected in tests to avoid real waits. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Generate visuals for a set of recommendations.
 * - Only requests images for looks that do not yet have a valid, usable image.
 * - All five looks render at once by default, matching the background job
 *   runner; 429s are retried server-side by the OpenAI SDK honouring Retry-After.
 * - Each look retries on its own, so a failed look never waits for the
 *   slowest look of a "wave" before trying again.
 * - Only transient failures are retried (default up to 3 retries) with
 *   exponential backoff; a permanent rejection fails fast.
 * - Successfully generated images are preserved and never regenerated.
 * - Ensures all requested looks have usable images before presenting completion.
 */
export const generateLookImages = async (
  recommendations: LookRecommendation[],
  profile: SkinTuneProfile,
  context: OccasionContext,
  options?: GenerateLookImagesOptions,
): Promise<LookRecommendation[]> => {
  const { photoUrl, ...profileForRequest } = profile;
  const maxRetries = options?.maxRetries ?? 3;
  const concurrency = options?.concurrency ?? 5;
  const sleep = options?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const currentLooks = [...recommendations];

  // Only the looks that still need a real image
  const pendingIndices = currentLooks
    .map((look, idx) => (!hasRealImage(look.imageUrl) ? idx : -1))
    .filter((idx) => idx !== -1);

  await runWithConcurrency(pendingIndices, concurrency, async (lookIdx) => {
    const look = currentLooks[lookIdx];
    const siblingVibes = currentLooks
      .filter((other) => other.id !== look.id)
      .map((other) => other.vibe)
      .filter((vibe): vibe is string => Boolean(vibe));

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await sleep(imageRetryDelayMs(attempt));
      try {
        const updated = await generateOneLookImage(
          look,
          profileForRequest,
          context,
          photoUrl || '',
          siblingVibes,
        );
        if (hasRealImage(updated.imageUrl)) {
          currentLooks[lookIdx] = updated;
          options?.onProgress?.([...currentLooks]);
          return;
        }
      } catch (err) {
        const transient = isTransientImageFailure(err);
        console.warn(
          `Image generation attempt ${attempt + 1} failed for ${look.id}${transient ? '' : ' (not retryable)'}:`,
          err,
        );
        if (!transient) return;
      }
    }
  });

  // Ensure all looks have usable images before presenting result
  const missing = currentLooks.filter((l) => !hasRealImage(l.imageUrl));
  if (missing.length > 0) {
    throw new Error(
      `Could not generate style visualisations for ${missing.length} look${missing.length > 1 ? 's' : ''}. Please retry.`,
    );
  }

  return currentLooks;
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
