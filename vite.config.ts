import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig(() => ({
  plugins: [react()],
  define: {
    __CUSTOMER_APP__: true,
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    rollupOptions: {
      input: {
        admin: resolve(process.cwd(), 'index.html'),
        customer: resolve(process.cwd(), 'customer.html'),
      },
    },
  },
}))
