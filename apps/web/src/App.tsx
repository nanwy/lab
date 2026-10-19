import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'

import { router } from './router'
import { queryClient } from './query-client'

const RouterDevtools =
  import.meta.env.DEV && import.meta.env.MODE === 'development'
    ? lazy(async () => {
        const module = await import('@tanstack/react-router-devtools')
        return { default: module.TanStackRouterDevtools }
      })
    : null

const QueryDevtools =
  import.meta.env.DEV && import.meta.env.MODE === 'development'
    ? lazy(async () => {
        const module = await import('@tanstack/react-query-devtools')
        return { default: module.ReactQueryDevtools }
      })
    : null

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {RouterDevtools ? (
        <Suspense fallback={null}>
          <RouterDevtools router={router} position="bottom-right" />
        </Suspense>
      ) : null}
      {QueryDevtools ? (
        <Suspense fallback={null}>
          <QueryDevtools initialIsOpen={false} />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  )
}
