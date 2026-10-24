import { NextResponse } from "next/server";
import { getAuthenticatedUser, AuthenticatedUser } from "../auth";
import { deductCredits, refundCredits, getCreditBalance } from "./service";
import { OperationType } from "./config";
import { logger } from "../logger";
import { safeErrorResponse } from "../safe-error";
import { z } from "zod";

export interface ExecutePaidOperationOptions<TSchema extends z.ZodTypeAny> {
  cost: number;
  operationType: OperationType;
  schema: TSchema;
  operationId?: string;
  description?: string;
  getOperationId?: (body: z.output<TSchema>) => string | undefined;
  getDescription?: (body: z.output<TSchema>) => string;
}

/**
 * Executes a paid AI operation strictly adhering to the 6 required steps:
 * 1. Authenticate the user on the server (401 if unauthenticated).
 * 2. Validate the request (400 if invalid).
 * 3. Check the user's available credits.
 * 4. Reserve or deduct credits atomically so simultaneous requests cannot overspend (402 if insufficient).
 * 5. Execute the provider operation.
 * 6. Finalize the deduction on success and apply automatic credit refund on failure.
 */
export async function executePaidOperation<TSchema extends z.ZodTypeAny, TResult>(
  req: Request,
  options: ExecutePaidOperationOptions<TSchema>,
  execute: (validatedBody: z.output<TSchema>, user: AuthenticatedUser) => Promise<TResult>,
): Promise<NextResponse> {
  // Step 1: Authenticate the user on the server
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

  // Step 2: Validate the request body
  let rawBody: any;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const parsed = options.schema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const operationId = options.getOperationId ? options.getOperationId(parsed.data) : options.operationId;
  const description = options.getDescription
    ? options.getDescription(parsed.data)
    : (options.description ?? options.operationType);

  // Step 3 & 4: Check user's available credits and reserve/deduct credits atomically
  const deduction = await deductCredits(
    user.id,
    options.cost,
    options.operationType,
    operationId,
    description,
  );

  if (!deduction.success) {
    return NextResponse.json(
      {
        error: `Insufficient credits. This operation requires ${options.cost} credit${
          options.cost > 1 ? "s" : ""
        }, but you have ${deduction.available ?? 0} credit${
          deduction.available === 1 ? "" : "s"
        } available.`,
        code: deduction.error,
        required: options.cost,
        available: deduction.available ?? 0,
      },
      { status: 402 },
    );
  }

  // Step 5: Execute the provider operation
  try {
    const result = await execute(parsed.data, user);
    const balance = deduction.balance ?? (await getCreditBalance(user.id));

    // Step 6: Finalize deduction on success
    if (typeof result === "object" && result !== null && !Array.isArray(result)) {
      return NextResponse.json({ ...result, creditsRemaining: balance }, { status: 200 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    // Step 6: Apply clearly defined refund policy for failed operations
    logger.warn(
      { userId: user.id, cost: options.cost, operationType: options.operationType, err },
      "Paid AI operation failed; issuing automatic credit refund",
    );
    const reason = err instanceof Error ? err.message : String(err);
    await refundCredits(user.id, options.cost, options.operationType, operationId, reason);

    const httpStatus =
      typeof err === "object" && err !== null && typeof (err as any).status === "number"
        ? (err as any).status
        : 502;

    if (httpStatus >= 400 && httpStatus < 500) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: httpStatus },
      );
    }

    return safeErrorResponse(
      err,
      `Operation failed. Your ${options.cost} credit${
        options.cost > 1 ? "s have" : " has"
      } been refunded.`,
      502,
    );
  }
}
