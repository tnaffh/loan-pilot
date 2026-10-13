import { z } from 'zod';
import { AffordabilityResult, AiRecommendation } from './enums';
import { MAX_PASS_RATIO, assessAffordability } from './affordability';
import { toCents, type Cents } from './money';

/**
 * AI document review: a loan officer asks an AI model to read an application's
 * (or a borrower's) uploaded documents and report on authenticity, red flags and
 * affordability, the way a principal officer would before approving a loan.
 *
 * This module is provider-neutral. It owns
 *  - the provider catalog (which vendors exist, which are implemented, prices),
 *  - the checklist the reviewer works through (also rendered by the dashboard),
 *  - the output contract (one Zod schema; the JSON Schema sent to the provider is
 *    derived from it by {@link toJsonSchema}, so the two cannot drift), and
 *  - {@link buildAiReviewReport}, which turns the model's output into the stored
 *    report. Affordability is NOT the model's call: it is computed here with
 *    {@link assessAffordability} from the income and debts the model extracted,
 *    and the model's recommendation is capped where that rule does not allow it.
 */

// ── Providers ───────────────────────────────────────────────────────────────

export enum AiProvider {
  Anthropic = 'anthropic',
  OpenAi = 'openai',
  Google = 'google',
  DeepSeek = 'deepseek',
}

/** USD per million tokens. */
export interface AiModelPrice {
  readonly inputPerMTok: number;
  readonly outputPerMTok: number;
}

export interface AiModelInfo {
  readonly id: string;
  readonly label: string;
  readonly price?: AiModelPrice;
}

export interface AiProviderInfo {
  readonly id: AiProvider;
  /** Product name shown to lenders, e.g. "Claude". */
  readonly label: string;
  readonly vendor: string;
  /** False until the API has a client for this provider — shown as "coming soon". */
  readonly available: boolean;
  readonly defaultModel: string;
  readonly models: readonly AiModelInfo[];
  readonly keyPlaceholder: string;
  /** Where an administrator creates an API key. */
  readonly keysUrl: string;
}

export const AI_PROVIDERS: readonly AiProviderInfo[] = [
  {
    id: AiProvider.Anthropic,
    label: 'Claude',
    vendor: 'Anthropic',
    available: true,
    defaultModel: 'claude-opus-5-5',
    models: [
      {
        id: 'claude-opus-5-5',
        label: 'Claude Opus 5.5 — most thorough',
        price: { inputPerMTok: 4, outputPerMTok: 20 },
      },
      {
        id: 'claude-sonnet-5-5',
        label: 'Claude Sonnet 5.5 — balanced',
        price: { inputPerMTok: 2, outputPerMTok: 10 },
      },
      {
        id: 'claude-haiku-5-5',
        label: 'Claude Haiku 5.5 — fastest, lowest cost',
        price: { inputPerMTok: 0.1, outputPerMTok: 0.5 },
      },
    ],
    keyPlaceholder: 'sk-ant-…',
    keysUrl: 'https://platform.claude.com/settings/keys',
  },
  {
    id: AiProvider.OpenAi,
    label: 'ChatGPT',
    vendor: 'OpenAI',
    available: false,
    defaultModel: '',
    models: [],
    keyPlaceholder: 'sk-…',
    keysUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: AiProvider.Google,
    label: 'Gemini',
    vendor: 'Google AI',
    available: false,
    defaultModel: '',
    models: [],
    keyPlaceholder: 'AIza…',
    keysUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: AiProvider.DeepSeek,
    label: 'DeepSeek',
    vendor: 'DeepSeek',
    available: false,
    defaultModel: '',
    models: [],
    keyPlaceholder: 'sk-…',
    keysUrl: 'https://platform.deepseek.com/api_keys',
  },
];

export const aiProviderInfo = (provider: AiProvider): AiProviderInfo | undefined =>
  AI_PROVIDERS.find((info) => info.id === provider);

export interface AiUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

