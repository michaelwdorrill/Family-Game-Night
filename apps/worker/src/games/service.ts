import {
  CryptoRandomSource,
  InvalidGameSetupError,
  parseSequenceGameState,
} from '@family-game-night/sequence-engine';

import { commandHash } from '../commands/hash';
import {
  assertCommandIsNew,
  commitVersionedMutation,
  findAcceptedCommand,
  loadVisibleGame,
  parseStoredJson,
} from '../db/games';
import { ApiError } from '../errors';
import { parseSequenceLobbyState } from './lobby-state';
import { getGameModule } from './registry';
import { toGameDetail } from './views';

import type {
  CreateGameRequest,
  CreateInvitationRequest,
  GameDetailDto,
  LobbyPatchRequest,
  SequenceCommandRequest,
  UserProfileDto,
  VersionedMutationRequest,
} from '@family-game-night/shared';
import type {
  RandomSource,
  SequenceCommand,
  SequenceEvent,
  SequenceGameState,
} from '@family-game-night/sequence-engine';
import type { GameRow, LoadedGame, VersionedGameUpdate } from '../db/games';

export interface GameServiceDependencies {
  readonly createId: () => string;
  readonly now: () => string;
  readonly random: RandomSource;
}

export const defaultGameServiceDependencies: GameServiceDependencies = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
  random: new CryptoRandomSource(),
};

function staleGame(game: LoadedGame, viewer: UserProfileDto): ApiError {
  return new ApiError(409, 'STALE_GAME_VERSION', 'The game changed in another tab or device.', {
    latest: toGameDetail(game, viewer),
  });
}

function ensureLobby(game: LoadedGame): void {
  if (game.game.status !== 'lobby') {
    throw new ApiError(422, 'GAME_NOT_IN_LOBBY', 'Only a lobby game accepts this action.');
  }
}

function ensureHost(game: LoadedGame, viewer: UserProfileDto): void {
  if (game.game.host_user_id !== viewer.id && viewer.role !== 'admin') {
    throw new ApiError(403, 'HOST_REQUIRED', 'Only the host may perform this action.');
  }
}

function unchangedUpdate(game: GameRow): VersionedGameUpdate {
  const winner = game.winner_team_index;
  if (winner !== null && winner !== 0 && winner !== 1 && winner !== 2) {
    throw new Error('A persisted winner team index is invalid.');
  }
  return {
    stateJson: game.state_json,
    stateSchemaVersion: game.state_schema_version,
    status: game.status,
    turnNumber: game.turn_number,
    currentPlayerId: game.current_player_id,
    winnerTeamIndex: winner,
    finishedAt: game.finished_at,
  };
}

async function prepareVersionedMutation(input: {
  readonly db: D1Database;
  readonly gameId: string;
  readonly request: {
    readonly commandId: string;
    readonly expectedVersion: number;
  };
  readonly viewer: UserProfileDto;
}): Promise<
  | { readonly type: 'retry'; readonly view: GameDetailDto }
  | { readonly type: 'new'; readonly game: LoadedGame; readonly hash: string }
> {
  const [game, hash] = await Promise.all([
    loadVisibleGame({
      db: input.db,
      gameId: input.gameId,
      userId: input.viewer.id,
      userRole: input.viewer.role,
    }),
    commandHash(input.request),
  ]);
  const commandState = await assertCommandIsNew({
    db: input.db,
    gameId: input.gameId,
    commandId: input.request.commandId,
    commandHash: hash,
  });
  if (commandState === 'retry') {
    return { type: 'retry', view: toGameDetail(game, input.viewer) };
  }
  if (game.game.version !== input.request.expectedVersion) {
    throw staleGame(game, input.viewer);
  }
  return { type: 'new', game, hash };
}

async function committedView(input: {
  readonly db: D1Database;
  readonly gameId: string;
  readonly viewer: UserProfileDto;
}): Promise<GameDetailDto> {
  return toGameDetail(
    await loadVisibleGame({
      db: input.db,
      gameId: input.gameId,
      userId: input.viewer.id,
      userRole: input.viewer.role,
    }),
    input.viewer,
  );
}

