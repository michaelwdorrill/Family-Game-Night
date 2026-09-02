import { describe, expect, it } from 'vitest';

import {
  applySequenceCommand,
  enumerateSequenceCandidates,
  getMaximalClaimAlternatives,
  getProtectedCells,
} from '../src';
import { SeededRandomSource } from './seeded-random';

import type { ClaimedSequence, SequenceGameState, TeamIndex } from '../src';

import {
  allCardIds,
  currentActor,
  getCurrentPlayer,
  threeTeamGame,
  twoTeamGame,
  withBoard,
  withCurrentHand,
} from './helpers';

function placementState(
  base: SequenceGameState,
  occupiedCells: readonly number[],
  claims: readonly ClaimedSequence[] = [],
): SequenceGameState {
  const withJack = withCurrentHand(base, ['JC']);
  const team = getCurrentPlayer(withJack).teamIndex;
  return withBoard(
    withJack,
    occupiedCells.map((cell) => [cell, team] as const),
    claims,
  );
}

function playJack(
  state: SequenceGameState,
  targetCell: number,
  sequenceSelection?: readonly string[],
) {
  const card = getCurrentPlayer(state).hand[0];
  if (card === undefined) throw new Error('Test player has no Jack.');
  const command =
    sequenceSelection === undefined
      ? ({ type: 'PLAY_CARD', cardId: card.id, targetCell } as const)
      : ({ type: 'PLAY_CARD', cardId: card.id, targetCell, sequenceSelection } as const);
  return applySequenceCommand({
    state,
    actorUserId: currentActor(state),
    command,
    random: new SeededRandomSource(808),
  });
}

