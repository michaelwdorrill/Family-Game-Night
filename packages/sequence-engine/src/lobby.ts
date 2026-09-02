import { handSizeFor } from './cards';

import type { LobbyValidationResult, SequencePlayer, StartGameInput, TeamIndex } from './types';

export const SUPPORTED_PLAYER_COUNTS = [2, 3, 4, 6, 8, 9, 10, 12] as const;

export class InvalidGameSetupError extends Error {
  public readonly validation: LobbyValidationResult;

  public constructor(validation: LobbyValidationResult) {
    super(validation.errors.join(' '));
    this.name = 'InvalidGameSetupError';
    this.validation = validation;
  }
}

export function teamIndexFromNumber(value: number): TeamIndex {
  switch (value) {
    case 0:
    case 1:
    case 2:
      return value;
    default:
      throw new RangeError(`Team index ${value} is outside 0..2.`);
  }
}

export function validateStartGame(input: StartGameInput): LobbyValidationResult {
  const errors: string[] = [];
  const teamCount = input.teamRosters.length;
  const totalPlayers = input.teamRosters.reduce((total, roster) => total + roster.length, 0);

  if (teamCount !== 2 && teamCount !== 3) {
    errors.push('A game must have exactly two or three teams.');
  }

  if (!SUPPORTED_PLAYER_COUNTS.some((count) => count === totalPlayers)) {
    errors.push('Supported player counts are 2, 3, 4, 6, 8, 9, 10, and 12.');
  }

  if (teamCount > 0) {
    const expectedSize = input.teamRosters[0]?.length ?? 0;
    if (expectedSize === 0 || input.teamRosters.some((roster) => roster.length !== expectedSize)) {
      errors.push('Every team must contain the same non-zero number of players.');
    }
  }

  if (totalPlayers === 2 && teamCount !== 2) {
    errors.push('A two-player game must use two teams.');
  }
  if (totalPlayers === 3 && teamCount !== 3) {
    errors.push('A three-player game must use three teams.');
  }
  if (teamCount === 2 && totalPlayers % 2 !== 0) {
    errors.push('A two-team game requires an even number of players.');
  }
  if (teamCount === 3 && totalPlayers % 3 !== 0) {
    errors.push('A three-team game requires a player count divisible by three.');
  }

  const userIds = input.teamRosters.flat();
  if (userIds.some((userId) => userId.trim().length === 0)) {
    errors.push('Every player must have a non-empty user ID.');
  }
  if (new Set(userIds).size !== userIds.length) {
    errors.push('A player may be assigned to only one team.');
  }

  if ((input.pendingInviteCount ?? 0) > 0) {
    errors.push('All invitations must be resolved before the game can start.');
  }

  return { valid: errors.length === 0, errors };
}

export function createAlternatingSeatOrder(
  input: StartGameInput,
): Array<Omit<SequencePlayer, 'hand'>> {
  const validation = validateStartGame(input);
  if (!validation.valid) {
    throw new InvalidGameSetupError(validation);
  }

  const seats: Array<Omit<SequencePlayer, 'hand'>> = [];
  const playersPerTeam = input.teamRosters[0]?.length ?? 0;

  for (let rosterIndex = 0; rosterIndex < playersPerTeam; rosterIndex += 1) {
    for (let team = 0; team < input.teamRosters.length; team += 1) {
      const userId = input.teamRosters[team]?.[rosterIndex];
      if (userId === undefined) {
        throw new Error('A validated roster unexpectedly contained a missing player.');
      }
      seats.push({
        userId,
        seatIndex: seats.length,
        teamIndex: teamIndexFromNumber(team),
      });
    }
  }

  return seats;
}

export function validateHandSizeForSetup(input: StartGameInput): number {
  const validation = validateStartGame(input);
  if (!validation.valid) {
    throw new InvalidGameSetupError(validation);
  }
  return handSizeFor(input.teamRosters.flat().length);
}
