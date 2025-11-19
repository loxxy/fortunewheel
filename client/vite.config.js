import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const devPort = parseInt(process.env.VITE_CLIENT_PORT || process.env.CLIENT_PORT || '5173', 10)

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number.isNaN(devPort) ? 5173 : devPort,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
