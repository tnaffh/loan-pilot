'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, CircleDashed, HandCoins, Loader2 } from 'lucide-react';
import { CollexiaStatus } from '@loan-pilot/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { formatDate } from '@/lib/format';
import type { LoanDetail } from '@/lib/types';

const EMERALD = 'border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-400';
const AMBER = 'border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-400';

export const COLLEXIA_LABELS: Record<CollexiaStatus, string> = {
  [CollexiaStatus.Pending]: 'Load on Collexia',
  [CollexiaStatus.Loaded]: 'On Collexia',
  [CollexiaStatus.Manual]: 'Manual pay',
};

export const DisbursementBadge = ({ released }: { released: boolean }) =>
  released ? (
    <Badge variant="outline" className={`gap-1 ${EMERALD}`}>
      <Check className="size-3" /> Disbursed
    </Badge>
  ) : (
    <Badge variant="outline" className={`gap-1 ${AMBER}`}>
      <CircleDashed className="size-3" /> To disburse
    </Badge>
  );

export const CollexiaBadge = ({ status }: { status: CollexiaStatus }) => {
  if (status === CollexiaStatus.Loaded) {
    return (
      <Badge variant="outline" className={`gap-1 ${EMERALD}`}>
        <Check className="size-3" /> On Collexia
      </Badge>
    );
  }
  if (status === CollexiaStatus.Manual) {
    return <Badge variant="outline">Manual pay</Badge>;
  }
  return (
    <Badge variant="outline" className={`gap-1 ${AMBER}`}>
      <HandCoins className="size-3" /> Load on Collexia
    </Badge>
  );
};

/** Loan-detail card to confirm disbursement, set Collexia loading state, and
 * capture the borrower's Collexia client reference. */
export const LoanOpsCard = ({
  loan,
  canEdit,
  onChanged,
}: {
  loan: LoanDetail;
  canEdit: boolean;
  onChanged: () => void;
}) => {
  const { token } = useAuth();
  const [savingDisb, setSavingDisb] = useState(false);
  const [savingCollexia, setSavingCollexia] = useState(false);
  const [savingClientNo, setSavingClientNo] = useState(false);
  const [clientNo, setClientNo] = useState(loan.borrower.collexiaClientNo ?? '');

  // Resync the client-number field whenever a different borrower is shown.
  const [syncId, setSyncId] = useState<string>(loan.borrower.id);
  if (loan.borrower.id !== syncId) {
    setSyncId(loan.borrower.id);
    setClientNo(loan.borrower.collexiaClientNo ?? '');
  }

  const setDisbursed = async (released: boolean) => {
    setSavingDisb(true);
    try {
      await apiFetch(`/loans/${loan.id}/disbursement`, { method: 'PATCH', body: { released }, token });
      toast.success(released ? 'Marked disbursed' : 'Marked not disbursed');
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setSavingDisb(false);
    }
  };

  const setCollexia = async (status: string) => {
    setSavingCollexia(true);
    try {
      await apiFetch(`/loans/${loan.id}/collexia`, { method: 'PATCH', body: { status }, token });
      toast.success('Collexia status updated');
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setSavingCollexia(false);
    }
  };

  const saveClientNo = async () => {
    setSavingClientNo(true);
    try {
      await apiFetch(`/borrowers/${loan.borrower.id}`, {
        method: 'PATCH',
        body: { collexiaClientNo: clientNo.trim() },
        token,
      });
      toast.success('Collexia client number saved');
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setSavingClientNo(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Disbursement &amp; Collexia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Disbursed from account</div>
            <div className="text-xs text-muted-foreground">
              {loan.fundsReleased
                ? `Released ${formatDate(loan.fundsReleasedAt)}`
                : 'Funds not yet released'}
            </div>
          </div>
          {canEdit ? (
            <label className="flex items-center gap-2 text-sm" htmlFor="loan-disbursed">
              {savingDisb ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
              <Checkbox
                id="loan-disbursed"
                checked={loan.fundsReleased}
                disabled={savingDisb}
                onCheckedChange={(checked) => setDisbursed(checked === true)}
              />
              Released
            </label>
          ) : (
            <DisbursementBadge released={loan.fundsReleased} />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <div className="min-w-0">
            <div className="text-sm font-medium">Collexia loading</div>
            <div className="text-xs text-muted-foreground">
              {loan.collexiaStatus === CollexiaStatus.Pending
                ? 'Load this loan for debt-order deductions'
                : `Marked ${formatDate(loan.collexiaMarkedAt)}`}
            </div>
          </div>
          {canEdit ? (
            <Select
              value={loan.collexiaStatus}
              onValueChange={(value) => value && setCollexia(value)}
              disabled={savingCollexia}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CollexiaStatus.Pending}>Pending</SelectItem>
                <SelectItem value={CollexiaStatus.Loaded}>Loaded</SelectItem>
                <SelectItem value={CollexiaStatus.Manual}>Manual pay</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <CollexiaBadge status={loan.collexiaStatus} />
          )}
        </div>

        <div className="border-t pt-4">
          <FormField label="Collexia client number" htmlFor="collexia-no">
            {canEdit ? (
              <div className="flex gap-2">
                <Input
                  id="collexia-no"
                  value={clientNo}
                  onChange={(event) => setClientNo(event.target.value)}
                  placeholder="Client reference on Collexia"
                />
                <Button
                  variant="outline"
                  onClick={saveClientNo}
                  disabled={savingClientNo || clientNo.trim() === (loan.borrower.collexiaClientNo ?? '')}
                >
                  {savingClientNo ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            ) : (
              <div className="text-sm font-medium">{loan.borrower.collexiaClientNo || '—'}</div>
            )}
          </FormField>
        </div>
      </CardContent>
    </Card>
  );
};
