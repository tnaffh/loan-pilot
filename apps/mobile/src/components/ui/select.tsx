import { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, ChevronDown } from 'lucide-react-native';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';
import { Field, type FieldProps } from './field';
import { Sheet } from './sheet';
import { Text } from './text';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

export interface SelectFieldProps<T extends string | number> extends Omit<FieldProps, 'children'> {
  value: T | undefined | null;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** A form select that opens a bottom sheet of options (native pickers look out of place). */
export const SelectField = <T extends string | number>({
  label,
  description,
  error,
  optional,
  value,
  options,
  onChange,
  placeholder = 'Select',
  disabled,
}: SelectFieldProps<T>) => {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Field label={label} description={description} error={error} optional={optional}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={cn(
          'min-h-[50px] flex-row items-center justify-between rounded-lg border border-input bg-card px-3.5',
          error && 'border-destructive',
          disabled && 'opacity-55',
        )}
      >
        <Text className={cn('text-base', selected ? 'text-foreground' : 'text-muted-foreground')}>
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color={colors.mutedForeground} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <View>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Pressable
                key={String(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className="flex-row items-center justify-between border-t border-border px-5 py-[15px] active:bg-muted"
                onPress={() => {
                  void Haptics.selectionAsync();
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <Text
                  variant={active ? 'bodyMedium' : 'body'}
                  tone={active ? 'primary' : 'default'}
                >
                  {option.label}
                </Text>
                {active ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </Field>
  );
};
