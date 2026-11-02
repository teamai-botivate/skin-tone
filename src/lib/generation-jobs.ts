import { randomUUID } from "node:crypto";
import { APIError } from "openai";
import { z } from "zod";
import { getDb } from "./db";
import { logger } from "./logger";
import { getOpenAIClient } from "./openai-client";
import { generateLookRecommendations } from "./recommendation-prompt";
import {
  buildLookImagePrompt,
  getPrimaryRenderError,
  renderLookImage,
  type LookImagePrompt,
} from "./server-image-generation";
import { sendPushToUser } from "./push-notifications";
import {
  OccasionContextSchema,
  SkinTuneProfileSchema,
  type LookRecommendation,
  type SkinTuneProfile,
} from "./skintune-schemas";

/**
 * Background outfit + image generation jobs.
 *
 * Before this existed, the whole pipeline (recommendations call, then five
 * image calls with retries) was orchestrated by a useEffect in
 * LetStyleApp.tsx. As soon as a phone switched apps or locked the screen,
 * the browser froze or discarded the tab and the remaining steps never ran,
 * and the "done" notification was a page-side `new Notification()` that
 * could only fire if the page was still alive.
 *
 * Now the browser only submits a job. Everything after that runs here, on
 * the server, with its state in the database:
 *
 *   pending -> processing -> completed | failed   (or cancelled when superseded)
 *
 * Reliability model:
 * - A runner must hold a lease (lease_owner + lease_until) to work on a job,
 *   and renews it with a heartbeat. If the process dies, the lease expires
 *   and any later kick (status poll, /api/generation/jobs/run sweep or cron)
 *   resumes the job. Work is resumable: recommendations are stored once,
 *   and each finished image is stored as its own row, so a resumed run only
 *   renders the looks that are still missing.
 * - Every provider step (one recommendations attempt, one image attempt)
 *   runs under its own deadline: all OpenAI calls in it are aborted when it
 *   passes, so one slow request can't eat the execution window.
 * - A step only starts if its whole deadline fits in the runner's time
 *   budget. When the next step wouldn't fit, the runner saves progress,
 *   releases the job and hands off to a fresh invocation (see
 *   requestContinuation) instead of being killed mid-job.
 * - Scheduled recovery (vercel.json cron -> /api/generation/jobs/run) resumes
 *   interrupted jobs without the user coming back, and fails jobs that are
 *   too old to be useful.
 * - Concurrent runners: the lease claim is a single conditional UPDATE, every
 *   write requires still owning the lease, and losing it aborts in-flight
 *   provider calls.
 * - Exactly one notification per job: the runner atomically claims
 *   notified_at before sending, so a retried or duplicated runner can never
 *   send a second one.
 */

export type GenerationJobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type GenerationJobStage = "queued" | "styling" | "rendering" | "done";

export const PENDING_IMAGE_URL = "/replace-with-generated/pending.webp";

export const CreateGenerationJobSchema = z.object({
  profile: SkinTuneProfileSchema,
  context: OccasionContextSchema,
  photoUrl: z.string().optional(),
});
export type CreateGenerationJobInput = z.infer<typeof CreateGenerationJobSchema>;

