import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const nextConfig: NextConfig = {
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
