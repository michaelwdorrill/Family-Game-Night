import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import './styles.css';

// Keep bookmarked table routes while retiring keys from older shared links.
function cleanLegacyLink() {
  const [path, query] = window.location.hash.split('?');
  const params = new URLSearchParams(query);
  if (!params.has('family')) return;
  params.delete('family');
  const remaining = params.toString();
  history.replaceState(
    history.state,
    '',
    location.pathname + location.search + (path || '#/') + (remaining ? '?' + remaining : ''),
  );
}
localStorage.removeItem('family-game-night.link');
cleanLegacyLink();
window.addEventListener('hashchange', cleanLegacyLink);

const root = document.querySelector('#root');

if (root === null) {
  throw new Error('Application root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
