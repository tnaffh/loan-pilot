'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  CalendarDays,
  FilePlus2,
  LayoutDashboard,
  Receipt,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { NewLoanSheet } from '@/components/loans/new-loan-sheet';
import { NewApplicationSheet } from '@/components/applications/new-application-sheet';
import { ApplicationReviewSheet } from '@/components/applications/review-sheet';
import { RecordPaymentDialog } from '@/components/loans/record-payment-dialog';
import { SettleDialog } from '@/components/loans/settle-dialog';
import { WriteOffDialog } from '@/components/loans/write-off-dialog';
import { CancelDialog } from '@/components/loans/cancel-dialog';
import { LoanQuickViewSheet } from '@/components/loans/loan-quick-view-sheet';
import { BorrowerQuickViewSheet } from '@/components/borrowers/borrower-quick-view-sheet';
import { ShortcutsDialog } from '@/components/shortcuts-dialog';
import type { LoanDetail } from '@/lib/types';

interface PaymentTarget {
  loanId?: string;
  loanLabel?: string;
}
interface SettleTarget {
  loanId: string;
  balance: number;
  loanLabel?: string;
}
interface WriteOffTarget {
  loanId: string;
  loanLabel?: string;
}
interface CancelTarget {
  loanId: string;
  loanLabel?: string;
}

interface CommandContextValue {
  openPalette: () => void;
  openShortcuts: () => void;
  openNewLoan: (borrowerId?: string) => void;
  openNewApplication: () => void;
  openReview: (applicationId: string) => void;
  openRecordPayment: (target?: PaymentTarget) => void;
  openSettle: (target: SettleTarget) => void;
  openWriteOff: (target: WriteOffTarget) => void;
  openCancel: (target: CancelTarget) => void;
  openLoanQuickView: (loanId: string) => void;
  openBorrowerQuickView: (borrowerId: string) => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);