/**
 * Estimated USD cost of one review from its token usage, or null for a model
 * without a known price. Cache writes bill at 1.25x input, cache reads at 0.1x.
 * An estimate for the lender's information — the provider's invoice is the truth.
 */
export const estimateAiCostUsd = (
  provider: AiProvider,
  model: string,
  usage: AiUsage,
): number | null => {
  const price = aiProviderInfo(provider)?.models.find((info) => info.id === model)?.price;

  if (!price) {
    return null;
  }

  const inputUnits =
    usage.inputTokens + usage.cacheWriteTokens * 1.25 + usage.cacheReadTokens * 0.1;
  const usd =
    (inputUnits * price.inputPerMTok + usage.outputTokens * price.outputPerMTok) / 1_000_000;

  return Math.round(usd * 10_000) / 10_000;
};

// ── Settings payloads ───────────────────────────────────────────────────────

export const aiProviderSchema = z.nativeEnum(AiProvider);

/** Save a provider's credentials. `apiKey` may be omitted to change only the model. */
export const saveAiCredentialSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20, 'That does not look like a complete API key')
    .max(500)
    .optional(),
  model: z.string().trim().min(1, 'Choose a model').max(100),
});
export type SaveAiCredentialInput = z.infer<typeof saveAiCredentialSchema>;

/** Switch the active provider; null turns AI review off for the lender. */
export const aiSettingsSchema = z.object({
  activeProvider: aiProviderSchema.nullable(),
});
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

// ── The checklist ───────────────────────────────────────────────────────────

/** A statement must cover at least this many recent months. */
export const AI_REVIEW_STATEMENT_MONTHS = 3;
/** …and end no more than this many days before the review date. */
export const AI_REVIEW_MAX_STATEMENT_AGE_DAYS = 31;

export enum AiCheckKey {
  DocumentsComplete = 'documents_complete',
  IdentityMatches = 'identity_matches',
  IdDocumentGenuine = 'id_document_genuine',
  StatementGenuine = 'statement_genuine',
  StatementPeriod = 'statement_period',
  StatementOwnership = 'statement_ownership',
  TransactionalAccount = 'transactional_account',
  PayslipGenuine = 'payslip_genuine',
  PayslipMatchesStatement = 'payslip_matches_statement',
  IncomeMatchesDeclared = 'income_matches_declared',
  DebitOrderHistory = 'debit_order_history',
  OtherLenders = 'other_lenders',
  SalaryRetention = 'salary_retention',
  AccountConduct = 'account_conduct',
  ProofOfResidence = 'proof_of_residence',
}

export interface AiCheckDefinition {
  readonly key: AiCheckKey;
  readonly label: string;
  /** What the reviewer looks for — sent to the model and shown as a tooltip. */
  readonly guidance: string;
}

