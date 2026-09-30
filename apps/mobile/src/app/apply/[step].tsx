'use no memo';
// react-hook-form's formState/fieldState are getter proxies the React Compiler
// memoises as if they were plain values (stale errors); keep forms uncompiled.

import { useState } from 'react';
import { Alert, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFormContext, type FieldErrors } from 'react-hook-form';
import { ArrowRight } from 'lucide-react-native';
import {
  APPLICATION_DOCUMENT_SLOTS,
  APPLICATION_STEP_FIELDS,
  APPLICATION_STEPS,
  createApplicationSchema,
  DocumentKind,
  isDocumentSlotRequired,
  LoanType,
  type CreateApplicationInput,
} from '@loan-pilot/domain';
import { Button, ProgressSteps, Screen, Text } from '@/components/ui';
import { useApply } from '@/features/apply/apply-context';
import {
  EmploymentStep,
  LoanStep,
  PersonalStep,
  ReferencesStep,
  ReviewStep,
} from '@/features/apply/steps';
import { ApiError } from '@/lib/api';

const LAST = APPLICATION_STEPS.length - 1;

const rootsOf = (step: number): Set<string> =>
  new Set((APPLICATION_STEP_FIELDS[step] ?? []).map((field) => field.split('.')[0] ?? field));

/**
 * A step's validation messages straight from the shared schema — independent of
 * react-hook-form's formState proxy, which the React Compiler can memoise.
 */
const schemaMessages = (values: CreateApplicationInput, step: number): string[] => {
  const result = createApplicationSchema.safeParse(values);
  if (result.success) return [];
  const roots = rootsOf(step);
  // One message per field: an empty ID fails both its length and format checks.
  const byField = new Map<string, string>();
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    if (roots.has(String(issue.path[0])) && !byField.has(path)) byField.set(path, issue.message);
  }
  return [...new Set(byField.values())];
};

/** Every validation message under a step's field roots (some fields may be off-screen). */
const stepMessages = (errors: FieldErrors<CreateApplicationInput>, step: number): string[] => {
  const roots = rootsOf(step);
  const messages = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if ('message' in node && typeof node.message === 'string') messages.add(node.message);
    for (const [key, child] of Object.entries(node)) {
      if (key !== 'message' && key !== 'type' && key !== 'ref') visit(child);
    }
  };
  for (const [key, child] of Object.entries(errors)) {
    if (roots.has(key)) visit(child);
  }
  return [...messages];
};

/** First step owning a field with an error, so a blocked submit jumps back to it. */
const stepOfFirstError = (errors: FieldErrors<CreateApplicationInput>): number => {
  const roots = new Set(Object.keys(errors));
  const index = APPLICATION_STEP_FIELDS.findIndex((fields) =>
    fields.some((field) => roots.has(field.split('.')[0] ?? field)),
  );
  return index === -1 ? LAST : index;
};

const ApplyStep = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ step: string }>();
  const step = Math.min(Math.max(Number(params.step) || 0, 0), LAST);
  const form = useFormContext<CreateApplicationInput>();
  const { documents, collateralPhotos, submit, progress } = useApply();
  const [blocked, setBlocked] = useState<string[]>([]);
  const [documentErrors, setDocumentErrors] = useState<Partial<Record<DocumentKind, string>>>({});

  /** Documents upload outside the zod payload, so gate them here like the web form. */
  const documentsReady = (): boolean => {
    const loanType = form.getValues('loanType');
    const errors: Partial<Record<DocumentKind, string>> = {};
    for (const slot of APPLICATION_DOCUMENT_SLOTS) {
      if (isDocumentSlotRequired(slot, loanType) && !documents[slot.kind]) {
        errors[slot.kind] = 'This document is required';
      }
    }
    setDocumentErrors(errors);
    const photosMissing = loanType === LoanType.Collateral && collateralPhotos.length === 0;
    if (photosMissing) setBlocked(['Add at least one photo of the collateral (step 1)']);
    return Object.keys(errors).length === 0 && !photosMissing;
  };

  const fail = (messages: string[]) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setBlocked(messages);
  };

  const next = async () => {
    const valid = await form.trigger([...(APPLICATION_STEP_FIELDS[step] ?? [])]);
    const docsOk = step === 3 ? documentsReady() : true;
    if (!valid || !docsOk) {
      fail(valid ? ['Attach the required documents'] : schemaMessages(form.getValues(), step));
      return;
    }
    setBlocked([]);
    router.push({ pathname: '/apply/[step]', params: { step: String(step + 1) } });
  };

  const onSubmit = form.handleSubmit(
    async (values) => {
      if (!documentsReady()) {
        fail(['Attach the required documents (step 4)']);
        return;
      }
      try {
        await submit(values);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.dismissAll();
        router.replace('/apply/result');
      } catch (error) {
        const detail =
          error instanceof ApiError
            ? [error.message, ...error.issues.map((issue) => issue.message)].join('\n')
            : 'We could not submit your application. Please try again.';
        Alert.alert('Application not sent', detail);
      }
    },
    (errors) => {
      const target = stepOfFirstError(errors);
      if (target < step) {
        Alert.alert('A few details need fixing', stepMessages(errors, target).join('\n'), [
          { text: 'Go to step', onPress: () => router.dismiss(step - target) },
        ]);
        return;
      }
      fail(stepMessages(errors, target));
    },
  );

  const submitting = progress !== null;

  return (
    <Screen
      footer={
        <View className="gap-2">
          {submitting ? (
            <Text variant="caption" tone="muted" className="text-center" tabular>
              Sending your application… {Math.round((progress ?? 0) * 100)}%
            </Text>
          ) : null}
          {step < LAST ? (
            <Button iconRight={ArrowRight} onPress={() => void next()}>
              Continue
            </Button>
          ) : (
            <Button loading={submitting} onPress={() => void onSubmit()}>
              Submit application
            </Button>
          )}
        </View>
      }
    >
      <ProgressSteps steps={APPLICATION_STEPS} current={step} />
      {blocked.length > 0 ? (
        <View className="gap-1 rounded-xl bg-destructive-soft p-3.5" accessibilityRole="alert">
          <Text variant="smallMedium" tone="destructive">
            Please fix the highlighted fields
          </Text>
          {blocked.slice(0, 4).map((message) => (
            <Text key={message} variant="caption" tone="destructive">
              • {message}
            </Text>
          ))}
        </View>
      ) : null}
      {step === 0 ? <LoanStep /> : null}
      {step === 1 ? <PersonalStep /> : null}
      {step === 2 ? <EmploymentStep /> : null}
      {step === 3 ? <ReferencesStep documentErrors={documentErrors} /> : null}
      {step === 4 ? <ReviewStep /> : null}
    </Screen>
  );
};

export default ApplyStep;
