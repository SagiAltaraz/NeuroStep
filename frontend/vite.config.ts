import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy for your admin and other API routes
      '/api': {
        target: 'http://localhost:3000',  // Your Express backend
        changeOrigin: true,
        secure: false,
      },
      // Keep this if you have an AI endpoint
      '/askAI': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});