export const AI_REVIEW_CHECKS: readonly AiCheckDefinition[] = [
  {
    key: AiCheckKey.DocumentsComplete,
    label: 'Documents complete',
    guidance:
      'An ID copy, the latest payslip and a bank statement are present and readable. Name anything missing, unreadable, or uploaded under the wrong label (e.g. a payslip uploaded as a bank statement).',
  },
  {
    key: AiCheckKey.IdentityMatches,
    label: 'Identity matches',
    guidance:
      "The name, ID number and date of birth on the ID document match the applicant on file and the names on the payslip and statement. A Namibian ID number starts with the holder's date of birth (YYMMDD).",
  },
  {
    key: AiCheckKey.IdDocumentGenuine,
    label: 'ID document genuine',
    guidance:
      'The ID looks like a real Namibian ID card or passport: consistent layout and fonts, a photo that belongs to the card, no pasted-over text, no screenshot of an image, no obvious template.',
  },
  {
    key: AiCheckKey.StatementGenuine,
    label: 'Bank statement genuine',
    guidance:
      'No signs of editing: mixed fonts or sizes, misaligned columns, retyped amounts, round-number salaries, missing bank fees, transactions on dates the bank does not process. Recompute running balances — opening balance plus credits minus debits must reach each printed balance. Weigh the file metadata provided (editing software, modified after creation, incremental saves).',
  },
  {
    key: AiCheckKey.StatementPeriod,
    label: 'Statement period correct',
    guidance: `The statement covers at least the ${AI_REVIEW_STATEMENT_MONTHS} most recent months and ends no more than ${AI_REVIEW_MAX_STATEMENT_AGE_DAYS} days before the review date. Flag old statements, short periods, gaps, and statements stitched together from different periods.`,
  },
  {
    key: AiCheckKey.StatementOwnership,
    label: 'Statement belongs to applicant',
    guidance:
      'The account holder is the applicant, and the account number and bank match the account given for the debit order.',
  },
  {
    key: AiCheckKey.TransactionalAccount,
    label: 'Transactional account',
    guidance:
      'The account is a cheque, current or transmission account. Debit orders cannot be run on savings, investment, fixed-deposit, notice-deposit, money-market or call accounts — any of those fails this check.',
  },
  {
    key: AiCheckKey.PayslipGenuine,
    label: 'Payslip genuine',
    guidance:
      'The payslip is internally consistent: earnings minus deductions equals net pay, tax and social security look plausible for the gross, employer details and pay period are present, layout looks like a real payroll system.',
  },
  {
    key: AiCheckKey.PayslipMatchesStatement,
    label: 'Payslip matches statement',
    guidance:
      'The net pay on the payslip arrives in the statement as a salary credit from the same employer, around the same date, for the same amount (small bank-charge differences are fine). A payslip whose salary never appears on the statement is a strong red flag.',
  },
  {
    key: AiCheckKey.IncomeMatchesDeclared,
    label: 'Income matches declared',
    guidance:
      'The verified take-home pay is consistent with the income the applicant declared. Material over-declaration is a red flag.',
  },
  {
    key: AiCheckKey.DebitOrderHistory,
    label: 'No failed debit orders',
    guidance:
      'Look for returned or unpaid debit orders: "ENDO", "RD" (refer to drawer), "unpaid", "returned", "insufficient funds", dishonour fees and reversed debit orders. Each one means a lender failed to collect from this account.',
  },
  {
    key: AiCheckKey.OtherLenders,
    label: 'Other lenders',
    guidance:
      'Identify repayments to other micro-lenders, banks or credit providers — on the statement (debit orders, Collexia collections, transfers to lenders) and on the payslip (loan, garnishee or third-party deductions). Each active loan elsewhere needs a paid-up letter before approval.',
  },
  {
    key: AiCheckKey.SalaryRetention,
    label: 'Salary stays in the account',
    guidance:
      'Whether the salary stays in the account long enough for a debit order to be collected. Flag salary that is transferred to another account, withdrawn in cash, or sent to an e-wallet on or right after payday — a pattern used to dodge debit orders.',
  },
  {
    key: AiCheckKey.AccountConduct,
    label: 'Account conduct',
    guidance:
      'Overdrawn or negative balances, frequent low balances before payday, gambling or betting, and large unexplained deposits just before applying (often made to inflate the balance).',
  },
  {
    key: AiCheckKey.ProofOfResidence,
    label: 'Proof of residence',
    guidance:
      "If a proof of residence is provided: it is recent (within 3 months), in the applicant's name or explained, and the address matches the application. Not provided is not a failure on its own.",
  },
];

export const aiCheckLabel = (key: AiCheckKey): string =>
  AI_REVIEW_CHECKS.find((check) => check.key === key)?.label ?? key;

export enum AiCheckStatus {
  Pass = 'pass',
  Warning = 'warning',
  Fail = 'fail',
  NotAssessable = 'not_assessable',
}

export enum AiRiskLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  VeryHigh = 'very_high',
}

export enum AiFlagSeverity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

