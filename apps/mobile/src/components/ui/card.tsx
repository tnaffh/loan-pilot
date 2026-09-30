import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/cn';

/** The web Card: white (navy in dark) surface, hairline border, 16.8px radius. */
export const Card = ({
  children,
  className,
  flat,
}: {
  children: ReactNode;
  className?: string;
  /** No inner padding, for list rows that run edge to edge. */
  flat?: boolean;
}) => (
  <View
    className={cn(
      'rounded-xl border border-border bg-card',
      flat ? 'overflow-hidden' : 'p-[18px]',
      className,
    )}
  >
    {children}
  </View>
);
