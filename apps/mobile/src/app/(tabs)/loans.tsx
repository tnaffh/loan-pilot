import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ApplicationStatus, formatNad } from '@loan-pilot/domain';
import { Badge, Button, Card, Screen, Skeleton, Text } from '@/components/ui';
import { APPLICATION_STATUS, LOAN_STATUS, isOpenLoan } from '@/features/loans/status';
import { LOAN_TYPE_LABEL } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useLoans, useMyApplications } from '@/lib/queries';
import type { LoanRow } from '@/lib/types';

const LoanCard = ({ loan, index }: { loan: LoanRow; index: number }) => {
  const router = useRouter();
  const status = LOAN_STATUS[loan.status];
  const open = isOpenLoan(loan.status);
  const repaid = loan.total > 0 ? (loan.total - loan.balance) / loan.total : 1;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(400)}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/loan/[id]', params: { id: loan.id } })}
        className="active:opacity-85"
      >
        <Card className="gap-3.5">
          <View className="flex-row items-center justify-between">
            <Text variant="title">{LOAN_TYPE_LABEL[loan.type]}</Text>
            <Badge label={status.label} tone={status.tone} />
          </View>
          <View className="flex-row items-end justify-between">
            <View className="gap-0.5">
              <Text variant="caption" tone="muted">
                {open ? 'Balance' : 'Total repaid'}
              </Text>
              <Text variant="h2" tabular>
                {formatNad(open ? loan.balance : loan.total - loan.balance)}
              </Text>
            </View>
            <Text variant="small" tone="muted">
              {open && loan.nextDueAt
                ? `Next due ${formatDate(loan.nextDueAt)}`
                : formatDate(loan.disbursedAt)}
            </Text>
          </View>
          <View className="h-1.5 overflow-hidden rounded-full bg-muted">
            <View
              className={cn('h-1.5', open ? 'bg-primary' : 'bg-success')}
              style={{ width: `${Math.min(100, Math.max(0, repaid * 100))}%` }}
            />
          </View>
        </Card>
      </Pressable>
    </Animated.View>
  );
};

const LoansScreen = () => {
  const router = useRouter();
  const loans = useLoans();
  const applications = useMyApplications();
  const inFlight = (applications.data ?? []).filter(
    (application) =>
      application.status === ApplicationStatus.Pending ||
      application.status === ApplicationStatus.Review,
  );

  return (
    <Screen
      topInset
      bottomInset={false}
      refreshing={loans.isRefetching}
      onRefresh={() => {
        void loans.refetch();
        void applications.refetch();
      }}
    >
      <Text variant="h1">My loans</Text>

      {inFlight.map((application) => (
        <Card key={application.id} className="gap-1.5 border-dashed">
          <View className="flex-row items-center justify-between">
            <Text variant="title">{formatNad(application.amount)} requested</Text>
            <Badge
              label={APPLICATION_STATUS[application.status].label}
              tone={APPLICATION_STATUS[application.status].tone}
            />
          </View>
          <Text variant="small" tone="muted">
            {APPLICATION_STATUS[application.status].blurb}
          </Text>
        </Card>
      ))}

      {loans.isLoading ? (
        <View className="gap-3.5">
          <Skeleton className="h-[150px] rounded-xl" />
          <Skeleton className="h-[150px] rounded-xl" />
        </View>
      ) : loans.data && loans.data.length > 0 ? (
        loans.data.map((loan, index) => <LoanCard key={loan.id} loan={loan} index={index} />)
      ) : (
        <Card className="items-start gap-3">
          <Text variant="h3">No loans yet</Text>
          <Text tone="muted">
            Once a loan is approved and paid out, it will appear here with its schedule.
          </Text>
          <Button size="md" variant="secondary" onPress={() => router.push('/(tabs)/apply')}>
            Get a quote
          </Button>
        </Card>
      )}
    </Screen>
  );
};

export default LoansScreen;
