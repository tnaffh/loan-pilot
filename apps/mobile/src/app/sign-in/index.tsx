import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MessageSquareText } from 'lucide-react-native';
import { otpRequestSchema } from '@loan-pilot/domain';
import { Button, Em, Screen, Text, TextField } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/lib/theme';

/** Borrower sign-in, step 1: the phone number the lender has on file. */
const PhoneScreen = () => {
  const router = useRouter();
  const colors = useColors();
  const { requestCode } = useAuth();
  const params = useLocalSearchParams<{ phone?: string }>();
  const [phone, setPhone] = useState(params.phone ?? '');
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const parsed = otpRequestSchema.safeParse({ phone });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setSending(true);
    try {
      await requestCode(parsed.data.phone);
      router.push({ pathname: '/sign-in/code', params: { phone: parsed.data.phone } });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not send a code. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen
      footer={
        <Button onPress={submit} loading={sending} disabled={phone.trim().length < 6}>
          Send my code
        </Button>
      }
    >
      <View className="size-13 items-center justify-center rounded-2xl bg-secondary">
        <MessageSquareText size={24} color={colors.secondaryForeground} />
      </View>
      <View className="gap-2">
        <Text variant="h1">
          Sign in with <Em>your phone</Em>
        </Text>
        <Text tone="muted">
          Use the number you gave us when you applied. We&apos;ll text you a 6-digit code — no
          password needed.
        </Text>
      </View>
      <TextField
        label="Mobile number"
        placeholder="081 234 5678"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        autoFocus
        value={phone}
        onChangeText={(text) => {
          setPhone(text);
          setError(undefined);
        }}
        error={error}
      />
    </Screen>
  );
};

export default PhoneScreen;
