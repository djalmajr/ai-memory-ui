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
const router = createRouter({
  basepath: '/web',
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
