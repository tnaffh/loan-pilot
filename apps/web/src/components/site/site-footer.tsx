import Link from 'next/link';
import Image from 'next/image';
import { COMPANY, NAV_LINKS } from '@/lib/site-data';

export const SiteFooter = () => {
  return (
    <footer className="bg-foreground text-background/65">
      <div className="mx-auto grid max-w-6xl gap-9 px-4 pb-10 pt-16 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Image
            src="/brand/rfs-lockup-white.png"
            alt={COMPANY.name}
            width={184}
            height={46}
            className="h-11 w-auto"
          />
          <p className="max-w-sm text-sm leading-relaxed">
            Fair, transparent short-term lending for Namibians. By Namibians, for Namibians.
          </p>
          <p className="text-xs text-background/45">{COMPANY.licence}</p>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-background">Company</h4>
          <ul className="space-y-2.5 text-sm">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="transition-colors hover:text-background">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-background">Contact</h4>
          <ul className="space-y-2.5 text-sm">
            <li>
              <a href={COMPANY.whatsappHref} className="transition-colors hover:text-background">
                WhatsApp {COMPANY.whatsapp}
              </a>
            </li>
            <li>
              <a href={COMPANY.phoneHref} className="transition-colors hover:text-background">
                {COMPANY.phone}
              </a>
            </li>
            <li>
              <a
                href={`mailto:${COMPANY.email}`}
                className="transition-colors hover:text-background"
              >
                {COMPANY.email}
              </a>
            </li>
            <li className="text-background/45">{COMPANY.address}</li>
          </ul>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-background">Responsible lending</h4>
          <p className="text-sm leading-relaxed">
            We will never lend you more than you can comfortably repay. Complaints may be referred
            to NAMFISA.
          </p>
        </div>
      </div>

      <div className="border-t border-background/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-background/45 sm:flex-row">
          <span>
            © {new Date().getFullYear()} {COMPANY.legalName}. All rights reserved.
          </span>
          <span>Powered by LoanPilot</span>
        </div>
      </div>
    </footer>
  );
};
