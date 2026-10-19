import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  const target = env.LOCAL_API_TARGET
  const authorization = env.LOCAL_API_BASIC_AUTH
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: target
        ? {
            '/api': {
              target,
              changeOrigin: true,
              configure(proxy) {
                proxy.on('proxyReq', (request) => {
                  // Basic 仅存在服务端；公共背景接口使用上游认证，其余请求保留应用认证。
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
          }
        : undefined,
    },
  }
})
