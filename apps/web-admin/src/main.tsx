import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { initTheme } from '@eduvault/ui';
import { App } from './app';
import { authClient } from './auth';
import { queryClient } from './query-client';
import './styles.css';

initTheme();

const root = document.querySelector('#root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App authClient={authClient} />
    </QueryClientProvider>
  </StrictMode>
);
