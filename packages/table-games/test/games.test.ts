import { describe, expect, it } from 'vitest';
import { deck } from '../src/cards';
import type { Card, Random } from '../src/cards';
import { applyEuchre, createEuchre, effectiveSuit, euchreMoves, euchreView } from '../src/euchre';
import {
  applyLantern,
  createLantern,
  lanternMoves,
  lanternView,
  meetsGoal,
} from '../src/lantern-rummy';

function seeded(): Random {
  let seed = 131;
  function randomInt(max: number) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return Math.floor((seed / 2 ** 32) * max);
  }
  return {
    randomInt,
    shuffle<T>(items: readonly T[]) {
      const cards = [...items];
      for (let i = cards.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [cards[i], cards[j]] = [cards[j]!, cards[i]!];
      }
      return cards;
    },
  };
}

describe('partnership Euchre', () => {
  it('deals unique hands, limits calls in both rounds and rotates a passed-out dealer', () => {
    const r = seeded();
    let s = createEuchre(r);
    const dealer = s.dealer;
    expect(new Set([...s.hands.flat(), s.upcard]).size).toBe(21);
    expect(euchreMoves(s, s.turn).filter((m) => m.type === 'call')).toHaveLength(2);
    expect(() => applyEuchre(s, (s.turn + 1) % 4, { type: 'pass' }, r)).toThrow();
    for (let i = 0; i < 4; i++) s = applyEuchre(s, s.turn, { type: 'pass' }, r);
    expect(s.phase).toBe('name');
    expect(euchreMoves(s, s.turn).filter((m) => m.type === 'call')).toHaveLength(6);
    for (let i = 0; i < 4; i++) s = applyEuchre(s, s.turn, { type: 'pass' }, r);
    expect(s.dealer).toBe((dealer + 1) % 4);
    expect(s.handNumber).toBe(2);
  });
  it('makes the dealer discard after pickup and skips the lone caller’s partner', () => {
    const r = seeded();
    let s = createEuchre(r);
    const lead = s.turn;
    for (let i = 0; i < 2; i++) s = applyEuchre(s, s.turn, { type: 'pass' }, r);
    const call = euchreMoves(s, s.turn).find((m) => m.type === 'call' && m.alone)!;
    s = applyEuchre(s, s.turn, call, r);
    expect(s.hands[s.dealer]).toHaveLength(6);
    expect(s.sittingOut).toBe(lead);
    s = applyEuchre(s, s.turn, { type: 'discard', card: s.upcard }, r);
    expect(s.turn).toBe((lead + 1) % 4);
    expect(s.hands[s.dealer]).toHaveLength(5);
  });
  it('requires a left bower to follow trump and ranks the right bower higher', () => {
    const r = seeded();
    let s = createEuchre(r);
    Object.assign(s, {
      phase: 'play',
      turn: 0,
      maker: 0,
      trump: 'H',
      trick: [{ seat: 3, card: 'AH' }],
      hands: [['JD', '9D'], ['JH'], ['KH'], []],
    });
    expect(effectiveSuit('JD', 'H')).toBe('H');
    expect(euchreMoves(s, 0)).toEqual([{ type: 'play', card: 'JD' }]);
    expect(() => applyEuchre(s, 0, { type: 'play', card: '9D' }, r)).toThrow();
    for (const card of ['JD', 'JH', 'KH'] as const)
      s = applyEuchre(s, s.turn, { type: 'play', card }, r);
    expect(s.turn).toBe(1);
    expect(s.tricks).toEqual([0, 1]);
  });
  it.each([
    [false, 4, 0, 2, 0],
    [true, 4, 0, 4, 0],
    [false, 2, 2, 1, 0],
    [false, 0, 4, 0, 2],
  ] as const)('scores a hand (alone %s, tricks %i to %i)', (alone, t0, t1, p0, p1) => {
    const r = seeded();
    const s = createEuchre(r);
    Object.assign(s, {
      phase: 'play',
      turn: 0,
      trump: 'C',
      maker: 0,
      sittingOut: alone ? 2 : null,
      hands: [['AC'], [], [], []],
      tricks: [t0, t1],
      trick: alone
        ? [
            { seat: 1, card: '9C' },
            { seat: 3, card: 'KC' },
          ]
        : [
            { seat: 1, card: '9C' },
            { seat: 2, card: 'QC' },
            { seat: 3, card: 'KC' },
          ],
    });
    expect(applyEuchre(s, 0, { type: 'play', card: 'AC' }, r).scores).toEqual([p0, p1]);
  });
  it('finishes a full match using only actions offered to the acting seat', () => {
    const r = seeded();
    let s = createEuchre(r);
    for (let n = 0; n < 1600 && s.phase !== 'finished'; n++) {
      const view = euchreView(s, s.turn);
      expect(view).not.toHaveProperty('hands');
      const choices = view.moves.filter((m) => m.type !== 'pass');
      const previous = s;
      const before = JSON.stringify(previous);
      s = applyEuchre(s, s.turn, choices[r.randomInt(choices.length)]!, r);
      expect(JSON.stringify(previous)).toBe(before);
    }
    expect(s.phase).toBe('finished');
    expect(Math.max(...s.scores)).toBeGreaterThanOrEqual(10);
    expect(euchreMoves(s, s.turn)).toEqual([]);
  });
});

