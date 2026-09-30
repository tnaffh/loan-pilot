import { Alert, Pressable } from 'react-native';
import { Stack, useGlobalSearchParams, useNavigation } from 'expo-router';
import { X } from 'lucide-react-native';
import { ApplyProvider, type QuoteSeed } from '@/features/apply/apply-context';
import { useColors } from '@/lib/theme';

/**
 * The application flow: one form shared by the step screens (so each step is
 * its own screen with native back-swipe), seeded from the calculator's quote.
 */
const ApplyLayout = () => {
  const colors = useColors();
  const navigation = useNavigation();
  const seed = useGlobalSearchParams<Required<QuoteSeed>>();

  const leave = () =>
    Alert.alert(
      'Leave your application?',
      'Your answers are saved on this phone, so you can finish later.',
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => navigation.getParent()?.goBack() },
      ],
    );

  return (
    <ApplyProvider seed={seed}>
      <Stack
        screenOptions={{
          title: 'Apply',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerTitleStyle: { fontFamily: 'IBMPlexSans_600SemiBold', fontSize: 16 },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Leave application"
              hitSlop={12}
              onPress={leave}
            >
              <X size={22} color={colors.foreground} />
            </Pressable>
          ),
        }}
      >
        <Stack.Screen name="result" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </ApplyProvider>
  );
};

export default ApplyLayout;
