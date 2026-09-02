import { cardKind } from './cards';
import { parseSequenceGameState } from './state';
import { claimSelectionMatches, getMaximalClaimAlternatives } from './sequences';
import {
  canPassNoLegalMove,
  getExchangeableDeadCards,
  getLegalTargetsForCard,
  handHasLegalMove,
  isDeadCard,
} from './targets';

import type {
  ApplyCommandInput,
  ApplyCommandResult,
  CardInstance,
  ClaimedSequence,
  Occupant,
  RandomSource,
  SequenceCandidate,
  SequenceError,
  SequenceErrorCode,
  SequenceGameState,
  SequencePlayer,
  TeamIndex,
} from './types';

function failed(
  code: SequenceErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): ApplyCommandResult {
  const error: SequenceError = { code, message, details };
  return { ok: false, error };
}

function currentPlayer(state: SequenceGameState): SequencePlayer | null {
  if (state.currentSeatIndex === null) {
    return null;
  }
  return state.players.find((player) => player.seatIndex === state.currentSeatIndex) ?? null;
}

function withoutCard(
  hand: readonly CardInstance[],
  cardId: string,
): { readonly card: CardInstance; readonly hand: CardInstance[] } | null {
  const index = hand.findIndex((card) => card.id === cardId);
  const card = hand[index];
  if (index < 0 || card === undefined) {
    return null;
  }
  const nextHand = hand.slice();
  nextHand.splice(index, 1);
  return { card, hand: nextHand };
}

function replacePlayerHand(
  players: readonly SequencePlayer[],
  seatIndex: number,
  hand: readonly CardInstance[],
): SequencePlayer[] {
  return players.map((player) =>
    player.seatIndex === seatIndex ? { ...player, hand: hand.slice() } : player,
  );
}

function assertShuffleConservation(
  before: readonly CardInstance[],
  after: readonly CardInstance[],
): void {
  const beforeIds = new Set(before.map((card) => card.id));
  const afterIds = new Set(after.map((card) => card.id));
  if (
    before.length !== after.length ||
    beforeIds.size !== afterIds.size ||
    [...beforeIds].some((id) => !afterIds.has(id))
  ) {
    throw new Error('RandomSource.shuffle did not conserve the discard pile.');
  }
}

function drawReplacement(
  deckInput: readonly CardInstance[],
  discardInput: readonly CardInstance[],
  random: RandomSource,
): {
  readonly card: CardInstance;
  readonly deck: CardInstance[];
  readonly discard: CardInstance[];
} {
  let deck = deckInput.slice();
  let discard = discardInput.slice();

  if (deck.length === 0) {
    const shuffled = random.shuffle(discard);
    assertShuffleConservation(discard, shuffled);
    deck = shuffled;
    discard = [];
  }

  const card = deck.pop();
  if (card === undefined) {
    throw new Error('A replacement draw was required with no cards available.');
  }
  return { card, deck, discard };
}

function nextSeat(state: SequenceGameState): number {
  if (state.currentSeatIndex === null) {
    throw new Error('An active game has no current seat.');
  }
  return (state.currentSeatIndex + 1) % state.players.length;
}

function selectedAlternative(
  alternatives: readonly (readonly SequenceCandidate[])[],
  selection: readonly string[] | undefined,
):
  | { readonly type: 'selected'; readonly candidates: readonly SequenceCandidate[] }
  | { readonly type: 'required'; readonly alternatives: readonly (readonly string[])[] }
  | { readonly type: 'invalid'; readonly alternatives: readonly (readonly string[])[] } {
  const publicAlternatives = alternatives.map((alternative) =>
    alternative.map((candidate) => candidate.id),
  );

  if (alternatives.length === 0) {
    return selection === undefined || selection.length === 0
      ? { type: 'selected', candidates: [] }
      : { type: 'invalid', alternatives: publicAlternatives };
  }

  if (selection === undefined) {
    return alternatives.length === 1
      ? { type: 'selected', candidates: alternatives[0] ?? [] }
      : { type: 'required', alternatives: publicAlternatives };
  }

  const match = alternatives.find((alternative) => claimSelectionMatches(alternative, selection));
  return match === undefined
    ? { type: 'invalid', alternatives: publicAlternatives }
    : { type: 'selected', candidates: match };
}

