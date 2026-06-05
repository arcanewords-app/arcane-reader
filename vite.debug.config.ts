import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';

export default defineConfig({
  plugins: [preact()],
  root: path.resolve(__dirname, 'src/debug-app'),
  base: '/debug/',
  build: {
    outDir: path.resolve(__dirname, 'dist/debug'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@debug/shared': path.resolve(__dirname, 'src/debug/shared'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