export enum AiFlagCategory {
  FakeDocument = 'fake_document',
  TamperedDocument = 'tampered_document',
  IdentityMismatch = 'identity_mismatch',
  WrongPeriod = 'wrong_period',
  MissingDocument = 'missing_document',
  IncomeMismatch = 'income_mismatch',
  FailedDebitOrder = 'failed_debit_order',
  OtherLenderDebt = 'other_lender_debt',
  SalaryDiversion = 'salary_diversion',
  IneligibleAccount = 'ineligible_account',
  Gambling = 'gambling',
  Affordability = 'affordability',
  Other = 'other',
}

export const AI_FLAG_CATEGORY_LABELS: Record<AiFlagCategory, string> = {
  [AiFlagCategory.FakeDocument]: 'Fake document',
  [AiFlagCategory.TamperedDocument]: 'Edited document',
  [AiFlagCategory.IdentityMismatch]: 'Identity mismatch',
  [AiFlagCategory.WrongPeriod]: 'Wrong period',
  [AiFlagCategory.MissingDocument]: 'Missing document',
  [AiFlagCategory.IncomeMismatch]: 'Income mismatch',
  [AiFlagCategory.FailedDebitOrder]: 'Failed debit order',
  [AiFlagCategory.OtherLenderDebt]: 'Other lender',
  [AiFlagCategory.SalaryDiversion]: 'Salary moved out',
  [AiFlagCategory.IneligibleAccount]: 'Account type',
  [AiFlagCategory.Gambling]: 'Gambling',
  [AiFlagCategory.Affordability]: 'Affordability',
  [AiFlagCategory.Other]: 'Other',
};

export enum AiDocumentType {
  IdDocument = 'id_document',
  Payslip = 'payslip',
  BankStatement = 'bank_statement',
  ProofOfResidence = 'proof_of_residence',
  Other = 'other',
  Unreadable = 'unreadable',
}

export enum AiAuthenticity {
  AppearsGenuine = 'appears_genuine',
  Suspicious = 'suspicious',
  LikelyFakeOrTampered = 'likely_fake_or_tampered',
  CannotDetermine = 'cannot_determine',
}

export const AI_RECOMMENDATION_LABELS: Record<AiRecommendation, string> = {
  [AiRecommendation.Approve]: 'Approve',
  [AiRecommendation.ApproveWithConditions]: 'Approve with conditions',
  [AiRecommendation.Refer]: 'Refer — needs a closer look',
  [AiRecommendation.Decline]: 'Decline',
};

/** Most to least favourable. */
export const AI_RECOMMENDATION_ORDER: readonly AiRecommendation[] = [
  AiRecommendation.Approve,
  AiRecommendation.ApproveWithConditions,
  AiRecommendation.Refer,
  AiRecommendation.Decline,
];

// ── Output contract (what the model returns) ────────────────────────────────

const nullableString = (description: string) => z.string().nullable().describe(description);
const nullableAmount = (description: string) => z.number().nullable().describe(description);

