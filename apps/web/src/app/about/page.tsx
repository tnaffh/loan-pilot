import type { Metadata } from 'next';
import { Building2, HeartHandshake, Lightbulb, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { pageOpenGraph } from '@/lib/seo';

const description =
  'Raccoons Financial Services — established 2019, a NAMFISA-regulated Namibian microlender redefining responsible short-term lending.';

export const metadata: Metadata = {
  title: 'About',
  description,
  alternates: { canonical: '/about' },
  openGraph: pageOpenGraph({ title: 'About · Raccoons Financial Services', description, path: '/about' }),
};

const VALUES = [
  {
    icon: Lightbulb,
    title: 'Efficiency & innovation',
    body: 'Innovative channels that let clients access financing with ease and a short turnaround.',
  },
  {
    icon: HeartHandshake,
    title: 'Customer-centric',
    body: 'Every decision is made with the customer in mind, ensuring a memorable experience.',
  },
  {
    icon: Users,
    title: 'Community responsibility',
    body: 'By lending responsibly, we contribute positively to the society we are part of.',
  },
  {
    icon: Building2,
    title: 'Accessibility',
    body: 'We simplify the complexities of financial systems for individuals across Namibia.',
  },
];

const AboutPage = () => {
  return (
    <>
      <section className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            About us
          </span>
          <h1 className="mt-2 text-4xl sm:text-5xl">
            By Namibians, <em className="italic text-primary">for Namibians</em>
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Established in 2019 and fully operational since October 2023, Raccoons Financial
            Services set out to close a clear gap: financial services that left borrowers feeling
            overwhelmed and underserved. Under the supervision of NAMFISA, we redefine the lending
            process with flexibility and a tailored, client-centric approach.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-3xl">What we believe</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {VALUES.map((value) => (
            <Card key={value.title}>
              <CardContent className="flex gap-4 py-6">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <value.icon className="size-5" />
                </div>
                <div>
                  <h3 className="text-lg">{value.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{value.body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-3xl">Our vision</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            To consistently evolve and become the foremost choice for personal credit solutions in
            Namibia, setting industry standards and benchmarks along the way.
          </p>
        </div>
      </section>
    </>
  );
};

export default AboutPage;
