import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Architecture boundaries (CLAUDE.md, "Non-negotiable architecture rules").
 * The Plant/Twin/Analytics split is what lets IgniSense claim its diagnosis is honest:
 * analytics only ever sees telemetry, never the injected fault state.
 * Never disable these rules.
 */
const folderPatterns = (folders) => folders.flatMap((f) => [`**/${f}`, `**/${f}/**`]);

const boundary = (files, forbidden, message) => ({
  files,
  rules: {
    'no-restricted-imports': [
      'error',
      { patterns: [{ group: folderPatterns(forbidden), message }] },
    ],
  },
});

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'docs'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.worker },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  boundary(
    ['src/analytics/**/*.{ts,tsx}'],
    ['plant', 'sources', 'worker', 'ui', 'three'],
    'analytics/ may only consume Telemetry and Twin outputs. It must never see plant or fault state.',
  ),
  boundary(
    ['src/physics/**/*.{ts,tsx}'],
    ['plant', 'twin', 'analytics', 'sources', 'worker', 'ui', 'three'],
    'physics/ holds pure shared equations. It may only import engine/ and lib/.',
  ),
  boundary(
    ['src/twin/**/*.{ts,tsx}'],
    ['plant', 'analytics', 'sources', 'worker', 'ui', 'three'],
    'twin/ is the blind healthy reference. It must never see plant or fault state.',
  ),
  boundary(
    ['src/plant/**/*.{ts,tsx}'],
    ['twin', 'analytics', 'worker', 'ui', 'three'],
    'plant/ is the simulated real engine. It must not depend on the twin or analytics.',
  ),
  prettier,
);
