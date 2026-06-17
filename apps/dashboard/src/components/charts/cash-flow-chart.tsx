'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { fromCents, formatNad } from '@loan-pilot/domain';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { MonthlyPoint } from '@/lib/types';

const config = {
  collected: { label: 'Collected', color: 'var(--chart-1)' },
  disbursed: { label: 'Disbursed', color: 'var(--chart-2)' },
  expenses: { label: 'Expenses', color: 'var(--chart-5)' },
} satisfies ChartConfig;

/** Stacked area of disbursed / collected / expenses by month (values in cents). */
export const CashFlowChart = ({ data }: { data: MonthlyPoint[] }) => {
  const rows = data.map((point) => ({
    label: point.label,
    collected: fromCents(point.collected),
    disbursed: fromCents(point.disbursed),
    expenses: fromCents(point.expenses),
  }));

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <AreaChart data={rows} margin={{ left: 12, right: 12 }}>
        <defs>
          {(['collected', 'disbursed', 'expenses'] as const).map((key) => (
            <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.8} />
              <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.1} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis hide domain={[0, 'auto']} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground capitalize">{name}</span>
                  <span className="font-medium tabular-nums">
                    {formatNad(Math.round(Number(value) * 100))}
                  </span>
                </div>
              )}
            />
          }
        />
        {(['collected', 'disbursed', 'expenses'] as const).map((key) => (
          <Area
            key={key}
            dataKey={key}
            type="monotone"
            stroke={`var(--color-${key})`}
            fill={`url(#fill-${key})`}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
};
