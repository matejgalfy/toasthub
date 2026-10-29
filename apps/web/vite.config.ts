import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Bundle @toasthub/shared from source so it needs no build step and hot-reloads.
    conditions: ['@toasthub/source', ...defaultClientConditions],
  },
});
