import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { Page, Route } from '@playwright/test';
import type { SequenceCardDto, SequenceGameViewDto } from '../packages/shared/src/types';

const HOST_ID = '00000000-0000-4000-8000-000000000001';
const MEMBER_ID = '00000000-0000-4000-8000-000000000002';
const GAME_ID = '00000000-0000-4000-8000-000000000003';
const AXE_PATH = resolve(process.cwd(), 'apps/web/node_modules/axe-core/axe.min.js');

interface AxeResult {
  readonly violations: readonly {
    readonly id: string;
    readonly impact: string | null;
    readonly nodes: readonly {
      readonly target: readonly string[];
      readonly failureSummary: string | undefined;
    }[];
  }[];
}

const profile = {
  id: HOST_ID,
  email: 'host@example.test',
  displayName: 'Host Player',
  role: 'admin',
  needsDisplayNameConfirmation: false,
} as const;

function lobby() {
  return {
    kind: 'lobby',
    id: GAME_ID,
    gameType: 'sequence',
    title: 'Browser Test Table',
    status: 'lobby',
    version: 1,
    hostUserId: HOST_ID,
    teamCount: 2,
    members: [
      {
        userId: HOST_ID,
        displayName: 'Host Player',
        membershipStatus: 'accepted',
        teamIndex: null,
        seatIndex: null,
        isHost: true,
      },
    ],
    invitations: [],
    seatPreview: [],
    validation: {
      valid: false,
      errors: ['Supported player counts are 2, 3, 4, 6, 8, 9, 10, and 12.'],
    },
    permissions: { canManage: true, canStart: false, canLeave: false },
    recentEvents: [],
  } as const;
}

function activeGame(afterMove = false): SequenceGameViewDto {
  const occupants: Array<0 | 1 | null> = Array.from({ length: 100 }, () => null);
  if (afterMove) occupants[1] = 0;
  return {
    kind: 'sequence',
    id: GAME_ID,
    gameType: 'sequence',
    title: 'Browser Test Table',
    hostUserId: HOST_ID,
    status: 'active',
    version: afterMove ? 6 : 5,
    turnNumber: afterMove ? 2 : 1,
    teamCount: 2,
    targetSequences: 2,
    players: [
      {
        userId: HOST_ID,
        displayName: 'Host Player',
        seatIndex: 0,
        teamIndex: 0,
        handCount: 1,
        isCurrentPlayer: !afterMove,
      },
      {
        userId: MEMBER_ID,
        displayName: 'Member Player',
        seatIndex: 1,
        teamIndex: 1,
        handCount: 1,
        isCurrentPlayer: afterMove,
      },
    ],
    currentPlayerId: afterMove ? MEMBER_ID : HOST_ID,
    myUserId: HOST_ID,
    myHand: [
      {
        id: afterMove ? 'replacement-2S' : 'host-AS',
        code: afterMove ? '2S' : 'AS',
        rank: afterMove ? '2' : 'A',
        suit: 'S',
        kind: 'normal',
        legalTargetCells: afterMove ? [] : [1],
        isDead: afterMove,
      },
    ],
    board: {
      layout: Array.from({ length: 10 }, (_, row) =>
        Array.from({ length: 10 }, (_, column) =>
          (row === 0 || row === 9) && (column === 0 || column === 9) ? 'FREE' : 'AS',
        ),
      ),
      occupants,
      lastChangedCell: afterMove ? 1 : null,
    },
    claimedSequences: [],
    sequenceCounts: [0, 0],
    deckCount: afterMove ? 88 : 89,
    discardCount: afterMove ? 1 : 0,
    deadCardExchangeUsed: false,
    canPassNoLegalMove: false,
    winnerTeamIndex: null,
    permissions: { canCancel: true },
    recentEvents: afterMove
      ? [
          {
            version: 6,
            turnNumber: 2,
            actorUserId: HOST_ID,
            actorDisplayName: 'Host Player',
            eventType: 'CARD_PLAYED',
            payload: {
              cardCode: 'AS',
              targetCell: 1,
              boardEffect: 'placed',
              claimedSequenceIds: [],
              winnerTeamIndex: null,
            },
            createdAt: '2026-09-02T12:00:00.000Z',
          },
        ]
      : [],
  } as const;
}

