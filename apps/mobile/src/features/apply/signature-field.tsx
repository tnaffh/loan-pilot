import { useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignatureCanvas, { type SignatureViewRef } from 'react-native-signature-canvas';
import { PenLine } from 'lucide-react-native';
import { Image } from '@/components/styled';
import { Button, Text } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Hide the library's own footer; we draw our own buttons. */
const CANVAS_CSS = `
  .m-signature-pad { box-shadow: none; border: none; margin: 0; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; margin: 0; }
  body, html { background: #ffffff; height: 100%; }
`;

/**
 * Tap to sign: a full-screen pad (so drawing never fights the form's scroll)
 * that returns a transparent PNG data-URL — the shape the shared
 * `signatureImageSchema` requires and the agreement PDF embeds.
 */
export const SignatureField = ({
  label,
  hint,
  variant = 'signature',
  value,
  onChange,
  error,
}: {
  label: string;
  hint?: string;
  variant?: 'signature' | 'initials';
  value: string;
  onChange: (dataUrl: string) => void;
  error?: string;
}) => {
  const insets = useSafeAreaInsets();
  const pad = useRef<SignatureViewRef>(null);
  const [open, setOpen] = useState(false);
  const [empty, setEmpty] = useState(true);
  const signed = value.startsWith('data:image/png');

  return (
    <View className="gap-1.5">
      <Text variant="smallMedium">{label}</Text>
      {hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={signed ? `Redo ${label}` : `Add ${label}`}
        onPress={() => {
          setEmpty(true);
          setOpen(true);
        }}
        className={cn(
          'items-center justify-center rounded-xl border bg-white',
          variant === 'initials' ? 'h-24 w-40' : 'h-32',
          signed ? 'border-border' : 'border-dashed border-input',
          error && 'border-destructive',
        )}
      >
        {signed ? (
          <View className="size-full p-3">
            <Image source={{ uri: value }} className="size-full" contentFit="contain" />
          </View>
        ) : (
          <View className="items-center gap-1.5">
            <PenLine size={20} color="#6b7178" />
            <Text variant="small" className="text-[#6b7178]">
              Tap to {variant === 'initials' ? 'initial' : 'sign'}
            </Text>
          </View>
        )}
      </Pressable>
      {error ? (
        <Text variant="caption" tone="destructive">
          {error}
        </Text>
      ) : null}

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <View
          className="flex-1 bg-background"
          style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}
        >
          <View className="flex-row items-center justify-between px-5 pb-3">
            <Button variant="ghost" size="sm" onPress={() => setOpen(false)}>
              Cancel
            </Button>
            <Text variant="title">
              {variant === 'initials' ? 'Your initials' : 'Your signature'}
            </Text>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                pad.current?.clearSignature();
                setEmpty(true);
              }}
            >
              Clear
            </Button>
          </View>
          <View className="flex-1 justify-center">
            <View
              className={cn(
                'mx-5 overflow-hidden rounded-2xl border border-border bg-white',
                variant === 'initials' ? 'h-60' : 'h-72',
              )}
            >
              <SignatureCanvas
                ref={pad}
                webStyle={CANVAS_CSS}
                penColor="#16191c"
                backgroundColor="rgba(255,255,255,0)"
                imageType="image/png"
                trimWhitespace
                minWidth={1.2}
                maxWidth={3}
                onBegin={() => setEmpty(false)}
                onOK={(dataUrl: string) => {
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  onChange(dataUrl);
                  setOpen(false);
                }}
                onEmpty={() => setEmpty(true)}
              />
              <View
                pointerEvents="none"
                className="absolute inset-x-8 bottom-12 h-px bg-[#e3e0d9]"
              />
            </View>
          </View>
          <View className="gap-3 px-5 pt-4">
            <Text variant="caption" tone="muted" className="text-center">
              {variant === 'initials'
                ? 'Printed on every page of your agreement except the signature page.'
                : 'Sign with your finger inside the box, as you would on paper.'}
            </Text>
            <Button disabled={empty} onPress={() => pad.current?.readSignature()}>
              {variant === 'initials' ? 'Use these initials' : 'Use this signature'}
            </Button>
          </View>
        </View>
      </Modal>
    </View>
  );
};
