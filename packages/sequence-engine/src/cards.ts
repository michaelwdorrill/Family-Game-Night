import type { CardCode, CardInstance, CardKind, Rank, Suit } from './types';
import { RANKS, SUITS } from './types';

export const TWO_EYED_JACKS = new Set<CardCode>(['JC', 'JD']);
export const ONE_EYED_JACKS = new Set<CardCode>(['JS', 'JH']);

export function createDeck(): CardInstance[] {
  const cards: CardInstance[] = [];

  for (const copy of [0, 1] as const) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const code: CardCode = `${rank}${suit}`;
        cards.push({ id: `${copy}-${code}`, code, rank, suit });
      }
    }
  }

  return cards;
}

export function cardKind(card: Pick<CardInstance, 'rank' | 'suit'>): CardKind {
  if (card.rank !== 'J') {
    return 'normal';
  }
  return card.suit === 'C' || card.suit === 'D' ? 'two-eyed-jack' : 'one-eyed-jack';
}

export function isJack(card: Pick<CardInstance, 'rank'>): boolean {
  return card.rank === 'J';
}

export function isSuit(value: string): value is Suit {
  return SUITS.some((suit) => suit === value);
}

export function isRank(value: string): value is Rank {
  return RANKS.some((rank) => rank === value);
}

export function isCardCode(value: string): value is CardCode {
  const suit = value.slice(-1);
  const rank = value.slice(0, -1);
  return isSuit(suit) && isRank(rank);
}

export function handSizeFor(playerCount: number): number {
  switch (playerCount) {
    case 2:
      return 7;
    case 3:
    case 4:
      return 6;
    case 6:
      return 5;
    case 8:
    case 9:
      return 4;
    case 10:
    case 12:
      return 3;
    default:
      throw new RangeError(`Unsupported player count: ${playerCount}.`);
  }
}
