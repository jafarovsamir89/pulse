import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Game from './App';
const Alpha = lazy(() => import('./TextMatchAlpha'));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><Suspense fallback={<p>Загрузка…</p>}>{new URLSearchParams(window.location.search).has('alpha') ? <Alpha/> : <Game/>}</Suspense></QueryClientProvider></React.StrictMode>);
