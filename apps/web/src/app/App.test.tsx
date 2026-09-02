import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('renders the Card Lines development shell and confirms API health', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, service: 'family-game-night-api' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Family Game Night' })).toBeInTheDocument();
    expect(await screen.findByText('Game service connected.')).toBeInTheDocument();
  });
});
