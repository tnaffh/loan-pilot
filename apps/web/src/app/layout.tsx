import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono, Spectral } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { COMPANY, SITE_DESCRIPTION, SITE_URL } from '@/lib/site-data';
import { structuredData } from '@/lib/seo';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';
import { Toaster } from '@/components/ui/sonner';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const heading = Spectral({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-heading',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

const TITLE = 'Raccoons Financial Services — Fair lending in Namibia, regulated by NAMFISA';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s · Raccoons Financial Services',
  },
  description: SITE_DESCRIPTION,
  applicationName: COMPANY.name,
  keywords: [
    'loans Namibia',
    'microlender Namibia',
    'payday loan Windhoek',
    'short-term loan Namibia',
    'cash loan Namibia',
    'business loan Namibia',
    'NAMFISA registered lender',
    'Raccoons Financial Services',
  ],
  authors: [{ name: COMPANY.name, url: SITE_URL }],
  creator: COMPANY.name,
  publisher: COMPANY.legalName,
  category: 'finance',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: COMPANY.name,
    title: TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_NA',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  formatDetection: { telephone: true, address: true, email: true },
};

export const viewport: Viewport = {
  themeColor: '#25397a',
  colorScheme: 'light',
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <html
      lang="en"
      className={cn('h-full antialiased', sans.variable, heading.variable, mono.variable)}
    >
      <body className="flex min-h-full flex-col font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
};

export default RootLayout;
