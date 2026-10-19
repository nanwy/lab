import { RouterProvider } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

import { router } from './router'

const RouterDevtools =
  import.meta.env.DEV && import.meta.env.MODE === 'development'
    ? lazy(async () => {
        const module = await import('@tanstack/react-router-devtools')
        return { default: module.TanStackRouterDevtools }
      })
    : null

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      {RouterDevtools ? (
        <Suspense fallback={null}>
          <RouterDevtools router={router} position="bottom-right" />
        </Suspense>
      ) : null}
    </>
  )
}
