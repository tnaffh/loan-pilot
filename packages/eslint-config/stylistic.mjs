import stylistic from '@stylistic/eslint-plugin';

/**
 * Blank-line rules Prettier doesn't cover: it keeps blank lines but never adds
 * them. Separates declarations, blocks and returns so code reads in paragraphs.
 * All auto-fixable with `eslint --fix`.
 */
export default [
  {
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/padding-line-between-statements': [
        'error',
        // Blank line after `'use client'` and other directives.
        { blankLine: 'always', prev: 'directive', next: '*' },
        // Blank line after a run of declarations, but not between them.
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
        // Blank line before and after control-flow statements and blocks.
        { blankLine: 'always', prev: '*', next: ['if', 'for', 'while', 'do', 'switch', 'try'] },
        { blankLine: 'always', prev: 'block-like', next: '*' },
        // Blank line before every return.
        { blankLine: 'always', prev: '*', next: 'return' },
      ],
    },
  },
];
