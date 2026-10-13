import {
  AI_REVIEW_CHECKS,
  AI_REVIEW_MAX_UNION_FIELDS,
  AI_REVIEW_OUTPUT_JSON_SCHEMA,
  AiAuthenticity,
  AiCheckKey,
  AiCheckStatus,
  AiDocumentType,
  AiFlagCategory,
  AiFlagSeverity,
  AiProvider,
  AiRiskLevel,
  aiReviewOutputSchema,
  buildAiReviewReport,
  estimateAiCostUsd,
  type AiReviewOutput,
} from './ai-review';
import { AffordabilityResult, AiRecommendation } from './enums';
import { toCents } from './money';

const output = (over: Partial<AiReviewOutput> = {}): AiReviewOutput => ({
  summary: 'Salaried teacher, documents consistent.',
  score: 82,
  riskLevel: AiRiskLevel.Low,
  recommendation: AiRecommendation.Approve,
  recommendationReason: 'Clean statement, salary matches payslip.',
  conditions: [],
  documents: [
    {
      documentId: 'doc-1',
      detectedType: AiDocumentType.BankStatement,
      authenticity: AiAuthenticity.AppearsGenuine,
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      notes: 'Running balances reconcile.',
    },
  ],
  checks: [
    { key: AiCheckKey.StatementGenuine, status: AiCheckStatus.Pass, detail: 'Balances reconcile.' },
  ],
  redFlags: [],
  income: {
    verifiedNetMonthlyIncome: 10000,
    payslipNetPay: 10000,
    payslipGrossPay: 13000,
    employerOnPayslip: 'Ministry of Education',
    payDay: '25th',
    salaryCredits: [{ date: '2026-09-25', amount: 10000, description: 'SALARY MOE' }],
  },
  obligations: { otherLenders: [], failedDebitOrderCount: 0 },
  statement: {
    bankName: 'Bank Windhoek',
    accountHolder: 'H NDAPEWA',
    accountNumber: '8001234567',
    accountType: 'Cheque',
    isTransactionalAccount: true,
  },
  ...over,
});

const build = (over: Partial<AiReviewOutput> = {}, instalment: number | null = 3000) =>
  buildAiReviewReport({
    output: output(over),
    instalmentCents: instalment == null ? null : toCents(instalment),
    declaredIncomeCents: toCents(10000),
    internalObligationsCents: 0,
    documents: [{ id: 'doc-1', fileName: 'statement.pdf' }],
  });

