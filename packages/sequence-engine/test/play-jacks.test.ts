import { describe, expect, it } from 'vitest';

import {
  applySequenceCommand,
  getLegalTargetsForCard,
  getMatchingCells,
  parseSequenceGameState,
} from '../src';
import { SeededRandomSource } from './seeded-random';

import type { ClaimedSequence, SequenceGameState, TeamIndex } from '../src';

import {
  allCardIds,
  currentActor,
  getCurrentPlayer,
  threeTeamGame,
  twoTeamGame,
  withBoard,
  withCurrentHand,
} from './helpers';

function play(
  state: SequenceGameState,
  cardId: string,
  targetCell: number,
  actorUserId = currentActor(state),
) {
  return applySequenceCommand({
    state,
    actorUserId,
    command: { type: 'PLAY_CARD', cardId, targetCell },
    random: new SeededRandomSource(77),
  });
}

function currentCard(state: SequenceGameState) {
  const card = getCurrentPlayer(state).hand[0];
  if (card === undefined) {
    throw new Error('Test player has no card.');
  }
  return card;
}

describe('normal play', () => {
  it('allows either matching empty space and narrows to the remaining empty space', () => {
    let state = withCurrentHand(twoTeamGame(), ['2S']);
    const card = currentCard(state);
    const matches = getMatchingCells('2S');
    expect(getLegalTargetsForCard(state, getCurrentPlayer(state).teamIndex, card)).toEqual(matches);

    const occupied = matches[0]!;
    state = withBoard(state, [[occupied, 1]]);
    expect(getLegalTargetsForCard(state, getCurrentPlayer(state).teamIndex, card)).toEqual([
      matches[1],
    ]);
  });

  it('rejects occupied, nonmatching, missing-card, and wrong-player actions', () => {
    let state = withCurrentHand(twoTeamGame(), ['2S']);
    const card = currentCard(state);
    const target = getMatchingCells('2S')[0]!;
    state = withBoard(state, [[target, 1]]);

    expect(play(state, card.id, target)).toMatchObject({
      ok: false,
      error: { code: 'ILLEGAL_TARGET' },
    });
    expect(play(state, card.id, 50)).toMatchObject({
      ok: false,
      error: { code: 'ILLEGAL_TARGET' },
    });
    expect(play(state, 'not-a-card', 1)).toMatchObject({
      ok: false,
      error: { code: 'CARD_NOT_IN_HAND' },
    });

    const otherPlayer = state.players.find((player) => player.userId !== currentActor(state))!;
    expect(play(state, card.id, getMatchingCells('2S')[1]!, otherPlayer.userId)).toMatchObject({
      ok: false,
      error: { code: 'WRONG_PLAYER' },
    });
  });

  it('immutably places, discards, draws exactly one, and advances the turn', () => {
    const state = withCurrentHand(twoTeamGame(), ['2S']);
    const beforeJson = JSON.stringify(state);
    const beforeIds = allCardIds(state);
    const player = getCurrentPlayer(state);
    const card = currentCard(state);
    const target = getMatchingCells('2S')[0]!;

    const result = play(state, card.id, target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const resultingPlayer = result.state.players.find(
      (candidate) => candidate.userId === player.userId,
    )!;
    expect(result.state.board[target]).toBe(player.teamIndex);
    expect(resultingPlayer.hand).toHaveLength(1);
    expect(resultingPlayer.hand.some((candidate) => candidate.id === card.id)).toBe(false);
    expect(result.state.discard.map((discarded) => discarded.id)).toContain(card.id);
    expect(result.state.currentSeatIndex).toBe((player.seatIndex + 1) % state.players.length);
    expect(result.state.turnNumber).toBe(state.turnNumber + 1);
    expect(result.state.lastChangedCell).toBe(target);
    expect(allCardIds(result.state)).toEqual(beforeIds);
    expect(JSON.stringify(state)).toBe(beforeJson);
  });
});

describe('two-eyed Jacks', () => {
  it.each(['JC', 'JD'] as const)('%s places on any empty non-corner', (code) => {
    let state = withCurrentHand(twoTeamGame(), [code]);
    state = withBoard(state, [[22, 1]]);
    const card = currentCard(state);
    const targets = getLegalTargetsForCard(state, getCurrentPlayer(state).teamIndex, card);
    expect(targets).toContain(21);
    expect(targets).not.toContain(22);
    expect(targets).not.toContain(0);

    const result = play(state, card.id, 21);
    expect(result).toMatchObject({ ok: true, event: { boardEffect: 'chip-placed' } });
    if (result.ok) expect(result.state.board[21]).toBe(getCurrentPlayer(state).teamIndex);
  });

  it('cannot overwrite a chip or target a corner', () => {
    let state = withCurrentHand(twoTeamGame(), ['JC']);
    state = withBoard(state, [[22, 1]]);
    const card = currentCard(state);
    expect(play(state, card.id, 22)).toMatchObject({
      ok: false,
      error: { code: 'ILLEGAL_TARGET' },
    });
    expect(play(state, card.id, 0)).toMatchObject({
      ok: false,
      error: { code: 'ILLEGAL_TARGET' },
    });
  });
});

describe('one-eyed Jacks', () => {
  it.each(['JS', 'JH'] as const)('%s removes an opposing chip without placing one', (code) => {
    let state = withCurrentHand(twoTeamGame(), [code]);
    const player = getCurrentPlayer(state);
    const opponent: TeamIndex = player.teamIndex === 0 ? 1 : 0;
    state = withBoard(state, [
      [21, opponent],
      [22, player.teamIndex],
    ]);
    const card = currentCard(state);
    const targets = getLegalTargetsForCard(state, player.teamIndex, card);
    expect(targets).toContain(21);
    expect(targets).not.toContain(22);
    expect(play(state, card.id, 22)).toMatchObject({
      ok: false,
      error: { code: 'ILLEGAL_TARGET' },
    });

    const result = play(state, card.id, 21);
    expect(result).toMatchObject({ ok: true, event: { boardEffect: 'chip-removed' } });
    if (!result.ok) return;
    expect(result.state.board[21]).toBeNull();
    expect(result.state.discard.map((discarded) => discarded.id)).toContain(card.id);
    expect(result.state.currentSeatIndex).not.toBe(player.seatIndex);
  });

  it('may remove either opposing team in a three-team game', () => {
    let state = withCurrentHand(threeTeamGame(), ['JS']);
    const player = getCurrentPlayer(state);
    const opponents = ([0, 1, 2] as const).filter((team) => team !== player.teamIndex);
    state = withBoard(state, [
      [21, opponents[0]!],
      [22, opponents[1]!],
    ]);
    expect(getLegalTargetsForCard(state, player.teamIndex, currentCard(state))).toEqual([21, 22]);
  });

  it('cannot remove a protected sequence chip', () => {
    let state = withCurrentHand(twoTeamGame(), ['JS']);
    const player = getCurrentPlayer(state);
    const opponent: TeamIndex = player.teamIndex === 0 ? 1 : 0;
    const claim: ClaimedSequence = {
      id: 'H:1:1',
      teamIndex: opponent,
      cells: [11, 12, 13, 14, 15],
      createdTurn: 1,
    };
    state = withBoard(
      state,
      [
        [11, opponent],
        [12, opponent],
        [13, opponent],
        [14, opponent],
        [15, opponent],
        [16, opponent],
      ],
      [claim],
    );

    const targets = getLegalTargetsForCard(state, player.teamIndex, currentCard(state));
    expect(targets).not.toContain(13);
    expect(targets).toContain(16);
    expect(play(state, currentCard(state).id, 13)).toMatchObject({
      ok: false,
      error: { code: 'ILLEGAL_TARGET' },
    });
  });

  it('rejects commands after a game has finished', () => {
    const active = withCurrentHand(twoTeamGame(), ['JS']);
    const state = parseSequenceGameState({
      ...active,
      phase: 'cancelled',
    });
    expect(play(state, currentCard(state).id, 21)).toMatchObject({
      ok: false,
      error: { code: 'GAME_NOT_ACTIVE' },
    });
  });
});
