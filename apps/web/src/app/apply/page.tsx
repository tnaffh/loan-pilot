import type { Metadata } from 'next';
import { ApplyForm } from '@/components/site/apply-form';

export const metadata: Metadata = {
  title: 'Apply',
  description: 'Apply for a Raccoons loan in about five minutes.',
};

const ApplyPage = () => {
  return (
    <section>
      <div className="mx-auto max-w-3xl px-4 py-14">
        <div className="mb-8 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Loan application
          </span>
          <h1 className="mt-2 text-4xl">
            Apply in <em className="italic text-primary">about five minutes</em>
          </h1>
          <p className="mt-3 text-muted-foreground">
            Tell us a little about you and the loan you need — we will do an affordability check and
            come back with a transparent offer.
          </p>
        </div>
        <ApplyForm />
      </div>
    </section>
  );
};

export default ApplyPage;
