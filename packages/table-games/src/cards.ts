export const suits = ['C', 'D', 'H', 'S'] as const;
export const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export type Suit = (typeof suits)[number];
export type Rank = (typeof ranks)[number];
export type Card = `${Rank}${Suit}`;

// Structurally compatible with the same random source used by Card Lines.
export interface Random {
  randomInt(maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

export function deck(usedRanks: readonly Rank[] = ranks): Card[] {
  return suits.flatMap((suit) => usedRanks.map((rank): Card => `${rank}${suit}`));
}

export function suitOf(card: Card): Suit {
  return card.slice(-1) as Suit;
}

export function rankOf(card: Card): Rank {
  return card.slice(0, -1) as Rank;
}

export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new RangeError('Invalid card or seat index.');
  return item;
}

export function takeCard(hand: Card[], card: Card): void {
  const index = hand.indexOf(card);
  if (index < 0) throw new Error('Choose a card from your hand.');
  hand.splice(index, 1);
}
