import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { RepaymentStatus, formatNad } from '@loan-pilot/domain';
import { Text } from '@/components/ui';
import { cn } from '@/lib/cn';
import { daysUntil, formatDate } from '@/lib/format';
import type { ScheduleItem } from '@/lib/types';

/** Vertical repayment timeline: paid ✓, the next one due highlighted, overdue in red. */
export const ScheduleTimeline = ({ schedule }: { schedule: ScheduleItem[] }) => {
  const nextDue = schedule.find((item) => item.status !== RepaymentStatus.Paid);

  return (
    <View>
      {schedule.map((item, index) => {
        const paid = item.status === RepaymentStatus.Paid;
        // Stored status lags until arrears are recomputed; a past due date doesn't.
        const overdue =
          item.status === RepaymentStatus.Overdue || (!paid && daysUntil(item.dueAt) < 0);
        const isNext = item.id === nextDue?.id;
        const last = index === schedule.length - 1;

        return (
          <View key={item.id} className="flex-row gap-3.5">
            <View className="w-6 items-center">
              <View
                className={cn(
                  'size-6 items-center justify-center rounded-full border-2 border-border bg-card',
                  paid && 'border-0 bg-success',
                  isNext && !overdue && 'border-0 bg-primary',
                  overdue && 'border-0 bg-destructive',
                )}
              >
                {paid ? (
                  <Check size={14} color="#ffffff" strokeWidth={3} />
                ) : (
                  <Text
                    variant="caption"
                    className={cn(
                      'font-sans-semibold',
                      isNext || overdue ? 'text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {item.number}
                  </Text>
                )}
              </View>
              {!last ? (
                <View className={cn('min-h-7 w-0.5 flex-1', paid ? 'bg-success' : 'bg-border')} />
              ) : null}
            </View>
            <View className={cn('flex-1 flex-row justify-between', !last && 'pb-5')}>
              <View className="gap-0.5">
                <Text variant="bodyMedium">Instalment {item.number}</Text>
                <Text variant="small" tone={overdue ? 'destructive' : 'muted'}>
                  {paid
                    ? `Paid ${formatDate(item.paidAt)}`
                    : `${overdue ? 'Was due' : 'Due'} ${formatDate(item.dueAt)}`}
                </Text>
              </View>
              <Text variant="bodyMedium" tabular tone={paid ? 'muted' : 'default'}>
                {formatNad(item.amount)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};
