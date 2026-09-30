import { expect, test } from '@playwright/test';

import { createApp } from '../apps/worker/src/app';
import { createD1Harness } from '../apps/worker/test/d1-harness';

import type { Page, Route } from '@playwright/test';
import type { RandomSource, SequenceGameState } from '../packages/sequence-engine/src/types';
import type { WorkerBindings } from '../apps/worker/src/env';

const APP_ORIGIN = 'http://127.0.0.1:4173';
const HOST_EMAIL = 'host@example.test';
const MEMBER_EMAIL = 'member@example.test';

interface ApiCapture {
  readonly activeGameResponses: string[];
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}

const deterministicRandom: RandomSource = {
  randomInt: () => 0,
  shuffle: <T>(items: readonly T[]) => items.slice(),
};

function bindings(db: D1Database, email: string): WorkerBindings {
  return {
    DB: db,
    ENVIRONMENT: 'test',
    DEV_AUTH_EMAIL: email,
    ADMIN_EMAIL: HOST_EMAIL,
    APP_ORIGIN,
  };
}

async function proxyApi(
  route: Route,
  app: ReturnType<typeof createApp>,
  env: WorkerBindings,
  capture: ApiCapture,
): Promise<void> {
  const browserRequest = route.request();
  const browserUrl = new URL(browserRequest.url());
  const requestHeaders = new Headers(browserRequest.headers());
  const postData = browserRequest.postData();
  const response = await app.request(
    `${APP_ORIGIN}${browserUrl.pathname}${browserUrl.search}`,
    {
      method: browserRequest.method(),
      headers: requestHeaders,
      ...(postData === null ? {} : { body: postData }),
    },
    env,
  );
  const body = await response.text();
  if (response.ok && body.includes('"kind":"sequence"')) {
    capture.activeGameResponses.push(body);
  }
  await route.fulfill({
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  });
}

async function installRealApi(
  page: Page,
  app: ReturnType<typeof createApp>,
  db: D1Database,
  email: string,
): Promise<ApiCapture> {
  const capture: ApiCapture = { activeGameResponses: [] };
  await page.route('**/api/v1/**', (route) => proxyApi(route, app, bindings(db, email), capture));
  return capture;
}

async function confirmDisplayName(page: Page, name: string): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'What should the family call you?' }),
  ).toBeVisible();
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: 'Join game night' }).click();
  await expect(
    page.getByRole('heading', { name: 'Game night, whenever you’re ready.' }),
  ).toBeVisible();
}

async function selectPlayableCard(page: Page): Promise<void> {
  const cards = page.locator('.playing-card');
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    await cards.nth(index).click();
    if ((await page.locator('[role="gridcell"][aria-disabled="false"]').count()) > 0) return;
  }
  throw new Error('The current player did not receive a card with a legal target.');
}

async function storedGame(db: D1Database, gameId: string): Promise<SequenceGameState> {
  const row = await db
    .prepare('SELECT state_json FROM games WHERE id = ?')
    .bind(gameId)
    .first<{ readonly state_json: string }>();
  if (row === null) throw new Error('The browser-created game was not persisted.');
  return JSON.parse(row.state_json) as SequenceGameState;
}

test('two browsers complete a private D1-backed turn and resume the latest state', async ({
  page,
  context,
}) => {
  test.setTimeout(45_000);
  const harness = await createD1Harness();
  let idCounter = 500;
  let timeCounter = 0;
  const app = createApp({
    createId: () => uuid(idCounter++),
    now: () => new Date(Date.parse('2026-09-02T16:00:00.000Z') + timeCounter++ * 1_000),
    random: deterministicRandom,
  });

  try {
    const hostCapture = await installRealApi(page, app, harness.db, HOST_EMAIL);
    await page.goto('/');
    await confirmDisplayName(page, 'Host Player');

    await page.getByRole('link', { name: 'Create game' }).click();
    await page.getByLabel('Game title').fill('Real D1 Browser Table');
    await page.getByRole('button', { name: 'Create lobby' }).click();
    await expect(page.getByRole('heading', { name: 'Gather players' })).toBeVisible();
    const gameId = page.url().split('#/games/')[1];
    if (gameId === undefined || gameId.length === 0) {
      throw new Error('The game URL did not contain a game ID.');
    }

    await page.getByLabel('Approved email').fill(MEMBER_EMAIL);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(MEMBER_EMAIL)).toBeVisible();

    const memberPage = await context.newPage();
    const memberCapture = await installRealApi(memberPage, app, harness.db, MEMBER_EMAIL);
    await memberPage.goto('/');
    await confirmDisplayName(memberPage, 'Member Player');
    await expect(memberPage.getByText('Real D1 Browser Table')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Accept' }).click();
    await expect(memberPage.getByRole('heading', { name: 'Gather players' })).toBeVisible();

    await page.reload();
    await expect(page.locator('.member-list').getByText('Member Player')).toBeVisible();
    const teamSelectors = page.locator('.team-assignment select');
    await expect(teamSelectors).toHaveCount(2);
    await teamSelectors.nth(0).selectOption('0');
    await teamSelectors.nth(1).selectOption('1');
    await page.getByRole('button', { name: 'Save teams' }).click();
    await expect(page.getByRole('button', { name: 'Start game' })).toBeEnabled();
    await page.getByRole('button', { name: 'Start game' }).click();
    await expect(page.getByText('Waiting on Member Player')).toBeVisible();

    await memberPage.reload();
    await expect(memberPage.getByText('Your turn')).toBeVisible();
    await expect(memberPage.getByRole('gridcell')).toHaveCount(100);
    await selectPlayableCard(memberPage);
    const legalTarget = memberPage.locator('[role="gridcell"][aria-disabled="false"]').first();
    await legalTarget.click();
    await expect(memberPage.getByLabel('Confirm move')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Confirm move' }).click();
    await expect(memberPage.getByText('Waiting on Host Player')).toBeVisible();
    await expect(
      memberPage.getByText('Move accepted. The latest turn is now shown.'),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByText('Your turn')).toBeVisible();
    await expect(page.getByRole('gridcell', { name: /team chip/i })).toHaveCount(1);
    await memberPage.reload();
    await expect(memberPage.getByText('Waiting on Host Player')).toBeVisible();

    const state = await storedGame(harness.db, gameId);
    const hostUserId = state.players.find((player) => player.seatIndex === 0)?.userId;
    const memberUserId = state.players.find((player) => player.seatIndex === 1)?.userId;
    const hostPrivateIds = state.players
      .find((player) => player.userId === hostUserId)
      ?.hand.map((card) => card.id);
    const memberPrivateIds = state.players
      .find((player) => player.userId === memberUserId)
      ?.hand.map((card) => card.id);
    if (hostPrivateIds === undefined || memberPrivateIds === undefined) {
      throw new Error('The persisted private hands were not available for the leakage assertion.');
    }
    const hostResponses = hostCapture.activeGameResponses.join('\n');
    const memberResponses = memberCapture.activeGameResponses.join('\n');
    for (const cardId of memberPrivateIds) expect(hostResponses).not.toContain(cardId);
    for (const cardId of hostPrivateIds) expect(memberResponses).not.toContain(cardId);
    expect(hostResponses).not.toContain('state_json');
    expect(memberResponses).not.toContain('state_json');
  } finally {
    await harness.dispose();
  }
});
