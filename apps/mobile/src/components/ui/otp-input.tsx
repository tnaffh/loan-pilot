import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

const LENGTH = 6;

/**
 * Six code boxes backed by one invisible TextInput — so the OS can autofill
 * the code from the SMS (`oneTimeCode` on iOS, `sms-otp` on Android).
 */
export const OtpInput = ({
  value,
  onChange,
  onComplete,
  invalid,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) => {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Sign-in code">
      <View className="flex-row justify-between gap-2">
        {Array.from({ length: LENGTH }, (_unused, index) => {
          const active = focused && index === Math.min(value.length, LENGTH - 1);
          return (
            <View
              key={index}
              className={cn(
                'aspect-[0.82] max-w-14 flex-1 items-center justify-center rounded-lg border border-input bg-card',
                active && 'border-2 border-ring',
                invalid && 'border-destructive',
              )}
            >
              <Text className="font-mono-medium text-2xl leading-8">{value[index] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      {/* The real input sits over the boxes, invisible, so paste and SMS autofill work. */}
      <TextInput
        ref={input}
        value={value}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, LENGTH);
          onChange(digits);
          if (digits.length === LENGTH) onComplete?.(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={LENGTH}
        caretHidden
        className="absolute size-full opacity-[0.02]"
      />
    </Pressable>
  );
};