async function finishMutation(input: {
  readonly db: D1Database;
  readonly game: LoadedGame;
  readonly hash: string;
  readonly commandId: string;
  readonly viewer: UserProfileDto;
  readonly now: string;
  readonly update: VersionedGameUpdate;
  readonly eventType: string;
  readonly eventPayload: Readonly<Record<string, unknown>>;
  readonly eventTurnNumber: number;
  readonly additionalStatements?: readonly D1PreparedStatement[];
}): Promise<GameDetailDto> {
  const outcome = await commitVersionedMutation({
    db: input.db,
    gameId: input.game.game.id,
    expectedVersion: input.game.game.version,
    commandId: input.commandId,
    commandHash: input.hash,
    actorUserId: input.viewer.id,
    now: input.now,
    update: input.update,
    event: {
      eventType: input.eventType,
      payloadJson: JSON.stringify(input.eventPayload),
      turnNumber: input.eventTurnNumber,
    },
    ...(input.additionalStatements === undefined
      ? {}
      : { additionalStatements: input.additionalStatements }),
  });
  if (outcome === 'stale') {
    const latest = await loadVisibleGame({
      db: input.db,
      gameId: input.game.game.id,
      userId: input.viewer.id,
      userRole: input.viewer.role,
    });
    throw staleGame(latest, input.viewer);
  }
  return committedView({ db: input.db, gameId: input.game.game.id, viewer: input.viewer });
}

export async function createGame(input: {
  readonly db: D1Database;
  readonly viewer: UserProfileDto;
  readonly request: CreateGameRequest;
  readonly dependencies?: GameServiceDependencies;
}): Promise<GameDetailDto> {
  const dependencies = input.dependencies ?? defaultGameServiceDependencies;
  const gameId = input.request.commandId;
  const hash = await commandHash(input.request);
  const existingGame = await input.db
    .prepare('SELECT host_user_id FROM games WHERE id = ?')
    .bind(gameId)
    .first<{ readonly host_user_id: string }>();
  if (existingGame !== null) {
    const event = await findAcceptedCommand(input.db, gameId, input.request.commandId);
    if (
      existingGame.host_user_id !== input.viewer.id ||
      event === null ||
      event.command_hash !== hash
    ) {
      throw new ApiError(
        409,
        'COMMAND_ID_REUSED',
        'That command ID was already used for different content.',
      );
    }
    return committedView({ db: input.db, gameId, viewer: input.viewer });
  }

  const now = dependencies.now();
  const lobbyState = {
    schemaVersion: 1 as const,
    phase: 'lobby' as const,
    teamCount: input.request.teamCount,
  };
  const payload = JSON.stringify({
    gameType: input.request.gameType,
    teamCount: input.request.teamCount,
    title: input.request.title,
  });

  try {
    await input.db.batch([
      input.db
        .prepare(
          `INSERT INTO games (
             id, game_type, state_schema_version, title, status, host_user_id,
             version, turn_number, current_player_id, winner_team_index,
             state_json, last_command_id, created_at, updated_at, finished_at
           ) VALUES (?, 'sequence', 1, ?, 'lobby', ?, 1, 0, NULL, NULL, ?, ?, ?, ?, NULL)`,
        )
        .bind(
          gameId,
          input.request.title,
          input.viewer.id,
          JSON.stringify(lobbyState),
          input.request.commandId,
          now,
          now,
        ),
      input.db
        .prepare(
          `INSERT INTO game_members (
             game_id, user_id, seat_index, team_index, membership_status, joined_at
           ) VALUES (?, ?, NULL, NULL, 'accepted', ?)`,
        )
        .bind(gameId, input.viewer.id, now),
      input.db
        .prepare(
          `INSERT INTO game_events (
             game_id, version, turn_number, actor_user_id, command_id,
             command_hash, event_type, public_payload_json, created_at
           ) VALUES (?, 1, 0, ?, ?, ?, 'GAME_CREATED', ?, ?)`,
        )
        .bind(gameId, input.viewer.id, input.request.commandId, hash, payload, now),
    ]);
  } catch (error) {
    const racedEvent = await findAcceptedCommand(input.db, gameId, input.request.commandId);
    if (racedEvent === null) {
      throw new Error('The create-game transaction failed.', { cause: error });
    }
    if (racedEvent.command_hash !== hash) {
      throw new ApiError(
        409,
        'COMMAND_ID_REUSED',
        'That command ID was already used for different content.',
      );
    }
  }

  return committedView({ db: input.db, gameId, viewer: input.viewer });
}

