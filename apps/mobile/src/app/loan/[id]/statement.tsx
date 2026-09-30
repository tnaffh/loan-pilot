import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { formatNad } from '@loan-pilot/domain';
import { Card, Screen, Skeleton, Text } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate, formatShortDate } from '@/lib/format';
import { useStatement } from '@/lib/queries';

/** Statement of account: every charge and payment with the running balance. */
const StatementScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: statement, isLoading } = useStatement(id);

  if (isLoading || !statement) {
    return (
      <Screen>
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card className="gap-1">
        <Text variant="eyebrow" tone="primary">
          Outstanding balance
        </Text>
        <Text variant="display" tabular>
          {formatNad(statement.outstandingBalance)}
        </Text>
        <Text variant="small" tone="muted">
          {statement.lender.name} · as at {formatDate(statement.generatedAt)}
        </Text>
        {statement.defaultInterestAccrued > 0 ? (
          <Text variant="small" tone="destructive">
            Includes {formatNad(statement.defaultInterestAccrued)} default interest
          </Text>
        ) : null}
      </Card>

      <Card flat>
        <View className="flex-row border-b border-border bg-muted px-4 py-2.5">
          <Text variant="caption" tone="muted" className="w-14">
            Date
          </Text>
          <Text variant="caption" tone="muted" className="flex-1">
            Description
          </Text>
          <Text variant="caption" tone="muted" className="w-24 text-right">
            Amount
          </Text>
        </View>
        {statement.lines.map((line, index) => {
          const credit = line.credit > 0;
          return (
            <View
              key={`${line.date}-${index}`}
              className={cn(
                'flex-row items-start px-4 py-3',
                index > 0 && 'border-t border-border',
              )}
            >
              <Text variant="small" tone="muted" className="w-14">
                {formatShortDate(line.date)}
              </Text>
              <View className="flex-1 gap-0.5 pr-2">
                <Text variant="small">{line.description}</Text>
                <Text variant="caption" tone="muted" tabular>
                  Balance {formatNad(line.balance)}
                </Text>
              </View>
              <Text
                variant="smallMedium"
                tabular
                tone={credit ? 'success' : 'default'}
                className="w-24 text-right"
              >
                {credit ? `− ${formatNad(line.credit)}` : formatNad(line.debit)}
              </Text>
            </View>
          );
        })}
      </Card>
      <Text variant="caption" tone="muted" className="text-center">
        Need a stamped statement letter? Ask us on WhatsApp and we&apos;ll email it to you.
      </Text>
    </Screen>
  );
};

export default StatementScreen;
