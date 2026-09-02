'use client';

import { AlertTriangle, Info } from 'lucide-react';
import type { ReportWarning } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  warnings: readonly ReportWarning[];
  /** Opens the manual-figures editor for the `manual_missing` warning. */
  onCaptureFigures?: () => void;
}

/**
 * The report's own health disclosure.
 *
 * A regulatory return that quietly reports zero where it simply has no data is
 * worse than one that says so. These are computed server-side and printed in the
 * PDF too, so what is on screen and what is filed agree.
 */
export const DataQualityAlert = ({ warnings, onCaptureFigures }: Props) => {
  if (warnings.length === 0) {
    return null;
  }

  const sorted = [...warnings].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1,
  );

  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <p className="mb-2 text-sm font-medium">Before you file</p>
      <ul className="space-y-2">
        {sorted.map((warning) => (
          <li key={warning.code} className="flex gap-2.5 text-sm">
            {warning.severity === 'warning' ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                'leading-snug',
                warning.severity === 'warning' ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {warning.message}
              {warning.code === 'manual_missing' && onCaptureFigures ? (
                <Button
                  variant="link"
                  size="sm"
                  className="ml-1 h-auto px-0 align-baseline text-sm"
                  onClick={onCaptureFigures}
                >
                  Capture them now
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