describe('Lantern Rummy', () => {
  it('uses ace-low suited runs, same-rank trios and adjacent pairs', () => {
    expect(meetsGoal(0, ['KC', 'KD', 'KS'])).toBe(true);
    expect(meetsGoal(0, ['KC', 'KC', 'KS'])).toBe(false);
    expect(meetsGoal(1, ['3H', 'AH', '2H'])).toBe(true);
    expect(meetsGoal(1, ['KH', 'AH', '2H'])).toBe(false);
    expect(meetsGoal(1, ['AH', '2C', '3H'])).toBe(false);
    expect(meetsGoal(2, ['2D', '3C', '2S', '3H'])).toBe(true);
    expect(meetsGoal(2, ['2D', '4C', '2S', '4H'])).toBe(false);
  });
  it('rejects out-of-turn, double draw and unheld cards without changing state', () => {
    const r = seeded();
    const s = createLantern(2, r);
    const serialized = JSON.stringify(s);
    expect(() => createLantern(5, r)).toThrow();
    expect(() => applyLantern(s, 1 - s.turn, { type: 'draw', from: 'stock' }, r)).toThrow();
    expect(() =>
      applyLantern(s, s.turn, { type: 'discard', card: s.hands[s.turn]![0]! }, r),
    ).toThrow();
    const drawn = applyLantern(s, s.turn, { type: 'draw', from: 'discards' }, r);
    expect(drawn.hands[s.turn]).toHaveLength(7);
    expect(() => applyLantern(drawn, s.turn, { type: 'draw', from: 'stock' }, r)).toThrow();
    expect(() =>
      applyLantern(drawn, s.turn, { type: 'discard', card: drawn.stock[0]! }, r),
    ).toThrow();
    expect(JSON.stringify(s)).toBe(serialized);
  });
  it('refills exhausted stock while preserving the visible discard', () => {
    const r = seeded();
    const s = createLantern(3, r);
    const top = s.discards[0]!;
    s.discards.unshift(...s.stock.splice(0));
    const next = applyLantern(s, s.turn, { type: 'draw', from: 'stock' }, r);
    expect(next.discards).toEqual([top]);
    expect(next.stock.length).toBeGreaterThan(0);
  });
  it.each([2, 3, 4])('finishes a %i-player game without losing or duplicating cards', (count) => {
    const r = seeded();
    let s = createLantern(count, r);
    for (let n = 0; n < 8000 && s.phase !== 'finished'; n++) {
      const view = lanternView(s, s.turn);
      expect(view).not.toHaveProperty('hands');
      expect(view).not.toHaveProperty('stock');
      const moves = view.moves;
      const move =
        moves.find((m) => m.type === 'bank') ??
        (s.phase === 'draw' ? moves[0]! : moves[r.randomInt(moves.length)]!);
      s = applyLantern(s, s.turn, move, r);
      const cards: Card[] = [...s.hands.flat(), ...s.stock, ...s.discards, ...s.spent];
      expect(cards.toSorted()).toEqual(deck().sort());
    }
    expect(s.phase).toBe('finished');
    expect(s.progress[s.winner!]).toBe(3);
    expect(lanternMoves(s, s.turn)).toEqual([]);
  });
});

it('allows each seat to inspect only its own hand and rejects unknown seats', () => {
  const random = seeded();
  const euchre = createEuchre(random);
  const lantern = createLantern(3, random);
  for (const [state, view] of [
    [euchre, euchreView(euchre, (euchre.turn + 1) % 4)],
    [lantern, lanternView(lantern, (lantern.turn + 1) % 3)],
  ] as const) {
    const viewer = (state.turn + 1) % state.hands.length;
    expect(view.hand).toEqual(state.hands[viewer]);
    expect(view.handCounts).toEqual(state.hands.map((hand) => hand.length));
    expect(view.moves).toEqual([]);
    expect(view).not.toHaveProperty('hands');
    expect(view).not.toHaveProperty('stock');
    const handLength = state.hands[viewer]!.length;
    view.hand.pop();
    expect(state.hands[viewer]).toHaveLength(handLength);
  }
  expect(() => euchreView(euchre, 4)).toThrow();
  expect(() => lanternView(lantern, -1)).toThrow();
});
