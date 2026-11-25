import {
  applyPhase,
  createPhase,
  phaseMoves,
  phaseTitles,
} from '@family-game-night/table-games/phase-rummy';
import type { PhaseState, PhaseMove } from '@family-game-night/table-games/phase-rummy';
import {
  applySequenceCommand,
  createSequenceGame,
  toSequencePlayerView,
} from '@family-game-night/sequence-engine';
import { applyEuchre, createEuchre, euchreView } from '@family-game-night/table-games/euchre';
import {
  applyLantern,
  createLantern,
  goals,
  lanternView,
} from '@family-game-night/table-games/lantern-rummy';
import type {
  RandomSource,
  SequenceCommand,
  SequenceGameState,
} from '@family-game-night/sequence-engine';
import type { EuchreState, EuchreMove } from '@family-game-night/table-games/euchre';
import type { LanternState, LanternMove } from '@family-game-night/table-games/lantern-rummy';
import type { FamilyGame, FamilyPlay, MoveChoice } from '@family-game-night/shared';
import { ApiError } from '../errors';

export type Match =
  | { game: 'phase'; state: PhaseState }
  | { game: 'euchre'; state: EuchreState }
  | { game: 'lantern'; state: LanternState }
  | { game: 'lines'; state: SequenceGameState };

export function deal(
  game: FamilyGame,
  players: string[],
  random: RandomSource,
  teams?: 2 | 3,
): Match {
  switch (game) {
    case 'phase':
      return { game, state: createPhase(players.length, random) };
    case 'euchre':
      return { game, state: createEuchre(random) };
    case 'lantern':
      return { game, state: createLantern(players.length, random) };
    case 'lines': {
      const count = teams ?? (players.length % 2 === 0 ? 2 : 3);
      const teamRosters = Array.from({ length: count }, (_, team) =>
        players.filter((_, i) => i % count === team),
      );
      return { game, state: createSequenceGame({ teamRosters }, random) };
    }
  }
}
export function activeSeat(match: Match): number | null {
  if (match.state.phase === 'finished') return null;
  return match.game === 'lines' ? match.state.currentSeatIndex : match.state.turn;
}
export function turnChanged(before: Match, after: Match) {
  if (before.game === 'phase' && after.game === 'phase')
    return before.state.turnNumber !== after.state.turnNumber;
  if (activeSeat(before) !== activeSeat(after)) return true;
  if (before.game === 'euchre' && after.game === 'euchre') {
    // The last player to a trick may also earn the next lead.
    return (
      after.state.handNumber !== before.state.handNumber ||
      (before.state.phase === 'play' && after.state.trick.length === 0)
    );
  }
  return false;
}
export function matchSummary(match: Match, players: string[]) {
  switch (match.game) {
    case 'phase':
      return match.state.winner === null
        ? `Round ${match.state.round} · Phases ${match.state.goals.map((n) => Math.min(n + 1, 10)).join(' / ')}`
        : `${players[match.state.winner] ?? 'Player'} won`;
    case 'euchre': {
      const s = match.state;
      return s.winner === null
        ? `Hand ${s.handNumber} · ${s.phase === 'order' || s.phase === 'name' ? 'Bidding' : s.phase === 'discard' ? 'Dealer discard' : 'Playing tricks'} · ${s.scores.join('–')}`
        : `Team ${s.winner + 1} won · ${s.scores.join('–')}`;
    }
    case 'lantern': {
      const s = match.state;
      return s.winner === null
        ? `Goals banked · ${s.progress.join(' / ')}`
        : `${players[s.winner] ?? 'Player'} won`;
    }
    case 'lines': {
      const s = match.state;
      return s.winnerTeamIndex === null
        ? `Turn ${s.turnNumber} · Lines ${s.sequenceCounts.join('–')}`
        : `Team ${s.winnerTeamIndex + 1} won`;
    }
  }
}

