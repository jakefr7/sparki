import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import { baseConfig } from '../../eslint.config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  { ignores: ['next-env.d.ts', '.next/**'] },
  ...baseConfig,
  ...compat.extends('next/core-web-vitals'),
];

export default eslintConfig;
