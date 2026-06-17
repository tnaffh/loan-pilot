import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { cn } from '@/lib/utils';
import { AuthProvider } from '@/lib/auth-context';
import { TenantThemeProvider } from '@/lib/tenant-theme';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';

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
      suppressHydrationWarning
      className={cn('h-full antialiased', GeistSans.variable, GeistMono.variable)}
    >
      <body className="min-h-full font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <TenantThemeProvider>{children}</TenantThemeProvider>
          </AuthProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
