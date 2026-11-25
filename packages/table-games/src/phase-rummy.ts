import { at } from './cards.js';
import type { Random } from './cards.js';

// Two of each number in each colour, eight wilds, four skips.
const colors = ['Red', 'Yellow', 'Green', 'Blue'];
type Kind = 'set' | 'run' | 'color';
interface Group {
  kind: Kind;
  cards: string[];
  value: number;
}
interface Goal {
  kind: Kind;
  size: number;
}
const set = (size: number): Goal => ({ kind: 'set', size });
const run = (size: number): Goal => ({ kind: 'run', size });
export const phases: Goal[][] = [
  [set(3), set(3)],
  [set(3), run(4)],
  [set(4), run(4)],
  [run(7)],
  [run(8)],
  [run(9)],
  [set(4), set(4)],
  [{ kind: 'color', size: 7 }],
  [set(5), set(2)],
  [set(5), set(3)],
];
export const phaseTitles = [
  'Two sets of 3',
  'Set of 3 and run of 4',
  'Set of 4 and run of 4',
  'Run of 7',
  'Run of 8',
  'Run of 9',
  'Two sets of 4',
  'Seven of one color',
  'Set of 5 and set of 2',
  'Set of 5 and set of 3',
];
export interface PhaseState {
  phase: 'draw' | 'play' | 'finished';
  turn: number;
  turnNumber: number;
  round: number;
  dealer: number;
  hands: string[][];
  stock: string[];
  discards: string[];
  laid: Group[][];
  skipped: boolean[];
  goals: number[];
  scores: number[];
  eligible: number[];
  winner: number | null;
}
export type PhaseMove =
  | { type: 'draw'; from: 'stock' | 'discard' }
  | { type: 'lay'; groups: Group[] }
  | { type: 'hit'; card: string; seat: number; group: number; side: 'left' | 'right' }
  | { type: 'discard'; card: string }
  | { type: 'skip'; target: number };

