'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, XCircle } from 'lucide-react';
import {
  EmploymentType,
  LoanType,
  createApplicationSchema,
  formatNad,
  quote,
  toCents,
  type CreateApplicationInput,
} from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ApiError, submitApplication, type ApplicationResult } from '@/lib/api';
import { PRODUCTS } from '@/lib/site-data';

const STEPS = ['Your loan', 'Personal', 'Employment & bank', 'References & docs'] as const;

const STEP_FIELDS: FieldPath<CreateApplicationInput>[][] = [
  ['loanType', 'amount', 'termMonths', 'purpose'],
  ['firstName', 'lastName', 'idNumber', 'dateOfBirth', 'phone', 'email', 'address', 'maritalStatus'],
  ['employmentType', 'employer', 'occupation', 'monthlyIncome', 'bank', 'accountType'],
  ['references', 'consent'],
];

const EMPLOYMENT_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: EmploymentType.PermanentlyEmployed, label: 'Permanently employed' },
  { value: EmploymentType.CivilServant, label: 'Civil servant' },
  { value: EmploymentType.SelfEmployed, label: 'Self-employed' },
  { value: EmploymentType.Contract, label: 'Contract' },
  { value: EmploymentType.Pensioner, label: 'Pensioner' },
];

const ACCOUNT_TYPES = ['Savings', 'Cheque', 'Transmission'];

const AFFORDABILITY_COPY: Record<ApplicationResult['affordability'], string> = {
  pass: 'Great news — based on what you told us, this loan looks comfortably affordable.',
  review: 'Your application needs a quick manual review by our team. We will be in touch shortly.',
  fail: 'Based on the income provided, this amount may stretch your budget. Our team will suggest a more affordable option.',
};

const FieldError = ({ message }: { message?: string }) =>
  message ? <p className="mt-1 text-xs text-destructive">{message}</p> : null;

