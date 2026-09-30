import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { View } from 'react-native';
import { cn } from '@/lib/cn';

/** A pulsing placeholder block while data loads. Size and radius come from `className`. */
export const Skeleton = ({ className }: { className?: string }) => {
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={pulse}>
      <View className={cn('w-full rounded-lg bg-muted', className)} />
    </Animated.View>
  );
};
