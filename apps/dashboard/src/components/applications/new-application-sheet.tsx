'use client';

import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  DocumentKind,
  EmploymentType,
  LoanType,
  NAMIBIAN_REGIONS,
  TERMS_AND_CONDITIONS,
  TERMS_VERSION,
  createApplicationSchema,
  type CreateApplicationInput,
} from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SignaturePad } from '@/components/ui/signature-pad';
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
import { ApiError, apiFetch, uploadDocument } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { bumpRevalidation } from '@/lib/revalidate';
import { FormField } from '@/components/form-field';

const DOC_LABELS: Record<string, string> = {
  [DocumentKind.IdDocument]: 'ID document',
  [DocumentKind.ProofOfResidence]: 'Proof of residence',
  [DocumentKind.Payslip]: 'Payslip',
  [DocumentKind.BankStatement]: 'Bank statement',
};

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
  employerPhone: '',
  employerAddress: '',
  employeeNo: '',
  address: { label: 'Residential', street: '', suburb: '', city: '', region: '', country: 'Namibia' },
  postalSameAsResidential: true,
  // Undefined while hidden so the optional postal address isn't validated as an
  // empty object; populated only when "same as residential" is unticked.
  postalAddress: undefined,
  bankAccount: {
    bankName: '',
    accountNumber: '',
    branchName: '',
    branchCode: '',
    accountHolderName: '',
    accountType: 'Savings',
  },
  // Only the first reference is required; a second is optional (added on demand).
  references: [{ name: '', phone: '' }],
  consent: true,
  tcVersion: TERMS_VERSION,
  signature: { dataUrl: '' },
  // tcAccepted intentionally omitted — the applicant must tick + sign in person.
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
  const { token, user } = useAuth();
  const [docs, setDocs] = useState<Record<string, File>>({});
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateApplicationInput>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: DEFAULTS,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'references' });
  const postalSameAsResidential = useWatch({ control, name: 'postalSameAsResidential' });

  useEffect(() => {
    if (open) reset(DEFAULTS);
  }, [open, reset]);

  // Clear staged files when the sheet (re)opens, without a setState-in-effect.
  const [docsOpen, setDocsOpen] = useState(false);
  if (open !== docsOpen) {
    setDocsOpen(open);
    if (open) setDocs({});
  }

  const onSubmit = handleSubmit(
    async (values) => {
    try {
      const created = await apiFetch<{ id: string }>('/applications/internal', {
        method: 'POST',
        body: values,
        token,
      });
      // Upload any attached documents to the new application. The endpoint
      // resolves the tenant from the x-tenant header.
      const files = Object.entries(docs);
      if (files.length > 0) {
        const results = await Promise.allSettled(
          files.map(([kind, file]) =>
            uploadDocument(
              `/applications/${created.id}/documents`,
              { kind, file },
              { tenant: user?.tenantSlug },
            ),
          ),
        );
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          toast.warning(`${failed} document(s) failed to upload — add them from the borrower later.`);
        }
      }
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
    },
    (formErrors) => {
      // Surface client-side validation blocks (e.g. a missing signature or T&C
      // acceptance) that would otherwise make "Submit" appear to do nothing.
      const messages: string[] = [];
      const seen = new Set<string>();
      const visit = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        const record = node as Record<string, unknown>;
        if (typeof record.message === 'string' && !seen.has(record.message)) {
          seen.add(record.message);
          messages.push(record.message);
        }
        for (const key of Object.keys(record)) {
          if (key === 'message' || key === 'type' || key === 'ref') continue;
          visit(record[key]);
        }
      };
      visit(formErrors);
      toast.error('Please fix the highlighted fields', {
        description: messages.length ? messages.join(' · ') : undefined,
      });
    },
  );

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
                label="Street address"
                htmlFor="addr-street"
                error={errors.address?.street?.message}
                className="sm:col-span-2"
              >
                <Input id="addr-street" {...register('address.street')} />
              </FormField>
              <FormField label="City / town" htmlFor="addr-city" error={errors.address?.city?.message}>
                <Input id="addr-city" {...register('address.city')} />
              </FormField>
              <FormField label="Suburb" htmlFor="addr-suburb" optional>
                <Input id="addr-suburb" {...register('address.suburb')} />
              </FormField>
              <FormField label="Region" htmlFor="addr-region" optional>
                <Controller
                  control={control}
                  name="address.region"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id="addr-region" className="w-full">
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        {NAMIBIAN_REGIONS.map((region) => (
                          <SelectItem key={region} value={region}>
                            {region}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Country" htmlFor="addr-country" error={errors.address?.country?.message}>
                <Input id="addr-country" {...register('address.country')} />
              </FormField>
            </div>
            <Controller
              control={control}
              name="postalSameAsResidential"
              render={({ field }) => (
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={field.value ?? false}
                    onCheckedChange={(checked) => {
                      field.onChange(checked === true);
                      if (checked === true) setValue('postalAddress', undefined);
                    }}
                  />
                  <span>Postal address same as residential</span>
                </label>
              )}
            />
            {!postalSameAsResidential && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="Postal street / PO Box"
                  htmlFor="postal-street"
                  error={errors.postalAddress?.street?.message}
                  className="sm:col-span-2"
                >
                  <Input id="postal-street" {...register('postalAddress.street')} />
                </FormField>
                <FormField
                  label="City / town"
                  htmlFor="postal-city"
                  error={errors.postalAddress?.city?.message}
                >
                  <Input id="postal-city" {...register('postalAddress.city')} />
                </FormField>
                <FormField label="Suburb" htmlFor="postal-suburb" optional>
                  <Input id="postal-suburb" {...register('postalAddress.suburb')} />
                </FormField>
                <FormField label="Region" htmlFor="postal-region" optional>
                  <Controller
                    control={control}
                    name="postalAddress.region"
                    render={({ field }) => (
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger id="postal-region" className="w-full">
                          <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                        <SelectContent>
                          {NAMIBIAN_REGIONS.map((region) => (
                            <SelectItem key={region} value={region}>
                              {region}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
                <FormField
                  label="Country"
                  htmlFor="postal-country"
                  error={errors.postalAddress?.country?.message}
                >
                  <Input id="postal-country" {...register('postalAddress.country')} />
                </FormField>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <SectionTitle>Employment</SectionTitle>
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
              <FormField label="Employer telephone" htmlFor="employerPhone" optional>
                <Input id="employerPhone" type="tel" inputMode="tel" {...register('employerPhone')} />
              </FormField>
              <FormField label="Payslip / employee no." htmlFor="employeeNo" optional>
                <Input id="employeeNo" {...register('employeeNo')} />
              </FormField>
              <FormField
                label="Employer address"
                htmlFor="employerAddress"
                optional
                className="sm:col-span-2"
              >
                <Input id="employerAddress" {...register('employerAddress')} />
              </FormField>
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle>Bank account</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Bank name" htmlFor="bankName" error={errors.bankAccount?.bankName?.message}>
                <Input id="bankName" {...register('bankAccount.bankName')} />
              </FormField>
              <FormField
                label="Account holder"
                htmlFor="bankHolder"
                error={errors.bankAccount?.accountHolderName?.message}
              >
                <Input id="bankHolder" {...register('bankAccount.accountHolderName')} />
              </FormField>
              <FormField
                label="Account number"
                htmlFor="bankNumber"
                error={errors.bankAccount?.accountNumber?.message}
              >
                <Input id="bankNumber" inputMode="numeric" {...register('bankAccount.accountNumber')} />
              </FormField>
              <FormField
                label="Account type"
                htmlFor="accountType"
                error={errors.bankAccount?.accountType?.message}
              >
                <Controller
                  control={control}
                  name="bankAccount.accountType"
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
              <FormField label="Branch name" htmlFor="branchName" optional>
                <Input id="branchName" {...register('bankAccount.branchName')} />
              </FormField>
              <FormField label="Branch code" htmlFor="branchCode" optional>
                <Input id="branchCode" {...register('bankAccount.branchCode')} />
              </FormField>
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle>References</SectionTitle>
            {fields.map((fieldItem, index) => (
              <div key={fieldItem.id} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
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
                <Plus className="size-4" /> Add reference
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <SectionTitle>Documents</SectionTitle>
            <p className="text-xs text-muted-foreground">
              Optional. PDF, JPG or PNG. They attach to the application and follow the borrower on
              approval.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.keys(DOC_LABELS).map((kind) => (
                <FormField key={kind} label={DOC_LABELS[kind]} htmlFor={`doc-${kind}`} optional>
                  <Input
                    id={`doc-${kind}`}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      setDocs((current) => {
                        const next = { ...current };
                        if (file) next[kind] = file;
                        else delete next[kind];
                        return next;
                      });
                    }}
                  />
                </FormField>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle>Terms &amp; signature</SectionTitle>
            <p className="text-xs text-muted-foreground">
              Have the applicant read the Terms &amp; Conditions, then tick to agree and sign on this
              device. This is embedded in the generated loan agreement.
            </p>
            <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border bg-muted/30 p-4 text-xs">
              <p className="italic text-muted-foreground">{TERMS_AND_CONDITIONS.preamble}</p>
              {TERMS_AND_CONDITIONS.sections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <h4 className="font-semibold">{section.title}</h4>
                  {section.body.map((paragraph, index) => (
                    <p key={index} className="text-muted-foreground">
                      {paragraph}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <Controller
              control={control}
              name="tcAccepted"
              render={({ field }) => (
                <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                  <Checkbox
                    checked={field.value ?? false}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    className="mt-0.5"
                  />
                  <span className="text-muted-foreground">
                    The applicant has read and agrees to the Terms &amp; Conditions (version{' '}
                    {TERMS_VERSION}).
                  </span>
                </label>
              )}
            />
            {errors.tcAccepted?.message && (
              <p className="-mt-2 text-xs text-destructive">{errors.tcAccepted.message}</p>
            )}
            <div className="space-y-2">
              <div className="text-sm font-medium">Applicant signature</div>
              <Controller
                control={control}
                name="signature.dataUrl"
                render={({ field }) => (
                  <SignaturePad
                    value={field.value ?? null}
                    onChange={(dataUrl) => field.onChange(dataUrl ?? '')}
                  />
                )}
              />
              {errors.signature?.dataUrl?.message && (
                <p className="text-xs text-destructive">{errors.signature.dataUrl.message}</p>
              )}
            </div>
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
