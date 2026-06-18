'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  EmploymentType,
  LoanType,
  createApplicationSchema,
  type CreateApplicationInput,
} from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { bumpRevalidation } from '@/lib/revalidate';
import { FieldError, selectClass } from '@/components/form-field';

const TYPE_LABELS: Record<LoanType, string> = {
  [LoanType.Payday]: 'Payday',
  [LoanType.Business]: 'Business',
  [LoanType.Collateral]: 'Collateral',
};
const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  [EmploymentType.PermanentlyEmployed]: 'Permanently employed',
  [EmploymentType.CivilServant]: 'Civil servant',
  [EmploymentType.SelfEmployed]: 'Self-employed',
  [EmploymentType.Contract]: 'Contract',
  [EmploymentType.Pensioner]: 'Pensioner',
};

const DEFAULTS: Partial<CreateApplicationInput> = {
  loanType: LoanType.Payday,
  amount: 5000,
  termMonths: 1,
  purpose: '',
  employmentType: EmploymentType.PermanentlyEmployed,
  accountType: 'Savings',
  references: [
    { name: '', phone: '' },
    { name: '', phone: '' },
  ],
  consent: true,
};

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-sm font-semibold text-foreground">{children}</h3>
);

const isApplicationField = (path: string): path is keyof CreateApplicationInput =>
  path in createApplicationSchema.shape;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewApplicationSheet = ({ open, onOpenChange }: Props) => {
  const { token } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateApplicationInput>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (open) reset(DEFAULTS);
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch('/applications/internal', { method: 'POST', body: values, token });
      toast.success('Application captured', { description: 'Affordability assessed.' });
      bumpRevalidation();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        error.issues.forEach((issue) => {
          if (isApplicationField(issue.path)) {
            setError(issue.path, { message: issue.message });
          }
        });
        toast.error(error.message);
      } else {
        toast.error('Something went wrong');
      }
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New application</SheetTitle>
          <SheetDescription>
            Capture an application on a borrower&apos;s behalf. It is priced and assessed for
            affordability, then enters the review queue.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-5 px-4 pb-4" noValidate>
          <div className="space-y-3">
            <SectionTitle>Loan</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="loanType">Type</Label>
                <select id="loanType" className={selectClass} {...register('loanType')}>
                  {Object.values(LoanType).map((value) => (
                    <option key={value} value={value}>
                      {TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="amount">Amount (N$)</Label>
                <Input id="amount" type="number" inputMode="numeric" {...register('amount')} />
                <FieldError message={errors.amount?.message} />
              </div>
              <div>
                <Label htmlFor="termMonths">Term (months)</Label>
                <Input id="termMonths" type="number" inputMode="numeric" {...register('termMonths')} />
                <FieldError message={errors.termMonths?.message} />
              </div>
            </div>
            <div>
              <Label htmlFor="purpose">Purpose (optional)</Label>
              <Input id="purpose" {...register('purpose')} />
            </div>
          </div>

          <div className="space-y-3">
            <SectionTitle>Applicant</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" {...register('firstName')} />
                <FieldError message={errors.firstName?.message} />
              </div>
              <div>
                <Label htmlFor="lastName">Surname</Label>
                <Input id="lastName" {...register('lastName')} />
                <FieldError message={errors.lastName?.message} />
              </div>
              <div>
                <Label htmlFor="idNumber">ID number</Label>
                <Input id="idNumber" {...register('idNumber')} />
                <FieldError message={errors.idNumber?.message} />
              </div>
              <div>
                <Label htmlFor="dateOfBirth">Date of birth</Label>
                <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
                <FieldError message={errors.dateOfBirth?.message} />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...register('phone')} />
                <FieldError message={errors.phone?.message} />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
                <FieldError message={errors.email?.message} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" {...register('address')} />
                <FieldError message={errors.address?.message} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <SectionTitle>Employment &amp; bank</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="employmentType">Employment type</Label>
                <select id="employmentType" className={selectClass} {...register('employmentType')}>
                  {Object.values(EmploymentType).map((value) => (
                    <option key={value} value={value}>
                      {EMPLOYMENT_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="monthlyIncome">Monthly income (N$)</Label>
                <Input id="monthlyIncome" type="number" inputMode="numeric" {...register('monthlyIncome')} />
                <FieldError message={errors.monthlyIncome?.message} />
              </div>
              <div>
                <Label htmlFor="employer">Employer</Label>
                <Input id="employer" {...register('employer')} />
                <FieldError message={errors.employer?.message} />
              </div>
              <div>
                <Label htmlFor="occupation">Occupation</Label>
                <Input id="occupation" {...register('occupation')} />
                <FieldError message={errors.occupation?.message} />
              </div>
              <div>
                <Label htmlFor="bank">Bank</Label>
                <Input id="bank" {...register('bank')} />
                <FieldError message={errors.bank?.message} />
              </div>
              <div>
                <Label htmlFor="accountType">Account type</Label>
                <Input id="accountType" {...register('accountType')} />
                <FieldError message={errors.accountType?.message} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <SectionTitle>References</SectionTitle>
            {[0, 1].map((index) => (
              <div key={index} className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`ref-${index}-name`}>Name</Label>
                  <Input id={`ref-${index}-name`} {...register(`references.${index}.name` as const)} />
                  <FieldError message={errors.references?.[index]?.name?.message} />
                </div>
                <div>
                  <Label htmlFor={`ref-${index}-phone`}>Phone</Label>
                  <Input id={`ref-${index}-phone`} {...register(`references.${index}.phone` as const)} />
                  <FieldError message={errors.references?.[index]?.phone?.message} />
                </div>
              </div>
            ))}
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Submit application
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
