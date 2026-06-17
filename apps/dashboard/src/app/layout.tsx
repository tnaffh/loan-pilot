import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono, Spectral } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { AuthProvider } from '@/lib/auth-context';
import { TenantThemeProvider } from '@/lib/tenant-theme';
import { Toaster } from '@/components/ui/sonner';

// Applies the persisted tenant accent before first paint to avoid a colour flash.
const ACCENT_BOOTSTRAP = `(function(){try{var a=localStorage.getItem('lp_accent');if(a&&/^#[0-9a-fA-F]{6}$/.test(a)){document.documentElement.style.setProperty('--brand',a);document.documentElement.setAttribute('data-tenant','');}}catch(e){}})();`;

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: ACCENT_BOOTSTRAP }} />
      </head>
      <body className="min-h-full font-sans">
        <AuthProvider>
          <TenantThemeProvider>{children}</TenantThemeProvider>
        </AuthProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
};

export default RootLayout;
