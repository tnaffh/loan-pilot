import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { cn } from '@/lib/cn';
import { useColors, type ThemeColors } from '@/lib/theme';
import { Text } from './text';

type Variant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'highlight'
  | 'inverse';
type Size = 'lg' | 'md' | 'sm';

const SURFACE: Record<Variant, string> = {
  primary: 'bg-primary border-primary',
  secondary: 'bg-secondary border-secondary',
  outline: 'bg-transparent border-border',
  ghost: 'bg-transparent border-transparent',
  destructive: 'bg-destructive border-destructive',
  highlight: 'bg-highlight border-highlight',
  inverse: 'bg-white/10 border-white/20',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-primary-foreground',
  secondary: 'text-secondary-foreground',
  outline: 'text-foreground',
  ghost: 'text-foreground',
  destructive: 'text-destructive-foreground',
  highlight: 'text-highlight-foreground',
  inverse: 'text-brand-foreground',
};

const SIZE: Record<Size, { box: string; label: string; icon: number }> = {
  lg: { box: 'h-[54px] px-5', label: 'text-base', icon: 19 },
  md: { box: 'h-[46px] px-5', label: 'text-[15px]', icon: 18 },
  sm: { box: 'h-9 px-3.5', label: 'text-[13px]', icon: 16 },
};

const iconColor = (variant: Variant, colors: ThemeColors): string =>
  ({
    primary: colors.primaryForeground,
    secondary: colors.secondaryForeground,
    outline: colors.foreground,
    ghost: colors.foreground,
    destructive: colors.primaryForeground,
    highlight: '#16191c',
    inverse: colors.brandForeground,
  })[variant];

export interface ButtonProps {
  children: ReactNode;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  accessibilityLabel?: string;
}

/** The web button (12px radius, semibold label), with a spring press and a light haptic. */
export const Button = ({
  children,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon: Icon,
  iconRight: IconRight,
  loading,
  disabled,
  className,
  accessibilityLabel,
}: ButtonProps) => {
  const colors = useColors();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = Boolean(disabled || loading);
  const fg = iconColor(variant, colors);

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
        disabled={inactive}
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 20, stiffness: 400 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 20, stiffness: 400 });
        }}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.();
        }}
        className={cn(
          'items-center justify-center rounded-lg border',
          SURFACE[variant],
          SIZE[size].box,
          disabled && 'opacity-50',
          className,
        )}
      >
        <View className="flex-row items-center gap-2">
          {loading ? (
            <ActivityIndicator size="small" color={fg} />
          ) : Icon ? (
            <Icon size={SIZE[size].icon} color={fg} strokeWidth={2} />
          ) : null}
          {typeof children === 'string' ? (
            <Text className={cn('font-sans-semibold', SIZE[size].label, LABEL[variant])}>
              {children}
            </Text>
          ) : (
            children
          )}
          {IconRight && !loading ? (
            <IconRight size={SIZE[size].icon} color={fg} strokeWidth={2} />
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
};
