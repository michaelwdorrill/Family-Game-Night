import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  applySequenceCommand,
  canPassNoLegalMove,
  createDeck,
  createSequenceGame,
  getExchangeableDeadCards,
  getLegalTargetsForCard,
  parseSequenceGameState,
  toSequencePlayerView,
} from '../src';
import { SeededRandomSource } from './seeded-random';

import type { SequenceGameState } from '../src';

import { allCardIds, getCurrentPlayer, rezoneCards, twoTeamGame } from './helpers';

function collectKeys(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, output);
    return output;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      output.add(key);
      collectKeys(child, output);
    }
  }
  return output;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return isUnknownArray(value) && value.every((item) => typeof item === 'string');
}

function firstAlternative(details: Readonly<Record<string, unknown>>): readonly string[] | null {
  const alternatives = details['alternatives'];
  if (!isUnknownArray(alternatives)) return null;
  const first = alternatives[0];
  if (!isStringArray(first)) return null;
  return first;
}

function takeOneVerifiedAction(
  state: SequenceGameState,
  random: SeededRandomSource,
): SequenceGameState {
  const player = getCurrentPlayer(state);
  const playable = player.hand
    .map((card) => ({ card, targets: getLegalTargetsForCard(state, player.teamIndex, card) }))
    .find(({ targets }) => targets.length > 0);

  if (playable !== undefined) {
    const targetCell = playable.targets[0];
    if (targetCell === undefined) throw new Error('A playable card had no first target.');
    const command = {
      type: 'PLAY_CARD' as const,
      cardId: playable.card.id,
      targetCell,
    };
    let result = applySequenceCommand({ state, actorUserId: player.userId, command, random });
    if (!result.ok && result.error.code === 'SEQUENCE_SELECTION_REQUIRED') {
      const selection = firstAlternative(result.error.details);
      if (selection === null) throw new Error('Sequence-choice error omitted valid alternatives.');
      result = applySequenceCommand({
        state,
        actorUserId: player.userId,
        command: { ...command, sequenceSelection: selection },
        random,
      });
    }
    if (!result.ok) throw new Error(`Legal generated play failed: ${result.error.code}.`);
    return result.state;
  }

  const deadCard = getExchangeableDeadCards(state, player.hand)[0];
  if (deadCard !== undefined) {
    const result = applySequenceCommand({
      state,
      actorUserId: player.userId,
      command: { type: 'EXCHANGE_DEAD_CARD', cardId: deadCard.id },
      random,
    });
    if (!result.ok) throw new Error(`Legal generated exchange failed: ${result.error.code}.`);
    return result.state;
  }

  if (!canPassNoLegalMove(state, player.teamIndex, player.hand)) {
    throw new Error('Generated state has neither a play, exchange, nor verified pass.');
  }
  const result = applySequenceCommand({
    state,
    actorUserId: player.userId,
    command: { type: 'PASS_NO_LEGAL_MOVE' },
    random,
  });
  if (!result.ok) throw new Error(`Legal generated pass failed: ${result.error.code}.`);
  return result.state;
}

describe('runtime state validation', () => {
  it('accepts valid created state and returns a deep copy', () => {
    const state = twoTeamGame();
    const parsed = parseSequenceGameState(state);
    expect(parsed).toEqual(state);
    expect(parsed).not.toBe(state);
    expect(parsed.players).not.toBe(state.players);
  });

  it('rejects missing/unsupported versions, unknown fields, occupied corners, and duplicate cards', () => {
    const state = twoTeamGame();
    expect(() => parseSequenceGameState({ ...state, schemaVersion: 2 })).toThrow(
      /Unsupported Sequence state schema version/,
    );
    expect(() => parseSequenceGameState({ ...state, unexpected: true })).toThrow();

    const board = state.board.slice();
    board[0] = 0;
    expect(() => parseSequenceGameState({ ...state, board })).toThrow(/Corner cell 0/);

    const firstCard = state.deck[0]!;
    const players = state.players.map((player, index) =>
      index === 0 ? { ...player, hand: [...player.hand, firstCard] } : player,
    );
    expect(() => parseSequenceGameState({ ...state, players })).toThrow(/not conserved/);
  });

  it('rejects non-straight claims and same-team claims overlapping more than once', () => {
    const state = twoTeamGame();
    const team = state.players[0]!.teamIndex;
    const board = state.board.slice();
    for (const cell of [10, 11, 12, 13, 14, 15, 22]) board[cell] = team;

    expect(() =>
      parseSequenceGameState({
        ...state,
        board,
        claimedSequences: [
          { id: 'crooked', teamIndex: team, cells: [10, 11, 12, 13, 22], createdTurn: 1 },
        ],
        sequenceCounts: team === 0 ? [1, 0] : [0, 1],
      }),
    ).toThrow(/canonical straight/);

    expect(() =>
      parseSequenceGameState({
        ...state,
        board,
        claimedSequences: [
          { id: 'H:1:0', teamIndex: team, cells: [10, 11, 12, 13, 14], createdTurn: 1 },
          { id: 'H:1:1', teamIndex: team, cells: [11, 12, 13, 14, 15], createdTurn: 1 },
        ],
        sequenceCounts: team === 0 ? [2, 0] : [0, 2],
      }),
    ).toThrow(/overlap in more than one cell/);
  });
});

describe('redacted player view', () => {
  it('contains only the viewer hand, public counts, and no deck/discard objects', () => {
    const base = twoTeamGame();
    const viewer = base.players[0]!;
    const opponent = base.players[1]!;
    const state = rezoneCards(
      base,
      new Map([
        [viewer.seatIndex, ['2S'] as const],
        [opponent.seatIndex, ['JH'] as const],
      ]),
    );
    const opponentCard = state.players.find((player) => player.userId === opponent.userId)?.hand[0];
    expect(opponentCard).toBeDefined();

    const view = toSequencePlayerView(state, viewer.userId);
    const serialized = JSON.stringify(view);
    const keys = collectKeys(view);
    expect(view.myHand.map((card) => card.code)).toEqual(['2S']);
    expect(view.players.find((player) => player.userId === opponent.userId)?.handCount).toBe(1);
    expect(serialized).not.toContain(opponentCard!.id);
    expect(serialized).not.toContain('JH');
    expect(keys.has('deck')).toBe(false);
    expect(keys.has('discard')).toBe(false);
    expect(keys.has('state_json')).toBe(false);
    expect(view.deckCount).toBe(102);
  });

  it('refuses to build a view for a nonmember', () => {
    expect(() => toSequencePlayerView(twoTeamGame(), 'outsider')).toThrow(/nonmember/);
  });
});

describe('card-conservation property', () => {
  it('keeps the original 104 instance IDs after every accepted generated command', () => {
    const expected = createDeck()
      .map((card) => card.id)
      .sort();

    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const random = new SeededRandomSource(seed);
        let state = createSequenceGame(
          {
            teamRosters: [
              ['B1', 'B2'],
              ['G1', 'G2'],
            ],
          },
          random,
        );

        for (let action = 0; action < 24 && state.phase === 'active'; action += 1) {
          const before = JSON.stringify(state);
          const next = takeOneVerifiedAction(state, random);
          expect(JSON.stringify(state)).toBe(before);
          expect(allCardIds(next)).toEqual(expected);
          state = next;
        }
      }),
      { numRuns: 40 },
    );
  });
});
