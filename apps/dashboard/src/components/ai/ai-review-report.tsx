'use client';

import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  FileText,
  Info,
  ListChecks,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  AI_FLAG_CATEGORY_LABELS,
  AI_RECOMMENDATION_LABELS,
  AI_REVIEW_CHECKS,
  AiAuthenticity,
  AiCheckStatus,
  AiFlagSeverity,
  AiRecommendation,
  AiRiskLevel,
  formatNad,
  type AiReviewReport,
} from '@loan-pilot/domain';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { Kv } from '@/components/kv';
import { cn } from '@/lib/utils';

type Tone = 'green' | 'amber' | 'red' | 'zinc';

const TONE: Record<Tone, string> = {
  green: 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400',
  red: 'border-transparent bg-red-500/10 text-red-700 dark:text-red-400',
  zinc: 'border-transparent bg-muted text-muted-foreground',
};

const RECOMMENDATION_TONE: Record<AiRecommendation, Tone> = {
  [AiRecommendation.Approve]: 'green',
  [AiRecommendation.ApproveWithConditions]: 'amber',
  [AiRecommendation.Refer]: 'amber',
  [AiRecommendation.Decline]: 'red',
};

const RISK: Record<AiRiskLevel, { label: string; tone: Tone }> = {
  [AiRiskLevel.Low]: { label: 'Low risk', tone: 'green' },
  [AiRiskLevel.Medium]: { label: 'Medium risk', tone: 'amber' },
  [AiRiskLevel.High]: { label: 'High risk', tone: 'red' },
  [AiRiskLevel.VeryHigh]: { label: 'Very high risk', tone: 'red' },
};

const SEVERITY: Record<AiFlagSeverity, { label: string; tone: Tone; border: string }> = {
  [AiFlagSeverity.Critical]: { label: 'Critical', tone: 'red', border: 'border-l-red-600' },
  [AiFlagSeverity.High]: { label: 'High', tone: 'red', border: 'border-l-red-400' },
  [AiFlagSeverity.Medium]: { label: 'Medium', tone: 'amber', border: 'border-l-amber-400' },
  [AiFlagSeverity.Low]: { label: 'Low', tone: 'zinc', border: 'border-l-border' },
};

const CHECK: Record<AiCheckStatus, { icon: LucideIcon; className: string; label: string }> = {
  [AiCheckStatus.Pass]: { icon: CheckCircle2, className: 'text-emerald-600', label: 'Pass' },
  [AiCheckStatus.Warning]: { icon: AlertTriangle, className: 'text-amber-600', label: 'Warning' },
  [AiCheckStatus.Fail]: { icon: XCircle, className: 'text-red-600', label: 'Fail' },
  [AiCheckStatus.NotAssessable]: {
    icon: CircleHelp,
    className: 'text-muted-foreground',
    label: 'Not assessable',
  },
};

const AUTHENTICITY: Record<AiAuthenticity, { label: string; tone: Tone }> = {
  [AiAuthenticity.AppearsGenuine]: { label: 'Appears genuine', tone: 'green' },
  [AiAuthenticity.Suspicious]: { label: 'Suspicious', tone: 'amber' },
  [AiAuthenticity.LikelyFakeOrTampered]: { label: 'Likely fake / edited', tone: 'red' },
  [AiAuthenticity.CannotDetermine]: { label: 'Cannot tell', tone: 'zinc' },
};

const SEVERITY_ORDER: readonly AiFlagSeverity[] = [
  AiFlagSeverity.Critical,
  AiFlagSeverity.High,
  AiFlagSeverity.Medium,
  AiFlagSeverity.Low,
];

const scoreTone = (score: number): string =>
  score >= 80
    ? 'text-emerald-600 dark:text-emerald-400'
    : score >= 60
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400';

const money = (cents: number | null): string => (cents == null ? '—' : formatNad(cents));

const humanize = (value: string): string => value.replace(/_/g, ' ');

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h4>
    {children}
  </section>
);