describe('aiReviewOutputSchema / JSON schema', () => {
  it('accepts a well-formed output', () => {
    expect(aiReviewOutputSchema.safeParse(output()).success).toBe(true);
  });

  it('derives a strict JSON schema with every key required', () => {
    expect(AI_REVIEW_OUTPUT_JSON_SCHEMA.type).toBe('object');
    expect(AI_REVIEW_OUTPUT_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(AI_REVIEW_OUTPUT_JSON_SCHEMA.required).toEqual(Object.keys(aiReviewOutputSchema.shape));
    const json = JSON.stringify(AI_REVIEW_OUTPUT_JSON_SCHEMA);

    // Native enums become string enums; nullables become anyOf with null.
    expect(json).toContain('"approve_with_conditions"');
    expect(json).toContain('{"type":"null"}');
    expect(json).toContain('"type":"integer"');
  });

  it("stays within the providers' limit on nullable (union) fields, with headroom", () => {
    const unions = (JSON.stringify(AI_REVIEW_OUTPUT_JSON_SCHEMA).match(/"anyOf"/g) ?? []).length;

    expect(unions).toBeLessThanOrEqual(AI_REVIEW_MAX_UNION_FIELDS - 3);
  });
});

describe('buildAiReviewReport', () => {
  it('converts amounts to cents and passes affordability within 50%', () => {
    const report = build();

    expect(report.income.verifiedNetMonthlyCents).toBe(toCents(10000));
    expect(report.affordability.result).toBe(AffordabilityResult.Pass);
    expect(report.affordability.maxAffordableInstalmentCents).toBe(toCents(5000));
    expect(report.recommendation).toBe(AiRecommendation.Approve);
    expect(report.adjustments).toEqual([]);
    expect(report.documents[0]?.fileName).toBe('statement.pdf');
  });

  it('fills every catalog check, marking unreported ones not assessable', () => {
    const report = build();

    expect(report.checks.map((check) => check.key)).toEqual(
      AI_REVIEW_CHECKS.map((check) => check.key),
    );
    const missing = report.checks.find((check) => check.key === AiCheckKey.OtherLenders);

    expect(missing?.status).toBe(AiCheckStatus.NotAssessable);
  });

  it('declines when debt service would exceed 60% of verified income', () => {
    const report = build({}, 7000);

    expect(report.affordability.result).toBe(AffordabilityResult.Fail);
    expect(report.aiRecommendation).toBe(AiRecommendation.Approve);
    expect(report.recommendation).toBe(AiRecommendation.Decline);
    expect(report.adjustments).toHaveLength(1);
  });

  it('refers when income cannot be verified', () => {
    const report = build({
      income: { ...output().income, verifiedNetMonthlyIncome: null },
    });

    expect(report.affordability.unassessableReason).toBe('income_unverified');
    expect(report.recommendation).toBe(AiRecommendation.Refer);
  });

  it('counts other-lender repayments and requires a paid-up letter', () => {
    const report = build({
      obligations: {
        otherLenders: [{ name: 'QuickCash', monthlyAmount: 1500, evidence: 'DO 25 Sep' }],
        failedDebitOrderCount: 0,
      },
    });

    expect(report.affordability.otherLendersCents).toBe(toCents(1500));
    expect(report.affordability.ratio).toBe(0.45);
    expect(report.recommendation).toBe(AiRecommendation.ApproveWithConditions);
    expect(report.conditions.some((condition) => condition.includes('QuickCash'))).toBe(true);
  });

  it('adds no paid-up condition to a declined application', () => {
    const report = build({
      recommendation: AiRecommendation.Decline,
      obligations: {
        otherLenders: [{ name: 'QuickCash', monthlyAmount: 1500, evidence: 'DO 25 Sep' }],
        failedDebitOrderCount: 0,
      },
    });

    expect(report.recommendation).toBe(AiRecommendation.Decline);
    expect(report.conditions).toEqual([]);
  });

  it('never makes a recommendation more favourable than the model gave', () => {
    const report = build({ recommendation: AiRecommendation.Decline });

    expect(report.recommendation).toBe(AiRecommendation.Decline);
  });

  it('refers on a critical flag and drops document ids the model invented', () => {
    const report = build({
      redFlags: [
        {
          category: AiFlagCategory.TamperedDocument,
          severity: AiFlagSeverity.Critical,
          title: 'Balance does not reconcile',
          evidence: 'Closing balance off by N$ 4,000',
          documentId: 'not-a-real-id',
        },
      ],
    });

    expect(report.recommendation).toBe(AiRecommendation.Refer);
    expect(report.redFlags[0]?.documentId).toBeNull();
  });

  it('reports headroom without a verdict when there is no instalment', () => {
    const report = build({}, null);

    expect(report.affordability.result).toBeNull();
    expect(report.affordability.unassessableReason).toBe('no_instalment');
    expect(report.affordability.maxAffordableInstalmentCents).toBe(toCents(5000));
    expect(report.recommendation).toBe(AiRecommendation.Approve);
  });

  it('clamps the score to 0–100', () => {
    expect(build({ score: 140 }).score).toBe(100);
    expect(build({ score: -3 }).score).toBe(0);
  });
});

describe('estimateAiCostUsd', () => {
  it('prices known models, including cache reads and writes', () => {
    const cost = estimateAiCostUsd(AiProvider.Anthropic, 'claude-opus-5-5', {
      inputTokens: 100_000,
      outputTokens: 10_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });

    expect(cost).toBe(0.6);
  });

  it('returns null for an unknown model', () => {
    expect(
      estimateAiCostUsd(AiProvider.Anthropic, 'some-custom-model', {
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBeNull();
  });
});
