'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDownCircle, ArrowUpCircle, Loader2, Plus, Wallet } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { ExpenseKind, UserRole, formatNad, fromCents } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DataTable } from '@/components/data-table';
import { FormField } from '@/components/form-field';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { bumpRevalidation } from '@/lib/revalidate';
import { formatDate } from '@/lib/format';
import type {
  ExpenseRow,
  IncomeRow,
  InvestmentRow,
  OverviewStats,
} from '@/lib/types';

const today = (): string => new Date().toISOString().slice(0, 10);

/** The four kinds of finance entry an admin can record. */
type EntryKind = 'income' | 'expense' | 'drawing' | 'capital';

const ENTRY_CONFIG: Record<
  EntryKind,
  { title: string; labelField: string; endpoint: string; dateField: string }
> = {
  income: { title: 'income', labelField: 'Category', endpoint: '/income', dateField: 'incurredAt' },
  expense: { title: 'expense', labelField: 'Category', endpoint: '/expenses', dateField: 'incurredAt' },
  drawing: { title: 'drawing', labelField: 'Category', endpoint: '/expenses', dateField: 'incurredAt' },
  capital: { title: 'capital injection', labelField: 'Name', endpoint: '/investments', dateField: 'contributedAt' },
};

const EntryDialog = ({
  kind,
  onOpenChange,
}: {
  kind: EntryKind | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const { token } = useAuth();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [period, setPeriod] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncKey, setSyncKey] = useState<EntryKind | null>(null);

  // Reset fields whenever a different entry kind is opened.
  if (kind && kind !== syncKey) {
    setSyncKey(kind);
    setLabel('');
    setAmount('');
    setDate(today());
    setPeriod('');
    setNote('');
  }

  const config = kind ? ENTRY_CONFIG[kind] : null;

  const save = async () => {
    if (!kind || !config) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        amount: Number(amount),
        period: period || undefined,
        note: note || undefined,
        [config.dateField]: date || undefined,
      };
      if (kind === 'capital') body.name = label;
      else body.category = label;
      if (kind === 'expense') body.kind = ExpenseKind.Expense;
      if (kind === 'drawing') body.kind = ExpenseKind.Drawing;

      await apiFetch(config.endpoint, { method: 'POST', body, token });
      toast.success(`Recorded ${config.title}`);
      bumpRevalidation();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="capitalize">Record {config?.title}</DialogTitle>
          <DialogDescription>Amounts are in N$.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={config?.labelField ?? 'Category'} htmlFor="entry-label">
              <Input id="entry-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </FormField>
            <FormField label="Amount (N$)" htmlFor="entry-amount">
              <Input
                id="entry-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </FormField>
            <FormField label="Date" htmlFor="entry-date">
              <Input
                id="entry-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </FormField>
            <FormField label="Period" htmlFor="entry-period" optional>
              <Input
                id="entry-period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="e.g. Jun 2026"
              />
            </FormField>
          </div>
          <FormField label="Note" htmlFor="entry-note" optional>
            <Input id="entry-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !label || !amount}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const OpeningBalanceDialog = ({
  open,
  current,
  onOpenChange,
}: {
  open: boolean;
  current: number;
  onOpenChange: (open: boolean) => void;
}) => {
  const { token } = useAuth();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);

  if (open && !seeded) {
    setSeeded(true);
    setValue(fromCents(current).toString());
  }
  if (!open && seeded) setSeeded(false);

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch('/settings/opening-balance', {
        method: 'PATCH',
        body: { openingBalance: Number(value) },
        token,
      });
      toast.success('Opening balance updated');
      bumpRevalidation();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opening / bank balance</DialogTitle>
          <DialogDescription>
            The cash already in the bank before recorded flows, so the available balance matches your
            actual account. In N$.
          </DialogDescription>
        </DialogHeader>
        <FormField label="Opening balance (N$)" htmlFor="opening">
          <Input
            id="opening"
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const expenseColumns = (label: string): ColumnDef<ExpenseRow | IncomeRow>[] => [
  {
    id: 'category',
    header: label,
    accessorKey: 'category',
    cell: ({ row }) => <span className="font-medium">{row.original.category}</span>,
  },
  { id: 'period', header: 'Period', accessorKey: 'period', cell: ({ row }) => row.original.period ?? '—' },
  { id: 'date', header: 'Date', accessorKey: 'incurredAt', cell: ({ row }) => formatDate(row.original.incurredAt) },
  {
    id: 'amount',
    header: () => <div className="text-right">Amount</div>,
    accessorKey: 'amount',
    cell: ({ row }) => <div className="text-right tabular-nums">{formatNad(row.original.amount)}</div>,
  },
];

