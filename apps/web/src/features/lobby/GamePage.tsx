import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { gameDetailSchema } from '@family-game-night/shared';

import {
  ApiClientError,
  cancelGame,
  cancelGameInvitation,
  getDirectory,
  getGame,
  inviteToGame,
  queryKeys,
  startGame,
  updateLobby,
} from '../../api/client';
import { CardLinesGame } from '../game/CardLinesGame';

import type { GameDetailDto, LobbyViewDto, TeamIndex } from '@family-game-night/shared';

function useRefreshGame(gameId: string) {
  const queryClient = useQueryClient();
  return async (game: GameDetailDto) => {
    queryClient.setQueryData(queryKeys.game(gameId), game);
    await queryClient.invalidateQueries({ queryKey: ['games'] });
    await queryClient.invalidateQueries({ queryKey: queryKeys.invitations });
  };
}

function useRecoverStaleGame(gameId: string) {
  const queryClient = useQueryClient();
  return (error: Error) => {
    if (error instanceof ApiClientError && error.code === 'STALE_GAME_VERSION') {
      const latest = gameDetailSchema.safeParse(error.details['latest']);
      if (latest.success) queryClient.setQueryData(queryKeys.game(gameId), latest.data);
    }
  };
}

function eventLabel(eventType: string): string {
  return eventType.toLowerCase().replaceAll('_', ' ');
}

