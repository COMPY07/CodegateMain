import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const runtimePort = process.env.CODEGATE_RUNTIME_PORT || '45456'
const runtimeToken = process.env.CODEGATE_RUNTIME_TOKEN || ''

// Desktop 포팅(Tauri/Electron) 시 그대로 재사용 가능한 웹 프론트엔드.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    host: true,
    strictPort: true,
    // /api 요청을 백엔드(FastAPI)로 전달한다. SSE도 그대로 스트리밍된다.
    // 기본 포트는 backend/.env 의 PORT(55555)와 맞춘다.
    // 다른 포트로 띄웠다면 VITE_BACKEND_PORT 로 덮어쓴다.
    proxy: {
      // `npm run dev`가 함께 시작한 내부 런타임으로 전달한다. 인증 토큰은
      // Vite가 주입하므로 브라우저에서 별도 페어링할 필요가 없다.
      '/local': {
        target: `http://127.0.0.1:${runtimePort}`,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', proxyRequest => {
            if (runtimeToken) proxyRequest.setHeader('Authorization', `Bearer ${runtimeToken}`)
            proxyRequest.removeHeader('origin')
          })
        },
      },
      '/api': {
        target: `http://localhost:${process.env.VITE_BACKEND_PORT || '55555'}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    // `._*` 는 비-APFS 볼륨(T7)이 만드는 AppleDouble 사이드카로, 실제 테스트가 아니다.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '**/._*'],
  },
})
