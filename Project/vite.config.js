import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 스튜디오의 질문 모드(요소 클릭 → 칩)를 위한 브리지. dev 서버에서만 주입되고
// 프로덕션 빌드에는 들어가지 않는다.
const previewBridge = () => ({
  name: 'vibe-preview-bridge',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html.replace('</body>', '<script src="/vibe-preview-bridge.js"></script></body>'),
})

export default defineConfig({
  plugins: [react(), previewBridge()],
  server: { host: '127.0.0.1' },
})
