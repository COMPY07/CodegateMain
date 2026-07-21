import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vibe Studio 프리뷰 브리지를 개발 서버에서만 주입한다.
// (프로덕션 빌드에는 포함되지 않는다.)
function vibePreviewBridge() {
  return {
    name: 'vibe-preview-bridge',
    apply: 'serve',
    transformIndexHtml() {
      return [{
        tag: 'script',
        attrs: { src: '/vibe-preview-bridge.js' },
        injectTo: 'body',
      }]
    },
  }
}

// Vibe Studio 에이전트가 편집하는 데모 프로젝트.
export default defineConfig({
  plugins: [react(), vibePreviewBridge()],
  server: {
    port: 5190,
    host: '127.0.0.1',
    strictPort: false,
    // 스튜디오(5180)가 iframe 으로 임베드한다.
    cors: true,
  },
})
