import { CryptoRandomSource } from '@family-game-night/sequence-engine';
import {
  createGameRequestSchema,
  createInvitationRequestSchema,
  eventListQuerySchema,
  gameIdSchema,
  gameListQuerySchema,
  invitationIdSchema,
  lobbyPatchRequestSchema,
  sequenceCommandRequestSchema,
  updateProfileRequestSchema,
  versionedMutationRequestSchema,
} from '@family-game-night/shared';
import { Hono } from 'hono';

import { verifyAccessJwt } from './auth/access-jwt';
import { parseWorkerConfig } from './config/environment';
import { listGames, listInvitations } from './db/dashboard';
import { listPublicEvents, loadVisibleGame } from './db/games';
import { listDirectoryUsers, provisionUser, updateUserProfile } from './db/users';
import { ApiError, apiErrorBody } from './errors';
import {
  applyGameCommand,
  cancelGame,
  cancelInvitation,
  createGame,
  createInvitation,
  patchLobby,
  respondToInvitation,
  startGame,
} from './games/service';
import { toGameDetail } from './games/views';

import type { HealthResponse, UserProfileDto } from '@family-game-night/shared';
import type { RandomSource } from '@family-game-night/sequence-engine';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodError, ZodType } from 'zod';
import type { WorkerEnvironment } from './env';

export interface WorkerAppDependencies {
  readonly createId?: () => string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly random?: RandomSource;
}

const API_PREFIX = '/api/v1';
const MAX_JSON_BYTES = 32 * 1024;

function apiJson<T>(
  context: Context<WorkerEnvironment>,
  value: T,
  status: ContentfulStatusCode = 200,
): Response {
  return context.json(value, status, { 'Cache-Control': 'no-store' });
}

function validationError(error: ZodError): ApiError {
  return new ApiError(400, 'INVALID_REQUEST', 'The request did not match the API contract.', {
    issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  });
}

