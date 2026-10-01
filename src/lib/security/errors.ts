import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { RateLimitResult } from "./rate-limit";

/** Errors whose message is safe to show to the end user. */
export class PublicError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "bad_request",
  ) {
    super(message);
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof PublicError) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation_error", message: err.issues.map((i) => i.message).join("; ") } },
      { status: 400 },
    );
  }
  // Never leak internals (stack traces, provider URLs, keys) to the client.
  console.error("[chainscope] unhandled error", err);
  return NextResponse.json(
    { error: { code: "internal_error", message: "An unexpected error occurred. Please retry later." } },
    { status: 500 },
  );
}

export function rateLimitedResponse(rl: RateLimitResult) {
  return NextResponse.json(
    { error: { code: "rate_limited", message: "Too many requests. Please wait a moment and retry." } },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}
