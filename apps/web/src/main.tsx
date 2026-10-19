import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { appConfig } from './config'
import '@xyflow/react/dist/style.css'
import './styles.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Missing application root element')
}
const rootContainer = container

async function bootstrap() {
  // 保留编译期开发标记，让生产构建移除模拟运行时。
  if (import.meta.env.DEV && appConfig.mockEnabled) {
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
