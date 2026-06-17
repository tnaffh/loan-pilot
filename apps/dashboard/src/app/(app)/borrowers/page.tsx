'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  EmploymentType,
  createBorrowerSchema,
  formatNad,
  type CreateBorrowerInput,
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
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { InitialsAvatar } from '@/components/initials-avatar';
import { DataTable } from '@/components/data-table';
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

const FieldError = ({ message }: { message?: string }) =>
  message ? <p className="mt-1 text-xs text-destructive">{message}</p> : null;

const isBorrowerField = (path: string): path is keyof CreateBorrowerInput =>
  path in createBorrowerSchema.shape;

const columns: ColumnDef<BorrowerRow>[] = [
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
  { id: 'id number', header: 'ID number', accessorKey: 'idNumber' },
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
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateBorrowerInput>({
    resolver: zodResolver(createBorrowerSchema),
    defaultValues: { employmentType: EmploymentType.PermanentlyEmployed },
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
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...register('phone')} />
                <FieldError message={errors.phone?.message} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
                <FieldError message={errors.email?.message} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" {...register('address')} />
                <FieldError message={errors.address?.message} />
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
                <Label htmlFor="monthlyIncome">Monthly income (N$)</Label>
                <Input
                  id="monthlyIncome"
                  type="number"
                  inputMode="numeric"
                  {...register('monthlyIncome')}
                />
                <FieldError message={errors.monthlyIncome?.message} />
              </div>
              <div>
                <Label htmlFor="employmentType">Employment type</Label>
                <select
                  id="employmentType"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                  {...register('employmentType')}
                >
                  {Object.values(EmploymentType).map((value) => (
                    <option key={value} value={value}>
                      {EMPLOYMENT_LABELS[value]}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.employmentType?.message} />
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
  const { data, loading, error, refresh } = useApi<BorrowerRow[]>('/borrowers');

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
        />
      )}
    </div>
  );
};

export default BorrowersPage;
