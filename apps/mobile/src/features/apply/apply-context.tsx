'use no memo';
// react-hook-form's formState/fieldState are getter proxies the React Compiler
// memoises as if they were plain values (stale errors); keep forms uncompiled.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { FormProvider, useForm, type DefaultValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  APPLICATION_DOCUMENT_SLOTS,
  DocumentKind,
  EmploymentType,
  LoanType,
  TERMS_VERSION,
  createApplicationSchema,
  type CreateApplicationInput,
} from '@loan-pilot/domain';
import { api, upload, type UploadFile } from '@/lib/api';
import { clearDraft, loadDraft, saveDraft } from '@/lib/draft';
import type { ApplicationResult } from '@/lib/types';

/** Mirrors the web form's defaults (apps/web/src/components/site/apply-form.tsx). */
const DEFAULTS: DefaultValues<CreateApplicationInput> = {
  loanType: LoanType.Payday,
  amount: 5000,
  termMonths: 1,
  purpose: '',
  purposeCategory: undefined,
  firstName: '',
  lastName: '',
  idNumber: '',
  dateOfBirth: '',
  phone: '',
  email: '',
  address: {
    label: 'Residential',
    street: '',
    suburb: '',
    city: '',
    region: '',
    country: 'Namibia',
  },
  postalSameAsResidential: true,
  postalAddress: undefined,
  maritalStatus: '',
  gender: undefined,
  employmentType: EmploymentType.PermanentlyEmployed,
  employer: '',
  employerPhone: '',
  employerAddress: '',
  employeeNo: '',
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
  collateral: undefined,
  tcVersion: TERMS_VERSION,
  signature: { dataUrl: '' },
  initials: { dataUrl: '' },
};

export interface SubmissionOutcome extends ApplicationResult {
  /** Supporting files that failed to upload; the team follows up on these. */
  failedUploads: number;
  phone: string;
}

interface ApplyContextValue {
  documents: Partial<Record<DocumentKind, UploadFile>>;
  setDocument: (kind: DocumentKind, file: UploadFile | null) => void;
  collateralPhotos: UploadFile[];
  setCollateralPhotos: (files: UploadFile[]) => void;
  /** 0–1 while submitting (application, then each file); null when idle. */
  progress: number | null;
  outcome: SubmissionOutcome | null;
  submit: (values: CreateApplicationInput) => Promise<void>;
}

const ApplyContext = createContext<ApplyContextValue | null>(null);

export interface QuoteSeed {
  amount?: string;
  term?: string;
  type?: string;
}

const isLoanType = (value: string | undefined): value is LoanType =>
  value === LoanType.Payday || value === LoanType.Business || value === LoanType.Collateral;

/**
 * Holds one application across the five step screens: the react-hook-form
 * instance (validated by the shared `createApplicationSchema`), the picked
 * documents, autosave to a device draft, and submission + uploads.
 */
export const ApplyProvider = ({ seed, children }: { seed: QuoteSeed; children: ReactNode }) => {
  const [initialValues] = useState<DefaultValues<CreateApplicationInput>>(() => {
    const draft = loadDraft();
    const fromQuote: DefaultValues<CreateApplicationInput> = {
      ...(seed.amount ? { amount: Number(seed.amount) } : {}),
      ...(seed.term ? { termMonths: Number(seed.term) } : {}),
      ...(isLoanType(seed.type) ? { loanType: seed.type } : {}),
    };
    return { ...DEFAULTS, ...draft, ...fromQuote, tcVersion: TERMS_VERSION };
  });

  const form = useForm<CreateApplicationInput>({
    resolver: zodResolver(createApplicationSchema),
    mode: 'onTouched',
    defaultValues: initialValues,
  });

  const [documents, setDocuments] = useState<Partial<Record<DocumentKind, UploadFile>>>({});
  const [collateralPhotos, setCollateralPhotos] = useState<UploadFile[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<SubmissionOutcome | null>(null);

  // Autosave answers (debounced) so an app kill doesn't lose them.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const subscription = form.watch((values) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveDraft(values), 600);
    });
    return () => {
      subscription.unsubscribe();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [form]);

  const submit = async (values: CreateApplicationInput) => {
    setProgress(0.05);
    try {
      const application = await api<ApplicationResult>('/applications', {
        method: 'POST',
        body: values,
      });
      const files: { kind: DocumentKind; file: UploadFile }[] = [
        ...APPLICATION_DOCUMENT_SLOTS.flatMap(({ kind }) => {
          const file = documents[kind];
          return file ? [{ kind, file }] : [];
        }),
        ...collateralPhotos.map((file) => ({ kind: DocumentKind.CollateralPhoto, file })),
      ];
      const share = 0.95 / Math.max(files.length, 1);
      const results = await files.reduce<Promise<boolean[]>>(
        async (previous, { kind, file }, index) => {
          const done = await previous;
          const ok = await upload(
            `/applications/${application.id}/documents`,
            { kind },
            file,
            (fraction) => setProgress(0.05 + share * (index + fraction)),
          )
            .then(() => true)
            .catch(() => false);
          return [...done, ok];
        },
        Promise.resolve([]),
      );
      clearDraft();
      setOutcome({
        ...application,
        failedUploads: results.filter((ok) => !ok).length,
        phone: values.phone,
      });
    } finally {
      setProgress(null);
    }
  };

  return (
    <FormProvider {...form}>
      <ApplyContext.Provider
        value={{
          documents,
          setDocument: (kind, file) =>
            setDocuments((current) => ({ ...current, [kind]: file ?? undefined })),
          collateralPhotos,
          setCollateralPhotos,
          progress,
          outcome,
          submit,
        }}
      >
        {children}
      </ApplyContext.Provider>
    </FormProvider>
  );
};

export const useApply = (): ApplyContextValue => {
  const context = useContext(ApplyContext);
  if (!context) throw new Error('useApply must be used inside ApplyProvider');
  return context;
};
