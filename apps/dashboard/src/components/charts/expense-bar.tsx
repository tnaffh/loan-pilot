'use client';

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { fromCents, formatNad } from '@loan-pilot/domain';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const config = {
  amount: { label: 'Amount', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** Horizontal bars of the top expense categories (values in cents). */
export const ExpenseBar = ({ data }: { data: { category: string; amount: number }[] }) => {
  const rows = data.map((row) => ({ category: row.category, amount: fromCents(row.amount) }));

  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
      <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 12, right: 12 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" dataKey="amount" hide domain={[0, 'dataMax']} />
        <YAxis
          type="category"
          dataKey="category"
          tickLine={false}
          axisLine={false}
          width={120}
          tickFormatter={(value: string) => (value.length > 16 ? `${value.slice(0, 15)}…` : value)}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="font-medium tabular-nums">
                  {formatNad(Math.round(Number(value) * 100))}
                </span>
              )}
            />
          }
        />
        <Bar dataKey="amount" fill="var(--color-amount)" radius={4} isAnimationActive={false}>
          <LabelList
            dataKey="amount"
            position="right"
            offset={8}
            className="fill-muted-foreground"
            fontSize={11}
            formatter={(value) => formatNad(Math.round(Number(value) * 100))}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
};