function gameWithCard(
  card: SequenceCardDto,
  overrides: Partial<SequenceGameViewDto> = {},
): SequenceGameViewDto {
  return { ...activeGame(), ...overrides, myHand: [card] };
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installBaseApi(page: Page, game: ReturnType<typeof lobby> | null): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/me') return fulfillJson(route, profile);
    if (path === '/api/v1/users') return fulfillJson(route, []);
    if (path === '/api/v1/invitations') return fulfillJson(route, { invitations: [] });
    if (path === '/api/v1/games' && request.method() === 'GET') {
      return fulfillJson(route, { games: [], nextCursor: null });
    }
    if (path === '/api/v1/games' && request.method() === 'POST') {
      return fulfillJson(route, lobby(), 201);
    }
    if (path === `/api/v1/games/${GAME_ID}` && game !== null) return fulfillJson(route, game);
    return fulfillJson(
      route,
      { error: { code: 'NOT_FOUND', message: 'Not found', details: {} } },
      404,
    );
  });
}

async function installCommandApi(
  page: Page,
  initial: SequenceGameViewDto,
  command: (body: unknown) => { readonly body: unknown; readonly status?: number },
): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/me') return fulfillJson(route, profile);
    if (path === `/api/v1/games/${GAME_ID}` && request.method() === 'GET') {
      return fulfillJson(route, initial);
    }
    if (path === `/api/v1/games/${GAME_ID}/commands` && request.method() === 'POST') {
      const reply = command(request.postDataJSON() as unknown);
      return fulfillJson(route, reply.body, reply.status);
    }
    if (path === '/api/v1/users') return fulfillJson(route, []);
    return fulfillJson(route, { games: [], nextCursor: null });
  });
}

async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  await page.addScriptTag({ path: AXE_PATH });
  const result = await page.evaluate(async () => {
    const axe = (
      window as typeof window & {
        axe?: { run: () => Promise<AxeResult> };
      }
    ).axe;
    if (axe === undefined) throw new Error('axe-core did not load in the browser.');
    return axe.run();
  });
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
}

test('creates a lobby through the real browser UI', async ({ page }) => {
  await installBaseApi(page, lobby());
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Game night, whenever you’re ready.' }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page);
  await page.getByRole('link', { name: 'Create game' }).click();
  await page.getByLabel('Game title').fill('Browser Test Table');
  await page.getByRole('button', { name: 'Create lobby' }).click();

  await expect(page).toHaveURL(new RegExp(`#/games/${GAME_ID}$`));
  await expect(page.getByRole('heading', { name: 'Gather players' })).toBeVisible();
  await expect(
    page.getByText('Supported player counts are 2, 3, 4, 6, 8, 9, 10, and 12.'),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page);
});

test('selects and confirms a server-authoritative move without hidden response state', async ({
  page,
  isMobile,
}) => {
  if (!isMobile) await page.setViewportSize({ width: 1100, height: 900 });
  const publicResponses: unknown[] = [activeGame(), activeGame(true)];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/me') return fulfillJson(route, profile);
    if (path === `/api/v1/games/${GAME_ID}` && request.method() === 'GET') {
      return fulfillJson(route, activeGame());
    }
    if (path === `/api/v1/games/${GAME_ID}/commands` && request.method() === 'POST') {
      expect(request.postDataJSON()).toMatchObject({
        type: 'PLAY_CARD',
        cardId: 'host-AS',
        targetCell: 1,
        expectedVersion: 5,
      });
      return fulfillJson(route, activeGame(true));
    }
    if (path === '/api/v1/users') return fulfillJson(route, []);
    return fulfillJson(route, { games: [], nextCursor: null });
  });
  await page.goto(`/#/games/${GAME_ID}`);

  const cells = page.getByRole('gridcell');
  await expect(cells).toHaveCount(100);
  await expectNoAccessibilityViolations(page);
  if (!isMobile) {
    const dimensions = await page.locator('.board-scroll').evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  }
  const legalCell = page.getByRole('gridcell', {
    name: /row 1, column 2: ace of spades, empty, legal target/i,
  });
  await page.getByRole('button', { name: 'A of spades' }).click();
  const cellBox = await legalCell.boundingBox();
  expect(cellBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(cellBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await legalCell.click();
  await expect(page.getByLabel('Confirm move')).toContainText('Play AS on row 1, column 2?');
  await page.getByRole('button', { name: 'Confirm move' }).click();

  await expect(page.getByText('Waiting on Member Player')).toBeVisible();
  await expect(page.getByRole('gridcell', { name: /gold team chip/i })).toBeVisible();
  const serializedResponses = JSON.stringify(publicResponses);
  expect(serializedResponses).not.toContain('state_json');
  expect(serializedResponses).not.toContain('command_hash');
  expect(serializedResponses).not.toContain('drawDeck');
  expect(serializedResponses).not.toContain('OPPONENT-SECRET-CARD');
});

