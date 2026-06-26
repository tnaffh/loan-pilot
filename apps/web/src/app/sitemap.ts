import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-data';

const ROUTES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/loans', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/apply', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.6, changeFrequency: 'monthly' },
];

const sitemap = (): MetadataRoute.Sitemap =>
  ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));

export default sitemap;
