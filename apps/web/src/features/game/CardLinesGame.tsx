import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';

import { gameDetailSchema } from '@family-game-night/shared';

import {
  ApiClientError,
  applySequenceCommand,
  cancelGame as cancelGameRequest,
  queryKeys,
} from '../../api/client';

import type {
  PublicGameEventDto,
  SequenceCardDto,
  SequenceCommandRequest,
  SequenceGameViewDto,
} from '@family-game-night/shared';
import type { KeyboardEvent } from 'react';

interface PendingPlay {
  readonly cardId: string;
  readonly commandId: string;
  readonly expectedVersion: number;
  readonly targetCell: number;
}

const teamNames = ['Gold', 'Teal', 'Coral'] as const;

function suitSymbol(suit: string): string {
  switch (suit) {
    case 'H':
      return '♥';
    case 'D':
      return '♦';
    case 'C':
      return '♣';
    default:
      return '♠';
  }
}

function suitName(suit: string): string {
  switch (suit) {
    case 'H':
      return 'hearts';
    case 'D':
      return 'diamonds';
    case 'C':
      return 'clubs';
    default:
      return 'spades';
  }
}

function boardCardName(code: string): string {
  const suit = code.slice(-1);
  const rank = code.slice(0, -1);
  const rankName =
    rank === 'A'
      ? 'Ace'
      : rank === 'K'
        ? 'King'
        : rank === 'Q'
          ? 'Queen'
          : rank === '10'
            ? 'Ten'
            : rank;
  return `${rankName} of ${suitName(suit)}`;
}

function cardBehavior(card: SequenceCardDto): string | null {
  if (card.kind === 'two-eyed-jack') return 'Wild placement';
  if (card.kind === 'one-eyed-jack') return 'Remove opponent';
  return null;
}

