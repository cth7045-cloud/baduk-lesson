import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // 자주 안 바뀌는 라이브러리는 따로 묶어서, 앱을 고쳐 다시 올려도 학생 기기 캐시를 그대로 씀
        manualChunks: {
          react: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    // 같은 와이파이의 폰·태블릿에서도 접속해 볼 수 있게 함
    host: true,
    port: 5173,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
