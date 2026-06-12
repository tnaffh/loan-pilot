import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Shared base ESLint flat config for all LoanPilot packages.
 * Encodes the project conventions: prefer arrow functions, no `let`,
 * and discourage unsafe `as` type assertions.
 */
export default tseslint.config(
  { ignores: ['dist/**', '.next/**', 'out/**', 'build/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'prefer-const': 'off',
      'no-var': 'error',
      'no-restricted-syntax': [
        'warn',
        {
          selector: "VariableDeclaration[kind='let']",
          message: 'Prefer const; avoid let (project convention).',
        },
        {
          // Allow `as const` assertions; discourage real type casts.
          selector: "TSAsExpression[typeAnnotation.typeName.name!='const']",
          message: 'Avoid `as` type assertions; model types so casts are unnecessary.',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
);
