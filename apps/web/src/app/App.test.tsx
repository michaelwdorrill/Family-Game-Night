import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const PLAYER_ID = '00000000-0000-4000-8000-000000000002';
const GAME_ID = '00000000-0000-4000-8000-000000000003';

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function dashboardFetch(needsDisplayNameConfirmation = false) {
  return vi.fn<typeof fetch>((input) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (path === '/api/v1/me') {
      return Promise.resolve(
        json({
          id: USER_ID,
          email: 'host@example.test',
          displayName: 'Michael',
          role: 'admin',
          needsDisplayNameConfirmation,
        }),
      );
    }
    if (path.startsWith('/api/v1/games?')) {
      return Promise.resolve(json({ games: [], nextCursor: null }));
    }
    if (path === '/api/v1/invitations') {
      return Promise.resolve(json({ invitations: [] }));
    }
    return Promise.resolve(
      json({ error: { code: 'NOT_FOUND', message: 'Not found', details: {} } }, 404),
    );
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('App', () => {
  it('loads the authenticated dashboard and all four buckets', async () => {
    vi.stubGlobal('fetch', dashboardFetch());
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Game night, whenever you’re ready.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your turn' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invitations' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waiting on others' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Finished games' })).toBeInTheDocument();
  });

  it('requires first-time users to confirm a display name', async () => {
    vi.stubGlobal('fetch', dashboardFetch(true));
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'What should the family call you?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveValue('Michael');
  });

  it('shows a focused recovery message for an expired Access session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        json(
          {
            error: {
              code: 'UNAUTHENTICATED',
              message: 'A Cloudflare Access session is required.',
              details: {},
            },
          },
          401,
        ),
      ),
    );
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Your sign-in has expired.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/cdn-cgi/access/logout',
    );
  });

  it('opens the create-game form from the dashboard', async () => {
    vi.stubGlobal('fetch', dashboardFetch());
    render(<App />);
    fireEvent.click(await screen.findByRole('link', { name: 'Create game' }));

    expect(await screen.findByRole('heading', { name: 'Choose a table.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Card Lines' })).toBeInTheDocument();
    expect(screen.getByLabelText('Game title')).toHaveValue('Family Card Lines');
  });

  it('captures team selections before React releases the change event', async () => {
    const lobby = {
      kind: 'lobby',
      id: GAME_ID,
      gameType: 'sequence',
      title: 'Family Card Lines',
      status: 'lobby',
      version: 3,
      hostUserId: USER_ID,
      teamCount: 2,
      members: [
        {
          userId: USER_ID,
          displayName: 'Michael',
          membershipStatus: 'accepted',
          teamIndex: null,
          seatIndex: null,
          isHost: true,
        },
        {
          userId: PLAYER_ID,
          displayName: 'Player Two',
          membershipStatus: 'accepted',
          teamIndex: null,
          seatIndex: null,
          isHost: false,
        },
      ],
      invitations: [],
      seatPreview: [],
      validation: {
        valid: false,
        errors: ['2 accepted player(s) still need a team assignment.'],
      },
      permissions: { canManage: true, canStart: false, canLeave: false },
      recentEvents: [],
    } as const;
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const path =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (path === '/api/v1/me') {
        return Promise.resolve(
          json({
            id: USER_ID,
            email: 'host@example.test',
            displayName: 'Michael',
            role: 'admin',
            needsDisplayNameConfirmation: false,
          }),
        );
      }
      if (path === `/api/v1/games/${GAME_ID}`) return Promise.resolve(json(lobby));
      if (path === '/api/v1/users') return Promise.resolve(json([]));
      if (path === `/api/v1/games/${GAME_ID}/lobby` && init?.method === 'PATCH') {
        return Promise.resolve(
          json({
            ...lobby,
            version: 4,
            members: lobby.members.map((member, index) => ({ ...member, teamIndex: index })),
            seatPreview: [USER_ID, PLAYER_ID],
            validation: { valid: true, errors: [] },
            permissions: { canManage: true, canStart: true, canLeave: false },
          }),
        );
      }
      return Promise.resolve(
        json({ error: { code: 'NOT_FOUND', message: 'Not found', details: {} } }, 404),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = `#/games/${GAME_ID}`;
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Michael'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Player Two'), { target: { value: '1' } });

    expect(screen.getByLabelText('Michael')).toHaveValue('0');
    expect(screen.getByLabelText('Player Two')).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: 'Save teams' }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(
        ([input, init]) => input === `/api/v1/games/${GAME_ID}/lobby` && init?.method === 'PATCH',
      );
      expect(request).toBeDefined();
      const body = request?.[1]?.body;
      if (typeof body !== 'string') throw new Error('Expected a JSON request body.');
      expect(JSON.parse(body)).toMatchObject({
        action: 'SET_TEAM_ASSIGNMENTS',
        expectedVersion: 3,
        assignments: [
          { userId: USER_ID, teamIndex: 0 },
          { userId: PLAYER_ID, teamIndex: 1 },
        ],
      });
    });
  });
});
