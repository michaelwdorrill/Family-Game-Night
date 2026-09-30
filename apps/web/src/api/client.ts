import {
  apiErrorBodySchema,
  directoryUserListSchema,
  gameDetailSchema,
  gameSummaryPageSchema,
  invitationListSchema,
  userProfileSchema,
} from '@family-game-night/shared';
import { z } from 'zod';

import type {
  CreateGameRequest,
  CreateInvitationRequest,
  DashboardBucket,
  DirectoryUserDto,
  GameDetailDto,
  GameSummaryPageDto,
  InvitationListDto,
  LobbyPatchRequest,
  SequenceCommandRequest,
  UserProfileDto,
  VersionedMutationRequest,
} from '@family-game-night/shared';
import type { ZodType } from 'zod';

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly details: Readonly<Record<string, unknown>>;
  public readonly status: number;

  public constructor(
    status: number,
    code: string,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const declinedInvitationSchema = z
  .object({
    gameId: z.string().uuid(),
    status: z.literal('declined'),
    version: z.number().int().nonnegative(),
  })
  .strict();
const leftLobbySchema = z
  .object({
    gameId: z.string().uuid(),
    left: z.literal(true),
    version: z.number().int().nonnegative(),
  })
  .strict();

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiClientError(
      response.status,
      'INVALID_API_RESPONSE',
      'The game service returned an unreadable response.',
    );
  }
}

async function apiRequest<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      'The game service could not be reached. Check your connection and try again.',
    );
  }
  const body = await responseBody(response);
  if (!response.ok) {
    const parsedError = apiErrorBodySchema.safeParse(body);
    if (parsedError.success) {
      throw new ApiClientError(
        response.status,
        parsedError.data.error.code,
        parsedError.data.error.message,
        parsedError.data.error.details,
      );
    }
    throw new ApiClientError(
      response.status,
      'INVALID_API_RESPONSE',
      'The game service returned an unexpected error.',
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiClientError(
      response.status,
      'INVALID_API_RESPONSE',
      'The game service returned data the app could not safely read.',
    );
  }
  return parsed.data;
}

function mutation(method: 'DELETE' | 'PATCH' | 'POST', body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function getMe(): Promise<UserProfileDto> {
  return apiRequest('/api/v1/me', userProfileSchema);
}

export function updateMe(displayName: string): Promise<UserProfileDto> {
  return apiRequest('/api/v1/me', userProfileSchema, mutation('PATCH', { displayName }));
}

export async function getDirectory(): Promise<readonly DirectoryUserDto[]> {
  const users = await apiRequest('/api/v1/users', directoryUserListSchema);
  return users.map((user) =>
    user.email === undefined
      ? { id: user.id, displayName: user.displayName }
      : { id: user.id, displayName: user.displayName, email: user.email },
  );
}

export function getGameList(bucket: DashboardBucket, cursor?: string): Promise<GameSummaryPageDto> {
  const query = new URLSearchParams({ bucket });
  if (cursor !== undefined) query.set('cursor', cursor);
  return apiRequest(`/api/v1/games?${query.toString()}`, gameSummaryPageSchema);
}

export function getInvitations(): Promise<InvitationListDto> {
  return apiRequest('/api/v1/invitations', invitationListSchema);
}

export function respondToInvitation(
  invitationId: string,
  response: 'accept' | 'decline',
  request: VersionedMutationRequest,
): Promise<
  GameDetailDto | { readonly gameId: string; readonly status: 'declined'; readonly version: number }
> {
  return apiRequest(
    `/api/v1/invitations/${encodeURIComponent(invitationId)}/${response}`,
    response === 'accept'
      ? gameDetailSchema
      : // Declining intentionally returns no private game view because the user remains a nonmember.
        gameDetailSchema.or(declinedInvitationSchema),
    mutation('POST', request),
  );
}

export function createGame(request: CreateGameRequest): Promise<GameDetailDto> {
  return apiRequest('/api/v1/games', gameDetailSchema, mutation('POST', request));
}

export function getGame(gameId: string): Promise<GameDetailDto> {
  return apiRequest(`/api/v1/games/${encodeURIComponent(gameId)}`, gameDetailSchema);
}

export function updateLobby(
  gameId: string,
  request: LobbyPatchRequest,
): Promise<
  GameDetailDto | { readonly gameId: string; readonly left: true; readonly version: number }
> {
  return apiRequest(
    `/api/v1/games/${encodeURIComponent(gameId)}/lobby`,
    gameDetailSchema.or(leftLobbySchema),
    mutation('PATCH', request),
  );
}

export function inviteToGame(
  gameId: string,
  request: CreateInvitationRequest,
): Promise<GameDetailDto> {
  return apiRequest(
    `/api/v1/games/${encodeURIComponent(gameId)}/invitations`,
    gameDetailSchema,
    mutation('POST', request),
  );
}

export function cancelGameInvitation(
  gameId: string,
  invitationId: string,
  request: VersionedMutationRequest,
): Promise<GameDetailDto> {
  return apiRequest(
    `/api/v1/games/${encodeURIComponent(gameId)}/invitations/${encodeURIComponent(invitationId)}`,
    gameDetailSchema,
    mutation('DELETE', request),
  );
}

export function startGame(
  gameId: string,
  request: VersionedMutationRequest,
): Promise<GameDetailDto> {
  return apiRequest(
    `/api/v1/games/${encodeURIComponent(gameId)}/start`,
    gameDetailSchema,
    mutation('POST', request),
  );
}

export function cancelGame(
  gameId: string,
  request: VersionedMutationRequest,
): Promise<GameDetailDto> {
  return apiRequest(
    `/api/v1/games/${encodeURIComponent(gameId)}/cancel`,
    gameDetailSchema,
    mutation('POST', request),
  );
}

export function applySequenceCommand(
  gameId: string,
  request: SequenceCommandRequest,
): Promise<GameDetailDto> {
  return apiRequest(
    `/api/v1/games/${encodeURIComponent(gameId)}/commands`,
    gameDetailSchema,
    mutation('POST', request),
  );
}

export const queryKeys = {
  me: ['me'] as const,
  directory: ['directory'] as const,
  invitations: ['invitations'] as const,
  games: (bucket: DashboardBucket) => ['games', bucket] as const,
  game: (gameId: string) => ['game', gameId] as const,
};