test('shows a deterministic winning response and locks the finished table', async ({ page }) => {
  const initial = activeGame();
  const occupants: Array<0 | 1 | null> = Array.from({ length: 100 }, () => null);
  for (const cell of [1, 2, 3, 4, 5]) occupants[cell] = 0;
  const winner: SequenceGameViewDto = {
    ...initial,
    status: 'finished',
    version: 6,
    currentPlayerId: null,
    players: initial.players.map((player) => ({ ...player, isCurrentPlayer: false })),
    myHand: [],
    board: { ...initial.board, occupants, lastChangedCell: 1 },
    claimedSequences: [{ id: 'H:0:1', teamIndex: 0, cells: [1, 2, 3, 4, 5], createdTurn: 1 }],
    sequenceCounts: [2, 0],
    deckCount: 89,
    discardCount: 1,
    winnerTeamIndex: 0,
  };
  await installCommandApi(page, initial, (body) => {
    expect(body).toMatchObject({ type: 'PLAY_CARD', cardId: 'host-AS', targetCell: 1 });
    return { body: winner };
  });
  await page.goto(`/#/games/${GAME_ID}`);

  await page.getByRole('button', { name: 'A of spades' }).click();
  await page.getByRole('gridcell', { name: /row 1, column 2.*legal target/i }).click();
  await page.getByRole('button', { name: 'Confirm move' }).click();

  await expect(page.getByText('Gold team won')).toBeVisible();
  await expect(page.locator('.playing-card')).toHaveCount(0);
  await expect(page.getByRole('gridcell', { name: /protected by a sequence/i })).toHaveCount(5);
});

