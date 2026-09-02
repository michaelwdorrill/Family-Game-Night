import { Hono } from 'hono';

import type { HealthResponse } from '@family-game-night/shared';

import type { WorkerEnvironment } from './env';

export const app = new Hono<WorkerEnvironment>();

app.get('/api/v1/health', (context) => {
  const response: HealthResponse = {
    ok: true,
    service: 'family-game-night-api',
  };

  return context.json(response, 200, {
    'Cache-Control': 'no-store',
  });
});

app.notFound((context) =>
  context.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint was not found.',
        details: {},
      },
    },
    404,
  ),
);
