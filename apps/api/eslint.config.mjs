import base from '@loan-pilot/eslint-config/base';

export default [
  ...base,
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      sourceType: 'module',
    },
    rules: {
      // Nest relies on parameter decorators and DI patterns.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
