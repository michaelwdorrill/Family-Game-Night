import { createEmptyBoard } from './board';
import { createDeck } from './cards';
import { createAlternatingSeatOrder, validateHandSizeForSetup } from './lobby';
import { parseSequenceGameState } from './state';

import type { CardInstance, RandomSource, SequenceGameState, StartGameInput } from './types';

function assertValidShuffle(
  original: readonly CardInstance[],
  shuffled: readonly CardInstance[],
): void {
  const originalIds = new Set(original.map((card) => card.id));
  const shuffledIds = new Set(shuffled.map((card) => card.id));
  if (
    shuffled.length !== original.length ||
    shuffledIds.size !== originalIds.size ||
    [...originalIds].some((id) => !shuffledIds.has(id))
  ) {
    throw new Error('RandomSource.shuffle must preserve every card exactly once.');
  }
}

export function createSequenceGame(input: StartGameInput, random: RandomSource): SequenceGameState {
  const seatAssignments = createAlternatingSeatOrder(input);
  const handSize = validateHandSizeForSetup(input);
  const originalDeck = createDeck();
  const deck = random.shuffle(originalDeck);
  assertValidShuffle(originalDeck, deck);

  const dealerSeatIndex = random.randomInt(seatAssignments.length);
  if (
    !Number.isInteger(dealerSeatIndex) ||
    dealerSeatIndex < 0 ||
    dealerSeatIndex >= seatAssignments.length
  ) {
    throw new Error('RandomSource.randomInt returned a dealer seat outside the requested range.');
  }

  const players = seatAssignments.map((player) => ({ ...player, hand: [] as CardInstance[] }));
  for (let round = 0; round < handSize; round += 1) {
    for (const player of players) {
      const card = deck.pop();
      if (card === undefined) {
        throw new Error('Deck was exhausted while dealing a validated game.');
      }
      player.hand.push(card);
    }
  }

  const teamCount = input.teamRosters.length === 2 ? 2 : 3;
  const state: SequenceGameState = {
    schemaVersion: 1,
    phase: 'active',
    teamCount,
    targetSequences: teamCount === 2 ? 2 : 1,
    players,
    dealerSeatIndex,
    currentSeatIndex: (dealerSeatIndex + 1) % players.length,
    board: createEmptyBoard(),
    claimedSequences: [],
    sequenceCounts: Array.from({ length: teamCount }, () => 0),
    deck,
    discard: [],
    turnNumber: 1,
    deadCardExchangeUsed: false,
    lastChangedCell: null,
    winnerTeamIndex: null,
  };

  // This also makes the creation boundary return a schema-validated deep copy.
  return parseSequenceGameState(state);
}
