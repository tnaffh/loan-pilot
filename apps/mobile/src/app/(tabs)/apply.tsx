import { Em, Screen, Text } from '@/components/ui';
import { QuoteCalculator } from '@/features/quote/quote-calculator';

const ApplyTab = () => (
  <Screen topInset bottomInset={false}>
    <Text variant="h1">
      Need a <Em>top-up?</Em>
    </Text>
    <QuoteCalculator />
  </Screen>
);

export default ApplyTab;