export const aiReviewOutputSchema = z.object({
  summary: z
    .string()
    .describe(
      'Three to five sentences for the loan officer: who the applicant is, what the documents show, and the decisive issues.',
    ),
  score: z
    .number()
    .int()
    .describe(
      '0–100. Overall confidence that this is a genuine applicant who can and will repay. 80+ strong, 60–79 acceptable, 40–59 doubtful, below 40 poor.',
    ),
  riskLevel: z.nativeEnum(AiRiskLevel),
  recommendation: z.nativeEnum(AiRecommendation),
  recommendationReason: z.string().describe('One or two sentences justifying the recommendation.'),
  conditions: z
    .array(z.string())
    .describe(
      'What must happen before approval, e.g. "Provide a paid-up letter from <lender>" or "Provide a statement for August". Empty when none.',
    ),
  documents: z
    .array(
      z.object({
        documentId: z.string().describe('The id given for the document.'),
        detectedType: z
          .nativeEnum(AiDocumentType)
          .describe(
            'What the document actually is, regardless of the label it was uploaded under.',
          ),
        authenticity: z.nativeEnum(AiAuthenticity),
        periodStart: nullableString('First date the document covers, YYYY-MM-DD, or null.'),
        periodEnd: nullableString('Last date the document covers, YYYY-MM-DD, or null.'),
        notes: z.string().describe('What you observed, including anything suspicious.'),
      }),
    )
    .describe('One entry per document provided, in the order given.'),
  checks: z
    .array(
      z.object({
        key: z.nativeEnum(AiCheckKey),
        status: z.nativeEnum(AiCheckStatus),
        detail: z.string().describe('The evidence behind the status, citing dates and amounts.'),
      }),
    )
    .describe('Exactly one entry for every check in the checklist.'),
  redFlags: z
    .array(
      z.object({
        category: z.nativeEnum(AiFlagCategory),
        severity: z.nativeEnum(AiFlagSeverity),
        title: z
          .string()
          .describe('A short headline, e.g. "Debit order returned unpaid on 26 Aug".'),
        evidence: z
          .string()
          .describe('Exactly what in which document shows this — dates, amounts, descriptions.'),
        documentId: nullableString('The id of the document the flag comes from, or null.'),
      }),
    )
    .describe('Every red flag found, most serious first. Empty when there are none.'),
  income: z.object({
    verifiedNetMonthlyIncome: nullableAmount(
      'Take-home pay per month in N$ as evidenced by the documents (prefer the salary credit on the statement, confirmed by the payslip). Null when it cannot be established.',
    ),
    payslipNetPay: nullableAmount('Net pay on the latest payslip in N$, or null.'),
    payslipGrossPay: nullableAmount('Gross pay on the latest payslip in N$, or null.'),
    employerOnPayslip: nullableString('Employer name as printed on the payslip, or null.'),
    payDay: nullableString('The usual pay day, e.g. "25th" or "last working day", or null.'),
    salaryCredits: z
      .array(
        z.object({
          date: z.string().describe('YYYY-MM-DD'),
          amount: z.number().describe('N$'),
          description: z.string(),
        }),
      )
      .describe('Each salary credit seen on the statement.'),
  }),
  obligations: z.object({
    otherLenders: z
      .array(
        z.object({
          name: z.string().describe('The lender or creditor as it appears.'),
          monthlyAmount: z.number().describe('Typical monthly repayment in N$.'),
          evidence: z.string().describe('Where it appears, with dates.'),
        }),
      )
      .describe('Active repayments to other lenders or credit providers, one entry per creditor.'),
    failedDebitOrderCount: z
      .number()
      .int()
      .describe('Number of returned or unpaid debit orders on the statement.'),
  }),
  statement: z
    .object({
      bankName: nullableString('Bank, or null.'),
      accountHolder: nullableString('Account holder name, or null.'),
      accountNumber: nullableString('Account number as printed, or null.'),
      accountType: nullableString('Account type as printed, e.g. "Cheque", "Savings", or null.'),
      isTransactionalAccount: z
        .boolean()
        .nullable()
        .describe(
          'True for cheque/current/transmission accounts; false for savings or investment-type accounts; null if unknown.',
        ),
    })
    .describe(
      'The main bank statement (its period is reported under documents). All fields null when there is no statement.',
    ),
});

export type AiReviewOutput = z.infer<typeof aiReviewOutputSchema>;

type JsonSchema = { [key: string]: unknown };

/**
 * Providers cap how many nullable (union-typed) fields a structured-output
 * schema may have — Claude allows 16 in total. Keep {@link aiReviewOutputSchema}
 * under this; a test counts them.
 */
export const AI_REVIEW_MAX_UNION_FIELDS = 16;

/**
 * Derive the JSON Schema for structured output from a Zod schema. Covers the
 * subset {@link aiReviewOutputSchema} uses: objects (all keys required, no
 * extra keys), arrays, strings, numbers/integers, booleans, native enums and
 * nullables. Numeric bounds are left out — not every provider supports them —
 * and enforced by {@link buildAiReviewReport} instead.
 */
