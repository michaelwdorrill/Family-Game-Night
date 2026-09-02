import { z } from 'zod';

import { CELL_COUNT, CORNER_CELLS, isCell, isCorner } from './board';
import { createDeck, isCardCode } from './cards';
import { SUPPORTED_PLAYER_COUNTS } from './lobby';
import { expectedSequenceId, sequenceCellOverlap } from './sequences';
import { RANKS, SUITS } from './types';

import type { CardCode, SequenceGameState } from './types';

const cardCodeSchema = z.custom<CardCode>(
  (value) => typeof value === 'string' && isCardCode(value),
  'Invalid card code.',
);
const rankSchema = z.enum(RANKS);
const suitSchema = z.enum(SUITS);
const teamIndexSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

const cardSchema = z
  .object({
    id: z.string().min(1),
    code: cardCodeSchema,
    rank: rankSchema,
    suit: suitSchema,
  })
  .strict()
  .superRefine((card, context) => {
    if (card.code !== `${card.rank}${card.suit}`) {
      context.addIssue({ code: 'custom', message: 'Card rank and suit must match its code.' });
    }
    if (card.id !== `0-${card.code}` && card.id !== `1-${card.code}`) {
      context.addIssue({
        code: 'custom',
        message: 'Card ID must identify one of the two deck copies.',
      });
    }
  });

const claimedSequenceSchema = z
  .object({
    id: z.string().min(1),
    teamIndex: teamIndexSchema,
    cells: z.array(z.number().int().min(0).max(99)).length(5),
    createdTurn: z.number().int().positive(),
  })
  .strict();

const playerSchema = z
  .object({
    userId: z.string().trim().min(1),
    seatIndex: z.number().int().nonnegative(),
    teamIndex: teamIndexSchema,
    hand: z.array(cardSchema),
  })
  .strict();

const baseStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    phase: z.enum(['lobby', 'active', 'finished', 'cancelled']),
    teamCount: z.union([z.literal(2), z.literal(3)]),
    targetSequences: z.union([z.literal(1), z.literal(2)]),
    players: z.array(playerSchema),
    dealerSeatIndex: z.number().int().nonnegative().nullable(),
    currentSeatIndex: z.number().int().nonnegative().nullable(),
    board: z.array(teamIndexSchema.nullable()).length(CELL_COUNT),
    claimedSequences: z.array(claimedSequenceSchema),
    sequenceCounts: z.array(z.number().int().nonnegative()),
    deck: z.array(cardSchema),
    discard: z.array(cardSchema),
    turnNumber: z.number().int().nonnegative(),
    deadCardExchangeUsed: z.boolean(),
    lastChangedCell: z.number().int().min(0).max(99).nullable(),
    winnerTeamIndex: teamIndexSchema.nullable(),
  })
  .strict();

