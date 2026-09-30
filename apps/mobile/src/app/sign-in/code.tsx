import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { Button, Em, OtpInput, Screen, Text } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const RESEND_SECONDS = 60;

/** Borrower sign-in, step 2: the SMS code. Autofills from the message where the OS allows. */
const CodeScreen = () => {
  const { phone = '' } = useLocalSearchParams<{ phone: string }>();
  const { requestCode, verifyCode } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [verifying, setVerifying] = useState(false);
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const verify = async (value: string) => {
    setVerifying(true);
    setError(undefined);
    try {
      // Signing in flips the root stack's guards, which moves to the tabs.
      await verifyCode(phone, value);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(caught instanceof ApiError ? caught.message : 'Could not sign you in. Try again.');
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setWait(RESEND_SECONDS);
    setError(undefined);
    await requestCode(phone).catch(() => undefined);
  };

  return (
    <Screen
      footer={
        <Button onPress={() => verify(code)} loading={verifying} disabled={code.length !== 6}>
          Sign in
        </Button>
      }
    >
      <View className="gap-2">
        <Text variant="h1">
          Enter the <Em>6-digit code</Em>
        </Text>
        <Text tone="muted">
          We sent it by SMS to <Text variant="bodyMedium">{phone}</Text>. It expires in 5 minutes.
        </Text>
      </View>
      <OtpInput
        value={code}
        autoFocus
        invalid={Boolean(error)}
        onChange={(value) => {
          setCode(value);
          setError(undefined);
        }}
        onComplete={verify}
      />
      {error ? (
        <Text variant="small" tone="destructive" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View className="flex-row justify-center gap-1">
        <Text variant="small" tone="muted">
          Didn&apos;t get it?
        </Text>
        {wait > 0 ? (
          <Text variant="small" tone="muted" tabular>
            Resend in {wait}s
          </Text>
        ) : (
          <Pressable onPress={resend} accessibilityRole="button" hitSlop={8}>
            <Text variant="smallMedium" tone="primary">
              Send a new code
            </Text>
          </Pressable>
        )}
      </View>
      <Text variant="caption" tone="muted" className="text-center">
        No code after a few minutes? Your number may not be on file — call us and we&apos;ll update
        it.
      </Text>
    </Screen>
  );
};

export default CodeScreen;