async function parseJson<T>(context: Context<WorkerEnvironment>, schema: ZodType<T>): Promise<T> {
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

function parseGameId(context: Context<WorkerEnvironment>): string {
  const parsed = gameIdSchema.safeParse(context.req.param('gameId'));
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function parseInvitationId(context: Context<WorkerEnvironment>): string {
  const parsed = invitationIdSchema.safeParse(context.req.param('inviteId'));
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function isMutation(method: string): boolean {
  return method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
}

function requireSafeMutation(input: {
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

function authenticatedUser(context: Context<WorkerEnvironment>): UserProfileDto {
  return context.get('user');
}

export function createApp(dependencies: WorkerAppDependencies = {}): Hono<WorkerEnvironment> {
  const app = new Hono<WorkerEnvironment>();
  const createId = dependencies.createId ?? (() => crypto.randomUUID());
  const now = dependencies.now ?? (() => new Date());
  const random = dependencies.random ?? new CryptoRandomSource();
  const serviceDependencies = { createId, now: () => now().toISOString(), random };

  app.use('*', async (context, next) => {
    const requestId = createId();
    const startedAt = Date.now();
    context.set('requestId', requestId);
    try {
      if (context.req.path.startsWith(API_PREFIX) && context.req.path !== `${API_PREFIX}/health`) {
        const config = parseWorkerConfig(context.env);
        context.set('config', config);
        if (isMutation(context.req.method)) {
          requireSafeMutation({
            appOrigin: config.appOrigin,
            contentLength: context.req.header('Content-Length'),
            contentType: context.req.header('Content-Type'),
            origin: context.req.header('Origin'),
          });
        }

        let email: string;
        if (config.environment === 'development' || config.environment === 'test') {
          if (config.devAuthEmail === undefined) {
            throw new Error('Development authentication is not configured.');
          }
          email = config.devAuthEmail;
        } else {
          const token = context.req.header('Cf-Access-Jwt-Assertion');
          if (token === undefined || token.length === 0) {
            throw new ApiError(401, 'UNAUTHENTICATED', 'A Cloudflare Access session is required.');
          }
          const verified = await verifyAccessJwt(token, config, {
            fetch: dependencies.fetch ?? fetch,
            now: () => now().getTime(),
          });
          email = verified.email;
        }
        context.set(
          'user',
          await provisionUser({
            db: context.env.DB,
            email,
            adminEmail: config.adminEmail,
            now: now().toISOString(),
            createId,
          }),
        );
      }
      await next();
    } finally {
      const response = context.res;
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set(
        'Content-Security-Policy',
        "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
      response.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('Referrer-Policy', 'no-referrer');
      console.info(
        JSON.stringify({
          requestId,
          method: context.req.method,
          route: context.req.path,
          status: response.status,
          durationMs: Date.now() - startedAt,
        }),
      );
    }
  });

  app.get(`${API_PREFIX}/health`, (context) => {
    const response: HealthResponse = { ok: true, service: 'family-game-night-api' };
    return apiJson(context, response);
  });

  app.get(`${API_PREFIX}/me`, (context) => apiJson(context, authenticatedUser(context)));

  app.patch(`${API_PREFIX}/me`, async (context) => {
    const request = await parseJson(context, updateProfileRequestSchema);
    return apiJson(
      context,
      await updateUserProfile({
        db: context.env.DB,
        userId: authenticatedUser(context).id,
        displayName: request.displayName,
        now: now().toISOString(),
      }),
    );
  });

  app.get(`${API_PREFIX}/users`, async (context) =>
    apiJson(context, await listDirectoryUsers(context.env.DB, authenticatedUser(context).role)),
  );

  app.get(`${API_PREFIX}/games`, async (context) => {
    const parsed = gameListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) throw validationError(parsed.error);
    const user = authenticatedUser(context);
    return apiJson(
      context,
      await listGames({
        db: context.env.DB,
        userId: user.id,
        bucket: parsed.data.bucket,
        limit: parsed.data.limit,
        ...(parsed.data.cursor === undefined ? {} : { cursor: parsed.data.cursor }),
      }),
    );
  });

  app.get(`${API_PREFIX}/invitations`, async (context) =>
    apiJson(
      context,
      await listInvitations({
        db: context.env.DB,
        email: authenticatedUser(context).email,
      }),
    ),
  );

  for (const response of ['accept', 'decline'] as const) {
    app.post(`${API_PREFIX}/invitations/:inviteId/${response}`, async (context) => {
      const request = await parseJson(context, versionedMutationRequestSchema);
      return apiJson(
        context,
        await respondToInvitation({
          db: context.env.DB,
          invitationId: parseInvitationId(context),
          viewer: authenticatedUser(context),
          request,
          response: response === 'accept' ? 'accepted' : 'declined',
          dependencies: serviceDependencies,
        }),
      );
    });
  }

  app.post(`${API_PREFIX}/games`, async (context) => {
    const request = await parseJson(context, createGameRequestSchema);
    return apiJson(
      context,
      await createGame({
        db: context.env.DB,
        viewer: authenticatedUser(context),
        request,
        dependencies: serviceDependencies,
      }),
      201,
    );
  });

  app.get(`${API_PREFIX}/games/:gameId`, async (context) => {
    const user = authenticatedUser(context);
    const game = await loadVisibleGame({
      db: context.env.DB,
      gameId: parseGameId(context),
      userId: user.id,
      userRole: user.role,
    });
    return apiJson(context, toGameDetail(game, user));
  });

  app.patch(`${API_PREFIX}/games/:gameId/lobby`, async (context) => {
    const request = await parseJson(context, lobbyPatchRequestSchema);
    return apiJson(
      context,
      await patchLobby({
        db: context.env.DB,
        gameId: parseGameId(context),
        viewer: authenticatedUser(context),
        request,
        dependencies: serviceDependencies,
      }),
    );
  });

  app.post(`${API_PREFIX}/games/:gameId/invitations`, async (context) => {
    const request = await parseJson(context, createInvitationRequestSchema);
    return apiJson(
      context,
      await createInvitation({
        db: context.env.DB,
        gameId: parseGameId(context),
        viewer: authenticatedUser(context),
        request,
        dependencies: serviceDependencies,
      }),
      201,
    );
  });

  app.delete(`${API_PREFIX}/games/:gameId/invitations/:inviteId`, async (context) => {
    const request = await parseJson(context, versionedMutationRequestSchema);
    return apiJson(
      context,
      await cancelInvitation({
        db: context.env.DB,
        gameId: parseGameId(context),
        invitationId: parseInvitationId(context),
        viewer: authenticatedUser(context),
        request,
        dependencies: serviceDependencies,
      }),
    );
  });

  app.post(`${API_PREFIX}/games/:gameId/start`, async (context) => {
    const request = await parseJson(context, versionedMutationRequestSchema);
    return apiJson(
      context,
      await startGame({
        db: context.env.DB,
        gameId: parseGameId(context),
        viewer: authenticatedUser(context),
        request,
        dependencies: serviceDependencies,
      }),
    );
  });

  app.post(`${API_PREFIX}/games/:gameId/cancel`, async (context) => {
    const request = await parseJson(context, versionedMutationRequestSchema);
    return apiJson(
      context,
      await cancelGame({
        db: context.env.DB,
        gameId: parseGameId(context),
        viewer: authenticatedUser(context),
        request,
        dependencies: serviceDependencies,
      }),
    );
  });

  app.post(`${API_PREFIX}/games/:gameId/commands`, async (context) => {
    const request = await parseJson(context, sequenceCommandRequestSchema);
    return apiJson(
      context,
      await applyGameCommand({
        db: context.env.DB,
        gameId: parseGameId(context),
        viewer: authenticatedUser(context),
        request,
        dependencies: serviceDependencies,
      }),
    );
  });

  app.get(`${API_PREFIX}/games/:gameId/events`, async (context) => {
    const parsed = eventListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) throw validationError(parsed.error);
    const user = authenticatedUser(context);
    return apiJson(
      context,
      await listPublicEvents({
        db: context.env.DB,
        gameId: parseGameId(context),
        userId: user.id,
        userRole: user.role,
        afterVersion: parsed.data.afterVersion,
        limit: parsed.data.limit,
      }),
    );
  });

  app.notFound((context) =>
    apiJson(
      context,
      apiErrorBody(new ApiError(404, 'NOT_FOUND', 'The requested endpoint was not found.')),
      404,
    ),
  );

  app.onError((error, context) => {
    const requestId = context.get('requestId') ?? createId();
    if (error instanceof ApiError) {
      return apiJson(context, apiErrorBody(error), error.status);
    }
    console.error(
      JSON.stringify({
        requestId,
        route: context.req.path,
        error: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
    return apiJson(
      context,
      apiErrorBody(
        new ApiError(500, 'INTERNAL_ERROR', 'An unexpected server error occurred.'),
        requestId,
      ),
      500,
    );
  });

  return app;
}

export const app = createApp();
