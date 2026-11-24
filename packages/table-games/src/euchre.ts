import { at, deck, rankOf, suits, suitOf, takeCard } from './cards.js';
import type { Card, Random, Suit } from './cards.js';

const euchreRanks = ['9', '10', 'J', 'Q', 'K', 'A'] as const;
const companion: Record<Suit, Suit> = { C: 'S', S: 'C', H: 'D', D: 'H' };
type Play = { seat: number; card: Card };
export type EuchreMove =
  | { type: 'pass' }
  | { type: 'call'; suit: Suit; alone: boolean }
  | { type: 'discard' | 'play'; card: Card };

export interface EuchreState {
  dealer: number;
  turn: number;
  handNumber: number;
  phase: 'order' | 'name' | 'discard' | 'play' | 'finished';
  upcard: Card;
  hands: Card[][];
  trump: Suit | null;
  maker: number | null;
  sittingOut: number | null;
  trick: Play[];
  lastTrick: Play[];
  tricks: [number, number];
  scores: [number, number];
  winner: number | null;
}

const team = (seat: number): 0 | 1 => (seat % 2 === 0 ? 0 : 1);
const next = (seat: number) => (seat + 1) % 4;

function deal(
  dealer: number,
  handNumber: number,
  scores: [number, number],
  random: Random,
): EuchreState {
  const cards = random.shuffle(deck(euchreRanks));
  return {
    dealer,
    turn: next(dealer),
    handNumber,
    phase: 'order',
    upcard: at(cards, 20),
    hands: [0, 1, 2, 3].map((i) => cards.slice(5 * i, 5 * i + 5)),
    trump: null,
    maker: null,
    sittingOut: null,
    trick: [],
    lastTrick: [],
    tricks: [0, 0],
    scores,
    winner: null,
  };
}

export function createEuchre(random: Random): EuchreState {
  return deal(random.randomInt(4), 1, [0, 0], random);
}

export function effectiveSuit(card: Card, trump: Suit): Suit {
  const suit = suitOf(card);
  return rankOf(card) === 'J' && suit === companion[trump] ? trump : suit;
}

function strength(card: Card, lead: Suit, trump: Suit): number {
  const suit = effectiveSuit(card, trump);
  if (suit !== trump && suit !== lead) return -1;
  if (suit === trump && rankOf(card) === 'J') return suitOf(card) === trump ? 21 : 20;
  return (suit === trump ? 10 : 0) + euchreRanks.findIndex((rank) => rank === rankOf(card));
}

function nextActive(state: EuchreState, seat: number): number {
  const candidate = next(seat);
  return candidate === state.sittingOut ? next(candidate) : candidate;
}

export function euchreMoves(state: EuchreState, seat: number): EuchreMove[] {
  if (state.turn !== seat || state.phase === 'finished') return [];
  const hand = at(state.hands, seat);
  if (state.phase === 'discard') return hand.map((card) => ({ type: 'discard', card }));
  if (state.phase === 'play') {
    if (state.trump === null) throw new Error('Trump is required for play.');
    const trump = state.trump;
    const lead = state.trick[0];
    const following = lead
      ? hand.filter((card) => effectiveSuit(card, trump) === effectiveSuit(lead.card, trump))
      : [];
    return (following.length ? following : hand).map((card) => ({ type: 'play', card }));
  }
  const up = suitOf(state.upcard);
  const options: EuchreMove[] = [{ type: 'pass' }];
  for (const suit of suits) {
    if ((state.phase === 'order') !== (up === suit)) continue;
    options.push({ type: 'call', suit, alone: false }, { type: 'call', suit, alone: true });
  }
  return options;
}

function matches(left: EuchreMove, right: EuchreMove): boolean {
  switch (left.type) {
    case 'pass':
      return right.type === 'pass';
    case 'call':
      return right.type === 'call' && left.suit === right.suit && left.alone === right.alone;
    default:
      return left.type === right.type && left.card === right.card;
  }
}

export function applyEuchre(
  state: EuchreState,
  seat: number,
  move: EuchreMove,
  random: Random,
): EuchreState {
  if (!euchreMoves(state, seat).some((option) => matches(option, move)))
    throw new Error('Illegal Euchre move.');
  const updated = structuredClone(state);
  const hand = at(updated.hands, seat);
  switch (move.type) {
    case 'pass':
      if (seat === updated.dealer) {
        if (updated.phase === 'name')
          return deal(next(seat), updated.handNumber + 1, updated.scores, random);
        updated.phase = 'name';
      }
      updated.turn = next(seat);
      return updated;
    case 'call':
      updated.trump = move.suit;
      updated.maker = seat;
      updated.sittingOut = move.alone ? (seat + 2) % 4 : null;
      if (updated.phase === 'order') {
        at(updated.hands, updated.dealer).push(updated.upcard);
        updated.phase = 'discard';
        updated.turn = updated.dealer;
      } else {
        updated.phase = 'play';
        updated.turn = nextActive(updated, updated.dealer);
      }
      return updated;
    case 'discard':
      takeCard(hand, move.card);
      updated.phase = 'play';
      updated.turn = nextActive(updated, updated.dealer);
      return updated;
    case 'play':
      takeCard(hand, move.card);
      updated.trick.push({ seat, card: move.card });
      updated.turn = nextActive(updated, seat);
      break;
  }
  if (updated.trick.length < (updated.sittingOut === null ? 4 : 3)) return updated;
  const trump = updated.trump;
  if (trump === null || updated.maker === null) throw new Error('Missing Euchre contract.');
  const lead = effectiveSuit(at(updated.trick, 0).card, trump);
  const best = updated.trick.reduce((winner, play) =>
    strength(play.card, lead, trump) > strength(winner.card, lead, trump) ? play : winner,
  );
  updated.tricks[team(best.seat)]++;
  updated.turn = best.seat;
  updated.lastTrick = updated.trick;
  updated.trick = [];
  if (updated.tricks[0] + updated.tricks[1] < 5) return updated;
  const makers = team(updated.maker);
  const won = updated.tricks[makers];
  const scoringTeam = won >= 3 ? makers : team(makers + 1);
  const points = won < 3 ? 2 : won < 5 ? 1 : updated.sittingOut === null ? 2 : 4;
  updated.scores[scoringTeam] += points;
  if (updated.scores[scoringTeam] >= 10) {
    updated.phase = 'finished';
    updated.winner = scoringTeam;
    return updated;
  }
  return deal(next(updated.dealer), updated.handNumber + 1, updated.scores, random);
}

export function euchreView(state: EuchreState, seat: number) {
  return structuredClone({
    hand: at(state.hands, seat),
    handCounts: state.hands.map((hand) => hand.length),
    turn: state.turn,
    dealer: state.dealer,
    handNumber: state.handNumber,
    phase: state.phase,
    upcard: state.upcard,
    trump: state.trump,
    maker: state.maker,
    sittingOut: state.sittingOut,
    trick: state.trick,
    lastTrick: state.lastTrick,
    tricks: state.tricks,
    scores: state.scores,
    winner: state.winner,
    moves: euchreMoves(state, seat),
  });
}
