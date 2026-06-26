import type { MetadataRoute } from 'next';

// The dashboard is a private, authenticated portal — disallow all crawling.
const robots = (): MetadataRoute.Robots => ({
  rules: { userAgent: '*', disallow: '/' },
});

export default robots;