interface JobRow {
  id: string;
  user_id: string;
  status: GenerationJobStatus;
  stage: GenerationJobStage;
  input_json: string | null;
  looks_json: string | null;
  error: string | null;
  attempts: number;
  lease_until: string | null;
  lease_owner: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface GenerationJobView {
  id: string;
  status: GenerationJobStatus;
  stage: GenerationJobStage;
  error: string | null;
  /** Look text data with placeholder imageUrls; fetch each ready image separately. */
  looks: LookRecommendation[] | null;
  readyLookIds: string[];
  createdAt: string;
  completedAt: string | null;
}

export class GenerationJobsUnavailableError extends Error {
  constructor() {
    super("Background generation jobs are unavailable on this database");
  }
}

/**
 * A live runner renews its lease on a heartbeat; a runner that died
 * (crash, deploy, serverless kill) stops renewing, and its job becomes
 * claimable by the scheduled sweep at most one lease length later.
 */
const leaseMs = () => envMs("GENERATION_JOB_LEASE_MS", 90_000);
const heartbeatMs = () => envMs("GENERATION_JOB_HEARTBEAT_MS", 20_000);
/** A job whose runner has been (re)started this many times without finishing is failed. */
const MAX_RUNS = 8;
/** Unfinished jobs older than this are failed by the sweep instead of resumed forever. */
const MAX_JOB_AGE_MS = 30 * 60 * 1000;
const IMAGE_ATTEMPTS_PER_RUN = 3;
const RECOMMENDATION_ATTEMPTS = 2;
const JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function envMs(name: string, fallback: number): number {
  const configured = process.env[name];
  if (configured === undefined || configured === "") return fallback;
  const value = parseInt(configured, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Looks rendered at the same time. Defaults to all 5 so a job renders in a
 * single wave (the slowest look sets the pace) instead of two. Lower it if
 * the OpenAI account's image rate limit is tight; 429s are still retried by
 * the SDK honouring Retry-After.
 */
function imageConcurrency(): number {
  const value = parseInt(process.env.GENERATION_IMAGE_CONCURRENCY || "5", 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 5) : 5;
}

function isRetryableProviderError(err: unknown): boolean {
  // Our own deadline, a dropped connection, an empty result, anything unexpected.
  if (!(err instanceof APIError) || err.status === undefined) return true;
  if (err.status === 408 || err.status === 409 || err.status === 429 || err.status >= 500) return true;
  // Image moderation is evaluated per generated image, so another render can pass.
  return err.code === "moderation_blocked";
}

/**
 * Whether another attempt at a look image could succeed. A request the
 * provider rejected outright (content policy, invalid input, auth) fails the
 * same way every time, so retrying only delays the inevitable by minutes.
 * When the images.edit fallback failed too, either path being retryable is enough.
 */
function isRetryableRenderError(err: unknown): boolean {
  const primary = getPrimaryRenderError(err);
  return isRetryableProviderError(err) || (primary !== undefined && isRetryableProviderError(primary));
}

/** Awaits `promise`, rejecting early if `signal` aborts first. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Hard limit on one recommendations attempt (generation + review + possible
 * correction). Every provider call in the attempt is aborted when it passes.
 */
function recommendationsTimeoutMs(): number {
  return envMs("GENERATION_RECOMMENDATIONS_TIMEOUT_MS", 120_000);
}

/** Hard limit on one image attempt (styling agent + render + fallback render). */
function imageTimeoutMs(): number {
  return envMs("GENERATION_IMAGE_TIMEOUT_MS", 120_000);
}

/**
 * Milliseconds of provider work one runner invocation may do, in total.
 * A step only starts if its whole timeout still fits inside the budget, so
 * every in-flight call ends (or is aborted) before the budget runs out and
 * the runner can save progress and hand off. 0 = unlimited (long-running
 * Node server). On Vercel the default leaves 30s of the routes' 300s
 * maxDuration for persisting results and the hand-off request.
 */
function timeBudgetMs(): number {
  return envMs("GENERATION_JOB_TIME_BUDGET_MS", process.env.VERCEL ? 270_000 : 0);
}

const nowIso = () => new Date().toISOString();
const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();

function toView(row: JobRow, readyLookIds: string[]): GenerationJobView {
  return {
    id: row.id,
    status: row.status,
    stage: row.stage,
    error: row.error,
    looks: row.looks_json ? (JSON.parse(row.looks_json) as LookRecommendation[]) : null,
    readyLookIds,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

async function getJobRow(jobId: string): Promise<JobRow | null> {
  const db = await getDb();
  return await db.get<JobRow>("SELECT * FROM generation_jobs WHERE id = $1", [jobId]);
}

async function getReadyLookIds(jobId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.query<{ look_id: string }>(
    "SELECT look_id FROM generation_job_images WHERE job_id = $1",
    [jobId],
  );
  return rows.map((r) => r.look_id);
}

/**
 * Creates a job for the user and cancels any of their earlier jobs that are
 * still running, matching the old client behaviour where starting a new
 * generation invalidated the in-flight one (no stale result, no stale
 * notification, no wasted provider calls).
 */
export async function createGenerationJob(
  userId: string,
  input: CreateGenerationJobInput,
): Promise<GenerationJobView> {
  const db = await getDb();
  const id = randomUUID();
  const now = nowIso();

  await db.query(
    `UPDATE generation_jobs SET status = 'cancelled', error = 'Superseded by a newer generation', input_json = NULL, notified_at = $1, updated_at = $2
     WHERE user_id = $3 AND status IN ('pending', 'processing')`,
    [now, now, userId],
  );

  await db.query(
    `INSERT INTO generation_jobs (id, user_id, status, stage, input_json, attempts, created_at, updated_at)
     VALUES ($1, $2, 'pending', 'queued', $3, 0, $4, $5)`,
    [id, userId, JSON.stringify(input), now, now],
  );

  const row = await getJobRow(id);
  // The in-memory fallback DB client only understands the auth/credits
  // queries; detect it here so the caller can fall back gracefully.
  if (!row) throw new GenerationJobsUnavailableError();

  await purgeOldJobs(userId).catch((err) =>
    logger.warn({ err, userId }, "Could not purge old generation jobs"),
  );

  logger.info({ jobId: id, userId }, "Generation job created");
  return toView(row, []);
}

async function purgeOldJobs(userId: string): Promise<void> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - JOB_RETENTION_MS).toISOString();
  await db.query(
    `DELETE FROM generation_job_images WHERE job_id IN (
       SELECT id FROM generation_jobs WHERE user_id = $1 AND created_at < $2
     )`,
    [userId, cutoff],
  );
  await db.query("DELETE FROM generation_jobs WHERE user_id = $1 AND created_at < $2", [
    userId,
    cutoff,
  ]);
}

export async function getGenerationJobForUser(
  jobId: string,
  userId: string,
): Promise<GenerationJobView | null> {
  const row = await getJobRow(jobId);
  if (!row || row.user_id !== userId) return null;
  return toView(row, await getReadyLookIds(jobId));
}

export async function getGenerationJobImageForUser(
  jobId: string,
  lookId: string,
  userId: string,
): Promise<string | null> {
  const db = await getDb();
  const row = await db.get<{ image_url: string }>(
    `SELECT i.image_url FROM generation_job_images i
     JOIN generation_jobs j ON j.id = i.job_id
     WHERE i.job_id = $1 AND i.look_id = $2 AND j.user_id = $3`,
    [jobId, lookId, userId],
  );
  return row?.image_url ?? null;
}

/** True when the job is unfinished and no live runner holds it, i.e. it should be (re)started. */
export function jobNeedsRunner(view: { status: GenerationJobStatus }, leaseUntil: string | null): boolean {
  if (view.status !== "pending" && view.status !== "processing") return false;
  return !leaseUntil || leaseUntil < nowIso();
}

export async function jobIdNeedsRunner(jobId: string): Promise<boolean> {
  const row = await getJobRow(jobId);
  return row ? jobNeedsRunner(row, row.lease_until) : false;
}

/** Unfinished jobs nobody is working on — picked up by the run/cron sweep. */
export async function findStalledJobIds(limit = 5): Promise<string[]> {
  const db = await getDb();
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM generation_jobs
     WHERE status IN ('pending', 'processing') AND (lease_until IS NULL OR lease_until < $1)
     ORDER BY created_at ASC LIMIT $2`,
    [nowIso(), limit],
  );
  return rows.map((r) => r.id);
}

/**
 * Scheduled recovery (cron / runner endpoint): fails stalled jobs that are
 * too old to still be useful (notifying their owner once) and returns the
 * rest so the caller can start a runner for each. Jobs a live runner holds
 * are never touched.
 */
export async function sweepStalledJobs(limit = 5): Promise<{ resume: string[]; abandoned: string[] }> {
  const db = await getDb();
  const rows = await db.query<{ id: string; created_at: string }>(
    `SELECT id, created_at FROM generation_jobs
     WHERE status IN ('pending', 'processing') AND (lease_until IS NULL OR lease_until < $1)
     ORDER BY created_at ASC LIMIT $2`,
    [nowIso(), limit],
  );
  const cutoff = new Date(Date.now() - MAX_JOB_AGE_MS).toISOString();
  const resume: string[] = [];
  const abandoned: string[] = [];
  for (const row of rows) {
    if (row.created_at < cutoff) {
      if (await abandonJob(row.id, "Generation took too long to complete. Please try again.")) {
        abandoned.push(row.id);
        await notifyJobOutcome(row.id);
      }
    } else {
      resume.push(row.id);
    }
  }
  if (abandoned.length) logger.warn({ abandoned }, "Abandoned stale generation jobs");
  return { resume, abandoned };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

class LeaseLostError extends Error {
  constructor() {
    super("Generation job lease lost");
  }
}

async function claimLease(jobId: string, owner: string): Promise<JobRow | null> {
  const db = await getDb();
  const now = nowIso();
  const claimed = await db.query<{ id: string }>(
    `UPDATE generation_jobs
     SET status = 'processing', lease_owner = $1, lease_until = $2, attempts = attempts + 1, updated_at = $3
     WHERE id = $4 AND status IN ('pending', 'processing') AND (lease_until IS NULL OR lease_until < $5)
     RETURNING id`,
    [owner, isoIn(leaseMs()), now, jobId, now],
  );
  if (claimed.length === 0) return null;
  return await getJobRow(jobId);
}

/** Renews the lease; throws LeaseLostError if another runner took over or the job was cancelled. */
async function renewLease(jobId: string, owner: string): Promise<void> {
  const db = await getDb();
  const renewed = await db.query<{ id: string }>(
    `UPDATE generation_jobs SET lease_until = $1, updated_at = $2
     WHERE id = $3 AND lease_owner = $4 AND status = 'processing'
     RETURNING id`,
    [isoIn(leaseMs()), nowIso(), jobId, owner],
  );
  if (renewed.length === 0) throw new LeaseLostError();
}

async function releaseLease(jobId: string, owner: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE generation_jobs SET lease_until = NULL, lease_owner = NULL, updated_at = $1
     WHERE id = $2 AND lease_owner = $3 AND status = 'processing'`,
    [nowIso(), jobId, owner],
  );
}

async function updateOwnedJob(
  jobId: string,
  owner: string,
  fields: { stage?: GenerationJobStage; looks_json?: string },
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [column, value] of Object.entries(fields)) {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }
  params.push(nowIso());
  sets.push(`updated_at = $${params.length}`);
  params.push(jobId);
  const idParam = params.length;
  params.push(owner);
  const ownerParam = params.length;
  const updated = await db.query<{ id: string }>(
    `UPDATE generation_jobs SET ${sets.join(", ")} WHERE id = $${idParam} AND lease_owner = $${ownerParam} AND status = 'processing' RETURNING id`,
    params,
  );
  if (updated.length === 0) throw new LeaseLostError();
}

/** Moves the job to a terminal state. Only the lease owner can do this, exactly once. */
async function finishJob(
  jobId: string,
  owner: string,
  status: "completed" | "failed",
  error: string | null,
): Promise<boolean> {
  const db = await getDb();
  const now = nowIso();
  // input_json holds the user's photo; it's no longer needed once the job
  // is finished, so it is dropped rather than retained.
  const finished = await db.query<{ id: string }>(
    `UPDATE generation_jobs
     SET status = $1, stage = $2, error = $3, input_json = NULL, lease_until = NULL, lease_owner = NULL, completed_at = $4, updated_at = $5
     WHERE id = $6 AND lease_owner = $7 AND status = 'processing'
     RETURNING id`,
    [status, status === "completed" ? "done" : "rendering", error, now, now, jobId, owner],
  );
  return finished.length > 0;
}

/**
 * Fails an unfinished job without completing it. With `owner`, only the
 * runner holding the lease can do this; without, only when no live runner
 * holds it (lease free or expired) — so a sweep never fails a job that is
 * actively being worked on.
 */
async function abandonJob(jobId: string, error: string, owner?: string): Promise<boolean> {
  const db = await getDb();
  const now = nowIso();
  const updated = owner
    ? await db.query<{ id: string }>(
        `UPDATE generation_jobs
         SET status = 'failed', error = $1, input_json = NULL, lease_until = NULL, lease_owner = NULL, completed_at = $2, updated_at = $3
         WHERE id = $4 AND lease_owner = $5 AND status IN ('pending', 'processing')
         RETURNING id`,
        [error, now, now, jobId, owner],
      )
    : await db.query<{ id: string }>(
        `UPDATE generation_jobs
         SET status = 'failed', error = $1, input_json = NULL, lease_until = NULL, lease_owner = NULL, completed_at = $2, updated_at = $3
         WHERE id = $4 AND status IN ('pending', 'processing') AND (lease_until IS NULL OR lease_until < $5)
         RETURNING id`,
        [error, now, now, jobId, now],
      );
  return updated.length > 0;
}

/**
 * Sends the job's single completion/failure notification. notified_at is
 * claimed atomically first, so concurrent or repeated callers can never
 * send twice for the same job.
 */
export async function notifyJobOutcome(jobId: string): Promise<boolean> {
  const db = await getDb();
  const claimed = await db.query<{ user_id: string; status: GenerationJobStatus }>(
    `UPDATE generation_jobs SET notified_at = $1
     WHERE id = $2 AND notified_at IS NULL AND status IN ('completed', 'failed')
     RETURNING user_id, status`,
    [nowIso(), jobId],
  );
  const row = claimed[0];
  if (!row) return false;

  const url = `/?job=${encodeURIComponent(jobId)}`;
  const tag = `letstyle-job-${jobId}`;
  const payload =
    row.status === "completed"
      ? {
          title: "Your personalized looks are ready! ✨",
          body: "5 tailored outfits have been generated for you. Tap to see them.",
          url,
          tag,
        }
      : {
          title: "We couldn't finish your looks",
          body: "Something went wrong while styling your outfits. Tap to try again.",
          url,
          tag,
        };

  const outcome = await sendPushToUser(row.user_id, payload);
  logger.info({ jobId, status: row.status, ...outcome }, "Generation job notification dispatched");
  return true;
}

function readInput(row: JobRow): CreateGenerationJobInput {
  if (!row.input_json) throw new Error("Generation job input is missing");
  return CreateGenerationJobSchema.parse(JSON.parse(row.input_json));
}

/** Thrown when the invocation budget can't fit another step; the job is handed off, not failed. */
class BudgetExhaustedError extends Error {
  constructor() {
    super("Runner time budget exhausted");
  }
}

export interface RunGenerationJobResult {
  outcome: "completed" | "failed" | "continued" | "not-claimed" | "lease-lost";
}

export interface RunGenerationJobOptions {
  /** Called when the time budget ran out with work left; should start a fresh runner. */
  onContinue?: (jobId: string) => Promise<void> | void;
}

/**
 * Advances a job as far as it can. Safe to call any number of times from
 * anywhere: if another runner holds the lease, it returns "not-claimed"
 * without doing anything.
 */
export async function runGenerationJob(
  jobId: string,
  options: RunGenerationJobOptions = {},
): Promise<RunGenerationJobResult> {
  const owner = randomUUID();
  const startedAt = Date.now();
  const budget = timeBudgetMs();
  const remainingMs = () => (budget === 0 ? Infinity : budget - (Date.now() - startedAt));
  let stepsStarted = 0;

  let job: JobRow | null;
  try {
    job = await claimLease(jobId, owner);
  } catch (err) {
    logger.error({ err, jobId }, "Could not claim generation job");
    return { outcome: "not-claimed" };
  }
  if (!job) return { outcome: "not-claimed" };

  if (job.attempts > MAX_RUNS) {
    logger.error({ jobId, attempts: job.attempts }, "Generation job exceeded max runs; failing it");
    if (await abandonJob(jobId, "Generation took too long to complete. Please try again.", owner)) {
      await notifyJobOutcome(jobId);
    }
    return { outcome: "failed" };
  }

  // Aborted when this runner loses the job (cancelled by a newer generation,
  // or taken over after a stall) so in-flight provider calls stop at once.
  const runAbort = new AbortController();
  let leaseLost = false;
  const heartbeat = setInterval(() => {
    renewLease(jobId, owner).catch((err) => {
      if (err instanceof LeaseLostError) {
        leaseLost = true;
        runAbort.abort();
      } else {
        logger.warn({ err, jobId }, "Generation job heartbeat failed");
      }
    });
  }, heartbeatMs());
  heartbeat.unref?.();

  const assertOwned = () => {
    if (leaseLost) throw new LeaseLostError();
  };

  /**
   * Runs one provider step under its own deadline. The step only starts if
   * its full timeout fits in what's left of the budget, so no call can run
   * past the invocation window.
   */
  const runStep = async <T>(stepTimeoutMs: number, step: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    assertOwned();
    const timeoutMs = Math.min(stepTimeoutMs, remainingMs());
    // A step must fit entirely; only a run's first step may take a shortened
    // deadline, so a budget smaller than a step timeout can't stall the job.
    if (timeoutMs <= 0 || (timeoutMs < stepTimeoutMs && stepsStarted > 0)) throw new BudgetExhaustedError();
    stepsStarted += 1;
    const signal = AbortSignal.any([runAbort.signal, AbortSignal.timeout(timeoutMs)]);
    try {
      return await step(signal);
    } finally {
      assertOwned();
    }
  };

  const failJob = async (message: string): Promise<RunGenerationJobResult> => {
    if (await finishJob(jobId, owner, "failed", message)) await notifyJobOutcome(jobId);
    return { outcome: "failed" };
  };

  const handOff = async (): Promise<RunGenerationJobResult> => {
    await releaseLease(jobId, owner);
    logger.info(
      { jobId, elapsedMs: Date.now() - startedAt },
      "Generation job time budget spent; handing off to a fresh runner",
    );
    await options.onContinue?.(jobId);
    return { outcome: "continued" };
  };

  try {
    const input = readInput(job);
    const profile: SkinTuneProfile = { ...input.profile, photoUrl: "" };

    let looks: LookRecommendation[] | null = job.looks_json
      ? (JSON.parse(job.looks_json) as LookRecommendation[])
      : null;

    if (!looks) {
      await updateOwnedJob(jobId, owner, { stage: "styling" });
      let lastErr: unknown;
      for (let attempt = 0; attempt < RECOMMENDATION_ATTEMPTS && !looks; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
        try {
          const result = await runStep(recommendationsTimeoutMs(), (signal) =>
            generateLookRecommendations(getOpenAIClient(), profile, { signal }),
          );
          if (result.looks.length !== 5) throw new Error(`Expected 5 looks, received ${result.looks.length}`);
          looks = result.looks.map((look) => ({ ...look, imageUrl: PENDING_IMAGE_URL }));
        } catch (err) {
          if (err instanceof LeaseLostError || err instanceof BudgetExhaustedError) throw err;
          lastErr = err;
          logger.warn({ err, jobId, attempt }, "Background recommendations attempt failed");
        }
      }
      if (!looks) {
        logger.error({ err: lastErr, jobId }, "Background recommendations failed");
        return await failJob("The styling service could not create your looks right now. Please try again.");
      }
      await updateOwnedJob(jobId, owner, { stage: "rendering", looks_json: JSON.stringify(looks) });
    } else if (job.stage !== "rendering") {
      await updateOwnedJob(jobId, owner, { stage: "rendering" });
    }

    const allLooks = looks;
    const ready = new Set(await getReadyLookIds(jobId));
    const pending = allLooks.filter((look) => !ready.has(look.id));
    const photoUrl = input.photoUrl || undefined;
    const renderPhaseStartedAt = Date.now();
    let stoppedForBudget = false;
    // Set once a look has failed for good: the job is going to fail, so the
    // other in-flight renders are stopped instead of being waited on.
    let doomed = false;
    const failedLookIds: string[] = [];

    const imageInputFor = (look: LookRecommendation) => ({
      look,
      profile,
      context: input.context,
      photoUrl,
      siblingVibes: allLooks
        .filter((other) => other.id !== look.id)
        .map((other) => other.vibe)
        .filter((vibe): vibe is string => Boolean(vibe)),
    });

    // Prompt preparation (the styling agent) doesn't depend on any render,
    // so every look's prompt is prepared at once, up front, instead of
    // serially in front of each render. Resolves null if it was cut off, so
    // a truncated agent call never produces a prompt.
    const prompts = new Map<string, Promise<LookImagePrompt | null>>();
    const preparePrompt = (look: LookRecommendation) => {
      const signal = AbortSignal.any([runAbort.signal, AbortSignal.timeout(imageTimeoutMs())]);
      const prepared = buildLookImagePrompt({ ...imageInputFor(look), requestOptions: { signal } })
        .then((result) => (signal.aborted ? null : result))
        .catch(() => null);
      prompts.set(look.id, prepared);
    };
    if (remainingMs() >= imageTimeoutMs() || stepsStarted === 0) pending.forEach(preparePrompt);

    const renderOne = async (look: LookRecommendation) => {
      for (let attempt = 0; attempt < IMAGE_ATTEMPTS_PER_RUN; attempt++) {
        if (stoppedForBudget || doomed) return;
        if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 800));
        const attemptStartedAt = Date.now();
        try {
          const imageUrl = await runStep(imageTimeoutMs(), async (signal) => {
            // Exactly one styling-agent call per attempt, as before: the
            // prefetched one, or a fresh one if that was cut off or a
            // previous attempt's agent produced nothing. A successful agent
            // result is reused by retries rather than recomputed.
            const prefetched = prompts.get(look.id);
            let prepared = prefetched ? await untilAborted(prefetched, signal) : null;
            if (!prepared) {
              prepared = await buildLookImagePrompt({ ...imageInputFor(look), requestOptions: { signal } });
              if (signal.aborted) throw signal.reason;
            }
            if (prepared.hasStylingAddendum) prompts.set(look.id, Promise.resolve(prepared));
            else prompts.delete(look.id);
            return await renderLookImage({ lookId: look.id, prompt: prepared.prompt, photoUrl, requestOptions: { signal } });
          });
          // Stored only while this runner still owns the job, so a runner
          // that lost it can't write into a job someone else now holds.
          const db = await getDb();
          await db.query(
            `INSERT INTO generation_job_images (job_id, look_id, image_url, created_at)
             SELECT $1, $2, $3, $4
             WHERE EXISTS (SELECT 1 FROM generation_jobs WHERE id = $5 AND lease_owner = $6 AND status = 'processing')
             ON CONFLICT (job_id, look_id) DO NOTHING`,
            [jobId, look.id, imageUrl, nowIso(), jobId, owner],
          );
          await renewLease(jobId, owner);
          logger.info(
            {
              jobId,
              lookId: look.id,
              attempt,
              attemptMs: Date.now() - attemptStartedAt,
              sinceRenderStartMs: Date.now() - renderPhaseStartedAt,
            },
            "Background image rendered",
          );
          return;
        } catch (err) {
          if (err instanceof LeaseLostError) throw err;
          if (err instanceof BudgetExhaustedError) {
            stoppedForBudget = true;
            return;
          }
          if (doomed) return;
          const retryable = isRetryableRenderError(err);
          logger.warn(
            { err, jobId, lookId: look.id, attempt, retryable, attemptMs: Date.now() - attemptStartedAt },
            "Background image attempt failed",
          );
          if (!retryable) break;
        }
      }
      failedLookIds.push(look.id);
      if (!doomed) {
        doomed = true;
        runAbort.abort();
      }
    };

