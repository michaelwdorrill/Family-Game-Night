import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Component, useState } from 'react';
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom';

import { ApiClientError, getMe, queryKeys, updateMe } from '../api/client';
import { CreateGamePage } from '../features/dashboard/CreateGamePage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { GamePage } from '../features/lobby/GamePage';

import type { UserProfileDto } from '@family-game-night/shared';
import type { FormEvent, ReactNode } from 'react';

class AppFailureBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  public override state = { failed: false };

  public static getDerivedStateFromError(): { readonly failed: true } {
    return { failed: true };
  }

  public override render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="centered-page">
          <p className="eyebrow">The table needs a reset</p>
          <h1 className="loading-title">This screen could not be displayed.</h1>
          <p className="muted-copy">
            Your game is still stored safely. Reload the latest version to continue.
          </p>
          <a className="button primary" href={window.location.href}>
            Reload game
          </a>
        </main>
      );
    }
    return this.props.children;
  }
}

function LoadingScreen() {
  return (
    <main className="centered-page" aria-busy="true">
      <div aria-hidden="true" className="card-fan compact">
        <span>♠</span>
        <span>♥</span>
        <span>♦</span>
      </div>
      <p className="eyebrow">Family Game Night</p>
      <h1 className="loading-title">Setting the table…</h1>
    </main>
  );
}

function SessionError({ error }: { readonly error: Error }) {
  const expired = error instanceof ApiClientError && error.status === 401;
  return (
    <main className="centered-page">
      <p className="eyebrow">We couldn’t open the game room</p>
      <h1 className="loading-title">
        {expired ? 'Your sign-in has expired.' : 'The table is offline.'}
      </h1>
      <p className="muted-copy">
        {expired ? 'Sign in again to continue with the same family account.' : error.message}
      </p>
      <div className="button-row">
        <a className="button primary" href="/">
          Try again
        </a>
        {expired ? (
          <a className="button secondary" href="/cdn-cgi/access/logout">
            Sign in again
          </a>
        ) : null}
      </div>
    </main>
  );
}

function DisplayNameGate({ profile }: { readonly profile: UserProfileDto }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => updateMe(displayName),
    onSuccess: (updated) => queryClient.setQueryData(queryKeys.me, updated),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }
  return (
    <main className="centered-page">
      <section className="dialog-card" aria-labelledby="welcome-heading">
        <p className="eyebrow">One quick introduction</p>
        <h1 className="dialog-title" id="welcome-heading">
          What should the family call you?
        </h1>
        <p className="muted-copy">
          This name appears beside your turns. Your verified email stays private from ordinary
          family members.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="display-name">Display name</label>
          <input
            autoComplete="name"
            autoFocus
            id="display-name"
            maxLength={50}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            required
            value={displayName}
          />
          {mutation.isError ? <p className="form-error">{mutation.error.message}</p> : null}
          <button className="button primary" disabled={mutation.isPending} type="submit">
            {mutation.isPending ? 'Saving…' : 'Join game night'}
          </button>
        </form>
      </section>
    </main>
  );
}

function AppHeader({ profile }: { readonly profile: UserProfileDto }) {
  return (
    <header className="app-header">
      <Link className="brand" to="/">
        <span aria-hidden="true">♠</span>
        <span>Family Game Night</span>
      </Link>
      <div className="account-menu">
        <span>{profile.displayName}</span>
        <a href="/cdn-cgi/access/logout">Sign out</a>
      </div>
    </header>
  );
}

function AuthenticatedApp() {
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe, retry: false });
  if (me.isPending) return <LoadingScreen />;
  if (me.isError) return <SessionError error={me.error} />;
  if (me.data.needsDisplayNameConfirmation) return <DisplayNameGate profile={me.data} />;
  return (
    <>
      <AppHeader profile={me.data} />
      <Routes>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<CreateGamePage />} path="/games/new" />
        <Route element={<GamePage />} path="/games/:gameId" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </>
  );
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
        retry: 1,
        staleTime: 30_000,
      },
    },
  });
}

export function App() {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AppFailureBoundary>
          <AuthenticatedApp />
        </AppFailureBoundary>
      </HashRouter>
    </QueryClientProvider>
  );
}
