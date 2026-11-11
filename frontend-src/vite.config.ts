import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:8000';
const apiRoutes = ['/auth', '/videos', '/jobs', '/search', '/chat', '/health', '/live'];

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: Object.fromEntries(
      apiRoutes.map((route) => [route, { target: apiTarget, changeOrigin: true }]),
    ),
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    outDir: '../frontend',
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
  },
});
