import type { ReactNode } from 'react';

const NAVY = '#25397a';
const DEEP = '#1b2a5e';
const LIME = '#d7df21';

/** The brand wordmark used across auth screens. */
const Wordmark = ({ className }: { className?: string }) => (
  <span className={className}>
    Loan<span style={{ color: LIME }}>Pilot</span>
  </span>
);

/**
 * Shared, on-brand shell for the public auth screens (login, invite, forgot,
 * reset): a card with the form on the left and the Raccoons navy/lime hero on
 * the right. Pure presentation — pages supply the form via `children`.
 */
export const AuthShell = ({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <div className="flex min-h-svh flex-col items-center justify-center bg-[#f7f6f3] p-6 md:p-10 dark:bg-background">
    <div className="w-full max-w-sm md:max-w-3xl">
      <div className="grid overflow-hidden rounded-2xl border bg-card shadow-sm md:grid-cols-2">
        <div className="flex flex-col p-7 md:p-9">
          <Wordmark className="mb-8 text-lg font-bold" />
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>

        <div
          className="relative hidden flex-col justify-between p-9 text-white md:flex"
          style={{ background: `linear-gradient(160deg, ${NAVY} 0%, ${DEEP} 100%)` }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />
          <Wordmark className="relative text-xl font-bold" />
          <div className="relative">
            <div
              className="mb-5 h-1 w-12 rounded-full"
              style={{ backgroundColor: LIME }}
            />
            <p className="font-heading text-2xl font-semibold leading-snug">
              Micro-lending management, built for Namibian lenders.
            </p>
            <p className="mt-3 text-sm text-white/70">
              Applications, loans, repayments and reporting — in one place.
            </p>
          </div>
          <span className="relative text-xs text-white/50">By Namibians, for Namibians.</span>
        </div>
      </div>
      {footer ? <div className="mt-4 text-center">{footer}</div> : null}
    </div>
  </div>
);
