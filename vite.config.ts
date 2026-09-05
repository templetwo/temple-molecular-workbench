import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  // Prepare the lazy lesson's UI dependency before a user opens the dialog.
  // Late optimization otherwise forces a dev-page reload during first use.
  optimizeDeps: {
    entries: ['index.html'],
    include: ['@radix-ui/react-tabs'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: { ignored: ['**/release/**', '**/.venv-electrons/**'] },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
