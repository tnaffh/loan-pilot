import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'destructive';

const TONES: Record<BadgeTone, { box: string; label: string }> = {
  neutral: { box: 'bg-muted', label: 'text-muted-foreground' },
  brand: { box: 'bg-secondary', label: 'text-secondary-foreground' },
  success: { box: 'bg-success-soft', label: 'text-success' },
  warning: { box: 'bg-warning-soft', label: 'text-warning' },
  destructive: { box: 'bg-destructive-soft', label: 'text-destructive' },
};

export const Badge = ({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) => (
  <View className={cn('self-start rounded-full px-2.5 py-[3px]', TONES[tone].box)}>
    <Text variant="caption" className={cn('font-sans-semibold', TONES[tone].label)}>
      {label}
    </Text>
  </View>
);
