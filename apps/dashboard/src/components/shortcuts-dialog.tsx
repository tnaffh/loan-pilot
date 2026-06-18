'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd, KbdGroup } from '@/components/ui/kbd';

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: 'Open command palette' },
  { keys: ['n'], label: 'Disburse a loan' },
  { keys: ['a'], label: 'New application' },
  { keys: ['p'], label: 'Record a payment' },
  { keys: ['/'], label: 'Search / open palette' },
  { keys: ['g', 'o'], label: 'Go to Overview' },
  { keys: ['g', 'l'], label: 'Go to Loans' },
  { keys: ['g', 'a'], label: 'Go to Applications' },
  { keys: ['g', 'b'], label: 'Go to Borrowers' },
  { keys: ['g', 'c'], label: 'Go to Calendar' },
  { keys: ['g', 'e'], label: 'Go to Expenses' },
  { keys: ['?'], label: 'Show this help' },
];

export const ShortcutsDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>Move through LoanPilot without leaving the keyboard.</DialogDescription>
      </DialogHeader>
      <dl className="divide-y">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.label} className="flex items-center justify-between py-2 text-sm">
            <dt className="text-muted-foreground">{shortcut.label}</dt>
            <dd>
              <KbdGroup>
                {shortcut.keys.map((key, index) => (
                  <Kbd key={`${shortcut.label}-${index}`}>{key}</Kbd>
                ))}
              </KbdGroup>
            </dd>
          </div>
        ))}
      </dl>
    </DialogContent>
  </Dialog>
);
