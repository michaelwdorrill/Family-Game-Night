import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createD1Harness } from './d1-harness';

import type { AwaitedReturn } from './test-types';

let harness: AwaitedReturn<typeof createD1Harness> | undefined;

describe('D1 test harness', () => {
  beforeAll(async () => {
    harness = await createD1Harness();
  }, 30_000);

  afterAll(async () => harness?.dispose());

  it('applies the production migrations to a real local D1 database', async () => {
    if (harness === undefined) throw new Error('The D1 harness did not start.');
    const result = await harness.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all<{ readonly name: string }>();
    expect(result.results.map((row) => row.name)).toEqual(
      expect.arrayContaining(['users', 'games', 'game_members', 'game_invites', 'game_events']),
    );
    const columns = await harness.db.prepare('PRAGMA table_info(users)').all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toContain('display_name_confirmed');
  });

  it('uses scoped indexes for dashboard and invitation lookups', async () => {
    if (harness === undefined) throw new Error('The D1 harness did not start.');
    const dashboardPlan = await harness.db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT g.id
         FROM game_members gm
         JOIN games g ON g.id = gm.game_id
         WHERE gm.user_id = ? AND gm.membership_status = 'accepted'
           AND g.status = 'active' AND g.current_player_id = ?
         ORDER BY g.updated_at DESC, g.id DESC
         LIMIT ?`,
      )
      .bind('00000000-0000-4000-8000-000000000001', 'user', 20)
      .all<{ readonly detail: string }>();
    const invitationPlan = await harness.db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT i.id
         FROM game_invites i
         JOIN games g ON g.id = i.game_id
         WHERE i.email = ? COLLATE NOCASE AND i.status = 'pending'
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT ?`,
      )
      .bind('member@example.test', 20)
      .all<{ readonly detail: string }>();

    const dashboardDetails = dashboardPlan.results.map((row) => row.detail).join('\n');
    const invitationDetails = invitationPlan.results.map((row) => row.detail).join('\n');
    expect(dashboardDetails).toContain('idx_games_current_player');
    expect(dashboardDetails).not.toMatch(/\bSCAN (?:g|gm)\b/);
    expect(invitationDetails).toContain('idx_game_invites_email_status');
    expect(invitationDetails).not.toMatch(/\bSCAN i\b/);
  });
});
