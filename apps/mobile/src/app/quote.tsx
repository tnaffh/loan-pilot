import { Em, Screen, Text } from '@/components/ui';
import { QuoteCalculator } from '@/features/quote/quote-calculator';

/** Signed-out entry to applying: the calculator, then the application. */
const QuoteScreen = () => (
  <Screen>
    <Text variant="h1">
      See exactly what <Em>you&apos;ll repay</Em>
    </Text>
    <QuoteCalculator />
  </Screen>
);

export default QuoteScreen;
