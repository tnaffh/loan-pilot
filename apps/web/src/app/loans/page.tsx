import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PRODUCTS, REQUIREMENTS } from '@/lib/site-data';

export const metadata: Metadata = {
  title: 'Loans',
  description:
    'Short-term, business and collateral-backed loans for Namibians — assessed responsibly, regulated by NAMFISA.',
};

const LoansPage = () => {
  return (
    <>
      <section className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <p className="text-[13px] text-muted-foreground">
            <Link href="/" className="hover:text-primary">
              Home
            </Link>{' '}
            · Loans
          </p>
          <h1 className="mt-2 text-4xl sm:text-5xl">
            Loans built around what you can{' '}
            <em className="italic text-primary">afford</em>
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Every Raccoons loan is priced transparently and capped within NAMFISA limits — finance
            charges never exceed 30% of the amount borrowed, and terms run up to five months.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-8 px-4 py-14">
        {PRODUCTS.map((product) => (
          <Card key={product.id} id={product.id}>
            <CardContent className="grid gap-6 py-8 md:grid-cols-3">
              <div className="md:col-span-2 md:border-r md:pr-6">
                <h2 className="text-2xl">{product.title}</h2>
                <p className="mt-2 text-muted-foreground">{product.blurb}</p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[
                    'No hidden fees — costs shown upfront',
                    'Affordability assessed before any offer',
                    'Settle early with no penalty',
                    'Repay over up to five months',
                  ].map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col justify-between gap-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Term</span>
                    <span className="font-medium">{product.term}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Collateral</span>
                    <span className="font-medium">{product.collateral}</span>
                  </div>
                </div>
                <Button render={<Link href="/apply" />}>
                  Apply <ArrowRight />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardContent className="py-8">
            <h2 className="text-xl">What you will need to apply</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-3">
              {REQUIREMENTS.map((requirement) => (
                <li key={requirement} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {requirement}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </>
  );
};

export default LoansPage;
