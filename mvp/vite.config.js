import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Desktop 포팅(Tauri/Electron) 시 그대로 재사용 가능한 웹 프론트엔드.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, host: true, strictPort: false },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
