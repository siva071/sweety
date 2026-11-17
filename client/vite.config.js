import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on http://localhost:5000 — /api calls are
// proxied there so the frontend needs no extra config.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});
