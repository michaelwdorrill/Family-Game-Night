import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { getGameList, getInvitations, queryKeys, respondToInvitation } from '../../api/client';

import type { DashboardBucket, GameSummaryDto, InvitationDto } from '@family-game-night/shared';

const visiblePollingInterval = () => (document.visibilityState === 'visible' ? 60_000 : false);
const teamNames = ['Gold', 'Teal', 'Coral'] as const;

function scoreLabel(game: GameSummaryDto): string {
  if (game.sequenceCounts.length === 0) return 'Teams not set';
  return game.sequenceCounts
    .map((count, index) => `Team ${String(index + 1)}: ${String(count)}`)
    .join(' · ');
}

function GameCard({ game }: { readonly game: GameSummaryDto }) {
  const currentPlayer = game.currentPlayerDisplayName ?? 'Waiting for setup';
  return (
    <li className="game-card">
      <div>
        <p className="card-kicker">Card Lines</p>
        <h3>{game.title}</h3>
        <p>{game.status === 'lobby' ? 'Lobby in progress' : `Current turn: ${currentPlayer}`}</p>
        {game.myTeamIndex === null ? null : (
          <p className="my-team">
            <span aria-hidden="true" className={`mini-chip team-${String(game.myTeamIndex)}`} />
            Your team: {teamNames[game.myTeamIndex]}
          </p>
        )}
        <p className="score-line">{scoreLabel(game)}</p>
      </div>
      <div className="game-card-action">
        <time dateTime={game.updatedAt}>
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(game.updatedAt))}
        </time>
        <Link
          className={`button ${game.action === 'take-turn' ? 'primary' : 'secondary'}`}
          to={`/games/${game.id}`}
        >
          {game.action === 'take-turn'
            ? 'Take turn'
            : game.action === 'configure-lobby'
              ? 'Set up lobby'
              : 'View game'}
        </Link>
      </div>
    </li>
  );
}

function GameSection({
  bucket,
  empty,
  title,
}: {
  readonly bucket: DashboardBucket;
  readonly empty: string;
  readonly title: string;
}) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.games(bucket),
    queryFn: ({ pageParam }) => getGameList(bucket, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: visiblePollingInterval,
  });
  const games = query.data?.pages.flatMap((page) => page.games);
  return (
    <section className="dashboard-section" aria-labelledby={`${bucket}-heading`}>
      <div className="section-heading">
        <h2 id={`${bucket}-heading`}>{title}</h2>
        {query.isFetching && !query.isPending ? (
          <span className="refreshing">Refreshing…</span>
        ) : null}
      </div>
      {query.isPending ? <p className="empty-card">Loading games…</p> : null}
      {query.isError ? <p className="error-card">{query.error.message}</p> : null}
      {games?.length === 0 ? <p className="empty-card">{empty}</p> : null}
      {games !== undefined && games.length > 0 ? (
        <ul className="game-list">
          {games.map((game) => (
            <GameCard game={game} key={game.id} />
          ))}
        </ul>
      ) : null}
      {query.hasNextPage ? (
        <button
          className="button quiet load-more"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
          type="button"
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
}

function InvitationCard({ invitation }: { readonly invitation: InvitationDto }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (response: 'accept' | 'decline') =>
      respondToInvitation(invitation.id, response, {
        commandId: crypto.randomUUID(),
        expectedVersion: invitation.gameVersion,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      if ('kind' in result) void navigate(`/games/${result.id}`);
    },
  });
  return (
    <li className="invitation-card">
      <div>
        <p className="card-kicker">Invitation from {invitation.hostDisplayName}</p>
        <h3>{invitation.gameTitle}</h3>
        <p>Join a private Card Lines lobby.</p>
      </div>
      <div className="button-row">
        <button
          className="button primary"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate('accept')}
          type="button"
        >
          Accept
        </button>
        <button
          className="button quiet"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate('decline')}
          type="button"
        >
          Decline
        </button>
      </div>
      {mutation.isError ? <p className="form-error">{mutation.error.message}</p> : null}
    </li>
  );
}

function InvitationsSection() {
  const query = useQuery({
    queryKey: queryKeys.invitations,
    queryFn: getInvitations,
    refetchInterval: visiblePollingInterval,
  });
  return (
    <section className="dashboard-section" aria-labelledby="invitations-heading">
      <div className="section-heading">
        <h2 id="invitations-heading">Invitations</h2>
      </div>
      {query.isPending ? <p className="empty-card">Checking invitations…</p> : null}
      {query.isError ? <p className="error-card">{query.error.message}</p> : null}
      {query.data?.invitations.length === 0 ? (
        <p className="empty-card">No invitations are waiting for you.</p>
      ) : null}
      {query.data !== undefined && query.data.invitations.length > 0 ? (
        <ul className="invitation-list">
          {query.data.invitations.map((invitation) => (
            <InvitationCard invitation={invitation} key={invitation.id} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  return (
    <main className="app-page">
      <div className="hero-row">
        <div>
          <p className="eyebrow">Your family table</p>
          <h1>Game night, whenever you’re ready.</h1>
          <p className="page-intro">
            Pick up a turn, organize a lobby, or see how the last game ended.
          </p>
        </div>
        <div className="dashboard-actions">
          <button
            className="text-button"
            onClick={() => void queryClient.invalidateQueries()}
            type="button"
          >
            Refresh
          </button>
          <Link className="button primary create-button" to="/games/new">
            Create game
          </Link>
        </div>
      </div>
      <GameSection bucket="active" empty="No turns are waiting on you." title="Your turn" />
      <InvitationsSection />
      <GameSection
        bucket="waiting"
        empty="You aren’t waiting on anyone right now."
        title="Waiting on others"
      />
      <GameSection
        bucket="finished"
        empty="Finished games will collect here."
        title="Finished games"
      />
    </main>
  );
}
