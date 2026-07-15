'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Power, Trash2 } from 'lucide-react';
import { LoanType, formatNad, fromCents } from '@loan-pilot/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { FormField, selectClass } from '@/components/form-field';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';

// ----- shared shapes (mirror the API payloads) ------------------------------

interface FeeSettings {
  namfisaLevyRate: number; // fraction
  stampDuty: number; // cents
  insuranceRate: number; // fraction
  insuranceFlat: number; // cents
  monthlyRate: number; // fraction
}

interface LoanProduct {
  id: string;
  name: string;
  loanType: LoanType | null;
  interestRate: number; // fraction
  active: boolean;
  isDefault: boolean;
}

interface LevyYear {
  year: number;
  loanCount: number;
  levyCents: number;
  stampDutyCents: number;
}

interface LevyReport {
  years: LevyYear[];
  totalLevyCents: number;
  totalStampDutyCents: number;
}

const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  [LoanType.Payday]: 'Payday',
  [LoanType.Business]: 'Business',
  [LoanType.Collateral]: 'Collateral',
};

const pct = (fraction: number): string => `${(fraction * 100).toFixed(2)}%`;

// ----- fee settings ----------------------------------------------------------

const FeeSettingsCard = () => {
  const { token } = useAuth();
  const { data, loading, refresh } = useApi<FeeSettings>('/settings/fees');
  const [levy, setLevy] = useState('');
  const [stamp, setStamp] = useState('');
  const [insRate, setInsRate] = useState('');
  const [insFlat, setInsFlat] = useState('');
  const [monthly, setMonthly] = useState('');
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState<FeeSettings | null>(null);

  // Seed the form when the settings load/refresh (rates as %, money in major N$).
  if (data && data !== seeded) {
    setSeeded(data);
    setLevy((data.namfisaLevyRate * 100).toString());
    setStamp(fromCents(data.stampDuty).toString());
    setInsRate((data.insuranceRate * 100).toString());
    setInsFlat(fromCents(data.insuranceFlat).toString());
    setMonthly((data.monthlyRate * 100).toString());
  }

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch('/settings/fees', {
        method: 'PATCH',
        token,
        body: {
          namfisaLevyRate: Number(levy) / 100,
          stampDuty: Number(stamp),
          insuranceRate: Number(insRate) / 100,
          insuranceFlat: Number(insFlat),
          monthlyRate: Number(monthly) / 100,
        },
      });
      toast.success('Fee settings saved');
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Levies &amp; fees</CardTitle>
        <CardDescription>
          Applied to every new loan. The loan amount is grossed up by these fees, and interest is
          charged on the resulting principal debt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="NAMFISA levy"
            htmlFor="levy"
            description="Percentage of the loan amount, e.g. 1.03%. Remitted to NAMFISA annually."
          >
            <div className="relative">
              <Input
                id="levy"
                type="number"
                step="0.01"
                value={levy}
                onChange={(e) => setLevy(e.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </FormField>
          <FormField label="Stamp duty" htmlFor="stamp" description="Flat fee per loan agreement.">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                N$
              </span>
              <Input
                id="stamp"
                type="number"
                step="0.01"
                className="pl-9"
                value={stamp}
                onChange={(e) => setStamp(e.target.value)}
              />
            </div>
          </FormField>
          <FormField
            label="Insurance rate"
            htmlFor="insRate"
            description="Percentage of the loan amount (0 to disable)."
          >
            <div className="relative">
              <Input
                id="insRate"
                type="number"
                step="0.01"
                value={insRate}
                onChange={(e) => setInsRate(e.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </FormField>
          <FormField
            label="Insurance (flat)"
            htmlFor="insFlat"
            description="Optional flat insurance fee added on top."
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                N$
              </span>
              <Input
                id="insFlat"
                type="number"
                step="0.01"
                className="pl-9"
                value={insFlat}
                onChange={(e) => setInsFlat(e.target.value)}
              />
            </div>
          </FormField>
          <FormField
            label="Monthly / default interest"
            htmlFor="monthly"
            description="Term-loan growth after month 1, and default interest on overdue instalments. Max 5%."
          >
            <div className="relative">
              <Input
                id="monthly"
                type="number"
                step="0.01"
                max="5"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </FormField>
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Save fee settings
        </Button>
      </CardContent>
    </Card>
  );
};

// ----- products --------------------------------------------------------------

const ProductSheet = ({
  target,
  open,
  onOpenChange,
  onSaved,
}: {
  target: LoanProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) => {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [loanType, setLoanType] = useState<string>('');
  const [rate, setRate] = useState('30');
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncKey, setSyncKey] = useState<string | null>(null);

  // Seed when a different product (or a fresh "add") is opened.
  const seedKey = open ? (target?.id ?? 'new') : null;
  if (seedKey !== syncKey) {
    setSyncKey(seedKey);
    if (open) {
      setName(target?.name ?? '');
      setLoanType(target?.loanType ?? '');
      setRate(target ? (target.interestRate * 100).toString() : '30');
      setIsDefault(target?.isDefault ?? false);
    }
  }

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name,
        loanType: loanType || undefined,
        interestRate: Number(rate) / 100,
        isDefault,
      };
      if (target) {
        await apiFetch(`/settings/products/${target.id}`, { method: 'PATCH', token, body });
        toast.success('Product updated');
      } else {
        await apiFetch('/settings/products', { method: 'POST', token, body });
        toast.success('Product created');
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{target ? 'Edit product' : 'New rate plan'}</SheetTitle>
          <SheetDescription>
            A named interest rate (e.g. a promotional 25%, or 0% for an interest-free loan), capped
            at the NAMFISA 30% ceiling.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <FormField label="Name" htmlFor="p-name">
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard, Promo Q3"
            />
          </FormField>
          <FormField label="Interest rate" htmlFor="p-rate" description="Maximum 30%.">
            <div className="relative">
              <Input
                id="p-rate"
                type="number"
                step="0.01"
                max="30"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </FormField>
          <FormField
            label="Loan type"
            htmlFor="p-type"
            description="Restrict this plan to one loan type, or leave as Any."
          >
            <select
              id="p-type"
              className={selectClass}
              value={loanType}
              onChange={(e) => setLoanType(e.target.value)}
            >
              <option value="">Any</option>
              {Object.values(LoanType).map((type) => (
                <option key={type} value={type}>
                  {LOAN_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Use as the default plan for new loans
          </label>
        </div>
        <SheetFooter>
          <Button onClick={save} disabled={busy || !name}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {target ? 'Save changes' : 'Create product'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

const ProductsCard = () => {
  const { token } = useAuth();
  const { data, loading, refresh } = useApi<LoanProduct[]>('/settings/products');
  const [editing, setEditing] = useState<LoanProduct | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [removing, setRemoving] = useState<LoanProduct | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (product: LoanProduct) => {
    setEditing(product);
    setSheetOpen(true);
  };

  const toggleActive = async (product: LoanProduct) => {
    try {
      await apiFetch(`/settings/products/${product.id}`, {
        method: 'PATCH',
        token,
        body: { active: !product.active },
      });
      toast.success(product.active ? 'Product deactivated' : 'Product activated');
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await apiFetch(`/settings/products/${removing.id}`, { method: 'DELETE', token });
      toast.success('Product deleted');
      setRemoving(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Rate plans</CardTitle>
          <CardDescription>
            Interest-rate products staff can pick when disbursing a loan. Deactivate a plan to retire
            it without losing the loans priced from it.
          </CardDescription>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4" />
          New plan
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rate plans yet. Add one — loans fall back to the standard rate for their type until you
            do.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((product) => (
                <TableRow
                  key={product.id}
                  className="cursor-pointer"
                  onClick={() => openEdit(product)}
                >
                  <TableCell className="font-medium">
                    {product.name}
                    {product.isDefault ? (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Default
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {product.loanType ? LOAN_TYPE_LABELS[product.loanType] : 'Any'}
                  </TableCell>
                  <TableCell>{pct(product.interestRate)}</TableCell>
                  <TableCell>
                    <Badge variant={product.active ? 'default' : 'outline'}>
                      {product.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        title={product.active ? 'Deactivate' : 'Activate'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleActive(product);
                        }}
                      >
                        <Power className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemoving(product);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ProductSheet
        target={editing}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={refresh}
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rate plan</AlertDialogTitle>
            <AlertDialogDescription>
              Delete “{removing?.name}”? If any loans were priced from it, deactivate it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRemove} disabled={deleting}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

// ----- levies report ---------------------------------------------------------

const LeviesCard = () => {
  const { data, loading } = useApi<LevyReport>('/settings/levies');

  return (
    <Card>
      <CardHeader>
        <CardTitle>NAMFISA levies collected</CardTitle>
        <CardDescription>
          Levies charged on loans, grouped by the year they were advanced. These are payable to
          NAMFISA annually. Cancelled loans are excluded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (data?.years.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No levies recorded yet. They accrue as loans with a NAMFISA levy are disbursed.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead className="text-right">Loans</TableHead>
                <TableHead className="text-right">NAMFISA levy</TableHead>
                <TableHead className="text-right">Stamp duty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.years ?? []).map((row) => (
                <TableRow key={row.year}>
                  <TableCell className="font-medium">{row.year}</TableCell>
                  <TableCell className="text-right">{row.loanCount}</TableCell>
                  <TableCell className="text-right">{formatNad(row.levyCents)}</TableCell>
                  <TableCell className="text-right">{formatNad(row.stampDutyCents)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right" />
                <TableCell className="text-right">{formatNad(data?.totalLevyCents ?? 0)}</TableCell>
                <TableCell className="text-right">
                  {formatNad(data?.totalStampDutyCents ?? 0)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

// ----- lender identity -------------------------------------------------------

interface LenderIdentity {
  legalName: string | null;
  namfisaLicenceNo: string | null;
  registrationNo: string | null;
  physicalAddress: string | null;
  postalAddress: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}

const LENDER_FIELDS: { key: keyof LenderIdentity; label: string; description?: string }[] = [
  { key: 'legalName', label: 'Legal name', description: 'As registered with NAMFISA.' },
  { key: 'namfisaLicenceNo', label: 'NAMFISA licence no.' },
  { key: 'registrationNo', label: 'Registration no.' },
  { key: 'physicalAddress', label: 'Physical address' },
  { key: 'postalAddress', label: 'Postal address' },
  { key: 'contactPhone', label: 'Contact phone' },
  { key: 'contactEmail', label: 'Contact email' },
];

const EMPTY_IDENTITY: LenderIdentity = {
  legalName: '',
  namfisaLicenceNo: '',
  registrationNo: '',
  physicalAddress: '',
  postalAddress: '',
  contactPhone: '',
  contactEmail: '',
};

const LenderIdentityCard = () => {
  const { token } = useAuth();
  const { data, loading, refresh } = useApi<LenderIdentity>('/settings/lender-identity');
  const [form, setForm] = useState<LenderIdentity>(EMPTY_IDENTITY);
  const [seeded, setSeeded] = useState<LenderIdentity | null>(null);
  const [busy, setBusy] = useState(false);

  if (data && data !== seeded) {
    setSeeded(data);
    setForm({
      legalName: data.legalName ?? '',
      namfisaLicenceNo: data.namfisaLicenceNo ?? '',
      registrationNo: data.registrationNo ?? '',
      physicalAddress: data.physicalAddress ?? '',
      postalAddress: data.postalAddress ?? '',
      contactPhone: data.contactPhone ?? '',
      contactEmail: data.contactEmail ?? '',
    });
  }

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch('/settings/lender-identity', { method: 'PATCH', token, body: form });
      toast.success('Lender identity saved');
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lender identity</CardTitle>
        <CardDescription>
          Shown on the header of every generated loan agreement. NAMFISA requires the microlender&apos;s
          licence details and contact information to appear on the agreement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {LENDER_FIELDS.map((field) => (
            <FormField
              key={field.key}
              label={field.label}
              htmlFor={field.key}
              description={field.description}
              optional
            >
              <Input
                id={field.key}
                value={form[field.key] ?? ''}
                onChange={(e) => setForm((current) => ({ ...current, [field.key]: e.target.value }))}
              />
            </FormField>
          ))}
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Save lender identity
        </Button>
      </CardContent>
    </Card>
  );
};

const SettingsPage = () => (
  <div>
    <PageHeader
      title="Rates & fees"
      description="Manage interest-rate plans, NAMFISA levies and other loan fees"
    />
    <Tabs defaultValue="fees">
      <TabsList>
        <TabsTrigger value="fees">Levies &amp; fees</TabsTrigger>
        <TabsTrigger value="products">Rate plans</TabsTrigger>
        <TabsTrigger value="levies">Levies collected</TabsTrigger>
        <TabsTrigger value="identity">Lender identity</TabsTrigger>
      </TabsList>
      <TabsContent value="fees" className="mt-4">
        <FeeSettingsCard />
      </TabsContent>
      <TabsContent value="products" className="mt-4">
        <ProductsCard />
      </TabsContent>
      <TabsContent value="levies" className="mt-4">
        <LeviesCard />
      </TabsContent>
      <TabsContent value="identity" className="mt-4">
        <LenderIdentityCard />
      </TabsContent>
    </Tabs>
  </div>
);

export default SettingsPage;
