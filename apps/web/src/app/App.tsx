import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { healthResponseSchema } from '@family-game-night/shared';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

async function fetchHealth(): Promise<string> {
  const response = await fetch('/api/v1/health', {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}.`);
  }

  return healthResponseSchema.parse(await response.json()).service;
}

function HomePage() {
  const health = useQuery({
    queryKey: ['api-health'],
    queryFn: fetchHealth,
  });

  const status = health.isPending
    ? 'Connecting to the game service…'
    : health.isError
      ? 'The local game service is not responding yet.'
      : 'Game service connected.';

  return (
    <main className="shell">
      <div aria-hidden="true" className="card-fan">
        <span>♠</span>
        <span>♥</span>
        <span>♦</span>
      </div>
      <p className="eyebrow">Private games · Whenever your family is ready</p>
      <h1>Family Game Night</h1>
      <p className="intro">
        Card Lines is taking shape: a careful digital adaptation built for patient, asynchronous
        play across days and devices.
      </p>
      <section aria-labelledby="development-status" className="status-card">
        <div>
          <p className="status-label" id="development-status">
            Development status
          </p>
          <p>{status}</p>
        </div>
        <span aria-hidden="true" className={health.isSuccess ? 'status-dot ready' : 'status-dot'} />
      </section>
      <p className="footnote">
        The rules engine is being completed before game screens are opened for play.
      </p>
    </main>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<HomePage />} path="/" />
          <Route element={<Navigate replace to="/" />} path="*" />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}
