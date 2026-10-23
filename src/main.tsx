import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { systemClock } from './ui/clock';
import './index.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element not found');
}
// The browser's own fetch and clock are handed in here, the only place they are named.
const deps = { fetch: (input: string, init?: RequestInit) => window.fetch(input, init), now: systemClock };
createRoot(container).render(
  <StrictMode>
    <App deps={deps} />
  </StrictMode>,
);
