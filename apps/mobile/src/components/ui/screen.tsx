import type { ReactNode } from 'react';
import { RefreshControl, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '@/components/styled';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';

export interface ScreenProps {
  children: ReactNode;
  /** Sticky bar under the scroll area (form actions); rides above the keyboard. */
  footer?: ReactNode;
  /** Pad for the status bar — for screens without a navigation header. */
  topInset?: boolean;
  /** Pad for the home indicator — off inside the tab navigator, which already does. */
  bottomInset?: boolean;
  contentClassName?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}

/**
 * Page scaffold: themed background and a scroll view that keeps the focused
 * input above the keyboard; an optional footer sticks to the keyboard's top.
 */
export const Screen = ({
  children,
  footer,
  topInset,
  bottomInset = true,
  contentClassName,
  refreshing,
  onRefresh,
}: ScreenProps) => {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPad = bottomInset ? insets.bottom : 0;

  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        bottomOffset={footer ? 96 : 24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerClassName={cn('gap-5 px-5', contentClassName)}
        contentContainerStyle={{
          paddingTop: topInset ? insets.top + 12 : 16,
          paddingBottom: footer ? 24 : bottomPad + 32,
        }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              tintColor={colors.mutedForeground}
            />
          ) : undefined
        }
      >
        {children}
      </KeyboardAwareScrollView>
      {footer ? (
        <KeyboardStickyView offset={{ opened: bottomPad }}>
          <View
            className="border-t border-border bg-background px-5 pt-3"
            style={{ paddingBottom: bottomPad + 12 }}
          >
            {footer}
          </View>
        </KeyboardStickyView>
      ) : null}
    </View>
  );
};