    // Bounded concurrency; each image is saved the moment it's done, so a
    // slow look never holds back the others.
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(imageConcurrency(), pending.length) }, async () => {
        while (next < pending.length && !stoppedForBudget && !doomed) {
          const look = pending[next++];
          await renderOne(look);
        }
      }),
    );
    assertOwned();
    logger.info(
      {
        jobId,
        renderPhaseMs: Date.now() - renderPhaseStartedAt,
        rendered: pending.length - failedLookIds.length,
        failed: failedLookIds.length,
        stoppedForBudget,
      },
      "Background render phase finished",
    );

    if (failedLookIds.length > 0) {
      const count = failedLookIds.length;
      return await failJob(
        `Could not generate style visualisations for ${count} look${count > 1 ? "s" : ""}. Please retry.`,
      );
    }

    if (stoppedForBudget) return await handOff();

    if (await finishJob(jobId, owner, "completed", null)) {
      logger.info({ jobId, ms: Date.now() - startedAt }, "Generation job completed");
      await notifyJobOutcome(jobId);
    }
    return { outcome: "completed" };
  } catch (err) {
    if (err instanceof LeaseLostError) {
      runAbort.abort();
      logger.info({ jobId }, "Generation job lease lost (cancelled or taken over); stopping");
      return { outcome: "lease-lost" };
    }
    if (err instanceof BudgetExhaustedError) return await handOff();
    logger.error({ err, jobId }, "Generation job crashed");
    return await failJob("Something went wrong while styling your looks. Please try again.").catch(
      () => ({ outcome: "failed" as const }),
    );
  } finally {
    clearInterval(heartbeat);
    // Release anything still in flight (e.g. prepared prompts for looks a
    // handed-off run never reached).
    runAbort.abort();
  }
}
