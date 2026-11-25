import { syncFamilyRoster } from './sync-family-roster.mjs';

await syncFamilyRoster({
  environment: 'staging',
  worker: 'family-game-night-api-staging',
  origin: 'https://family-game-night-api-staging.homebase-app.workers.dev',
});
