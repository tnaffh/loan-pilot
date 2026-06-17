import { cn } from '@/lib/utils';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterSegmentsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: FilterOption<T>[];
}

/** Joined segmented buttons for filtering a table; active segment uses the brand. */
export const FilterSegments = <T extends string>({
  value,
  onChange,
  options,
}: FilterSegmentsProps<T>) => (
  <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        className={cn(
          'rounded-md px-3 py-1 text-sm font-medium transition-colors',
          option.value === value
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);
