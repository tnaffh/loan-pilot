'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, FolderInput, Loader2, Upload, X } from 'lucide-react';
import {
  DocumentKind,
  MAX_FILES_PER_DOCUMENT_SLOT,
  SUPPORTING_DOCUMENT_KINDS,
  can,
  documentKindLabel,
  isSupportingDocumentKind,
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
import { selectClass } from '@/components/form-field';
import { ApiError, apiFetch, uploadDocument } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ApplicationDocument, ProfileDocumentOption } from '@/lib/types';

const KIND_ORDER: readonly string[] = SUPPORTING_DOCUMENT_KINDS;

const kindRank = (kind: string): number => {
  const index = KIND_ORDER.indexOf(kind);

  return index === -1 ? KIND_ORDER.length : index;
};

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

interface Props {
  applicationId: string;
  documents: ApplicationDocument[];
  /** The applicant has a borrower profile whose files can be attached. */
  hasProfile: boolean;
  onChanged: () => void;
}

/**
 * An application's documents, with what an officer needs to fix them before a
 * decision or an AI review: add files (several at once — e.g. a statement sent
 * as one PDF per month), bring in files already on the borrower's profile,
 * correct a mislabelled document's type, and remove one.
 */
export const ApplicationDocuments = ({
  applicationId,
  documents,
  hasProfile,
  onChanged,
}: Props) => {
  const { user, token } = useAuth();
  const canEdit = Boolean(user && can(user, 'applications:write'));
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadKind, setUploadKind] = useState<DocumentKind>(DocumentKind.BankStatement);
  const [busy, setBusy] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const base = `/applications/${applicationId}/documents`;

  const sorted = [...documents].sort(
    (a, b) => kindRank(a.kind) - kindRank(b.kind) || a.uploadedAt.localeCompare(b.uploadedAt),
  );

  const upload = async (files: File[]) => {
    if (files.length === 0) return;

    if (files.length > MAX_FILES_PER_DOCUMENT_SLOT) {
      toast.error(`Upload at most ${MAX_FILES_PER_DOCUMENT_SLOT} files at a time.`);

      return;
    }

    setBusy('upload');
    const results = await Promise.allSettled(
      files.map((file) =>
        uploadDocument(base, { kind: uploadKind, file }, { tenant: user?.tenantSlug }),
      ),
    );
    const failed = results.filter((result) => result.status === 'rejected');

    if (failed.length > 0) {
      const first = failed[0];

      toast.error(
        first?.status === 'rejected'
          ? errorMessage(first.reason, 'Upload failed')
          : `${failed.length} file(s) failed to upload`,
      );
    } else {
      toast.success(
        `${files.length} ${documentKindLabel(uploadKind).toLowerCase()} file${files.length === 1 ? '' : 's'} added`,
      );
    }

    setBusy(null);
    onChanged();
  };

  const changeKind = async (document: ApplicationDocument, kind: string) => {
    setBusy(document.id);

    try {
      await apiFetch(`${base}/${document.id}`, { method: 'PATCH', body: { kind }, token });
      toast.success(`Marked as ${documentKindLabel(kind).toLowerCase()}`);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not change the document type'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (document: ApplicationDocument) => {
    setBusy(document.id);

    try {
      await apiFetch(`${base}/${document.id}`, { method: 'DELETE', token });
      toast.success(`${document.fileName} removed from the application`);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not remove the document'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">Documents</div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {hasProfile ? (
              <Button size="sm" variant="ghost" onClick={() => setAttachOpen(true)}>
                <FolderInput /> Attach from profile
              </Button>
            ) : null}
            <select
              className={cn(selectClass, 'h-8 w-auto py-0 text-xs')}
              value={uploadKind}
              onChange={(event) => {
                const kind = SUPPORTING_DOCUMENT_KINDS.find((item) => item === event.target.value);

                if (kind) setUploadKind(kind);
              }}
              aria-label="Type of the files to upload"
            >
              {SUPPORTING_DOCUMENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {documentKindLabel(kind)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInput.current?.click()}
              disabled={busy === 'upload'}
            >
              {busy === 'upload' ? <Loader2 className="animate-spin" /> : <Upload />}
              Upload
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);

                event.target.value = '';
                void upload(files);
              }}
            />
          </div>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents uploaded.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {sorted.map((document) => {
            const editable = canEdit && isSupportingDocumentKind(document.kind);

            return (
              <li key={document.id} className="flex items-center gap-2 px-2.5 py-1.5">
                {editable ? (
                  <select
                    className={cn(selectClass, 'h-7 w-36 shrink-0 py-0 text-xs')}
                    value={document.kind}
                    disabled={busy === document.id}
                    onChange={(event) => void changeKind(document, event.target.value)}
                    aria-label={`Type of ${document.fileName}`}
                  >
                    {SUPPORTING_DOCUMENT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {documentKindLabel(kind)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="w-36 shrink-0 text-xs text-muted-foreground">
                    {documentKindLabel(document.kind)}
                  </span>
                )}
                {document.url ? (
                  <a
                    href={document.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-1 font-medium hover:underline"
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="truncate">{document.fileName}</span>
                  </a>
                ) : (
                  <span
                    className="flex min-w-0 flex-1 items-center gap-1 text-muted-foreground"
                    title="This file is temporarily unavailable"
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="truncate">{document.fileName}</span>
                  </span>
                )}
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {formatDate(document.uploadedAt)}
                </span>
                {editable ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    aria-label={`Remove ${document.fileName}`}
                    disabled={busy === document.id}
                    onClick={() => void remove(document)}
                  >
                    {busy === document.id ? <Loader2 className="animate-spin" /> : <X />}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {hasProfile && canEdit ? (
        <AttachFromProfileDialog
          applicationId={applicationId}
          open={attachOpen}
          onOpenChange={setAttachOpen}
          onAttached={onChanged}
        />
      ) : null}
    </div>
  );
};

/** Pick documents already on the borrower's profile to attach to this application. */
const AttachFromProfileDialog = ({
  applicationId,
  open,
  onOpenChange,
  onAttached,
}: {
  applicationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttached: () => void;
}) => {
  const { token } = useAuth();
  const base = `/applications/${applicationId}/documents`;
  const {
    data: options,
    error,
    refresh,
  } = useApi<ProfileDocumentOption[]>(open ? `${base}/profile` : null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const close = () => {
    setChosen(new Set());
    onOpenChange(false);
  };

  const toggle = (id: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);

      if (on) next.add(id);
      else next.delete(id);

      return next;
    });

  const attach = async () => {
    setSaving(true);

    try {
      const result = await apiFetch<{ attached: number }>(`${base}/attach`, {
        method: 'POST',
        body: { documentIds: [...chosen] },
        token,
      });

      toast.success(`${result.attached} document${result.attached === 1 ? '' : 's'} attached`);
      refresh();
      onAttached();
      close();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not attach the documents'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Attach from the borrower&apos;s profile</DialogTitle>
          <DialogDescription>
            Use files already on this applicant&apos;s profile — for example a statement they sent
            later. The file is shared, not copied, and won&apos;t appear twice on the profile.
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
            There are no ID, payslip, statement or residence documents on the profile.
          </p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border text-sm">
            {options.map((option) => (
              <li key={option.id}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2">
                  <Checkbox
                    checked={option.attached || chosen.has(option.id)}
                    disabled={option.attached}
                    onCheckedChange={(checked) => toggle(option.id, checked === true)}
                  />
                  <span className="w-32 shrink-0 text-xs text-muted-foreground">
                    {documentKindLabel(option.kind)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.fileName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {option.attached ? 'Attached' : formatDate(option.uploadedAt)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void attach()} disabled={saving || chosen.size === 0}>
            {saving ? <Loader2 className="animate-spin" /> : <FolderInput />}
            Attach {chosen.size > 0 ? chosen.size : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
