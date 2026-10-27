'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import {
  AI_REVIEW_MAX_DOCUMENTS,
  AI_REVIEW_MAX_NOTES,
  documentKindLabel,
  type AiReviewDocumentOption,
} from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';

const SOURCE_HEADINGS: Record<AiReviewDocumentOption['source'], string> = {
  application: 'On the application',
  profile: "On the borrower's profile",
};

interface Props {
  basePath: string;
  subjectLabel: string;
  open: boolean;
  starting: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (choice: { documentIds: string[]; notes: string }) => void;
}

/**
 * Confirm an AI review: choose exactly which documents it reads (the defaults
 * are ticked — e.g. untick a wrong statement and tick the right one from the
 * profile) and add notes the AI should know. Every review is billed.
 */
export const StartReviewDialog = ({
  basePath,
  subjectLabel,
  open,
  starting,
  onOpenChange,
  onStart,
}: Props) => {
  const { data: options, error } = useApi<AiReviewDocumentOption[]>(
    open ? `${basePath}/ai-review-documents` : null,
  );
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [seeded, setSeeded] = useState<AiReviewDocumentOption[] | null>(null);
  const [notes, setNotes] = useState('');

  // Start from the default selection each time the documents load.
  if (options && options !== seeded) {
    setSeeded(options);
    setChosen(new Set(options.filter((option) => option.selected).map((option) => option.id)));
  }

  const close = () => {
    setSeeded(null);
    setNotes('');
    onOpenChange(false);
  };

  const toggle = (id: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);

      if (on) next.add(id);
      else next.delete(id);

      return next;
    });

  const groups = (['application', 'profile'] as const)
    .map((source) => ({
      source,
      items: (options ?? []).filter((option) => option.source === source),
    }))
    .filter((group) => group.items.length > 0);
  const tooMany = chosen.size > AI_REVIEW_MAX_DOCUMENTS;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Run an AI review</DialogTitle>
          <DialogDescription>
            Choose the documents for {subjectLabel}. They are sent to the AI provider set under
            Settings → AI review, and the review is billed to that account. It takes a minute or
            two.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !options ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There are no documents to review yet. Upload or attach them first.
          </p>
        ) : (
          <div className="max-h-72 space-y-3 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.source} className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">
                  {SOURCE_HEADINGS[group.source]}
                </div>
                <ul className="divide-y rounded-lg border text-sm">
                  {group.items.map((option) => (
                    <li key={option.id}>
                      <label
                        className="flex cursor-pointer items-center gap-2.5 px-3 py-2"
                        title={option.unsupported ?? undefined}
                      >
                        <Checkbox
                          checked={chosen.has(option.id)}
                          disabled={Boolean(option.unsupported)}
                          onCheckedChange={(checked) => toggle(option.id, checked === true)}
                        />
                        <span className="w-32 shrink-0 text-xs text-muted-foreground">
                          {documentKindLabel(option.kind)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{option.fileName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {option.unsupported ? "Can't be read" : formatDate(option.uploadedAt)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="ai-review-notes" className="text-sm font-medium">
            Notes for the AI <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="ai-review-notes"
            rows={3}
            maxLength={AI_REVIEW_MAX_NOTES}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="e.g. The statement came later via WhatsApp in three parts. The file labelled bank statement on the application is actually a payslip."
          />
          <p className="text-xs text-muted-foreground">
            Treated as information from your staff. It is saved with the review.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={starting}>
            Cancel
          </Button>
          <Button
            onClick={() => onStart({ documentIds: [...chosen], notes: notes.trim() })}
            disabled={starting || chosen.size === 0 || tooMany}
            title={tooMany ? `Choose at most ${AI_REVIEW_MAX_DOCUMENTS} documents` : undefined}
          >
            {starting ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Review {chosen.size} document{chosen.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
