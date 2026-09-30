'use no memo';
// react-hook-form's formState/fieldState are getter proxies the React Compiler
// memoises as if they were plain values (stale errors); keep forms uncompiled.

import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useController, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Plus, Trash2, X } from 'lucide-react-native';
import {
  APPLICATION_DOCUMENT_SLOTS,
  BANK_ACCOUNT_TYPES,
  DocumentKind,
  EMPLOYMENT_TYPE_OPTIONS,
  GENDER_OPTIONS,
  LOAN_PURPOSE_LABELS,
  LoanPurpose,
  LoanType,
  MARITAL_STATUS_OPTIONS,
  NAMIBIAN_REGIONS,
  TERMS_VERSION,
  formatNad,
  isDocumentSlotRequired,
  parseNamibianId,
  quoteWithPricing,
  toCents,
  type CreateApplicationInput,
} from '@loan-pilot/domain';
import { Image } from '@/components/styled';
import { Button, Card, Checkbox, ChoiceCard, Em, Sheet, Text, TextField } from '@/components/ui';
import { PRODUCTS } from '@/lib/brand';
import { usePricing } from '@/lib/queries';
import { useColors } from '@/lib/theme';
import { useApply } from './apply-context';
import { DocumentSlot, SourceSheet } from './document-slot';
import { FormCheckbox, FormSelect, FormText, optionsOf } from './form-fields';
import { SignatureField } from './signature-field';
import { TermsText } from './terms-text';

const Heading = ({
  title,
  emphasis,
  blurb,
}: {
  title: string;
  emphasis: string;
  blurb: string;
}) => (
  <View className="gap-1.5">
    <Text variant="h1">
      {title} <Em>{emphasis}</Em>
    </Text>
    <Text tone="muted">{blurb}</Text>
  </View>
);

const Section = ({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: ReactNode;
}) => (
  <View className="gap-4">
    <View className="gap-0.5 pt-1">
      <Text variant="h3">{title}</Text>
      {blurb ? (
        <Text variant="small" tone="muted">
          {blurb}
        </Text>
      ) : null}
    </View>
    {children}
  </View>
);

const TERM_OPTIONS = [1, 2, 3, 4, 5].map((months) => ({
  value: months,
  label: `${months} month${months > 1 ? 's' : ''}`,
}));

const PURPOSE_OPTIONS = Object.values(LoanPurpose).map((value) => ({
  value,
  label: LOAN_PURPOSE_LABELS[value],
}));

// ---------------------------------------------------------------------------

