'use client';

import { useMemo } from 'react';
import { Cell, Label, Pie, PieChart } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const LABELS: Record<string, string> = {
  active: 'Active',
  arrears: 'In arrears',
  partly_paid: 'Partly paid',
  settled: 'Settled',
  written_off: 'Written off',
  closed: 'Closed',
};
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

/** Donut of loan counts by status. */
export const StatusDonut = ({ data }: { data: { status: string; count: number }[] }) => {
  const rows = data.map((row, i) => ({
    name: LABELS[row.status] ?? row.status,
    value: row.count,
    fill: COLORS[i % COLORS.length],
  }));
  const total = useMemo(() => rows.reduce((sum, r) => sum + r.value, 0), [rows]);

  const config: ChartConfig = Object.fromEntries(
    rows.map((r) => [r.name, { label: r.name, color: r.fill }]),
  );

  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-[240px]">
      <PieChart>
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={60} strokeWidth={4} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell key={row.name} fill={row.fill} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold">
                      {total}
                    </tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">
                      loans
                    </tspan>
                  </text>
                );
              }
              return null;
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
};
