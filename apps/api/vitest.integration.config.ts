import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

if (!process.env.DATABASE_URL) {
  throw new Error('Integration tests require an isolated DATABASE_URL. Run pnpm test:integration.');
}

process.env.NODE_ENV = 'test';
process.env.API_PORT ??= '4000';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
