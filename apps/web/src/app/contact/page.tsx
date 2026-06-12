import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { COMPANY } from '@/lib/site-data';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with Raccoons Financial Services in Windhoek, Namibia.',
};

const ContactPage = () => {
  const channels = [
    { icon: MessageCircle, label: 'WhatsApp', value: COMPANY.whatsapp, href: COMPANY.whatsappHref },
    { icon: Phone, label: 'Phone', value: COMPANY.phone, href: COMPANY.phoneHref },
    { icon: Mail, label: 'Email', value: COMPANY.email, href: `mailto:${COMPANY.email}` },
    { icon: MapPin, label: 'Visit us', value: COMPANY.address, href: undefined },
  ];

  return (
    <>
      <section className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Contact
          </span>
          <h1 className="mt-2 text-4xl sm:text-5xl">Talk to us</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            We are here to help. Reach out on WhatsApp for the fastest response, or start your
            application online.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-2">
        <div className="grid gap-4 sm:grid-cols-2">
          {channels.map((channel) => (
            <Card key={channel.label}>
              <CardContent className="space-y-2 py-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <channel.icon className="size-5" />
                </div>
                <div className="text-sm text-muted-foreground">{channel.label}</div>
                {channel.href ? (
                  <a href={channel.href} className="font-medium hover:text-primary">
                    {channel.value}
                  </a>
                ) : (
                  <div className="font-medium">{channel.value}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="flex h-full flex-col justify-center gap-4 py-8 text-center">
            <h2 className="text-2xl">Prefer to get started now?</h2>
            <p className="text-muted-foreground">
              Apply online in about five minutes and we will come back with a transparent offer.
            </p>
            <Button size="lg" render={<Link href="/apply" />} className="mx-auto">
              Apply now
            </Button>
            <p className="text-xs text-muted-foreground">
              Complaints can be referred to NAMFISA. {COMPANY.licence}.
            </p>
          </CardContent>
        </Card>
      </section>
    </>
  );
};

export default ContactPage;
