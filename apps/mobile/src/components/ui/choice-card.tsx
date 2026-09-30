import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';

/** One option of a radio group rendered as a card (the web's loan-type chooser). */
export const ChoiceCard = ({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
}) => (
  <Pressable
    accessibilityRole="radio"
    accessibilityState={{ selected }}
    onPress={() => {
      void Haptics.selectionAsync();
      onPress();
    }}
    className={cn(
      'flex-row items-center gap-3.5 rounded-xl border border-border bg-card p-4',
      selected && 'border-[1.5px] border-ring bg-secondary',
    )}
  >
    <View className="flex-1 gap-0.5">{children}</View>
    <View
      className={cn(
        'size-5 items-center justify-center rounded-full border-[1.5px] border-input',
        selected && 'border-primary',
      )}
    >
      {selected ? <View className="size-2.5 rounded-full bg-primary" /> : null}
    </View>
  </Pressable>
);
