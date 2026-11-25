import { devices, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { FamilyTableDetail } from '../packages/shared/src';
import { createApp } from '../apps/worker/src/app';
import { sweepTables } from '../apps/worker/src/family/tables';
import { createD1Harness } from '../apps/worker/test/d1-harness';
import { testRoster } from '../apps/worker/test/family-roster-fixture';

function familySession(origin: string, db: D1Database) {
  const random = { randomInt: () => 0, shuffle: <T>(items: readonly T[]) => items.slice() };
  const app = createApp({ random });
  const env = {
    ENVIRONMENT: 'production',
    FAMILY_ROSTER_JSON: JSON.stringify(testRoster),
    DB: db,
    APP_ORIGIN: origin,
  };
  async function arrive(p: Page, path: string, name: string) {
    await p.route('**/api/family/**', async (route) => {
      const request = route.request(),
        body = request.postData();
      const res = await app.request(
        request.url(),
        {
          method: request.method(),
          headers: request.headers(),
          ...(body === null ? {} : { body }),
        },
        env,
      );
      await route.fulfill({
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body: await res.text(),
      });
    });
    await p.goto(path);
    await p.getByLabel('Your name').selectOption(name);
    await p.getByRole('button', { name: 'Confirm name' }).click();
  }
  return arrive;
}
test('four family members start an invited Euchre table, play a hand and resume on another device', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const harness = await createD1Harness(),
    origin = baseURL!;
  const arrive = familySession(origin, harness.db);
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () =>
      browser.newContext(
        devices[test.info().project.name.includes('mobile') ? 'Pixel 7' : 'Desktop Chrome'],
      ),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [host, testPlayerB, testPlayerC, testPlayerAA, second] = pages as [
    Page,
    Page,
    Page,
    Page,
    Page,
  ];
  try {
    const link = origin + '/';
    await arrive(host, link, 'TestPlayerA');
    await host
      .getByRole('article')
      .filter({ has: host.getByRole('heading', { name: 'Euchre', exact: true }) })
      .getByRole('link', { name: 'Lobbies' })
      .click();
    await host.getByRole('link', { name: 'Create lobby' }).click();
    await host.getByLabel('Who can join?').selectOption('invite');
    for (const name of ['TestPlayerB', 'TestPlayerC', 'TestPlayerAA'])
      await host.getByRole('checkbox', { name, exact: true }).check();
    await host.getByLabel('Start policy').selectOption('host');
    await host.getByRole('button', { name: 'Create lobby' }).click();
    await expect(host.getByRole('button', { name: 'Start game' })).toBeDisabled();
    const tableUrl = host.url();
    for (const [p, name] of [
      [testPlayerB, 'TestPlayerB'],
      [testPlayerC, 'TestPlayerC'],
      [testPlayerAA, 'TestPlayerAA'],
    ] as const) {
      await arrive(p, link, name);
      await p.getByRole('link', { name: 'Lobbies · 1 invited' }).click();
      await p.getByRole('link', { name: 'TestPlayerA’s Euchre table' }).click();
      await p.getByRole('button', { name: 'Accept invitation' }).click();
      await expect(p.getByRole('button', { name: 'Accept invitation' })).toHaveCount(0);
    }
    await host.reload();
    await host.getByRole('button', { name: 'Start game' }).click();
    await expect(host.getByText('Waiting on TestPlayerB', { exact: true })).toBeVisible();
    // Existing bookmarked invitations still arrive at the same table with a clean URL.
    await second.addInitScript(() => localStorage.setItem('family-game-night.link', 'obsolete'));
    await arrive(second, tableUrl + '?family=obsolete', 'TestPlayerB');
    await expect(second).toHaveURL(tableUrl);
    expect(await second.evaluate(() => localStorage.getItem('family-game-night.link'))).toBeNull();
    await expect(second.getByText('Your turn', { exact: true })).toBeVisible();
    await second
      .getByRole('button', { name: /^Call .* with partner/ })
      .first()
      .click();
    await expect(second.getByText('Waiting on TestPlayerA', { exact: true })).toBeVisible();
    await host.reload();
    await host
      .getByRole('button', { name: /^Discard / })
      .first()
      .click();
    const seats = [host, second, testPlayerC, testPlayerAA];
    const names = ['TestPlayerA', 'TestPlayerB', 'TestPlayerC', 'TestPlayerAA'];
    let actor = 1;
    for (let i = 0; i < 20; i++) {
      const p = seats[actor]!;
      await p.bringToFront();
      await p.reload({ waitUntil: 'domcontentloaded' });
      const updated = p.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/api/family/tables/'),
      );
      await p
        .getByRole('button', { name: /^Play / })
        .first()
        .click();
      const result = await updated;
      expect(result.ok()).toBe(true);
      if (i < 19) {
        const next = (await result.json()) as FamilyTableDetail;
        actor = names.indexOf(next.turn!);
        expect(actor).toBeGreaterThanOrEqual(0);
      }
    }
    await testPlayerB.reload();
    await expect(testPlayerB.getByText(/^Hand 2 · Bidding/)).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await harness.dispose();
  }
});

test('an open Phase Rummy lobby deals automatically and a timer hands play back to the host', async ({
  page,
  browser,
  baseURL,
}) => {
  const harness = await createD1Harness(),
    origin = baseURL!;
  const arrive = familySession(origin, harness.db);
  const guestContext = await browser.newContext(
    devices[test.info().project.name.includes('mobile') ? 'Pixel 7' : 'Desktop Chrome'],
  );
  const guest = await guestContext.newPage();
  try {
    const link = origin + '/';
    await arrive(page, link, 'TestPlayerA');
    const tile = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Phase Rummy', exact: true }) });
    await tile.getByRole('link', { name: 'Lobbies' }).click();
    await page.getByRole('link', { name: 'Create lobby' }).click();
    await page.getByLabel('Table name (optional)').fill('Sunday game');
    await page.getByLabel('Turn timer').selectOption('1');
    await page.getByRole('button', { name: 'Create lobby' }).click();
    await expect(page.getByRole('heading', { name: 'Sunday game' })).toBeVisible();
    const id = page.url().split('/table/')[1]!;
    await page.getByRole('button', { name: 'Share table link' }).click();
    const shareLink = page.getByLabel('Table link');
    await expect(shareLink).toHaveValue(origin + '/#/table/' + id);
    await arrive(guest, await shareLink.inputValue(), 'TestPlayerB');
    await guest.getByRole('button', { name: 'Join table' }).click();
    await expect(guest.getByText('Waiting on TestPlayerA', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Family Game Night' }).click();
    await tile.getByRole('link', { name: 'My Games · 1 your turn' }).click();
    await page.getByRole('link', { name: 'Sunday game' }).click();
    await page.getByRole('button', { name: 'Draw from stock' }).click();
    await page
      .getByRole('button', { name: /^Discard / })
      .first()
      .click();
    await expect(page.getByText('Waiting on TestPlayerB', { exact: true })).toBeVisible();
    await harness.db.prepare('UPDATE family_tables SET due=0 WHERE id=?').bind(id).run();
    await sweepTables(harness.db, {
      now: Date.now,
      random: { randomInt: () => 0, shuffle: <T>(xs: readonly T[]) => xs.slice() },
    });
    await page.reload();
    await expect(page.getByText('Your turn', { exact: true })).toBeVisible();
    await expect(page.getByText(/TestPlayerB ran out of time/)).toBeVisible();
  } finally {
    await guestContext.close();
    await harness.dispose();
  }
});
