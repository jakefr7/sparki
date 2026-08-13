import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const isolatedSchema = process.env.SPARKI_ISOLATED_TEST_SCHEMA;
const configuredSchema = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL).searchParams.get('schema')
  : undefined;

if (
  !isolatedSchema ||
  configuredSchema !== isolatedSchema ||
  !isolatedSchema.startsWith('sparki_test_integration_')
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
