import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';

export default defineConfig({
  plugins: [preact()],
  
  root: '.', // Project root
  publicDir: 'public', // Static assets
  
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
    },
  },
  
  server: {
    port: 5173,
    // Proxy API requests to Express server
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/images': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});

