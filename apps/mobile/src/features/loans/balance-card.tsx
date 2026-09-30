import { View } from 'react-native';
import { formatNad } from '@loan-pilot/domain';
import { LinearGradient } from '@/components/styled';
import { Text } from '@/components/ui';
import { LOAN_TYPE_LABEL } from '@/lib/brand';
import { daysUntil, describeDue } from '@/lib/format';
import { useColors } from '@/lib/theme';
import type { LoanRow } from '@/lib/types';

/**
 * The borrower's hero card: navy gradient with a faint grid (the dashboard's
 * borrower home), balance in Spectral, and a lime repayment progress bar.
 */
export const BalanceCard = ({ loan }: { loan: LoanRow }) => {
  const colors = useColors();
  const repaid =
    loan.total > 0 ? Math.min(1, Math.max(0, (loan.total - loan.balance) / loan.total)) : 0;
  // The stored daysLate lags until arrears are recomputed; the due date doesn't.
  const overdue = loan.daysLate > 0 || (loan.nextDueAt !== null && daysUntil(loan.nextDueAt) < 0);

  return (
    <LinearGradient
      colors={[colors.brand, colors.brandDeep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      className="overflow-hidden rounded-2xl p-[22px]"
    >
      <GridPattern />
      <Text variant="eyebrow" tone="inverse" className="opacity-75">
        Balance remaining
      </Text>
      <Text
        variant="display"
        tone="inverse"
        tabular
        className="mt-2 text-[42px] leading-[46px]"
        accessibilityLabel={`Balance remaining ${formatNad(loan.balance)}`}
      >
        {formatNad(loan.balance)}
      </Text>
      <Text variant="small" tone="inverse" className="mt-0.5 opacity-85">
        of {formatNad(loan.total)} · {LOAN_TYPE_LABEL[loan.type]}
      </Text>

      <View
        className="mt-5 h-2 overflow-hidden rounded-full bg-white/20"
        accessibilityLabel={`${Math.round(repaid * 100)} percent repaid`}
      >
        <View className="h-2 rounded-full bg-highlight" style={{ width: `${repaid * 100}%` }} />
      </View>
      <View className="mt-2.5 flex-row justify-between">
        <Text variant="caption" tone="inverse" className="opacity-85">
          {loan.instalmentsPaid} of {loan.instalmentsTotal} instalments paid
        </Text>
        {loan.nextDueAt ? (
          <Text
            variant="caption"
            className={
              overdue ? 'font-sans-semibold text-[#ffb4b0]' : 'font-sans-semibold text-highlight'
            }
          >
            {describeDue(loan.nextDueAt)}
          </Text>
        ) : null}
      </View>
    </LinearGradient>
  );
};

/** 34px grid at 6% white, like the dashboard hero's background texture. */
const GridPattern = () => (
  <View pointerEvents="none" className="absolute inset-0">
    {Array.from({ length: 12 }, (_unused, index) => (
      <View
        key={`v${index}`}
        className="absolute inset-y-0 w-px bg-white/5"
        style={{ left: index * 34 }}
      />
    ))}
    {Array.from({ length: 8 }, (_unused, index) => (
      <View
        key={`h${index}`}
        className="absolute inset-x-0 h-px bg-white/5"
        style={{ top: index * 34 }}
      />
    ))}
  </View>
);
