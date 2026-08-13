import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const isolatedDatabase = process.env.SPARKI_ISOLATED_TEST_DATABASE;
const configuredDatabase = process.env.DATABASE_URL
  ? decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1))
  : undefined;

if (
  !isolatedDatabase ||
  configuredDatabase !== isolatedDatabase ||
  !/^sparki_test_integration_[a-f0-9]{32}$/.test(isolatedDatabase)
) {
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
