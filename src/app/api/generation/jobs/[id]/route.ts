import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getGenerationJobForUser, jobIdNeedsRunner } from "@/lib/generation-jobs";
import { kickGenerationJob } from "@/lib/generation-job-runner";
import { safeErrorResponse } from "@/lib/safe-error";

// May resume a stalled job inside after().
export const maxDuration = 300;

/**
 * Job status for the owner. Image data is not included (each image can be
 * several hundred KB); fetch ready ones from ./images/[lookId].
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required.", code: "UNAUTHORIZED" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const job = await getGenerationJobForUser(id, user.id);
    if (!job) return NextResponse.json({ error: "Generation job not found" }, { status: 404 });

    // Recovery path: if the runner died (deploy, crash, serverless timeout),
    // the user coming back resumes it.
    if (await jobIdNeedsRunner(id)) kickGenerationJob(id);

    return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return safeErrorResponse(err, "Could not load generation status.", 500);
  }
}
