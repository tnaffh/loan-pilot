'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { can, type AvailablePeriods } from '@loan-pilot/domain';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { LeviesCard } from '@/components/reports/levies-card';
import { MonthlyReport } from '@/components/reports/monthly-report';
import { QuarterlyReturn } from '@/components/reports/quarterly-return';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';

const PeriodPicker = ({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly { key: string; label: string }[];
  onChange: (next: string) => void;
}) => (
  <Select value={value} onValueChange={(next) => onChange(next ?? value)}>
    <SelectTrigger size="sm" className="w-48">
      <CalendarRange className="size-4 text-muted-foreground" />
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option.key} value={option.key}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const ReportsPage = () => {
  const { user } = useAuth();
  const router = useRouter();
  // Reports expose the lender's capital position, so they follow the same gate
  // as Finance rather than `reports:read` alone.
  const allowed = Boolean(user && can(user, 'reports:read') && can(user, 'finance:read'));

  const { data: periods } = useApi<AvailablePeriods>(allowed ? '/reports/periods' : null);
  const [monthChoice, setMonthChoice] = useState('');
  const [quarterChoice, setQuarterChoice] = useState('');

  useEffect(() => {
    if (user && !allowed) {
      router.replace('/');
    }
  }, [user, allowed, router]);

  // Derived rather than seeded in an effect: until the operator picks one, the
  // selection *is* the most recent period with activity.
  const month = monthChoice || periods?.months[0]?.key || '';
  const quarter = quarterChoice || periods?.quarters[0]?.key || '';

  if (!allowed) {
    return null;
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="NAMFISA quarterly returns and the monthly management report"
      />

      <Tabs defaultValue="monthly">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="monthly">Monthly report</TabsTrigger>
            <TabsTrigger value="quarterly">NAMFISA return</TabsTrigger>
            <TabsTrigger value="levies">Levies</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="monthly" className="mt-4 space-y-4">
          {periods ? (
            <>
              <PeriodPicker value={month} options={periods.months} onChange={setMonthChoice} />
              {month ? <MonthlyReport month={month} /> : null}
            </>
          ) : (
            <Skeleton className="h-96 w-full rounded-xl" />
          )}
        </TabsContent>

        <TabsContent value="quarterly" className="mt-4 space-y-4">
          {periods ? (
            <>
              <PeriodPicker value={quarter} options={periods.quarters} onChange={setQuarterChoice} />
              {quarter ? <QuarterlyReturn period={quarter} user={user} /> : null}
            </>
          ) : (
            <Skeleton className="h-96 w-full rounded-xl" />
          )}
        </TabsContent>

        <TabsContent value="levies" className="mt-4">
          <LeviesCard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportsPage;