export const RecommendationBadge = ({ value }: { value: AiRecommendation }) => (
  <Badge className={TONE[RECOMMENDATION_TONE[value]]}>{AI_RECOMMENDATION_LABELS[value]}</Badge>
);

/** The full AI review report: verdict, affordability, red flags, checklist, documents. */
export const AiReviewReportView = ({ report }: { report: AiReviewReport }) => {
  const flags = [...report.redFlags].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  const fileName = (documentId: string | null): string | null =>
    report.documents.find((document) => document.documentId === documentId)?.fileName ?? null;
  const { affordability, income, obligations } = report;

  return (
    <div className="space-y-5">
      {/* Verdict */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border p-3">
        <div className="text-center">
          <div className={cn('text-3xl font-semibold tabular-nums', scoreTone(report.score))}>
            {report.score}
          </div>
          <div className="text-[11px] text-muted-foreground">of 100</div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <RecommendationBadge value={report.recommendation} />
            <Badge className={TONE[RISK[report.riskLevel].tone]}>
              {RISK[report.riskLevel].label}
            </Badge>
          </div>
          <p className="text-sm">{report.recommendationReason}</p>
        </div>
      </div>

      {report.adjustments.length > 0 ? (
        <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            The AI suggested{' '}
            <span className="font-medium">{AI_RECOMMENDATION_LABELS[report.aiRecommendation]}</span>
            ; lending rules lowered this because:
            <ul className="mt-1 list-disc pl-4">
              {report.adjustments.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <p className="text-sm leading-relaxed">{report.summary}</p>

      {report.conditions.length > 0 ? (
        <Section title="Conditions before approval">
          <ul className="space-y-1 text-sm">
            {report.conditions.map((condition) => (
              <li key={condition} className="flex gap-2">
                <ListChecks className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {condition}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Affordability — computed by LoanPilot from the figures the AI extracted. */}
      <Section title="Affordability">
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {affordability.result ? (
              <StatusBadge value={affordability.result} />
            ) : (
              <Badge className={TONE.zinc}>
                {affordability.unassessableReason === 'no_instalment'
                  ? 'No loan to assess'
                  : 'Income not verified'}
              </Badge>
            )}
            {affordability.ratio != null ? (
              <span className="text-muted-foreground">
                Debt repayments {affordability.result ? 'incl. this loan' : 'today'} take{' '}
                <span className="font-medium text-foreground">
                  {Math.round(affordability.ratio * 100)}%
                </span>{' '}
                of take-home pay (limit 50%)
              </span>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kv label="Verified take-home" value={money(income.verifiedNetMonthlyCents)} />
            <Kv label="Declared income" value={money(income.declaredMonthlyCents)} />
            <Kv label="Payslip net pay" value={money(income.payslipNetPayCents)} />
            <Kv label="Other lenders / month" value={money(affordability.otherLendersCents)} />
            <Kv
              label="Our open loans / month"
              value={money(affordability.internalObligationsCents)}
            />
            <Kv label="This instalment" value={money(affordability.instalmentCents)} />
            <Kv label="Left after debts" value={money(affordability.disposableIncomeCents)} />
            <Kv
              label="Max affordable instalment"
              value={money(affordability.maxAffordableInstalmentCents)}
            />
            <Kv label="Pay day" value={income.payDay ?? '—'} />
          </dl>
          {obligations.otherLenders.length > 0 ? (
            <div className="text-sm">
              <div className="mb-1 text-xs text-muted-foreground">Repayments to other lenders</div>
              <ul className="space-y-1">
                {obligations.otherLenders.map((lender) => (
                  <li
                    key={`${lender.name}-${lender.evidence}`}
                    className="flex justify-between gap-3"
                  >
                    <span>
                      <span className="font-medium">{lender.name}</span>{' '}
                      <span className="text-muted-foreground">— {lender.evidence}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatNad(lender.monthlyCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {income.salaryCredits.length > 0 ? (
            <div className="text-sm">
              <div className="mb-1 text-xs text-muted-foreground">
                Salary credits on the statement
              </div>
              <ul className="space-y-0.5">
                {income.salaryCredits.map((credit) => (
                  <li
                    key={`${credit.date}-${credit.amountCents}`}
                    className="flex justify-between gap-3"
                  >
                    <span className="truncate text-muted-foreground">
                      {credit.date} · {credit.description}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatNad(credit.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Section>

      <Section title={`Red flags (${flags.length})`}>
        {flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">None found.</p>
        ) : (
          <ul className="space-y-2">
            {flags.map((flag) => (
              <li
                key={`${flag.title}-${flag.evidence}`}
                className={cn(
                  'rounded-md border border-l-4 p-2.5 text-sm',
                  SEVERITY[flag.severity].border,
                )}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {flag.severity === AiFlagSeverity.Critical ? (
                    <AlertOctagon className="size-4 text-red-600" />
                  ) : null}
                  <span className="font-medium">{flag.title}</span>
                  <Badge className={TONE[SEVERITY[flag.severity].tone]}>
                    {SEVERITY[flag.severity].label}
                  </Badge>
                  <Badge variant="outline">{AI_FLAG_CATEGORY_LABELS[flag.category]}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{flag.evidence}</p>
                {fileName(flag.documentId) ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="size-3" /> {fileName(flag.documentId)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Checklist">
        <ul className="divide-y rounded-lg border">
          {report.checks.map((check) => {
            const meta = CHECK[check.status];
            const Icon = meta.icon;
            const label = AI_REVIEW_CHECKS.find((item) => item.key === check.key);

            return (
              <li key={check.key} className="flex gap-2.5 p-2.5 text-sm">
                <Icon
                  className={cn('mt-0.5 size-4 shrink-0', meta.className)}
                  aria-label={meta.label}
                />
                <div className="min-w-0">
                  <div className="font-medium" title={label?.guidance}>
                    {label?.label ?? humanize(check.key)}
                  </div>
                  <p className="text-muted-foreground">{check.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Documents reviewed">
        <ul className="space-y-2">
          {report.documents.map((document) => (
            <li key={document.documentId} className="rounded-md border p-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <FileText className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{document.fileName ?? 'Document'}</span>
                <Badge variant="outline" className="capitalize">
                  {humanize(document.detectedType)}
                </Badge>
                <Badge className={TONE[AUTHENTICITY[document.authenticity].tone]}>
                  {AUTHENTICITY[document.authenticity].label}
                </Badge>
              </div>
              {document.periodStart || document.periodEnd ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Covers {document.periodStart ?? '?'} to {document.periodEnd ?? '?'}
                </p>
              ) : null}
              {document.notes ? (
                <p className="mt-1 text-muted-foreground">{document.notes}</p>
              ) : null}
            </li>
          ))}
        </ul>
        {report.skippedDocuments.length > 0 ? (
          <div className="text-xs text-muted-foreground">
            Not reviewed:{' '}
            {report.skippedDocuments
              .map((skipped) => `${skipped.fileName} (${skipped.reason})`)
              .join('; ')}
          </div>
        ) : null}
      </Section>

      {report.statement.accountType || report.statement.accountNumber ? (
        <Section title="Bank statement">
          <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-3">
            <Kv label="Bank" value={report.statement.bankName ?? '—'} />
            <Kv label="Account holder" value={report.statement.accountHolder ?? '—'} />
            <Kv label="Account number" value={report.statement.accountNumber ?? '—'} />
            <Kv label="Account type" value={report.statement.accountType ?? '—'} />
            <Kv
              label="Debit orders possible"
              value={
                report.statement.isTransactionalAccount == null
                  ? 'Unknown'
                  : report.statement.isTransactionalAccount
                    ? 'Yes'
                    : 'No — not a transactional account'
              }
            />
            <Kv label="Failed debit orders" value={String(obligations.failedDebitOrderCount)} />
          </dl>
        </Section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        AI-generated assessment. Affordability is calculated by LoanPilot from the figures the AI
        read. Confirm the findings against the documents before deciding.
      </p>
    </div>
  );
};
