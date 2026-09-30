import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import {
  FileText,
  Globe,
  LogOut,
  Mail,
  MessageCircle,
  Monitor,
  Moon,
  Phone,
  Sun,
} from 'lucide-react-native';
import { Button, Card, ListRow, Screen, Sheet, Text } from '@/components/ui';
import { TermsText } from '@/features/apply/terms-text';
import { COMPANY } from '@/lib/brand';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { formatPhone } from '@/lib/format';
import { useColors, useThemeMode, type ThemeMode } from '@/lib/theme';

const MODES: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'system', label: 'System', icon: Monitor },
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
];

const initials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const ProfileScreen = () => {
  const { user, signOut } = useAuth();
  const colors = useColors();
  const { mode, setMode } = useThemeMode();
  const [termsOpen, setTermsOpen] = useState(false);
  const phone = COMPANY.phones[0];

  return (
    <Screen topInset bottomInset={false}>
      <View className="flex-row items-center gap-4">
        <View className="size-[60px] items-center justify-center rounded-full bg-brand">
          <Text variant="h2" tone="inverse">
            {initials(user?.name ?? '')}
          </Text>
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant="h2">{user?.name}</Text>
          <Text variant="small" tone="muted">
            {user?.phone ? formatPhone(user.phone) : user?.email}
          </Text>
        </View>
      </View>

      <View className="gap-2.5">
        <Text variant="eyebrow" tone="muted">
          Appearance
        </Text>
        <View className="flex-row gap-1 rounded-lg bg-muted p-1" accessibilityRole="radiogroup">
          {MODES.map(({ mode: option, label, icon: Icon }) => {
            const on = option === mode;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMode(option);
                }}
                className={cn(
                  'flex-1 flex-row items-center justify-center gap-1.5 rounded-md py-2.5',
                  on && 'bg-card shadow-sm dark:bg-white/10',
                )}
              >
                <Icon size={15} color={on ? colors.foreground : colors.mutedForeground} />
                <Text variant="smallMedium" tone={on ? 'default' : 'muted'}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-2.5">
        <Text variant="eyebrow" tone="muted">
          Talk to us
        </Text>
        <Card flat>
          <ListRow
            icon={MessageCircle}
            title="WhatsApp"
            subtitle={phone.display}
            onPress={() => void Linking.openURL(phone.whatsapp)}
          />
          <ListRow
            icon={Phone}
            title="Call"
            subtitle={phone.display}
            divider
            onPress={() => void Linking.openURL(phone.tel)}
          />
          <ListRow
            icon={Mail}
            title="Email"
            subtitle={COMPANY.email}
            divider
            onPress={() => void Linking.openURL(`mailto:${COMPANY.email}`)}
          />
          <ListRow
            icon={Globe}
            title="Website"
            subtitle="raccoonsfinance.com"
            divider
            onPress={() => void WebBrowser.openBrowserAsync(COMPANY.website)}
          />
        </Card>
      </View>

      <Card flat>
        <ListRow icon={FileText} title="Terms & Conditions" onPress={() => setTermsOpen(true)} />
      </Card>

      <Button variant="outline" icon={LogOut} onPress={() => void signOut()}>
        Sign out
      </Button>

      <Text variant="caption" tone="muted" className="text-center">
        {COMPANY.name} · {COMPANY.licence}
        {'\n'}Version {Constants.expoConfig?.version}
      </Text>

      <Sheet open={termsOpen} onClose={() => setTermsOpen(false)} title="Terms & Conditions">
        <View className="px-5 pb-4">
          <TermsText />
        </View>
      </Sheet>
    </Screen>
  );
};

export default ProfileScreen;
