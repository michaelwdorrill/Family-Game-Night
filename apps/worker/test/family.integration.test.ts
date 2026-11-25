import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { createApp } from '../src/app';
import { SeededRandomSource } from '../../../packages/sequence-engine/test/seeded-random';
import { act, getTable, sweepTables } from '../src/family/tables';
import { createD1Harness } from './d1-harness';
import { testRoster } from './family-roster-fixture';
import type { FamilyTableDetail, FamilyTable, TableSettings } from '@family-game-night/shared';
import type { WorkerBindings } from '../src/env';

const origin = 'https://game.example';
const random = { randomInt: () => 0, shuffle: <T>(items: readonly T[]) => items.slice() };
let now = 1000;
const clock = { random, now: () => now };
const app = createApp({ random, now: () => new Date(now) });
let db: D1Database, dispose: () => Promise<void>;
let env: WorkerBindings;
async function request(path: string, name: string, payload?: unknown, bindings = env) {
  return app.request(
    origin + '/api/family/' + path,
    {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-Family-Player': name,
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    },
    bindings,
  );
}
async function read<T>(response: Promise<Response>) {
  const res = await response;
  expect(res.ok).toBe(true);
  return (await res.json()) as T;
}
const table = (id: string, name: string) => read<FamilyTableDetail>(request('tables/' + id, name));
const action = (t: FamilyTableDetail, name: string, extra: Record<string, unknown>) =>
  request('tables/' + t.id, name, { version: t.version, ...extra });
const create = (game: TableSettings['game'], options: Partial<TableSettings> = {}) =>
  read<FamilyTableDetail>(
    request('tables', 'TestPlayerA', {
      game,
      capacity: game === 'euchre' ? 4 : 2,
      timerDays: 1,
      visibility: 'open',
      startMode: 'auto',
      invitees: [],
      ...options,
    }),
  );
