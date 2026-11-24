import type { GameSummaryDto } from '@family-game-night/shared';

export const teamNames = ['Gold', 'Teal', 'Coral'] as const;

export function gameOutcome(
  game: Pick<GameSummaryDto, 'status' | 'winnerTeamIndex'>,
): string | null {
  if (game.status === 'cancelled') return 'Game cancelled';
  if (game.status !== 'finished') return null;
  return game.winnerTeamIndex === null
    ? 'Game finished'
    : `${teamNames[game.winnerTeamIndex]} team won`;
}
