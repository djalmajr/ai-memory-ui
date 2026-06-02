/* @refresh reload */
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { RouterProvider, createRouter } from '@tanstack/solid-router'
import './index.css'
import { Suspense } from 'solid-js'
import { render } from 'solid-js/web'
import { routeTree } from './routeTree.gen'

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
// Derive the router basepath from the server-injected `<base href>`
// (`document.baseURI`), e.g. `/wiki/web/` -> `/wiki/web`, `/web/` -> `/web`,
// `/` -> undefined. Lets the SPA run under any AI_MEMORY_BASE_PATH / web slug
// without a rebuild.
const basepath = new URL(document.baseURI).pathname.replace(/\/+$/, '') || undefined
const router = createRouter({
  basepath,
  defaultPreload: 'intent',
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
