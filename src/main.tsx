import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import { LadelogProvider } from './app/context';
import { registerServiceWorker } from './pwa/register';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <LadelogProvider>
      <App />
    </LadelogProvider>
  </StrictMode>,
);

// Not awaited: the app must be usable the instant it renders, and it works
// without a service worker (FR-10.4).
registerServiceWorker();
