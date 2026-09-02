import { describe, expect, it } from 'vitest';

import { applySequenceCommand, canPassNoLegalMove, getMatchingCells, isDeadCard } from '../src';
import { SeededRandomSource } from './seeded-random';

import type { SequenceGameState, TeamIndex } from '../src';

import {
  allCardIds,
  currentActor,
  getCurrentPlayer,
  twoTeamGame,
  withBoard,
  withCurrentHand,
} from './helpers';

function exchange(state: SequenceGameState, cardId: string) {
  return applySequenceCommand({
    state,
    actorUserId: currentActor(state),
    command: { type: 'EXCHANGE_DEAD_CARD', cardId },
    random: new SeededRandomSource(101),
  });
}

function pass(state: SequenceGameState) {
  return applySequenceCommand({
    state,
    actorUserId: currentActor(state),
    command: { type: 'PASS_NO_LEGAL_MOVE' },
    random: new SeededRandomSource(102),
  });
}

function occupyMatches(state: SequenceGameState, code: '2S' | '3S'): SequenceGameState {
  const matches = getMatchingCells(code);
  return withBoard(
    state,
    matches.map((cell, index) => [cell, (index % 2) as TeamIndex] as const),
  );
}

describe('dead-card exchange', () => {
  it('is dead only when both normal-card spaces are occupied by any teams', () => {
    let state = withCurrentHand(twoTeamGame(), ['2S', 'JC']);
    const [normal, jack] = getCurrentPlayer(state).hand;
    expect(normal).toBeDefined();
    expect(jack).toBeDefined();
    if (normal === undefined || jack === undefined) return;

    const matches = getMatchingCells('2S');
    state = withBoard(state, [[matches[0]!, 0]]);
    expect(isDeadCard(state, normal)).toBe(false);
    state = withBoard(state, [
      [matches[0]!, 0],
      [matches[1]!, 1],
    ]);
    expect(isDeadCard(state, normal)).toBe(true);
    expect(isDeadCard(state, jack)).toBe(false);
  });

  it('discards and replaces once without advancing the player or turn', () => {
    let state = withCurrentHand(twoTeamGame(), ['2S']);
    state = occupyMatches(state, '2S');
    const beforeIds = allCardIds(state);
    const player = getCurrentPlayer(state);
    const card = player.hand[0]!;

    const result = exchange(state, card.id);
    expect(result).toMatchObject({ ok: true, event: { type: 'DEAD_CARD_EXCHANGED' } });
    if (!result.ok) return;
    expect(result.state.currentSeatIndex).toBe(player.seatIndex);
    expect(result.state.turnNumber).toBe(state.turnNumber);
    expect(result.state.deadCardExchangeUsed).toBe(true);
    expect(
      result.state.players.find((candidate) => candidate.userId === player.userId)?.hand,
    ).toHaveLength(1);
    expect(result.state.discard.map((discarded) => discarded.id)).toContain(card.id);
    expect(allCardIds(result.state)).toEqual(beforeIds);
  });

  it('persists the once-per-turn limit across a returned snapshot', () => {
    let state = withCurrentHand(twoTeamGame(), ['2S', '3S']);
    const placements = [...getMatchingCells('2S'), ...getMatchingCells('3S')].map(
      (cell, index) => [cell, (index % 2) as TeamIndex] as const,
    );
    state = withBoard(state, placements);
    const firstCard = getCurrentPlayer(state).hand.find((card) => card.code === '2S')!;
    const first = exchange(state, firstCard.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const secondCard = getCurrentPlayer(first.state).hand.find((card) => card.code === '3S')!;
    expect(exchange(first.state, secondCard.id)).toMatchObject({
      ok: false,
      error: { code: 'DEAD_CARD_EXCHANGE_ALREADY_USED' },
    });
  });

  it('resets the exchange flag only after the player completes normal play', () => {
    let state = withCurrentHand(twoTeamGame(), ['2S']);
    state = { ...state, deadCardExchangeUsed: true };
    const player = getCurrentPlayer(state);
    const card = player.hand[0]!;
    const targetCell = getMatchingCells('2S')[0]!;
    const result = applySequenceCommand({
      state,
      actorUserId: player.userId,
      command: { type: 'PLAY_CARD', cardId: card.id, targetCell },
      random: new SeededRandomSource(33),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.currentSeatIndex).not.toBe(player.seatIndex);
    expect(result.state.deadCardExchangeUsed).toBe(false);
  });

  it('rejects live cards and Jacks', () => {
    const state = withCurrentHand(twoTeamGame(), ['2S', 'JC']);
    for (const card of getCurrentPlayer(state).hand) {
      expect(exchange(state, card.id)).toMatchObject({
        ok: false,
        error: { code: 'CARD_NOT_DEAD' },
      });
    }
  });

  it('reshuffles the entire discard pile when drawing from an empty deck', () => {
    let state = withCurrentHand(twoTeamGame(), ['2S'], 'discard');
    state = occupyMatches(state, '2S');
    const beforeIds = allCardIds(state);
    expect(state.deck).toHaveLength(0);
    expect(state.discard).toHaveLength(103);

    const result = exchange(state, getCurrentPlayer(state).hand[0]!.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.deck).toHaveLength(103);
    expect(result.state.discard).toHaveLength(0);
    expect(allCardIds(result.state)).toEqual(beforeIds);
  });
});

describe('no-legal-move pass', () => {
  it('is rejected while a legal target exists', () => {
    const state = withCurrentHand(twoTeamGame(), ['2S']);
    expect(pass(state)).toMatchObject({
      ok: false,
      error: { code: 'LEGAL_MOVE_AVAILABLE' },
    });
  });

  it('is rejected while an unused dead-card exchange is available', () => {
    const state = occupyMatches(withCurrentHand(twoTeamGame(), ['2S']), '2S');
    expect(
      canPassNoLegalMove(state, getCurrentPlayer(state).teamIndex, getCurrentPlayer(state).hand),
    ).toBe(false);
    expect(pass(state)).toMatchObject({
      ok: false,
      error: { code: 'DEAD_CARD_EXCHANGE_AVAILABLE' },
    });
  });

  it('advances without drawing after the exchange has been used', () => {
    let state = occupyMatches(withCurrentHand(twoTeamGame(), ['2S']), '2S');
    state = { ...state, deadCardExchangeUsed: true };
    const player = getCurrentPlayer(state);
    const beforeIds = allCardIds(state);

    const result = pass(state);
    expect(result).toMatchObject({ ok: true, event: { type: 'TURN_PASSED_NO_LEGAL_MOVE' } });
    if (!result.ok) return;
    expect(result.state.currentSeatIndex).toBe((player.seatIndex + 1) % state.players.length);
    expect(result.state.turnNumber).toBe(state.turnNumber + 1);
    expect(result.state.deadCardExchangeUsed).toBe(false);
    expect(allCardIds(result.state)).toEqual(beforeIds);
  });

  it('allows a pass with no legal target and no exchangeable normal card', () => {
    const state = withCurrentHand(twoTeamGame(), ['JH']);
    expect(
      canPassNoLegalMove(state, getCurrentPlayer(state).teamIndex, getCurrentPlayer(state).hand),
    ).toBe(true);
    expect(pass(state).ok).toBe(true);
  });
});