export const sequenceGameStateSchema = baseStateSchema.superRefine((state, context) => {
  if (state.targetSequences !== (state.teamCount === 2 ? 2 : 1)) {
    context.addIssue({
      code: 'custom',
      message: 'Target sequence count does not match team count.',
    });
  }

  if (state.sequenceCounts.length !== state.teamCount) {
    context.addIssue({ code: 'custom', message: 'Sequence counts must have one entry per team.' });
  }

  if (!SUPPORTED_PLAYER_COUNTS.some((count) => count === state.players.length)) {
    context.addIssue({ code: 'custom', message: 'State has an unsupported player count.' });
  }

  const seats = state.players.map((player) => player.seatIndex).sort((left, right) => left - right);
  if (seats.some((seat, index) => seat !== index)) {
    context.addIssue({ code: 'custom', message: 'Seat indices must be unique and contiguous.' });
  }
  if (new Set(state.players.map((player) => player.userId)).size !== state.players.length) {
    context.addIssue({ code: 'custom', message: 'Player user IDs must be unique.' });
  }
  if (state.players.some((player) => player.teamIndex >= state.teamCount)) {
    context.addIssue({ code: 'custom', message: 'Player team index is outside this game.' });
  }

  const teamSizes = Array.from(
    { length: state.teamCount },
    (_, teamIndex) => state.players.filter((player) => player.teamIndex === teamIndex).length,
  );
  if (teamSizes.some((size) => size === 0 || size !== teamSizes[0])) {
    context.addIssue({ code: 'custom', message: 'Every team must have the same player count.' });
  }

  if (
    state.dealerSeatIndex !== null &&
    (state.dealerSeatIndex < 0 || state.dealerSeatIndex >= state.players.length)
  ) {
    context.addIssue({ code: 'custom', message: 'Dealer seat is outside this game.' });
  }
  if (
    state.currentSeatIndex !== null &&
    (state.currentSeatIndex < 0 || state.currentSeatIndex >= state.players.length)
  ) {
    context.addIssue({ code: 'custom', message: 'Current seat is outside this game.' });
  }

  for (const corner of CORNER_CELLS) {
    if (state.board[corner] !== null) {
      context.addIssue({ code: 'custom', message: `Corner cell ${corner} cannot contain a chip.` });
    }
  }
  if (
    state.board.some(
      (occupant) => occupant !== null && (occupant < 0 || occupant >= state.teamCount),
    )
  ) {
    context.addIssue({ code: 'custom', message: 'Board contains a team outside this game.' });
  }

  const claimIds = new Set<string>();
  for (const claim of state.claimedSequences) {
    if (claim.teamIndex >= state.teamCount) {
      context.addIssue({ code: 'custom', message: 'Claim belongs to a team outside this game.' });
    }
    if (claimIds.has(claim.id)) {
      context.addIssue({ code: 'custom', message: `Claim ID ${claim.id} is duplicated.` });
    }
    claimIds.add(claim.id);
    if (new Set(claim.cells).size !== 5 || claim.cells.some((cell) => !isCell(cell))) {
      context.addIssue({
        code: 'custom',
        message: `Claim ${claim.id} must have five unique cells.`,
      });
    }
    if (expectedSequenceId(claim.cells) !== claim.id) {
      context.addIssue({
        code: 'custom',
        message: `Claim ${claim.id} must be a canonical straight five-cell line.`,
      });
    }
    if (claim.createdTurn > state.turnNumber) {
      context.addIssue({
        code: 'custom',
        message: `Claim ${claim.id} is dated after the game turn.`,
      });
    }
    if (claim.cells.some((cell) => !isCorner(cell) && state.board[cell] !== claim.teamIndex)) {
      context.addIssue({
        code: 'custom',
        message: `Claim ${claim.id} does not match board chips.`,
      });
    }
  }

  const derivedCounts = Array.from(
    { length: state.teamCount },
    (_, teamIndex) =>
      state.claimedSequences.filter((claim) => claim.teamIndex === teamIndex).length,
  );
  if (derivedCounts.some((count, index) => count !== state.sequenceCounts[index])) {
    context.addIssue({
      code: 'custom',
      message: 'Sequence counts do not match claimed sequences.',
    });
  }
  if (derivedCounts.some((count) => count > state.targetSequences)) {
    context.addIssue({ code: 'custom', message: 'A team has more claims than its win target.' });
  }
  for (let leftIndex = 0; leftIndex < state.claimedSequences.length; leftIndex += 1) {
    const left = state.claimedSequences[leftIndex];
    if (left === undefined) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < state.claimedSequences.length;
      rightIndex += 1
    ) {
      const right = state.claimedSequences[rightIndex];
      if (
        right !== undefined &&
        left.teamIndex === right.teamIndex &&
        sequenceCellOverlap(left.cells, right.cells) > 1
      ) {
        context.addIssue({
          code: 'custom',
          message: `Claims ${left.id} and ${right.id} overlap in more than one cell.`,
        });
      }
    }
  }

  const allCards = [
    ...state.deck,
    ...state.discard,
    ...state.players.flatMap((player) => player.hand),
  ];
  const expectedIds = new Set(createDeck().map((card) => card.id));
  const actualIds = new Set(allCards.map((card) => card.id));
  if (
    allCards.length !== expectedIds.size ||
    actualIds.size !== expectedIds.size ||
    [...expectedIds].some((id) => !actualIds.has(id))
  ) {
    context.addIssue({ code: 'custom', message: 'Card instances are not conserved.' });
  }

  if (state.phase === 'active' && state.currentSeatIndex === null) {
    context.addIssue({ code: 'custom', message: 'An active game must have a current player.' });
  }
  if (state.phase === 'finished' && state.winnerTeamIndex === null) {
    context.addIssue({ code: 'custom', message: 'A finished game must identify its winner.' });
  }
  if (state.phase !== 'finished' && state.winnerTeamIndex !== null) {
    context.addIssue({ code: 'custom', message: 'Only a finished game may identify a winner.' });
  }
  if (
    state.phase === 'finished' &&
    state.winnerTeamIndex !== null &&
    derivedCounts[state.winnerTeamIndex] !== state.targetSequences
  ) {
    context.addIssue({
      code: 'custom',
      message: 'The winning team must have met its claim target.',
    });
  }
  if (state.phase === 'active' && derivedCounts.some((count) => count >= state.targetSequences)) {
    context.addIssue({
      code: 'custom',
      message: 'An active game cannot already meet a win target.',
    });
  }
});

export function migrateSequenceGameState(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || !('schemaVersion' in input)) {
    throw new Error('Sequence state is missing a schema version.');
  }
  if (input.schemaVersion !== 1) {
    throw new Error(`Unsupported Sequence state schema version: ${String(input.schemaVersion)}.`);
  }
  return input;
}

export function parseSequenceGameState(input: unknown): SequenceGameState {
  return sequenceGameStateSchema.parse(migrateSequenceGameState(input));
}