export const toJsonSchema = (schema: z.ZodTypeAny): JsonSchema => {
  const describe = (json: JsonSchema): JsonSchema =>
    schema.description ? { ...json, description: schema.description } : json;

  if (schema instanceof z.ZodNullable) {
    return describe({ anyOf: [toJsonSchema(schema.unwrap()), { type: 'null' }] });
  }

  if (schema instanceof z.ZodObject) {
    const shape: Record<string, z.ZodTypeAny> = schema.shape;
    const properties = Object.fromEntries(
      Object.entries(shape).map(([key, value]) => [key, toJsonSchema(value)]),
    );

    return describe({
      type: 'object',
      properties,
      required: Object.keys(shape),
      additionalProperties: false,
    });
  }

  if (schema instanceof z.ZodArray) {
    return describe({ type: 'array', items: toJsonSchema(schema.element) });
  }

  if (schema instanceof z.ZodNativeEnum) {
    const values: unknown[] = Object.values(schema.enum);

    return describe({ type: 'string', enum: values.filter((value) => typeof value === 'string') });
  }

  if (schema instanceof z.ZodString) {
    return describe({ type: 'string' });
  }

  if (schema instanceof z.ZodNumber) {
    return describe({ type: schema.isInt ? 'integer' : 'number' });
  }

  if (schema instanceof z.ZodBoolean) {
    return describe({ type: 'boolean' });
  }

  throw new Error(`toJsonSchema: unsupported schema type ${schema.constructor.name}`);
};

export const AI_REVIEW_OUTPUT_JSON_SCHEMA = toJsonSchema(aiReviewOutputSchema);

// ── The stored report ───────────────────────────────────────────────────────

export interface AiReviewAffordability {
  /** Null when it could not be assessed — see `unassessableReason`. */
  readonly result: AffordabilityResult | null;
  readonly unassessableReason: 'income_unverified' | 'no_instalment' | null;
  readonly ratio: number | null;
  readonly incomeCents: Cents | null;
  readonly otherLendersCents: Cents;
  /** Instalments on this lender's own open loans. */
  readonly internalObligationsCents: Cents;
  readonly instalmentCents: Cents | null;
  readonly disposableIncomeCents: Cents | null;
  /** The largest new instalment that keeps the borrower at or under the 50% rule. */
  readonly maxAffordableInstalmentCents: Cents | null;
}

export interface AiReviewReport {
  readonly summary: string;
  readonly score: number;
  readonly riskLevel: AiRiskLevel;
  /** The final recommendation, after domain rules. */
  readonly recommendation: AiRecommendation;
  /** What the model recommended before any cap. */
  readonly aiRecommendation: AiRecommendation;
  readonly recommendationReason: string;
  /** Why the recommendation was lowered from the model's, when it was. */
  readonly adjustments: readonly string[];
  readonly conditions: readonly string[];
  readonly checks: readonly { key: AiCheckKey; status: AiCheckStatus; detail: string }[];
  readonly redFlags: readonly {
    category: AiFlagCategory;
    severity: AiFlagSeverity;
    title: string;
    evidence: string;
    documentId: string | null;
  }[];
  readonly documents: readonly {
    documentId: string;
    fileName: string | null;
    detectedType: AiDocumentType;
    authenticity: AiAuthenticity;
    periodStart: string | null;
    periodEnd: string | null;
    notes: string;
  }[];
  readonly income: {
    readonly verifiedNetMonthlyCents: Cents | null;
    readonly declaredMonthlyCents: Cents | null;
    readonly payslipNetPayCents: Cents | null;
    readonly payslipGrossPayCents: Cents | null;
    readonly employerOnPayslip: string | null;
    readonly payDay: string | null;
    readonly salaryCredits: readonly { date: string; amountCents: Cents; description: string }[];
  };
  readonly obligations: {
    readonly otherLenders: readonly { name: string; monthlyCents: Cents; evidence: string }[];
    readonly failedDebitOrderCount: number;
  };
  readonly statement: AiReviewOutput['statement'];
  readonly affordability: AiReviewAffordability;
  /** Documents that exist but could not be sent to the model (type or size). */
  readonly skippedDocuments: readonly { fileName: string; reason: string }[];
}

