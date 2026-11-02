import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { logger } from "./logger";
import { runGenerationJob } from "./generation-jobs";

/**
 * Starts (or resumes) a generation job after the current HTTP response has
 * been sent. `after()` keeps the server/function alive until the runner
 * finishes, so the job does not depend on the browser that triggered it.
 * Calling this for a job that already has a live runner is a cheap no-op.
 */
export function kickGenerationJob(jobId: string): void {
  after(async () => {
    await runGenerationJob(jobId, { onContinue: requestContinuation });
  });
}

/** Base URL of this deployment, from server config only — never from request headers. */
function getAppBaseUrl(): string | null {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return vercelHost ? `https://${vercelHost}` : null;
}

/**
 * Serverless hand-off: when a runner spends its time budget, it asks a fresh
 * function invocation to pick the job up. Without CRON_SECRET and a base URL
 * the job is still resumed by the next status poll or cron sweep.
 */
async function requestContinuation(jobId: string): Promise<void> {
  const baseUrl = getAppBaseUrl();
  const secret = process.env.CRON_SECRET;
  if (!baseUrl || !secret) {
    logger.warn(
      { jobId },
      "Cannot hand off generation job (APP_BASE_URL/CRON_SECRET not set); it will resume on the next status poll or sweep",
    );
    return;
  }
  // The runner has already released its lease, so if both attempts fail the
  // job is immediately claimable by the next scheduled sweep.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/api/generation/jobs/run?id=${encodeURIComponent(jobId)}`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) return;
      logger.warn({ jobId, status: res.status, attempt }, "Generation job hand-off was rejected");
      if (res.status === 401) return;
    } catch (err) {
      logger.warn({ err, jobId, attempt }, "Generation job hand-off request failed");
    }
  }
}

export function isAuthorizedRunnerRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