function PlayingCard({
  card,
  disabled,
  selected,
  onSelect,
}: {
  readonly card: SequenceCardDto;
  readonly disabled: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const red = card.suit === 'H' || card.suit === 'D';
  const behavior = cardBehavior(card);
  const accessibleName = `${card.rank} of ${suitName(card.suit)}${behavior === null ? '' : `. ${behavior}`}${card.isDead ? '. Dead card' : ''}`;
  return (
    <li>
      <button
        aria-label={accessibleName}
        aria-pressed={selected}
        className={`playing-card ${red ? 'red-suit' : ''} ${selected ? 'selected' : ''}`}
        disabled={disabled}
        onClick={onSelect}
        type="button"
      >
        <span className="card-corner">
          <strong>{card.rank}</strong>
          <span aria-hidden="true">{suitSymbol(card.suit)}</span>
        </span>
        <span aria-hidden="true" className="card-suit">
          {suitSymbol(card.suit)}
        </span>
        {behavior !== null ? <small aria-hidden="true">{behavior}</small> : null}
        {card.isDead ? (
          <span aria-hidden="true" className="dead-badge">
            Dead
          </span>
        ) : null}
      </button>
    </li>
  );
}

function moveFocus(index: number, key: string): void {
  const row = Math.floor(index / 10);
  const column = index % 10;
  const target =
    key === 'ArrowLeft'
      ? row * 10 + Math.max(0, column - 1)
      : key === 'ArrowRight'
        ? row * 10 + Math.min(9, column + 1)
        : key === 'ArrowUp'
          ? Math.max(0, row - 1) * 10 + column
          : key === 'ArrowDown'
            ? Math.min(9, row + 1) * 10 + column
            : null;
  if (target === null) return;
  document.querySelector<HTMLElement>(`[data-cell-index="${String(target)}"]`)?.focus();
}

function Board({
  game,
  legalTargets,
  previewCell,
  selectionCells,
  targetAction,
  onTarget,
}: {
  readonly game: SequenceGameViewDto;
  readonly legalTargets: ReadonlySet<number>;
  readonly previewCell: number | null;
  readonly selectionCells: ReadonlySet<number>;
  readonly targetAction: 'place' | 'remove';
  readonly onTarget: (cell: number) => void;
}) {
  const protectedCells = useMemo(
    () => new Set(game.claimedSequences.flatMap((claim) => claim.cells)),
    [game.claimedSequences],
  );
  const claimLabels = useMemo(() => {
    const labels = new Map<number, number[]>();
    game.claimedSequences.forEach((claim, claimIndex) => {
      for (const cell of claim.cells) {
        labels.set(cell, [...(labels.get(cell) ?? []), claimIndex + 1]);
      }
    });
    return labels;
  }, [game.claimedSequences]);
  return (
    <div
      className="board-scroll"
      aria-label="Card Lines board. Scroll horizontally on a small screen."
    >
      <div
        className="sequence-board"
        role="grid"
        aria-label="Card Lines 10 by 10 board"
        aria-rowcount={10}
        aria-colcount={10}
      >
        {Array.from({ length: 10 }, (_, row) => (
          <div aria-rowindex={row + 1} className="board-row" key={row} role="row">
            {game.board.occupants.slice(row * 10, row * 10 + 10).map((occupant, column) => {
              const index = row * 10 + column;
              const code = game.board.layout[row]?.[column] ?? '';
              const legal = legalTargets.has(index);
              const free = code === 'FREE';
              const label = `Row ${String(row + 1)}, column ${String(column + 1)}: ${free ? 'free corner' : boardCardName(code)}${occupant === null ? ', empty' : `, ${teamNames[occupant]} team chip`}${protectedCells.has(index) ? ', protected by a sequence' : ''}${legal ? ', legal target' : ''}`;
              return (
                <button
                  aria-disabled={!legal}
                  aria-label={label}
                  aria-colindex={column + 1}
                  className={`board-cell ${free ? 'free-cell' : ''} ${legal ? 'legal-target' : ''} ${previewCell === index ? 'preview-target' : ''} ${game.board.lastChangedCell === index ? 'last-move' : ''} ${selectionCells.has(index) ? 'sequence-option-cell' : ''}`}
                  data-cell-index={index}
                  key={index}
                  onClick={() => {
                    if (legal) onTarget(index);
                  }}
                  onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                    if (event.key.startsWith('Arrow')) {
                      event.preventDefault();
                      moveFocus(index, event.key);
                    }
                  }}
                  role="gridcell"
                  tabIndex={index === 0 ? 0 : -1}
                  type="button"
                >
                  <span
                    className={
                      code.endsWith('H') || code.endsWith('D')
                        ? 'board-code red-suit'
                        : 'board-code'
                    }
                  >
                    {free ? '★' : code}
                  </span>
                  {occupant !== null ? (
                    <span
                      aria-hidden="true"
                      className={`chip team-${String(occupant)} ${protectedCells.has(index) ? 'protected' : ''}`}
                    />
                  ) : null}
                  {claimLabels.has(index) ? (
                    <span aria-hidden="true" className="claim-marker">
                      {claimLabels.get(index)?.join('/')}
                    </span>
                  ) : null}
                  {legal ? (
                    <span aria-hidden="true" className="target-marker">
                      {targetAction === 'remove' ? '−' : '+'}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function parseSequenceId(id: string): {
  readonly row: number;
  readonly column: number;
  readonly rowStep: number;
  readonly columnStep: number;
} | null {
  const match = /^(H|V|DR|DL):([0-9]):([0-9])$/.exec(id);
  if (match === null) return null;
  const direction = match[1];
  const row = Number(match[2]);
  const column = Number(match[3]);
  const [rowStep, columnStep] =
    direction === 'H' ? [0, 1] : direction === 'V' ? [1, 0] : direction === 'DR' ? [1, 1] : [1, -1];
  const endRow = row + rowStep * 4;
  const endColumn = column + columnStep * 4;
  if (endRow < 0 || endRow > 9 || endColumn < 0 || endColumn > 9) return null;
  return { row, column, rowStep, columnStep };
}

function parseAlternatives(value: unknown): readonly (readonly string[])[] | null {
  if (!Array.isArray(value)) return null;
  const alternatives: string[][] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 1 || item.length > 2) return null;
    const ids: string[] = [];
    for (const id of item as unknown[]) {
      if (typeof id !== 'string' || parseSequenceId(id) === null) return null;
      ids.push(id);
    }
    if (new Set(ids).size !== ids.length) return null;
    alternatives.push(ids);
  }
  return alternatives.length > 0 ? alternatives : null;
}

function sequenceCells(ids: readonly string[]): ReadonlySet<number> {
  const cells = new Set<number>();
  for (const id of ids) {
    const parsed = parseSequenceId(id);
    if (parsed === null) continue;
    for (let offset = 0; offset < 5; offset += 1) {
      cells.add(
        (parsed.row + offset * parsed.rowStep) * 10 + parsed.column + offset * parsed.columnStep,
      );
    }
  }
  return cells;
}

function readableEvent(event: PublicGameEventDto): string {
  switch (event.eventType) {
    case 'CARD_PLAYED':
      if (
        typeof event.payload['cardCode'] === 'string' &&
        typeof event.payload['targetCell'] === 'number'
      ) {
        const targetCell = event.payload['targetCell'];
        const claimCount = Array.isArray(event.payload['claimedSequenceIds'])
          ? event.payload['claimedSequenceIds'].length
          : 0;
        return `played ${event.payload['cardCode']} at row ${String(Math.floor(targetCell / 10) + 1)}, column ${String((targetCell % 10) + 1)}${claimCount > 0 ? ` and claimed ${String(claimCount)} sequence${claimCount === 1 ? '' : 's'}` : ''}`;
      }
      return 'played a card';
    case 'DEAD_CARD_EXCHANGED':
      return typeof event.payload['cardCode'] === 'string'
        ? `exchanged dead ${event.payload['cardCode']}`
        : 'exchanged a dead card';
    case 'TURN_PASSED_NO_LEGAL_MOVE':
      return 'passed with no legal move';
    case 'GAME_STARTED':
      return 'started the game';
    default:
      return event.eventType.toLowerCase().replaceAll('_', ' ');
  }
}

export function CardLinesGame({ game }: { readonly game: SequenceGameViewDto }) {
  const queryClient = useQueryClient();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPlay | null>(null);
  const [alternatives, setAlternatives] = useState<readonly (readonly string[])[] | null>(null);
  const [previewAlternative, setPreviewAlternative] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const confirmButton = useRef<HTMLButtonElement>(null);
  const selectedCard = game.myHand.find((card) => card.id === selectedCardId);
  const legalTargets = useMemo(() => new Set(selectedCard?.legalTargetCells ?? []), [selectedCard]);
  const isMyTurn = game.status === 'active' && game.currentPlayerId === game.myUserId;

  const command = useMutation({
    mutationFn: (request: SequenceCommandRequest) => applySequenceCommand(game.id, request),
    onSuccess: async (next, request) => {
      queryClient.setQueryData(queryKeys.game(game.id), next);
      setSelectedCardId(null);
      setPending(null);
      setAlternatives(null);
      setPreviewAlternative(null);
      setAnnouncement(
        request.type === 'PLAY_CARD'
          ? 'Move accepted. The latest turn is now shown.'
          : request.type === 'EXCHANGE_DEAD_CARD'
            ? 'Dead card exchanged. It is still your turn.'
            : 'Pass accepted. The latest turn is now shown.',
      );
      await queryClient.invalidateQueries({ queryKey: ['games'] });
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === 'SEQUENCE_SELECTION_REQUIRED') {
        setAlternatives(parseAlternatives(error.details['alternatives']));
      } else if (error instanceof ApiClientError && error.code === 'STALE_GAME_VERSION') {
        const latest = gameDetailSchema.safeParse(error.details['latest']);
        if (latest.success) queryClient.setQueryData(queryKeys.game(game.id), latest.data);
        else void queryClient.invalidateQueries({ queryKey: queryKeys.game(game.id) });
        setSelectedCardId(null);
        setPending(null);
        setAnnouncement('The game changed; refreshed to the latest turn.');
      }
    },
  });
  const cancel = useMutation({
    mutationFn: () =>
      cancelGameRequest(game.id, {
        commandId: crypto.randomUUID(),
        expectedVersion: game.version,
      }),
    onSuccess: async (next) => {
      queryClient.setQueryData(queryKeys.game(game.id), next);
      setAnnouncement('Game cancelled.');
      await queryClient.invalidateQueries({ queryKey: ['games'] });
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === 'STALE_GAME_VERSION') {
        const latest = gameDetailSchema.safeParse(error.details['latest']);
        if (latest.success) queryClient.setQueryData(queryKeys.game(game.id), latest.data);
        else void queryClient.invalidateQueries({ queryKey: queryKeys.game(game.id) });
        setAnnouncement('The game changed; refreshed to the latest turn.');
      }
    },
  });

  const submitPlay = (selection?: readonly string[]) => {
    if (pending === null) return;
    command.mutate({
      type: 'PLAY_CARD',
      ...pending,
      ...(selection === undefined ? {} : { sequenceSelection: [...selection] }),
    });
  };
  const current = game.players.find((player) => player.userId === game.currentPlayerId);
  const selectionCells =
    previewAlternative === null || alternatives === null
      ? new Set<number>()
      : sequenceCells(alternatives[previewAlternative] ?? []);

  return (
    <div className="game-layout">
      <p className="game-announcement" role="status">
        {announcement}
      </p>
      <section className="game-status-bar" aria-live="polite">
        <div>
          <span className="step-label">Turn {game.turnNumber}</span>
          <strong>
            {game.status === 'finished'
              ? `${teamNames[game.winnerTeamIndex ?? 0]} team won`
              : isMyTurn
                ? 'Your turn'
                : `Waiting on ${current?.displayName ?? 'another player'}`}
          </strong>
        </div>
        <div className="score-chips">
          {game.sequenceCounts.map((score, index) => (
            <span className={`team-score team-${String(index)}`} key={index}>
              {teamNames[index]} {score}/{game.targetSequences}
            </span>
          ))}
        </div>
      </section>

      <div className="board-column">
        <Board
          game={game}
          legalTargets={legalTargets}
          onTarget={(targetCell) =>
            setPending({
              cardId: selectedCardId ?? '',
              targetCell,
              commandId: crypto.randomUUID(),
              expectedVersion: game.version,
            })
          }
          previewCell={pending?.targetCell ?? null}
          selectionCells={selectionCells}
          targetAction={selectedCard?.kind === 'one-eyed-jack' ? 'remove' : 'place'}
        />
      </div>

      <aside className="game-sidebar">
        <details className="players-panel" open>
          <summary>Players</summary>
          <ol className="player-order">
            {game.players.map((player) => (
              <li className={player.isCurrentPlayer ? 'current' : ''} key={player.userId}>
                <span className={`mini-chip team-${String(player.teamIndex)}`} aria-hidden="true" />
                <span>
                  <strong>{player.displayName}</strong>
                  <small>
                    {player.handCount} cards · {teamNames[player.teamIndex]}
                  </small>
                </span>
                {player.isCurrentPlayer ? <span className="turn-arrow">Turn</span> : null}
              </li>
            ))}
          </ol>
        </details>
        <details open>
          <summary>Recent moves</summary>
          <ol className="move-history">
            {game.recentEvents
              .slice(-8)
              .toReversed()
              .map((event) => (
                <li key={event.version}>
                  <strong>{event.actorDisplayName ?? 'System'}</strong> {readableEvent(event)}
                  <time dateTime={event.createdAt}>
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(event.createdAt))}
                  </time>
                </li>
              ))}
          </ol>
        </details>
        <details>
          <summary>Quick rules</summary>
          <p>
            Play a matching card to place a chip. Two-eyed Jacks are wild. One-eyed Jacks remove an
            unprotected opposing chip. Complete rows of five to win.
          </p>
        </details>
        <p className="deck-counts">
          Draw pile: {game.deckCount} · Discard: {game.discardCount}
        </p>
        {game.permissions.canCancel ? (
          <button
            className="button danger cancel-active-game"
            disabled={cancel.isPending}
            onClick={() => {
              if (window.confirm('Cancel this active game for everyone?')) cancel.mutate();
            }}
            type="button"
          >
            Cancel game
          </button>
        ) : null}
      </aside>

      <section className="hand-tray" aria-labelledby="hand-heading">
        <div className="hand-heading">
          <div>
            <p className="step-label">Your cards</p>
            <h2 id="hand-heading">Choose a card</h2>
          </div>
          {game.deadCardExchangeUsed ? <span>Exchange used this turn</span> : null}
        </div>
        <ul className="card-hand">
          {game.myHand.map((card) => (
            <PlayingCard
              card={card}
              disabled={!isMyTurn || command.isPending}
              key={card.id}
              onSelect={() => {
                setSelectedCardId(card.id);
                setPending(null);
              }}
              selected={selectedCardId === card.id}
            />
          ))}
        </ul>
        {selectedCard?.isDead && !game.deadCardExchangeUsed ? (
          <button
            className="button secondary"
            disabled={command.isPending}
            onClick={() =>
              command.mutate({
                type: 'EXCHANGE_DEAD_CARD',
                cardId: selectedCard.id,
                commandId: crypto.randomUUID(),
                expectedVersion: game.version,
              })
            }
            type="button"
          >
            Exchange dead card
          </button>
        ) : null}
        {game.canPassNoLegalMove ? (
          <button
            className="button secondary"
            disabled={command.isPending}
            onClick={() =>
              command.mutate({
                type: 'PASS_NO_LEGAL_MOVE',
                commandId: crypto.randomUUID(),
                expectedVersion: game.version,
              })
            }
            type="button"
          >
            Pass — no legal move
          </button>
        ) : null}
      </section>

      {pending !== null ? (
        <section className="confirm-bar" aria-label="Confirm move">
          <p>
            Play <strong>{selectedCard?.code}</strong> on row{' '}
            {Math.floor(pending.targetCell / 10) + 1}, column {(pending.targetCell % 10) + 1}?
          </p>
          <div className="button-row">
            <button
              className="button primary"
              disabled={command.isPending}
              onClick={() => submitPlay()}
              ref={confirmButton}
              type="button"
            >
              {command.isPending ? 'Playing…' : 'Confirm move'}
            </button>
            <button className="button quiet" onClick={() => setPending(null)} type="button">
              Cancel
            </button>
          </div>
        </section>
      ) : null}
      {command.isError &&
      !(
        command.error instanceof ApiClientError &&
        command.error.code === 'SEQUENCE_SELECTION_REQUIRED' &&
        alternatives !== null
      ) ? (
        <p className="error-card game-error" role="alert">
          {command.error.message}
        </p>
      ) : null}
      {cancel.isError ? (
        <p className="error-card game-error" role="alert">
          {cancel.error.message}
        </p>
      ) : null}

      {alternatives !== null && pending !== null ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="sequence-choice-heading"
            aria-modal="true"
            className="sequence-dialog"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setAlternatives(null);
                setPreviewAlternative(null);
                window.setTimeout(() => confirmButton.current?.focus(), 0);
                return;
              }
              if (event.key !== 'Tab') return;
              const buttons: HTMLButtonElement[] = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              );
              const first = buttons[0];
              const last = buttons[buttons.length - 1];
              if (first === undefined || last === undefined) return;
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
            role="dialog"
          >
            <p className="eyebrow">Sequence choice</p>
            <h2 id="sequence-choice-heading">Which line should count?</h2>
            <p>This chip completes more than one valid option. Preview and choose one.</p>
            <div className="sequence-options">
              {alternatives.map((alternative, index) => (
                <button
                  autoFocus={index === 0}
                  className="button secondary"
                  key={alternative.join('|')}
                  onFocus={() => setPreviewAlternative(index)}
                  onMouseEnter={() => setPreviewAlternative(index)}
                  onClick={() => submitPlay(alternative)}
                  type="button"
                >
                  Option {index + 1}: {alternative.length} line{alternative.length === 1 ? '' : 's'}
                </button>
              ))}
            </div>
            <button
              className="button quiet"
              onClick={() => {
                setAlternatives(null);
                setPreviewAlternative(null);
                window.setTimeout(() => confirmButton.current?.focus(), 0);
              }}
              type="button"
            >
              Back to board
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
