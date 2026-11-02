import { NextResponse } from "next/server";
import { jobIdNeedsRunner, sweepStalledJobs } from "@/lib/generation-jobs";
import { isAuthorizedRunnerRequest, kickGenerationJob } from "@/lib/generation-job-runner";

export const maxDuration = 300;

/**
 * Internal runner endpoint, protected by `Authorization: Bearer $CRON_SECRET`.
 * - `?id=<jobId>`: serverless hand-off from a runner whose time budget ran out.
 * - no id: sweep for stalled jobs — resumes interrupted ones, fails ones too
 *   old to be useful (vercel.json cron; safe to call from any scheduler).
 */
async function handle(req: Request) {
  if (!isAuthorizedRunnerRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const started = (await jobIdNeedsRunner(id)) ? [id] : [];
    for (const jobId of started) kickGenerationJob(jobId);
    return NextResponse.json({ started, abandoned: [] }, { status: 202 });
  }
  const { resume, abandoned } = await sweepStalledJobs();
  // Each runner observes its own time budget, so several can share one invocation.
  for (const jobId of resume) kickGenerationJob(jobId);
  return NextResponse.json({ started: resume, abandoned }, { status: 202 });
}

export const POST = handle;
export const GET = handle;
