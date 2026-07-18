import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';

function publicUrlPlugin() {
  const url =
    process.env.PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  return {
    name: 'public-url',
    transformIndexHtml(html: string) {
      return html.replace(/__PUBLIC_URL__/g, url || '');
    },
  };
}

export default defineConfig({
  plugins: [preact(), publicUrlPlugin()],

  root: '.', // Project root
  publicDir: 'public', // Static assets
  cacheDir: path.resolve(__dirname, 'node_modules/.vite-client'),

  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },

  server: {
    port: 5173,
    // Git Bash / MSYS crash dumps in repo root can lock on Windows and crash Vite's watcher (EBUSY).
    watch: {
      ignored: ['**/*.stackdump', '**/*.stackdump.*'],
    },
    // Proxy API requests to Express server
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/debug': {
        target: 'http://localhost:5174',
        changeOrigin: true,
      },
      '/prompt-lab': {
        target: 'http://localhost:5175',
        changeOrigin: true,
      },
      '/images': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
