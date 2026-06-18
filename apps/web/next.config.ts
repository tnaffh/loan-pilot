import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Pin the workspace root so Next does not pick up unrelated lockfiles elsewhere.
const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker images.
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
