import { View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowRight, Clock3, ShieldCheck, Wallet } from 'lucide-react-native';
import { Image, LinearGradient } from '@/components/styled';
import { Button, Em, Text } from '@/components/ui';
import { COMPANY } from '@/lib/brand';
import { useColors } from '@/lib/theme';
import lockupWhite from '@/assets/lockup-white.png';

const PROMISES = [
  { icon: Clock3, text: 'Apply in about five minutes' },
  { icon: Wallet, text: 'Every cost shown before you sign' },
  { icon: ShieldCheck, text: 'You always keep at least 50% of your income' },
] as const;

/** First run / signed out: the brand hero, with apply and sign-in paths. */
const Welcome = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const focused = useIsFocused();

  return (
    <LinearGradient
      colors={[colors.brand, colors.brandDeep, '#121d45']}
      locations={[0, 0.6, 1]}
      className="flex-1 px-6"
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }}
    >
      {/* Light text on the navy hero only while it is showing. */}
      {focused ? <StatusBar style="light" /> : null}
      <Animated.View entering={FadeInDown.duration(500)}>
        <Image
          source={lockupWhite}
          className="h-[66px] w-44"
          contentFit="contain"
          accessibilityLabel={COMPANY.name}
        />
      </Animated.View>

      <View className="flex-1 justify-center gap-[18px]">
        <Animated.View entering={FadeInDown.delay(120).duration(600)}>
          <Text variant="eyebrow" tone="highlight">
            Registered with NAMFISA
          </Text>
          <Text variant="display" tone="inverse" className="mt-3 text-[44px] leading-[48px]">
            Money when you <Em tone="highlight">need it</Em>, on terms you can see.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(260).duration(600)}>
          <View className="mt-2 gap-3">
            {PROMISES.map(({ icon: Icon, text }) => (
              <View key={text} className="flex-row items-center gap-3">
                <View className="size-[30px] items-center justify-center rounded-full bg-highlight/15">
                  <Icon size={16} color={colors.highlight} />
                </View>
                <Text tone="inverse" className="opacity-90">
                  {text}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.delay(400).duration(600)}>
        <View className="gap-3">
          <Button variant="highlight" iconRight={ArrowRight} onPress={() => router.push('/quote')}>
            Apply for a loan
          </Button>
          <Button variant="inverse" onPress={() => router.push('/sign-in')}>
            I already have a loan — sign in
          </Button>
          <Text variant="caption" tone="inverse" className="mt-1 text-center opacity-60">
            {COMPANY.name} · {COMPANY.licence}
          </Text>
        </View>
      </Animated.View>
    </LinearGradient>
  );
};

export default Welcome;
