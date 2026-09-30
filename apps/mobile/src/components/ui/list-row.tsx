import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';
import { Text } from './text';

/** A settings/contact style row inside a flat Card. */
export const ListRow = ({
  icon: Icon,
  title,
  subtitle,
  right,
  onPress,
  divider,
  chevron = Boolean(onPress),
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  divider?: boolean;
  chevron?: boolean;
}) => {
  const colors = useColors();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className={cn(
        'flex-row items-center gap-3.5 px-4 py-3.5 active:bg-muted',
        divider && 'border-t border-border',
      )}
    >
      {Icon ? (
        <View className="size-9 items-center justify-center rounded-md bg-secondary">
          <Icon size={18} color={colors.secondaryForeground} />
        </View>
      ) : null}
      <View className="flex-1 gap-px">
        <Text variant="bodyMedium">{title}</Text>
        {subtitle ? (
          <Text variant="small" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <ChevronRight size={18} color={colors.mutedForeground} /> : null}
    </Pressable>
  );
};
