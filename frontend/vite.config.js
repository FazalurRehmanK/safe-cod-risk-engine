import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /api calls to the Express backend in development.
    // This avoids hardcoding the backend URL in the frontend.
    proxy: {
      '/api': {
        target: 'https://safe-cod-api.onrender.com',
        changeOrigin: true,
      },
    },
  },
});
