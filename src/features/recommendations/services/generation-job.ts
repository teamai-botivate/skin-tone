// Background Generation Job Client
// --------------------------------
// The browser submits ONE job to /api/generation/jobs and the server does
// all the work (5 look recommendations + 5 images) independently of this
// tab. This module only follows the job's progress while the page happens to
// be open. Losing the page (app switch, screen lock, tab discarded) loses
// nothing: the job keeps running server-side, a push notification announces
// the result, and resumeable state lets the app pick the job back up.
//
// Images are fetched one per request (never bundled) for the same body-size
// reason documented in image-generation.ts.

import type { LookRecommendation, SkinTuneProfile } from '@/types';
import type { OccasionContext } from './image-generation';
import { normalizeStage, type GenerationProgress } from './generation-progress';

export const ACTIVE_JOB_STORAGE_KEY = 'letstyle-active-generation-job';
/** Window event that makes the job watcher poll immediately (e.g. a push arrived). */
export const JOB_POKE_EVENT = 'letstyle:job-poke';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_INTERVAL_MS = 15000;

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface GenerationJobView {
  id: string;
  status: JobStatus;
  stage: string;
  error: string | null;
  looks: LookRecommendation[] | null;
  readyLookIds: string[];
}

/** Background jobs aren't available on this deployment; use the in-page flow instead. */
export class JobsUnavailableError extends Error {}

export class GenerationJobFailedError extends Error {}

export function getActiveJobId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setActiveJobId(jobId: string | null) {
  try {
    if (jobId) localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
    else localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
  } catch {
    // Storage may be unavailable (private mode); resume-after-reload just won't work.
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return data?.error || data?.message || fallback;
}

export async function startGenerationJob(
  profile: SkinTuneProfile,
  context: OccasionContext,
): Promise<string> {
  const { photoUrl, ...profileForRequest } = profile;
  let res: Response;
  try {
    res = await fetch('/api/generation/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: profileForRequest, context, photoUrl: photoUrl || undefined }),
    });
  } catch (err) {
    throw new Error(`Could not reach the styling service. ${err instanceof Error ? err.message : ''}`.trim());
  }
  if (res.status === 503 || res.status === 404) {
    throw new JobsUnavailableError(await readError(res, 'Background generation unavailable'));
  }
  if (!res.ok) throw new Error(await readError(res, `Could not start generation (HTTP ${res.status}).`));
  const data = (await res.json()) as { job: GenerationJobView };
  return data.job.id;
}

async function fetchJob(jobId: string): Promise<GenerationJobView> {
  const res = await fetch(`/api/generation/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
  if (res.status === 404 || res.status === 401) {
    throw new GenerationJobFailedError(await readError(res, 'This generation could not be found.'));
  }
  if (!res.ok) throw new Error(`Status request failed: ${res.status}`);
  return ((await res.json()) as { job: GenerationJobView }).job;
}

async function fetchJobImage(jobId: string, lookId: string): Promise<string> {
  const res = await fetch(
    `/api/generation/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(lookId)}`,
  );
  if (!res.ok) throw new Error(`Image request failed: ${res.status}`);
  return ((await res.json()) as { imageUrl: string }).imageUrl;
}

/** Resolves after `ms`, or earlier if the page becomes visible again or a push pokes us. */
function waitForNextPoll(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(JOB_POKE_EVENT, done);
      resolve();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') done();
    };
    const timer = setTimeout(done, ms);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(JOB_POKE_EVENT, done);
  });
}

export interface WatchGenerationJobOptions {
  onProgress?: (looks: LookRecommendation[]) => void;
  /** Real job state after every status poll: the server's stage and which look images are in. */
  onStatus?: (progress: GenerationProgress) => void;
  /** Return true to stop watching (the job itself keeps running server-side). */
  shouldStop?: () => boolean;
}

export interface WatchGenerationJobResult {
  looks: LookRecommendation[];
  /** True when the job had already finished before we started watching (e.g. opened from a notification). */
  finishedBeforeWatch: boolean;
}

/**
 * Follows a job until it completes, fails, or `shouldStop` returns true
 * (resolves null). Transient network errors are retried — a phone briefly
 * offline must not turn a healthy server-side job into a visible failure.
 */
export async function watchGenerationJob(
  jobId: string,
  options: WatchGenerationJobOptions = {},
): Promise<WatchGenerationJobResult | null> {
  const images = new Map<string, string>();
  let interval = POLL_INTERVAL_MS;
  let firstPoll = true;
  let finishedBeforeWatch = false;
  let looksAnnounced = false;

  while (true) {
    if (options.shouldStop?.()) return null;

    let job: GenerationJobView;
    try {
      job = await fetchJob(jobId);
      interval = POLL_INTERVAL_MS;
    } catch (err) {
      if (err instanceof GenerationJobFailedError) throw err;
      console.warn('Generation status check failed; retrying:', err);
      await waitForNextPoll(interval);
      interval = Math.min(interval * 2, MAX_POLL_INTERVAL_MS);
      continue;
    }
    if (options.shouldStop?.()) return null;

    if (firstPoll) {
      finishedBeforeWatch = job.status === 'completed';
      firstPoll = false;
    }

    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new GenerationJobFailedError(job.error || 'Generation failed. Please try again.');
    }

    if (!job.looks) {
      options.onStatus?.({ stage: normalizeStage(job.stage), looks: [] });
    }

    if (job.looks) {
      const newIds = job.readyLookIds.filter((id) => !images.has(id));
      // Fetched in parallel (still one image per request): when several are
      // ready at once, e.g. reopening a finished job, they arrive together.
      await Promise.all(
        newIds.map(async (lookId) => {
          try {
            images.set(lookId, await fetchJobImage(jobId, lookId));
          } catch (err) {
            console.warn(`Could not load generated image for ${lookId}; will retry:`, err);
          }
        }),
      );
      if (options.shouldStop?.()) return null;
      const looks = job.looks.map((look) =>
        images.has(look.id) ? { ...look, imageUrl: images.get(look.id)! } : look,
      );
      options.onStatus?.({
        stage: normalizeStage(job.stage),
        looks: job.looks.map((look) => ({ id: look.id, title: look.title, ready: images.has(look.id) })),
      });
      if (newIds.length > 0 || !looksAnnounced) {
        looksAnnounced = true;
        options.onProgress?.(looks);
      }

      if (job.status === 'completed' && looks.every((look) => images.has(look.id))) {
        return { looks, finishedBeforeWatch };
      }
    }

    await waitForNextPoll(interval);
  }
}
