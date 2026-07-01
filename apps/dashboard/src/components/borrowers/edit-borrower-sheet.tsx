'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  EmploymentType,
  GENDER_OPTIONS,
  PAY_DAY_OPTIONS,
  fromCents,
  updateBorrowerSchema,
  type UpdateBorrowerInput,
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
import { FormField, selectClass } from '@/components/form-field';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { BorrowerDetail } from '@/lib/types';

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  [EmploymentType.PermanentlyEmployed]: 'Permanently employed',
  [EmploymentType.CivilServant]: 'Civil servant',
  [EmploymentType.SelfEmployed]: 'Self-employed',
  [EmploymentType.Contract]: 'Contract',
  [EmploymentType.Pensioner]: 'Pensioner',
};

const isBorrowerField = (path: string): path is keyof UpdateBorrowerInput =>
  path in updateBorrowerSchema.shape;

interface Props {
  borrower: BorrowerDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export const EditBorrowerSheet = ({ borrower, open, onOpenChange, onSaved }: Props) => {
  const { token } = useAuth();

  // Keep a legacy/imported pay-day value selectable so editing doesn't drop it.
  const payDayOptions =
    borrower.payDay && !PAY_DAY_OPTIONS.some((option) => option === borrower.payDay)
      ? [borrower.payDay, ...PAY_DAY_OPTIONS]
      : PAY_DAY_OPTIONS;

  const defaults = (): UpdateBorrowerInput => ({
    firstName: borrower.firstName,
    lastName: borrower.lastName,
    idNumber: borrower.idNumber,
    phone: borrower.phone,
    email: borrower.email,
    employer: borrower.employer,
    occupation: borrower.occupation,
    monthlyIncome: fromCents(borrower.monthlyIncome),
    employmentType: borrower.employmentType,
    gender: borrower.gender ?? '',
    payDay: borrower.payDay ?? '',
    collexiaClientNo: borrower.collexiaClientNo ?? '',
    status: borrower.status,
    since: borrower.since ? borrower.since.slice(0, 10) : '',
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateBorrowerInput>({
    resolver: zodResolver(updateBorrowerSchema),
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (open) reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, borrower.id]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch(`/borrowers/${borrower.id}`, { method: 'PATCH', body: values, token });
      toast.success('Borrower updated');
      onOpenChange(false);
      onSaved();
    } catch (error) {
      if (error instanceof ApiError) {
        error.issues.forEach((issue) => {
          if (isBorrowerField(issue.path)) setError(issue.path, { message: issue.message });
        });
        toast.error(error.message);
      } else {
        toast.error('Something went wrong');
      }
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit borrower</SheetTitle>
          <SheetDescription>Correct imported details. Changes are recorded in the audit trail.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 px-4 pb-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" htmlFor="firstName" error={errors.firstName?.message}>
              <Input id="firstName" {...register('firstName')} />
            </FormField>
            <FormField label="Surname" htmlFor="lastName" error={errors.lastName?.message}>
              <Input id="lastName" {...register('lastName')} />
            </FormField>
            <FormField label="ID number" htmlFor="idNumber" error={errors.idNumber?.message}>
              <Input id="idNumber" {...register('idNumber')} />
            </FormField>
            <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
              <Input id="phone" {...register('phone')} />
            </FormField>
            <FormField
              label="Email"
              htmlFor="email"
              error={errors.email?.message}
              optional
              className="sm:col-span-2"
            >
              <Input id="email" type="email" {...register('email')} />
            </FormField>
            <FormField label="Employer" htmlFor="employer" error={errors.employer?.message}>
              <Input id="employer" {...register('employer')} />
            </FormField>
            <FormField label="Occupation" htmlFor="occupation" error={errors.occupation?.message}>
              <Input id="occupation" {...register('occupation')} />
            </FormField>
            <FormField label="Monthly income (N$)" htmlFor="monthlyIncome" error={errors.monthlyIncome?.message}>
              <Input id="monthlyIncome" type="number" inputMode="numeric" {...register('monthlyIncome')} />
            </FormField>
            <FormField label="Employment type" htmlFor="employmentType">
              <select id="employmentType" className={selectClass} {...register('employmentType')}>
                {Object.values(EmploymentType).map((value) => (
                  <option key={value} value={value}>
                    {EMPLOYMENT_LABELS[value]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Gender" htmlFor="gender" optional>
              <select id="gender" className={selectClass} {...register('gender')}>
                <option value="">—</option>
                {GENDER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Pay day" htmlFor="payDay" optional>
              <select id="payDay" className={selectClass} {...register('payDay')}>
                <option value="">—</option>
                {payDayOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Status" htmlFor="status">
              <select id="status" className={selectClass} {...register('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FormField>
            <FormField label="Borrower since" htmlFor="since">
              <Input id="since" type="date" {...register('since')} />
            </FormField>
            <FormField
              label="Collexia client no."
              htmlFor="collexiaClientNo"
              error={errors.collexiaClientNo?.message}
              optional
            >
              <Input id="collexiaClientNo" {...register('collexiaClientNo')} />
            </FormField>
          </div>
          <SheetFooter className="px-0">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Save changes
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
