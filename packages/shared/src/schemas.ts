import { z } from 'zod';

export const userIdSchema = z.string().uuid();
export const gameIdSchema = z.string().uuid();
export const invitationIdSchema = z.string().uuid();
export const commandIdSchema = z.string().uuid();
export const expectedVersionSchema = z.number().int().nonnegative();
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const displayNameSchema = z.string().trim().min(1).max(50);
export const gameTitleSchema = z.string().trim().min(1).max(80);
export const teamIndexSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const healthResponseSchema = z
  .object({
    ok: z.literal(true),
    service: z.literal('family-game-night-api'),
  })
  .strict();

export const updateProfileRequestSchema = z
  .object({
    displayName: displayNameSchema,
  })
  .strict();

export const createGameRequestSchema = z
  .object({
    commandId: commandIdSchema,
    gameType: z.literal('sequence'),
    teamCount: z.union([z.literal(2), z.literal(3)]),
    title: gameTitleSchema,
  })
  .strict();

const mutationEnvelopeShape = {
  commandId: commandIdSchema,
  expectedVersion: expectedVersionSchema,
};

export const createInvitationRequestSchema = z.discriminatedUnion('targetType', [
  z
    .object({
      ...mutationEnvelopeShape,
      targetType: z.literal('email'),
      email: emailSchema,
    })
    .strict(),
  z
    .object({
      ...mutationEnvelopeShape,
      targetType: z.literal('user'),
      userId: userIdSchema,
    })
    .strict(),
]);

export const versionedMutationRequestSchema = z
  .object({
    ...mutationEnvelopeShape,
  })
  .strict();

export const lobbyPatchRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...mutationEnvelopeShape,
      action: z.literal('SET_TEAM_ASSIGNMENTS'),
      assignments: z
        .array(
          z
            .object({
              userId: userIdSchema,
              teamIndex: teamIndexSchema,
            })
            .strict(),
        )
        .min(1)
        .max(12),
    })
    .strict(),
  z
    .object({
      ...mutationEnvelopeShape,
      action: z.literal('LEAVE'),
    })
    .strict(),
]);

export const sequenceCommandRequestSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('PLAY_CARD'),
      commandId: commandIdSchema,
      expectedVersion: expectedVersionSchema,
      cardId: z.string().trim().min(1).max(16),
      targetCell: z.number().int().min(0).max(99),
      sequenceSelection: z.array(z.string().trim().min(1).max(32)).max(2).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('EXCHANGE_DEAD_CARD'),
      commandId: commandIdSchema,
      expectedVersion: expectedVersionSchema,
      cardId: z.string().trim().min(1).max(16),
    })
    .strict(),
  z
    .object({
      type: z.literal('PASS_NO_LEGAL_MOVE'),
      commandId: commandIdSchema,
      expectedVersion: expectedVersionSchema,
    })
    .strict(),
]);

export const dashboardBucketSchema = z.enum(['active', 'waiting', 'finished']);

