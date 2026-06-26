import type { Metadata } from 'next';
import { COMPANY, SITE_DESCRIPTION, SITE_URL } from '@/lib/site-data';

/**
 * JSON-LD structured data for the organisation and website. Emitted once in the
 * root layout so search engines get a rich, machine-readable description of the
 * business (name, contact, location, regulator) and the site itself.
 */
export const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'FinancialService',
      '@id': `${SITE_URL}/#organization`,
      name: COMPANY.name,
      legalName: COMPANY.legalName,
      url: SITE_URL,
      logo: `${SITE_URL}/brand/rfs-lockup.png`,
      image: `${SITE_URL}/icon-512.png`,
      email: COMPANY.email,
      telephone: COMPANY.phones[0].display,
      description: SITE_DESCRIPTION,
      slogan: 'Fair lending in Namibia',
      areaServed: { '@type': 'Country', name: 'Namibia' },
      address: {
        '@type': 'PostalAddress',
        streetAddress: COMPANY.address,
        addressLocality: 'Windhoek',
        addressCountry: 'NA',
      },
      contactPoint: COMPANY.phones.map((phone) => ({
        '@type': 'ContactPoint',
        telephone: phone.display,
        contactType: 'customer service',
        areaServed: 'NA',
        availableLanguage: ['en'],
      })),
      knowsAbout: ['Microlending', 'Short-term loans', 'NAMFISA regulation'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: COMPANY.name,
      description: SITE_DESCRIPTION,
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'en',
    },
  ],
};

/**
 * A complete Open Graph object for a sub-page. The App Router merges metadata
 * shallowly per top-level key, so a page that declares its own `openGraph`
 * fully replaces the root layout's — and the file-based opengraph-image.png is
 * NOT back-filled. Re-supply the shared fields (type/siteName/locale/image) here
 * so sub-pages keep a full social card with a preview image.
 */
export const pageOpenGraph = (opts: {
  title: string;
  description: string;
  path: string;
}): Metadata['openGraph'] => ({
  type: 'website',
  siteName: COMPANY.name,
  locale: 'en_NA',
  title: opts.title,
  description: opts.description,
  url: opts.path,
  images: [{ url: '/opengraph-image.png', width: 1200, height: 630, alt: COMPANY.name }],
});