async function invitationEmail(db: D1Database, request: CreateInvitationRequest): Promise<string> {
  if (request.targetType === 'email') {
    return request.email;
  }
  const user = await db
    .prepare('SELECT email FROM users WHERE id = ?')
    .bind(request.userId)
    .first<{ readonly email: string }>();
  if (user === null) {
    throw new ApiError(422, 'INVITEE_NOT_FOUND', 'The selected family user was not found.');
  }
  return user.email.toLowerCase();
}

export async function createInvitation(input: {
  readonly db: D1Database;
  readonly gameId: string;
  readonly viewer: UserProfileDto;
  readonly request: CreateInvitationRequest;
  readonly dependencies?: GameServiceDependencies;
}): Promise<GameDetailDto> {
  const dependencies = input.dependencies ?? defaultGameServiceDependencies;
  const prepared = await prepareVersionedMutation({ ...input, request: input.request });
  if (prepared.type === 'retry') return prepared.view;
  ensureLobby(prepared.game);
  ensureHost(prepared.game, input.viewer);

  const email = await invitationEmail(input.db, input.request);
  if (email === input.viewer.email) {
    throw new ApiError(422, 'ALREADY_A_MEMBER', 'The host is already a member of this game.');
  }
  const existingMember = await input.db
    .prepare(
      `SELECT 1 AS found FROM game_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.game_id = ? AND u.email = ? COLLATE NOCASE
         AND gm.membership_status = 'accepted'`,
    )
    .bind(input.gameId, email)
    .first<{ readonly found: number }>();
  if (existingMember !== null) {
    throw new ApiError(422, 'ALREADY_A_MEMBER', 'That person is already in this lobby.');
  }
  const existingInvite = prepared.game.invites.find(
    (invite) => invite.email.toLowerCase() === email,
  );
  if (existingInvite?.status === 'pending') {
    throw new ApiError(422, 'INVITATION_ALREADY_PENDING', 'That invitation is already pending.');
  }

  const now = dependencies.now();
  const inviteId = existingInvite?.id ?? dependencies.createId();
  const nextVersion = prepared.game.game.version + 1;
  const writeInvite =
    existingInvite === undefined
      ? input.db
          .prepare(
            `INSERT INTO game_invites (
               id, game_id, email, invited_by_user_id, status, created_at, responded_at
             )
             SELECT ?, ?, ?, ?, 'pending', ?, NULL
             FROM games
             WHERE id = ? AND version = ? AND last_command_id = ?`,
          )
          .bind(
            inviteId,
            input.gameId,
            email,
            input.viewer.id,
            now,
            input.gameId,
            nextVersion,
            input.request.commandId,
          )
      : input.db
          .prepare(
            `UPDATE game_invites
             SET status = 'pending', invited_by_user_id = ?, created_at = ?, responded_at = NULL
             WHERE id = ? AND game_id = ?
               AND EXISTS (
                 SELECT 1 FROM games
                 WHERE id = ? AND version = ? AND last_command_id = ?
               )`,
          )
          .bind(
            input.viewer.id,
            now,
            inviteId,
            input.gameId,
            input.gameId,
            nextVersion,
            input.request.commandId,
          );
  return finishMutation({
    db: input.db,
    game: prepared.game,
    hash: prepared.hash,
    commandId: input.request.commandId,
    viewer: input.viewer,
    now,
    update: unchangedUpdate(prepared.game.game),
    eventType: 'INVITATION_CREATED',
    eventPayload: { invitationId: inviteId },
    eventTurnNumber: 0,
    additionalStatements: [writeInvite],
  });
}

