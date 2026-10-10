// Dress Search & Try-On Service (real-dress-search branch)
// -----------------------------------------------------------
// Replaces recommendation-engine.ts + image-generation.ts's role on this
// branch: instead of an AI-generated look, this searches the real web
// (backend's /api/search-dresses, via Tavily) for actual purchasable
// dresses matching the user's profile, and tries a selected one on the
// user's own uploaded photo (backend's /api/try-on, gpt-image-2).
//
// Same boundary discipline as the rest of the app: UI components only ever
// call these functions, never a search/image provider SDK directly.

import type { DressResult, ProductFeedbackType, SessionMemory, ShopLink, SkinTuneProfile } from '@/types';
import { createActivityLog } from '@/lib/activity-log';

export type DressSearchPage = {
  results: DressResult[];
  shopLinks: ShopLink[];
  hasMore: boolean;
};

type ActivityLog = ReturnType<typeof createActivityLog>;

/** Reads the backend's {error, message} JSON body (see every route's error response shape) for a specific, real error instead of just a status code. */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.message || body.error || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Fetches one page of real dress results for the given profile. `offset`/
 * `limit` drive the "More" button — each call is a fresh, slightly
 * broadened search (see the backend route), not a cached-and-sliced list,
 * so pass the previous total count as the next call's offset.
 *
 * `log` is optional real step-tracking (see lib/activity-log.ts) — when
 * given, this reports genuine progress ("Searching real stores" starts
 * when the request goes out, finishes when a response arrives; results are
 * parsed as a separate step) so a caller can render a live checklist
 * instead of a cosmetic timer, and so DevTools shows exactly how far a
 * request got if it fails partway.
 */
export const searchDresses = async (
  profile: SkinTuneProfile,
  offset: number,
  limit = 10,
  log?: ActivityLog,
): Promise<DressSearchPage> => {
  const { photoUrl: _photoUrl, ...profileForRequest } = profile;
  log?.start('Searching real stores');
  let res: Response;
  try {
    res = await fetch('/api/search-dresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: profileForRequest, offset, limit }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Network request failed';
    log?.fail('Searching real stores', detail);
    throw err;
  }
  if (!res.ok) {
    const detail = await readErrorMessage(res, `Server returned ${res.status}`);
    log?.fail('Searching real stores', detail);
    throw new Error(`Dress search request failed: ${res.status} — ${detail}`);
  }
  log?.done('Searching real stores');

  log?.start('Building your results');
  const data = (await res.json()) as DressSearchPage;
  log?.done('Building your results');
  return data;
};

/**
 * Generates a try-on image: a reference photo of the user, re-dressed in
 * the exact dress they picked. Throws on failure — the calling screen
 * should show a retry state rather than silently showing nothing, since
 * this is a single explicit user action ("try this on"), not a background
 * batch fetch with independent per-item fallbacks like generate-image.ts.
 *
 * `avatarImageUrl` is the user's ACTIVE AVATAR image (see services/
 * avatar.ts), not their raw uploaded selfie — this is the actual "avatar
 * reuse" implementation this branch's product spec calls for: the avatar
 * was already generated once as a clean, identity-preserving full-length
 * reference photo, so every try-on reuses that same photo as the identity
 * reference instead of re-deriving identity/build/framing from a raw
 * close-up selfie on every single request. The backend's /api/try-on
 * contract is otherwise unchanged (still just a `photoUrl` field) — this
 * is a caller-side swap of WHICH photo gets sent, not a schema change.
 */
export const tryOnDress = async (
  dress: DressResult,
  profile: SkinTuneProfile,
  avatarImageUrl: string,
): Promise<string> => {
  if (!avatarImageUrl) throw new Error('A personal avatar is required to try on a dress.');
  const { photoUrl: _photoUrl, ...profileForRequest } = profile;
  const res = await fetch('/api/try-on', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dress, profile: profileForRequest, photoUrl: avatarImageUrl }),
  });
  if (!res.ok) {
    const detail = await readErrorMessage(res, `Server returned ${res.status}`);
    throw new Error(`Try-on request failed: ${res.status} — ${detail}`);
  }
  const data = (await res.json()) as { imageUrl: string };
  if (!data.imageUrl) throw new Error('Empty try-on response');
  return data.imageUrl;
};

/**
 * "Research Again" (this branch's product spec, section 25) — a genuinely
 * new search, not a repeat of the same 10 results. `memory` carries what's
 * already been seen/rejected so the backend can steer away from repeats —
 * see backend's runDressSearch/buildSearchQuery for how this is actually
 * used, not just logged.
 */
export const researchAgain = async (
  profile: SkinTuneProfile,
  memory: SessionMemory,
  limit = 10,
  log?: ActivityLog,
): Promise<DressSearchPage> => {
  const { photoUrl: _photoUrl, ...profileForRequest } = profile;
  log?.start('Searching real stores');
  let res: Response;
  try {
    res = await fetch('/api/search-dresses/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: profileForRequest, limit, memory }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Network request failed';
    log?.fail('Searching real stores', detail);
    throw err;
  }
  if (!res.ok) {
    const detail = await readErrorMessage(res, `Server returned ${res.status}`);
    log?.fail('Searching real stores', detail);
    throw new Error(`Research-again request failed: ${res.status} — ${detail}`);
  }
  log?.done('Searching real stores');
  return (await res.json()) as DressSearchPage;
};

/**
 * "Refine Search" (this branch's product spec, section 26) — same
 * seen/rejected exclusion as researchAgain, plus the user's own free-text
 * steering instruction. Temporary for this session: this call never
 * touches `profile` itself, so nothing here becomes a permanent preference
 * unless a caller separately decides to save it.
 */
export const refineSearch = async (
  profile: SkinTuneProfile,
  memory: SessionMemory,
  refinement: string,
  limit = 10,
  log?: ActivityLog,
): Promise<DressSearchPage> => {
  const { photoUrl: _photoUrl, ...profileForRequest } = profile;
  log?.start('Searching real stores');
  let res: Response;
  try {
    res = await fetch('/api/search-dresses/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: profileForRequest, limit, memory, refinement }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Network request failed';
    log?.fail('Searching real stores', detail);
    throw err;
  }
  if (!res.ok) {
    const detail = await readErrorMessage(res, `Server returned ${res.status}`);
    log?.fail('Searching real stores', detail);
    throw new Error(`Refine-search request failed: ${res.status} — ${detail}`);
  }
  log?.done('Searching real stores');
  return (await res.json()) as DressSearchPage;
};

/**
 * Sends an Interested/Not Interested click to the backend (mainly for
 * server-side logging/future persistence — see routes/product-feedback.ts's
 * doc comment for why this isn't the actual source of truth yet). Never
 * throws — a feedback click updating the frontend's own sessionMemory (see
 * services/shopping-session.ts) is the part that actually matters for this
 * session; a failed background log call shouldn't block or error out the
 * button the user just pressed.
 */
export const sendProductFeedback = async (
  dress: DressResult,
  feedbackType: ProductFeedbackType,
  reason?: string,
): Promise<void> => {
  try {
    await fetch('/api/products/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dress, feedbackType, reason }),
    });
  } catch {
    // Best-effort only — see doc comment above.
  }
};
