export const SUITS = ['S', 'H', 'D', 'C'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type CardCode = `${Rank}${Suit}`;
export type BoardCode = Exclude<CardCode, `J${Suit}`> | 'FREE';
export type TeamIndex = 0 | 1 | 2;
export type Occupant = TeamIndex | null;
export type GamePhase = 'lobby' | 'active' | 'finished' | 'cancelled';
export type CardKind = 'normal' | 'two-eyed-jack' | 'one-eyed-jack';

export interface CardInstance {
  readonly id: string;
  readonly code: CardCode;
  readonly rank: Rank;
  readonly suit: Suit;
}

export interface ClaimedSequence {
  readonly id: string;
  readonly teamIndex: TeamIndex;
  readonly cells: readonly number[];
  readonly createdTurn: number;
}

export interface SequencePlayer {
  readonly userId: string;
  readonly seatIndex: number;
  readonly teamIndex: TeamIndex;
  readonly hand: readonly CardInstance[];
}

export interface SequenceGameState {
  readonly schemaVersion: 1;
  readonly phase: GamePhase;
  readonly teamCount: 2 | 3;
  readonly targetSequences: 1 | 2;
  readonly players: readonly SequencePlayer[];
  readonly dealerSeatIndex: number | null;
  readonly currentSeatIndex: number | null;
  readonly board: readonly Occupant[];
  readonly claimedSequences: readonly ClaimedSequence[];
  readonly sequenceCounts: readonly number[];
  readonly deck: readonly CardInstance[];
  readonly discard: readonly CardInstance[];
  readonly turnNumber: number;
  readonly deadCardExchangeUsed: boolean;
  readonly lastChangedCell: number | null;
  readonly winnerTeamIndex: TeamIndex | null;
}

export interface RandomSource {
  randomInt(maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

export interface StartGameInput {
  readonly teamRosters: readonly (readonly string[])[];
  readonly pendingInviteCount?: number;
}

export type SequenceCommand =
  | {
      readonly type: 'PLAY_CARD';
      readonly cardId: string;
      readonly targetCell: number;
      readonly sequenceSelection?: readonly string[];
    }
  | {
      readonly type: 'EXCHANGE_DEAD_CARD';
      readonly cardId: string;
    }
  | {
      readonly type: 'PASS_NO_LEGAL_MOVE';
    };

export type SequenceEvent =
  | {
      readonly type: 'CARD_PLAYED';
      readonly actorUserId: string;
      readonly cardCode: CardCode;
      readonly targetCell: number;
      readonly boardEffect: 'chip-placed' | 'chip-removed';
      readonly claimedSequenceIds: readonly string[];
      readonly winnerTeamIndex: TeamIndex | null;
    }
  | {
      readonly type: 'DEAD_CARD_EXCHANGED';
      readonly actorUserId: string;
      readonly cardCode: CardCode;
    }
  | {
      readonly type: 'TURN_PASSED_NO_LEGAL_MOVE';
      readonly actorUserId: string;
    };

export type SequenceErrorCode =
  | 'GAME_NOT_ACTIVE'
  | 'WRONG_PLAYER'
  | 'CARD_NOT_IN_HAND'
  | 'ILLEGAL_TARGET'
  | 'CARD_NOT_DEAD'
  | 'DEAD_CARD_EXCHANGE_ALREADY_USED'
  | 'LEGAL_MOVE_AVAILABLE'
  | 'DEAD_CARD_EXCHANGE_AVAILABLE'
  | 'SEQUENCE_SELECTION_REQUIRED'
  | 'INVALID_SEQUENCE_SELECTION';

export interface SequenceError {
  readonly code: SequenceErrorCode;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export type ApplyCommandResult =
  | {
      readonly ok: true;
      readonly state: SequenceGameState;
      readonly event: SequenceEvent;
    }
  | {
      readonly ok: false;
      readonly error: SequenceError;
    };

export interface ApplyCommandInput {
  readonly state: SequenceGameState;
  readonly actorUserId: string;
  readonly command: SequenceCommand;
  readonly random: RandomSource;
}

export interface SequenceCandidate {
  readonly id: string;
  readonly cells: readonly number[];
}

export interface LobbyValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface SequenceCardView extends CardInstance {
  readonly kind: CardKind;
  readonly legalTargetCells: readonly number[];
  readonly isDead: boolean;
}

export interface SequencePlayerView {
  readonly userId: string;
  readonly seatIndex: number;
  readonly teamIndex: TeamIndex;
  readonly handCount: number;
  readonly isCurrentPlayer: boolean;
}

export interface SequenceGameView {
  readonly status: GamePhase;
  readonly turnNumber: number;
  readonly teamCount: 2 | 3;
  readonly targetSequences: 1 | 2;
  readonly players: readonly SequencePlayerView[];
  readonly currentPlayerId: string | null;
  readonly myUserId: string;
  readonly myHand: readonly SequenceCardView[];
  readonly board: {
    readonly layout: readonly (readonly BoardCode[])[];
    readonly occupants: readonly Occupant[];
    readonly lastChangedCell: number | null;
  };
  readonly claimedSequences: readonly ClaimedSequence[];
  readonly sequenceCounts: readonly number[];
  readonly deckCount: number;
  readonly discardCount: number;
  readonly deadCardExchangeUsed: boolean;
  readonly canPassNoLegalMove: boolean;
  readonly winnerTeamIndex: TeamIndex | null;
}
