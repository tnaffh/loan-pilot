import react from '@loan-pilot/eslint-config/react';

export default [
  ...react,
  { ignores: ['.expo/**', 'expo-env.d.ts', 'src/uniwind-types.d.ts', 'metro.config.js'] },
];
