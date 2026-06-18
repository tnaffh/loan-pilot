'use client';

import { Banknote, FilePlus2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useCommand } from '@/components/command-provider';

/** Topbar cluster of primary lifecycle actions, each with its keyboard hint. */
export const QuickActions = () => {
  const command = useCommand();

  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" onClick={() => command.openNewLoan()} title="Disburse a loan (n)">
        <Banknote />
        <span className="hidden md:inline">New loan</span>
        <Kbd className="hidden md:inline-flex">n</Kbd>
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => command.openNewApplication()}
        title="New application (a)"
      >
        <FilePlus2 />
        <span className="hidden lg:inline">Application</span>
        <Kbd className="hidden lg:inline-flex">a</Kbd>
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => command.openRecordPayment()}
        title="Record a payment (p)"
      >
        <Wallet />
        <span className="hidden lg:inline">Payment</span>
        <Kbd className="hidden lg:inline-flex">p</Kbd>
      </Button>
    </div>
  );
};
