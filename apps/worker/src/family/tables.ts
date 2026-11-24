import { familyGames } from '@family-game-night/shared';
import type {
  FamilyAction,
  FamilyTable,
  FamilyTableDetail,
  TableSettings,
} from '@family-game-night/shared';
import type { RandomSource } from '@family-game-night/sequence-engine';
import { ApiError } from '../errors';
import { activeSeat, deal, matchSummary, playerView, playMove, turnChanged } from './play';
import type { Match } from './play';
import { roster } from './roster';

interface Metadata extends Omit<FamilyTable, 'id' | 'version' | 'due' | 'invited'> {
  invitees: string[];
}
interface Row {
  id: string;
  version: number;
  due: number | null;
  metadata: string;
  state: string | null;
}
interface Table {
  id: string;
  version: number;
  due: number | null;
  meta: Metadata;
  match: Match | null;
}
export interface TableClock {
  random: RandomSource;
  now: () => number;
}
const day = 86_400_000;
const missing = () =>
  new ApiError(404, 'NOT_FOUND', 'This table is unavailable for the selected player.');
const conflict = () =>
  new ApiError(409, 'TABLE_CHANGED', 'The table changed. Check the latest turn.');
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ApiError(422, 'INVALID_ACTION', message);
}
function fromRow(row: Row): Table {
  return {
    ...row,
    meta: JSON.parse(row.metadata) as Metadata,
    match: row.state ? (JSON.parse(row.state) as Match) : null,
  };
}
function summary(t: Table, name: string): FamilyTable {
  const { invitees, ...publicFields } = t.meta;
  return {
    ...publicFields,
    id: t.id,
    version: t.version,
    due: t.due,
    invited: invitees.includes(name),
  };
}
function detail(t: Table, name: string): FamilyTableDetail {
  const seat = t.meta.players.indexOf(name);
  return {
    ...summary(t, name),
    pending: name === t.meta.host ? t.meta.invitees : [],
    play: t.match && seat >= 0 ? playerView(t.match, t.meta.players, seat) : null,
  };
}
function visible(m: Metadata, name: string) {
  return (
    m.players.includes(name) ||
    (m.status === 'lobby' &&
      m.players.length < m.capacity &&
      (m.visibility === 'open' || m.invitees.includes(name)))
  );
}
function updateMatch(t: Table, match: Match, reset: boolean, now: number) {
  t.match = match;
  const seat = activeSeat(match);
  t.meta.status = seat === null ? 'finished' : 'active';
  t.meta.turn = seat === null ? null : t.meta.players[seat]!;
  t.meta.summary = matchSummary(match, t.meta.players);
  if (seat === null) t.due = null;
  else if (reset) t.due = now + t.meta.timerDays * day;
}
function start(t: Table, clock: TableClock) {
  check(t.meta.players.length === t.meta.capacity, 'Fill every seat before starting.');
  t.meta.invitees = [];
  updateMatch(t, deal(t.meta.game, t.meta.players, clock.random, t.meta.teams), true, clock.now());
}
async function write(db: D1Database, t: Table, latestAllowedTime?: number) {
  const changed = await db
    .prepare(
      `UPDATE family_tables SET metadata=?, state=?, due=?, version=version+1
    WHERE id=? AND version=? AND (? IS NULL OR due > ?)`,
    )
    .bind(
      JSON.stringify(t.meta),
      t.match && JSON.stringify(t.match),
      t.due,
      t.id,
      t.version,
      latestAllowedTime ?? null,
      latestAllowedTime ?? null,
    )
    .run();
  if (!changed.meta.changes) throw conflict();
  t.version++;
}
async function load(db: D1Database, id: string) {
  const row = await db.prepare('SELECT * FROM family_tables WHERE id=?').bind(id).first<Row>();
  if (!row) throw missing();
  return fromRow(row);
}
async function expire(db: D1Database, t: Table, clock: TableClock) {
  const now = clock.now();
  if (!t.match || t.due === null || t.due > now) return false;
  const seat = activeSeat(t.match);
  if (seat === null) return false;
  let match = t.match;
  // An expired rummy turn can require drawing, banking and discarding.
  // Commit the whole turn in one version so other clients never see it halfway through.
  for (;;) {
    const next = playMove(match, t.meta.players, seat, 'random', clock.random);
    const done = turnChanged(match, next);
    match = next;
    if (done) break;
  }
  t.meta.lastTimeout = `${t.meta.players[seat] ?? 'Player'} ran out of time. An automatic turn was played.`;
  updateMatch(t, match, true, now);
  await write(db, t);
  return true;
}
export async function sweepTables(db: D1Database, clock: TableClock) {
  const { results } = await db
    .prepare('SELECT * FROM family_tables WHERE due <= ? ORDER BY due LIMIT 25')
    .bind(clock.now())
    .all<Row>();
  const failures = [];
  for (const row of results) {
    try {
      await expire(db, fromRow(row), clock);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) failures.push(row.id);
    }
  }
  if (failures.length) throw new Error(`Timeout processing failed for ${failures.join(', ')}`);
}
export async function getTable(db: D1Database, id: string, name: string, clock: TableClock) {
  let t = await load(db, id);
  if (!visible(t.meta, name)) throw missing();
  try {
    await expire(db, t, clock);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 409)) throw e;
    t = await load(db, id);
  }
  return detail(t, name);
}
export async function listTables(db: D1Database, name: string) {
  const { results } = await db
    .prepare(
      `SELECT id,version,metadata,due,NULL AS state FROM family_tables
    WHERE EXISTS (SELECT 1 FROM json_each(metadata,'$.players') WHERE value=?)
    OR (json_extract(metadata,'$.status')='lobby' AND json_array_length(metadata,'$.players') < json_extract(metadata,'$.capacity')
    AND (json_extract(metadata,'$.visibility')='open' OR EXISTS (SELECT 1 FROM json_each(metadata,'$.invitees') WHERE value=?)))
    ORDER BY rowid DESC`,
    )
    .bind(name, name)
    .all<Row>();
  return results.map((r) => summary(fromRow(r), name));
}
export async function newTable(db: D1Database, id: string, name: string, settings: TableSettings) {
  const { invitees, capacity, visibility, game } = settings;
  check(
    (familyGames[game].counts as readonly number[]).includes(capacity),
    'Choose a supported table size.',
  );
  check(
    invitees.every((p) => roster.includes(p) && p !== name) &&
      new Set(invitees).size === invitees.length,
    'Choose distinct family members to invite.',
  );
  check(
    visibility === 'invite' ? invitees.length > 0 : invitees.length === 0,
    'Choose invitees for an invite-only table.',
  );
  if (settings.teams !== undefined)
    check(
      game === 'lines' && capacity % settings.teams === 0,
      'Choose equal-sized Card Lines teams.',
    );
  const t: Table = {
    id,
    version: 1,
    due: null,
    match: null,
    meta: {
      ...settings,
      host: name,
      players: [name],
      status: 'lobby',
      turn: null,
      summary: 'Waiting for players',
      lastTimeout: null,
    },
  };
  const result = await db
    .prepare(
      'INSERT INTO family_tables (id,version,metadata) VALUES (?,1,?) ON CONFLICT(id) DO NOTHING',
    )
    .bind(id, JSON.stringify(t.meta))
    .run();
  if (!result.meta.changes) {
    const existing = await load(db, id);
    if (existing.meta.host !== name) throw conflict();
    return detail(existing, name);
  }
  return detail(t, name);
}
export async function act(
  db: D1Database,
  id: string,
  name: string,
  action: FamilyAction,
  clock: TableClock,
) {
  const t = await load(db, id);
  const m = t.meta;
  if (!visible(m, name)) throw missing();
  if ((await expire(db, t, clock)) || t.version !== action.version) throw conflict();
  if (action.type === 'move') {
    check(t.match && m.turn === name, 'Wait for your turn.');
    const next = playMove(
      t.match,
      m.players,
      m.players.indexOf(name),
      action.index,
      clock.random,
      action.selection,
    );
    updateMatch(t, next, turnChanged(t.match, next), clock.now());
    await write(db, t, clock.now());
    return detail(t, name);
  }
  check(m.status === 'lobby', 'This table already started.');
  switch (action.type) {
    case 'join':
      check(
        !m.players.includes(name) && m.players.length < m.capacity,
        'This seat is unavailable.',
      );
      m.players.push(name);
      m.invitees = m.invitees.filter((p) => p !== name);
      if (m.players.length === m.capacity) {
        m.invitees = [];
        if (m.startMode === 'auto') start(t, clock);
        else m.summary = 'Full · Waiting for the host';
      }
      break;
    case 'decline':
      check(m.invitees.includes(name), 'There is no pending invitation.');
      m.invitees = m.invitees.filter((p) => p !== name);
      break;
    case 'partner': {
      check(
        name === m.host && m.startMode === 'host' && m.game === 'euchre' && m.players.length === 4,
        'The host chooses partnerships at a full Euchre table.',
      );
      const index = m.players.indexOf(action.name);
      check(index > 0, 'Choose another seated player.');
      [m.players[2], m.players[index]] = [m.players[index]!, m.players[2]!];
      break;
    }
    case 'invite':
      check(
        name === m.host && m.visibility === 'invite' && m.players.length < m.capacity,
        'Only the host can invite players to an available seat.',
      );
      check(
        roster.includes(action.name) &&
          !m.players.includes(action.name) &&
          !m.invitees.includes(action.name),
        'Choose an available family member.',
      );
      m.invitees.push(action.name);
      break;
    case 'start':
      check(name === m.host && m.startMode === 'host', 'Only the host can start this table.');
      start(t, clock);
      break;
  }
  await write(db, t);
  return action.type === 'decline' ? null : detail(t, name);
}
