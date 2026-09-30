import { createAlternatingSeatOrder, validateStartGame } from '@family-game-night/sequence-engine';

import { getGameModule } from './registry';
import { parseSequenceLobbyState, sequenceLobbyStateSchema } from './lobby-state';
import { parseStoredJson } from '../db/games';

import type {
  GameDetailDto,
  LobbyViewDto,
  PublicGameEventDto,
  SequenceGameViewDto,
  UserProfileDto,
} from '@family-game-night/shared';
import type { GameEventRow, LoadedGame } from '../db/games';

function publicPayload(value: string): Readonly<Record<string, unknown>> {
  const parsed = parseStoredJson(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('A public game event payload is not an object.');
  }
  return parsed as Readonly<Record<string, unknown>>;
}

export function toPublicEvent(row: GameEventRow): PublicGameEventDto {
  return {
    version: row.version,
    turnNumber: row.turn_number,
    actorUserId: row.actor_user_id,
    actorDisplayName: row.actor_display_name,
    eventType: row.event_type,
    payload: publicPayload(row.public_payload_json),
    createdAt: row.created_at,
  };
}

function eventsAscending(game: LoadedGame): readonly PublicGameEventDto[] {
  return game.events.toReversed().map(toPublicEvent);
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

function lobbyView(game: LoadedGame, viewer: UserProfileDto): LobbyViewDto {
  const state = parseSequenceLobbyState(parseStoredJson(game.game.state_json));
  const pendingInviteCount = game.invites.filter((invite) => invite.status === 'pending').length;
  const acceptedMembers = game.members.filter((member) => member.membership_status === 'accepted');
  const unassignedCount = acceptedMembers.filter((member) => member.team_index === null).length;
  const rosters = teamRosters(game, state.teamCount);
  const engineValidation = validateStartGame({
    teamRosters: rosters,
    pendingInviteCount,
  });
  const errors = [
    ...(unassignedCount === 0
      ? []
      : [`${String(unassignedCount)} accepted player(s) still need a team assignment.`]),
    ...engineValidation.errors,
  ];
  const valid = errors.length === 0;
  const seatPreview = valid
    ? createAlternatingSeatOrder({ teamRosters: rosters }).map((seat) => seat.userId)
    : [];
  const canManage = viewer.id === game.game.host_user_id || viewer.role === 'admin';

  return {
    kind: 'lobby',
    id: game.game.id,
    gameType: 'sequence',
    title: game.game.title,
    status: state.phase,
    version: game.game.version,
    hostUserId: game.game.host_user_id,
    teamCount: state.teamCount,
    members: game.members.map((member) => ({
      userId: member.user_id,
      displayName: member.display_name,
      membershipStatus: member.membership_status,
      teamIndex: member.team_index,
      seatIndex: member.seat_index,
      isHost: member.user_id === game.game.host_user_id,
    })),
    invitations: game.invites.map((invite) => ({
      id: invite.id,
      email: canManage || invite.email === viewer.email ? invite.email : null,
      status: invite.status,
      createdAt: invite.created_at,
    })),
    seatPreview,
    validation: { valid, errors },
    permissions: {
      canManage,
      canStart: canManage && valid && state.phase === 'lobby',
      canLeave:
        viewer.id !== game.game.host_user_id &&
        acceptedMembers.some((member) => member.user_id === viewer.id) &&
        state.phase === 'lobby',
    },
    recentEvents: eventsAscending(game),
  };
}

function sequenceView(game: LoadedGame, viewer: UserProfileDto): SequenceGameViewDto {
  const module = getGameModule(game.game.game_type);
  const state = module.parseState(parseStoredJson(game.game.state_json));
  const viewerIsPlayer = state.players.some((player) => player.userId === viewer.id);
  const baseView = module.toPlayerView(
    state,
    viewerIsPlayer ? viewer.id : (state.players[0]?.userId ?? viewer.id),
  );
  const names = new Map(game.members.map((member) => [member.user_id, member.display_name]));

  return {
    kind: 'sequence',
    id: game.game.id,
    gameType: 'sequence',
    title: game.game.title,
    hostUserId: game.game.host_user_id,
    status: game.game.status === 'lobby' ? 'cancelled' : game.game.status,
    version: game.game.version,
    turnNumber: baseView.turnNumber,
    teamCount: baseView.teamCount,
    targetSequences: baseView.targetSequences,
    players: baseView.players.map((player) => ({
      ...player,
      displayName: names.get(player.userId) ?? 'Family Player',
    })),
    currentPlayerId: baseView.currentPlayerId,
    myUserId: viewer.id,
    myHand: viewerIsPlayer ? baseView.myHand : [],
    board: baseView.board,
    claimedSequences: baseView.claimedSequences,
    sequenceCounts: baseView.sequenceCounts,
    deckCount: baseView.deckCount,
    discardCount: baseView.discardCount,
    deadCardExchangeUsed: baseView.deadCardExchangeUsed,
    canPassNoLegalMove: viewerIsPlayer && baseView.canPassNoLegalMove,
    winnerTeamIndex: baseView.winnerTeamIndex,
    permissions: {
      canCancel:
        game.game.status === 'active' &&
        (viewer.id === game.game.host_user_id || viewer.role === 'admin'),
    },
    recentEvents: eventsAscending(game),
  };
}

export function toGameDetail(game: LoadedGame, viewer: UserProfileDto): GameDetailDto {
  if (game.game.game_type !== 'sequence') {
    throw new Error(`Unsupported persisted game type: ${game.game.game_type}.`);
  }
  const isLobbySnapshot =
    game.game.status === 'lobby' ||
    (game.game.status === 'cancelled' &&
      sequenceLobbyStateSchema.safeParse(parseStoredJson(game.game.state_json)).success);
  return isLobbySnapshot ? lobbyView(game, viewer) : sequenceView(game, viewer);
}