interface OwnedInvitationRow {
  readonly id: string;
  readonly game_id: string;
  readonly status: 'pending' | 'accepted' | 'declined' | 'cancelled';
}

async function ownedInvitation(
  db: D1Database,
  invitationId: string,
  email: string,
): Promise<OwnedInvitationRow> {
  const invitation = await db
    .prepare(
      `SELECT id, game_id, status
       FROM game_invites
       WHERE id = ? AND email = ? COLLATE NOCASE`,
    )
    .bind(invitationId, email)
    .first<OwnedInvitationRow>();
  if (invitation === null) {
    throw new ApiError(404, 'INVITATION_NOT_FOUND', 'The invitation was not found.');
  }
  return invitation;
}

async function invitedGame(
  db: D1Database,
  gameId: string,
  viewer: UserProfileDto,
): Promise<LoadedGame> {
  return loadVisibleGame({
    db,
    gameId,
    userId: viewer.id,
    userRole: 'admin',
  });
}

export async function respondToInvitation(input: {
  readonly db: D1Database;
  readonly invitationId: string;
  readonly viewer: UserProfileDto;
  readonly request: VersionedMutationRequest;
  readonly response: 'accepted' | 'declined';
  readonly dependencies?: GameServiceDependencies;
}): Promise<
  GameDetailDto | { readonly gameId: string; readonly status: 'declined'; readonly version: number }
> {
  const dependencies = input.dependencies ?? defaultGameServiceDependencies;
  const invitation = await ownedInvitation(input.db, input.invitationId, input.viewer.email);
  const [game, hash] = await Promise.all([
    invitedGame(input.db, invitation.game_id, input.viewer),
    commandHash({ ...input.request, response: input.response }),
  ]);
  const state = await assertCommandIsNew({
    db: input.db,
    gameId: game.game.id,
    commandId: input.request.commandId,
    commandHash: hash,
  });
  if (state === 'retry') {
    if (input.response === 'declined') {
      return { gameId: game.game.id, status: 'declined', version: game.game.version };
    }
    return committedView({ db: input.db, gameId: game.game.id, viewer: input.viewer });
  }
  ensureLobby(game);
  if (game.game.version !== input.request.expectedVersion) {
    throw new ApiError(409, 'STALE_GAME_VERSION', 'The game changed in another tab or device.');
  }
  if (invitation.status !== 'pending') {
    throw new ApiError(422, 'INVITATION_RESOLVED', 'This invitation is no longer pending.');
  }

  const now = dependencies.now();
  const nextVersion = game.game.version + 1;
  const updateInvite = input.db
    .prepare(
      `UPDATE game_invites
       SET status = ?, responded_at = ?
       WHERE id = ? AND status = 'pending'
         AND EXISTS (
           SELECT 1 FROM games
           WHERE id = ? AND version = ? AND last_command_id = ?
         )`,
    )
    .bind(
      input.response,
      now,
      input.invitationId,
      game.game.id,
      nextVersion,
      input.request.commandId,
    );
  const statements: D1PreparedStatement[] = [updateInvite];
  if (input.response === 'accepted') {
    statements.push(
      input.db
        .prepare(
          `INSERT INTO game_members (
             game_id, user_id, seat_index, team_index, membership_status, joined_at
           )
           SELECT ?, ?, NULL, NULL, 'accepted', ?
           FROM games
           WHERE id = ? AND version = ? AND last_command_id = ?
           ON CONFLICT(game_id, user_id) DO UPDATE SET
             membership_status = 'accepted', joined_at = excluded.joined_at,
             seat_index = NULL, team_index = NULL`,
        )
        .bind(
          game.game.id,
          input.viewer.id,
          now,
          game.game.id,
          nextVersion,
          input.request.commandId,
        ),
    );
  }

  const outcome = await commitVersionedMutation({
    db: input.db,
    gameId: game.game.id,
    expectedVersion: game.game.version,
    commandId: input.request.commandId,
    commandHash: hash,
    actorUserId: input.viewer.id,
    now,
    update: unchangedUpdate(game.game),
    event: {
      eventType: input.response === 'accepted' ? 'INVITATION_ACCEPTED' : 'INVITATION_DECLINED',
      payloadJson: JSON.stringify({ invitationId: input.invitationId }),
      turnNumber: 0,
    },
    additionalStatements: statements,
  });
  if (outcome === 'stale') {
    throw new ApiError(409, 'STALE_GAME_VERSION', 'The game changed in another tab or device.');
  }
  if (input.response === 'declined') {
    const latest = await invitedGame(input.db, game.game.id, input.viewer);
    return { gameId: game.game.id, status: 'declined', version: latest.game.version };
  }
  return committedView({ db: input.db, gameId: game.game.id, viewer: input.viewer });
}

