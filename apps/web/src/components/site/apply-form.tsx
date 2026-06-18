'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, XCircle } from 'lucide-react';
import {
  DocumentKind,
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
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField } from '@/components/site/form-field';
import { cn } from '@/lib/utils';
import {
  ApiError,
  submitApplication,
  uploadApplicationDocument,
  type ApplicationResult,
} from '@/lib/api';
import { PRODUCTS } from '@/lib/site-data';

const STEPS = ['Your loan', 'Personal', 'Employment & bank', 'References & docs'] as const;

const STEP_FIELDS: FieldPath<CreateApplicationInput>[][] = [
  ['loanType', 'amount', 'termMonths', 'purpose'],
  [
    'firstName',
    'lastName',
    'idNumber',
    'dateOfBirth',
    'phone',
    'email',
    'address.street',
    'address.city',
    'address.country',
    'maritalStatus',
  ],
  [
    'employmentType',
    'employer',
    'occupation',
    'monthlyIncome',
    'bankAccount.bankName',
    'bankAccount.accountNumber',
    'bankAccount.accountHolderName',
    'bankAccount.accountType',
  ],
  ['references', 'consent'],
];

const DOCUMENT_SLOTS: { kind: DocumentKind; label: string }[] = [
  { kind: DocumentKind.ProofOfResidence, label: 'Proof of residence' },
  { kind: DocumentKind.IdDocument, label: 'ID / passport copy' },
  { kind: DocumentKind.Payslip, label: 'Latest payslip' },
  { kind: DocumentKind.BankStatement, label: 'Bank statement' },
];

const EMPLOYMENT_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: EmploymentType.PermanentlyEmployed, label: 'Permanently employed' },
  { value: EmploymentType.CivilServant, label: 'Civil servant' },
  { value: EmploymentType.SelfEmployed, label: 'Self-employed' },
  { value: EmploymentType.Contract, label: 'Contract' },
  { value: EmploymentType.Pensioner, label: 'Pensioner' },
];

const ACCOUNT_TYPES = ['Savings', 'Cheque', 'Transmission'];

const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed', 'Other'];

const AFFORDABILITY_COPY: Record<ApplicationResult['affordability'], string> = {
  pass: 'Great news — based on what you told us, this loan looks comfortably affordable.',
  review: 'Your application needs a quick manual review by our team. We will be in touch shortly.',
  fail: 'Based on the income provided, this amount may stretch your budget. Our team will suggest a more affordable option.',
};

