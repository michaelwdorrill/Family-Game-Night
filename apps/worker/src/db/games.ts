import { ApiError } from '../errors';

import type {
  GameStatus,
  MembershipStatus,
  PublicGameEventListDto,
  TeamIndex,
  UserRole,
} from '@family-game-night/shared';

export interface GameRow {
  readonly id: string;
  readonly game_type: string;
  readonly state_schema_version: number;
  readonly title: string;
  readonly status: GameStatus;
  readonly host_user_id: string;
  readonly version: number;
  readonly turn_number: number;
  readonly current_player_id: string | null;
  readonly winner_team_index: number | null;
  readonly state_json: string;
  readonly last_command_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly finished_at: string | null;
}

export interface GameMemberRow {
  readonly game_id: string;
  readonly user_id: string;
  readonly display_name: string;
  readonly seat_index: number | null;
  readonly team_index: TeamIndex | null;
  readonly membership_status: MembershipStatus;
  readonly joined_at: string | null;
}

export interface GameInviteRow {
  readonly id: string;
  readonly game_id: string;
  readonly email: string;
  readonly status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  readonly created_at: string;
  readonly responded_at: string | null;
}

export interface GameEventRow {
  readonly version: number;
  readonly turn_number: number;
  readonly actor_user_id: string | null;
  readonly actor_display_name: string | null;
  readonly command_id: string;
  readonly command_hash: string;
  readonly event_type: string;
  readonly public_payload_json: string;
  readonly created_at: string;
}

export interface LoadedGame {
  readonly game: GameRow;
  readonly members: readonly GameMemberRow[];
  readonly invites: readonly GameInviteRow[];
  readonly events: readonly GameEventRow[];
}

export async function findAcceptedCommand(
  db: D1Database,
  gameId: string,
  commandId: string,
): Promise<GameEventRow | null> {
  return db
    .prepare(
      `SELECT e.version, e.turn_number, e.actor_user_id,
              u.display_name AS actor_display_name,
              e.command_id, e.command_hash, e.event_type,
              e.public_payload_json, e.created_at
       FROM game_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
       WHERE e.game_id = ? AND e.command_id = ?`,
    )
    .bind(gameId, commandId)
    .first<GameEventRow>();
}

export async function assertCommandIsNew(input: {
  readonly db: D1Database;
  readonly gameId: string;
  readonly commandId: string;
  readonly commandHash: string;
}): Promise<'new' | 'retry'> {
  const event = await findAcceptedCommand(input.db, input.gameId, input.commandId);
  if (event === null) {
    return 'new';
  }
  if (event.command_hash !== input.commandHash) {
    throw new ApiError(
      409,
      'COMMAND_ID_REUSED',
      'That command ID was already used for different content.',
    );
  }
  return 'retry';
}

export async function loadVisibleGame(input: {
  readonly db: D1Database;
  readonly gameId: string;
  readonly userId: string;
  readonly userRole: UserRole;
  readonly eventLimit?: number;
}): Promise<LoadedGame> {
  const game = await input.db
    .prepare(
      `SELECT g.id, g.game_type, g.state_schema_version, g.title, g.status,
              g.host_user_id, g.version, g.turn_number, g.current_player_id,
              g.winner_team_index, g.state_json, g.last_command_id,
              g.created_at, g.updated_at, g.finished_at
       FROM games g
       WHERE g.id = ?
         AND (
           ? = 'admin'
           OR EXISTS (
             SELECT 1 FROM game_members gm
             WHERE gm.game_id = g.id AND gm.user_id = ?
               AND gm.membership_status = 'accepted'
           )
         )`,
    )
    .bind(input.gameId, input.userRole, input.userId)
    .first<GameRow>();
  if (game === null) {
    throw new ApiError(404, 'GAME_NOT_FOUND', 'The game was not found.');
  }

  const [memberResult, inviteResult, eventResult] = await Promise.all([
    input.db
      .prepare(
        `SELECT gm.game_id, gm.user_id, u.display_name, gm.seat_index,
                gm.team_index, gm.membership_status, gm.joined_at
         FROM game_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.game_id = ?
         ORDER BY COALESCE(gm.seat_index, 999), gm.joined_at, gm.user_id`,
      )
      .bind(input.gameId)
      .all<GameMemberRow>(),
    input.db
      .prepare(
        `SELECT id, game_id, email, status, created_at, responded_at
         FROM game_invites WHERE game_id = ?
         ORDER BY created_at, id`,
      )
      .bind(input.gameId)
      .all<GameInviteRow>(),
    input.db
      .prepare(
        `SELECT e.version, e.turn_number, e.actor_user_id,
                u.display_name AS actor_display_name,
                e.command_id, e.command_hash, e.event_type,
                e.public_payload_json, e.created_at
         FROM game_events e
         LEFT JOIN users u ON u.id = e.actor_user_id
         WHERE e.game_id = ?
         ORDER BY e.version DESC
         LIMIT ?`,
      )
      .bind(input.gameId, input.eventLimit ?? 30)
      .all<GameEventRow>(),
  ]);

  return {
    game,
    members: memberResult.results,
    invites: inviteResult.results,
    events: eventResult.results,
  };
}