export const LoanStep = () => {
  const colors = useColors();
  const { control, setValue } = useFormContext<CreateApplicationInput>();
  const { collateralPhotos, setCollateralPhotos } = useApply();
  const { data: pricing } = usePricing();
  const { field: typeField } = useController({ control, name: 'loanType' });
  const [amountRaw, termRaw] = useWatch({ control, name: ['amount', 'termMonths'] });
  const [photoSheet, setPhotoSheet] = useState(false);
  const type = typeField.value;
  const isPayday = type === LoanType.Payday;
  const amount = Number(amountRaw) || 0;
  const term = Number(termRaw) || 1;

  // Payday loans are repaid in a single month; the term isn't adjustable.
  useEffect(() => {
    if (isPayday && term !== 1) setValue('termMonths', 1);
  }, [isPayday, term, setValue]);

  const estimate =
    amount >= 500 ? quoteWithPricing(pricing ?? null, { amount, termMonths: term, type }) : null;

  return (
    <>
      <Heading
        title="What do"
        emphasis="you need?"
        blurb="Choose your loan type and how much you would like to borrow."
      />
      <View className="gap-2.5" accessibilityRole="radiogroup">
        {PRODUCTS.map((product) => (
          <ChoiceCard
            key={product.type}
            selected={type === product.type}
            onPress={() => typeField.onChange(product.type)}
          >
            <Text variant="title">{product.title}</Text>
            <Text variant="small" tone="muted">
              {product.term} · {product.collateral}
            </Text>
          </ChoiceCard>
        ))}
      </View>
      <FormText name="amount" label="Amount needed (N$)" numeric placeholder="5000" />
      <FormSelect
        name="termMonths"
        label="Repayment term"
        options={isPayday ? TERM_OPTIONS.slice(0, 1) : TERM_OPTIONS}
        disabled={isPayday}
        description={isPayday ? 'Payday loans are repaid in one month.' : undefined}
      />
      <FormSelect
        name="purposeCategory"
        label="What is it for?"
        options={PURPOSE_OPTIONS}
        optional
      />
      <FormText
        name="purpose"
        label="Tell us more"
        optional
        placeholder="e.g. medical bill, school fees, stock"
      />

      {estimate ? (
        <View className="gap-1 rounded-xl bg-secondary p-[18px]">
          <View className="flex-row items-baseline justify-between">
            <Text variant="small" className="text-secondary-foreground">
              Estimated total to repay
            </Text>
            <Text variant="h2" tabular className="text-secondary-foreground">
              {formatNad(estimate.totalCents)}
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            {formatNad(estimate.instalmentCents)} per month over {term} month{term > 1 ? 's' : ''}
          </Text>
        </View>
      ) : null}

      {type === LoanType.Collateral ? (
        <Card className="gap-4">
          <View className="gap-0.5">
            <Text variant="h3">Collateral</Text>
            <Text variant="small" tone="muted">
              Tell us about the asset you are putting up as security, and add clear photos of it.
            </Text>
          </View>
          <FormText
            name="collateral.item"
            label="Item / asset"
            description="e.g. Toyota Corolla 2015, laptop, generator"
          />
          <FormText
            name="collateral.identifier"
            label="Identification"
            description="Serial no., registration, VIN…"
          />
          <FormText
            name="collateral.condition"
            label="Condition"
            description="e.g. Good, Fair, as new"
          />
          <FormText
            name="collateral.estimatedValue"
            label="Estimated value (N$)"
            numeric
            optional
          />
          <FormText
            name="collateral.description"
            label="Brief description"
            multiline
            placeholder="Colour, make/model, accessories…"
          />
          <View className="gap-2">
            <Text variant="smallMedium">Photos of the collateral</Text>
            <View className="flex-row flex-wrap gap-2.5">
              {collateralPhotos.map((photo, index) => (
                <View key={photo.uri} className="size-20 overflow-hidden rounded-lg">
                  <Image source={{ uri: photo.uri }} className="size-20" contentFit="cover" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${index + 1}`}
                    onPress={() =>
                      setCollateralPhotos(collateralPhotos.filter((item) => item.uri !== photo.uri))
                    }
                    className="absolute right-1 top-1 size-6 items-center justify-center rounded-full bg-black/60"
                  >
                    <X size={14} color="#ffffff" />
                  </Pressable>
                </View>
              ))}
              {collateralPhotos.length < 6 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add a photo"
                  onPress={() => setPhotoSheet(true)}
                  className="size-20 items-center justify-center rounded-lg border border-dashed border-input bg-card"
                >
                  <Plus size={22} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
          </View>
          <SourceSheet
            open={photoSheet}
            onClose={() => setPhotoSheet(false)}
            onPick={(file) => setCollateralPhotos([...collateralPhotos, file])}
            title="Add a photo"
            allowFiles={false}
          />
        </Card>
      ) : null}
    </>
  );
};

// ---------------------------------------------------------------------------

/** Format typed digits as YYYY-MM-DD so a date of birth needs no picker. */
const maskDate = (text: string): string => {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-');
};

export const PersonalStep = () => {
  const { control, setValue, getValues } = useFormContext<CreateApplicationInput>();
  const idNumber = useWatch({ control, name: 'idNumber' });
  const postalSame = useWatch({ control, name: 'postalSameAsResidential' });
  const { field: dob, fieldState: dobState } = useController({ control, name: 'dateOfBirth' });

  // A Namibian ID encodes the date of birth — fill it in for the applicant.
  useEffect(() => {
    const parsed = parseNamibianId(idNumber ?? '');
    if (parsed.isNamibianId && parsed.dateOfBirth && !getValues('dateOfBirth')) {
      setValue('dateOfBirth', parsed.dateOfBirth, { shouldValidate: true });
    }
  }, [idNumber, getValues, setValue]);

  return (
    <>
      <Heading
        title="Personal"
        emphasis="details"
        blurb="Exactly as they appear on your Namibian ID or passport."
      />
      <FormText
        name="firstName"
        label="First name"
        autoComplete="given-name"
        textContentType="givenName"
      />
      <FormText
        name="lastName"
        label="Surname"
        autoComplete="family-name"
        textContentType="familyName"
      />
      <FormText
        name="idNumber"
        label="ID / Passport number"
        description="Namibian 11-digit ID or your passport number"
        autoCapitalize="characters"
      />
      <DateOfBirthField
        value={dob.value ?? ''}
        onChange={(text) => dob.onChange(maskDate(text))}
        onBlur={dob.onBlur}
        error={dobState.error?.message}
      />
      <FormText
        name="phone"
        label="Phone"
        description="e.g. 081 123 4567 — we'll use this for your sign-in code"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <FormText
        name="email"
        label="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />

      <Section title="Where you live">
        <FormText
          name="address.street"
          label="Street address"
          placeholder="e.g. 12 Acacia Street"
          autoComplete="street-address"
        />
        <FormText name="address.suburb" label="Suburb" optional />
        <FormText name="address.city" label="City / town" />
        <FormSelect
          name="address.region"
          label="Region"
          options={optionsOf(NAMIBIAN_REGIONS)}
          optional
        />
        <FormText name="address.country" label="Country" />
      </Section>

      <Section title="About you">
        <FormSelect name="gender" label="Gender" options={optionsOf(GENDER_OPTIONS)} optional />
        <FormSelect
          name="maritalStatus"
          label="Marital status"
          options={optionsOf(MARITAL_STATUS_OPTIONS)}
          optional
        />
      </Section>

      <Checkbox
        checked={postalSame !== false}
        onChange={(checked) => {
          setValue('postalSameAsResidential', checked);
          // Drop any entered postal address so it can't linger half-filled.
          if (checked) setValue('postalAddress', undefined);
        }}
      >
        My postal address is the same as my residential address
      </Checkbox>
      {postalSame === false ? (
        <Section title="Postal address">
          <FormText
            name="postalAddress.street"
            label="Postal street / PO Box"
            placeholder="e.g. PO Box 123"
          />
          <FormText name="postalAddress.suburb" label="Suburb" optional />
          <FormText name="postalAddress.city" label="City / town" />
          <FormSelect
            name="postalAddress.region"
            label="Region"
            options={optionsOf(NAMIBIAN_REGIONS)}
            optional
          />
          <FormText name="postalAddress.country" label="Country" />
        </Section>
      ) : null}
    </>
  );
};

const DateOfBirthField = ({
  value,
  onChange,
  onBlur,
  error,
}: {
  value: string;
  onChange: (text: string) => void;
  onBlur: () => void;
  error?: string;
}) => (
  <TextField
    label="Date of birth"
    placeholder="YYYY-MM-DD"
    description="Filled in from a Namibian ID number"
    keyboardType="number-pad"
    value={value}
    onChangeText={onChange}
    onBlur={onBlur}
    error={error}
    maxLength={10}
  />
);

// ---------------------------------------------------------------------------

export const EmploymentStep = () => (
  <>
    <Heading
      title="Employment"
      emphasis="& bank"
      blurb="We use this to assess affordability — you always keep at least 50% of your income."
    />
    <FormSelect name="employmentType" label="Employment type" options={EMPLOYMENT_TYPE_OPTIONS} />
    <FormText name="monthlyIncome" label="Monthly take-home income (N$)" numeric />
    <FormText name="employer" label="Employer" />
    <FormText name="occupation" label="Occupation" />
    <FormText name="employerPhone" label="Employer telephone" optional keyboardType="phone-pad" />
    <FormText name="employeeNo" label="Payslip / employee no." optional />
    <FormText name="employerAddress" label="Employer address" optional />

    <Section title="Bank account" blurb="Where we pay out your loan and collect repayments.">
      <FormText name="bankAccount.bankName" label="Bank name" placeholder="e.g. Bank Windhoek" />
      <FormText name="bankAccount.accountHolderName" label="Account holder name" />
      <FormText name="bankAccount.accountNumber" label="Account number" keyboardType="number-pad" />
      <FormSelect
        name="bankAccount.accountType"
        label="Account type"
        options={optionsOf(BANK_ACCOUNT_TYPES)}
      />
      <FormText name="bankAccount.branchName" label="Branch name" optional />
      <FormText
        name="bankAccount.branchCode"
        label="Branch code"
        optional
        keyboardType="number-pad"
      />
    </Section>
  </>
);

// ---------------------------------------------------------------------------

export const ReferencesStep = ({
  documentErrors,
}: {
  documentErrors: Partial<Record<DocumentKind, string>>;
}) => {
  const colors = useColors();
  const { control, formState } = useFormContext<CreateApplicationInput>();
  const { fields, append, remove } = useFieldArray({ control, name: 'references' });
  const loanType = useWatch({ control, name: 'loanType' });
  const { documents, setDocument } = useApply();
  const isCollateral = loanType === LoanType.Collateral;
  const listError = formState.errors.references?.message;

  return (
    <>
      <Heading
        title="References"
        emphasis="& documents"
        blurb="Give us at least one person we may contact, and add your supporting documents."
      />
      <View className="gap-4">
        {fields.map((item, index) => (
          <Card key={item.id} className="gap-3.5">
            <View className="flex-row items-center justify-between">
              <Text variant="title">Reference {index + 1}</Text>
              {fields.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove reference ${index + 1}`}
                  hitSlop={10}
                  onPress={() => remove(index)}
                >
                  <Trash2 size={18} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
            <FormText name={`references.${index}.name`} label="Full name" />
            <FormText name={`references.${index}.phone`} label="Phone" keyboardType="phone-pad" />
          </Card>
        ))}
        {fields.length < 4 ? (
          <Button
            variant="outline"
            size="md"
            icon={Plus}
            onPress={() => append({ name: '', phone: '' })}
          >
            Add another reference
          </Button>
        ) : null}
        {listError ? (
          <Text variant="caption" tone="destructive">
            {listError}
          </Text>
        ) : null}
      </View>

      <Section
        title="Supporting documents"
        blurb={`PDF, JPG or PNG. ${
          isCollateral
            ? 'For collateral loans, payslip and bank statement are optional.'
            : 'Your ID, latest payslip and 3-month bank statement are required.'
        }`}
      >
        {APPLICATION_DOCUMENT_SLOTS.map((slot) => (
          <DocumentSlot
            key={slot.kind}
            label={slot.label}
            required={isDocumentSlotRequired(slot, loanType)}
            file={documents[slot.kind]}
            error={documentErrors[slot.kind]}
            onChange={(file) => setDocument(slot.kind, file)}
          />
        ))}
      </Section>

      <FormCheckbox name="consent">
        I confirm the information provided is accurate and I agree to an affordability assessment
        and credit check in line with NAMFISA requirements.
      </FormCheckbox>
    </>
  );
};

// ---------------------------------------------------------------------------

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row justify-between py-1">
    <Text variant="small" tone="muted">
      {label}
    </Text>
    <Text variant="smallMedium" tabular>
      {value}
    </Text>
  </View>
);