export const eventListQuerySchema = z
  .object({
    afterVersion: z.coerce.number().int().nonnegative().default(0),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();

export const gameListQuerySchema = z
  .object({
    bucket: dashboardBucketSchema,
    cursor: z.string().trim().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const userRoleSchema = z.enum(['admin', 'member']);
const gameStatusSchema = z.enum(['lobby', 'active', 'finished', 'cancelled']);
const membershipStatusSchema = z.enum(['invited', 'accepted', 'declined', 'left']);
const invitationStatusSchema = z.enum(['pending', 'accepted', 'declined', 'cancelled']);

export const apiErrorBodySchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.string(), z.unknown()),
        requestId: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export const userProfileSchema = z
  .object({
    id: userIdSchema,
    email: emailSchema,
    displayName: displayNameSchema,
    role: userRoleSchema,
    needsDisplayNameConfirmation: z.boolean(),
  })
  .strict();

export const directoryUserSchema = z
  .object({
    id: userIdSchema,
    displayName: displayNameSchema,
    email: emailSchema.optional(),
  })
  .strict();
export const directoryUserListSchema = z.array(directoryUserSchema).max(200);

export const publicGameEventSchema = z
  .object({
    version: z.number().int().positive(),
    turnNumber: z.number().int().nonnegative(),
    actorUserId: userIdSchema.nullable(),
    actorDisplayName: displayNameSchema.nullable(),
    eventType: z.string().trim().min(1).max(80),
    payload: z.record(z.string(), z.unknown()),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const invitationSchema = z
  .object({
    id: invitationIdSchema,
    gameId: gameIdSchema,
    gameTitle: gameTitleSchema,
    gameType: z.literal('sequence'),
    gameVersion: z.number().int().nonnegative(),
    hostDisplayName: displayNameSchema,
    status: invitationStatusSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const invitationListSchema = z
  .object({ invitations: z.array(invitationSchema).max(100) })
  .strict();

export const gameSummarySchema = z
  .object({
    id: gameIdSchema,
    gameType: z.literal('sequence'),
    title: gameTitleSchema,
    status: gameStatusSchema,
    version: z.number().int().nonnegative(),
    updatedAt: z.string().datetime({ offset: true }),
    currentPlayerId: userIdSchema.nullable(),
    currentPlayerDisplayName: displayNameSchema.nullable(),
    myTeamIndex: teamIndexSchema.nullable(),
    sequenceCounts: z.array(z.number().int().nonnegative()).max(3),
    winnerTeamIndex: teamIndexSchema.nullable(),
    action: z.enum(['take-turn', 'view', 'configure-lobby']),
  })
  .strict();
export const gameSummaryPageSchema = z
  .object({
    games: z.array(gameSummarySchema).max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();

const lobbyMemberSchema = z
  .object({
    userId: userIdSchema,
    displayName: displayNameSchema,
    membershipStatus: membershipStatusSchema,
    teamIndex: teamIndexSchema.nullable(),
    seatIndex: z.number().int().nonnegative().nullable(),
    isHost: z.boolean(),
  })
  .strict();
const lobbyInvitationSchema = z
  .object({
    id: invitationIdSchema,
    email: emailSchema.nullable(),
    status: invitationStatusSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const lobbyViewSchema = z
  .object({
    kind: z.literal('lobby'),
    id: gameIdSchema,
    gameType: z.literal('sequence'),
    title: gameTitleSchema,
    status: z.enum(['lobby', 'cancelled']),
    version: z.number().int().nonnegative(),
    hostUserId: userIdSchema,
    teamCount: z.union([z.literal(2), z.literal(3)]),
    members: z.array(lobbyMemberSchema).max(12),
    invitations: z.array(lobbyInvitationSchema).max(100),
    seatPreview: z.array(userIdSchema).max(12),
    validation: z.object({ valid: z.boolean(), errors: z.array(z.string()).max(20) }).strict(),
    permissions: z
      .object({ canManage: z.boolean(), canStart: z.boolean(), canLeave: z.boolean() })
      .strict(),
    recentEvents: z.array(publicGameEventSchema).max(30),
  })
  .strict();

const sequenceCardSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    rank: z.string(),
    suit: z.string(),
    kind: z.enum(['normal', 'two-eyed-jack', 'one-eyed-jack']),
    legalTargetCells: z.array(z.number().int().min(0).max(99)),
    isDead: z.boolean(),
  })
  .strict();

export const sequenceGameViewSchema = z
  .object({
    kind: z.literal('sequence'),
    id: gameIdSchema,
    gameType: z.literal('sequence'),
    title: gameTitleSchema,
    hostUserId: userIdSchema,
    status: z.enum(['active', 'finished', 'cancelled']),
    version: z.number().int().nonnegative(),
    turnNumber: z.number().int().nonnegative(),
    teamCount: z.union([z.literal(2), z.literal(3)]),
    targetSequences: z.union([z.literal(1), z.literal(2)]),
    players: z.array(
      z
        .object({
          userId: userIdSchema,
          displayName: displayNameSchema,
          seatIndex: z.number().int().nonnegative(),
          teamIndex: teamIndexSchema,
          handCount: z.number().int().nonnegative(),
          isCurrentPlayer: z.boolean(),
        })
        .strict(),
    ),
    currentPlayerId: userIdSchema.nullable(),
    myUserId: userIdSchema,
    myHand: z.array(sequenceCardSchema),
    board: z
      .object({
        layout: z.array(z.array(z.string()).length(10)).length(10),
        occupants: z.array(teamIndexSchema.nullable()).length(100),
        lastChangedCell: z.number().int().min(0).max(99).nullable(),
      })
      .strict(),
    claimedSequences: z.array(
      z
        .object({
          id: z.string(),
          teamIndex: teamIndexSchema,
          cells: z.array(z.number().int().min(0).max(99)).length(5),
          createdTurn: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    sequenceCounts: z.array(z.number().int().nonnegative()).max(3),
    deckCount: z.number().int().nonnegative(),
    discardCount: z.number().int().nonnegative(),
    deadCardExchangeUsed: z.boolean(),
    canPassNoLegalMove: z.boolean(),
    winnerTeamIndex: teamIndexSchema.nullable(),
    permissions: z.object({ canCancel: z.boolean() }).strict(),
    recentEvents: z.array(publicGameEventSchema).max(30),
  })
  .strict();

export const gameDetailSchema = z.discriminatedUnion('kind', [
  lobbyViewSchema,
  sequenceGameViewSchema,
]);

export const publicGameEventListSchema = z
  .object({ events: z.array(publicGameEventSchema).max(100) })
  .strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type CreateGameRequest = z.infer<typeof createGameRequestSchema>;
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;
export type VersionedMutationRequest = z.infer<typeof versionedMutationRequestSchema>;
export type LobbyPatchRequest = z.infer<typeof lobbyPatchRequestSchema>;
export type SequenceCommandRequest = z.infer<typeof sequenceCommandRequestSchema>;
export type DashboardBucket = z.infer<typeof dashboardBucketSchema>;
