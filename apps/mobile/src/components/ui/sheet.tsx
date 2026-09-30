import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './text';

/** Bottom sheet on a native Modal: tap the scrim (or Android back) to close. */
export const Sheet = ({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        className="flex-1 justify-end bg-overlay"
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <Pressable
          className="max-h-[80%] rounded-t-2xl bg-card pt-2.5"
          style={{ paddingBottom: insets.bottom + 12 }}
          onPress={() => undefined}
        >
          <View className="mb-3 h-[5px] w-10 self-center rounded-full bg-border" />
          {title ? (
            <View className="px-5 pb-2">
              <Text variant="h3">{title}</Text>
            </View>
          ) : null}
          <ScrollView bounces={false}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
