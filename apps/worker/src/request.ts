import type { Context } from 'hono';
import type { ZodError, ZodType } from 'zod';
import type { WorkerEnvironment } from './env';
import { ApiError } from './errors';
const MAX_JSON_BYTES = 32 * 1024;
export function validationError(error: ZodError): ApiError {
  return new ApiError(400, 'INVALID_REQUEST', 'The request did not match the API contract.', {
    issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  });
}

export async function parseJson<T>(
  context: Context<WorkerEnvironment>,
  schema: ZodType<T>,
): Promise<T> {
  let value: unknown;
  try {
    const body = await context.req.arrayBuffer();
    if (body.byteLength > MAX_JSON_BYTES) {
      throw new ApiError(413, 'REQUEST_TOO_LARGE', 'The request body is too large.');
    }
    value = JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_JSON', 'The request body must contain valid JSON.');
  }
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function requireSafeMutation(input: {
  readonly appOrigin: string;
  readonly contentLength: string | undefined;
  readonly contentType: string | undefined;
  readonly origin: string | undefined;
}): void {
  const contentType = input.contentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new ApiError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Mutations require Content-Type: application/json.',
    );
  }
  const contentLength = Number(input.contentLength ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    throw new ApiError(413, 'REQUEST_TOO_LARGE', 'The request body is too large.');
  }
  if (input.origin !== input.appOrigin) {
    throw new ApiError(403, 'INVALID_ORIGIN', 'The request origin is not allowed.');
  }
}
