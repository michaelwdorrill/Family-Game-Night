import { z } from 'zod';
import { Hono } from 'hono';
import { familyAction, tableSettings } from '@family-game-night/shared';
import type { WorkerEnvironment } from '../env';
import { ApiError } from '../errors';
import { parseJson, requireSafeMutation } from '../request';
import { roster } from './roster';
import { act, getTable, listTables, newTable } from './tables';
import type { TableClock } from './tables';

export function familyRoutes(clock: TableClock, createId: () => string) {
  const app = new Hono<WorkerEnvironment>();
  app.use('*', async (c, next) => {
    const key = c.env.FAMILY_LINK_KEY;
    if (!key || c.req.header('X-Family-Link') !== key)
      throw new ApiError(401, 'FAMILY_LINK_REQUIRED', 'Open the current shared family link.');
    if (c.req.method === 'POST')
      requireSafeMutation({
        appOrigin: c.env.APP_ORIGIN ?? new URL(c.req.url).origin,
        origin: c.req.header('Origin'),
        contentType: c.req.header('Content-Type'),
        contentLength: c.req.header('Content-Length'),
      });
    if (c.req.path !== '/api/family/roster') {
      const name = c.req.header('X-Family-Player');
      if (!name || !roster.includes(name))
        throw new ApiError(401, 'SELECT_PLAYER', 'Select your name first.');
      c.set('familyName', name);
    }
    await next();
  });
  app.get('/roster', (c) => c.json(roster));
  app.get('/tables', async (c) => c.json(await listTables(c.env.DB, c.get('familyName'))));
  app.post('/tables', async (c) => {
    const id = c.req.header('Idempotency-Key') ?? createId();
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, 'INVALID_REQUEST', 'Invalid table creation ID.');
    return c.json(
      await newTable(c.env.DB, id, c.get('familyName'), await parseJson(c, tableSettings)),
      201,
    );
  });
  app.get('/tables/:id', async (c) =>
    c.json(await getTable(c.env.DB, c.req.param('id'), c.get('familyName'), clock)),
  );
  app.post('/tables/:id', async (c) =>
    c.json(
      await act(
        c.env.DB,
        c.req.param('id'),
        c.get('familyName'),
        await parseJson(c, familyAction),
        clock,
      ),
    ),
  );
  return app;
}
