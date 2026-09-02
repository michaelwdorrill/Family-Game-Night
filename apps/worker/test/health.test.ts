import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from '@family-game-night/shared';

import { app } from '../src/app';

describe('health route', () => {
  it('returns a no-store health response', async () => {
    const response = await app.request('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      ok: true,
      service: 'family-game-night-api',
    });
  });
});
