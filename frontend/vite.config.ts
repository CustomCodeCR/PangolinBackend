import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  // Fuera de Docker se usa localhost:5000; dentro de Docker "backend" es DNS interno.
  const env = loadEnv(mode, '.', 'VITE_')
  return {
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5000',
          // Mantener Host del navegador para pasar la comprobacion de Origin del backend.
          changeOrigin: false,
          ws: true,
        },
      },
    },
  }
})
