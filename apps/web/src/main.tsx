import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import '@xyflow/react/dist/style.css'
import './styles.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Missing application root element')
}
const rootContainer = container

async function bootstrap() {
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MSW !== 'false') {
    const { worker } = await import('./mocks/browser')
    await worker.start()
  }

  createRoot(rootContainer).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