const capitalColumns: ColumnDef<InvestmentRow>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
  { id: 'period', header: 'Period', accessorKey: 'period', cell: ({ row }) => row.original.period ?? '—' },
  { id: 'date', header: 'Date', accessorKey: 'contributedAt', cell: ({ row }) => formatDate(row.original.contributedAt) },
  {
    id: 'amount',
    header: () => <div className="text-right">Amount</div>,
    accessorKey: 'amount',
    cell: ({ row }) => <div className="text-right tabular-nums">{formatNad(row.original.amount)}</div>,
  },
];

const FinancePage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const admin = user?.role === UserRole.LenderAdmin;
  const { data: stats } = useApi<OverviewStats>('/stats/overview');
  const { data: expenses, loading } = useApi<ExpenseRow[]>('/expenses');
  const { data: income } = useApi<IncomeRow[]>('/income');
  const { data: capital } = useApi<InvestmentRow[]>('/investments');

  const [entry, setEntry] = useState<EntryKind | null>(null);
  const [editingOpening, setEditingOpening] = useState(false);

  // Finance is admin-only; bounce staff who reach it via a direct URL.
  useEffect(() => {
    if (user && !admin) {
      router.replace('/');
    }
  }, [user, admin, router]);

  const lender = stats && stats.kind === 'lender' ? stats : null;
  const operating = useMemo(
    () => (expenses ?? []).filter((row) => row.kind === ExpenseKind.Expense),
    [expenses],
  );
  const drawings = useMemo(
    () => (expenses ?? []).filter((row) => row.kind === ExpenseKind.Drawing),
    [expenses],
  );

  // Render nothing for non-admins while the redirect above takes effect.
  if (!admin) {
    return null;
  }

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Income, expenses, capital and the cash available to lend"
        action={
          admin ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setEntry('income')}>
                <Plus className="size-4" /> Income
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEntry('expense')}>
                <Plus className="size-4" /> Expense
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEntry('drawing')}>
                <Plus className="size-4" /> Drawing
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEntry('capital')}>
                <Plus className="size-4" /> Capital
              </Button>
            </div>
          ) : null
        }
      />

      {lender ? (
        <div className="mb-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Available balance"
              value={formatNad(lender.availableBalance ?? 0)}
              icon={Wallet}
              tone={(lender.availableBalance ?? 0) >= 0 ? 'green' : 'red'}
              hint="Cash available to lend"
            />
            <StatCard label="Income + capital in" value={formatNad((lender.income ?? 0) + (lender.invested ?? 0))} icon={ArrowUpCircle} tone="green" />
            <StatCard label="Expenses" value={formatNad(lender.expenses ?? 0)} icon={ArrowDownCircle} tone="amber" />
            <StatCard label="Owner drawings" value={formatNad(lender.drawings ?? 0)} icon={ArrowDownCircle} />
          </div>
          {admin ? (
            <Button
              variant="link"
              size="sm"
              className="mt-1 h-auto px-0 text-xs text-muted-foreground"
              onClick={() => setEditingOpening(true)}
            >
              Opening balance: {formatNad(lender.openingBalance ?? 0)} — edit
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading && !expenses ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <Tabs defaultValue="income">
          <TabsList>
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="drawings">Drawings</TabsTrigger>
            <TabsTrigger value="capital">Capital</TabsTrigger>
          </TabsList>
          <TabsContent value="income" className="mt-4">
            <DataTable columns={expenseColumns('Category')} data={income ?? []} searchPlaceholder="Search income…" />
          </TabsContent>
          <TabsContent value="expenses" className="mt-4">
            <DataTable columns={expenseColumns('Category')} data={operating} searchPlaceholder="Search expenses…" />
          </TabsContent>
          <TabsContent value="drawings" className="mt-4">
            <DataTable columns={expenseColumns('Category')} data={drawings} searchPlaceholder="Search drawings…" />
          </TabsContent>
          <TabsContent value="capital" className="mt-4">
            <DataTable columns={capitalColumns} data={capital ?? []} searchPlaceholder="Search capital…" />
          </TabsContent>
        </Tabs>
      )}

      <EntryDialog kind={entry} onOpenChange={(open) => (open ? null : setEntry(null))} />
      <OpeningBalanceDialog
        open={editingOpening}
        current={lender?.openingBalance ?? 0}
        onOpenChange={setEditingOpening}
      />
    </div>
  );
};

export default FinancePage;
