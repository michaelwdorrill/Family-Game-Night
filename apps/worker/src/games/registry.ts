import {
  applySequenceCommand,
  createSequenceGame,
  parseSequenceGameState,
  toSequencePlayerView,
} from '@family-game-night/sequence-engine';

import type {
  ApplyCommandResult,
  RandomSource,
  SequenceCommand,
  SequenceGameState,
  SequenceGameView,
  StartGameInput,
} from '@family-game-night/sequence-engine';

export interface GameModule<TState, TCommand, TView> {
  readonly gameType: 'sequence';
  readonly stateSchemaVersion: 1;
  createGame(input: StartGameInput, random: RandomSource): TState;
  parseState(input: unknown): TState;
  applyCommand(input: {
    readonly state: TState;
    readonly actorUserId: string;
    readonly command: TCommand;
    readonly random: RandomSource;
  }): ApplyCommandResult;
  toPlayerView(state: TState, viewerUserId: string): TView;
  getDashboardSummary(state: TState): {
    readonly sequenceCounts: readonly number[];
  };
}

export const sequenceModule: GameModule<SequenceGameState, SequenceCommand, SequenceGameView> = {
  gameType: 'sequence',
  stateSchemaVersion: 1,
  createGame: createSequenceGame,
  parseState: parseSequenceGameState,
  applyCommand: applySequenceCommand,
  toPlayerView: toSequencePlayerView,
  getDashboardSummary: (state) => ({ sequenceCounts: state.sequenceCounts.slice() }),
};

export const gameModules = {
  sequence: sequenceModule,
} as const;

export type RegisteredGameType = keyof typeof gameModules;

export function getGameModule(gameType: string): typeof sequenceModule {
  if (gameType !== 'sequence') {
    throw new Error(`Unsupported game type: ${gameType}.`);
  }
  return gameModules.sequence;
}