export async function patchLobby(input: {
  readonly db: D1Database;
  readonly gameId: string;
  readonly viewer: UserProfileDto;
  readonly request: LobbyPatchRequest;
  readonly dependencies?: GameServiceDependencies;
}): Promise<
  GameDetailDto | { readonly gameId: string; readonly left: true; readonly version: number }
> {
  const dependencies = input.dependencies ?? defaultGameServiceDependencies;
  if (input.request.action === 'LEAVE') {
    const [existing, hash] = await Promise.all([
      findAcceptedCommand(input.db, input.gameId, input.request.commandId),
      commandHash(input.request),
    ]);
    if (existing !== null) {
      if (existing.actor_user_id !== input.viewer.id) {
        throw new ApiError(404, 'GAME_NOT_FOUND', 'The game was not found.');
      }
      if (existing.command_hash !== hash) {
        throw new ApiError(
          409,
          'COMMAND_ID_REUSED',
          'That command ID was already used for different content.',
        );
      }
      const current = await input.db
        .prepare('SELECT version FROM games WHERE id = ?')
        .bind(input.gameId)
        .first<{ readonly version: number }>();
      if (current === null) {
        throw new ApiError(404, 'GAME_NOT_FOUND', 'The game was not found.');
      }
      return { gameId: input.gameId, left: true, version: current.version };
    }
  }
  const prepared = await prepareVersionedMutation({ ...input, request: input.request });
  if (prepared.type === 'retry') return prepared.view;
  ensureLobby(prepared.game);
  const now = dependencies.now();
  const nextVersion = prepared.game.game.version + 1;

  if (input.request.action === 'LEAVE') {
    if (prepared.game.game.host_user_id === input.viewer.id) {
      throw new ApiError(422, 'HOST_CANNOT_LEAVE', 'The host must cancel the lobby instead.');
    }
    const membership = prepared.game.members.find(
      (member) => member.user_id === input.viewer.id && member.membership_status === 'accepted',
    );
    if (membership === undefined) {
      throw new ApiError(404, 'GAME_NOT_FOUND', 'The game was not found.');
    }
    const leave = input.db
      .prepare(
        `UPDATE game_members
         SET membership_status = 'left', seat_index = NULL, team_index = NULL
         WHERE game_id = ? AND user_id = ?
           AND EXISTS (
             SELECT 1 FROM games
             WHERE id = ? AND version = ? AND last_command_id = ?
           )`,
      )
      .bind(input.gameId, input.viewer.id, input.gameId, nextVersion, input.request.commandId);
    const outcome = await commitVersionedMutation({
      db: input.db,
      gameId: input.gameId,
      expectedVersion: prepared.game.game.version,
      commandId: input.request.commandId,
      commandHash: prepared.hash,
      actorUserId: input.viewer.id,
      now,
      update: unchangedUpdate(prepared.game.game),
      event: {
        eventType: 'LOBBY_MEMBER_LEFT',
        payloadJson: JSON.stringify({ userId: input.viewer.id }),
        turnNumber: 0,
      },
      additionalStatements: [leave],
    });
    if (outcome === 'stale') throw staleGame(prepared.game, input.viewer);
    return { gameId: input.gameId, left: true, version: nextVersion };
  }

  ensureHost(prepared.game, input.viewer);
  const accepted = prepared.game.members
    .filter((member) => member.membership_status === 'accepted')
    .map((member) => member.user_id)
    .sort();
  const assigned = input.request.assignments.map((assignment) => assignment.userId).sort();
  if (
    new Set(assigned).size !== assigned.length ||
    accepted.length !== assigned.length ||
    accepted.some((userId, index) => userId !== assigned[index])
  ) {
    throw new ApiError(
      422,
      'INVALID_TEAM_ASSIGNMENTS',
      'Assign every accepted player to exactly one team.',
    );
  }
  const lobby = parseSequenceLobbyState(parseStoredJson(prepared.game.game.state_json));
  if (input.request.assignments.some((assignment) => assignment.teamIndex >= lobby.teamCount)) {
    throw new ApiError(422, 'INVALID_TEAM_ASSIGNMENTS', 'A team assignment is outside this lobby.');
  }
  const statements = input.request.assignments.map((assignment) =>
    input.db
      .prepare(
        `UPDATE game_members
         SET team_index = ?, seat_index = NULL
         WHERE game_id = ? AND user_id = ? AND membership_status = 'accepted'
           AND EXISTS (
             SELECT 1 FROM games
             WHERE id = ? AND version = ? AND last_command_id = ?
           )`,
      )
      .bind(
        assignment.teamIndex,
        input.gameId,
        assignment.userId,
        input.gameId,
        nextVersion,
        input.request.commandId,
      ),
  );
  return finishMutation({
    db: input.db,
    game: prepared.game,
    hash: prepared.hash,
    commandId: input.request.commandId,
    viewer: input.viewer,
    now,
    update: unchangedUpdate(prepared.game.game),
    eventType: 'LOBBY_UPDATED',
    eventPayload: { assignments: input.request.assignments },
    eventTurnNumber: 0,
    additionalStatements: statements,
  });
}

