import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.app.json',
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-console': 'error',
      // Dev-time half of the D-036 bundle-isolation guarantee. The CI
      // manifest check (scripts/check-bundle-isolation.mjs) enforces the
      // same boundary on the emitted apex artifact.
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/surfaces/portal',
              from: ['./src/surfaces/firm', './src/surfaces/admin'],
              message: 'External portal tree must not import firm/admin code (D-036).',
            },
            {
              target: './src/surfaces/collab',
              from: ['./src/surfaces/firm', './src/surfaces/admin'],
              message: 'External collab tree must not import firm/admin code (D-036).',
            },
            {
              target: './src/surfaces/firm',
              from: ['./src/surfaces/portal', './src/surfaces/collab'],
              message: 'Firm tree must not import external portal/collab code (D-036).',
            },
            {
              target: './src/surfaces/admin',
              from: ['./src/surfaces/portal', './src/surfaces/collab'],
              message: 'Admin tree must not import external portal/collab code (D-036).',
            },
            {
              target: './src/surfaces/marketing',
              from: [
                './src/surfaces/portal',
                './src/surfaces/collab',
                './src/surfaces/firm',
                './src/surfaces/admin',
              ],
              message: 'Marketing may only use shared code, never other surfaces (D-036).',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
