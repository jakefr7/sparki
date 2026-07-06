import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Defaults match docker-compose.yml so `docker compose up -d && pnpm test`
// works out of the box. Never overrides an already-set env var, so CI (or a
// developer pointing at a different database) always wins.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://sparki:sparki@localhost:55432/sparki?schema=public';
process.env.API_PORT ??= '4000';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    // e2e specs share one real Postgres instance and a single fixed dev
    // identity (DEV_ORGANIZATION_ID, see src/auth/development-user.service.ts).
    // Running spec files concurrently lets one file's cleanup race another
    // file's still-running assertions against the same organization's rows.
    fileParallelism: false,
  },
  // .swcrc sets module.type to commonjs for `nest build`; Vitest's own
  // runtime is ESM, so override it here rather than in .swcrc.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
