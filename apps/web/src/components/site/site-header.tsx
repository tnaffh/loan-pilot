'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { MessageCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { COMPANY, NAV_LINKS } from '@/lib/site-data';

export const SiteHeader = () => {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40">
      <div className="bg-foreground text-background/75">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-1 px-4 py-2 text-[13px] sm:flex-row">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-3.5" />
            Registered microlender · Regulated by NAMFISA · {COMPANY.licence}
          </span>
          <span className="flex items-center gap-4">
            {COMPANY.phones.map((phone, index) => (
              <span
                key={phone.display}
                className={cn('flex items-center gap-1.5', index > 0 && 'hidden sm:flex')}
              >
                <a className="transition-colors hover:text-background" href={phone.tel}>
                  {phone.display}
                </a>
                <a
                  className="transition-colors hover:text-background"
                  href={phone.whatsapp}
                  aria-label={`WhatsApp ${phone.display}`}
                >
                  <MessageCircle className="size-3.5" />
                </a>
              </span>
            ))}
          </span>
        </div>
      </div>

      <div className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center" aria-label={COMPANY.name}>
            <Image
              src="/brand/rfs-lockup.png"
              alt={COMPANY.name}
              width={180}
              height={44}
              className="h-9 w-auto"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'border-b-2 py-1 text-[15px] font-medium transition-colors',
                    active
                      ? 'border-highlight font-semibold text-primary'
                      : 'border-transparent text-foreground/65 hover:text-foreground',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" render={<Link href="/contact" />} className="hidden sm:inline-flex">
              Talk to us
            </Button>
            <Button size="sm" render={<Link href="/apply" />}>
              Apply now
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
