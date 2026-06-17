'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Plus, Search } from 'lucide-react';
import {
  EmploymentType,
  createBorrowerSchema,
  formatNad,
  type CreateBorrowerInput,
} from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { InitialsAvatar } from '@/components/initials-avatar';
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

const NewBorrowerDialog = ({ onCreated }: { onCreated: () => void }) => {
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New borrower</DialogTitle>
            <DialogDescription>
              Capture a borrower record. Monthly income is in N$.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
                  className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
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
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Create borrower
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

const BorrowersPage = () => {
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<BorrowerRow[]>('/borrowers');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return data ?? [];
    }
    return (data ?? []).filter((borrower) =>
      [`${borrower.firstName} ${borrower.lastName}`, borrower.idNumber, borrower.phone]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [data, query]);

  return (
    <div>
      <PageHeader
        title="Borrowers"
        description="Everyone with a record at your branch"
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or ID"
                className="h-9 w-52 rounded-lg border bg-card pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
              />
            </div>
            <NewBorrowerDialog onCreated={refresh} />
          </div>
        }
      />

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Borrower</TableHead>
                <TableHead>ID number</TableHead>
                <TableHead>Employer</TableHead>
                <TableHead className="text-right">Monthly income</TableHead>
                <TableHead className="text-right">Loans</TableHead>
                <TableHead>Since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((borrower) => (
                <TableRow
                  key={borrower.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/borrowers/${borrower.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={`${borrower.firstName} ${borrower.lastName}`} />
                      <div>
                        <div className="font-medium">
                          {borrower.firstName} {borrower.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">{borrower.phone}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{borrower.idNumber}</TableCell>
                  <TableCell>
                    <div>{borrower.employer}</div>
                    <div className="text-xs text-muted-foreground">{borrower.occupation}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNad(borrower.monthlyIncome)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{borrower._count.loans}</TableCell>
                  <TableCell>{formatDate(borrower.since)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No borrowers found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};

export default BorrowersPage;
