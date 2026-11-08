import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { queryClient } from '@/lib/queryClient';
import { installNativeFetchProxy } from '@/native/fetchProxy';
import { installNativeLogBridge } from '@/native/logBridge';
import { routes } from '@/routes';
import '@/styles/global.css';
import '@/tv/tv.css';
import { installTvMode } from '@/tv/tvMode';

// Sets the TV flag before the first paint and owns D-pad focus. No-op off Android.
installTvMode();
// Must run before the first playback/browse request. A no-op in the browser build.
installNativeFetchProxy();
// Dev-only in the Tauri build: page logs and uncaught errors go to the terminal.
installNativeLogBridge();

const router = createBrowserRouter(routes);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
