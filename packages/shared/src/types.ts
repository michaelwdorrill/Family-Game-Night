export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details: Readonly<Record<string, unknown>>;
    readonly requestId?: string;
  };
}

export type UserRole = 'admin' | 'member';
export type GameStatus = 'lobby' | 'active' | 'finished' | 'cancelled';
export type MembershipStatus = 'invited' | 'accepted' | 'declined' | 'left';
export type TeamIndex = 0 | 1 | 2;

export interface UserProfileDto {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly needsDisplayNameConfirmation: boolean;
}

export interface DirectoryUserDto {
  readonly id: string;
  readonly displayName: string;
  readonly email?: string;
}

export interface PublicGameEventDto {
  readonly version: number;
  readonly turnNumber: number;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string | null;
  readonly eventType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface InvitationDto {
  readonly id: string;
  readonly gameId: string;
  readonly gameTitle: string;
  readonly gameType: 'sequence';
  readonly gameVersion: number;
  readonly hostDisplayName: string;
  readonly status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  readonly createdAt: string;
}

export interface GameSummaryDto {
  readonly id: string;
  readonly gameType: 'sequence';
  readonly title: string;
  readonly status: GameStatus;
  readonly version: number;
  readonly updatedAt: string;
  readonly currentPlayerId: string | null;
  readonly currentPlayerDisplayName: string | null;
  readonly myTeamIndex: TeamIndex | null;
  readonly sequenceCounts: readonly number[];
  readonly winnerTeamIndex: TeamIndex | null;
  readonly action: 'take-turn' | 'view' | 'configure-lobby';
}

export interface GameSummaryPageDto {
  readonly games: readonly GameSummaryDto[];
  readonly nextCursor: string | null;
}

export interface InvitationListDto {
  readonly invitations: readonly InvitationDto[];
}

export interface PublicGameEventListDto {
  readonly events: readonly PublicGameEventDto[];
}

export interface LobbyMemberDto {
  readonly userId: string;
  readonly displayName: string;
  readonly membershipStatus: MembershipStatus;
  readonly teamIndex: TeamIndex | null;
  readonly seatIndex: number | null;
  readonly isHost: boolean;
}

export interface LobbyInvitationDto {
  readonly id: string;
  readonly email: string | null;
  readonly status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  readonly createdAt: string;
}

export interface LobbyViewDto {
  readonly kind: 'lobby';
  readonly id: string;
  readonly gameType: 'sequence';
  readonly title: string;
  readonly status: 'lobby' | 'cancelled';
  readonly version: number;
  readonly hostUserId: string;
  readonly teamCount: 2 | 3;
  readonly members: readonly LobbyMemberDto[];
  readonly invitations: readonly LobbyInvitationDto[];
  readonly seatPreview: readonly string[];
  readonly validation: {
    readonly valid: boolean;
    readonly errors: readonly string[];
  };
  readonly permissions: {
    readonly canManage: boolean;
    readonly canStart: boolean;
    readonly canLeave: boolean;
  };
  readonly recentEvents: readonly PublicGameEventDto[];
}

export interface SequenceCardDto {
  readonly id: string;
  readonly code: string;
  readonly rank: string;
  readonly suit: string;
  readonly kind: 'normal' | 'two-eyed-jack' | 'one-eyed-jack';
  readonly legalTargetCells: readonly number[];
  readonly isDead: boolean;
}

export interface SequenceGameViewDto {
  readonly kind: 'sequence';
  readonly id: string;
  readonly gameType: 'sequence';
  readonly title: string;
  readonly hostUserId: string;
  readonly status: 'active' | 'finished' | 'cancelled';
  readonly version: number;
  readonly turnNumber: number;
  readonly teamCount: 2 | 3;
  readonly targetSequences: 1 | 2;
  readonly players: readonly {
    readonly userId: string;
    readonly displayName: string;
    readonly seatIndex: number;
    readonly teamIndex: TeamIndex;
    readonly handCount: number;
    readonly isCurrentPlayer: boolean;
  }[];
  readonly currentPlayerId: string | null;
  readonly myUserId: string;
  readonly myHand: readonly SequenceCardDto[];
  readonly board: {
    readonly layout: readonly (readonly string[])[];
    readonly occupants: readonly (TeamIndex | null)[];
    readonly lastChangedCell: number | null;
  };
  readonly claimedSequences: readonly {
    readonly id: string;
    readonly teamIndex: TeamIndex;
    readonly cells: readonly number[];
    readonly createdTurn: number;
  }[];
  readonly sequenceCounts: readonly number[];
  readonly deckCount: number;
  readonly discardCount: number;
  readonly deadCardExchangeUsed: boolean;
  readonly canPassNoLegalMove: boolean;
  readonly winnerTeamIndex: TeamIndex | null;
  readonly permissions: {
    readonly canCancel: boolean;
  };
  readonly recentEvents: readonly PublicGameEventDto[];
}

export type GameDetailDto = LobbyViewDto | SequenceGameViewDto;

export interface StaleGameVersionDetails {
  readonly latest: GameDetailDto;
}
