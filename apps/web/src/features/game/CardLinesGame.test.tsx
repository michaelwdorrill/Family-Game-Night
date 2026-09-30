import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CardLinesGame } from './CardLinesGame';

import type { SequenceGameViewDto } from '@family-game-night/shared';

const HOST_ID = '00000000-0000-4000-8000-000000000001';
const MEMBER_ID = '00000000-0000-4000-8000-000000000002';
const GAME_ID = '00000000-0000-4000-8000-000000000003';

function game(overrides: Partial<SequenceGameViewDto> = {}): SequenceGameViewDto {
  const layout = Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 10 }, (_, column) =>
      (row === 0 || row === 9) && (column === 0 || column === 9) ? 'FREE' : 'AS',
    ),
  );
  return {
    kind: 'sequence',
    id: GAME_ID,
    gameType: 'sequence',
    title: 'Test Table',
    hostUserId: HOST_ID,
    status: 'active',
    version: 5,
    turnNumber: 1,
    teamCount: 2,
    targetSequences: 2,
    players: [
      {
        userId: HOST_ID,
        displayName: 'Host Player',
        seatIndex: 0,
        teamIndex: 0,
        handCount: 1,
        isCurrentPlayer: true,
      },
      {
        userId: MEMBER_ID,
        displayName: 'Member Player',
        seatIndex: 1,
        teamIndex: 1,
        handCount: 1,
        isCurrentPlayer: false,
      },
    ],
    currentPlayerId: HOST_ID,
    myUserId: HOST_ID,
    myHand: [
      {
        id: '0-AS',
        code: 'AS',
        rank: 'A',
        suit: 'S',
        kind: 'normal',
        legalTargetCells: [1],
        isDead: false,
      },
    ],
    board: {
      layout,
      occupants: Array.from({ length: 100 }, () => null),
      lastChangedCell: null,
    },
    claimedSequences: [],
    sequenceCounts: [0, 0],
    deckCount: 89,
    discardCount: 0,
    deadCardExchangeUsed: false,
    canPassNoLegalMove: false,
    winnerTeamIndex: null,
    permissions: { canCancel: true },
    recentEvents: [],
    ...overrides,
  };
}

function renderGame(value = game()) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CardLinesGame game={value} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CardLinesGame', () => {
  it('has no detectable semantic accessibility violations', async () => {
    const { container } = renderGame();
    const result = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
        region: { enabled: false },
      },
    });
    expect(result.violations, JSON.stringify(result.violations, null, 2)).toHaveLength(0);
  });

  it('renders a semantic 100-cell board and supports arrow-key navigation', () => {
    renderGame();
    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(100);
    expect(screen.getByRole('button', { name: 'A of spades' })).toBeInTheDocument();

    cells[0]?.focus();
    fireEvent.keyDown(cells[0] as HTMLElement, { key: 'ArrowRight' });
    expect(cells[1]).toHaveFocus();
  });

  it('previews and explicitly confirms a legal card play', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(game({ version: 6 })));
    vi.stubGlobal('fetch', fetchMock);
    renderGame();

    fireEvent.click(screen.getByRole('button', { name: /A of spades/i }));
    fireEvent.click(screen.getByRole('gridcell', { name: /row 1, column 2.*legal target/i }));
    expect(screen.getByLabelText('Confirm move')).toHaveTextContent('Play AS on row 1, column 2?');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm move' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const call = fetchMock.mock.calls[0];
    const init = call?.[1];
    expect(init?.method).toBe('POST');
    if (typeof init?.body !== 'string') throw new Error('Expected a JSON request body.');
    const requestBody: unknown = JSON.parse(init.body);
    expect(requestBody).toMatchObject({
      type: 'PLAY_CARD',
      expectedVersion: 5,
      cardId: '0-AS',
      targetCell: 1,
    });
  });

  it('offers server-authoritative sequence alternatives and resubmits the chosen line', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: 'SEQUENCE_SELECTION_REQUIRED',
              message: 'Choose a sequence.',
              details: { alternatives: [['H:0:1'], ['V:0:1']] },
            },
          },
          { status: 422 },
        ),
      )
      .mockResolvedValueOnce(Response.json(game({ version: 6 })));
    vi.stubGlobal('fetch', fetchMock);
    renderGame();

    fireEvent.click(screen.getByRole('button', { name: /A of spades/i }));
    fireEvent.click(screen.getByRole('gridcell', { name: /row 1, column 2.*legal target/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm move' }));
    const dialog = await screen.findByRole('dialog', { name: 'Which line should count?' });
    const firstOption = screen.getByRole('button', { name: 'Option 1: 1 line' });
    const back = screen.getByRole('button', { name: 'Back to board' });
    back.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(firstOption).toHaveFocus();
    firstOption.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(back).toHaveFocus();
    fireEvent.click(firstOption);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const retryBody = fetchMock.mock.calls[1]?.[1]?.body;
    if (typeof retryBody !== 'string') throw new Error('Expected a JSON request body.');
    const parsed: unknown = JSON.parse(retryBody);
    expect(parsed).toMatchObject({ sequenceSelection: ['H:0:1'] });
  });

  it('shows dead-card exchange and pass only when the server view permits them', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(game({ version: 6 })));
    vi.stubGlobal('fetch', fetchMock);
    renderGame(
      game({
        myHand: [
          {
            id: '0-AS',
            code: 'AS',
            rank: 'A',
            suit: 'S',
            kind: 'normal',
            legalTargetCells: [],
            isDead: true,
          },
        ],
        canPassNoLegalMove: true,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /A of spades/i }));
    expect(screen.getByRole('button', { name: 'Exchange dead card' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pass — no legal move' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exchange dead card' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof body !== 'string') throw new Error('Expected a JSON request body.');
    const parsed: unknown = JSON.parse(body);
    expect(parsed).toMatchObject({ type: 'EXCHANGE_DEAD_CARD', cardId: '0-AS' });
  });

  it('replaces stale state from the server response and announces the recovery', async () => {
    const latest = game({
      version: 6,
      turnNumber: 2,
      currentPlayerId: MEMBER_ID,
      players: game().players.map((player) => ({
        ...player,
        isCurrentPlayer: player.userId === MEMBER_ID,
      })),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'STALE_GAME_VERSION',
              message: 'The game changed in another tab or device.',
              details: { latest },
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderGame();

    fireEvent.click(screen.getByRole('button', { name: 'A of spades' }));
    fireEvent.click(screen.getByRole('gridcell', { name: /row 1, column 2.*legal target/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm move' }));

    expect(
      await screen.findByText('The game changed; refreshed to the latest turn.'),
    ).toBeInTheDocument();
  });
});
