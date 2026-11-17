import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorApi } from './api';
import { App } from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un 4xx (no encontrado, sin permiso, dato inválido) no mejora reintentando.
      retry: (intentos, error) =>
        !(error instanceof ErrorApi && error.estado >= 400 && error.estado < 500) && intentos < 3,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
