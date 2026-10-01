import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 같은 와이파이의 폰·태블릿에서도 접속해 볼 수 있게 함
    host: true,
    port: 5173,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
