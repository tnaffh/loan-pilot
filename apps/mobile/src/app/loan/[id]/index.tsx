import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CreditCard, FileText } from 'lucide-react-native';
import { formatNad } from '@loan-pilot/domain';
import { Badge, Button, Card, Screen, Skeleton, Text } from '@/components/ui';
import { BalanceCard } from '@/features/loans/balance-card';
import { ScheduleTimeline } from '@/features/loans/schedule-timeline';
import { LOAN_STATUS, isOpenLoan } from '@/features/loans/status';
import { LOAN_TYPE_LABEL } from '@/lib/brand';
import { formatDate } from '@/lib/format';
import { useLoan } from '@/lib/queries';
import { useColors } from '@/lib/theme';

const Row = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row justify-between py-1">
    <Text variant="small" tone="muted">
      {label}
    </Text>
    <Text variant="smallMedium" tabular>
      {value}
    </Text>
  </View>
);

const LoanScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const { data: loan, isLoading, refetch, isRefetching } = useLoan(id);

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      <Stack.Screen options={{ title: loan ? LOAN_TYPE_LABEL[loan.type] : 'Loan' }} />
      {isLoading || !loan ? (
        <View className="gap-4">
          <Skeleton className="h-[196px] rounded-2xl" />
          <Skeleton className="h-64 rounded-xl" />
        </View>
      ) : (
        <>
          {isOpenLoan(loan.status) ? (
            <BalanceCard loan={loan} />
          ) : (
            <Card className="gap-2">
              <Badge label={LOAN_STATUS[loan.status].label} tone={LOAN_STATUS[loan.status].tone} />
              <Text variant="h2" tabular>
                {formatNad(loan.total)}
              </Text>
              <Text variant="small" tone="muted">
                {LOAN_TYPE_LABEL[loan.type]} · closed {formatDate(loan.closedAt)}
              </Text>
            </Card>
          )}

          <View className="gap-3">
            <Text variant="h3">Repayment schedule</Text>
            <Card>
              <ScheduleTimeline schedule={loan.schedule} />
            </Card>
          </View>

          {isOpenLoan(loan.status) ? (
            <View className="flex-row items-start gap-3 rounded-xl bg-secondary p-4">
              <CreditCard size={20} color={colors.secondaryForeground} />
              <Text variant="small" className="flex-1 text-secondary-foreground">
                Instalments are collected by debit order on your pay day. To pay early or settle,
                contact us and we&apos;ll give you a settlement figure.
              </Text>
            </View>
          ) : null}

          <View className="gap-3">
            <Text variant="h3">Loan details</Text>
            <Card className="gap-0.5">
              <Row label="Amount borrowed" value={formatNad(loan.principal)} />
              <Row label="Finance charge" value={formatNad(loan.financeCharge)} />
              <Row label="Total to repay" value={formatNad(loan.total)} />
              <Row
                label="Instalment"
                value={`${formatNad(loan.instalment)} × ${loan.instalmentsTotal}`}
              />
              <Row label="Paid out" value={formatDate(loan.disbursedAt)} />
              <Row label="Reference" value={loan.id.slice(0, 10).toUpperCase()} />
            </Card>
          </View>

          <Button
            variant="secondary"
            icon={FileText}
            onPress={() =>
              router.push({ pathname: '/loan/[id]/statement', params: { id: loan.id } })
            }
          >
            View statement
          </Button>
        </>
      )}
    </Screen>
  );
};

export default LoanScreen;