export async function cancelInvitation(input: {
  readonly db: D1Database;
  readonly gameId: string;
  readonly invitationId: string;
  readonly viewer: UserProfileDto;
  readonly request: VersionedMutationRequest;
  readonly dependencies?: GameServiceDependencies;
}): Promise<GameDetailDto> {
  const dependencies = input.dependencies ?? defaultGameServiceDependencies;
  const prepared = await prepareVersionedMutation({ ...input, request: input.request });
  if (prepared.type === 'retry') return prepared.view;
  ensureLobby(prepared.game);
  ensureHost(prepared.game, input.viewer);
  const invitation = prepared.game.invites.find(
    (candidate) => candidate.id === input.invitationId && candidate.status === 'pending',
  );
  if (invitation === undefined) {
    throw new ApiError(404, 'INVITATION_NOT_FOUND', 'The pending invitation was not found.');
  }

  const now = dependencies.now();
  const nextVersion = prepared.game.game.version + 1;
  const cancel = input.db
    .prepare(
      `UPDATE game_invites
       SET status = 'cancelled', responded_at = ?
       WHERE id = ? AND game_id = ? AND status = 'pending'
         AND EXISTS (
           SELECT 1 FROM games
           WHERE id = ? AND version = ? AND last_command_id = ?
         )`,
    )
    .bind(
      now,
      input.invitationId,
      input.gameId,
      input.gameId,
      nextVersion,
      input.request.commandId,
    );
  return finishMutation({
    db: input.db,
    game: prepared.game,
    hash: prepared.hash,
    commandId: input.request.commandId,
    viewer: input.viewer,
    now,
    update: unchangedUpdate(prepared.game.game),
    eventType: 'INVITATION_CANCELLED',
    eventPayload: { invitationId: input.invitationId },
    eventTurnNumber: 0,
    additionalStatements: [cancel],
  });
}

function teamRosters(game: LoadedGame, teamCount: 2 | 3): string[][] {
  return Array.from({ length: teamCount }, (_, teamIndex) =>
    game.members
      .filter(
        (member) => member.membership_status === 'accepted' && member.team_index === teamIndex,
      )
      .map((member) => member.user_id),
  );
}

function currentPlayerId(state: SequenceGameState): string | null {
  if (state.currentSeatIndex === null) return null;
  return (
    state.players.find((player) => player.seatIndex === state.currentSeatIndex)?.userId ?? null
  );
}

