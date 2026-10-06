import { ZodError, type ZodType } from "zod";

const STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_FAILED: 422,
  AI_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof STATUS;

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Sign in to continue.",
  FORBIDDEN: "You cannot do that.",
  NOT_FOUND: "Not found.",
  CONFLICT: "That conflicts with the current state.",
  VALIDATION_FAILED: "The request is not valid.",
  AI_UNAVAILABLE: "The AI service is unavailable right now.",
  INTERNAL: "Something went wrong.",
};

/** An expected failure with a defined HTTP outcome. Anything else thrown is a bug and becomes INTERNAL. */
export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = DEFAULT_MESSAGE[code],
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Another user's record is reported exactly like a missing one, so ids cannot be probed. */
export function found<T>(value: T | null | undefined | false): T {
  if (value === null || value === undefined || value === false) throw new HttpError("NOT_FOUND");
  return value;
}

export const json = (data: unknown, status = 200) => Response.json({ data }, { status });

export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError("VALIDATION_FAILED", "The request body must be JSON.");
  }
  return schema.parse(body);
}

function errorResponse(code: ErrorCode, message: string, details?: unknown) {
  return Response.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status: STATUS[code] });
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) return errorResponse(error.code, error.message, error.details);
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    return errorResponse("VALIDATION_FAILED", DEFAULT_MESSAGE.VALIDATION_FAILED, details);
  }
  // Prisma's code for a unique-constraint violation.
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    return errorResponse("CONFLICT", DEFAULT_MESSAGE.CONFLICT);
  }
  console.error(JSON.stringify({ level: "error", event: "unhandled_route_error", message: String(error) }));
  return errorResponse("INTERNAL", DEFAULT_MESSAGE.INTERNAL);
}

type Params = Record<string, string>;
type Context<P extends Params> = { params: Promise<P> };

/**
 * Wraps a route handler so every failure leaves as `{ error: { code, message, details? } }`.
 * Handlers stay thin: parse, get the user, call one service, shape the response.
 */
export function route<P extends Params = Params>(handler: (request: Request, params: P) => Promise<Response>) {
  return async (request: Request, context: Context<P>): Promise<Response> => {
    try {
      return await handler(request, await context.params);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