export interface VersionedGameUpdate {
  readonly stateJson: string;
  readonly stateSchemaVersion: number;
  readonly status: GameStatus;
  readonly turnNumber: number;
  readonly currentPlayerId: string | null;
  readonly winnerTeamIndex: TeamIndex | null;
  readonly finishedAt: string | null;
}

export interface PublicEventInsert {
  readonly eventType: string;
  readonly payloadJson: string;
  readonly turnNumber: number;
}

function changes(result: D1Result<unknown>): number {
  return result.meta.changes ?? 0;
}

export async function commitVersionedMutation(input: {
  readonly db: D1Database;
  readonly gameId: string;
  readonly expectedVersion: number;
  readonly commandId: string;
  readonly commandHash: string;
  readonly actorUserId: string;
  readonly now: string;
  readonly update: VersionedGameUpdate;
  readonly event: PublicEventInsert;
  readonly additionalStatements?: readonly D1PreparedStatement[];
}): Promise<'committed' | 'retry' | 'stale'> {
  const existing = await assertCommandIsNew(input);
  if (existing === 'retry') {
    return 'retry';
  }

  const nextVersion = input.expectedVersion + 1;
  const update = input.db
    .prepare(
      `UPDATE games
       SET state_json = ?, state_schema_version = ?, status = ?,
           version = ?, turn_number = ?, current_player_id = ?,
           winner_team_index = ?, last_command_id = ?, updated_at = ?,
           finished_at = ?
       WHERE id = ? AND version = ?
         AND NOT EXISTS (
           SELECT 1 FROM game_events
           WHERE game_id = ? AND command_id = ?
         )`,
    )
    .bind(
      input.update.stateJson,
      input.update.stateSchemaVersion,
      input.update.status,
      nextVersion,
      input.update.turnNumber,
      input.update.currentPlayerId,
      input.update.winnerTeamIndex,
      input.commandId,
      input.now,
      input.update.finishedAt,
      input.gameId,
      input.expectedVersion,
      input.gameId,
      input.commandId,
    );
  const event = input.db
    .prepare(
      `INSERT INTO game_events (
         game_id, version, turn_number, actor_user_id, command_id,
         command_hash, event_type, public_payload_json, created_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       FROM games
       WHERE id = ? AND version = ? AND last_command_id = ?
       ON CONFLICT(game_id, command_id) DO NOTHING`,
    )
    .bind(
      input.gameId,
      nextVersion,
      input.event.turnNumber,
      input.actorUserId,
      input.commandId,
      input.commandHash,
      input.event.eventType,
      input.event.payloadJson,
      input.now,
      input.gameId,
      nextVersion,
      input.commandId,
    );

  let results: readonly D1Result<unknown>[];
  try {
    results = await input.db.batch([update, ...(input.additionalStatements ?? []), event]);
  } catch (error) {
    throw new Error('The game mutation transaction failed.', { cause: error });
  }

  const updateResult = results[0];
  const eventResult = results.at(-1);
  if (updateResult !== undefined && eventResult !== undefined) {
    if (changes(updateResult) === 1 && changes(eventResult) === 1) {
      return 'committed';
    }
  }

  const racedEvent = await findAcceptedCommand(input.db, input.gameId, input.commandId);
  if (racedEvent !== null) {
    if (racedEvent.command_hash !== input.commandHash) {
      throw new ApiError(
        409,
        'COMMAND_ID_REUSED',
        'That command ID was already used for different content.',
      );
    }
    return 'retry';
  }
  return 'stale';
}

export function parseStoredJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error('A persisted game snapshot is not valid JSON.', { cause: error });
  }
}

export async function listPublicEvents(input: {
  readonly db: D1Database;
  readonly gameId: string;
  readonly userId: string;
  readonly userRole: UserRole;
  readonly afterVersion: number;
  readonly limit: number;
}): Promise<PublicGameEventListDto> {
  const visible = await input.db
    .prepare(
      `SELECT 1 AS found
       FROM games g
       WHERE g.id = ? AND (
         ? = 'admin' OR EXISTS (
           SELECT 1 FROM game_members gm
           WHERE gm.game_id = g.id AND gm.user_id = ?
             AND gm.membership_status = 'accepted'
         )
       )`,
    )
    .bind(input.gameId, input.userRole, input.userId)
    .first<{ readonly found: number }>();
  if (visible === null) {
    throw new ApiError(404, 'GAME_NOT_FOUND', 'The game was not found.');
  }
  const result = await input.db
    .prepare(
      `SELECT e.version, e.turn_number, e.actor_user_id,
              u.display_name AS actor_display_name,
              e.command_id, e.command_hash, e.event_type,
              e.public_payload_json, e.created_at
       FROM game_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
       WHERE e.game_id = ? AND e.version > ?
       ORDER BY e.version ASC
       LIMIT ?`,
    )
    .bind(input.gameId, input.afterVersion, input.limit)
    .all<GameEventRow>();
  return {
    events: result.results.map((row) => {
      const payload = parseStoredJson(row.public_payload_json);
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new Error('A public game event payload is not an object.');
      }
      return {
        version: row.version,
        turnNumber: row.turn_number,
        actorUserId: row.actor_user_id,
        actorDisplayName: row.actor_display_name,
        eventType: row.event_type,
        payload: payload as Readonly<Record<string, unknown>>,
        createdAt: row.created_at,
      };
    }),
  };
}