describe('candidate sequence enumeration', () => {
  it.each([
    ['horizontal', [11, 12, 13, 14], 15, [11, 12, 13, 14, 15]],
    ['vertical', [12, 22, 32, 42], 52, [12, 22, 32, 42, 52]],
    ['down-right diagonal', [11, 22, 33, 44], 55, [11, 22, 33, 44, 55]],
    ['down-left diagonal', [15, 24, 33, 42], 51, [15, 24, 33, 42, 51]],
  ] as const)('claims a %s five-cell line', (_name, occupied, target, expectedCells) => {
    const state = placementState(twoTeamGame(), occupied);
    const result = playJack(state, target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const team = getCurrentPlayer(state).teamIndex;
    const claim = result.state.claimedSequences.find((candidate) => candidate.teamIndex === team);
    expect(claim?.cells).toEqual(expectedCells);
  });

  it('counts a free corner for every team and never occupies it', () => {
    const state = placementState(twoTeamGame(), [1, 2, 3]);
    const result = playJack(state, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.claimedSequences[0]?.cells).toEqual([0, 1, 2, 3, 4]);
    expect(result.state.board[0]).toBeNull();
  });

  it('does not claim four chips or a complete line that excludes the new chip', () => {
    const four = placementState(twoTeamGame(), [11, 12, 13]);
    const fourResult = playJack(four, 14);
    expect(fourResult.ok).toBe(true);
    if (fourResult.ok) expect(fourResult.state.claimedSequences).toHaveLength(0);

    const elsewhere = placementState(twoTeamGame(), [11, 12, 13, 14, 15]);
    const candidates = enumerateSequenceCandidates(
      elsewhere.board,
      getCurrentPlayer(elsewhere).teamIndex,
      22,
    );
    expect(candidates).toEqual([]);
  });

  it('normalizes stable IDs and filters an already claimed identical line', () => {
    const team: TeamIndex = 0;
    const existing: ClaimedSequence = {
      id: 'H:1:1',
      teamIndex: team,
      cells: [11, 12, 13, 14, 15],
      createdTurn: 1,
    };
    const board = Array.from<TeamIndex | null>({ length: 100 }).fill(null);
    for (const cell of existing.cells) board[cell] = team;

    expect(enumerateSequenceCandidates(board, team, 13).map((line) => line.id)).toContain('H:1:1');
    expect(
      getMaximalClaimAlternatives({
        board,
        teamIndex: team,
        newlyPlacedCell: 13,
        existingClaims: [existing],
        sequencesStillNeeded: 1,
      }),
    ).toEqual([]);
  });
});

describe('overlap and simultaneous claims', () => {
  it('claims two sequences from a run of nine sharing exactly one cell', () => {
    const occupied = [20, 21, 22, 23, 25, 26, 27, 28];
    const state = placementState(twoTeamGame(), occupied);
    const beforeDeck = state.deck.length;
    const beforeSeat = state.currentSeatIndex;
    const result = playJack(state, 24);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.claimedSequences.map((claim) => claim.cells)).toEqual([
      [20, 21, 22, 23, 24],
      [24, 25, 26, 27, 28],
    ]);
    expect(result.state.phase).toBe('finished');
    expect(result.state.winnerTeamIndex).toBe(getCurrentPlayer(state).teamIndex);
    expect(result.state.deck).toHaveLength(beforeDeck);
    expect(result.state.currentSeatIndex).toBe(beforeSeat);
  });

  it('claims crossing lines that share the newly placed chip', () => {
    const occupied = [30, 31, 33, 34, 12, 22, 42, 52];
    const state = placementState(twoTeamGame(), occupied);
    const result = playJack(state, 32);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.claimedSequences).toHaveLength(2);
    const [first, second] = result.state.claimedSequences;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first !== undefined && second !== undefined) {
      expect(first.cells.filter((cell) => second.cells.includes(cell))).toEqual([32]);
    }
  });

  it('does not pair candidate windows sharing two or more cells', () => {
    const team: TeamIndex = 0;
    const board = Array.from<TeamIndex | null>({ length: 100 }).fill(null);
    for (const cell of [10, 11, 12, 13, 14, 15]) board[cell] = team;
    const alternatives = getMaximalClaimAlternatives({
      board,
      teamIndex: team,
      newlyPlacedCell: 14,
      existingClaims: [],
      sequencesStillNeeded: 2,
    });
    expect(alternatives).toHaveLength(2);
    expect(alternatives.every((alternative) => alternative.length === 1)).toBe(true);
  });

  it('allows a new line to overlap an existing claim in exactly one coordinate', () => {
    const team: TeamIndex = 0;
    const existing: ClaimedSequence = {
      id: 'H:1:0',
      teamIndex: team,
      cells: [10, 11, 12, 13, 14],
      createdTurn: 1,
    };
    const board = Array.from<TeamIndex | null>({ length: 100 }).fill(null);
    for (const cell of [...existing.cells, 24, 34, 44, 54]) board[cell] = team;
    const alternatives = getMaximalClaimAlternatives({
      board,
      teamIndex: team,
      newlyPlacedCell: 54,
      existingClaims: [existing],
      sequencesStillNeeded: 1,
    });
    expect(alternatives.map((alternative) => alternative[0]?.cells)).toContainEqual([
      14, 24, 34, 44, 54,
    ]);
  });

  it('counts a shared free corner as the one allowed overlap coordinate', () => {
    const team: TeamIndex = 0;
    const existing: ClaimedSequence = {
      id: 'H:0:0',
      teamIndex: team,
      cells: [0, 1, 2, 3, 4],
      createdTurn: 1,
    };
    const board = Array.from<TeamIndex | null>({ length: 100 }).fill(null);
    for (const cell of [1, 2, 3, 4, 10, 20, 30, 40]) board[cell] = team;
    const alternatives = getMaximalClaimAlternatives({
      board,
      teamIndex: team,
      newlyPlacedCell: 40,
      existingClaims: [existing],
      sequencesStillNeeded: 1,
    });
    expect(alternatives.map((alternative) => alternative[0]?.cells)).toContainEqual([
      0, 10, 20, 30, 40,
    ]);
  });

  it('rejects a new line that overlaps an existing claim in two coordinates', () => {
    const team: TeamIndex = 0;
    const existing: ClaimedSequence = {
      id: 'H:1:0',
      teamIndex: team,
      cells: [10, 11, 12, 13, 14],
      createdTurn: 1,
    };
    const board = Array.from<TeamIndex | null>({ length: 100 }).fill(null);
    for (const cell of [10, 11, 12, 13, 14, 15]) board[cell] = team;
    expect(
      getMaximalClaimAlternatives({
        board,
        teamIndex: team,
        newlyPlacedCell: 15,
        existingClaims: [existing],
        sequencesStillNeeded: 1,
      }),
    ).toEqual([]);
  });
});