const numberOf = (card: string) => Number(card.split(' ')[1]);
const colorOf = (card: string) => colors.indexOf(card.split(' ')[0] ?? '');
function nextSeat(s: PhaseState, seat: number) {
  return at(s.eligible, (s.eligible.indexOf(seat) + 1) % s.eligible.length);
}
function dealRound(s: PhaseState, random: Random) {
  const cards = colors
    .flatMap((c) => Array.from({ length: 12 }, (_, i) => [`${c} ${i + 1}`, `${c} ${i + 1}`]).flat())
    .concat(Array<string>(8).fill('Wild'), Array<string>(4).fill('Skip'));
  s.stock = random.shuffle(cards);
  s.hands = s.goals.map((_, i) => (s.eligible.includes(i) ? s.stock.splice(0, 10) : []));
  s.discards = [s.stock.pop()!];
  s.laid = s.goals.map(() => []);
  s.skipped = s.goals.map(() => false);
  s.phase = 'draw';
  s.turn = nextSeat(s, s.dealer);
  if (s.discards[0] === 'Skip') s.turn = nextSeat(s, s.turn);
  s.round++;
  return s;
}
export function createPhase(count: number, random: Random): PhaseState {
  if (!Number.isInteger(count) || count < 2 || count > 6)
    throw new Error('Phase Rummy takes two to six players.');
  return dealRound(
    {
      phase: 'draw',
      turn: 0,
      turnNumber: 1,
      round: 0,
      dealer: random.randomInt(count),
      hands: [],
      stock: [],
      discards: [],
      laid: [],
      skipped: [],
      goals: Array<number>(count).fill(0),
      scores: Array<number>(count).fill(0),
      eligible: Array.from({ length: count }, (_, i) => i),
      winner: null,
    },
    random,
  );
}
function take(hand: string[], card: string) {
  const idx = hand.indexOf(card);
  if (idx < 0) throw new Error('Card is missing.');
  hand.splice(idx, 1);
}
function groupChoices(hand: string[], goal: Goal): Group[] {
  const cards = hand.filter((c) => c !== 'Skip').sort(),
    result: Group[] = [];
  function add(picked: string[]) {
    const naturals = picked.filter((c) => c !== 'Wild');
    if (!naturals.length) return;
    const values = naturals.map(goal.kind === 'color' ? colorOf : numberOf);
    if (goal.kind !== 'run') {
      if (values.every((n) => n === values[0]))
        result.push({ kind: goal.kind, value: values[0]!, cards: picked });
    } else if (new Set(values).size === values.length) {
      for (
        let low = Math.max(1, Math.max(...values) - goal.size + 1);
        low <= Math.min(...values, 13 - goal.size);
        low++
      ) {
        const ordered = Array.from(
          { length: goal.size },
          (_, i) => naturals.find((c) => numberOf(c) === low + i) ?? 'Wild',
        );
        result.push({ kind: 'run', value: low, cards: ordered });
      }
    }
  }
  function choose(start: number, picked: string[]) {
    if (picked.length === goal.size) {
      add(picked);
      return;
    }
    for (let i = start; i <= cards.length - (goal.size - picked.length); i++) {
      if (i > start && cards[i] === cards[i - 1]) continue;
      choose(i + 1, [...picked, cards[i]!]);
    }
  }
  choose(0, []);
  return result;
}
function lays(hand: string[], requirements: Goal[]) {
  const choices: PhaseMove[] = [];
  const first = at(requirements, 0),
    second = requirements[1];
  for (const group of groupChoices(hand, first)) {
    if (!second) {
      choices.push({ type: 'lay', groups: [group] });
      continue;
    }
    const rest = hand.slice();
    group.cards.forEach((c) => take(rest, c));
    for (const other of groupChoices(rest, second)) {
      if (
        first.kind === second.kind &&
        first.size === second.size &&
        group.cards.join() > other.cards.join()
      )
        continue;
      choices.push({ type: 'lay', groups: [group, other] });
    }
  }
  return choices;
}
export function phaseMoves(s: PhaseState, seat: number): PhaseMove[] {
  if (s.turn !== seat || s.phase === 'finished') return [];
  const moves: PhaseMove[] = [];
  if (s.phase === 'draw') {
    if (s.stock.length || s.discards.length > 1) moves.push({ type: 'draw', from: 'stock' });
    if (s.discards.length && s.discards.at(-1) !== 'Skip')
      moves.push({ type: 'draw', from: 'discard' });
    return moves;
  }
  const hand = at(s.hands, seat);
  if (!at(s.laid, seat).length) moves.push(...lays(hand, at(phases, at(s.goals, seat))));
  for (const card of new Set(hand)) {
    if (card === 'Skip') {
      for (const target of s.eligible)
        if (target !== seat && !s.skipped[target]) moves.push({ type: 'skip', target });
      continue;
    }
    moves.push({ type: 'discard', card });
    if (!at(s.laid, seat).length) continue;
    s.laid.forEach((groups, target) =>
      groups.forEach((g, i) => {
        const hit = (side: 'left' | 'right') =>
          moves.push({ type: 'hit', card, seat: target, group: i, side });
        if (g.kind === 'run') {
          const high = g.value + g.cards.length - 1;
          if (g.value > 1 && (card === 'Wild' || numberOf(card) === g.value - 1)) hit('left');
          if (high < 12 && (card === 'Wild' || numberOf(card) === high + 1)) hit('right');
        } else if (
          card === 'Wild' ||
          (g.kind === 'color' ? colorOf(card) : numberOf(card)) === g.value
        )
          hit('right');
      }),
    );
  }
  return moves;
}
function endRound(s: PhaseState, random: Random) {
  for (const seat of s.eligible) {
    s.scores[seat] =
      at(s.scores, seat) +
      at(s.hands, seat).reduce(
        (n, c) => n + (c === 'Wild' ? 25 : c === 'Skip' ? 15 : numberOf(c) >= 10 ? 10 : 5),
        0,
      );
    if (at(s.laid, seat).length) s.goals[seat] = at(s.goals, seat) + 1;
  }
  const finished = s.eligible.filter((i) => at(s.goals, i) === 10);
  s.dealer = nextSeat(s, s.dealer);
  if (finished.length) {
    const low = Math.min(...finished.map((i) => at(s.scores, i)));
    const tied = finished.filter((i) => s.scores[i] === low);
    if (tied.length === 1) {
      s.winner = tied[0]!;
      s.phase = 'finished';
      return;
    }
    s.eligible = tied;
    if (!tied.includes(s.dealer)) s.dealer = tied[0]!;
    for (const i of tied) s.goals[i] = 9;
  }
  dealRound(s, random);
}
// An index always addresses the engine's legal choices for this exact version.
export function applyPhase(s: PhaseState, seat: number, index: number, random: Random): PhaseState {
  const move = at(phaseMoves(s, seat), index);
  const next = structuredClone(s),
    hand = at(next.hands, seat);
  switch (move.type) {
    case 'draw':
      if (move.from === 'stock' && !next.stock.length)
        next.stock = random.shuffle(next.discards.splice(0, next.discards.length - 1));
      hand.push((move.from === 'stock' ? next.stock : next.discards).pop()!);
      next.phase = 'play';
      return next;
    case 'lay':
      for (const g of move.groups) g.cards.forEach((c) => take(hand, c));
      next.laid[seat] = move.groups;
      break;
    case 'hit': {
      take(hand, move.card);
      const g = at(at(next.laid, move.seat), move.group);
      if (move.side === 'left') {
        g.value--;
        g.cards.unshift(move.card);
      } else g.cards.push(move.card);
      break;
    }
    case 'discard':
      take(hand, move.card);
      next.discards.push(move.card);
      break;
    case 'skip':
      take(hand, 'Skip');
      next.discards.push('Skip');
      next.skipped[move.target] = true;
      break;
  }
  if (!hand.length) {
    next.turnNumber++;
    endRound(next, random);
  } else if (move.type === 'skip' || move.type === 'discard') {
    next.phase = 'draw';
    next.turnNumber++;
    next.turn = nextSeat(next, seat);
    while (next.skipped[next.turn]) {
      next.skipped[next.turn] = false;
      next.turn = nextSeat(next, next.turn);
    }
    if (!phaseMoves(next, next.turn).length) endRound(next, random);
  }
  return next;
}