export const ApplyForm = () => {
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<ApplicationResult | null>(null);

  const form = useForm<CreateApplicationInput>({
    resolver: zodResolver(createApplicationSchema),
    mode: 'onBlur',
    defaultValues: {
      loanType: LoanType.Payday,
      amount: 5000,
      termMonths: 1,
      purpose: '',
      firstName: '',
      lastName: '',
      idNumber: '',
      dateOfBirth: '',
      phone: '',
      email: '',
      address: '',
      maritalStatus: '',
      employmentType: EmploymentType.PermanentlyEmployed,
      employer: '',
      occupation: '',
      monthlyIncome: 0,
      bank: '',
      accountType: 'Savings',
      references: [
        { name: '', phone: '' },
        { name: '', phone: '' },
      ],
      consent: true,
    },
  });

  const {
    register,
    control,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting },
  } = form;

  const { fields, append, remove } = useFieldArray({ control, name: 'references' });

  const [watchedType, watchedAmountRaw, watchedTermRaw] = useWatch({
    control,
    name: ['loanType', 'amount', 'termMonths'],
  });
  const watchedAmount = Number(watchedAmountRaw) || 0;
  const watchedTerm = Number(watchedTermRaw) || 1;
  const estimate =
    watchedAmount >= 500
      ? quote({ principalCents: toCents(watchedAmount), termMonths: watchedTerm, type: watchedType })
      : null;

  const next = async () => {
    const valid = await trigger(STEP_FIELDS[step]);
    if (valid) {
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }
  };

  const back = () => setStep((current) => Math.max(current - 1, 0));

  const onSubmit = handleSubmit(async (values) => {
    try {
      const response = await submitApplication(values);
      setResult(response);
    } catch (error) {
      if (error instanceof ApiError) {
        const { toast } = await import('sonner');
        toast.error(error.message, {
          description: error.issues.map((issue) => issue.message).join(', ') || undefined,
        });
        return;
      }
      const { toast } = await import('sonner');
      toast.error('We could not submit your application. Please try again.');
    }
  });

  if (result) {
    const Icon = result.affordability === 'fail' ? XCircle : CheckCircle2;
    const tone =
      result.affordability === 'pass'
        ? 'text-success'
        : result.affordability === 'fail'
          ? 'text-destructive'
          : 'text-warning';
    return (
      <Card>
        <CardContent className="space-y-6 py-10 text-center">
          <Icon className={cn('mx-auto size-14', tone)} />
          <div className="space-y-2">
            <h2 className="text-2xl">Application received</h2>
            <p className="mx-auto max-w-md text-muted-foreground">
              {AFFORDABILITY_COPY[result.affordability]}
            </p>
          </div>
          <div className="mx-auto grid max-w-sm grid-cols-2 gap-4 rounded-lg bg-muted p-4 text-left">
            <div>
              <div className="text-xs text-muted-foreground">Reference</div>
              <div className="font-mono text-sm">{result.id.slice(0, 10)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="text-sm capitalize">{result.status}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Estimated total</div>
              <div className="text-sm font-semibold">{formatNad(toCents(result.quotedTotal))}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Per month</div>
              <div className="text-sm font-semibold">
                {formatNad(toCents(result.quotedInstalment))}
              </div>
            </div>
          </div>
          <Button render={<Link href="/" />}>Back to home</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-6">
        {/* Stepper */}
        <ol className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STEPS.map((label, index) => (
            <li key={label} className="space-y-1.5">
              <div
                className={cn(
                  'h-1.5 rounded-full',
                  index <= step ? 'bg-primary' : 'bg-muted',
                )}
              />
              <span
                className={cn(
                  'text-xs',
                  index === step ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>

        <form onSubmit={onSubmit} noValidate>
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl">What do you need?</h2>
                <p className="text-sm text-muted-foreground">
                  Choose your loan type and how much you would like to borrow.
                </p>
              </div>

              <Controller
                control={control}
                name="loanType"
                render={({ field }) => (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {PRODUCTS.map((product) => (
                      <button
                        type="button"
                        key={product.id}
                        onClick={() => field.onChange(product.type)}
                        className={cn(
                          'rounded-lg border p-4 text-left transition-colors',
                          field.value === product.type
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-muted-foreground/40',
                        )}
                      >
                        <div className="font-medium">{product.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {product.term} · {product.collateral} collateral
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="amount">Amount needed (N$)</Label>
                  <Input
                    id="amount"
                    type="number"
                    min={500}
                    step={500}
                    {...register('amount', { valueAsNumber: true })}
                  />
                  <FieldError message={errors.amount?.message} />
                </div>
                <div>
                  <Label htmlFor="termMonths">Repayment term</Label>
                  <Controller
                    control={control}
                    name="termMonths"
                    render={({ field }) => (
                      <Select
                        value={String(field.value)}
                        onValueChange={(value) => field.onChange(Number(value))}
                      >
                        <SelectTrigger id="termMonths" className="w-full">
                          <SelectValue placeholder="Select term" />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5].map((month) => (
                            <SelectItem key={month} value={String(month)}>
                              {month} month{month > 1 ? 's' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError message={errors.termMonths?.message} />
                </div>
              </div>

              <div>
                <Label htmlFor="purpose">
                  What is it for? <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="purpose"
                  placeholder="e.g. medical bill, school fees, stock for my shop"
                  {...register('purpose')}
                />
              </div>

              {estimate && (
                <div className="rounded-lg bg-muted p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Estimated total to repay</span>
                    <span className="font-heading text-lg font-semibold">
                      {formatNad(estimate.totalCents)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatNad(estimate.instalmentCents)} per month over {watchedTerm} month
                    {watchedTerm > 1 ? 's' : ''}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl">Personal details</h2>
                <p className="text-sm text-muted-foreground">
                  Exactly as they appear on your Namibian ID or passport.
                </p>
              </div>
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
                  <Label htmlFor="idNumber">ID / Passport number</Label>
                  <Input id="idNumber" {...register('idNumber')} />
                  <FieldError message={errors.idNumber?.message} />
                </div>
                <div>
                  <Label htmlFor="dateOfBirth">Date of birth</Label>
                  <Input id="dateOfBirth" placeholder="DD/MM/YYYY" {...register('dateOfBirth')} />
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
                  <Label htmlFor="address">Residential address</Label>
                  <Input id="address" {...register('address')} />
                  <FieldError message={errors.address?.message} />
                </div>
                <div>
                  <Label htmlFor="maritalStatus">
                    Marital status <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input id="maritalStatus" {...register('maritalStatus')} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl">Employment &amp; bank</h2>
                <p className="text-sm text-muted-foreground">
                  We use this to assess affordability — you always keep at least 50% of your income.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="employmentType">Employment type</Label>
                  <Controller
                    control={control}
                    name="employmentType"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="employmentType" className="w-full">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {EMPLOYMENT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError message={errors.employmentType?.message} />
                </div>
                <div>
                  <Label htmlFor="monthlyIncome">Monthly income (N$)</Label>
                  <Input
                    id="monthlyIncome"
                    type="number"
                    min={1}
                    step={100}
                    {...register('monthlyIncome', { valueAsNumber: true })}
                  />
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
                  <Controller
                    control={control}
                    name="accountType"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="accountType" className="w-full">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCOUNT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError message={errors.accountType?.message} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl">References &amp; consent</h2>
                <p className="text-sm text-muted-foreground">
                  Provide at least two people we may contact. You will upload your payslip, ID and
                  bank statements after submitting.
                </p>
              </div>

              <div className="space-y-3">
                {fields.map((fieldItem, index) => (
                  <div key={fieldItem.id} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <div>
                      <Label htmlFor={`ref-name-${index}`}>Reference {index + 1} name</Label>
                      <Input id={`ref-name-${index}`} {...register(`references.${index}.name`)} />
                      <FieldError message={errors.references?.[index]?.name?.message} />
                    </div>
                    <div>
                      <Label htmlFor={`ref-phone-${index}`}>Phone</Label>
                      <Input id={`ref-phone-${index}`} {...register(`references.${index}.phone`)} />
                      <FieldError message={errors.references?.[index]?.phone?.message} />
                    </div>
                    <div className="flex items-end">
                      {fields.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {fields.length < 4 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ name: '', phone: '' })}
                  >
                    Add another reference
                  </Button>
                )}
                {typeof errors.references?.message === 'string' && (
                  <FieldError message={errors.references.message} />
                )}
              </div>

              <label className="flex items-start gap-3 rounded-lg border p-4 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  {...register('consent')}
                />
                <span className="text-muted-foreground">
                  I confirm the information provided is accurate and I agree to an affordability
                  assessment and credit check in line with NAMFISA requirements.
                </span>
              </label>
              <FieldError message={errors.consent?.message} />
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={back} disabled={step === 0}>
              <ChevronLeft /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next}>
                Continue <ChevronRight />
              </Button>
            ) : (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Submit application
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
