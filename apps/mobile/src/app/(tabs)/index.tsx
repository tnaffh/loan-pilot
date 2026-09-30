import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CalendarDays, FileText, MessageCircle, Plus, type LucideIcon } from 'lucide-react-native';
import { ApplicationStatus, formatNad } from '@loan-pilot/domain';
import { Badge, Button, Card, Em, Screen, Skeleton, Text } from '@/components/ui';
import { BalanceCard } from '@/features/loans/balance-card';
import { APPLICATION_STATUS, isOpenLoan } from '@/features/loans/status';
import { COMPANY, LOAN_TYPE_LABEL } from '@/lib/brand';
import { useAuth } from '@/lib/auth';
import { firstName, formatDate } from '@/lib/format';
import { useLoans, useMyApplications } from '@/lib/queries';
import { useColors } from '@/lib/theme';

const greeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const QuickAction = ({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) => {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-1 items-center gap-2 rounded-xl border border-border bg-card py-4 active:border-ring"
    >
      <View className="size-10 items-center justify-center rounded-lg bg-secondary">
        <Icon size={20} color={colors.secondaryForeground} />
      </View>
      <Text variant="smallMedium">{label}</Text>
    </Pressable>
  );
};

const HomeScreen = () => {
  const router = useRouter();
  const { user } = useAuth();
  const colors = useColors();
  const loans = useLoans();
  const applications = useMyApplications();

  const openLoan = loans.data?.find((loan) => isOpenLoan(loan.status)) ?? null;
  const latestApplication = applications.data?.[0] ?? null;
  const showApplication =
    latestApplication &&
    (latestApplication.status === ApplicationStatus.Pending ||
      latestApplication.status === ApplicationStatus.Review ||
      !openLoan);
  const loading = loans.isLoading || applications.isLoading;

  return (
    <Screen
      topInset
      bottomInset={false}
      refreshing={loans.isRefetching || applications.isRefetching}
      onRefresh={() => {
        void loans.refetch();
        void applications.refetch();
      }}
    >
      <Animated.View entering={FadeInDown.duration(400)}>
        <Text variant="small" tone="muted">
          {greeting()},
        </Text>
        <Text variant="h1">{firstName(user?.name) || 'there'}</Text>
      </Animated.View>

      {loading ? (
        <View className="gap-4">
          <Skeleton className="h-[196px] rounded-2xl" />
          <Skeleton className="h-24" />
        </View>
      ) : (
        <>
          {openLoan ? (
            <Animated.View entering={FadeInDown.delay(80).duration(500)}>
              <View className="gap-3.5">
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/loan/[id]', params: { id: openLoan.id } })
                  }
                >
                  <BalanceCard loan={openLoan} />
                </Pressable>
                <View className="flex-row gap-2.5">
                  <QuickAction
                    icon={CalendarDays}
                    label="Schedule"
                    onPress={() =>
                      router.push({ pathname: '/loan/[id]', params: { id: openLoan.id } })
                    }
                  />
                  <QuickAction
                    icon={FileText}
                    label="Statement"
                    onPress={() =>
                      router.push({ pathname: '/loan/[id]/statement', params: { id: openLoan.id } })
                    }
                  />
                  <QuickAction
                    icon={Plus}
                    label="New loan"
                    onPress={() => router.push('/(tabs)/apply')}
                  />
                </View>
              </View>
            </Animated.View>
          ) : null}

          {showApplication && latestApplication ? (
            <Animated.View entering={FadeInDown.delay(140).duration(500)}>
              <Card className="gap-3">
                <View className="flex-row items-center justify-between">
                  <Text variant="eyebrow" tone="primary">
                    Your application
                  </Text>
                  <Badge
                    label={APPLICATION_STATUS[latestApplication.status].label}
                    tone={APPLICATION_STATUS[latestApplication.status].tone}
                  />
                </View>
                <View className="gap-0.5">
                  <Text variant="h2" tabular>
                    {formatNad(latestApplication.amount)}
                  </Text>
                  <Text variant="small" tone="muted">
                    {LOAN_TYPE_LABEL[latestApplication.type]} · {latestApplication.termMonths} month
                    {latestApplication.termMonths > 1 ? 's' : ''} · sent{' '}
                    {formatDate(latestApplication.submittedAt)}
                  </Text>
                </View>
                <Text variant="small">
                  {latestApplication.status === ApplicationStatus.Declined &&
                  latestApplication.declineReason
                    ? latestApplication.declineReason
                    : APPLICATION_STATUS[latestApplication.status].blurb}
                </Text>
              </Card>
            </Animated.View>
          ) : null}

          {!openLoan && !latestApplication ? (
            <Animated.View entering={FadeInDown.delay(80).duration(500)}>
              <Card className="items-start gap-3.5">
                <Text variant="h2">
                  No open loans — <Em>all clear</Em>
                </Text>
                <Text tone="muted">
                  When you need a hand before payday, see your exact repayment first and apply in
                  minutes.
                </Text>
                <Button size="md" onPress={() => router.push('/(tabs)/apply')}>
                  Get a quote
                </Button>
              </Card>
            </Animated.View>
          ) : null}
        </>
      )}

      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(COMPANY.phones[0].whatsapp)}
        className="flex-row items-center gap-3.5 rounded-xl bg-secondary p-4 active:opacity-80"
      >
        <MessageCircle size={22} color={colors.secondaryForeground} />
        <View className="flex-1">
          <Text variant="bodyMedium" className="text-secondary-foreground">
            Questions about your loan?
          </Text>
          <Text variant="small" tone="muted">
            WhatsApp us on {COMPANY.phones[0].display}
          </Text>
        </View>
      </Pressable>
    </Screen>
  );
};

export default HomeScreen;