export const useCommand = (): CommandContextValue => {
  const value = useContext(CommandContext);
  if (!value) {
    throw new Error('useCommand must be used within a CommandProvider');
  }
  return value;
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

const loanLabelOf = (loan: LoanDetail): string =>
  `${loan.borrower.firstName} ${loan.borrower.lastName}'s loan`;

export const CommandProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();

  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [newLoan, setNewLoan] = useState<{ borrowerId?: string } | null>(null);
  const [newApplication, setNewApplication] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [recordPayment, setRecordPayment] = useState<PaymentTarget | null>(null);
  const [settle, setSettle] = useState<SettleTarget | null>(null);
  const [writeOff, setWriteOff] = useState<WriteOffTarget | null>(null);
  const [cancel, setCancel] = useState<CancelTarget | null>(null);
  const [loanQuickView, setLoanQuickView] = useState<string | null>(null);
  const [borrowerQuickView, setBorrowerQuickView] = useState<string | null>(null);

  const openNewLoan = useCallback((borrowerId?: string) => setNewLoan({ borrowerId }), []);
  const openRecordPayment = useCallback((target?: PaymentTarget) => setRecordPayment(target ?? {}), []);

  const value: CommandContextValue = {
    openPalette: () => setPalette(true),
    openShortcuts: () => setShortcuts(true),
    openNewLoan,
    openNewApplication: () => setNewApplication(true),
    openReview: (applicationId) => setReview(applicationId),
    openRecordPayment,
    openSettle: (target) => setSettle(target),
    openWriteOff: (target) => setWriteOff(target),
    openCancel: (target) => setCancel(target),
    openLoanQuickView: (loanId) => setLoanQuickView(loanId),
    openBorrowerQuickView: (borrowerId) => setBorrowerQuickView(borrowerId),
  };

  // A single global keydown listener. `g` starts a two-key "go to" chord.
  const awaitingGoto = useRef(false);
  const gotoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const go = (path: string) => {
      router.push(path);
    };
    const handler = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;

      // Command palette — works anywhere, even while typing.
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette((open) => !open);
        return;
      }
      if (event.key === 'Escape') {
        awaitingGoto.current = false;
        return;
      }
      // Bare-key shortcuts are suppressed while typing or using a modifier.
      if (meta || event.altKey || isTypingTarget(event.target)) {
        return;
      }

      if (awaitingGoto.current) {
        awaitingGoto.current = false;
        const routes: Record<string, string> = {
          o: '/',
          l: '/loans',
          a: '/applications',
          b: '/borrowers',
          c: '/calendar',
          e: '/expenses',
        };
        const route = routes[event.key.toLowerCase()];
        if (route) {
          event.preventDefault();
          go(route);
        }
        return;
      }

      switch (event.key) {
        case 'g':
          awaitingGoto.current = true;
          if (gotoTimer.current) clearTimeout(gotoTimer.current);
          gotoTimer.current = setTimeout(() => (awaitingGoto.current = false), 1500);
          break;
        case 'n':
          event.preventDefault();
          setNewLoan({});
          break;
        case 'a':
          event.preventDefault();
          setNewApplication(true);
          break;
        case 'p':
          event.preventDefault();
          setRecordPayment({});
          break;
        case '/':
          event.preventDefault();
          setPalette(true);
          break;
        case '?':
          event.preventDefault();
          setShortcuts(true);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  const runFromPalette = (action: () => void) => {
    setPalette(false);
    // Defer so the palette unmounts before the next overlay opens.
    setTimeout(action, 0);
  };

  return (
    <CommandContext.Provider value={value}>
      {children}

      <CommandDialog open={palette} onOpenChange={setPalette} title="Command palette">
        <Command>
          <CommandInput placeholder="Search actions and pages…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => runFromPalette(() => setNewLoan({}))}>
                <Banknote />
                Disburse a loan
                <CommandShortcut>n</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runFromPalette(() => setNewApplication(true))}>
                <FilePlus2 />
                New application
                <CommandShortcut>a</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runFromPalette(() => setRecordPayment({}))}>
                <Wallet />
                Record a payment
                <CommandShortcut>p</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Go to">
              <CommandItem onSelect={() => runFromPalette(() => router.push('/'))}>
                <LayoutDashboard />
                Overview
              </CommandItem>
              <CommandItem onSelect={() => runFromPalette(() => router.push('/loans'))}>
                <Banknote />
                Loans
              </CommandItem>
              <CommandItem onSelect={() => runFromPalette(() => router.push('/applications'))}>
                <FilePlus2 />
                Applications
              </CommandItem>
              <CommandItem onSelect={() => runFromPalette(() => router.push('/borrowers'))}>
                <Users />
                Borrowers
              </CommandItem>
              <CommandItem onSelect={() => runFromPalette(() => router.push('/calendar'))}>
                <CalendarDays />
                Calendar
              </CommandItem>
              <CommandItem onSelect={() => runFromPalette(() => router.push('/expenses'))}>
                <Receipt />
                Expenses
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>

      <NewLoanSheet
        open={newLoan !== null}
        onOpenChange={(open) => (open ? null : setNewLoan(null))}
        borrowerId={newLoan?.borrowerId}
      />
      <NewApplicationSheet open={newApplication} onOpenChange={setNewApplication} />
      <ApplicationReviewSheet
        key={review ?? 'none'}
        open={review !== null}
        onOpenChange={(open) => (open ? null : setReview(null))}
        applicationId={review}
      />
      <RecordPaymentDialog
        open={recordPayment !== null}
        onOpenChange={(open) => (open ? null : setRecordPayment(null))}
        loanId={recordPayment?.loanId}
        loanLabel={recordPayment?.loanLabel}
      />
      {settle ? (
        <SettleDialog
          open
          onOpenChange={(open) => (open ? null : setSettle(null))}
          loanId={settle.loanId}
          balance={settle.balance}
          loanLabel={settle.loanLabel}
        />
      ) : null}
      {writeOff ? (
        <WriteOffDialog
          open
          onOpenChange={(open) => (open ? null : setWriteOff(null))}
          loanId={writeOff.loanId}
          loanLabel={writeOff.loanLabel}
        />
      ) : null}
      {cancel ? (
        <CancelDialog
          open
          onOpenChange={(open) => (open ? null : setCancel(null))}
          loanId={cancel.loanId}
          loanLabel={cancel.loanLabel}
        />
      ) : null}
      <LoanQuickViewSheet
        open={loanQuickView !== null}
        onOpenChange={(open) => (open ? null : setLoanQuickView(null))}
        loanId={loanQuickView}
        onRecordPayment={(loan) =>
          setRecordPayment({ loanId: loan.id, loanLabel: loanLabelOf(loan) })
        }
        onSettle={(loan) =>
          setSettle({ loanId: loan.id, balance: loan.balance, loanLabel: loanLabelOf(loan) })
        }
        onWriteOff={(loan) => setWriteOff({ loanId: loan.id, loanLabel: loanLabelOf(loan) })}
      />
      <BorrowerQuickViewSheet
        open={borrowerQuickView !== null}
        onOpenChange={(open) => (open ? null : setBorrowerQuickView(null))}
        borrowerId={borrowerQuickView}
        onNewLoan={(borrowerId) => setNewLoan({ borrowerId })}
        onOpenLoan={(loanId) => setLoanQuickView(loanId)}
      />
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
    </CommandContext.Provider>
  );
};
