import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono, Spectral } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
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

export const metadata: Metadata = {
  title: {
    default: 'Raccoons Financial Services — Fair lending in Namibia, regulated by NAMFISA',
    template: '%s · Raccoons Financial Services',
  },
  description:
    'Fair, transparent short-term loans for Namibians. Registered microlender regulated by NAMFISA. Every cost shown before you sign.',
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <html
      lang="en"
      className={cn('h-full antialiased', sans.variable, heading.variable, mono.variable)}
    >
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
};

export default RootLayout;
