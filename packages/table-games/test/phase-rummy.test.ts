import { describe, expect, it } from 'vitest';
import { applyPhase, createPhase, phaseMoves } from '../src/phase-rummy.js';
import type { PhaseMove } from '../src/phase-rummy.js';

const random = { randomInt: () => 0, shuffle: <T>(items: readonly T[]) => items.slice() };
describe('Phase Rummy', () => {
  it('deals a complete 108-card deck and skips the first player when the upcard is Skip', () => {
    const s = createPhase(6, random);
    expect(s.hands.map((h) => h.length)).toEqual([10, 10, 10, 10, 10, 10]);
    expect(s.stock.length + s.discards.length + 60).toBe(108);
    expect(s.turn).toBe(2);
    expect(phaseMoves(s, 2)).toEqual([{ type: 'draw', from: 'stock' }]);
    expect(phaseMoves(s, 0)).toEqual([]);
  });
  it('offers all ten goals with mixed colour runs, wilds, and independent groups', () => {
    const set = (n: number, v: number) =>
      Array.from({ length: n }, (_, i) => ['Red', 'Yellow', 'Green', 'Blue'][i % 4] + ' ' + v);
    const run = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        i === 2 ? 'Wild' : `${i % 2 ? 'Red' : 'Blue'} ${i + 1}`,
      );
    const fixtures = [
      [...set(3, 2), ...set(3, 3)],
      [...set(3, 10), ...run(4)],
      [...set(4, 10), ...run(4)],
      run(7),
      run(8),
      run(9),
      [...set(4, 2), ...set(4, 3)],
      Array.from({ length: 7 }, (_, i) => 'Red ' + (i + 1)),
      [...set(5, 2), ...set(2, 3)],
      [...set(5, 2), ...set(3, 3)],
    ];
    fixtures.forEach((hand, goal) => {
      const s = createPhase(2, random);
      s.phase = 'play';
      s.turn = 0;
      s.hands[0] = [...hand, 'Skip'];
      s.goals[0] = goal;
      const choices = phaseMoves(s, 0);
      const idx = choices.findIndex((m) => m.type === 'lay');
      expect(idx).toBeGreaterThanOrEqual(0);
      const next = applyPhase(s, 0, idx, random);
      expect(next.hands[0]).toEqual(['Skip']);
      expect(next.goals[0]).toBe(goal);
      const end = applyPhase(
        next,
        0,
        phaseMoves(next, 0).findIndex((m) => m.type === 'skip'),
        random,
      );
      expect(end.goals[0]).toBe(goal + 1);
      expect(end.phase).toBe(goal === 9 ? 'finished' : 'draw');
    });
  });
  it('scores leftovers and allows hitting either end of a run after laying down', () => {
    const s = createPhase(2, random);
    s.phase = 'play';
    s.turn = 0;
    s.goals[0] = 9;
    s.goals[1] = 9;
    s.hands[0] = ['Wild'];
    s.hands[1] = ['Skip', 'Wild', 'Red 10', 'Blue 9'];
    s.laid = [
      [{ kind: 'set', value: 5, cards: ['Red 5', 'Blue 5', 'Wild'] }],
      [{ kind: 'run', value: 4, cards: ['Red 4', 'Blue 5', 'Red 6'] }],
    ];
    const moves = phaseMoves(s, 0);
    expect(moves.filter((m) => m.type === 'hit' && m.seat === 1)).toHaveLength(2);
    const winner = applyPhase(
      s,
      0,
      moves.findIndex((m) => m.type === 'hit'),
      random,
    );
    expect(winner.scores).toEqual([0, 55]);
    expect(winner.winner).toBe(0);
  });
  it('limits a phase-ten tiebreak to the lowest tied finalists', () => {
    const s = createPhase(3, random);
    s.phase = 'play';
    s.turn = 0;
    s.goals = [9, 9, 8];
    s.scores = [5, 0, 0];
    s.hands = [['Blue 1'], ['Red 3'], ['Wild']];
    s.laid = [
      [{ kind: 'set', value: 1, cards: ['Red 1', 'Blue 1', 'Wild'] }],
      [{ kind: 'set', value: 2, cards: ['Red 2', 'Green 2', 'Wild'] }],
      [],
    ];
    const idx = phaseMoves(s, 0).findIndex((m) => m.type === 'discard');
    const next = applyPhase(s, 0, idx, random);
    expect(next.scores).toEqual([5, 5, 25]);
    expect(next.eligible).toEqual([0, 1]);
    expect(next.goals.slice(0, 2)).toEqual([9, 9]);
    expect(next.hands[2]).toEqual([]);
    expect(next.winner).toBeNull();
  });
  it('round-trips a full seed through ten phases', () => {
    let seed = 183127;
    const next = (n: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return Math.floor((seed / 4294967296) * n);
    };
    const rng = {
      randomInt: next,
      shuffle: <T>(items: readonly T[]) => {
        const xs = items.slice();
        for (let i = xs.length - 1; i > 0; i--) {
          const j = next(i + 1);
          [xs[i], xs[j]] = [xs[j]!, xs[i]!];
        }
        return xs;
      },
    };
    let s = createPhase(3, rng);
    for (let i = 0; i < 12000 && s.phase !== 'finished'; i++) {
      const moves = phaseMoves(s, s.turn);
      const priority = (m: PhaseMove) =>
        m.type === 'lay' || m.type === 'hit' ? 3 : m.type === 'draw' && m.from === 'stock' ? 2 : 1;
      const best = Math.max(...moves.map(priority));
      const chosen = moves.map((m, index) => ({ m, index })).filter((x) => priority(x.m) === best);
      s = applyPhase(s, s.turn, chosen[next(chosen.length)]!.index, rng);
    }
    expect(s.phase).toBe('finished');
    expect(s.goals[s.winner!]).toBe(10);
  });
});
