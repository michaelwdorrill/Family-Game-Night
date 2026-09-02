import { CELL_COUNT, getMatchingCells, isCorner } from './board';
import { cardKind, isJack } from './cards';
import { getProtectedCells } from './sequences';

import type { CardInstance, SequenceGameState, TeamIndex } from './types';

export function getLegalTargetsForCard(
  state: SequenceGameState,
  teamIndex: TeamIndex,
  card: CardInstance,
): number[] {
  const kind = cardKind(card);

  if (kind === 'normal') {
    return getMatchingCells(card.code).filter((cell) => state.board[cell] === null);
  }

  if (kind === 'two-eyed-jack') {
    const targets: number[] = [];
    for (let cell = 0; cell < CELL_COUNT; cell += 1) {
      if (!isCorner(cell) && state.board[cell] === null) {
        targets.push(cell);
      }
    }
    return targets;
  }

  const protectedCells = getProtectedCells(state.claimedSequences);
  const targets: number[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    const occupant = state.board[cell];
    if (
      !isCorner(cell) &&
      occupant !== null &&
      occupant !== teamIndex &&
      !protectedCells.has(cell)
    ) {
      targets.push(cell);
    }
  }
  return targets;
}

export function isDeadCard(state: SequenceGameState, card: CardInstance): boolean {
  if (isJack(card)) {
    return false;
  }
  const matchingCells = getMatchingCells(card.code);
  return matchingCells.length === 2 && matchingCells.every((cell) => state.board[cell] !== null);
}

export function getExchangeableDeadCards(
  state: SequenceGameState,
  playerHand: readonly CardInstance[],
): CardInstance[] {
  if (state.deadCardExchangeUsed) {
    return [];
  }
  return playerHand.filter((card) => isDeadCard(state, card));
}

export function handHasLegalMove(
  state: SequenceGameState,
  teamIndex: TeamIndex,
  playerHand: readonly CardInstance[],
): boolean {
  return playerHand.some((card) => getLegalTargetsForCard(state, teamIndex, card).length > 0);
}

export function canPassNoLegalMove(
  state: SequenceGameState,
  teamIndex: TeamIndex,
  playerHand: readonly CardInstance[],
): boolean {
  if (handHasLegalMove(state, teamIndex, playerHand)) {
    return false;
  }
  return state.deadCardExchangeUsed || getExchangeableDeadCards(state, playerHand).length === 0;
}
