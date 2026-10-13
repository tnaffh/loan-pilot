'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { AI_PROVIDERS, AiReviewStatus, can } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { selectClass } from '@/components/form-field';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { AiReviewView } from '@/lib/types';
import { AiReviewReportView } from './ai-review-report';

const POLL_MS = 4000;

const modelLabel = (model: string): string =>
  AI_PROVIDERS.flatMap((provider) => provider.models)
    .find((info) => info.id === model)
    ?.label.split(' — ')[0] ?? model;

const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-NA', { hour: '2-digit', minute: '2-digit' });

interface Props {
  /** `/applications/<id>` or `/borrowers/<id>` — the reviews live under it. */
  basePath: string;
  /** What is reviewed, for the confirmation text ("this application"). */
  subjectLabel: string;
  /** A page card, or a bordered box inside a sheet. */
  variant?: 'card' | 'inset';
}

const Frame = ({ variant, children }: { variant: 'card' | 'inset'; children: React.ReactNode }) =>
  variant === 'card' ? (
    <Card>
      <CardContent>{children}</CardContent>
    </Card>
  ) : (
    <div className="rounded-lg border p-3">{children}</div>
  );

/**
 * AI document review for an application or a borrower. Nothing runs until an
 * officer with `ai:review` clicks the button and confirms — every review is billed
 * by the AI provider. While a review runs (a minute or two) the panel polls.
 */
export const AiReviewPanel = ({ basePath, subjectLabel, variant = 'inset' }: Props) => {
  const { user, token } = useAuth();
  const { data: reviews, loading, refresh } = useApi<AiReviewView[]>(`${basePath}/ai-reviews`);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canRun = Boolean(user && can(user, 'ai:review'));

  const latest = reviews?.[0] ?? null;
  const running = latest?.status === AiReviewStatus.Running;
  const selected =
    reviews?.find((review) => review.id === selectedId) ??
    reviews?.find((review) => review.status !== AiReviewStatus.Running) ??
    null;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(refresh, POLL_MS);

    return () => clearInterval(timer);
  }, [running, refresh]);

  const start = async () => {
    setStarting(true);

    try {
      await apiFetch<AiReviewView>(`${basePath}/ai-reviews`, { method: 'POST', token });
      setSelectedId(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not start the AI review');
    } finally {
      setStarting(false);
      setConfirming(false);
    }
  };

  if (loading && !reviews) {
    return canRun ? <Skeleton className="h-24 w-full rounded-lg" /> : null;
  }

  if (!canRun && (!reviews || reviews.length === 0)) {
    return null;
  }

  return (
    <Frame variant={variant}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-medium">AI document review</span>
          </div>
          {canRun ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirming(true)}
              disabled={running || starting}
            >
              {running || starting ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {running ? 'Reviewing…' : latest ? 'Run again' : 'AI review'}
            </Button>
          ) : null}
        </div>

        {running && latest ? (
          <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
            <span>
              {modelLabel(latest.model)} is reading the documents (started{' '}
              {timeOf(latest.startedAt)} by {latest.requestedByName}). This usually takes one to
              three minutes; you can close this and come back.
            </span>
          </div>
        ) : null}

        {reviews && reviews.length === 0 && canRun ? (
          <p className="text-sm text-muted-foreground">
            Have AI check the uploaded documents for fakes, edits, wrong periods, failed debit
            orders, other lenders and affordability. Runs only when you click — each review is
            billed by the AI provider.
          </p>
        ) : null}

        {reviews &&
        reviews.filter((review) => review.status !== AiReviewStatus.Running).length > 1 ? (
          <select
            className={selectClass}
            value={selected?.id ?? ''}
            onChange={(event) => setSelectedId(event.target.value)}
            aria-label="Review history"
          >
            {reviews
              .filter((review) => review.status !== AiReviewStatus.Running)
              .map((review) => (
                <option key={review.id} value={review.id}>
                  {formatDate(review.startedAt)} {timeOf(review.startedAt)} ·{' '}
                  {review.requestedByName} ·{' '}
                  {review.status === AiReviewStatus.Failed
                    ? 'failed'
                    : `score ${review.score ?? '—'}`}
                </option>
              ))}
          </select>
        ) : null}

        {selected?.status === AiReviewStatus.Completed && selected.report ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {modelLabel(selected.model)} · {formatDate(selected.startedAt)}{' '}
              {timeOf(selected.startedAt)} · requested by {selected.requestedByName} ·{' '}
              {selected.documentCount} document
              {selected.documentCount === 1 ? '' : 's'}
              {selected.costUsd != null ? ` · ≈ US$${selected.costUsd.toFixed(2)}` : ''}
            </p>
            <AiReviewReportView report={selected.report} />
          </div>
        ) : selected?.status === AiReviewStatus.Failed ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              The review on {formatDate(selected.startedAt)} failed:{' '}
              {selected.error ?? 'unknown error'}
            </span>
          </div>
        ) : null}

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Run an AI review?</AlertDialogTitle>
              <AlertDialogDescription>
                The documents on {subjectLabel} are sent to the AI provider set under Settings → AI
                review, and the review is billed to that account. It takes a minute or two.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={starting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={start} disabled={starting}>
                {starting ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Run review
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Frame>
  );
};
