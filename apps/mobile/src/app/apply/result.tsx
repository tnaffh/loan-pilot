import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { CheckCircle2, Clock3, XCircle } from 'lucide-react-native';
import {
  AFFORDABILITY_OUTCOME_COPY,
  AffordabilityResult,
  formatNad,
  toCents,
} from '@loan-pilot/domain';
import { Button, Card, Em, Text } from '@/components/ui';
import { useApply } from '@/features/apply/apply-context';
import { APPLICATION_STATUS } from '@/features/loans/status';
import { useAuth } from '@/lib/auth';
import { shortRef } from '@/lib/format';
import { useColors } from '@/lib/theme';

const Cell = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <View className="w-1/2 gap-0.5 py-2">
    <Text variant="caption" tone="muted">
      {label}
    </Text>
    <Text variant={mono ? 'mono' : 'smallMedium'} tabular>
      {value}
    </Text>
  </View>
);

/** After submitting: the affordability outcome, then a path to track the application. */
const ApplyResult = () => {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { outcome } = useApply();
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';

  if (!outcome) return null;

  const Icon =
    outcome.affordability === AffordabilityResult.Pass
      ? CheckCircle2
      : outcome.affordability === AffordabilityResult.Fail
        ? XCircle
        : Clock3;
  const tone =
    outcome.affordability === AffordabilityResult.Pass
      ? colors.success
      : outcome.affordability === AffordabilityResult.Fail
        ? colors.destructive
        : colors.warning;

  return (
    <View
      className="flex-1 justify-between bg-background px-5"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 16 }}
    >
      <View className="gap-6">
        <Animated.View entering={ZoomIn.springify().damping(14)}>
          <View className="items-center">
            <View className="size-24 items-center justify-center rounded-full bg-card">
              <Icon size={56} color={tone} strokeWidth={1.75} />
            </View>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(150).duration(500)}>
          <View className="items-center gap-2">
            <Text variant="h1" className="text-center">
              Application <Em>received</Em>
            </Text>
            <Text tone="muted" className="text-center">
              {AFFORDABILITY_OUTCOME_COPY[outcome.affordability]}
            </Text>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <Card className="flex-row flex-wrap">
            <Cell label="Reference" value={shortRef(outcome.id)} mono />
            <Cell label="Status" value={APPLICATION_STATUS[outcome.status].label} />
            <Cell label="Estimated total" value={formatNad(toCents(outcome.quotedTotal))} />
            <Cell label="Per month" value={formatNad(toCents(outcome.quotedInstalment))} />
          </Card>
        </Animated.View>
        {outcome.failedUploads > 0 ? (
          <Text variant="small" tone="warning" className="text-center">
            {outcome.failedUploads} document{outcome.failedUploads > 1 ? 's' : ''} didn&apos;t
            upload. Our team will follow up with you.
          </Text>
        ) : null}
      </View>

      <Animated.View entering={FadeInDown.delay(450).duration(500)}>
        <View className="gap-3">
          {signedIn ? (
            <Button onPress={() => router.replace('/(tabs)')}>Back to home</Button>
          ) : (
            <>
              <Button
                onPress={() =>
                  router.replace({ pathname: '/sign-in', params: { phone: outcome.phone } })
                }
              >
                Track my application
              </Button>
              <Button variant="ghost" onPress={() => router.replace('/')}>
                Done
              </Button>
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );
};

export default ApplyResult;
