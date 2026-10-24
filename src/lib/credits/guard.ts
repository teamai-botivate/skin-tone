import { NextResponse } from "next/server";
import { getAuthenticatedUser, AuthenticatedUser } from "../auth";
import { OperationType } from "./config";
import { logger } from "../logger";
import { safeErrorResponse } from "../safe-error";
import { z } from "zod";

export interface ExecutePaidOperationOptions<TSchema extends z.ZodTypeAny> {
  cost?: number;
  operationType: OperationType | string;
  schema: TSchema;
  operationId?: string;
  description?: string;
  getOperationId?: (body: z.output<TSchema>) => string | undefined;
  getDescription?: (body: z.output<TSchema>) => string;
}

/**
 * Executes an AI operation:
 * 1. Authenticate the user on the server (401 if unauthenticated).
 * 2. Validate the request (400 if invalid).
 * 3. Execute the operation without credit restrictions or deductions.
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

  // Step 3: Execute the operation directly without credit limitations
  try {
    const result = await execute(parsed.data, user);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    logger.warn(
      { userId: user.id, operationType: options.operationType, err },
      "AI operation failed",
    );

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
      "Operation failed. Please try again.",
      502,
    );
  }
}