export const ApplyForm = () => {
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<ApplicationResult | null>(null);
  const [docs, setDocs] = useState<Partial<Record<DocumentKind, File>>>({});

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
      address: { label: 'Residential', street: '', suburb: '', city: '', region: '', country: 'Namibia' },
      maritalStatus: '',
      employmentType: EmploymentType.PermanentlyEmployed,
      employer: '',
      occupation: '',
      monthlyIncome: 0,
      bankAccount: {
        bankName: '',
        accountNumber: '',
        branchName: '',
        branchCode: '',
        accountHolderName: '',
        accountType: 'Savings',
      },
      references: [{ name: '', phone: '' }],
      // consent intentionally omitted — defaults to unchecked so the gate is real.
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

      // Best-effort: upload any chosen documents against the new application.
      const chosen = Object.entries(docs).filter(([, file]) => file) as [DocumentKind, File][];
      if (chosen.length > 0) {
        const outcomes = await Promise.allSettled(
          chosen.map(([kind, file]) => uploadApplicationDocument(response.id, kind, file)),
        );
        if (outcomes.some((outcome) => outcome.status === 'rejected')) {
          const { toast } = await import('sonner');
          toast.warning('Application submitted, but some documents failed to upload.', {
            description: 'You can re-send them later — our team will follow up.',
          });
        }
      }

      setResult(response);
    } catch (error) {
      const { toast } = await import('sonner');
      if (error instanceof ApiError) {
        toast.error(error.message, {
          description: error.issues.map((issue) => issue.message).join(', ') || undefined,
        });
        return;
      }
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
        <CardContent className="space-y-6 py-12 text-center">
          <Icon className={cn('mx-auto size-14', tone)} />
          <div className="space-y-2">
            <h2 className="text-2xl">Application received</h2>
            <p className="mx-auto max-w-md text-muted-foreground">
              {AFFORDABILITY_COPY[result.affordability]}
            </p>
          </div>
          <div className="mx-auto grid max-w-sm grid-cols-2 gap-4 rounded-xl bg-muted p-5 text-left">
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
      <CardContent className="px-6 py-8 sm:px-10 sm:py-10">
        {/* Stepper */}
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STEPS.map((label, index) => (
            <li key={label} className="space-y-1.5">
              <div className={cn('h-1.5 rounded-full', index <= step ? 'bg-primary' : 'bg-muted')} />
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

        <div className="mt-8 border-t pt-8">
          <form onSubmit={onSubmit} noValidate>
            {step === 0 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-2xl tracking-tight">What do you need?</h2>
                  <p className="text-muted-foreground">
                    Choose your loan type and how much you would like to borrow.
                  </p>
                </div>

                <Controller
                  control={control}
                  name="loanType"
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid gap-3 sm:grid-cols-3"
                    >
                      {PRODUCTS.map((product) => (
                        <label
                          key={product.id}
                          className={cn(
                            'flex cursor-pointer flex-col rounded-xl border p-4 transition-colors',
                            field.value === product.type
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                              : 'hover:border-muted-foreground/40',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{product.title}</span>
                            <RadioGroupItem value={product.type} />
                          </div>
                          <span className="mt-1 text-xs text-muted-foreground">
                            {product.term} · {product.collateral} collateral
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  )}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField label="Amount needed (N$)" htmlFor="amount" error={errors.amount?.message}>
                    <Input
                      id="amount"
                      type="number"
                      inputMode="numeric"
                      min={500}
                      step={500}
                      {...register('amount', { valueAsNumber: true })}
                    />
                  </FormField>
                  <FormField
                    label="Repayment term"
                    htmlFor="termMonths"
                    error={errors.termMonths?.message}
                  >
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
                  </FormField>
                </div>

                <FormField
                  label="What is it for?"
                  htmlFor="purpose"
                  optional
                  error={errors.purpose?.message}
                >
                  <Input
                    id="purpose"
                    placeholder="e.g. medical bill, school fees, stock for my shop"
                    {...register('purpose')}
                  />
                </FormField>

                {estimate && (
                  <div className="rounded-xl bg-muted p-5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Estimated total to repay</span>
                      <span className="font-heading text-xl font-semibold">
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
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-2xl tracking-tight">Personal details</h2>
                  <p className="text-muted-foreground">
                    Exactly as they appear on your Namibian ID or passport.
                  </p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField label="First name" htmlFor="firstName" error={errors.firstName?.message}>
                    <Input id="firstName" autoComplete="given-name" {...register('firstName')} />
                  </FormField>
                  <FormField label="Surname" htmlFor="lastName" error={errors.lastName?.message}>
                    <Input id="lastName" autoComplete="family-name" {...register('lastName')} />
                  </FormField>
                  <FormField
                    label="ID / Passport number"
                    htmlFor="idNumber"
                    error={errors.idNumber?.message}
                    description="Namibian 11-digit ID or your passport number"
                  >
                    <Input id="idNumber" inputMode="numeric" {...register('idNumber')} />
                  </FormField>
                  <FormField
                    label="Date of birth"
                    htmlFor="dateOfBirth"
                    error={errors.dateOfBirth?.message}
                  >
                    <Controller
                      control={control}
                      name="dateOfBirth"
                      render={({ field }) => (
                        <DatePicker
                          id="dateOfBirth"
                          value={field.value}
                          onChange={field.onChange}
                          disableFuture
                          placeholder="Select your date of birth"
                        />
                      )}
                    />
                  </FormField>
                  <FormField
                    label="Phone"
                    htmlFor="phone"
                    error={errors.phone?.message}
                    description="e.g. 081 123 4567"
                  >
                    <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" {...register('phone')} />
                  </FormField>
                  <FormField label="Email" htmlFor="email" error={errors.email?.message}>
                    <Input id="email" type="email" autoComplete="email" {...register('email')} />
                  </FormField>
                  <FormField
                    label="Street address"
                    htmlFor="address.street"
                    error={errors.address?.street?.message}
                    className="sm:col-span-2"
                  >
                    <Input
                      id="address.street"
                      autoComplete="street-address"
                      placeholder="e.g. 12 Acacia Street"
                      {...register('address.street')}
                    />
                  </FormField>
                  <FormField label="Suburb" htmlFor="address.suburb" optional>
                    <Input id="address.suburb" {...register('address.suburb')} />
                  </FormField>
                  <FormField label="City / town" htmlFor="address.city" error={errors.address?.city?.message}>
                    <Input id="address.city" {...register('address.city')} />
                  </FormField>
                  <FormField label="Region" htmlFor="address.region" optional>
                    <Input id="address.region" {...register('address.region')} />
                  </FormField>
                  <FormField
                    label="Country"
                    htmlFor="address.country"
                    error={errors.address?.country?.message}
                  >
                    <Input id="address.country" {...register('address.country')} />
                  </FormField>
                  <FormField label="Marital status" htmlFor="maritalStatus" optional className="sm:col-span-2">
                    <Controller
                      control={control}
                      name="maritalStatus"
                      render={({ field }) => (
                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                          <SelectTrigger id="maritalStatus" className="w-full">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {MARITAL_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </FormField>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-2xl tracking-tight">Employment &amp; bank</h2>
                  <p className="text-muted-foreground">
                    We use this to assess affordability — you always keep at least 50% of your income.
                  </p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    label="Employment type"
                    htmlFor="employmentType"
                    error={errors.employmentType?.message}
                  >
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
                  </FormField>
                  <FormField
                    label="Monthly income (N$)"
                    htmlFor="monthlyIncome"
                    error={errors.monthlyIncome?.message}
                  >
                    <Input
                      id="monthlyIncome"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={100}
                      {...register('monthlyIncome', { valueAsNumber: true })}
                    />
                  </FormField>
                  <FormField label="Employer" htmlFor="employer" error={errors.employer?.message}>
                    <Input id="employer" {...register('employer')} />
                  </FormField>
                  <FormField label="Occupation" htmlFor="occupation" error={errors.occupation?.message}>
                    <Input id="occupation" {...register('occupation')} />
                  </FormField>
                </div>

                <div className="space-y-1 pt-2">
                  <h3 className="font-heading text-lg font-medium">Bank account</h3>
                  <p className="text-sm text-muted-foreground">Where we will pay out and collect.</p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    label="Bank name"
                    htmlFor="bankAccount.bankName"
                    error={errors.bankAccount?.bankName?.message}
                  >
                    <Input id="bankAccount.bankName" {...register('bankAccount.bankName')} />
                  </FormField>
                  <FormField
                    label="Account holder name"
                    htmlFor="bankAccount.accountHolderName"
                    error={errors.bankAccount?.accountHolderName?.message}
                  >
                    <Input
                      id="bankAccount.accountHolderName"
                      {...register('bankAccount.accountHolderName')}
                    />
                  </FormField>
                  <FormField
                    label="Account number"
                    htmlFor="bankAccount.accountNumber"
                    error={errors.bankAccount?.accountNumber?.message}
                  >
                    <Input
                      id="bankAccount.accountNumber"
                      inputMode="numeric"
                      {...register('bankAccount.accountNumber')}
                    />
                  </FormField>
                  <FormField
                    label="Account type"
                    htmlFor="bankAccount.accountType"
                    error={errors.bankAccount?.accountType?.message}
                  >
                    <Controller
                      control={control}
                      name="bankAccount.accountType"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="bankAccount.accountType" className="w-full">
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
                  </FormField>
                  <FormField label="Branch name" htmlFor="bankAccount.branchName" optional>
                    <Input id="bankAccount.branchName" {...register('bankAccount.branchName')} />
                  </FormField>
                  <FormField label="Branch code" htmlFor="bankAccount.branchCode" optional>
                    <Input id="bankAccount.branchCode" {...register('bankAccount.branchCode')} />
                  </FormField>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-2xl tracking-tight">References &amp; documents</h2>
                  <p className="text-muted-foreground">
                    Give us at least one person we may contact, and attach your supporting documents
                    if you have them handy.
                  </p>
                </div>

                <div className="space-y-4">
                  {fields.map((fieldItem, index) => (
                    <div key={fieldItem.id} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <FormField
                        label={`Reference ${index + 1} name`}
                        htmlFor={`ref-name-${index}`}
                        error={errors.references?.[index]?.name?.message}
                      >
                        <Input id={`ref-name-${index}`} {...register(`references.${index}.name`)} />
                      </FormField>
                      <FormField
                        label="Phone"
                        htmlFor={`ref-phone-${index}`}
                        error={errors.references?.[index]?.phone?.message}
                      >
                        <Input
                          id={`ref-phone-${index}`}
                          type="tel"
                          inputMode="tel"
                          {...register(`references.${index}.phone`)}
                        />
                      </FormField>
                      <div className="flex items-end pb-0.5">
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove reference ${index + 1}`}
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="size-4" />
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
                      <Plus className="size-4" /> Add another reference
                    </Button>
                  )}
                  {typeof errors.references?.message === 'string' && (
                    <p className="text-xs text-destructive">{errors.references.message}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <h3 className="font-heading text-lg font-medium">
                      Supporting documents{' '}
                      <span className="text-sm font-normal text-muted-foreground">(optional)</span>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      PDF, JPG or PNG. You can also send these later if you don&apos;t have them now.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {DOCUMENT_SLOTS.map((slot) => (
                      <FormField key={slot.kind} label={slot.label}>
                        <FileUpload
                          value={docs[slot.kind] ?? null}
                          onChange={(file) =>
                            setDocs((current) => ({ ...current, [slot.kind]: file ?? undefined }))
                          }
                        />
                      </FormField>
                    ))}
                  </div>
                </div>

                <Controller
                  control={control}
                  name="consent"
                  render={({ field }) => (
                    <label className="flex items-start gap-3 rounded-xl border p-4 text-sm">
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                        className="mt-0.5"
                      />
                      <span className="text-muted-foreground">
                        I confirm the information provided is accurate and I agree to an affordability
                        assessment and credit check in line with NAMFISA requirements.
                      </span>
                    </label>
                  )}
                />
                {errors.consent?.message && (
                  <p className="-mt-3 text-xs text-destructive">{errors.consent.message}</p>
                )}
              </div>
            )}

            <div className="mt-10 flex items-center justify-between">
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
        </div>
      </CardContent>
    </Card>
  );
};
