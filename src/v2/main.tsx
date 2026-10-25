import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserStore } from '../store';
import { App } from './App';
import { systemClock } from './clock';
import './v2.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element not found');
}
// The browser's own fetch and clock are handed in here, the only place they are named.
const deps = { fetch: (input: string, init?: RequestInit) => window.fetch(input, init), now: systemClock, store: createBrowserStore() };
createRoot(container).render(
  <StrictMode>
    <App deps={deps} />
  </StrictMode>,
);
