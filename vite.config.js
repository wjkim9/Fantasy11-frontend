import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  define: {
    global: "window", // 브라우저에서 global → window 로 대체
  },
})