export async function startGame(input: {
  readonly db: D1Database;
  readonly gameId: string;
  readonly viewer: UserProfileDto;
  readonly request: VersionedMutationRequest;
  readonly dependencies?: GameServiceDependencies;
}): Promise<GameDetailDto> {
  const dependencies = input.dependencies ?? defaultGameServiceDependencies;
  const prepared = await prepareVersionedMutation({ ...input, request: input.request });
  if (prepared.type === 'retry') return prepared.view;
  ensureLobby(prepared.game);
  ensureHost(prepared.game, input.viewer);
  const lobby = parseSequenceLobbyState(parseStoredJson(prepared.game.game.state_json));
  const rosters = teamRosters(prepared.game, lobby.teamCount);
  const pendingInviteCount = prepared.game.invites.filter(
    (invite) => invite.status === 'pending',
  ).length;

  let state: SequenceGameState;
  try {
    state = getGameModule('sequence').createGame(
      { teamRosters: rosters, pendingInviteCount },
      dependencies.random,
    );
  } catch (error) {
    if (error instanceof InvalidGameSetupError) {
      throw new ApiError(422, 'INVALID_GAME_SETUP', 'The lobby is not ready to start.', {
        errors: error.validation.errors,
      });
    }
    throw error;
  }

  const now = dependencies.now();
  const nextVersion = prepared.game.game.version + 1;
  const seatStatements = state.players.map((player) =>
    input.db
      .prepare(
        `UPDATE game_members
         SET seat_index = ?, team_index = ?
         WHERE game_id = ? AND user_id = ? AND membership_status = 'accepted'
           AND EXISTS (
             SELECT 1 FROM games
             WHERE id = ? AND version = ? AND last_command_id = ?
           )`,
      )
      .bind(
        player.seatIndex,
        player.teamIndex,
        input.gameId,
        player.userId,
        input.gameId,
        nextVersion,
        input.request.commandId,
      ),
  );
  const dealerUserId =
    state.dealerSeatIndex === null
      ? null
      : (state.players.find((player) => player.seatIndex === state.dealerSeatIndex)?.userId ??
        null);
  return finishMutation({
    db: input.db,
    game: prepared.game,
    hash: prepared.hash,
    commandId: input.request.commandId,
    viewer: input.viewer,
    now,
    update: {
      stateJson: JSON.stringify(state),
      stateSchemaVersion: 1,
      status: 'active',
      turnNumber: state.turnNumber,
      currentPlayerId: currentPlayerId(state),
      winnerTeamIndex: null,
      finishedAt: null,
    },
    eventType: 'GAME_STARTED',
    eventPayload: {
      dealerUserId,
      firstPlayerId: currentPlayerId(state),
      seatOrder: state.players.map((player) => player.userId),
    },
    eventTurnNumber: state.turnNumber,
    additionalStatements: seatStatements,
  });
}

function cancelledState(game: LoadedGame): string {
  if (game.game.status === 'lobby') {
    const state = parseSequenceLobbyState(parseStoredJson(game.game.state_json));
    return JSON.stringify({ ...state, phase: 'cancelled' });
  }
  const state = parseSequenceGameState(parseStoredJson(game.game.state_json));
  return JSON.stringify(
    parseSequenceGameState({ ...state, phase: 'cancelled', currentSeatIndex: null }),
  );
}

export async function cancelGame(input: {
  readonly db: D1Database;
  readonly gameId: string;
  readonly viewer: UserProfileDto;
  readonly request: VersionedMutationRequest;
  readonly dependencies?: GameServiceDependencies;
}): Promise<GameDetailDto> {
  const dependencies = input.dependencies ?? defaultGameServiceDependencies;
  const prepared = await prepareVersionedMutation({ ...input, request: input.request });
  if (prepared.type === 'retry') return prepared.view;
  ensureHost(prepared.game, input.viewer);
  if (prepared.game.game.status === 'finished' || prepared.game.game.status === 'cancelled') {
    throw new ApiError(422, 'GAME_READ_ONLY', 'A finished or cancelled game is read-only.');
  }
  const now = dependencies.now();
  return finishMutation({
    db: input.db,
    game: prepared.game,
    hash: prepared.hash,
    commandId: input.request.commandId,
    viewer: input.viewer,
    now,
    update: {
      ...unchangedUpdate(prepared.game.game),
      stateJson: cancelledState(prepared.game),
      status: 'cancelled',
      currentPlayerId: null,
      finishedAt: now,
    },
    eventType: 'GAME_CANCELLED',
    eventPayload: {},
    eventTurnNumber: prepared.game.game.turn_number,
  });
}