export interface BuildAiReviewReportInput {
  readonly output: AiReviewOutput;
  /** The instalment being assessed (an application's quote); null for a borrower-only review. */
  readonly instalmentCents: Cents | null;
  readonly declaredIncomeCents: Cents | null;
  readonly internalObligationsCents: Cents;
  /** Documents sent to the model, to resolve file names and drop invented ids. */
  readonly documents: readonly { id: string; fileName: string }[];
  readonly skippedDocuments?: readonly { fileName: string; reason: string }[];
}

const positiveCents = (amount: number | null): Cents | null =>
  amount != null && Number.isFinite(amount) && amount > 0 ? toCents(amount) : null;

/** The less favourable of two recommendations. */
const atLeast = (recommendation: AiRecommendation, floor: AiRecommendation): AiRecommendation =>
  AI_RECOMMENDATION_ORDER.indexOf(recommendation) >= AI_RECOMMENDATION_ORDER.indexOf(floor)
    ? recommendation
    : floor;

export const assessAiAffordability = ({
  incomeCents,
  otherLendersCents,
  internalObligationsCents,
  instalmentCents,
}: {
  incomeCents: Cents | null;
  otherLendersCents: Cents;
  internalObligationsCents: Cents;
  instalmentCents: Cents | null;
}): AiReviewAffordability => {
  const existing = otherLendersCents + internalObligationsCents;
  const base = { incomeCents, otherLendersCents, internalObligationsCents, instalmentCents };

  if (incomeCents == null) {
    return {
      ...base,
      result: null,
      unassessableReason: 'income_unverified',
      ratio: null,
      disposableIncomeCents: null,
      maxAffordableInstalmentCents: null,
    };
  }

  const maxAffordableInstalmentCents = Math.max(
    0,
    Math.floor(incomeCents * MAX_PASS_RATIO) - existing,
  );

  if (instalmentCents == null) {
    return {
      ...base,
      result: null,
      unassessableReason: 'no_instalment',
      ratio: Math.round((existing / incomeCents) * 10000) / 10000,
      disposableIncomeCents: incomeCents - existing,
      maxAffordableInstalmentCents,
    };
  }

  const assessment = assessAffordability({
    monthlyIncomeCents: incomeCents,
    existingObligationsCents: existing,
    instalmentCents,
  });

  return {
    ...base,
    result: assessment.result,
    unassessableReason: null,
    ratio: assessment.ratio,
    disposableIncomeCents: assessment.disposableIncomeCents,
    maxAffordableInstalmentCents,
  };
};

/**
 * Turn the model's output into the stored report: convert N$ amounts to cents,
 * resolve document ids, fill any check the model skipped, compute affordability
 * with the domain rule, and cap the recommendation where a hard rule says so.
 */
