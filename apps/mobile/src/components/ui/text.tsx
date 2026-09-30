import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from '@/lib/cn';

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'body'
  | 'bodyMedium'
  | 'small'
  | 'smallMedium'
  | 'caption'
  | 'eyebrow'
  | 'mono';

export type TextTone =
  | 'default'
  | 'muted'
  | 'primary'
  | 'inverse'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'highlight';

/** Spectral headings tracked in slightly (the web's h1–h4 rule); IBM Plex Sans body. */
const VARIANTS: Record<TextVariant, string> = {
  display: 'font-heading text-[36px] leading-[40px] tracking-[-0.4px]',
  h1: 'font-heading text-[28px] leading-[34px] tracking-[-0.3px]',
  h2: 'font-heading text-[22px] leading-[28px] tracking-[-0.2px]',
  h3: 'font-heading text-lg leading-6',
  title: 'font-sans-semibold text-base leading-[22px]',
  body: 'font-sans text-[15px] leading-[22px]',
  bodyMedium: 'font-sans-medium text-[15px] leading-[22px]',
  small: 'font-sans text-[13px] leading-[19px]',
  smallMedium: 'font-sans-medium text-[13px] leading-[19px]',
  caption: 'font-sans text-xs leading-4',
  // The web's section eyebrow: uppercase, 0.16em tracking.
  eyebrow: 'font-sans-semibold text-[11px] leading-[14px] tracking-[1.76px] uppercase',
  mono: 'font-mono text-[13px] leading-[18px]',
};

const TONES: Record<TextTone, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  inverse: 'text-brand-foreground',
  destructive: 'text-destructive',
  success: 'text-success',
  warning: 'text-warning',
  highlight: 'text-highlight',
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Tabular figures, for money and counters that update in place. */
  tabular?: boolean;
}

export const Text = ({
  variant = 'body',
  tone = 'default',
  tabular,
  className,
  style,
  ...rest
}: TextProps) => (
  <RNText
    {...rest}
    className={cn(VARIANTS[variant], TONES[tone], className)}
    style={[tabular ? { fontVariant: ['tabular-nums'] } : null, style]}
  />
);

/**
 * The italic, primary-coloured emphasis inside headings — the web's
 * `Apply in <em>about five minutes</em>` treatment. Nest inside a heading Text.
 */
export const Em = ({ children, tone = 'primary' }: { children: string; tone?: TextTone }) => (
  <RNText className={cn('font-heading-italic', TONES[tone])}>{children}</RNText>
);
