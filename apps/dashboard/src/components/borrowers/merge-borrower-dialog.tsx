'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Search, Users } from 'lucide-react';
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
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { BorrowerDetail, BorrowerRow } from '@/lib/types';

interface Props {
  survivor: BorrowerDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void;
}

const loansLabel = (n: number) => `${n} ${n === 1 ? 'loan' : 'loans'}`;

const BorrowerOption = ({
  borrower,
  onClick,
}: {
  borrower: BorrowerRow;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
  >
    <div className="min-w-0">
      <div className="truncate font-medium">
        {borrower.firstName} {borrower.lastName}
      </div>
      <div className="truncate text-xs text-muted-foreground">
        {borrower.idNumber} · {borrower.phone}
      </div>
    </div>
    <span className="shrink-0 text-xs text-muted-foreground">{loansLabel(borrower._count.loans)}</span>
  </button>
);

export const MergeBorrowerDialog = ({ survivor, open, onOpenChange, onMerged }: Props) => {
  const { token } = useAuth();
  const [suggestions, setSuggestions] = useState<BorrowerRow[]>([]);
  const [all, setAll] = useState<BorrowerRow[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<BorrowerRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the picker when the dialog closes so the next open starts clean.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('');
      setSelected(null);
    }
    onOpenChange(next);
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([
      apiFetch<BorrowerRow[]>(`/borrowers/${survivor.id}/duplicate-suggestions`, { token }),
      apiFetch<BorrowerRow[]>('/borrowers', { token }),
    ])
      .then(([sug, list]) => {
        if (!active) return;
        setSuggestions(sug);
        setAll(list);
      })
      .catch(() => {
        if (active) toast.error('Could not load borrowers');
      });
    return () => {
      active = false;
    };
  }, [open, survivor.id, token]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return all
      .filter((b) => b.id !== survivor.id)
      .filter((b) =>
        `${b.firstName} ${b.lastName} ${b.idNumber} ${b.phone}`.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [all, query, survivor.id]);

  const visibleSuggestions = suggestions.filter((b) => b.id !== survivor.id);

  const merge = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await apiFetch(`/borrowers/${survivor.id}/merge`, {
        method: 'POST',
        body: { duplicateId: selected.id },
        token,
      });
      toast.success('Borrowers merged');
      handleOpenChange(false);
      onMerged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge duplicate</DialogTitle>
          <DialogDescription>
            Pick the duplicate record to absorb into {survivor.firstName} {survivor.lastName}. Its
            loans and history move here; the duplicate is then deleted.
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              Move {loansLabel(selected._count.loans)} from{' '}
              <span className="font-medium">
                {selected.firstName} {selected.lastName}
              </span>{' '}
              ({selected.idNumber}) into{' '}
              <span className="font-medium">
                {survivor.firstName} {survivor.lastName}
              </span>
              . <span className="font-medium">{selected.firstName}</span> will be permanently deleted.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)} disabled={submitting}>
                Back
              </Button>
              <Button variant="destructive" onClick={merge} disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                Merge & delete duplicate
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleSuggestions.length > 0 ? (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Users className="size-3.5" /> Likely duplicates
                </p>
                {visibleSuggestions.map((b) => (
                  <BorrowerOption key={b.id} borrower={b} onClick={() => setSelected(b)} />
                ))}
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, ID or phone"
                  className="pl-8"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              {query.trim() ? (
                matches.length > 0 ? (
                  <div className="space-y-2">
                    {matches.map((b) => (
                      <BorrowerOption key={b.id} borrower={b} onClick={() => setSelected(b)} />
                    ))}
                  </div>
                ) : (
                  <p className="px-1 py-2 text-sm text-muted-foreground">No matching borrowers.</p>
                )
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
