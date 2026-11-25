import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const account = '4423ae7ab29989bc318c47c9a9723608';
const worker = 'family-game-night-api-staging';
const binding = 'FAMILY_ROSTER_JSON';
const itemName =
  'cloudflare/family-game-night/worker-family-game-night-api-staging.family-roster-json';
const rosterUrl = `https://${worker}.homebase-app.workers.dev/api/family/roster`;

function readVaultRoster() {
  const winget = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'bw.exe');
  const bw = process.platform === 'win32' && existsSync(winget) ? winget : 'bw';
  function run(args) {
    const result = spawnSync(bw, [...args, '--nointeraction'], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(
        'Bitwarden could not sync or read the roster Login. Check the item name and unlock the vault in this PowerShell session.',
      );
    }
    return result.stdout;
  }
  run(['sync']);
  let roster;
  try {
    const item = JSON.parse(run(['get', 'item', itemName]));
    if (item.name !== itemName || item.login?.username !== binding) {
      throw new Error(
        'Check the staging Bitwarden Login name and its FAMILY_ROSTER_JSON username.',
      );
    }
    roster = JSON.parse(item.login.password.trim());
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      throw new Error('The staging Bitwarden Login needs a JSON array in its Password field.', {
        cause: error,
      });
    }
    throw error;
  }
  if (
    !Array.isArray(roster) ||
    !roster.length ||
    roster.some(
      (name) =>
        typeof name !== 'string' || !name.length || name.length > 50 || name.trim() !== name,
    ) ||
    new Set(roster).size !== roster.length
  ) {
    throw new Error(
      'The roster must contain unique, nonempty names of up to 50 characters with no leading or trailing spaces.',
    );
  }
  return roster;
}

async function matches(roster) {
  try {
    const response = await fetch(rosterUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok && JSON.stringify(await response.json()) === JSON.stringify(roster);
  } catch {
    return false;
  }
}

async function sync() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== account || !process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error('Run Use-CF homebase in this PowerShell session first.');
  }
  const roster = readVaultRoster();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/secrets`,
    {
      method: 'PUT',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: binding, type: 'secret_text', text: JSON.stringify(roster) }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok || (await response.json().catch(() => null))?.success !== true) {
    throw new Error(
      `Cloudflare did not confirm the staging secret update (HTTP ${response.status}). Check the Worker and token permissions.`,
    );
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt) await delay(2000);
    if (await matches(roster)) {
      console.log(
        `Verified ${roster.length} staging names in Bitwarden order. Open https://${worker}.homebase-app.workers.dev/`,
      );
      return;
    }
  }
  throw new Error(
    'Cloudflare accepted the secret, but the staging roster could not be verified. Retry after the Worker update propagates.',
  );
}

sync().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Roster sync failed.');
  process.exitCode = 1;
});
