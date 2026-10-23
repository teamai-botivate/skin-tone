// Personal Avatar Service (real-dress-avatar-intelligent-tryon branch)
// -----------------------------------------------------------------------
// Implements this branch's core "avatar reuse" product requirement: the
// user uploads a selfie ONCE (via the existing photo step), the backend
// generates one clean full-length identity-preserving reference photo
// (backend's POST /api/avatar/create), and every subsequent try-on reuses
// THAT avatar image instead of the raw selfie — see services/dress-search.ts's
// tryOnDress, which now takes an avatar image rather than profile.photoUrl.
//
// No accounts/auth exist in this codebase (confirmed by inspection; see
// CLAUDE.md) — persistence here is a single `skintune-avatar` localStorage
// key, the same implicit "one user per browser" scoping every other piece
// of state in this app already uses (skintune-profile, skintune-saved-looks,
// etc.). If real accounts/a database are ever added, this module's
// createAvatar/getActiveAvatar/setActiveAvatar functions are the natural
// place to swap the storage backend without changing any caller.

import type { SkinTuneProfile } from '@/types';

const STORAGE_KEY = 'letstyle-avatar-versions';
const LEGACY_STORAGE_KEY = 'skintune-avatar-versions';

export type Avatar = {
  id: string;
  imageUrl: string;
  createdAt: string;
  active: boolean;
};

/** Reads the backend's {error, message} JSON body for a specific, real error instead of just a status code — same pattern as dress-search.ts's readErrorMessage. */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.message || body.error || fallback;
  } catch {
    return fallback;
  }
}

function loadVersions(): Avatar[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Avatar[]) : [];
  } catch {
    return [];
  }
}

function saveVersions(versions: Avatar[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
  } catch {
    // Storage can genuinely fail (quota, private-browsing restrictions) —
    // the avatar still works for this session via the in-memory profile
    // state, it just won't survive a reload. Not worth surfacing as an
    // error to the user for a convenience feature.
  }
}

/** The currently active avatar, or null if the user has never created one — see App.tsx's onboarding flow, which only shows the avatar-creation step when this returns null. */
export const getActiveAvatar = (): Avatar | null => {
  return loadVersions().find((v) => v.active) ?? null;
};

/** All avatar versions, most recent first — see this branch's "avatar versioning" requirement (section 7). Exposed for a future "recover an older avatar" UI; App.tsx doesn't build that UI yet, but the version history is preserved so it can be added without a data-model change. */
export const getAvatarVersions = (): Avatar[] => {
  return [...loadVersions()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/**
 * Creates a new avatar from a fresh selfie (backend's POST
 * /api/avatar/create — same identity-preserving gpt-image-2 machinery as
 * try-on.ts, just with no garment reference). Used for BOTH first-time
 * creation and explicit "Update/Recreate Avatar" — this function itself
 * doesn't distinguish the two; see setAsOnlyVersion below for how a caller
 * chooses.
 */
export const createAvatar = async (photoUrl: string, profile: SkinTuneProfile): Promise<Avatar> => {
  const res = await fetch('/api/avatar/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoUrl, profile }),
  });
  if (!res.ok) {
    const detail = await readErrorMessage(res, `Server returned ${res.status}`);
    throw new Error(`Avatar creation failed: ${res.status} — ${detail}`);
  }
  const data = (await res.json()) as { avatar: Avatar };
  if (!data.avatar?.imageUrl) throw new Error('Empty avatar creation response');
  return data.avatar;
};

/**
 * Persists a newly-created avatar as a NEW version alongside any existing
 * ones, marks it active, and demotes every other version to inactive — see
 * this branch's "do NOT immediately destroy the old avatar" requirement
 * (section 7). Use this for "Update/Recreate Avatar".
 */
export const saveAsNewActiveVersion = (avatar: Avatar): void => {
  const versions = loadVersions().map((v) => ({ ...v, active: false }));
  versions.push({ ...avatar, active: true });
  saveVersions(versions);
};

/**
 * Persists a newly-created avatar as the ONLY version — use this for
 * first-time avatar creation, where there's nothing to preserve a version
 * history of yet. (saveAsNewActiveVersion would also work correctly here
 * since there's nothing else in the list, but this name makes the
 * first-time-vs-recreate distinction explicit at each call site in
 * App.tsx, rather than relying on both callers happening to produce the
 * same result from an empty list.)
 */
export const saveAsFirstVersion = (avatar: Avatar): void => {
  saveVersions([{ ...avatar, active: true }]);
};

/** Marks a specific existing version active (see the future "recover an older avatar" note on getAvatarVersions) and every other version inactive. No-op if the id isn't found. */
export const setActiveVersion = (id: string): void => {
  const versions = loadVersions();
  if (!versions.some((v) => v.id === id)) return;
  saveVersions(versions.map((v) => ({ ...v, active: v.id === id })));
};
