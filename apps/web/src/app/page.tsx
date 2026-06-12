import Link from 'next/link';
import { ArrowRight, Clock, FileCheck, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PaydayCalculator } from '@/components/site/payday-calculator';
import { PRODUCTS, REQUIREMENTS, TRUST_STATS } from '@/lib/site-data';

const HomePage = () => {
  return (
    <>
      {/* Hero */}
      <section>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-20">
          <div className="space-y-6">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              By Namibians, for Namibians
            </span>
            <h1 className="text-4xl leading-tight sm:text-5xl lg:text-6xl">
              Borrow with{' '}
              <em className="relative z-0 italic text-primary after:absolute after:inset-x-0 after:bottom-[0.06em] after:-z-10 after:h-[0.16em] after:bg-highlight">
                clarity
              </em>
              , repay with confidence.
            </h1>
            <p className="max-w-md text-lg text-muted-foreground">
              Fair, transparent loans for Namibians — from quick short-term cash to business
              finance and asset-backed lending. Every cost shown before you sign.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" render={<Link href="/apply" />}>
                Apply now <ArrowRight />
              </Button>
              <Button size="lg" variant="outline" render={<Link href="/loans" />}>
                Explore loans
              </Button>
            </div>
            <dl className="grid grid-cols-3 gap-4 pt-4">
              {TRUST_STATS.map((stat) => (
                <div key={stat.label}>
                  <dt className="font-heading text-2xl font-semibold text-primary">{stat.value}</dt>
                  <dd className="text-xs text-muted-foreground">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <PaydayCalculator />
        </div>
      </section>

      {/* Regulated strip */}
      <section className="bg-foreground text-background/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-7 text-sm md:flex-row">
          <p className="font-heading text-lg italic text-background">
            “We will never lend you more than you can comfortably repay.”
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-1 text-[13px]">
            <span>
              Registered with <strong className="font-semibold text-background">NAMFISA</strong>
            </span>
            <span>
              <strong className="font-semibold text-background">Fixed, transparent</strong> pricing
            </span>
            <span>
              <strong className="font-semibold text-background">Responsible lending</strong> first
            </span>
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Our loans
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl">A loan for every need</h2>
          <p className="mt-3 text-muted-foreground">
            From quick short-term cash to business growth and asset-backed finance — each one
            assessed responsibly around what you can comfortably afford.
          </p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PRODUCTS.map((product) => (
            <Card key={product.id}>
              <CardContent className="space-y-3 py-6">
                <h3 className="text-lg">{product.title}</h3>
                <p className="text-sm text-muted-foreground">{product.blurb}</p>
                <div className="flex gap-6 pt-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Repay in</div>
                    <div className="font-medium">{product.term}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Collateral</div>
                    <div className="font-medium">{product.collateral}</div>
                  </div>
                </div>
                <Link
                  href="/loans"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Learn more <ArrowRight className="size-3.5" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl">How it works</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: FileCheck,
                title: 'Apply in 5 minutes',
                body: 'Tell us about you and the loan you need. No paperwork queues.',
              },
              {
                icon: ShieldCheck,
                title: 'Affordability check',
                body: 'We assess your income responsibly so you always keep at least 50%.',
              },
              {
                icon: Clock,
                title: 'Fast, transparent offer',
                body: 'Get a clear offer with every cost shown before you sign.',
              },
            ].map((item) => (
              <div key={item.title} className="space-y-3">
                <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="size-5" />
                </div>
                <h3 className="text-lg">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-xl border bg-background p-6">
            <h3 className="text-lg">What you will need</h3>
            <ul className="mt-4 grid gap-2 sm:grid-cols-3">
              {REQUIREMENTS.map((requirement) => (
                <li key={requirement} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <FileCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  {requirement}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="rounded-3xl bg-brand-deep px-6 py-16 text-center text-white">
          <h2 className="text-3xl text-white sm:text-4xl">Ready to apply?</h2>
          <p className="mx-auto mt-4 max-w-md text-white/75">
            Get a transparent offer with no hidden costs, assessed around what you can comfortably
            afford.
          </p>
          <Button
            size="lg"
            className="mt-7 bg-white text-foreground hover:bg-white/90"
            render={<Link href="/apply" />}
          >
            Start my application <ArrowRight />
          </Button>
        </div>
      </section>
    </>
  );
};

export default HomePage;
