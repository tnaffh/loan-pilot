'use client';

import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { bumpRevalidation } from '@/lib/revalidate';
import { FormField } from '@/components/form-field';

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
const ACCOUNT_TYPES = ['Savings', 'Cheque', 'Transmission'];

const DEFAULTS: Partial<CreateApplicationInput> = {
  loanType: LoanType.Payday,
  amount: 5000,
  termMonths: 1,
  purpose: '',
  dateOfBirth: '',
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
  path in createApplicationSchema.innerType().shape;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewApplicationSheet = ({ open, onOpenChange }: Props) => {
  const { token } = useAuth();
  const {
    register,
    control,
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
        <form onSubmit={onSubmit} className="space-y-6 px-4 pb-4" noValidate>
          <div className="space-y-4">
            <SectionTitle>Loan</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Type" htmlFor="loanType">
                <Controller
                  control={control}
                  name="loanType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="loanType" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(LoanType).map((value) => (
                          <SelectItem key={value} value={value}>
                            {TYPE_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Amount (N$)" htmlFor="amount" error={errors.amount?.message}>
                <Input id="amount" type="number" inputMode="numeric" {...register('amount')} />
              </FormField>
              <FormField label="Term (months)" htmlFor="termMonths" error={errors.termMonths?.message}>
                <Input id="termMonths" type="number" inputMode="numeric" {...register('termMonths')} />
              </FormField>
            </div>
            <FormField label="Purpose" htmlFor="purpose" optional>
              <Input id="purpose" {...register('purpose')} />
            </FormField>
          </div>

          <div className="space-y-4">
            <SectionTitle>Applicant</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="First name" htmlFor="firstName" error={errors.firstName?.message}>
                <Input id="firstName" {...register('firstName')} />
              </FormField>
              <FormField label="Surname" htmlFor="lastName" error={errors.lastName?.message}>
                <Input id="lastName" {...register('lastName')} />
              </FormField>
              <FormField
                label="ID number"
                htmlFor="idNumber"
                error={errors.idNumber?.message}
                description="Namibian 11-digit ID or passport"
              >
                <Input id="idNumber" inputMode="numeric" {...register('idNumber')} />
              </FormField>
              <FormField label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth?.message}>
                <Controller
                  control={control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <DatePicker
                      id="dateOfBirth"
                      value={field.value}
                      onChange={field.onChange}
                      disableFuture
                    />
                  )}
                />
              </FormField>
              <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
                <Input id="phone" type="tel" inputMode="tel" {...register('phone')} />
              </FormField>
              <FormField label="Email" htmlFor="email" error={errors.email?.message}>
                <Input id="email" type="email" {...register('email')} />
              </FormField>
              <FormField
                label="Address"
                htmlFor="address"
                error={errors.address?.message}
                className="sm:col-span-2"
              >
                <Input id="address" {...register('address')} />
              </FormField>
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle>Employment &amp; bank</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Employment type" htmlFor="employmentType">
                <Controller
                  control={control}
                  name="employmentType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="employmentType" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(EmploymentType).map((value) => (
                          <SelectItem key={value} value={value}>
                            {EMPLOYMENT_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField
                label="Monthly income (N$)"
                htmlFor="monthlyIncome"
                error={errors.monthlyIncome?.message}
              >
                <Input id="monthlyIncome" type="number" inputMode="numeric" {...register('monthlyIncome')} />
              </FormField>
              <FormField label="Employer" htmlFor="employer" error={errors.employer?.message}>
                <Input id="employer" {...register('employer')} />
              </FormField>
              <FormField label="Occupation" htmlFor="occupation" error={errors.occupation?.message}>
                <Input id="occupation" {...register('occupation')} />
              </FormField>
              <FormField label="Bank" htmlFor="bank" error={errors.bank?.message}>
                <Input id="bank" {...register('bank')} />
              </FormField>
              <FormField label="Account type" htmlFor="accountType" error={errors.accountType?.message}>
                <Controller
                  control={control}
                  name="accountType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="accountType" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle>References</SectionTitle>
            {[0, 1].map((index) => (
              <div key={index} className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="Name"
                  htmlFor={`ref-${index}-name`}
                  error={errors.references?.[index]?.name?.message}
                >
                  <Input id={`ref-${index}-name`} {...register(`references.${index}.name` as const)} />
                </FormField>
                <FormField
                  label="Phone"
                  htmlFor={`ref-${index}-phone`}
                  error={errors.references?.[index]?.phone?.message}
                >
                  <Input
                    id={`ref-${index}-phone`}
                    type="tel"
                    inputMode="tel"
                    {...register(`references.${index}.phone` as const)}
                  />
                </FormField>
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
