import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'no-var': 'error',
      'no-restricted-syntax': [
        'warn',
        {
          selector: "VariableDeclaration[kind='let']",
          message: 'Prefer const; avoid let (project convention).',
        },
        {
          selector: "TSAsExpression[typeAnnotation.typeName.name!='const']",
          message: 'Avoid `as` type assertions; model types so casts are unnecessary.',
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'src/components/ui/**',
    'src/hooks/**',
  ]),
]);

export default eslintConfig;
