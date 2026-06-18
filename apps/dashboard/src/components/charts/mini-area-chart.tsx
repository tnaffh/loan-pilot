'use client';

import { Area, AreaChart } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';

interface MiniAreaChartProps {
  data: { label: string; value: number }[];
  /** A chart token like "var(--chart-1)". Defaults to chart-1. */
  color?: string;
  className?: string;
}

/** A compact sparkline-style area chart for page-header summaries. */
export const MiniAreaChart = ({ data, color = 'var(--chart-1)', className }: MiniAreaChartProps) => {
  const config = { value: { label: 'Value', color } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className={className ?? 'aspect-auto h-14 w-full'}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="fill-mini" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.5} />
            <stop offset="95%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area
          dataKey="value"
          type="monotone"
          stroke={color}
          fill="url(#fill-mini)"
          strokeWidth={2}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  );
};
