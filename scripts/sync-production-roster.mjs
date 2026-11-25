import { syncFamilyRoster } from './sync-family-roster.mjs';

await syncFamilyRoster({
  environment: 'production',
  worker: 'family-game-night-api',
  origin: 'https://familygamenight.website',
});
