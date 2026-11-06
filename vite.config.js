import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(import.meta.dirname, 'src/popup'),
  base: './',
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/popup'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome114',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
