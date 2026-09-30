import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createGame, queryKeys } from '../../api/client';

import type { FormEvent } from 'react';

export function CreateGamePage() {
  const [title, setTitle] = useState('Family Card Lines');
  const [teamCount, setTeamCount] = useState<2 | 3>(2);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      createGame({ commandId: crypto.randomUUID(), gameType: 'sequence', teamCount, title }),
    onSuccess: async (game) => {
      queryClient.setQueryData(queryKeys.game(game.id), game);
      await queryClient.invalidateQueries({ queryKey: ['games'] });
      void navigate(`/games/${game.id}`);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }
  return (
    <main className="app-page narrow-page">
      <Link className="back-link" to="/">
        ← Dashboard
      </Link>
      <p className="eyebrow">New family game</p>
      <h1>Choose a table.</h1>
      <div className="game-picker" role="list" aria-label="Available games">
        <article className="game-tile selected" role="listitem">
          <span aria-hidden="true" className="tile-symbol">
            ♠ ♥ ♦ ♣
          </span>
          <h2>Card Lines</h2>
          <p>Play matching cards, place chips, and claim rows of five.</p>
          <span className="available-label">Available</span>
        </article>
        <article aria-disabled="true" className="game-tile disabled" role="listitem">
          <span aria-hidden="true" className="tile-symbol">
            ＋
          </span>
          <h2>More games later</h2>
          <p>The shared table is ready to grow after Card Lines.</p>
        </article>
      </div>
      <form className="setup-form" onSubmit={submit}>
        <label htmlFor="game-title">Game title</label>
        <input
          id="game-title"
          maxLength={80}
          onChange={(event) => setTitle(event.currentTarget.value)}
          required
          value={title}
        />
        <fieldset>
          <legend>Number of teams</legend>
          <label className="radio-card">
            <input
              checked={teamCount === 2}
              name="team-count"
              onChange={() => setTeamCount(2)}
              type="radio"
            />
            <span>
              <strong>Two teams</strong> — most family groups
            </span>
          </label>
          <label className="radio-card">
            <input
              checked={teamCount === 3}
              name="team-count"
              onChange={() => setTeamCount(3)}
              type="radio"
            />
            <span>
              <strong>Three teams</strong> — 3, 6, 9, or 12 players
            </span>
          </label>
        </fieldset>
        {mutation.isError ? <p className="form-error">{mutation.error.message}</p> : null}
        <div className="button-row">
          <button className="button primary" disabled={mutation.isPending} type="submit">
            {mutation.isPending ? 'Creating…' : 'Create lobby'}
          </button>
          <Link className="button quiet" to="/">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
