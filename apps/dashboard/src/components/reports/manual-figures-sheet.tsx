'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  NAMFISA_MANUAL_FIELDS,
  fromCents,
  isManualMoneyField,
  type RegulatoryFigures,
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
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/form-field';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface Props {
  period: string;
  periodLabel: string;
  figures: RegulatoryFigures;
  notes: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** Group the catalogue by the form part each figure belongs to. */
const GROUPS = NAMFISA_MANUAL_FIELDS.reduce<{ part: string; keys: string[] }[]>((groups, field) => {
  const existing = groups.find((group) => group.part === field.part);
  if (existing) {
    existing.keys.push(field.key);
  } else {
    groups.push({ part: field.part, keys: [field.key] });
  }
  return groups;
}, []);

/**
 * The figures the loan register cannot answer — complaints, provisioning,
 * rescheduling, branches and the ledger liabilities. Captured once per quarter
 * and saved, so the return is complete and reproducible next time.
 *
 * Money is entered in whole N$ (and stored as cents, like every other amount);
 * the field catalogue in the domain decides which is which, so adding a NAMFISA
 * field never means touching this form.
 */
export const ManualFiguresSheet = ({
  period,
  periodLabel,
  figures,
  notes,
  open,
  onOpenChange,
  onSaved,
}: Props) => {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  // Reload the form whenever a different quarter is opened.
  const formKey = `${period}|${open}`;
  if (open && formKey !== syncKey) {
    setSyncKey(formKey);
    setValues(
      Object.fromEntries(
        NAMFISA_MANUAL_FIELDS.map((field) => {
          const stored = figures[field.key];
          if (stored === undefined) {
            return [field.key, ''];
          }
          return [field.key, String(isManualMoneyField(field.key) ? fromCents(stored) : stored)];
        }),
      ),
    );
    setNote(notes);
  }

  const save = async () => {
    setBusy(true);
    try {
      const payload: Record<string, number> = {};
      for (const [key, raw] of Object.entries(values)) {
        const trimmed = raw.trim();
        if (trimmed.length > 0 && Number.isFinite(Number(trimmed))) {
          payload[key] = Number(trimmed);
        }
      }
      await apiFetch(`/reports/quarterly/${period}/figures`, {
        method: 'PUT',
        body: { figures: payload, notes: note },
        token,
      });
      toast.success(`Saved the ${periodLabel} figures`);
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Complete the {periodLabel} return</SheetTitle>
          <SheetDescription>
            Figures the loan book cannot derive. Amounts are in N$.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4">
          {GROUPS.map((group) => (
            <div key={group.part} className="space-y-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {group.part}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.keys.map((key) => {
                  const field = NAMFISA_MANUAL_FIELDS.find((entry) => entry.key === key);
                  if (!field) {
                    return null;
                  }
                  return (
                    <FormField
                      key={key}
                      label={field.kind === 'money' ? `${field.label} (N$)` : field.label}
                      htmlFor={`figure-${key}`}
                      description={field.hint}
                    >
                      <Input
                        id={`figure-${key}`}
                        type="number"
                        min={0}
                        step={field.kind === 'money' ? '0.01' : '1'}
                        inputMode="decimal"
                        placeholder="0"
                        value={values[key] ?? ''}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [key]: event.target.value }))
                        }
                      />
                    </FormField>
                  );
                })}
              </div>
            </div>
          ))}

          <FormField label="Notes" htmlFor="figure-notes" optional>
            <Textarea
              id="figure-notes"
              rows={3}
              value={note}
              placeholder="Anything the reviewer should know about this quarter."
              onChange={(event) => setNote(event.target.value)}
            />
          </FormField>
        </div>

        <SheetFooter>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Save figures
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
