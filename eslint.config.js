import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'civil3d-client/**/obj/**', 'civil3d-client/**/bin/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      // Pre-existing patterns in the ported codebase, downgraded to warnings
      // for this initial lint baseline rather than rewritten wholesale.
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
      'no-unsafe-finally': 'warn',
      'prefer-const': 'warn',
      'no-constant-binary-expression': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'no-case-declarations': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      'no-empty': 'warn',
    },
  },
);