function LobbyPanel({ game }: { readonly game: LobbyViewDto }) {
  const refresh = useRefreshGame(game.id);
  const recoverStale = useRecoverStaleGame(game.id);
  const navigate = useNavigate();
  const directory = useQuery({ queryKey: queryKeys.directory, queryFn: getDirectory });
  const [selectedUserId, setSelectedUserId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [assignments, setAssignments] = useState<Record<string, TeamIndex | ''>>(() =>
    Object.fromEntries(
      game.members
        .filter((member) => member.membershipStatus === 'accepted')
        .map((member) => [member.userId, member.teamIndex ?? '']),
    ),
  );

  const invite = useMutation({
    mutationFn: () =>
      inviteToGame(
        game.id,
        selectedUserId.length > 0
          ? {
              commandId: crypto.randomUUID(),
              expectedVersion: game.version,
              targetType: 'user',
              userId: selectedUserId,
            }
          : {
              commandId: crypto.randomUUID(),
              expectedVersion: game.version,
              targetType: 'email',
              email: inviteEmail,
            },
      ),
    onSuccess: async (next) => {
      setSelectedUserId('');
      setInviteEmail('');
      await refresh(next);
    },
    onError: recoverStale,
  });
  const saveTeams = useMutation({
    mutationFn: () =>
      updateLobby(game.id, {
        commandId: crypto.randomUUID(),
        expectedVersion: game.version,
        action: 'SET_TEAM_ASSIGNMENTS',
        assignments: game.members
          .filter((member) => member.membershipStatus === 'accepted')
          .map((member) => {
            const teamIndex = assignments[member.userId];
            if (teamIndex === '' || teamIndex === undefined)
              throw new Error('Choose a team for every accepted player.');
            return { userId: member.userId, teamIndex };
          }),
      }),
    onSuccess: async (next) => {
      if ('kind' in next) await refresh(next);
    },
    onError: recoverStale,
  });
  const begin = useMutation({
    mutationFn: () =>
      startGame(game.id, { commandId: crypto.randomUUID(), expectedVersion: game.version }),
    onSuccess: refresh,
    onError: recoverStale,
  });
  const cancel = useMutation({
    mutationFn: () =>
      cancelGame(game.id, { commandId: crypto.randomUUID(), expectedVersion: game.version }),
    onSuccess: refresh,
    onError: recoverStale,
  });
  const leave = useMutation({
    mutationFn: () =>
      updateLobby(game.id, {
        commandId: crypto.randomUUID(),
        expectedVersion: game.version,
        action: 'LEAVE',
      }),
    onSuccess: async () => {
      await refreshDashboard();
      void navigate('/');
    },
    onError: recoverStale,
  });
  const queryClient = useQueryClient();
  const refreshDashboard = async () => queryClient.invalidateQueries({ queryKey: ['games'] });
  const cancelInvite = useMutation({
    mutationFn: (invitationId: string) =>
      cancelGameInvitation(game.id, invitationId, {
        commandId: crypto.randomUUID(),
        expectedVersion: game.version,
      }),
    onSuccess: refresh,
    onError: recoverStale,
  });

  const names = useMemo(
    () => new Map(game.members.map((member) => [member.userId, member.displayName])),
    [game.members],
  );
  const mutationError =
    invite.error ??
    saveTeams.error ??
    begin.error ??
    cancel.error ??
    leave.error ??
    cancelInvite.error;

  if (game.status === 'cancelled') {
    return (
      <section className="notice-card">
        <h2>This lobby was cancelled.</h2>
        <p>No further changes can be made.</p>
      </section>
    );
  }

  return (
    <>
      <section className="lobby-section" aria-labelledby="players-heading">
        <div className="section-heading">
          <div>
            <p className="step-label">Step 1</p>
            <h2 id="players-heading">Gather players</h2>
          </div>
          <span>
            {game.members.filter((member) => member.membershipStatus === 'accepted').length}{' '}
            accepted
          </span>
        </div>
        <ul className="member-list">
          {game.members
            .filter((member) => member.membershipStatus === 'accepted')
            .map((member) => (
              <li key={member.userId}>
                <span className="avatar" aria-hidden="true">
                  {member.displayName.charAt(0).toUpperCase()}
                </span>
                <span>
                  <strong>{member.displayName}</strong>
                  {member.isHost ? <small>Host</small> : null}
                </span>
              </li>
            ))}
        </ul>
        {game.permissions.canManage ? (
          <form
            className="invite-form"
            onSubmit={(event) => {
              event.preventDefault();
              invite.mutate();
            }}
          >
            <div>
              <label htmlFor="registered-user">Invite a family member</label>
              <select
                id="registered-user"
                onChange={(event) => setSelectedUserId(event.currentTarget.value)}
                value={selectedUserId}
              >
                <option value="">Enter an approved email instead</option>
                {directory.data
                  ?.filter((user) => !game.members.some((member) => member.userId === user.id))
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}
                    </option>
                  ))}
              </select>
            </div>
            {selectedUserId.length === 0 ? (
              <div>
                <label htmlFor="invite-email">Approved email</label>
                <input
                  id="invite-email"
                  onChange={(event) => setInviteEmail(event.currentTarget.value)}
                  required
                  type="email"
                  value={inviteEmail}
                />
              </div>
            ) : null}
            <button className="button secondary" disabled={invite.isPending} type="submit">
              {invite.isPending ? 'Inviting…' : 'Send invitation'}
            </button>
          </form>
        ) : null}
        {game.invitations.filter((item) => item.status === 'pending').length > 0 ? (
          <div className="pending-invites">
            <h3>Waiting for replies</h3>
            {game.invitations
              .filter((item) => item.status === 'pending')
              .map((item) => (
                <div key={item.id}>
                  <span>{item.email ?? 'Private invitee'}</span>
                  {game.permissions.canManage ? (
                    <button
                      className="text-button"
                      disabled={cancelInvite.isPending}
                      onClick={() => cancelInvite.mutate(item.id)}
                      type="button"
                    >
                      Cancel invite
                    </button>
                  ) : null}
                </div>
              ))}
          </div>
        ) : null}
      </section>

      <section className="lobby-section" aria-labelledby="teams-heading">
        <div className="section-heading">
          <div>
            <p className="step-label">Step 2</p>
            <h2 id="teams-heading">Set equal teams</h2>
          </div>
          <span>{game.teamCount} teams</span>
        </div>
        <div className="team-grid">
          {game.members
            .filter((member) => member.membershipStatus === 'accepted')
            .map((member) => (
              <label className="team-assignment" key={member.userId}>
                <span>{member.displayName}</span>
                <select
                  disabled={!game.permissions.canManage}
                  onChange={(event) => {
                    const selectedTeam = event.currentTarget.value;
                    setAssignments((current) => ({
                      ...current,
                      [member.userId]:
                        selectedTeam === '' ? '' : (Number(selectedTeam) as TeamIndex),
                    }));
                  }}
                  value={assignments[member.userId] ?? ''}
                >
                  <option value="">Choose team</option>
                  {Array.from({ length: game.teamCount }, (_, index) => (
                    <option key={index} value={index}>
                      Team {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </div>
        {game.permissions.canManage ? (
          <button
            className="button secondary"
            disabled={saveTeams.isPending}
            onClick={() => saveTeams.mutate()}
            type="button"
          >
            {saveTeams.isPending ? 'Saving…' : 'Save teams'}
          </button>
        ) : null}
      </section>

      <section className="lobby-section" aria-labelledby="order-heading">
        <div className="section-heading">
          <div>
            <p className="step-label">Step 3</p>
            <h2 id="order-heading">Preview turn order</h2>
          </div>
        </div>
        {game.seatPreview.length > 0 ? (
          <ol className="seat-preview">
            {game.seatPreview.map((userId) => (
              <li key={userId}>{names.get(userId) ?? 'Family player'}</li>
            ))}
          </ol>
        ) : (
          <p className="empty-card">
            A valid alternating order appears after every accepted player has an equal team.
          </p>
        )}
        {!game.validation.valid ? (
          <ul className="validation-list">
            {game.validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {mutationError !== null ? (
        <p className="error-card" role="alert">
          {mutationError.message}
        </p>
      ) : null}
      <div className="lobby-actions">
        {game.permissions.canManage ? (
          <button
            className="button primary"
            disabled={!game.permissions.canStart || begin.isPending}
            onClick={() => begin.mutate()}
            type="button"
          >
            {begin.isPending ? 'Starting…' : 'Start game'}
          </button>
        ) : null}
        {game.permissions.canLeave ? (
          <button
            className="button quiet"
            disabled={leave.isPending}
            onClick={() => leave.mutate()}
            type="button"
          >
            Leave lobby
          </button>
        ) : null}
        {game.permissions.canManage ? (
          <button
            className="button danger"
            disabled={cancel.isPending}
            onClick={() => {
              if (window.confirm('Cancel this lobby for everyone?')) cancel.mutate();
            }}
            type="button"
          >
            Cancel lobby
          </button>
        ) : null}
      </div>
      {game.recentEvents.length > 0 ? (
        <section className="history-card" aria-labelledby="history-heading">
          <h2 id="history-heading">Lobby history</h2>
          <ol>
            {game.recentEvents.map((event) => (
              <li key={event.version}>
                <strong>{event.actorDisplayName ?? 'System'}</strong> {eventLabel(event.eventType)}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

export function GamePage() {
  const { gameId } = useParams();
  const query = useQuery({
    queryKey: queryKeys.game(gameId ?? ''),
    queryFn: () => getGame(gameId ?? ''),
    enabled: gameId !== undefined,
    refetchInterval: (state) =>
      state.state.data?.status === 'active' && document.visibilityState === 'visible'
        ? 30_000
        : false,
  });
  return (
    <main className="app-page">
      <Link className="back-link" to="/">
        ← Dashboard
      </Link>
      {query.isPending ? <p className="empty-card">Opening game…</p> : null}
      {query.isError ? <p className="error-card">{query.error.message}</p> : null}
      {query.data !== undefined ? (
        <>
          <div className="game-title-row">
            <div>
              <p className="eyebrow">Card Lines</p>
              <h1>{query.data.title}</h1>
            </div>
            <div className="game-title-actions">
              <button
                className="text-button"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
                type="button"
              >
                {query.isFetching ? 'Refreshing…' : 'Refresh'}
              </button>
              <span className={`status-pill ${query.data.status}`}>{query.data.status}</span>
            </div>
          </div>
          {query.data.kind === 'lobby' ? (
            <LobbyPanel game={query.data} key={`${query.data.id}:${String(query.data.version)}`} />
          ) : (
            <CardLinesGame game={query.data} />
          )}
        </>
      ) : null}
    </main>
  );
}
