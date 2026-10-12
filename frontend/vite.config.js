import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/auth': 'http://127.0.0.1:4001',
      '/api/products': 'http://127.0.0.1:4002',
      '/api/orders': 'http://127.0.0.1:4003',
    },
  },
})
