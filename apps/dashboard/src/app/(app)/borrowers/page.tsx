'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertTriangle, Eye, Loader2, Plus, Users, Wallet, FileText } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  EmploymentType,
  createBorrowerSchema,
  formatNad,
  isUnverifiedId,
  type CreateBorrowerInput,
} from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { InitialsAvatar } from '@/components/initials-avatar';
import { DataTable } from '@/components/data-table';
import { StatStrip } from '@/components/stat-strip';
import { FormField } from '@/components/form-field';
import { useCommand } from '@/components/command-provider';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { BorrowerRow } from '@/lib/types';

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  [EmploymentType.PermanentlyEmployed]: 'Permanently employed',
  [EmploymentType.CivilServant]: 'Civil servant',
  [EmploymentType.SelfEmployed]: 'Self-employed',
  [EmploymentType.Contract]: 'Contract',
  [EmploymentType.Pensioner]: 'Pensioner',
};
const ACCOUNT_TYPES = ['Savings', 'Cheque', 'Transmission'];

const isBorrowerField = (path: string): path is keyof CreateBorrowerInput =>
  path in createBorrowerSchema.shape;

const baseColumns: ColumnDef<BorrowerRow>[] = [
  {
    id: 'borrower',
    header: 'Borrower',
    accessorFn: (row) => `${row.firstName} ${row.lastName} ${row.phone}`,
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <InitialsAvatar name={`${row.original.firstName} ${row.original.lastName}`} />
        <div>
          <div className="font-medium">
            {row.original.firstName} {row.original.lastName}
          </div>
          <div className="text-xs text-muted-foreground">{row.original.phone}</div>
        </div>
      </div>
    ),
  },
  {
    id: 'id number',
    header: 'ID number',
    accessorKey: 'idNumber',
    cell: ({ row }) => {
      const value = row.original.idNumber;
      return (
        <div className="flex items-center gap-2">
          <span className="tabular-nums">{value}</span>
          {isUnverifiedId(value) ? (
            <Badge variant="destructive" title="Placeholder or invalid ID — needs cleanup">
              <AlertTriangle />
            </Badge>
          ) : null}
        </div>
      );
    },
  },
  {
    id: 'employer',
    header: 'Employer',
    accessorKey: 'employer',
    cell: ({ row }) => (
      <div>
        <div>{row.original.employer}</div>
        <div className="text-xs text-muted-foreground">{row.original.occupation}</div>
      </div>
    ),
  },
  {
    id: 'income',
    header: () => <div className="text-right">Monthly income</div>,
    accessorKey: 'monthlyIncome',
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{formatNad(row.original.monthlyIncome)}</div>
    ),
  },
  {
    id: 'loans',
    header: () => <div className="text-right">Loans</div>,
    accessorFn: (row) => row._count.loans,
    cell: ({ row }) => <div className="text-right tabular-nums">{row.original._count.loans}</div>,
  },
  {
    id: 'since',
    header: 'Since',
    accessorKey: 'since',
    cell: ({ row }) => formatDate(row.original.since),
  },
];

const NewBorrowerSheet = ({ onCreated }: { onCreated: () => void }) => {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateBorrowerInput>({
    resolver: zodResolver(createBorrowerSchema),
    defaultValues: {
      employmentType: EmploymentType.PermanentlyEmployed,
      address: { label: 'Residential', country: 'Namibia' },
      bankAccount: { accountType: 'Savings' },
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch('/borrowers', { method: 'POST', body: values, token });
      toast.success('Borrower created');
      reset();
      setOpen(false);
      onCreated();
    } catch (error) {
      if (error instanceof ApiError) {
        error.issues.forEach((issue) => {
          if (isBorrowerField(issue.path)) {
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
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        New borrower
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New borrower</SheetTitle>
            <SheetDescription>Capture a borrower record. Monthly income is in N$.</SheetDescription>
          </SheetHeader>
          <form onSubmit={onSubmit} className="space-y-4 px-4" noValidate>
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
              <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
                <Input id="phone" type="tel" inputMode="tel" {...register('phone')} />
              </FormField>
              <FormField
                label="Email"
                htmlFor="email"
                error={errors.email?.message}
                className="sm:col-span-2"
              >
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
                <Input id="addr-region" {...register('address.region')} />
              </FormField>
              <FormField label="Country" htmlFor="addr-country" error={errors.address?.country?.message}>
                <Input id="addr-country" {...register('address.country')} />
              </FormField>
              <FormField label="Employer" htmlFor="employer" error={errors.employer?.message}>
                <Input id="employer" {...register('employer')} />
              </FormField>
              <FormField label="Occupation" htmlFor="occupation" error={errors.occupation?.message}>
                <Input id="occupation" {...register('occupation')} />
              </FormField>
              <FormField
                label="Monthly income (N$)"
                htmlFor="monthlyIncome"
                error={errors.monthlyIncome?.message}
              >
                <Input id="monthlyIncome" type="number" inputMode="numeric" {...register('monthlyIncome')} />
              </FormField>
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
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id="accountType" className="w-full">
                        <SelectValue placeholder="Select" />
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
            <SheetFooter className="px-0">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Create borrower
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
};

const BorrowersPage = () => {
  const router = useRouter();
  const command = useCommand();
  const { data, loading, error, refresh } = useApi<BorrowerRow[]>('/borrowers');

  const summary = useMemo(() => {
    const rows = data ?? [];
    const loans = rows.reduce((sum, b) => sum + b._count.loans, 0);
    const withIncome = rows.filter((b) => b.monthlyIncome > 0);
    const avgIncome = withIncome.length
      ? Math.round(withIncome.reduce((s, b) => s + b.monthlyIncome, 0) / withIncome.length)
      : 0;
    const withLoans = rows.filter((b) => b._count.loans > 0).length;
    return { borrowers: rows.length, loans, avgIncome, withLoans };
  }, [data]);

  const columns = useMemo<ColumnDef<BorrowerRow>[]>(
    () => [
      ...baseColumns,
      {
        id: 'quickview',
        header: () => <span className="sr-only">Quick view</span>,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              title="Quick view"
              onClick={(event) => {
                event.stopPropagation();
                command.openBorrowerQuickView(row.original.id);
              }}
            >
              <Eye className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [command],
  );

  return (
    <div>
      <PageHeader
        title="Borrowers"
        description="Everyone with a record at your branch"
        action={<NewBorrowerSheet onCreated={refresh} />}
      />

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <DataTable
          columns={columns}
          data={data ?? []}
          searchPlaceholder="Search name, ID or phone…"
          onRowClick={(borrower) => router.push(`/borrowers/${borrower.id}`)}
          summary={
            <StatStrip
              items={[
                { label: 'Borrowers', value: String(summary.borrowers), icon: Users },
                { label: 'Total loans', value: String(summary.loans), icon: FileText },
                { label: 'Avg monthly income', value: formatNad(summary.avgIncome), icon: Wallet },
                { label: 'With loans', value: String(summary.withLoans), icon: Users },
              ]}
            />
          }
        />
      )}
    </div>
  );
};

export default BorrowersPage;
