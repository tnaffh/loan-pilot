'use client';

import { useState } from 'react';
import { Check, ClipboardCopy } from 'lucide-react';
import { formatNad, fromCents, type BandedMatrix, type BandedRow } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface Props {
  matrix: BandedMatrix;
  /** Money matrices render N$; count matrices render plain integers. */
  kind: 'money' | 'count';
  caption?: string;
}

const ROWS: { key: keyof Pick<BandedMatrix, 'male' | 'female' | 'other' | 'unknown' | 'total'>; label: string }[] = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other', label: 'Other' },
  { key: 'unknown', label: 'Not recorded' },
  { key: 'total', label: 'Total' },
];

/**
 * A gender × amount-band grid (Part 15 by value, Part 7.2 by number).
 *
 * "Copy as TSV" exists because these grids are transcribed cell by cell into the
 * portal or a spreadsheet; pasting a tab-separated block is the difference
 * between one action and thirty-five.
 */
export const ReportMatrix = ({ matrix, kind, caption }: Props) => {
  const [copied, setCopied] = useState(false);

  const cell = (row: BandedRow, bandKey: string): number => row.bands[bandKey] ?? 0;
  const format = (value: number): string =>
    kind === 'money' ? formatNad(value) : String(value);
  const raw = (value: number): string =>
    kind === 'money' ? String(Number(fromCents(value).toFixed(2))) : String(value);

  const copyTsv = () => {
    const header = ['', 'Total', ...matrix.bands.map((band) => band.label)].join('\t');
    const body = ROWS.map(({ key, label }) => {
      const row = matrix[key];
      return [label, raw(row.total), ...matrix.bands.map((band) => raw(cell(row, band.key)))].join('\t');
    });
    void navigator.clipboard?.writeText([header, ...body].join('\n')).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => undefined,
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : <span />}
        <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0" onClick={copyTsv}>
          {copied ? <Check className="size-3.5 text-emerald-600" /> : <ClipboardCopy className="size-3.5" />}
          Copy table
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-28" />
              <TableHead className="text-right">Total</TableHead>
              {matrix.bands.map((band) => (
                <TableHead key={band.key} className="min-w-28 text-right">
                  {band.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map(({ key, label }) => {
              const row = matrix[key];
              const isTotal = key === 'total';
              const isUnknown = key === 'unknown';
              return (
                <TableRow key={key} className={cn(isTotal && 'font-semibold')}>
                  <TableCell
                    className={cn(
                      'font-medium',
                      // Flag the unallocated row: NAMFISA has no such column, so
                      // anything sitting here is missing from the filed split.
                      isUnknown && row.total > 0 && 'text-amber-600 dark:text-amber-400',
                    )}
                  >
                    {label}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{format(row.total)}</TableCell>
                  {matrix.bands.map((band) => (
                    <TableCell key={band.key} className="text-right tabular-nums">
                      {format(cell(row, band.key))}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