describe('ambiguous claims and wins', () => {
  it('requires player choice among equally maximal sets and accepts one exact set', () => {
    const state = placementState(twoTeamGame(), [10, 11, 12, 13, 15]);
    const before = JSON.stringify(state);
    const required = playJack(state, 14);
    expect(required).toMatchObject({
      ok: false,
      error: {
        code: 'SEQUENCE_SELECTION_REQUIRED',
        details: { alternatives: [['H:1:0'], ['H:1:1']] },
      },
    });
    expect(JSON.stringify(state)).toBe(before);

    const accepted = playJack(state, 14, ['H:1:1']);
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.state.claimedSequences.map((claim) => claim.id)).toEqual(['H:1:1']);
    }
  });

  it('rejects an inexact or fabricated sequence selection', () => {
    const state = placementState(twoTeamGame(), [10, 11, 12, 13, 15]);
    expect(playJack(state, 14, ['not-a-line'])).toMatchObject({
      ok: false,
      error: { code: 'INVALID_SEQUENCE_SELECTION' },
    });
    expect(playJack(state, 14, ['H:1:0', 'H:1:1'])).toMatchObject({
      ok: false,
      error: { code: 'INVALID_SEQUENCE_SELECTION' },
    });
  });

  it('wins a two-team game only on the second claim and protects every claim chip', () => {
    const initial = placementState(twoTeamGame(), [11, 12, 13, 14]);
    const first = playJack(initial, 15);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.phase).toBe('active');
    expect(first.state.sequenceCounts[getCurrentPlayer(initial).teamIndex]).toBe(1);

    const team = getCurrentPlayer(initial).teamIndex;
    const existing = first.state.claimedSequences[0]!;
    const secondBase = withCurrentHand(
      { ...first.state, currentSeatIndex: initial.currentSeatIndex },
      ['JC'],
    );
    const secondState = withBoard(
      secondBase,
      [
        ...existing.cells.map((cell) => [cell, team] as const),
        [16, team],
        [26, team],
        [46, team],
        [56, team],
      ],
      [existing],
    );
    const winner = playJack(secondState, 36);
    expect(winner.ok).toBe(true);
    if (!winner.ok) return;
    expect(winner.state.phase).toBe('finished');
    expect(winner.state.sequenceCounts[team]).toBe(2);
    expect(winner.state.winnerTeamIndex).toBe(team);
    const protectedCells = getProtectedCells(winner.state.claimedSequences);
    expect(existing.cells.every((cell) => protectedCells.has(cell))).toBe(true);
    expect([16, 26, 36, 46, 56].every((cell) => protectedCells.has(cell))).toBe(true);
  });

  it('wins a three-team game immediately on the first sequence', () => {
    const state = placementState(threeTeamGame(), [11, 12, 13, 14]);
    const beforeIds = allCardIds(state);
    const beforeSeat = state.currentSeatIndex;
    const result = playJack(state, 15);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('finished');
    expect(result.state.winnerTeamIndex).toBe(getCurrentPlayer(state).teamIndex);
    expect(result.state.currentSeatIndex).toBe(beforeSeat);
    expect(result.state.turnNumber).toBe(state.turnNumber);
    expect(allCardIds(result.state)).toEqual(beforeIds);
  });
});
