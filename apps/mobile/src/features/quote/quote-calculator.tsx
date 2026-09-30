import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { LoanType, formatNad, quoteWithPricing, toCents } from '@loan-pilot/domain';
import { Button, Card, Text } from '@/components/ui';
import { PRODUCTS } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { usePricing } from '@/lib/queries';
import { useColors } from '@/lib/theme';

/** Calculator slider ranges — what the calculator explores, not lending limits. */
const RANGE: Record<LoanType, { min: number; max: number; step: number }> = {
  [LoanType.Payday]: { min: 500, max: 15_000, step: 500 },
  [LoanType.Business]: { min: 1_000, max: 50_000, step: 1_000 },
  [LoanType.Collateral]: { min: 1_000, max: 50_000, step: 1_000 },
};

const TERMS = [1, 2, 3, 4, 5] as const;

/**
 * The website's calculator, mobile-sized: pick a product, slide the amount,
 * choose a term, and see the exact figures `quote()` produces with the lender's
 * live fees — then carry them into the application.
 */
export const QuoteCalculator = () => {
  const colors = useColors();
  const router = useRouter();
  const { data: pricing } = usePricing();
  const [type, setType] = useState<LoanType>(LoanType.Payday);
  const [amount, setAmount] = useState(5_000);
  const [term, setTerm] = useState(1);

  const range = RANGE[type];
  const isPayday = type === LoanType.Payday;
  const termMonths = isPayday ? 1 : term;
  const result = quoteWithPricing(pricing ?? null, { amount, termMonths, type });
  const fees = result.namfisaLevyCents + result.stampDutyCents + result.insuranceCents;

  const pickType = (next: LoanType) => {
    setType(next);
    const nextRange = RANGE[next];
    setAmount((current) => Math.min(Math.max(current, nextRange.min), nextRange.max));
  };

  return (
    <View className="gap-5">
      <View className="flex-row gap-1 rounded-lg bg-muted p-1" accessibilityRole="tablist">
        {PRODUCTS.map((product) => {
          const on = product.type === type;
          return (
            <Pressable
              key={product.type}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                void Haptics.selectionAsync();
                pickType(product.type);
              }}
              className={cn(
                'flex-1 items-center rounded-md py-[9px]',
                on && 'bg-card shadow-sm dark:bg-white/10',
              )}
            >
              <Text variant="smallMedium" tone={on ? 'default' : 'muted'}>
                {product.title}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card className="gap-[18px]">
        <View className="gap-1">
          <Text variant="smallMedium" tone="muted">
            I would like to borrow
          </Text>
          <Text variant="display" tabular>
            {formatNad(toCents(amount))}
          </Text>
          <Slider
            accessibilityLabel="Loan amount"
            minimumValue={range.min}
            maximumValue={range.max}
            step={range.step}
            value={amount}
            onValueChange={(value) => {
              if (value !== amount) void Haptics.selectionAsync();
              setAmount(value);
            }}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.muted}
            thumbTintColor={colors.primary}
            style={{ marginHorizontal: -4, height: 40 }}
          />
          <View className="flex-row justify-between">
            <Text variant="caption" tone="muted">
              {formatNad(toCents(range.min))}
            </Text>
            <Text variant="caption" tone="muted">
              {formatNad(toCents(range.max))}
            </Text>
          </View>
        </View>

        <View className="gap-2.5">
          <View className="flex-row items-baseline justify-between">
            <Text variant="smallMedium" tone="muted">
              Repay over
            </Text>
            {isPayday ? (
              <Text variant="caption" tone="muted">
                Payday loans are repaid in one month
              </Text>
            ) : null}
          </View>
          <View className="flex-row gap-2">
            {TERMS.map((months) => {
              const on = months === termMonths;
              const disabled = isPayday && months !== 1;
              return (
                <Pressable
                  key={months}
                  disabled={disabled}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled }}
                  accessibilityLabel={`${months} month${months > 1 ? 's' : ''}`}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setTerm(months);
                  }}
                  className={cn(
                    'h-11 flex-1 items-center justify-center rounded-lg border border-border bg-card',
                    on && 'border-primary bg-primary',
                    disabled && 'opacity-35',
                  )}
                >
                  <Text
                    variant="bodyMedium"
                    className={on ? 'text-primary-foreground' : 'text-foreground'}
                  >
                    {months}
                  </Text>
                  <Text
                    className={cn(
                      'font-sans text-[10px] leading-3',
                      on ? 'text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {months > 1 ? 'months' : 'month'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-2.5 rounded-xl bg-secondary p-[18px]">
          <View className="flex-row items-baseline justify-between">
            <Text variant="small" className="text-secondary-foreground">
              Total to repay
            </Text>
            <Text variant="h1" tabular className="text-secondary-foreground">
              {formatNad(result.totalCents)}
            </Text>
          </View>
          <View className="h-px bg-border" />
          <Line
            label={termMonths > 1 ? `Per month × ${termMonths}` : 'Once-off repayment'}
            value={formatNad(result.instalmentCents)}
          />
          <Line label="Finance charge" value={formatNad(result.financeChargeCents)} />
          {fees > 0 ? <Line label="Levy, stamp duty & insurance" value={formatNad(fees)} /> : null}
        </View>

        <Button
          iconRight={ArrowRight}
          onPress={() =>
            router.push({
              pathname: '/apply/[step]',
              params: { step: '0', amount: String(amount), term: String(termMonths), type },
            })
          }
        >
          Start my application
        </Button>
      </Card>

      <Text variant="caption" tone="muted" className="leading-[18px]">
        Figures are estimates for illustration only and do not constitute an offer of credit. Actual
        amounts, fees and terms are confirmed after an affordability assessment, in line with
        NAMFISA requirements. You always keep at least 50% of your income.
      </Text>
    </View>
  );
};

const Line = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row justify-between">
    <Text variant="small" tone="muted">
      {label}
    </Text>
    <Text variant="smallMedium" tabular>
      {value}
    </Text>
  </View>
);