function derivedSequenceCounts(claims: readonly ClaimedSequence[], teamCount: 2 | 3): number[] {
  return Array.from(
    { length: teamCount },
    (_, teamIndex) => claims.filter((claim) => claim.teamIndex === teamIndex).length,
  );
}

function teamSequenceCount(state: SequenceGameState, teamIndex: TeamIndex): number {
  return state.claimedSequences.filter((claim) => claim.teamIndex === teamIndex).length;
}

function applyExchange(
  state: SequenceGameState,
  player: SequencePlayer,
  cardId: string,
  random: RandomSource,
): ApplyCommandResult {
  if (state.deadCardExchangeUsed) {
    return failed(
      'DEAD_CARD_EXCHANGE_ALREADY_USED',
      'The one dead-card exchange for this turn has already been used.',
    );
  }

  const removed = withoutCard(player.hand, cardId);
  if (removed === null) {
    return failed('CARD_NOT_IN_HAND', 'The selected card is not in the current player’s hand.');
  }
  if (!isDeadCard(state, removed.card)) {
    return failed('CARD_NOT_DEAD', 'Only a non-Jack with both board spaces occupied is dead.');
  }

  const draw = drawReplacement(state.deck, [...state.discard, removed.card], random);
  removed.hand.push(draw.card);
  const nextState: SequenceGameState = {
    ...state,
    players: replacePlayerHand(state.players, player.seatIndex, removed.hand),
    deck: draw.deck,
    discard: draw.discard,
    deadCardExchangeUsed: true,
  };

  return {
    ok: true,
    state: parseSequenceGameState(nextState),
    event: {
      type: 'DEAD_CARD_EXCHANGED',
      actorUserId: player.userId,
      cardCode: removed.card.code,
    },
  };
}

function applyPass(state: SequenceGameState, player: SequencePlayer): ApplyCommandResult {
  if (handHasLegalMove(state, player.teamIndex, player.hand)) {
    return failed('LEGAL_MOVE_AVAILABLE', 'The player has at least one legal card target.');
  }
  if (!state.deadCardExchangeUsed && getExchangeableDeadCards(state, player.hand).length > 0) {
    return failed(
      'DEAD_CARD_EXCHANGE_AVAILABLE',
      'A dead card can still be exchanged before passing.',
    );
  }
  if (!canPassNoLegalMove(state, player.teamIndex, player.hand)) {
    return failed('LEGAL_MOVE_AVAILABLE', 'The no-legal-move pass conditions are not met.');
  }

  const nextState: SequenceGameState = {
    ...state,
    currentSeatIndex: nextSeat(state),
    turnNumber: state.turnNumber + 1,
    deadCardExchangeUsed: false,
  };

  return {
    ok: true,
    state: parseSequenceGameState(nextState),
    event: { type: 'TURN_PASSED_NO_LEGAL_MOVE', actorUserId: player.userId },
  };
}

