import { createDeck, createEmptyBoard, createSequenceGame, parseSequenceGameState } from '../src';
import { SeededRandomSource } from './seeded-random';

import type { CardCode, CardInstance, ClaimedSequence, SequenceGameState, TeamIndex } from '../src';

export function twoTeamGame(seed = 1): SequenceGameState {
  return createSequenceGame(
    { teamRosters: [['blue-player'], ['green-player']] },
    new SeededRandomSource(seed),
  );
}

export function threeTeamGame(seed = 1): SequenceGameState {
  return createSequenceGame(
    { teamRosters: [['blue-player'], ['green-player'], ['red-player']] },
    new SeededRandomSource(seed),
  );
}

export function getCurrentPlayer(state: SequenceGameState) {
  const player = state.players.find((candidate) => candidate.seatIndex === state.currentSeatIndex);
  if (player === undefined) {
    throw new Error('Test state has no current player.');
  }
  return player;
}

export function rezoneCards(
  state: SequenceGameState,
  handsBySeat: ReadonlyMap<number, readonly CardCode[]>,
  remainingZone: 'deck' | 'discard' = 'deck',
): SequenceGameState {
  const pool = createDeck();
  const players = state.players.map((player) => {
    const codes = handsBySeat.get(player.seatIndex) ?? [];
    const hand: CardInstance[] = [];
    for (const code of codes) {
      const cardIndex = pool.findIndex((card) => card.code === code);
      const card = pool[cardIndex];
      if (cardIndex < 0 || card === undefined) {
        throw new Error(`Test requested too many copies of ${code}.`);
      }
      pool.splice(cardIndex, 1);
      hand.push(card);
    }
    return { ...player, hand };
  });

  return parseSequenceGameState({
    ...state,
    players,
    deck: remainingZone === 'deck' ? pool : [],
    discard: remainingZone === 'discard' ? pool : [],
  });
}

export function withCurrentHand(
  state: SequenceGameState,
  codes: readonly CardCode[],
  remainingZone: 'deck' | 'discard' = 'deck',
): SequenceGameState {
  const player = getCurrentPlayer(state);
  return rezoneCards(state, new Map([[player.seatIndex, codes]]), remainingZone);
}

export function withBoard(
  state: SequenceGameState,
  placements: readonly (readonly [number, TeamIndex])[],
  claims: readonly ClaimedSequence[] = [],
): SequenceGameState {
  const board = createEmptyBoard();
  for (const [cell, teamIndex] of placements) {
    board[cell] = teamIndex;
  }
  const sequenceCounts = Array.from(
    { length: state.teamCount },
    (_, teamIndex) => claims.filter((claim) => claim.teamIndex === teamIndex).length,
  );
  return parseSequenceGameState({
    ...state,
    board,
    claimedSequences: claims,
    sequenceCounts,
  });
}

export function currentActor(state: SequenceGameState): string {
  return getCurrentPlayer(state).userId;
}

export function allCardIds(state: SequenceGameState): string[] {
  return [...state.deck, ...state.discard, ...state.players.flatMap((player) => player.hand)]
    .map((card) => card.id)
    .sort();
}