const suitNames = { H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades' };
function labelMove(move: EuchreMove | LanternMove) {
  switch (move.type) {
    case 'pass':
      return 'Pass';
    case 'call':
      return `Call ${suitNames[move.suit]}${move.alone ? ' alone' : ' with partner'}`;
    case 'bank':
      return `Bank ${move.cards.join(' · ')}`;
    case 'draw':
      return move.from === 'stock' ? 'Draw from stock' : 'Take discard';
    case 'play':
      return `Play ${move.card}`;
    case 'discard':
      return `Discard ${move.card}`;
  }
}
function lineChoices(state: SequenceGameState, name: string) {
  const view = toSequencePlayerView(state, name);
  const choices: { move: SequenceCommand; choice: MoveChoice }[] = [];
  if (view.currentPlayerId === name && view.status === 'active') {
    for (const card of view.myHand) {
      for (const cell of card.legalTargetCells) {
        choices.push({
          move: { type: 'PLAY_CARD', cardId: card.id, targetCell: cell },
          choice: { label: `Play ${card.code}`, handCard: card.code, cell },
        });
      }
      if (!view.deadCardExchangeUsed && card.isDead)
        choices.push({
          move: { type: 'EXCHANGE_DEAD_CARD', cardId: card.id },
          choice: { label: `Exchange ${card.code}` },
        });
    }
    if (view.canPassNoLegalMove)
      choices.push({ move: { type: 'PASS_NO_LEGAL_MOVE' }, choice: { label: 'Pass' } });
  }
  return { choices, view };
}
function phaseLabel(m: PhaseMove, players: string[]) {
  switch (m.type) {
    case 'draw':
      return m.from === 'stock' ? 'Draw from stock' : 'Take discard';
    case 'lay':
      return (
        'Lay ' +
        m.groups
          .map((g) => (g.kind === 'run' ? `Run from ${g.value}: ` : '') + g.cards.join(', '))
          .join(' + ')
      );
    case 'hit':
      return `Add ${m.card} to ${players[m.seat] ?? 'player'}’s group ${m.group + 1} (${m.side === 'left' ? 'start' : 'end'})`;
    case 'discard':
      return 'Discard ' + m.card;
    case 'skip':
      return 'Skip ' + players[m.target];
  }
}
export function playerView(match: Match, players: string[], seat: number): FamilyPlay {
  const name = players[seat]!;
  switch (match.game) {
    case 'phase': {
      const s = match.state;
      return {
        hand: s.hands[seat]!.slice(),
        moves: phaseMoves(s, seat).map((m) => ({ label: phaseLabel(m, players) })),
        details: [
          `Stock: ${s.stock.length} · Discard: ${s.discards.at(-1) ?? 'empty'}`,
          ...players.map(
            (p, i) =>
              `${p} · ${phaseTitles[s.goals[i]!] ?? 'All phases complete'} · ${s.scores[i] ?? 0} points · ${s.hands[i]?.length ?? 0} cards`,
          ),
          ...s.laid.flatMap((groups, i) =>
            groups.map(
              (g, j) => `${players[i] ?? 'Player'} · Group ${j + 1}: ${g.cards.join(', ')}`,
            ),
          ),
        ],
      };
    }
    case 'lines': {
      const { view, choices } = lineChoices(match.state, name);
      return {
        hand: view.myHand.map((card) => card.code),
        board: view.board.layout.flat().map((code, i) => ({
          code,
          team: view.board.occupants[i] ?? null,
          protected: view.claimedSequences.some((line) => line.cells.includes(i)),
          lastMove: view.board.lastChangedCell === i,
        })),
        moves: choices.map((option) => option.choice),
        details: [
          `Target: ${view.targetSequences} lines`,
          ...view.players.map(
            (p) => `${p.userId} · Team ${p.teamIndex + 1} · ${p.handCount} cards`,
          ),
        ],
      };
    }
    case 'euchre': {
      const view = euchreView(match.state, seat);
      const trick = (cards: typeof view.trick) =>
        cards.map((p) => `${players[p.seat] ?? 'Player'} ${p.card}`).join(' · ');
      return {
        hand: view.hand,
        moves: view.moves.map((move) => ({ label: labelMove(move) })),
        details: [
          `Dealer: ${players[view.dealer] ?? 'Player'} · Upcard: ${view.upcard}`,
          `Trump: ${view.trump ? suitNames[view.trump] : 'undecided'}${view.maker === null ? '' : ' · Called by ' + players[view.maker]}`,
          `Tricks: ${view.tricks.join('–')}`,
          `On the table: ${trick(view.trick) || 'No cards yet'}`,
          ...(view.lastTrick.length ? [`Last trick: ${trick(view.lastTrick)}`] : []),
          ...(view.sittingOut === null
            ? []
            : [`${players[view.sittingOut] ?? 'Partner'} sits out this hand`]),
        ],
      };
    }
    case 'lantern': {
      const view = lanternView(match.state, seat);
      return {
        hand: view.hand,
        moves: view.moves.map((move) => ({ label: labelMove(move) })),
        details: [
          `Stock: ${view.stockCount} · Discard: ${view.discard ?? 'empty'}`,
          ...players.map(
            (p, i) => `${p} · ${goals[view.progress[i] ?? 0] ?? 'All goals complete'}`,
          ),
          ...(view.lastMeld ? [`Last meld: ${view.lastMeld.cards.join(' · ')}`] : []),
        ],
      };
    }
  }
}

// Resolve the offered move from the stored version, never from client-supplied cards.
export function playMove(
  match: Match,
  players: string[],
  seat: number,
  requested: number | 'random',
  random: RandomSource,
  selection?: string[],
): Match {
  function choose<T>(items: T[]): T {
    const item = items[requested === 'random' ? random.randomInt(items.length) : requested];
    if (item === undefined)
      throw new ApiError(422, 'INVALID_MOVE', 'Choose a legal move for this turn.');
    return item;
  }
  switch (match.game) {
    case 'phase': {
      const options = phaseMoves(match.state, seat);
      const index = requested === 'random' ? random.randomInt(options.length) : requested;
      if (!options[index])
        throw new ApiError(422, 'INVALID_MOVE', 'Choose a legal move for this turn.');
      return { game: match.game, state: applyPhase(match.state, seat, index, random) };
    }
    case 'euchre':
      return {
        game: match.game,
        state: applyEuchre(match.state, seat, choose(euchreView(match.state, seat).moves), random),
      };
    case 'lantern':
      return {
        game: match.game,
        state: applyLantern(
          match.state,
          seat,
          choose(lanternView(match.state, seat).moves),
          random,
        ),
      };
    case 'lines': {
      const actorUserId = players[seat]!;
      const { move } = choose(lineChoices(match.state, actorUserId).choices);
      const apply = (command: SequenceCommand) =>
        applySequenceCommand({ state: match.state, actorUserId, random, command });
      let result = apply(
        move.type === 'PLAY_CARD' && selection ? { ...move, sequenceSelection: selection } : move,
      );
      if (
        !result.ok &&
        move.type === 'PLAY_CARD' &&
        requested === 'random' &&
        result.error.code === 'SEQUENCE_SELECTION_REQUIRED'
      ) {
        const options = result.error.details['alternatives'] as string[][];
        result = apply({ ...move, sequenceSelection: choose(options) });
      }
      if (!result.ok)
        throw new ApiError(422, result.error.code, result.error.message, result.error.details);
      return { game: match.game, state: result.state };
    }
  }
}
