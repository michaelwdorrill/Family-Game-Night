import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  BOARD_LAYOUT,
  CORNER_CELLS,
  RANKS,
  SUITS,
  cardKind,
  createDeck,
  getMatchingCells,
  handSizeFor,
  isCorner,
} from '../src';
import { SeededRandomSource } from './seeded-random';

describe('canonical board', () => {
  it('is exactly 10×10 with only the four free corners', () => {
    expect(BOARD_LAYOUT).toHaveLength(10);
    expect(BOARD_LAYOUT.every((row) => row.length === 10)).toBe(true);

    const freeCells = BOARD_LAYOUT.flat()
      .map((code, cell) => ({ code, cell }))
      .filter(({ code }) => code === 'FREE')
      .map(({ cell }) => cell);
    expect(freeCells).toEqual(CORNER_CELLS);
    expect(freeCells.every(isCorner)).toBe(true);
  });

  it('contains no Jack and exactly two spaces for every non-Jack card code', () => {
    const counts = new Map<string, number>();
    for (const code of BOARD_LAYOUT.flat()) {
      expect(code.startsWith('J')).toBe(false);
      if (code !== 'FREE') {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }

    const nonJackCodes = SUITS.flatMap((suit) =>
      RANKS.filter((rank) => rank !== 'J').map((rank) => `${rank}${suit}` as const),
    );
    expect(counts).toHaveLength(48);
    for (const code of nonJackCodes) {
      expect(counts.get(code)).toBe(2);
      const cells = getMatchingCells(code);
      expect(cells).toHaveLength(2);
      expect(new Set(cells).size).toBe(2);
    }
  });
});

describe('cards and deck', () => {
  it('creates two complete decks with 104 stable unique IDs', () => {
    const cards = createDeck();
    expect(cards).toHaveLength(104);
    expect(new Set(cards.map((card) => card.id)).size).toBe(104);

    const codeCounts = new Map<string, number>();
    for (const card of cards) {
      codeCounts.set(card.code, (codeCounts.get(card.code) ?? 0) + 1);
    }
    expect(codeCounts).toHaveLength(52);
    expect([...codeCounts.values()].every((count) => count === 2)).toBe(true);
  });

  it('classifies Jack behavior by suit', () => {
    const byCode = new Map(createDeck().map((card) => [card.code, card]));
    expect(cardKind(byCode.get('JC')!)).toBe('two-eyed-jack');
    expect(cardKind(byCode.get('JD')!)).toBe('two-eyed-jack');
    expect(cardKind(byCode.get('JS')!)).toBe('one-eyed-jack');
    expect(cardKind(byCode.get('JH')!)).toBe('one-eyed-jack');
    expect(cardKind(byCode.get('AH')!)).toBe('normal');
  });

  it.each([
    [2, 7],
    [3, 6],
    [4, 6],
    [6, 5],
    [8, 4],
    [9, 4],
    [10, 3],
    [12, 3],
  ])('deals %i players %i cards each', (players, cards) => {
    expect(handSizeFor(players)).toBe(cards);
  });

  it('rejects unsupported hand-size requests', () => {
    expect(() => handSizeFor(5)).toThrow(/Unsupported player count/);
  });

  it('deterministically shuffles without losing or duplicating cards for many seeds', () => {
    const deck = createDeck();
    const expectedIds = deck.map((card) => card.id).sort();

    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const shuffled = new SeededRandomSource(seed).shuffle(deck);
        expect(shuffled.map((card) => card.id).sort()).toEqual(expectedIds);
      }),
    );
  });
});
