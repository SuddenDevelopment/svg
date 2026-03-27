import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

function manualChunks(id: string) {
  if (!id.includes('node_modules')) {
    return undefined;
  }

  if (id.includes('/react/') || id.includes('/react-dom/')) {
    return 'react-vendor';
  }

  if (id.includes('/opentype.js/')) {
    return 'font-tools';
  }

  if (id.includes('/svg-pathdata/') || id.includes('/svgson/') || id.includes('/css-tree/')) {
    return 'svg-tools';
  }

  return 'vendor';
}

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    testTimeout: 15000,
  },
});
