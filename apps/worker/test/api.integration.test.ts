import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { createD1Harness } from './d1-harness';

import type { GameDetailDto, InvitationListDto, UserProfileDto } from '@family-game-night/shared';
import type { RandomSource } from '@family-game-night/sequence-engine';
import type { WorkerBindings } from '../src/env';
import type { AwaitedReturn } from './test-types';

const ORIGIN = 'http://127.0.0.1:5173';
const ADMIN_EMAIL = 'admin@example.test';
const MEMBER_EMAIL = 'member@example.test';
const OUTSIDER_EMAIL = 'outsider@example.test';

let harness: AwaitedReturn<typeof createD1Harness> | undefined;
let idCounter = 100;
let timeCounter = 0;

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}

const deterministicRandom: RandomSource = {
  randomInt: () => 0,
  shuffle: <T>(items: readonly T[]) => items.slice(),
};

const app = createApp({
  createId: () => uuid(idCounter++),
  now: () => new Date(Date.parse('2026-09-02T12:00:00.000Z') + timeCounter++),
  random: deterministicRandom,
});

function bindings(email: string): WorkerBindings {
  if (harness === undefined) throw new Error('The D1 harness did not start.');
  return {
    DB: harness.db,
    ENVIRONMENT: 'test',
    DEV_AUTH_EMAIL: email,
    ADMIN_EMAIL,
    APP_ORIGIN: ORIGIN,
  };
}

async function request(
  email: string,
  method: string,
  path: string,
  body?: Readonly<Record<string, unknown>>,
  origin = ORIGIN,
): Promise<Response> {
  return app.request(
    `http://api.test${path}`,
    {
      method,
      headers:
        body === undefined
          ? {}
          : { 'Content-Type': 'application/json; charset=utf-8', Origin: origin },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    bindings(email),
  );
}

async function json<T>(response: Response): Promise<T> {
  const value: unknown = await response.json();
  return value as T;
}

async function profile(email: string): Promise<UserProfileDto> {
  const response = await request(email, 'GET', '/api/v1/me');
  expect(response.status).toBe(200);
  return json<UserProfileDto>(response);
}

function forbiddenKeys(value: unknown, found = new Set<string>()): ReadonlySet<string> {
  if (Array.isArray(value)) {
    for (const item of value) forbiddenKeys(item, found);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'deck' || key === 'state_json' || key === 'command_hash') found.add(key);
      forbiddenKeys(child, found);
    }
  }
  return found;
}