function applyPlay(
  state: SequenceGameState,
  player: SequencePlayer,
  command: Extract<ApplyCommandInput['command'], { readonly type: 'PLAY_CARD' }>,
  random: RandomSource,
): ApplyCommandResult {
  const removed = withoutCard(player.hand, command.cardId);
  if (removed === null) {
    return failed('CARD_NOT_IN_HAND', 'The selected card is not in the current player’s hand.');
  }

  const legalTargets = getLegalTargetsForCard(state, player.teamIndex, removed.card);
  if (!legalTargets.includes(command.targetCell)) {
    return failed('ILLEGAL_TARGET', 'That card cannot be played on the selected board cell.', {
      targetCell: command.targetCell,
    });
  }

  const kind = cardKind(removed.card);
  const board: Occupant[] = state.board.slice();
  board[command.targetCell] = kind === 'one-eyed-jack' ? null : player.teamIndex;

  const alternatives =
    kind === 'one-eyed-jack'
      ? []
      : getMaximalClaimAlternatives({
          board,
          teamIndex: player.teamIndex,
          newlyPlacedCell: command.targetCell,
          existingClaims: state.claimedSequences,
          sequencesStillNeeded: state.targetSequences - teamSequenceCount(state, player.teamIndex),
        });
  const selection = selectedAlternative(alternatives, command.sequenceSelection);
  if (selection.type === 'required') {
    return failed(
      'SEQUENCE_SELECTION_REQUIRED',
      'This play creates more than one equally maximal sequence choice.',
      { alternatives: selection.alternatives },
    );
  }
  if (selection.type === 'invalid') {
    return failed(
      'INVALID_SEQUENCE_SELECTION',
      'The submitted sequence selection is not an exact legal alternative.',
      { alternatives: selection.alternatives },
    );
  }

  const newClaims: ClaimedSequence[] = selection.candidates.map((candidate) => ({
    id: candidate.id,
    teamIndex: player.teamIndex,
    cells: candidate.cells.slice(),
    createdTurn: state.turnNumber,
  }));
  const claimedSequences = [...state.claimedSequences, ...newClaims];
  const sequenceCounts = derivedSequenceCounts(claimedSequences, state.teamCount);
  const teamCount = sequenceCounts[player.teamIndex] ?? 0;
  const won = teamCount >= state.targetSequences;
  const discard = [...state.discard, removed.card];

  let nextState: SequenceGameState;
  if (won) {
    nextState = {
      ...state,
      phase: 'finished',
      players: replacePlayerHand(state.players, player.seatIndex, removed.hand),
      board,
      claimedSequences,
      sequenceCounts,
      discard,
      lastChangedCell: command.targetCell,
      winnerTeamIndex: player.teamIndex,
    };
  } else {
    const draw = drawReplacement(state.deck, discard, random);
    removed.hand.push(draw.card);
    nextState = {
      ...state,
      players: replacePlayerHand(state.players, player.seatIndex, removed.hand),
      currentSeatIndex: nextSeat(state),
      board,
      claimedSequences,
      sequenceCounts,
      deck: draw.deck,
      discard: draw.discard,
      turnNumber: state.turnNumber + 1,
      deadCardExchangeUsed: false,
      lastChangedCell: command.targetCell,
    };
  }

  return {
    ok: true,
    state: parseSequenceGameState(nextState),
    event: {
      type: 'CARD_PLAYED',
      actorUserId: player.userId,
      cardCode: removed.card.code,
      targetCell: command.targetCell,
      boardEffect: kind === 'one-eyed-jack' ? 'chip-removed' : 'chip-placed',
      claimedSequenceIds: newClaims.map((claim) => claim.id),
      winnerTeamIndex: won ? player.teamIndex : null,
    },
  };
}

export function applySequenceCommand(input: ApplyCommandInput): ApplyCommandResult {
  const state = parseSequenceGameState(input.state);
  if (state.phase !== 'active') {
    return failed('GAME_NOT_ACTIVE', 'Only an active game can accept a turn command.');
  }

  const player = currentPlayer(state);
  if (player === null || player.userId !== input.actorUserId) {
    return failed('WRONG_PLAYER', 'Only the current player may submit this command.');
  }

  switch (input.command.type) {
    case 'EXCHANGE_DEAD_CARD':
      return applyExchange(state, player, input.command.cardId, input.random);
    case 'PASS_NO_LEGAL_MOVE':
      return applyPass(state, player);
    case 'PLAY_CARD':
      return applyPlay(state, player, input.command, input.random);
  }
}
