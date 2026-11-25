import { CryptoRandomSource } from '@family-game-night/sequence-engine';
import { app } from './app';
import { sweepTables } from './family/tables';
import type { WorkerBindings } from './env';

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: WorkerBindings) {
    await sweepTables(env.DB, { random: new CryptoRandomSource(), now: Date.now });
  },
};
