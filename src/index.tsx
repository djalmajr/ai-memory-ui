/* @refresh reload */
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { RouterProvider, createRouter } from '@tanstack/solid-router'
import './index.css'
import { clearLegacyCredential } from './lib/auth'
import { Suspense } from 'solid-js'
import { render } from 'solid-js/web'
import { routeTree } from './routeTree.gen'

clearLegacyCredential()


const root = document.getElementById('root')
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 5 * 60 * 1000,
      retry: 1,
      staleTime: 15 * 1000,
    },
  },
})
// Derive the router basepath from the server-injected `<base href>` (the
// engine's `/web` handler injects it dynamically per AI_MEMORY_BASE_PATH /
// web slug). E.g. `/wiki/web/` -> `/wiki/web`, `/web/` -> `/web`, `/` ->
// undefined.
//
// Look the element up explicitly instead of via `document.baseURI`: when
// there's no `<base>` tag (typical in `vite dev`, where vite serves
// index.html as-is without engine injection), `document.baseURI` falls back
// to `location.href` per the HTML spec — and the current page path gets
// adopted as basepath, breaking F5 (router thinks it's at root and shows
// home; subsequent clicks concatenate URLs).
const baseEl = document.querySelector('base')
const basepath = baseEl
  ? new URL(baseEl.href).pathname.replace(/\/+$/, '') || undefined
  : undefined
const router = createRouter({
  basepath,
  defaultPreload: 'intent',
  // Scroll restoration keyed by pathname so F5/refresh (or a soft back) lands at
  // the position the reader was at, not the top. TanStack Router persists the
  // y-offset under this key in sessionStorage and replays it on hydration.
  getScrollRestorationKey: (location) => location.pathname,
  routeTree,
  scrollRestoration: true,
})

declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router
  }
}

if (!root) {
  throw new Error('Root element not found')
}

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div class="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading memory UI</div>}>
        <RouterProvider router={router} />
      </Suspense>
    </QueryClientProvider>
  ),
  root,
)
