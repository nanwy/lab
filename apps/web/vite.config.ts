import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  const target = env.LOCAL_API_TARGET
  const authorization = env.LOCAL_API_BASIC_AUTH
  return {
    // 隔离测试可指定独立缓存，避免与5173互相清理优化依赖。
    cacheDir: env.LOCAL_VITE_CACHE_DIR || 'node_modules/.vite',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: target
        ? {
            '^/(api|media)(/|$)': {
              target,
              changeOrigin: true,
              configure(proxy) {
                proxy.on('proxyReq', (request) => {
                  // API 与媒体共用上游；Basic 仅在服务端补入，保留已有应用认证。
                  // 公共背景接口仍使用上游认证。
                  if (
                    authorization &&
                    (!request.hasHeader('authorization') ||
                      request.path.split('?')[0] ===
                        '/api/admin/system/background/')
                  ) {
                    request.setHeader('authorization', authorization)
                  }
                })
              },
            },
            '^/ws/(dockerssh|vpcssh|kvmvnc|kvmrdp)/': {
              target,
              changeOrigin: true,
              ws: true,
              configure(proxy) {
                proxy.on('proxyReqWs', (request) => {
                  if (authorization && !request.hasHeader('authorization'))
                    request.setHeader('authorization', authorization)
                })
              },
            },
          }
        : undefined,
    },
  }
})