export const buildAiReviewReport = ({
  output,
  instalmentCents,
  declaredIncomeCents,
  internalObligationsCents,
  documents,
  skippedDocuments = [],
}: BuildAiReviewReportInput): AiReviewReport => {
  const fileNames = new Map(documents.map((document) => [document.id, document.fileName]));
  const knownId = (id: string | null): string | null => (id && fileNames.has(id) ? id : null);

  const otherLenders = output.obligations.otherLenders
    .map((lender) => ({
      name: lender.name,
      monthlyCents: positiveCents(lender.monthlyAmount) ?? 0,
      evidence: lender.evidence,
    }))
    .filter((lender) => lender.name.trim().length > 0);
  const otherLendersCents = otherLenders.reduce((sum, lender) => sum + lender.monthlyCents, 0);
  const verifiedNetMonthlyCents = positiveCents(output.income.verifiedNetMonthlyIncome);

  const affordability = assessAiAffordability({
    incomeCents: verifiedNetMonthlyCents,
    otherLendersCents,
    internalObligationsCents,
    instalmentCents,
  });

  // One entry per check, in catalog order; the first answer wins on duplicates.
  const checks = AI_REVIEW_CHECKS.map((definition) => {
    const answer = output.checks.find((check) => check.key === definition.key);

    return answer
      ? { key: definition.key, status: answer.status, detail: answer.detail }
      : {
          key: definition.key,
          status: AiCheckStatus.NotAssessable,
          detail: 'The AI did not report on this check.',
        };
  });

  const redFlags = output.redFlags.map((flag) => ({
    ...flag,
    documentId: knownId(flag.documentId),
  }));

  // Domain rules the model's recommendation cannot override.
  const adjustments: string[] = [];
  const conditions = [...output.conditions];
  const cap = (floor: AiRecommendation, reason: string, current: AiRecommendation) => {
    const next = atLeast(current, floor);

    if (next !== current) adjustments.push(reason);

    return next;
  };

  const afterAffordability = (() => {
    const start = output.recommendation;

    if (affordability.unassessableReason === 'income_unverified') {
      return cap(
        AiRecommendation.Refer,
        'Take-home pay could not be verified from the documents, so affordability is unconfirmed.',
        start,
      );
    }

    if (affordability.result === AffordabilityResult.Fail) {
      return cap(
        AiRecommendation.Decline,
        'Debt repayments including this instalment would exceed 60% of verified take-home pay.',
        start,
      );
    }

    if (affordability.result === AffordabilityResult.Review) {
      return cap(
        AiRecommendation.Refer,
        'Debt repayments including this instalment would leave the borrower with less than 50% of take-home pay.',
        start,
      );
    }

    return start;
  })();
  const afterFlags = redFlags.some((flag) => flag.severity === AiFlagSeverity.Critical)
    ? cap(AiRecommendation.Refer, 'A critical red flag was raised.', afterAffordability)
    : afterAffordability;
  const recommendation = (() => {
    // A paid-up letter only matters if the loan could still go ahead.
    if (otherLenders.length === 0 || afterFlags === AiRecommendation.Decline) return afterFlags;

    if (!conditions.some((condition) => /paid[\s-]*up/i.test(condition))) {
      conditions.push(
        `Obtain a paid-up letter for each loan with another lender (${otherLenders
          .map((lender) => lender.name)
          .join(', ')}).`,
      );
    }

    return cap(
      AiRecommendation.ApproveWithConditions,
      'Repayments to other lenders were found; a paid-up letter is required.',
      afterFlags,
    );
  })();

  return {
    summary: output.summary,
    score: Math.min(100, Math.max(0, Math.round(output.score))),
    riskLevel: output.riskLevel,
    recommendation,
    aiRecommendation: output.recommendation,
    recommendationReason: output.recommendationReason,
    adjustments,
    conditions,
    checks,
    redFlags,
    documents: output.documents.map((document) => ({
      ...document,
      fileName: fileNames.get(document.documentId) ?? null,
    })),
    income: {
      verifiedNetMonthlyCents,
      declaredMonthlyCents: declaredIncomeCents,
      payslipNetPayCents: positiveCents(output.income.payslipNetPay),
      payslipGrossPayCents: positiveCents(output.income.payslipGrossPay),
      employerOnPayslip: output.income.employerOnPayslip,
      payDay: output.income.payDay,
      salaryCredits: output.income.salaryCredits.map((credit) => ({
        date: credit.date,
        amountCents: toCents(credit.amount),
        description: credit.description,
      })),
    },
    obligations: {
      otherLenders,
      failedDebitOrderCount: Math.max(0, output.obligations.failedDebitOrderCount),
    },
    statement: output.statement,
    affordability,
    skippedDocuments,
  };
};
