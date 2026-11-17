import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compila los decoradores de NestJS con sus metadatos.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
