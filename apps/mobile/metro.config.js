// Expo's default config already understands the pnpm/Turborepo monorepo
// (watch folders, hoisted node_modules, `@loan-pilot/domain` via exports).
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// React Native's renderer demands the exact `react` version it was built for
// (19.2.3 on this SDK), while the Next.js apps hoist 19.2.4 to the repo root.
// Resolve every `react` import — including ones from hoisted libraries like
// react-native itself — from this app's own copy.
const appOrigin = path.join(__dirname, 'package.json');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    return context.resolveRequest(
      { ...context, originModulePath: appOrigin },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Uniwind (Tailwind v4 for React Native) must be the outermost wrapper.
module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
