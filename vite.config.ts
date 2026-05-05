import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

/** LangGraph 服务在 backend/langgraph；默认端口 8001。scripts/dev-services.sh 会注入 VITE_LANGGRAPH_PROXY_TARGET */
function langgraphProxyTarget(mode: string): string {
  const env = loadEnv(mode, process.cwd(), '')
  const fromEnv =
    (process.env.VITE_LANGGRAPH_PROXY_TARGET || env.VITE_LANGGRAPH_PROXY_TARGET || '').trim()
  if (fromEnv) return fromEnv
  return 'http://127.0.0.1:8001'
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // LangGraph FastAPI（仓库 backend/langgraph）；前端 llmApi 使用 /langgraph/api/v1；rewrite 去掉前缀
      '/langgraph': {
        target: langgraphProxyTarget(mode),
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/langgraph/, ''),
      },
      '/gravitino': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/gravitino/, ''),
      },
    },
  },
}))