describe('D1-backed API', () => {
  beforeAll(async () => {
    harness = await createD1Harness();
  }, 30_000);

  afterAll(async () => harness?.dispose());

  it('enforces request security and runs a private, idempotent game lifecycle', async () => {
    if (harness === undefined) throw new Error('The D1 harness did not start.');
    const missingAccessToken = await app.request('https://games.example.com/api/v1/me', undefined, {
      DB: harness.db,
      ENVIRONMENT: 'production',
      ADMIN_EMAIL,
      APP_ORIGIN: 'https://games.example.com',
      ACCESS_TEAM_DOMAIN: 'family.cloudflareaccess.com',
      ACCESS_AUDIENCE: 'expected-audience',
    });
    expect(missingAccessToken.status).toBe(401);
    expect(await json<{ error: { code: string } }>(missingAccessToken)).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });

    const admin = await profile(ADMIN_EMAIL);
    expect(admin).toMatchObject({ email: ADMIN_EMAIL, role: 'admin' });

    const wrongOrigin = await request(
      ADMIN_EMAIL,
      'PATCH',
      '/api/v1/me',
      { displayName: 'Game Host' },
      'https://attacker.example.com',
    );
    expect(wrongOrigin.status).toBe(403);
    expect(await json<{ error: { code: string } }>(wrongOrigin)).toMatchObject({
      error: { code: 'INVALID_ORIGIN' },
    });

    const oversized = await app.request(
      'http://api.test/api/v1/me',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ displayName: 'x'.repeat(33 * 1024) }),
      },
      bindings(ADMIN_EMAIL),
    );
    expect(oversized.status).toBe(413);
    expect(await json<{ error: { code: string } }>(oversized)).toMatchObject({
      error: { code: 'REQUEST_TOO_LARGE' },
    });
    expect(oversized.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(oversized.headers.get('X-Content-Type-Options')).toBe('nosniff');

    const updateProfile = await request(ADMIN_EMAIL, 'PATCH', '/api/v1/me', {
      displayName: 'Game Host',
    });
    expect(updateProfile.status).toBe(200);
    expect(await json<UserProfileDto>(updateProfile)).toMatchObject({
      displayName: 'Game Host',
      needsDisplayNameConfirmation: false,
    });

    const gameId = uuid(1);
    const createResponse = await request(ADMIN_EMAIL, 'POST', '/api/v1/games', {
      commandId: gameId,
      gameType: 'sequence',
      teamCount: 2,
      title: 'Wednesday Card Lines',
    });
    expect(createResponse.status).toBe(201);
    const created = await json<GameDetailDto>(createResponse);
    expect(created).toMatchObject({ kind: 'lobby', id: gameId, version: 1 });

    const inviteCommand = uuid(2);
    const inviteResponse = await request(
      ADMIN_EMAIL,
      'POST',
      `/api/v1/games/${gameId}/invitations`,
      {
        commandId: inviteCommand,
        expectedVersion: 1,
        targetType: 'email',
        email: MEMBER_EMAIL,
      },
    );
    expect(inviteResponse.status).toBe(201);
    const invitedLobby = await json<GameDetailDto>(inviteResponse);
    expect(invitedLobby).toMatchObject({ kind: 'lobby', version: 2 });
    if (invitedLobby.kind !== 'lobby') throw new Error('Expected a lobby response.');
    const invitationId = invitedLobby.invitations[0]?.id;
    if (invitationId === undefined) throw new Error('The invitation was not returned.');

    const member = await profile(MEMBER_EMAIL);
    const invitationListResponse = await request(MEMBER_EMAIL, 'GET', '/api/v1/invitations');
    expect(invitationListResponse.status).toBe(200);
    expect(await json<InvitationListDto>(invitationListResponse)).toMatchObject({
      invitations: [{ id: invitationId, gameId, gameVersion: 2 }],
    });

    const acceptRequest = { commandId: uuid(3), expectedVersion: 2 };
    const acceptResponse = await request(
      MEMBER_EMAIL,
      'POST',
      `/api/v1/invitations/${invitationId}/accept`,
      acceptRequest,
    );
    expect(acceptResponse.status).toBe(200);
    expect(await json<GameDetailDto>(acceptResponse)).toMatchObject({ version: 3 });

    const assignmentRequest = {
      commandId: uuid(4),
      expectedVersion: 3,
      action: 'SET_TEAM_ASSIGNMENTS',
      assignments: [
        { userId: admin.id, teamIndex: 0 },
        { userId: member.id, teamIndex: 1 },
      ],
    } as const;
    const assignmentResponse = await request(
      ADMIN_EMAIL,
      'PATCH',
      `/api/v1/games/${gameId}/lobby`,
      assignmentRequest,
    );
    expect(assignmentResponse.status).toBe(200);
    expect(await json<GameDetailDto>(assignmentResponse)).toMatchObject({
      kind: 'lobby',
      version: 4,
      validation: { valid: true },
    });

    const startRequest = { commandId: uuid(5), expectedVersion: 4 };
    const startResponse = await request(
      ADMIN_EMAIL,
      'POST',
      `/api/v1/games/${gameId}/start`,
      startRequest,
    );
    expect(startResponse.status).toBe(200);
    const adminGame = await json<GameDetailDto>(startResponse);
    expect(adminGame).toMatchObject({ kind: 'sequence', status: 'active', version: 5 });
    if (adminGame.kind !== 'sequence') throw new Error('Expected an active game response.');

    const exactRetry = await request(
      ADMIN_EMAIL,
      'POST',
      `/api/v1/games/${gameId}/start`,
      startRequest,
    );
    expect(exactRetry.status).toBe(200);
    expect(await json<GameDetailDto>(exactRetry)).toMatchObject({ version: 5 });

    const reusedCommand = await request(ADMIN_EMAIL, 'POST', `/api/v1/games/${gameId}/start`, {
      commandId: startRequest.commandId,
      expectedVersion: 3,
    });
    expect(reusedCommand.status).toBe(409);
    expect(await json<{ error: { code: string } }>(reusedCommand)).toMatchObject({
      error: { code: 'COMMAND_ID_REUSED' },
    });

    const stale = await request(ADMIN_EMAIL, 'POST', `/api/v1/games/${gameId}/cancel`, {
      commandId: uuid(6),
      expectedVersion: 4,
    });
    expect(stale.status).toBe(409);
    expect(
      await json<{ error: { code: string; details: { latest: { version: number } } } }>(stale),
    ).toMatchObject({
      error: { code: 'STALE_GAME_VERSION', details: { latest: { version: 5 } } },
    });

    const memberGameResponse = await request(MEMBER_EMAIL, 'GET', `/api/v1/games/${gameId}`);
    expect(memberGameResponse.status).toBe(200);
    const memberGame = await json<GameDetailDto>(memberGameResponse);
    if (memberGame.kind !== 'sequence') throw new Error('Expected an active game response.');
    expect(forbiddenKeys(memberGame)).toEqual(new Set());
    const privateAdminCardId = adminGame.myHand[0]?.id;
    if (privateAdminCardId === undefined) throw new Error('The host hand was unexpectedly empty.');
    expect(JSON.stringify(memberGame)).not.toContain(privateAdminCardId);

    await profile(OUTSIDER_EMAIL);
    const invisible = await request(OUTSIDER_EMAIL, 'GET', `/api/v1/games/${gameId}`);
    expect(invisible.status).toBe(404);

    const currentEmail = adminGame.currentPlayerId === admin.id ? ADMIN_EMAIL : MEMBER_EMAIL;
    const waitingEmail = currentEmail === ADMIN_EMAIL ? MEMBER_EMAIL : ADMIN_EMAIL;
    const yourTurn = await request(currentEmail, 'GET', '/api/v1/games?bucket=active');
    const waiting = await request(waitingEmail, 'GET', '/api/v1/games?bucket=waiting');
    expect(await json<{ games: { id: string }[] }>(yourTurn)).toMatchObject({
      games: [{ id: gameId }],
    });
    expect(await json<{ games: { id: string }[] }>(waiting)).toMatchObject({
      games: [{ id: gameId }],
    });

    const currentView = currentEmail === ADMIN_EMAIL ? adminGame : memberGame;
    const playable = currentView.myHand.find((card) => card.legalTargetCells.length > 0);
    const targetCell = playable?.legalTargetCells[0];
    if (playable === undefined || targetCell === undefined) {
      throw new Error('The deterministic opening hand has no legal move.');
    }
    const firstCommand = {
      type: 'PLAY_CARD',
      commandId: uuid(7),
      expectedVersion: 5,
      cardId: playable.id,
      targetCell,
    } as const;
    const secondCommand = { ...firstCommand, commandId: uuid(8) };
    const concurrent = await Promise.all([
      request(currentEmail, 'POST', `/api/v1/games/${gameId}/commands`, firstCommand),
      request(currentEmail, 'POST', `/api/v1/games/${gameId}/commands`, secondCommand),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([200, 409]);
    const acceptedCommand = concurrent[0]?.status === 200 ? firstCommand : secondCommand;
    const retryMove = await request(
      currentEmail,
      'POST',
      `/api/v1/games/${gameId}/commands`,
      acceptedCommand,
    );
    expect(retryMove.status).toBe(200);
    expect(await json<GameDetailDto>(retryMove)).toMatchObject({ version: 6 });

    const eventResponse = await request(
      MEMBER_EMAIL,
      'GET',
      `/api/v1/games/${gameId}/events?afterVersion=0&limit=100`,
    );
    expect(eventResponse.status).toBe(200);
    const events = await json<{ events: { version: number; payload: unknown }[] }>(eventResponse);
    expect(events.events.map((event) => event.version)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(forbiddenKeys(events)).toEqual(new Set());

    await harness.db
      .prepare(
        `CREATE TRIGGER reject_card_events
         BEFORE INSERT ON game_events
         WHEN NEW.event_type = 'CARD_PLAYED'
         BEGIN
           SELECT RAISE(ABORT, 'forced event failure');
         END`,
      )
      .run();
    const latestResponse = await request(currentEmail, 'GET', `/api/v1/games/${gameId}`);
    const latest = await json<GameDetailDto>(latestResponse);
    if (latest.kind !== 'sequence') throw new Error('Expected an active game response.');
    const nextEmail = latest.currentPlayerId === admin.id ? ADMIN_EMAIL : MEMBER_EMAIL;
    const nextViewResponse = await request(nextEmail, 'GET', `/api/v1/games/${gameId}`);
    const nextView = await json<GameDetailDto>(nextViewResponse);
    if (nextView.kind !== 'sequence') throw new Error('Expected an active game response.');
    const nextCard = nextView.myHand.find((card) => card.legalTargetCells.length > 0);
    const nextTarget = nextCard?.legalTargetCells[0];
    if (nextCard === undefined || nextTarget === undefined) {
      throw new Error('The next deterministic hand has no legal move.');
    }
    const failedAtomicMove = await request(nextEmail, 'POST', `/api/v1/games/${gameId}/commands`, {
      type: 'PLAY_CARD',
      commandId: uuid(9),
      expectedVersion: 6,
      cardId: nextCard.id,
      targetCell: nextTarget,
    });
    expect(failedAtomicMove.status).toBe(500);
    const stored = await harness.db
      .prepare('SELECT version, last_command_id FROM games WHERE id = ?')
      .bind(gameId)
      .first<{ readonly version: number; readonly last_command_id: string }>();
    expect(stored).toMatchObject({ version: 6, last_command_id: acceptedCommand.commandId });
    const eventCount = await harness.db
      .prepare('SELECT COUNT(*) AS count FROM game_events WHERE game_id = ?')
      .bind(gameId)
      .first<{ readonly count: number }>();
    expect(eventCount?.count).toBe(6);
  }, 30_000);

  it('versions decline, reinvite, leave, invitation cancellation, and game cancellation', async () => {
    const noContentType = await request(ADMIN_EMAIL, 'POST', '/api/v1/games');
    expect(noContentType.status).toBe(415);

    const gameId = uuid(20);
    const created = await request(ADMIN_EMAIL, 'POST', '/api/v1/games', {
      commandId: gameId,
      gameType: 'sequence',
      teamCount: 2,
      title: 'Lobby Mutation Test',
    });
    expect(created.status).toBe(201);

    const firstInvite = await request(ADMIN_EMAIL, 'POST', `/api/v1/games/${gameId}/invitations`, {
      commandId: uuid(21),
      expectedVersion: 1,
      targetType: 'email',
      email: MEMBER_EMAIL,
    });
    const firstLobby = await json<GameDetailDto>(firstInvite);
    if (firstLobby.kind !== 'lobby') throw new Error('Expected a lobby response.');
    const memberInviteId = firstLobby.invitations[0]?.id;
    if (memberInviteId === undefined) throw new Error('The invitation was not returned.');

    const declined = await request(
      MEMBER_EMAIL,
      'POST',
      `/api/v1/invitations/${memberInviteId}/decline`,
      { commandId: uuid(22), expectedVersion: 2 },
    );
    expect(declined.status).toBe(200);
    expect(await json<{ status: string; version: number }>(declined)).toMatchObject({
      status: 'declined',
      version: 3,
    });

    const reinvited = await request(ADMIN_EMAIL, 'POST', `/api/v1/games/${gameId}/invitations`, {
      commandId: uuid(23),
      expectedVersion: 3,
      targetType: 'email',
      email: MEMBER_EMAIL,
    });
    expect(reinvited.status).toBe(201);
    const reinvitedLobby = await json<GameDetailDto>(reinvited);
    if (reinvitedLobby.kind !== 'lobby') throw new Error('Expected a lobby response.');
    expect(reinvitedLobby.invitations[0]).toMatchObject({
      id: memberInviteId,
      status: 'pending',
    });

    const accepted = await request(
      MEMBER_EMAIL,
      'POST',
      `/api/v1/invitations/${memberInviteId}/accept`,
      { commandId: uuid(24), expectedVersion: 4 },
    );
    expect(accepted.status).toBe(200);

    const forbiddenHostAction = await request(
      MEMBER_EMAIL,
      'POST',
      `/api/v1/games/${gameId}/cancel`,
      { commandId: uuid(25), expectedVersion: 5 },
    );
    expect(forbiddenHostAction.status).toBe(403);

    const leaveRequest = { commandId: uuid(26), expectedVersion: 5, action: 'LEAVE' } as const;
    const left = await request(
      MEMBER_EMAIL,
      'PATCH',
      `/api/v1/games/${gameId}/lobby`,
      leaveRequest,
    );
    expect(left.status).toBe(200);
    expect(await json<{ left: boolean; version: number }>(left)).toMatchObject({
      left: true,
      version: 6,
    });
    const leaveRetry = await request(
      MEMBER_EMAIL,
      'PATCH',
      `/api/v1/games/${gameId}/lobby`,
      leaveRequest,
    );
    expect(leaveRetry.status).toBe(200);
    expect(await json<{ left: boolean; version: number }>(leaveRetry)).toMatchObject({
      left: true,
      version: 6,
    });

    const outsiderInvite = await request(
      ADMIN_EMAIL,
      'POST',
      `/api/v1/games/${gameId}/invitations`,
      {
        commandId: uuid(27),
        expectedVersion: 6,
        targetType: 'email',
        email: OUTSIDER_EMAIL,
      },
    );
    const outsiderLobby = await json<GameDetailDto>(outsiderInvite);
    if (outsiderLobby.kind !== 'lobby') throw new Error('Expected a lobby response.');
    const outsiderInviteId = outsiderLobby.invitations.find(
      (invitation) => invitation.email === OUTSIDER_EMAIL,
    )?.id;
    if (outsiderInviteId === undefined) throw new Error('The invitation was not returned.');

    const cancelInvite = await request(
      ADMIN_EMAIL,
      'DELETE',
      `/api/v1/games/${gameId}/invitations/${outsiderInviteId}`,
      { commandId: uuid(28), expectedVersion: 7 },
    );
    expect(cancelInvite.status).toBe(200);
    expect(await json<GameDetailDto>(cancelInvite)).toMatchObject({ version: 8 });

    const cancelled = await request(ADMIN_EMAIL, 'POST', `/api/v1/games/${gameId}/cancel`, {
      commandId: uuid(29),
      expectedVersion: 8,
    });
    expect(cancelled.status).toBe(200);
    expect(await json<GameDetailDto>(cancelled)).toMatchObject({
      kind: 'lobby',
      status: 'cancelled',
      version: 9,
    });

    const eventResponse = await request(
      ADMIN_EMAIL,
      'GET',
      `/api/v1/games/${gameId}/events?afterVersion=0&limit=100`,
    );
    const events = await json<{ events: { version: number }[] }>(eventResponse);
    expect(events.events.map((event) => event.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }, 30_000);
});
