import { z } from 'zod';

import { getGameModule } from '../games/registry';
import { ApiError } from '../errors';
import { parseStoredJson } from './games';

import type {
  DashboardBucket,
  GameSummaryDto,
  GameSummaryPageDto,
  InvitationDto,
  InvitationListDto,
  TeamIndex,
} from '@family-game-night/shared';

interface GameSummaryRow {
  readonly id: string;
  readonly game_type: string;
  readonly title: string;
  readonly status: GameSummaryDto['status'];
  readonly version: number;
  readonly updated_at: string;
  readonly host_user_id: string;
  readonly current_player_id: string | null;
  readonly current_player_display_name: string | null;
  readonly team_index: number | null;
  readonly winner_team_index: number | null;
  readonly state_json: string;
}

interface InvitationRow {
  readonly id: string;
  readonly game_id: string;
  readonly game_title: string;
  readonly game_type: string;
  readonly game_version: number;
  readonly host_display_name: string;
  readonly status: InvitationDto['status'];
  readonly created_at: string;
}

const cursorSchema = z
  .object({
    updatedAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();

function encodeCursor(row: GameSummaryRow): string {
  return btoa(JSON.stringify({ updatedAt: row.updated_at, id: row.id }));
}

function decodeCursor(cursor: string | undefined): z.infer<typeof cursorSchema> | null {
  if (cursor === undefined) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(atob(cursor)) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function teamIndex(value: number | null): TeamIndex | null {
  if (value === null || value === 0 || value === 1 || value === 2) return value;
  throw new Error('A dashboard row contains an invalid team index.');
}

function sequenceCounts(row: GameSummaryRow): readonly number[] {
  const parsed = parseStoredJson(row.state_json);
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'sequenceCounts' in parsed &&
    Array.isArray(parsed.sequenceCounts) &&
    parsed.sequenceCounts.every((count) => Number.isInteger(count) && count >= 0)
  ) {
    return parsed.sequenceCounts as number[];
  }
  if (row.status === 'lobby' || row.status === 'cancelled') return [];
  return getGameModule(row.game_type).getDashboardSummary(
    getGameModule(row.game_type).parseState(parsed),
  ).sequenceCounts;
}

function toSummary(row: GameSummaryRow, userId: string): GameSummaryDto {
  if (row.game_type !== 'sequence') {
    throw new Error(`Unsupported dashboard game type: ${row.game_type}.`);
  }
  return {
    id: row.id,
    gameType: 'sequence',
    title: row.title,
    status: row.status,
    version: row.version,
    updatedAt: row.updated_at,
    currentPlayerId: row.current_player_id,
    currentPlayerDisplayName: row.current_player_display_name,
    myTeamIndex: teamIndex(row.team_index),
    sequenceCounts: sequenceCounts(row),
    winnerTeamIndex: teamIndex(row.winner_team_index),
    action:
      row.status === 'lobby' && row.host_user_id === userId
        ? 'configure-lobby'
        : row.status === 'active' && row.current_player_id === userId
          ? 'take-turn'
          : 'view',
  };
}

function bucketSql(bucket: DashboardBucket): string {
  switch (bucket) {
    case 'active':
      return "((g.status = 'active' AND g.current_player_id = ?) OR (g.status = 'lobby' AND g.host_user_id = ?))";
    case 'waiting':
      return "((g.status = 'active' AND g.current_player_id <> ?) OR (g.status = 'lobby' AND g.host_user_id <> ?))";
    case 'finished':
      return "(g.status IN ('finished', 'cancelled') AND ? = ? )";
  }
}

export async function listGames(input: {
  readonly db: D1Database;
  readonly userId: string;
  readonly bucket: DashboardBucket;
  readonly cursor?: string;
  readonly limit: number;
}): Promise<GameSummaryPageDto> {
  const cursor = decodeCursor(input.cursor);
  if (input.cursor !== undefined && cursor === null) {
    throw new ApiError(400, 'INVALID_CURSOR', 'The pagination cursor is invalid.');
  }
  const cursorSql =
    cursor === null ? '' : 'AND (g.updated_at < ? OR (g.updated_at = ? AND g.id < ?))';
  const statement = input.db.prepare(
    `SELECT g.id, g.game_type, g.title, g.status, g.version, g.updated_at,
            g.host_user_id, g.current_player_id,
            current_user.display_name AS current_player_display_name,
            gm.team_index, g.winner_team_index, g.state_json
     FROM game_members gm
     JOIN games g ON g.id = gm.game_id
     LEFT JOIN users current_user ON current_user.id = g.current_player_id
     WHERE gm.user_id = ? AND gm.membership_status = 'accepted'
       AND ${bucketSql(input.bucket)}
       ${cursorSql}
     ORDER BY g.updated_at DESC, g.id DESC
     LIMIT ?`,
  );
  const bucketValues = [input.userId, input.userId];
  const cursorValues = cursor === null ? [] : [cursor.updatedAt, cursor.updatedAt, cursor.id];
  const result = await statement
    .bind(input.userId, ...bucketValues, ...cursorValues, input.limit + 1)
    .all<GameSummaryRow>();
  const page = result.results.slice(0, input.limit);
  return {
    games: page.map((row) => toSummary(row, input.userId)),
    nextCursor:
      result.results.length > input.limit && page.length > 0
        ? encodeCursor(page[page.length - 1] as GameSummaryRow)
        : null,
  };
}

export async function listInvitations(input: {
  readonly db: D1Database;
  readonly email: string;
}): Promise<InvitationListDto> {
  const result = await input.db
    .prepare(
      `SELECT i.id, i.game_id, g.title AS game_title, g.game_type,
              g.version AS game_version, host.display_name AS host_display_name,
              i.status, i.created_at
       FROM game_invites i
       JOIN games g ON g.id = i.game_id
       JOIN users host ON host.id = g.host_user_id
       WHERE i.email = ? COLLATE NOCASE AND i.status = 'pending'
         AND g.status = 'lobby'
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT 100`,
    )
    .bind(input.email)
    .all<InvitationRow>();
  return {
    invitations: result.results.map((row) => {
      if (row.game_type !== 'sequence') {
        throw new Error(`Unsupported invitation game type: ${row.game_type}.`);
      }
      return {
        id: row.id,
        gameId: row.game_id,
        gameTitle: row.game_title,
        gameType: 'sequence',
        gameVersion: row.game_version,
        hostDisplayName: row.host_display_name,
        status: row.status,
        createdAt: row.created_at,
      };
    }),
  };
}
