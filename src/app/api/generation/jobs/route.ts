import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  CreateGenerationJobSchema,
  GenerationJobsUnavailableError,
  createGenerationJob,
} from "@/lib/generation-jobs";
import { kickGenerationJob } from "@/lib/generation-job-runner";
import { logger } from "@/lib/logger";
import { safeErrorResponse } from "@/lib/safe-error";

// The job runner continues inside after() once this response is sent.
export const maxDuration = 300;

/** Submits a background outfit + image generation job. Returns immediately with its id. */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json(
      {
        error: "Authentication required. Please log in or create an account to use LetStyle AI features.",
        code: "UNAUTHORIZED",
      },
      { status: 401 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
  const parsed = CreateGenerationJobSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const job = await createGenerationJob(user.id, parsed.data);
    kickGenerationJob(job.id);
    return NextResponse.json({ job }, { status: 202 });
  } catch (err) {
    if (err instanceof GenerationJobsUnavailableError) {
      logger.warn({ userId: user.id }, "Background generation unavailable; client should fall back");
      return NextResponse.json(
        { error: err.message, code: "JOBS_UNAVAILABLE" },
        { status: 503 },
      );
    }
    return safeErrorResponse(err, "Could not start generation. Please try again.", 500);
  }
}