test('plays both Jack behaviors and exchanges a dead card', async ({ page }) => {
  const first = gameWithCard({
    id: 'host-JC',
    code: 'JC',
    rank: 'J',
    suit: 'C',
    kind: 'two-eyed-jack',
    legalTargetCells: [2],
    isDead: false,
  });
  const afterWildOccupants: Array<0 | 1 | null> = Array.from({ length: 100 }, () => null);
  afterWildOccupants[2] = 0;
  afterWildOccupants[3] = 1;
  const afterWild = gameWithCard(
    {
      id: 'host-JS',
      code: 'JS',
      rank: 'J',
      suit: 'S',
      kind: 'one-eyed-jack',
      legalTargetCells: [3],
      isDead: false,
    },
    {
      version: 6,
      board: { ...first.board, occupants: afterWildOccupants, lastChangedCell: 2 },
    },
  );
  const afterRemove = gameWithCard(
    {
      id: 'host-dead-AS',
      code: 'AS',
      rank: 'A',
      suit: 'S',
      kind: 'normal',
      legalTargetCells: [],
      isDead: true,
    },
    {
      version: 7,
      board: {
        ...first.board,
        occupants: afterWildOccupants.map((occupant, index) => (index === 3 ? null : occupant)),
        lastChangedCell: 3,
      },
    },
  );
  const afterExchange = gameWithCard(
    {
      id: 'host-2S',
      code: '2S',
      rank: '2',
      suit: 'S',
      kind: 'normal',
      legalTargetCells: [4],
      isDead: false,
    },
    { version: 8, deadCardExchangeUsed: true },
  );
  const requests: unknown[] = [];
  await installCommandApi(page, first, (body) => {
    requests.push(body);
    return {
      body: requests.length === 1 ? afterWild : requests.length === 2 ? afterRemove : afterExchange,
    };
  });
  await page.goto(`/#/games/${GAME_ID}`);

  await page.getByRole('button', { name: 'J of clubs. Wild placement' }).click();
  await page.getByRole('gridcell', { name: /row 1, column 3.*legal target/i }).click();
  await page.getByRole('button', { name: 'Confirm move' }).click();
  await expect(page.getByRole('button', { name: 'J of spades. Remove opponent' })).toBeVisible();

  await page.getByRole('button', { name: 'J of spades. Remove opponent' }).click();
  await page
    .getByRole('gridcell', { name: /row 1, column 4.*teal team chip.*legal target/i })
    .click();
  await page.getByRole('button', { name: 'Confirm move' }).click();
  await expect(page.getByRole('button', { name: 'A of spades. Dead card' })).toBeVisible();

  await page.getByRole('button', { name: 'A of spades. Dead card' }).click();
  await page.getByRole('button', { name: 'Exchange dead card' }).click();
  await expect(page.getByText('Dead card exchanged. It is still your turn.')).toBeVisible();
  expect(requests).toHaveLength(3);
  expect(requests[0]).toMatchObject({ type: 'PLAY_CARD', cardId: 'host-JC', targetCell: 2 });
  expect(requests[1]).toMatchObject({ type: 'PLAY_CARD', cardId: 'host-JS', targetCell: 3 });
  expect(requests[2]).toMatchObject({ type: 'EXCHANGE_DEAD_CARD', cardId: 'host-dead-AS' });
});

test('recovers a stale tab directly from the authoritative conflict response', async ({ page }) => {
  const initial = activeGame();
  const latest: SequenceGameViewDto = {
    ...activeGame(true),
    version: 9,
    turnNumber: 4,
  };
  await installCommandApi(page, initial, (body) => {
    expect(body).toMatchObject({ expectedVersion: 5 });
    return {
      status: 409,
      body: {
        error: {
          code: 'STALE_GAME_VERSION',
          message: 'The game changed in another tab or device.',
          details: { latest },
        },
      },
    };
  });
  await page.goto(`/#/games/${GAME_ID}`);

  await page.getByRole('button', { name: 'A of spades' }).click();
  await page.getByRole('gridcell', { name: /row 1, column 2.*legal target/i }).click();
  await page.getByRole('button', { name: 'Confirm move' }).click();

  await expect(page.getByText('The game changed; refreshed to the latest turn.')).toBeVisible();
  await expect(page.getByText('Waiting on Member Player')).toBeVisible();
  await expect(page.getByText('Turn 4')).toBeVisible();
});

test('resubmits the exact line chosen in an ambiguous sequence dialog', async ({ page }) => {
  const initial = activeGame();
  let attempts = 0;
  await installCommandApi(page, initial, (body) => {
    attempts += 1;
    if (attempts === 1) {
      return {
        status: 422,
        body: {
          error: {
            code: 'SEQUENCE_SELECTION_REQUIRED',
            message: 'Choose which completed line should count.',
            details: { alternatives: [['H:0:1'], ['V:0:1']] },
          },
        },
      };
    }
    expect(body).toMatchObject({ sequenceSelection: ['H:0:1'] });
    return { body: activeGame(true) };
  });
  await page.goto(`/#/games/${GAME_ID}`);

  await page.getByRole('button', { name: 'A of spades' }).click();
  await page.getByRole('gridcell', { name: /row 1, column 2.*legal target/i }).click();
  await page.getByRole('button', { name: 'Confirm move' }).click();
  const dialog = page.getByRole('dialog', { name: 'Which line should count?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Option 1: 1 line' }).click();

  await expect(page.getByText('Move accepted. The latest turn is now shown.')).toBeVisible();
  expect(attempts).toBe(2);
});
