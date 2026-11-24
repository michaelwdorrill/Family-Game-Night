import { at, deck, rankOf, ranks, suitOf, takeCard } from './cards.js';
import type { Card, Random } from './cards.js';

export const goals = [
  'Three of one rank',
  'Three consecutive cards in one suit',
  'Two pairs of adjacent ranks',
] as const;
export interface LanternState {
  phase: 'draw' | 'meld' | 'discard' | 'finished';
  turn: number;
  hands: Card[][];
  progress: number[];
  stock: Card[];
  discards: Card[];
  spent: Card[];
  lastMeld: { seat: number; cards: Card[] } | null;
  winner: number | null;
}
export type LanternMove =
  | { type: 'draw'; from: 'stock' | 'discards' }
  | { type: 'bank'; cards: Card[] }
  | { type: 'discard'; card: Card };

export function createLantern(count: number, random: Random): LanternState {
  if (!Number.isInteger(count) || count < 2 || count > 4)
    throw new Error('Lantern Rummy takes two to four players.');
  const cards = random.shuffle(deck());
  const hands = Array.from({ length: count }, () => cards.splice(0, 6));
  return {
    phase: 'draw',
    turn: random.randomInt(count),
    hands,
    progress: hands.map(() => 0),
    stock: cards.slice(1),
    discards: [at(cards, 0)],
    spent: [],
    lastMeld: null,
    winner: null,
  };
}

export function meetsGoal(goal: number, cards: readonly Card[]): boolean {
  if (new Set(cards).size !== cards.length) return false;
  const values = cards.map((card) => ranks.indexOf(rankOf(card))).sort((a, b) => a - b);
  const [a, b, c, d] = values;
  if (a === undefined || b === undefined || c === undefined) return false;
  switch (goal) {
    case 0:
      return values.length === 3 && a === c;
    case 1:
      return (
        values.length === 3 && b === a + 1 && c === b + 1 && new Set(cards.map(suitOf)).size === 1
      );
    case 2:
      return values.length === 4 && a === b && c === a + 1 && c === d;
    default:
      return false;
  }
}

function meldChoices(hand: readonly Card[], goal: number): LanternMove[] {
  const moves: LanternMove[] = [];
  function choose(start: number, picked: Card[]) {
    if (picked.length === (goal === 2 ? 4 : 3)) {
      if (meetsGoal(goal, picked)) moves.push({ type: 'bank', cards: picked });
      return;
    }
    for (let i = start; i < hand.length; i++) choose(i + 1, [...picked, at(hand, i)]);
  }
  choose(0, []);
  return moves;
}

export function lanternMoves(state: LanternState, seat: number): LanternMove[] {
  if (seat !== state.turn || state.phase === 'finished') return [];
  if (state.phase === 'draw') {
    const moves: LanternMove[] = [{ type: 'draw', from: 'stock' }];
    if (state.discards.length) moves.push({ type: 'draw', from: 'discards' });
    return moves;
  }
  const hand = at(state.hands, seat);
  const moves = state.phase === 'meld' ? meldChoices(hand, at(state.progress, seat)) : [];
  return moves.concat(hand.map((card) => ({ type: 'discard', card })));
}

function drawStock(state: LanternState, random: Random): Card {
  if (!state.stock.length) {
    // The visible discard stays available to the next player.
    const buried = state.discards.splice(0, Math.max(0, state.discards.length - 1));
    state.stock = random.shuffle([...state.spent, ...buried]);
    state.spent = [];
  }
  const card = state.stock.pop();
  if (card === undefined) throw new Error('The stock cannot be replenished.');
  return card;
}

export function applyLantern(
  state: LanternState,
  seat: number,
  move: LanternMove,
  random: Random,
): LanternState {
  if (seat !== state.turn || state.phase === 'finished') throw new Error('It is not your turn.');
  const updated = structuredClone(state);
  const hand = at(updated.hands, seat);
  switch (move.type) {
    case 'draw': {
      if (updated.phase !== 'draw') throw new Error('You already drew this turn.');
      if (move.from !== 'stock' && move.from !== 'discards') throw new Error('Unknown draw pile.');
      const card = move.from === 'stock' ? drawStock(updated, random) : updated.discards.pop();
      if (!card) throw new Error('The discard pile is empty.');
      hand.push(card);
      updated.phase = 'meld';
      break;
    }
    case 'bank': {
      const goal = at(updated.progress, seat);
      if (updated.phase !== 'meld' || !meetsGoal(goal, move.cards))
        throw new Error('These cards do not meet your current goal.');
      for (const card of move.cards) takeCard(hand, card);
      updated.spent.push(...move.cards);
      updated.progress[seat] = goal + 1;
      updated.lastMeld = { seat, cards: [...move.cards] };
      if (goal + 1 === goals.length) {
        updated.phase = 'finished';
        updated.winner = seat;
        break;
      }
      while (hand.length < 7) hand.push(drawStock(updated, random));
      updated.phase = 'discard';
      break;
    }
    case 'discard':
      if (updated.phase === 'draw') throw new Error('Draw before discarding.');
      takeCard(hand, move.card);
      updated.discards.push(move.card);
      updated.turn = (seat + 1) % updated.hands.length;
      updated.phase = 'draw';
      break;
    default:
      throw new Error('Unknown Lantern Rummy move.');
  }
  return updated;
}

export function lanternView(state: LanternState, seat: number) {
  return structuredClone({
    hand: at(state.hands, seat),
    handCounts: state.hands.map((hand) => hand.length),
    phase: state.phase,
    turn: state.turn,
    progress: state.progress,
    stockCount: state.stock.length,
    discard: state.discards.at(-1) ?? null,
    lastMeld: state.lastMeld,
    winner: state.winner,
    moves: lanternMoves(state, seat),
  });
}
