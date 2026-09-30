import { forwardRef, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

export interface FieldProps {
  label?: string;
  description?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}

/** Label + control + help text + error, the mobile twin of the web's FormField. */
export const Field = ({ label, description, error, optional, children }: FieldProps) => (
  <View className="gap-1.5">
    {label ? (
      <View className="flex-row justify-between">
        <Text variant="smallMedium">{label}</Text>
        {optional ? (
          <Text variant="caption" tone="muted">
            Optional
          </Text>
        ) : null}
      </View>
    ) : null}
    {children}
    {error ? (
      <Text variant="caption" tone="destructive" accessibilityRole="alert">
        {error}
      </Text>
    ) : description ? (
      <Text variant="caption" tone="muted">
        {description}
      </Text>
    ) : null}
  </View>
);

export interface InputProps extends TextInputProps {
  invalid?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(({ invalid, className, ...rest }, ref) => (
  <TextInput
    ref={ref}
    placeholderTextColorClassName="accent-muted-foreground"
    selectionColorClassName="accent-ring"
    cursorColorClassName="accent-ring"
    {...rest}
    // Arbitrary text size (no line-height): a line-height on a single-line
    // iOS TextInput misplaces the text; single-line inputs get a fixed height.
    className={cn(
      'rounded-lg border border-input bg-card px-3.5 font-sans text-[16px] text-foreground focus:border-[1.5px] focus:border-ring',
      rest.multiline ? 'min-h-24 py-3' : 'h-[50px]',
      invalid && 'border-destructive',
      className,
    )}
    style={rest.multiline ? { textAlignVertical: 'top' } : undefined}
  />
));
Input.displayName = 'Input';

/** A text field bound to a label/error in one go — the common case in forms. */
export const TextField = forwardRef<TextInput, InputProps & Omit<FieldProps, 'children'>>(
  ({ label, description, error, optional, ...input }, ref) => (
    <Field label={label} description={description} error={error} optional={optional}>
      <Input ref={ref} invalid={Boolean(error)} accessibilityLabel={label} {...input} />
    </Field>
  ),
);
TextField.displayName = 'TextField';
