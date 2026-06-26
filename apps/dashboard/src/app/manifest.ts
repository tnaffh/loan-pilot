import type { MetadataRoute } from 'next';

const manifest = (): MetadataRoute.Manifest => ({
  name: 'LoanPilot Dashboard',
  short_name: 'LoanPilot',
  description: 'Micro-lending management portal.',
  start_url: '/',
  display: 'standalone',
  background_color: '#f7f6f3',
  theme_color: '#25397a',
  lang: 'en',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
});

export default manifest;
