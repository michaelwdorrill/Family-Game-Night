import { describe, expect, it } from 'vitest';

import { createAlternatingSeatOrder, createSequenceGame, validateStartGame } from '../src';
import { SeededRandomSource } from './seeded-random';

function rosters(teamCount: 2 | 3, playersPerTeam: number): string[][] {
  return Array.from({ length: teamCount }, (_, team) =>
    Array.from({ length: playersPerTeam }, (_, player) => `team-${team}-player-${player}`),
  );
}

describe('lobby validation and seats', () => {
  it.each([
    [2, 1],
    [2, 2],
    [2, 3],
    [2, 4],
    [2, 5],
    [2, 6],
    [3, 1],
    [3, 2],
    [3, 3],
    [3, 4],
  ] as const)('accepts %i teams of %i', (teamCount, playersPerTeam) => {
    expect(validateStartGame({ teamRosters: rosters(teamCount, playersPerTeam) })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it.each([5, 7, 11])('rejects %i total players', (playerCount) => {
    const teamRosters = [
      Array.from({ length: Math.ceil(playerCount / 2) }, (_, index) => `a-${index}`),
      Array.from({ length: Math.floor(playerCount / 2) }, (_, index) => `b-${index}`),
    ];
    expect(validateStartGame({ teamRosters }).valid).toBe(false);
  });

  it('rejects unequal, duplicated, pending, and four-team starts', () => {
    expect(validateStartGame({ teamRosters: [['a', 'b'], ['c']] }).valid).toBe(false);
    expect(validateStartGame({ teamRosters: [['a'], ['a']] }).valid).toBe(false);
    expect(
      validateStartGame({ teamRosters: [['a'], ['b']], pendingInviteCount: 1 }).errors,
    ).toContain('All invitations must be resolved before the game can start.');
    expect(validateStartGame({ teamRosters: [['a'], ['b'], ['c'], ['d']] }).valid).toBe(false);
  });

  it('interleaves two-team and three-team rosters', () => {
    expect(
      createAlternatingSeatOrder({
        teamRosters: [
          ['B1', 'B2', 'B3'],
          ['G1', 'G2', 'G3'],
        ],
      }).map((seat) => seat.userId),
    ).toEqual(['B1', 'G1', 'B2', 'G2', 'B3', 'G3']);

    expect(
      createAlternatingSeatOrder({
        teamRosters: [
          ['B1', 'B2'],
          ['G1', 'G2'],
          ['R1', 'R2'],
        ],
      }).map((seat) => `${seat.userId}:${seat.teamIndex}`),
    ).toEqual(['B1:0', 'G1:1', 'R1:2', 'B2:0', 'G2:1', 'R2:2']);
  });
});

describe('game creation', () => {
  it('chooses a dealer, starts at the next seat, and deals exact hands', () => {
    const state = createSequenceGame(
      {
        teamRosters: [
          ['B1', 'B2'],
          ['G1', 'G2'],
        ],
      },
      new SeededRandomSource(42),
    );

    expect(state.players.map((player) => player.hand.length)).toEqual([6, 6, 6, 6]);
    expect(state.dealerSeatIndex).not.toBeNull();
    expect(state.currentSeatIndex).toBe((state.dealerSeatIndex! + 1) % 4);
    expect(state.deck).toHaveLength(80);
    expect(state.targetSequences).toBe(2);
    expect(state.turnNumber).toBe(1);
  });

  it('uses one sequence as the three-team win target', () => {
    const state = createSequenceGame(
      { teamRosters: [['B'], ['G'], ['R']] },
      new SeededRandomSource(9),
    );
    expect(state.targetSequences).toBe(1);
    expect(state.players.map((player) => player.hand.length)).toEqual([6, 6, 6]);
  });
});