export const ReviewStep = () => {
  const { control, getValues } = useFormContext<CreateApplicationInput>();
  const { data: pricing } = usePricing();
  const [termsOpen, setTermsOpen] = useState(false);
  const { field: signature, fieldState: signatureState } = useController({
    control,
    name: 'signature.dataUrl',
  });
  const { field: initials, fieldState: initialsState } = useController({
    control,
    name: 'initials.dataUrl',
  });
  const { amount, termMonths, loanType, firstName, lastName } = getValues();
  const estimate =
    Number(amount) >= 500
      ? quoteWithPricing(pricing ?? null, {
          amount: Number(amount),
          termMonths: Number(termMonths),
          type: loanType,
        })
      : null;

  return (
    <>
      <Heading
        title="Review"
        emphasis="& sign"
        blurb="Check your loan, read the Terms & Conditions, then sign to complete your application."
      />
      <Card className="gap-0.5">
        <SummaryRow label="Applicant" value={`${firstName} ${lastName}`} />
        <SummaryRow label="Amount" value={formatNad(toCents(Number(amount) || 0))} />
        <SummaryRow
          label="Term"
          value={`${termMonths} month${Number(termMonths) > 1 ? 's' : ''}`}
        />
        {estimate ? (
          <SummaryRow label="Estimated total to repay" value={formatNad(estimate.totalCents)} />
        ) : null}
      </Card>

      <Pressable
        accessibilityRole="button"
        onPress={() => setTermsOpen(true)}
        className="rounded-xl border border-border bg-card p-4 active:bg-muted"
      >
        <Text variant="bodyMedium" tone="primary">
          Read the Terms & Conditions
        </Text>
        <Text variant="caption" tone="muted">
          Version {TERMS_VERSION} · NAMFISA-approved wording
        </Text>
      </Pressable>
      <FormCheckbox name="tcAccepted">
        {`I have read, understood and agree to the Terms & Conditions (version ${TERMS_VERSION}).`}
      </FormCheckbox>

      <SignatureField
        label="Your signature"
        value={signature.value ?? ''}
        onChange={signature.onChange}
        error={signatureState.error?.message}
      />
      <SignatureField
        label="Your initials"
        hint="Every page of your loan agreement except the signature page is initialled. We print these for you."
        variant="initials"
        value={initials.value ?? ''}
        onChange={initials.onChange}
        error={initialsState.error?.message}
      />

      <Sheet open={termsOpen} onClose={() => setTermsOpen(false)} title="Terms & Conditions">
        <View className="px-5 pb-4">
          <TermsText />
        </View>
      </Sheet>
    </>
  );
};
