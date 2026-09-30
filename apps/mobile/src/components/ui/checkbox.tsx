import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';
import { Text } from './text';

/** A tappable consent / option row. `bare` drops the card framing. */
export const Checkbox = ({
  checked,
  onChange,
  children,
  error,
  bare,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  error?: string;
  bare?: boolean;
}) => {
  const colors = useColors();
  return (
    <View className="gap-1.5">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => {
          void Haptics.selectionAsync();
          onChange(!checked);
        }}
        className={cn(
          'flex-row items-start gap-3',
          !bare && 'rounded-xl border border-border bg-card p-3.5',
          error && 'border-destructive',
        )}
      >
        <View
          className={cn(
            'mt-px size-[22px] items-center justify-center rounded-md border-[1.5px] border-input',
            checked && 'border-primary bg-primary',
          )}
        >
          {checked ? <Check size={15} color={colors.primaryForeground} strokeWidth={3} /> : null}
        </View>
        <View className="flex-1">
          {typeof children === 'string' ? (
            <Text variant="small" tone="muted">
              {children}
            </Text>
          ) : (
            children
          )}
        </View>
      </Pressable>
      {error ? (
        <Text variant="caption" tone="destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
};
