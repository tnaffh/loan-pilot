import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono, Spectral } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { AuthProvider } from '@/lib/auth-context';
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
    default: 'LoanPilot Dashboard',
    template: '%s · LoanPilot',
  },
  description: 'Multi-tenant micro-lending management dashboard.',
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <html
      lang="en"
      className={cn('h-full antialiased', sans.variable, heading.variable, mono.variable)}
    >
      <body className="min-h-full font-sans">
        <AuthProvider>{children}</AuthProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
};

export default RootLayout;
