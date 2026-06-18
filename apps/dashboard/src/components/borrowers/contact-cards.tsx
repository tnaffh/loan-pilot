'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Building2, Check, Loader2, MapPin, Plus } from 'lucide-react';
import {
  createBorrowerAddressSchema,
  createBorrowerBankAccountSchema,
  type CreateBorrowerAddressInput,
  type CreateBorrowerBankAccountInput,
} from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField } from '@/components/form-field';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { BorrowerAddress, BorrowerBankAccount } from '@/lib/types';

const ACCOUNT_TYPES = ['Savings', 'Cheque', 'Transmission'];

const ActiveBadge = () => (
  <Badge className="border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
    <Check /> Active
  </Badge>
);

interface Props {
  borrowerId: string;
  addresses: BorrowerAddress[];
  bankAccounts: BorrowerBankAccount[];
  onChanged: () => void;
}

export const ContactCards = ({ borrowerId, addresses, bankAccounts, onChanged }: Props) => {
  const { token } = useAuth();
  const [addressOpen, setAddressOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  const activate = async (path: string, id: string) => {
    setActivating(id);
    try {
      await apiFetch(path, { method: 'PATCH', body: {}, token });
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update');
    } finally {
      setActivating(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4 text-muted-foreground" /> Addresses
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setAddressOpen(true)}>
            <Plus className="size-4" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No address on file.</p>
          ) : (
            addresses.map((address) => (
              <div
                key={address.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {[address.street, address.suburb, address.city].filter(Boolean).join(', ')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[address.region, address.country].filter(Boolean).join(', ')}
                    {address.label ? ` · ${address.label}` : ''}
                  </div>
                </div>
                {address.isActive ? (
                  <ActiveBadge />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={activating !== null}
                    onClick={() => activate(`/borrowers/${borrowerId}/addresses/${address.id}/activate`, address.id)}
                  >
                    {activating === address.id ? <Loader2 className="size-4 animate-spin" /> : null}
                    Make active
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-muted-foreground" /> Bank accounts
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setAccountOpen(true)}>
            <Plus className="size-4" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {bankAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bank account on file.</p>
          ) : (
            bankAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {account.bankName} · {account.accountType}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {account.accountNumber || '—'}
                    {account.branchCode ? ` · branch ${account.branchCode}` : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">{account.accountHolderName}</div>
                </div>
                {account.isActive ? (
                  <ActiveBadge />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={activating !== null}
                    onClick={() =>
                      activate(`/borrowers/${borrowerId}/bank-accounts/${account.id}/activate`, account.id)
                    }
                  >
                    {activating === account.id ? <Loader2 className="size-4 animate-spin" /> : null}
                    Make active
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AddAddressDialog
        open={addressOpen}
        onOpenChange={setAddressOpen}
        borrowerId={borrowerId}
        onSaved={onChanged}
      />
      <AddBankAccountDialog
        open={accountOpen}
        onOpenChange={setAccountOpen}
        borrowerId={borrowerId}
        onSaved={onChanged}
      />
    </div>
  );
};

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  borrowerId: string;
  onSaved: () => void;
}

const AddAddressDialog = ({ open, onOpenChange, borrowerId, onSaved }: DialogProps) => {
  const { token } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateBorrowerAddressInput>({
    resolver: zodResolver(createBorrowerAddressSchema),
    defaultValues: { label: 'Residential', country: 'Namibia' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch(`/borrowers/${borrowerId}/addresses`, { method: 'POST', body: values, token });
      toast.success('Address added & set active');
      reset({ label: 'Residential', country: 'Namibia' });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add address</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Street address" htmlFor="a-street" error={errors.street?.message}>
            <Input id="a-street" {...register('street')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="City / town" htmlFor="a-city" error={errors.city?.message}>
              <Input id="a-city" {...register('city')} />
            </FormField>
            <FormField label="Suburb" htmlFor="a-suburb" optional>
              <Input id="a-suburb" {...register('suburb')} />
            </FormField>
            <FormField label="Region" htmlFor="a-region" optional>
              <Input id="a-region" {...register('region')} />
            </FormField>
            <FormField label="Country" htmlFor="a-country" error={errors.country?.message}>
              <Input id="a-country" {...register('country')} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Save address
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const AddBankAccountDialog = ({ open, onOpenChange, borrowerId, onSaved }: DialogProps) => {
  const { token } = useAuth();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateBorrowerBankAccountInput>({
    resolver: zodResolver(createBorrowerBankAccountSchema),
    defaultValues: { accountType: 'Savings' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await apiFetch(`/borrowers/${borrowerId}/bank-accounts`, { method: 'POST', body: values, token });
      toast.success('Bank account added & set active');
      reset({ accountType: 'Savings' });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add bank account</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Bank name" htmlFor="b-bank" error={errors.bankName?.message}>
              <Input id="b-bank" {...register('bankName')} />
            </FormField>
            <FormField label="Account holder" htmlFor="b-holder" error={errors.accountHolderName?.message}>
              <Input id="b-holder" {...register('accountHolderName')} />
            </FormField>
            <FormField label="Account number" htmlFor="b-number" error={errors.accountNumber?.message}>
              <Input id="b-number" inputMode="numeric" {...register('accountNumber')} />
            </FormField>
            <FormField label="Account type" htmlFor="b-type" error={errors.accountType?.message}>
              <Controller
                control={control}
                name="accountType"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger id="b-type" className="w-full">
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
            <FormField label="Branch name" htmlFor="b-branch" optional>
              <Input id="b-branch" {...register('branchName')} />
            </FormField>
            <FormField label="Branch code" htmlFor="b-code" optional>
              <Input id="b-code" {...register('branchCode')} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Save account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
