import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColors } from '@/lib/theme';

/**
 * Native tab bar (UITabBar / Material bottom navigation, so it picks up the
 * platform look — liquid glass on iOS 26). Icons are SF Symbols on iOS and
 * Material Symbols on Android.
 */
const TabsLayout = () => {
  const colors = useColors();

  return (
    <NativeTabs
      tintColor={colors.primary}
      iconColor={{ default: colors.mutedForeground, selected: colors.primary }}
      labelStyle={{
        default: { color: colors.mutedForeground, fontFamily: 'IBMPlexSans_500Medium' },
        selected: { color: colors.primary, fontFamily: 'IBMPlexSans_500Medium' },
      }}
      indicatorColor={colors.secondary}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="loans">
        <NativeTabs.Trigger.Label>My loans</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'banknote', selected: 'banknote.fill' }}
          md="payments"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="apply">
        <NativeTabs.Trigger.Label>Apply</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="plus.circle" md="add_circle" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
};

export default TabsLayout;