function engineCommand(request: SequenceCommandRequest): SequenceCommand {
  switch (request.type) {
    case 'PLAY_CARD':
      return {
        type: request.type,
        cardId: request.cardId,
        targetCell: request.targetCell,
        ...(request.sequenceSelection === undefined
          ? {}
          : { sequenceSelection: request.sequenceSelection }),
      };
    case 'EXCHANGE_DEAD_CARD':
      return { type: request.type, cardId: request.cardId };
    case 'PASS_NO_LEGAL_MOVE':
      return { type: request.type };
  }
}

function engineErrorStatus(code: string): 409 | 422 {
  return code === 'WRONG_PLAYER' ? 409 : 422;
}

function publicEngineEvent(event: SequenceEvent): {
  readonly eventType: string;
  readonly payload: Readonly<Record<string, unknown>>;
} {
  switch (event.type) {
    case 'CARD_PLAYED':
      return {
        eventType: event.type,
        payload: {
          cardCode: event.cardCode,
          targetCell: event.targetCell,
          boardEffect: event.boardEffect,
          claimedSequenceIds: event.claimedSequenceIds,
          winnerTeamIndex: event.winnerTeamIndex,
        },
      };
    case 'DEAD_CARD_EXCHANGED':
      return { eventType: event.type, payload: { cardCode: event.cardCode } };
    case 'TURN_PASSED_NO_LEGAL_MOVE':
      return { eventType: event.type, payload: {} };
  }
}

export async function applyGameCommand(input: {
  readonly db: D1Database;
  readonly gameId: string;
  readonly viewer: UserProfileDto;
  readonly request: SequenceCommandRequest;
  readonly dependencies?: GameServiceDependencies;
}): Promise<GameDetailDto> {
  const dependencies = input.dependencies ?? defaultGameServiceDependencies;
  const prepared = await prepareVersionedMutation({ ...input, request: input.request });
  if (prepared.type === 'retry') return prepared.view;
  if (prepared.game.game.status !== 'active') {
    throw new ApiError(422, 'GAME_NOT_ACTIVE', 'Only an active game accepts turn commands.');
  }
  const module = getGameModule(prepared.game.game.game_type);
  const state = module.parseState(parseStoredJson(prepared.game.game.state_json));
  const result = module.applyCommand({
    state,
    actorUserId: input.viewer.id,
    command: engineCommand(input.request),
    random: dependencies.random,
  });
  if (!result.ok) {
    throw new ApiError(
      engineErrorStatus(result.error.code),
      result.error.code,
      result.error.message,
      result.error.details,
    );
  }

  const now = dependencies.now();
  const event = publicEngineEvent(result.event);
  const winner = result.state.winnerTeamIndex;
  return finishMutation({
    db: input.db,
    game: prepared.game,
    hash: prepared.hash,
    commandId: input.request.commandId,
    viewer: input.viewer,
    now,
    update: {
      stateJson: JSON.stringify(result.state),
      stateSchemaVersion: module.stateSchemaVersion,
      status: result.state.phase === 'finished' ? 'finished' : 'active',
      turnNumber: result.state.turnNumber,
      currentPlayerId: result.state.phase === 'finished' ? null : currentPlayerId(result.state),
      winnerTeamIndex: winner,
      finishedAt: result.state.phase === 'finished' ? now : null,
    },
    eventType: event.eventType,
    eventPayload: event.payload,
    eventTurnNumber: result.state.turnNumber,
  });
}
