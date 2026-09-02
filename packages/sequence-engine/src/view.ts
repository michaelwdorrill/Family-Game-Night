import { BOARD_LAYOUT } from './board';
import { cardKind } from './cards';
import { canPassNoLegalMove, getLegalTargetsForCard, isDeadCard } from './targets';

import type { SequenceGameState, SequenceGameView } from './types';

export function toSequencePlayerView(
  state: SequenceGameState,
  viewerUserId: string,
): SequenceGameView {
  const viewer = state.players.find((player) => player.userId === viewerUserId);
  if (viewer === undefined) {
    throw new Error('A nonmember cannot receive a Sequence player view.');
  }

  const currentPlayer =
    state.currentSeatIndex === null
      ? undefined
      : state.players.find((player) => player.seatIndex === state.currentSeatIndex);
  const isViewerTurn = state.phase === 'active' && currentPlayer?.userId === viewerUserId;

  return {
    status: state.phase,
    turnNumber: state.turnNumber,
    teamCount: state.teamCount,
    targetSequences: state.targetSequences,
    players: state.players.map((player) => ({
      userId: player.userId,
      seatIndex: player.seatIndex,
      teamIndex: player.teamIndex,
      handCount: player.hand.length,
      isCurrentPlayer: player.seatIndex === state.currentSeatIndex,
    })),
    currentPlayerId: currentPlayer?.userId ?? null,
    myUserId: viewerUserId,
    myHand: viewer.hand.map((card) => ({
      ...card,
      kind: cardKind(card),
      legalTargetCells: isViewerTurn ? getLegalTargetsForCard(state, viewer.teamIndex, card) : [],
      isDead: isDeadCard(state, card),
    })),
    board: {
      layout: BOARD_LAYOUT,
      occupants: state.board.slice(),
      lastChangedCell: state.lastChangedCell,
    },
    claimedSequences: state.claimedSequences.map((claim) => ({
      ...claim,
      cells: claim.cells.slice(),
    })),
    sequenceCounts: state.sequenceCounts.slice(),
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    deadCardExchangeUsed: state.deadCardExchangeUsed,
    canPassNoLegalMove: isViewerTurn && canPassNoLegalMove(state, viewer.teamIndex, viewer.hand),
    winnerTeamIndex: state.winnerTeamIndex,
  };
}
