'use no memo';
// react-hook-form's formState/fieldState are getter proxies the React Compiler
// memoises as if they were plain values (stale errors); keep forms uncompiled.

import { useController, useFormContext, type FieldPath } from 'react-hook-form';
import type { CreateApplicationInput } from '@loan-pilot/domain';
import {
  Checkbox,
  SelectField,
  TextField,
  type InputProps,
  type SelectOption,
} from '@/components/ui';

type Name = FieldPath<CreateApplicationInput>;

interface FormTextProps extends Omit<InputProps, 'value' | 'onChangeText'> {
  name: Name;
  label: string;
  description?: string;
  optional?: boolean;
  /** Keep digits only and store a number (amounts, income). */
  numeric?: boolean;
}

/** A TextField bound to the application form, showing its zod error. */
export const FormText = ({ name, numeric, ...props }: FormTextProps) => {
  const { control } = useFormContext<CreateApplicationInput>();
  const { field, fieldState } = useController({ control, name });
  const value = field.value;
  const text =
    typeof value === 'number'
      ? value === 0
        ? ''
        : String(value)
      : typeof value === 'string'
        ? value
        : '';

  return (
    <TextField
      {...props}
      ref={field.ref}
      value={text}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
      keyboardType={numeric ? 'number-pad' : props.keyboardType}
      onChangeText={(next) => {
        if (numeric) {
          const digits = next.replace(/\D/g, '');
          field.onChange(digits === '' ? 0 : Number(digits));
        } else {
          field.onChange(next);
        }
      }}
    />
  );
};

/** A SelectField bound to the application form. */
export const FormSelect = <T extends string | number>({
  name,
  label,
  options,
  optional,
  description,
  placeholder,
  disabled,
}: {
  name: Name;
  label: string;
  options: readonly SelectOption<T>[];
  optional?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
}) => {
  const { control } = useFormContext<CreateApplicationInput>();
  const { field, fieldState } = useController({ control, name });
  const current = options.find((option) => option.value === field.value)?.value;
  return (
    <SelectField
      label={label}
      options={options}
      value={current}
      onChange={(next) => {
        field.onChange(next);
        field.onBlur();
      }}
      error={fieldState.error?.message}
      optional={optional}
      description={description}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
};

/** A consent-style checkbox bound to a boolean field. */
export const FormCheckbox = ({ name, children }: { name: Name; children: string }) => {
  const { control } = useFormContext<CreateApplicationInput>();
  const { field, fieldState } = useController({ control, name });
  return (
    <Checkbox
      checked={field.value === true}
      onChange={field.onChange}
      error={fieldState.error?.message}
    >
      {children}
    </Checkbox>
  );
};

/** Turn a list of strings into select options. */
export const optionsOf = <T extends string>(values: readonly T[]): SelectOption<T>[] =>
  values.map((value) => ({ value, label: value }));
