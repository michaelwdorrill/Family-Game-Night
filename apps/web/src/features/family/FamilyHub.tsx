import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { familyGames, gameKeys } from '@family-game-night/shared';
import type {
  FamilyAction,
  FamilyGame,
  FamilyPlay,
  FamilyTable,
  FamilyTableDetail,
  TableSettings,
} from '@family-game-night/shared';
import { familyRequest, FamilyError, linkStorage, nameStorage } from './api';

type Props = { name: string; roster: string[] };
const title = (t: FamilyTable) => t.title ?? `${t.host}’s ${familyGames[t.game].title} table`;
function date(due: number | null) {
  return due === null
    ? ''
    : new Date(due).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}
function Countdown({ due }: { due: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((due - now) / 1000));
  if (!seconds) return 'Time expired · Updating turn';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 2) return seconds + 's left';
  if (minutes < 60) return minutes + 'm left';
  return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm left';
}
function Gate({ roster, confirm }: { roster: string[]; confirm: (p: string) => void }) {
  const [choice, setChoice] = useState('');
  return (
    <main className="centered-page">
      <form
        className="dialog-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (choice) confirm(choice);
        }}
      >
        <p className="eyebrow">Family Game Night</p>
        <h1>Who’s playing?</h1>
        <label htmlFor="family-player">Your name</label>
        <select
          required
          id="family-player"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value="">Choose your name</option>
          {roster.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <button className="button primary" disabled={!choice}>
          Confirm name
        </button>
      </form>
    </main>
  );
}
function useTables(name: string) {
  return useQuery({
    queryKey: ['family', name, 'tables'],
    queryFn: () => familyRequest<FamilyTable[]>('tables', name),
    refetchInterval: 10000,
    staleTime: 0,
  });
}
function Home({ name }: { name: string }) {
  const tables = useTables(name);
  return (
    <>
      <h1>Choose a game</h1>
      {tables.error && <p role="alert">{tables.error.message}</p>}
      <div className="family-games">
        {gameKeys.map((game) => {
          const rows = (tables.data ?? []).filter((t) => t.game === game);
          const turns = rows.filter((t) => t.turn === name).length,
            invites = rows.filter((t) => t.invited).length;
          return (
            <article className="family-tile" key={game}>
              <h2>{familyGames[game].title}</h2>
              {game === 'phase' && <p>Ten phases, wild cards and skips</p>}
              <div className="button-row">
                <Link
                  className={'button ' + (turns ? 'primary' : 'secondary')}
                  to={'/family/' + game + '/matches'}
                >
                  My Games{turns ? ` · ${turns} your turn` : ''}
                </Link>
                <Link
                  className={'button ' + (invites ? 'primary' : 'secondary')}
                  to={'/family/' + game + '/lobbies'}
                >
                  Lobbies{invites ? ` · ${invites} invited` : ''}
                </Link>
              </div>
            </article>
          );
        })}
        <article className="family-tile">
          <h2>Mexican Train Dominoes</h2>
          <p>Family rules in progress</p>
        </article>
      </div>
    </>
  );
}
function TableList({ name, game, lobbies }: { name: string; game: FamilyGame; lobbies: boolean }) {
  const tables = useTables(name);
  const rows = (tables.data ?? []).filter(
    (t) =>
      t.game === game &&
      (lobbies ? t.status === 'lobby' : t.status === 'active' && t.players.includes(name)),
  );
  const finished = (tables.data ?? []).filter(
    (t) => t.game === game && t.status === 'finished' && t.players.includes(name),
  );
  const rank = (t: FamilyTable) => (lobbies ? Number(t.invited) : Number(t.turn === name));
  rows.sort((a, b) => rank(b) - rank(a));
  return (
    <>
      <Link to="/">All games</Link>
      <h1>
        {familyGames[game].title} · {lobbies ? 'Lobbies' : 'My Games'}
      </h1>
      {lobbies && (
        <Link className="button primary" to={'/family/' + game + '/new'}>
          Create lobby
        </Link>
      )}
      {tables.error && <p role="alert">{tables.error.message}</p>}
      {tables.isPending && <p>Loading tables…</p>}
      {tables.isSuccess && !rows.length && (
        <p>{lobbies ? 'No available lobbies.' : 'No active matches.'}</p>
      )}
      {rows.map((t) => (
        <article className={'family-tile ' + (rank(t) ? 'family-priority' : '')} key={t.id}>
          <h2>
            <Link to={'/table/' + t.id}>{title(t)}</Link>
          </h2>
          <strong>
            {t.invited
              ? 'You’re invited'
              : t.turn === name
                ? 'Your turn'
                : t.turn
                  ? `Waiting on ${t.turn}`
                  : t.players.includes(name)
                    ? 'You’re seated'
                    : 'Open seat'}
          </strong>
          <p>
            {t.summary} · {t.players.length}/{t.capacity} seats
            {t.due ? ' · Due ' + date(t.due) : ''}
          </p>
        </article>
      ))}
      {!lobbies && finished.length > 0 && (
        <details>
          <summary>Finished matches ({finished.length})</summary>
          <ul>
            {finished.map((t) => (
              <li key={t.id}>
                <Link to={'/table/' + t.id}>{title(t)}</Link> · {t.summary}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
function CreateLobby({ name, roster, game }: Props & { game: FamilyGame }) {
  const [creationId] = useState(() => crypto.randomUUID());
  const [visibility, setVisibility] = useState<TableSettings['visibility']>('open');
  const [invites, setInvites] = useState<string[]>([]);
  const [capacity, setCapacity] = useState<number>(familyGames[game].counts[0]);
  const nav = useNavigate();
  const cache = useQueryClient();
  const create = useMutation({
    mutationFn: (settings: TableSettings) =>
      familyRequest<FamilyTableDetail>('tables', name, settings, creationId),
    onSuccess: (t) => {
      cache.setQueryData(['family', name, t.id], t);
      void cache.invalidateQueries({ queryKey: ['family', name, 'tables'] });
      void nav('/table/' + t.id);
    },
  });
  return (
    <>
      <Link to={'/family/' + game + '/lobbies'}>Back to lobbies</Link>
      <h1>Create a {familyGames[game].title} lobby</h1>
      <form
        className="family-form"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const rawTitle = data.get('title');
          const label = typeof rawTitle === 'string' ? rawTitle.trim() : '';
          create.mutate({
            ...(label ? { title: label } : {}),
            ...(game === 'lines' ? { teams: Number(data.get('teams')) as 2 | 3 } : {}),
            game,
            visibility,
            invitees: visibility === 'invite' ? invites : [],
            capacity: Number(data.get('capacity')),
            timerDays: Number(data.get('timer')) as TableSettings['timerDays'],
            startMode: data.get('start') as TableSettings['startMode'],
          });
        }}
      >
        <label>
          Table name (optional)
          <input
            name="title"
            maxLength={60}
            placeholder={name + '’s ' + familyGames[game].title + ' table'}
          />
        </label>
        <label>
          Players
          <select
            name="capacity"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          >
            {familyGames[game].counts.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        {game === 'lines' && (
          <label>
            Teams
            <select key={capacity} name="teams">
              {[2, 3]
                .filter((n) => capacity % n === 0)
                .map((n) => (
                  <option key={n}>{n}</option>
                ))}
            </select>
          </label>
        )}
        <label>
          Who can join?
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as typeof visibility)}
          >
            <option value="open">Open to the family</option>
            <option value="invite">Invited players only</option>
          </select>
        </label>
        {visibility === 'invite' && (
          <fieldset>
            <legend>Invite family members</legend>
            <div className="family-invites">
              {roster
                .filter((n) => n !== name)
                .map((n) => (
                  <label key={n}>
                    <input
                      type="checkbox"
                      checked={invites.includes(n)}
                      onChange={(e) =>
                        setInvites(
                          e.target.checked ? [...invites, n] : invites.filter((p) => p !== n),
                        )
                      }
                    />
                    {n}
                  </label>
                ))}
            </div>
          </fieldset>
        )}
        <label>
          Turn timer
          <select name="timer" defaultValue="3">
            {[1, 3, 7].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'day' : 'days'}
              </option>
            ))}
          </select>
        </label>
        <p>A random legal turn is played when time runs out.</p>
        <label>
          Start policy
          <select name="start">
            <option value="auto">Start automatically when full</option>
            <option value="host">Host starts the full table</option>
          </select>
        </label>
        {create.error && <p role="alert">{create.error.message}</p>}
        <button
          className="button primary"
          disabled={create.isPending || (visibility === 'invite' && !invites.length)}
        >
          Create lobby
        </button>
      </form>
    </>
  );
}
function GameSection(props: Props) {
  const { game, section } = useParams();
  if (!gameKeys.includes(game as FamilyGame)) return <Navigate replace to="/" />;
  if (section === 'new') return <CreateLobby key={game} {...props} game={game as FamilyGame} />;
  if (section !== 'lobbies' && section !== 'matches') return <Navigate replace to="/" />;
  return <TableList name={props.name} game={game as FamilyGame} lobbies={section === 'lobbies'} />;
}
function HandCard({ code }: { code: string }) {
  const symbols: Record<string, string> = { C: '♣', D: '♦', H: '♥', S: '♠' };
  const suits: Record<string, string> = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };
  const suit = code.slice(-1);
  if (symbols[suit] && !code.includes(' '))
    return (
      <span
        aria-label={code.slice(0, -1) + ' of ' + suits[suit]}
        className={suit === 'H' || suit === 'D' ? 'family-red-suit' : ''}
      >
        {code.slice(0, -1)}
        {symbols[suit]}
      </span>
    );
  return <span>{code}</span>;
}
function Play({
  play,
  move,
  disabled,
}: {
  play: FamilyPlay;
  move: (index: number) => void;
  disabled: boolean;
}) {
  const [card, setCard] = useState('');
  const [selectedMove, setSelectedMove] = useState('');
  const manyMoves = !play.board && play.moves.length > 24;
  return (
    <>
      <h2>Your hand</h2>
      <ul className="family-hand">
        {play.hand.map((c, i) => (
          <li key={i}>
            {play.board && play.moves.some((m) => m.handCard === c) ? (
              <button
                className="button secondary"
                aria-pressed={card === c}
                onClick={() => setCard(c)}
              >
                <HandCard code={c} />
              </button>
            ) : (
              <HandCard code={c} />
            )}
          </li>
        ))}
      </ul>
      {play.board && (
        <>
          <p>Choose a card, then a highlighted board space.</p>
          <div className="family-board" aria-label="Card Lines board">
            {play.board.map((cell, i) => {
              const index = play.moves.findIndex((m) => m.handCard === card && m.cell === i);
              return (
                <button
                  key={i}
                  className={[
                    index >= 0 ? 'available' : '',
                    cell.protected ? 'claimed' : '',
                    cell.lastMove ? 'last-cell' : '',
                  ].join(' ')}
                  disabled={disabled || index < 0}
                  aria-label={`Row ${Math.floor(i / 10) + 1} column ${(i % 10) + 1}, ${cell.code}${cell.team === null ? '' : ', team ' + String(cell.team + 1)}${cell.protected ? ', protected line' : ''}${cell.lastMove ? ', last move' : ''}`}
                  onClick={() => move(index)}
                >
                  {cell.code === 'FREE' ? '★' : cell.code}
                  {cell.team !== null && (
                    <b className={'team-' + String(cell.team)}>{cell.team + 1}</b>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="button-row">
        {manyMoves && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedMove) move(Number(selectedMove));
            }}
          >
            <label>
              Legal moves
              <select value={selectedMove} onChange={(e) => setSelectedMove(e.target.value)}>
                <option value="">Choose a move</option>
                {play.moves.map((m, i) => (
                  <option key={i} value={i}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary" disabled={disabled || !selectedMove}>
              Play move
            </button>
          </form>
        )}
        {!manyMoves &&
          play.moves.map(
            (m, i) =>
              m.cell === undefined && (
                <button
                  className="button secondary"
                  key={i}
                  disabled={disabled}
                  onClick={() => move(i)}
                >
                  {m.label}
                </button>
              ),
          )}
      </div>
      <ul>
        {play.details.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
    </>
  );
}
function TablePage({ name, roster, id }: Props & { id: string }) {
  const cache = useQueryClient(),
    nav = useNavigate();
  const [invite, setInvite] = useState('');
  const [share, setShare] = useState('');
  const key = ['family', name, id];
  const table = useQuery({
    queryKey: key,
    queryFn: () => familyRequest<FamilyTableDetail>('tables/' + id, name),
    refetchInterval: 5000,
    staleTime: 0,
  });
  const due = table.data?.due;
  const refetch = table.refetch;
  useEffect(() => {
    if (due == null) return;
    const timeout = window.setTimeout(
      () => {
        void refetch();
      },
      Math.max(0, due - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [due, refetch]);
  const action = useMutation({
    mutationFn: (input: FamilyAction) =>
      familyRequest<FamilyTableDetail | null>('tables/' + id, name, input),
    onSuccess: (t) => {
      if (t) cache.setQueryData(key, t);
      else void nav('/family/' + (table.data?.game ?? 'euchre') + '/lobbies');
      void cache.invalidateQueries({ queryKey: ['family', name, 'tables'] });
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: key });
    },
  });
  const t = table.data;
  if (table.isError || !t) return <p role="status">{table.error?.message ?? 'Loading table…'}</p>;
  const member = t.players.includes(name),
    host = t.host === name,
    locked = action.isPending;
  const choices =
    action.error instanceof FamilyError && action.variables?.version === t.version
      ? action.error.alternatives
      : null;
  const move = (index: number, selection?: string[]) =>
    action.mutate({ type: 'move', index, version: t.version, ...(selection ? { selection } : {}) });
  return (
    <>
      <Link to={'/family/' + t.game + (t.status === 'lobby' ? '/lobbies' : '/matches')}>
        Back to {t.status === 'lobby' ? 'lobbies' : 'my games'}
      </Link>
      <h1>{title(t)}</h1>
      <p>{t.summary}</p>
      {t.turn && (
        <p className={t.turn === name ? 'family-priority' : ''}>
          <strong>{t.turn === name ? 'Your turn' : `Waiting on ${t.turn}`}</strong> · Due{' '}
          {date(t.due)}{' '}
          {t.due !== null && (
            <>
              · <Countdown due={t.due} />
            </>
          )}
        </p>
      )}
      {host &&
        t.game === 'euchre' &&
        t.status === 'lobby' &&
        t.startMode === 'host' &&
        t.players.length === 4 && (
          <label>
            Your partner
            <select
              disabled={locked}
              value={t.players[2]}
              onChange={(e) =>
                action.mutate({ type: 'partner', name: e.target.value, version: t.version })
              }
            >
              {t.players.slice(1).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        )}
      {t.lastTimeout && <p>{t.lastTimeout}</p>}
      <h2>At the table</h2>
      <ol>
        {t.players.map((p, i) => (
          <li key={p}>
            {p}
            {p === t.host ? ' · Host' : ''}
            {t.game === 'euchre' ? ' · Team ' + String((i % 2) + 1) : ''}
          </li>
        ))}
      </ol>
      {t.status === 'lobby' && (
        <>
          <p>
            {t.players.length}/{t.capacity} seats ·{' '}
            {t.visibility === 'invite' ? 'Invite only' : 'Open'} · {t.timerDays}-day turns ·{' '}
            {t.startMode === 'auto' ? 'Starts automatically when full' : 'Host starts when full'}
          </p>
          {!member && (
            <button
              className="button primary"
              disabled={locked}
              onClick={() => action.mutate({ type: 'join', version: t.version })}
            >
              {t.invited ? 'Accept invitation' : 'Join table'}
            </button>
          )}
          {t.invited && (
            <button
              className="button quiet"
              disabled={locked}
              onClick={() => action.mutate({ type: 'decline', version: t.version })}
            >
              Decline
            </button>
          )}
          {host && t.startMode === 'host' && (
            <button
              className="button primary"
              disabled={locked || t.players.length !== t.capacity}
              onClick={() => action.mutate({ type: 'start', version: t.version })}
            >
              Start game
            </button>
          )}
          {host && t.pending.length > 0 && <p>Invited · {t.pending.join(', ')}</p>}
          {host && t.visibility === 'invite' && t.players.length < t.capacity && (
            <form
              className="family-form"
              onSubmit={(e) => {
                e.preventDefault();
                action.mutate({ type: 'invite', version: t.version, name: invite });
                setInvite('');
              }}
            >
              <label>
                Invite another player
                <select value={invite} onChange={(e) => setInvite(e.target.value)}>
                  <option value="">Choose a name</option>
                  {roster
                    .filter((n) => !t.players.includes(n) && !t.pending.includes(n))
                    .map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                </select>
              </label>
              <button className="button secondary" disabled={locked || !invite}>
                Invite
              </button>
            </form>
          )}
        </>
      )}
      {t.play && <Play key={t.version} play={t.play} move={move} disabled={locked} />}
      {choices && (
        <fieldset>
          <legend>Choose the line to claim</legend>
          {choices.map((lines) => (
            <button
              key={lines.join()}
              className="button secondary"
              disabled={locked}
              onClick={() => {
                if (action.variables?.type === 'move') move(action.variables.index, lines);
              }}
            >
              {lines.join(' + ')}
            </button>
          ))}
        </fieldset>
      )}
      {action.error && !choices && <p role="alert">{action.error.message}</p>}
      <button
        className="button quiet"
        onClick={() =>
          setShare(
            location.origin +
              location.pathname +
              '#/table/' +
              id +
              '?family=' +
              encodeURIComponent(localStorage.getItem(linkStorage) ?? ''),
          )
        }
      >
        Share table link
      </button>
      {share && (
        <label>
          Family link
          <input readOnly value={share} onFocus={(e) => e.target.select()} />
        </label>
      )}
    </>
  );
}
function TableRoute(props: Props) {
  const { id } = useParams();
  return id ? <TablePage {...props} id={id} key={id} /> : <Navigate replace to="/" />;
}
export function FamilyHub() {
  const cache = useQueryClient();
  const [name, setName] = useState(() => localStorage.getItem(nameStorage) ?? '');
  const linked = Boolean(localStorage.getItem(linkStorage));
  const roster = useQuery({
    queryKey: ['family-roster'],
    queryFn: () => familyRequest<string[]>('roster'),
    enabled: linked,
    retry: false,
  });
  if (!linked || roster.error)
    return (
      <main className="centered-page">
        <h1>Family Game Night</h1>
        <p role="status">{roster.error?.message ?? 'Open the shared family link to join.'}</p>
        {linked && (
          <button className="button secondary" onClick={() => void roster.refetch()}>
            Try again
          </button>
        )}
      </main>
    );
  if (!roster.data) return <main className="centered-page">Opening game night…</main>;
  const choose = (p: string) => {
    cache.removeQueries({ queryKey: ['family'] });
    localStorage.setItem(nameStorage, p);
    setName(p);
  };
  if (!roster.data.includes(name)) return <Gate roster={roster.data} confirm={choose} />;
  const props = { name, roster: roster.data };
  return (
    <>
      <header className="app-header">
        <Link className="brand" to="/">
          Family Game Night
        </Link>
        <div className="account-menu">
          <strong>{name}</strong>
          <button className="button quiet" onClick={() => choose('')}>
            Switch player
          </button>
        </div>
      </header>
      <main className="family-page">
        <Routes>
          <Route path="/" element={<Home name={name} />} />
          <Route path="/family/:game/:section" element={<GameSection {...props} />} />
          <Route path="/table/:id" element={<TableRoute {...props} />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </main>
    </>
  );
}
