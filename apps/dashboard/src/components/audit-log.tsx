import { History } from 'lucide-react';
import type { AuditEntry } from '@/lib/types';
import { formatDate } from '@/lib/format';

const ACTION_LABELS: Record<string, string> = {
  updated: 'updated details',
  address_updated: 'updated the address',
  bank_updated: 'updated bank details',
  cancelled: 'cancelled the loan',
};

/** Turn a stored field name into a human label. */
const fieldLabel = (field: string): string =>
  field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bId\b/, 'ID');

/** Recent change history for a borrower or loan (from the audit trail). */
export const AuditLog = ({ entries }: { entries: AuditEntry[] }) => {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No changes recorded yet.</p>;
  }
  return (
    <ol className="space-y-4">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <History className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm">
              <span className="font-medium">{entry.actorName}</span>{' '}
              <span className="text-muted-foreground">
                {ACTION_LABELS[entry.action] ?? entry.action}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</p>
            {entry.changes.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                {entry.changes.map((change, index) => (
                  <li key={`${entry.id}-${index}`}>
                    <span className="font-medium text-foreground">{fieldLabel(change.field)}</span>:{' '}
                    <span className="line-through">{change.from ?? '—'}</span> →{' '}
                    <span className="text-foreground">{change.to ?? '—'}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
};
