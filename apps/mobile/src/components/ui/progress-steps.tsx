import { View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useColors } from '@/lib/theme';
import { Text } from './text';

const Segment = ({ reached }: { reached: boolean }) => {
  const colors = useColors();
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: withTiming(reached ? 1 : 0, { duration: 320 }) }],
  }));
  return (
    <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
      <Animated.View
        style={[
          {
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.primary,
            transformOrigin: 'left center',
          },
          fill,
        ]}
      />
    </View>
  );
};

/** The web form's segmented stepper: one bar per step, filled up to the current one. */
export const ProgressSteps = ({
  steps,
  current,
}: {
  steps: readonly string[];
  current: number;
}) => (
  <View className="gap-2" accessibilityLabel={`Step ${current + 1} of ${steps.length}`}>
    <View className="flex-row gap-1.5">
      {steps.map((label, index) => (
        <Segment key={label} reached={index <= current} />
      ))}
    </View>
    <View className="flex-row justify-between">
      <Text variant="caption" tone="muted">
        Step {current + 1} of {steps.length}
      </Text>
      <Text variant="caption" className="font-sans-medium">
        {steps[current]}
      </Text>
    </View>
  </View>
);