beforeAll(async () => {
  ({ db, dispose } = await createD1Harness());
  env = {
    DB: db,
    ENVIRONMENT: 'production',
    APP_ORIGIN: origin,
    FAMILY_ROSTER_JSON: JSON.stringify(testRoster),
  };
});
afterAll(async () => {
  await dispose();
});
describe('family tables', () => {
  it('serves the roster at first visit and requires a known name and same-origin writes', async () => {
    expect((await request('roster', '', '')).status).toBe(404);
    const response = await app.request(origin + '/api/family/roster', {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual(testRoster);
    expect((await request('tables', 'Visitor')).status).toBe(401);
    expect(
      (
        await app.request(
          origin + '/api/family/tables',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Family-Player': 'TestPlayerB',
            },
            body: '{}',
          },
          env,
        )
      ).status,
    ).toBe(403);
  });
  it.each([undefined, 'not-json', '[]', '["TestPlayerA","TestPlayerA"]'])(
    'fails closed for missing or invalid roster configuration: %s',
    async (rosterJson) => {
      const plainBindings = { ...env };
      delete (plainBindings as { FAMILY_ROSTER_JSON?: string }).FAMILY_ROSTER_JSON;
      const bindings =
        rosterJson === undefined
          ? plainBindings
          : { ...plainBindings, FAMILY_ROSTER_JSON: rosterJson };
      const response = await request('roster', '', undefined, bindings);
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({
        error: { code: 'FAMILY_UNAVAILABLE', details: {} },
      });
    },
  );
  it('keeps invited lobbies private, replaces a declined invitation, and lets only the host start a full table', async () => {
    let t = await create('lantern', {
      visibility: 'invite',
      invitees: ['TestPlayerB'],
      startMode: 'host',
      timerDays: 7,
    });
    const list = (name: string) => read<FamilyTable[]>(request('tables', name));
    expect((await list('TestPlayerB')).find((row) => row.id === t.id)?.invited).toBe(true);
    expect((await list('TestPlayerAA')).some((row) => row.id === t.id)).toBe(false);
    expect((await request('tables/' + t.id, 'TestPlayerAA')).status).toBe(404);
    expect((await action(t, 'TestPlayerA', { type: 'start' })).status).toBe(422);
    expect(await read<null>(action(t, 'TestPlayerB', { type: 'decline' }))).toBeNull();
    t = await table(t.id, 'TestPlayerA');
    t = await read(action(t, 'TestPlayerA', { type: 'invite', name: 'TestPlayerAA' }));
    t = await read(action(t, 'TestPlayerAA', { type: 'join' }));
    expect(t.status).toBe('lobby');
    expect(t.players).toEqual(['TestPlayerA', 'TestPlayerAA']);
    expect((await action(t, 'TestPlayerAA', { type: 'start' })).status).toBe(422);
    t = await read(action(t, 'TestPlayerA', { type: 'start' }));
    expect(t.status).toBe('active');
    expect(t.due).toBe(now + 7 * 86400000);
    expect(t.play?.hand).toHaveLength(6);
    expect((await table(t.id, 'TestPlayerAA')).play?.hand).not.toEqual(t.play?.hand);
  });
  it('handles a retried creation and validates the selected team count', async () => {
    const id = crypto.randomUUID();
    const settings = {
      game: 'lines',
      capacity: 6,
      teams: 3,
      visibility: 'open',
      invitees: [],
      timerDays: 3,
      startMode: 'auto',
    };
    async function createOnce() {
      return await app.request(
        origin + '/api/family/tables',
        {
          method: 'POST',
          headers: {
            Origin: origin,
            'Content-Type': 'application/json',
            'X-Family-Player': 'TestPlayerA',
            'Idempotency-Key': id,
          },
          body: JSON.stringify(settings),
        },
        env,
      );
    }
    const [a, b] = await Promise.all([
      read<FamilyTableDetail>(createOnce()),
      read<FamilyTableDetail>(createOnce()),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.teams).toBe(3);
    expect((await request('tables', 'TestPlayerA', { ...settings, capacity: 4 })).status).toBe(422);
  });
  it('advances a closed table from the Worker scheduled handler and preserves a future deadline', async () => {
    const lobby = await create('lantern');
    const t = await read<FamilyTableDetail>(action(lobby, 'TestPlayerB', { type: 'join' }));
    const scheduled = { cron: '* * * * *', scheduledTime: Date.now(), noRetry() {} };
    await worker.scheduled(scheduled, env);
    const stored = () =>
      db
        .prepare('SELECT version,due FROM family_tables WHERE id=?')
        .bind(t.id)
        .first<{ version: number; due: number }>();
    const after = await stored();
    expect(after?.version).toBe(t.version + 1);
    expect(after!.due).toBeGreaterThan(Date.now());
    await worker.scheduled(scheduled, env);
    expect(await stored()).toEqual(after);
  });
  it('awards the last open seat once, auto-deals, and rejects a repeated move', async () => {
    const lobby = await create('lines');
    const responses = await Promise.all(
      ['TestPlayerB', 'TestPlayerAA'].map((p) => action(lobby, p, { type: 'join' })),
    );
    expect(responses.filter((r) => r.ok)).toHaveLength(1);
    let t = await table(lobby.id, 'TestPlayerA');
    expect(t.status).toBe('active');
    expect(t.version).toBe(2);
    const name = t.turn!;
    t = await table(t.id, name);
    const stale = () => action(t, name, { type: 'move', index: 0 });
    const first = await read<FamilyTableDetail>(stale());
    expect(first.version).toBe(3);
    expect((await stale()).status).toBe(409);
  });
  it.each(['phase', 'euchre'] as const)(
    'saves and resumes a complete %s match through its winning move',
    async (game) => {
      const rng = new SeededRandomSource(521);
      const live = { random: rng, now: () => now };
      let t = await create(game);
      for (const p of ['TestPlayerB', 'TestPlayerAA', 'TestPlayerC'].slice(0, t.capacity - 1))
        t = (await act(db, t.id, p, { type: 'join', version: t.version }, live, testRoster))!;
      for (let n = 0; n < 10000 && t.turn; n++) {
        const name = t.turn;
        t = await getTable(db, t.id, name, live);
        const moves = t.play!.moves;
        const pref = moves.map((m) =>
          m.label.startsWith('Lay ') || m.label.startsWith('Add ') || m.label.startsWith('Call ')
            ? 3
            : m.label === 'Draw from stock'
              ? 2
              : 1,
        );
        const max = Math.max(...pref);
        const indexes = pref.flatMap((v, i) => (v === max ? [i] : []));
        const index = indexes[rng.randomInt(indexes.length)]!;
        t = (await act(
          db,
          t.id,
          name,
          { version: t.version, type: 'move', index },
          live,
          testRoster,
        ))!;
      }
      const final = await table(t.id, 'TestPlayerB');
      expect(final.status).toBe('finished');
      expect(final.due).toBeNull();
      expect(final.turn).toBeNull();
      expect(final.summary).toMatch(/won/);
      expect(final.play?.moves).toEqual([]);
    },
    60_000,
  );
  it.each(['lantern', 'phase', 'euchre', 'lines'] as const)(
    '%s times out exactly once even when a player races two cron deliveries',
    async (game) => {
      now += 8 * 86400000;
      let t = await create(game);
      for (const p of ['TestPlayerB', 'TestPlayerAA', 'TestPlayerC'].slice(0, t.capacity - 1))
        t = await read(action(t, p, { type: 'join' }));
      const actor = t.turn!;
      if (game === 'lantern' || game === 'phase') {
        const due = t.due;
        now += 1234;
        t = await read(action(t, actor, { type: 'move', index: 0 }));
        expect(t.due).toBe(due);
        expect(t.turn).toBe(actor);
      }
      const version = t.version;
      now = t.due!;
      const [late] = await Promise.all([
        action(t, actor, { type: 'move', index: 0 }),
        sweepTables(db, clock),
        sweepTables(db, clock),
      ]);
      expect(late.status).toBe(409);
      const latest = await table(t.id, actor);
      expect(latest.version).toBe(version + 1);
      expect(latest.due).toBe(now + 86400000);
      expect(latest.lastTimeout).toContain(actor);
      expect(latest.turn).not.toBe(actor);
    },
  );
});
