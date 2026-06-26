import type { MetadataRoute } from 'next';
import { COMPANY, SITE_DESCRIPTION } from '@/lib/site-data';

const manifest = (): MetadataRoute.Manifest => ({
  name: COMPANY.name,
  short_name: COMPANY.short,
  description: SITE_DESCRIPTION,
  start_url: '/',
  display: 'standalone',
  background_color: '#f7f6f3',
  theme_color: '#25397a',
  lang: 'en',
  categories: ['finance'],
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
});

export default manifest;
