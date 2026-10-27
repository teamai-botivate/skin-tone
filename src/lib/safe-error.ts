import { NextResponse } from "next/server";
import { logger } from "./logger";

/**
 * Safely extracts a readable string from any error, event, rejection reason, or unknown object.
 * Guarantees that "[object Event]" or "[object Object]" is never returned.
 */
export function extractErrorMessage(
  err: unknown,
  fallback = "An unexpected error occurred. Please try again.",
): string {
  if (!err) return fallback;
  if (err instanceof Error) {
    const msg = err.message?.trim();
    if (msg && msg !== "[object Event]" && msg !== "[object Object]") return msg;
    return fallback;
  }
  if (typeof err === "string") {
    const trimmed = err.trim();
    if (trimmed && trimmed !== "[object Event]" && trimmed !== "[object Object]") return trimmed;
    return fallback;
  }
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message && obj.message !== "[object Event]") {
      return obj.message;
    }
    if (typeof obj.error === "string" && obj.error && obj.error !== "[object Event]") {
      return obj.error;
    }
    // Check if it's a DOM Event / ErrorEvent / ProgressEvent
    if ("type" in obj || "target" in obj || "isTrusted" in obj) {
      const type = typeof obj.type === "string" ? obj.type : "";
      return type
        ? `Browser network or asset event error (${type}). Please refresh the page.`
        : "Network connection or resource loading error. Please refresh the page.";
    }
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return json;
    } catch {
      // ignore
    }
  }
  const str = String(err);
  if (str === "[object Event]" || str === "[object Object]" || str === "[object ProgressEvent]") {
    return fallback;
  }
  return str || fallback;
}

/**
 * Sanitizes an error message so that internal tokens, API keys, provider
 * traces, or file system paths are never leaked to the client browser.
 */
export function sanitizeErrorMessage(
  err: unknown,
  defaultMessage: string = "An error occurred while processing your request.",
): string {
  if (!err) return defaultMessage;
  const rawMsg = extractErrorMessage(err, defaultMessage);

  // If the message contains sensitive keywords or key patterns, sanitize completely
  const sensitivePatterns = [
    /sk-[a-zA-Z0-9_-]{10,}/i,
    /tvly-[a-zA-Z0-9_-]{10,}/i,
    /bearer\s+/i,
    /api[_-]?key/i,
    /authorization/i,
    /password/i,
    /secret/i,
    /credential/i,
  ];

  const hasSensitiveData = sensitivePatterns.some((pattern) => pattern.test(rawMsg));

  if (hasSensitiveData) {
    if (/401|invalid_api_key|unauthorized/i.test(rawMsg)) {
      return "Authentication with the external service provider failed. Please verify server configuration.";
    }
    if (/429|rate_limit|quota/i.test(rawMsg)) {
      return "The service is temporarily rate limited. Please try again in a few moments.";
    }
    return defaultMessage;
  }

  // Catch common provider error classifications
  if (/401|unauthorized/i.test(rawMsg)) {
    return "Service provider authentication failed. Please verify server configuration.";
  }
  if (/429|quota|rate limit/i.test(rawMsg)) {
    return "Rate limit reached. Please wait a few moments and try again.";
  }
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET/i.test(rawMsg)) {
    return "The request to the external service timed out. Please try again.";
  }

  // Remove internal filesystem paths
  const cleanMsg = rawMsg.replace(/([A-Z]:\\[^\s:]+)|(\/[a-zA-Z0-9_.-]+\/[^\s:]+)/g, "[internal path]");

  // If it's a reasonably sized message without secrets, return it for user clarity
  if (cleanMsg.length < 250 && cleanMsg !== "[object Event]" && cleanMsg !== "[object Object]") {
    return cleanMsg;
  }

  return defaultMessage;
}

/**
 * Builds a safe JSON error response for Next.js API routes.
 * Logs full diagnostic details on the server without leaking secrets.
 */
export function safeErrorResponse(
  err: unknown,
  defaultMessage: string,
  status: number = 502,
): NextResponse {
  const errDetails =
    err instanceof Error
      ? { message: err.message, stack: err.stack, name: err.name, ...((err as unknown) as Record<string, unknown>) }
      : { message: String(err) };


  // Sanitize any potential API keys from the logged object as an extra layer of defense
  const sanitizedLog = JSON.parse(
    JSON.stringify(errDetails, (key, value) => {
      if (typeof value === "string") {
        return value
          .replace(/sk-[a-zA-Z0-9_-]{10,}/gi, "sk-***")
          .replace(/tvly-[a-zA-Z0-9_-]{10,}/gi, "tvly-***");
      }
      return value;
    }),
  );

  logger.error({ err: sanitizedLog }, defaultMessage);
  console.error(`[API Error] ${defaultMessage}:`, sanitizedLog.message || sanitizedLog);

  return NextResponse.json(
    {
      error: defaultMessage,
      message: sanitizeErrorMessage(err, defaultMessage),
    },
    { status },
  );
}

