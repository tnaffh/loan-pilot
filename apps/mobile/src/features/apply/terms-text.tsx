import { View } from 'react-native';
import { TERMS_AND_CONDITIONS } from '@loan-pilot/domain';
import { Text } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * One T&C paragraph with light structure, as on the website
 * (apps/web/src/components/site/terms-content.tsx): numbered sub-clauses hang-
 * indent by depth, "Step N" headings are emphasised, all-caps lines read as
 * subheadings.
 */
const Clause = ({ text }: { text: string }) => {
  const numbered = /^(\d+(?:\.\d+)*\.)\s+([\s\S]*)$/.exec(text);
  if (numbered) {
    const depth = numbered[1]?.match(/\./g)?.length ?? 1;
    return (
      <View className={cn('flex-row gap-2', depth === 2 && 'pl-3', depth >= 3 && 'pl-6')}>
        <Text variant="small" className="font-sans-medium text-foreground">
          {numbered[1]}
        </Text>
        <Text variant="small" tone="muted" className="flex-1">
          {numbered[2]}
        </Text>
      </View>
    );
  }

  const step = /^(Step\s+[IVX]+)\s*[:.]?\s*([\s\S]*)$/.exec(text);
  if (step) {
    return (
      <Text variant="small" tone="muted">
        <Text variant="small" className="font-sans-semibold text-foreground">
          {step[1]}.{' '}
        </Text>
        {step[2]}
      </Text>
    );
  }

  if (text === text.toUpperCase() && /[A-Z]/.test(text) && text.length < 90) {
    return (
      <Text
        variant="caption"
        className="pt-1 font-sans-semibold uppercase tracking-wide text-foreground"
      >
        {text}
      </Text>
    );
  }

  return (
    <Text variant="small" tone="muted">
      {text}
    </Text>
  );
};

/** The full NAMFISA Terms & Conditions, formatted for on-screen reading. */
export const TermsText = () => (
  <View className="gap-4">
    <Text variant="small" tone="muted" className="italic">
      {TERMS_AND_CONDITIONS.preamble}
    </Text>
    {TERMS_AND_CONDITIONS.sections.map((section) => (
      <View key={section.title} className="gap-2 border-t border-border pt-4">
        <Text variant="title">{section.title}</Text>
        {section.body.map((paragraph, index) => (
          <Clause key={index} text={paragraph} />
        ))}
      </View>
    ))}
  </View>
);
