'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { DocumentKind } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField } from '@/components/form-field';
import { ApiError, apiFetch, uploadDocument } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DocumentRow } from '@/lib/types';

const KIND_LABELS: Record<string, string> = {
  [DocumentKind.ProofOfResidence]: 'Proof of residence',
  [DocumentKind.IdDocument]: 'ID document',
  [DocumentKind.Payslip]: 'Payslip',
  [DocumentKind.BankStatement]: 'Bank statement',
  [DocumentKind.Signature]: 'Signature',
  [DocumentKind.LoanAgreement]: 'Loan agreement',
  other: 'Other',
};

const KIND_OPTIONS = [...Object.values(DocumentKind), 'other'];

// Kinds a user may manually upload here. The captured signature and generated
// loan agreement are produced by the system, not hand-uploaded, so they are
// excluded from the picker (agreements are managed on the loan page).
const UPLOAD_KINDS = KIND_OPTIONS.filter(
  (kind) => kind !== DocumentKind.Signature && kind !== DocumentKind.LoanAgreement,
);

/** The standard documents a complete borrower file should hold. */
const REQUIRED_KINDS = [
  DocumentKind.IdDocument,
  DocumentKind.ProofOfResidence,
  DocumentKind.Payslip,
  DocumentKind.BankStatement,
];

const extensionOf = (fileName: string): string =>
  fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();

const isImage = (fileName: string): boolean =>
  ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extensionOf(fileName));

const isPdf = (fileName: string): boolean => extensionOf(fileName) === 'pdf';

/** Previewable in the dialog (images and PDFs) once we have a signed URL. */
const canPreview = (doc: DocumentRow): boolean =>
  Boolean(doc.url) && (isImage(doc.fileName) || isPdf(doc.fileName));

/** Group documents by kind, ordered by {@link KIND_OPTIONS} with unknown kinds last. */
const groupByKind = (documents: DocumentRow[]): { kind: string; docs: DocumentRow[] }[] => {
  const byKind = new Map<string, DocumentRow[]>();
  for (const doc of documents) {
    const list = byKind.get(doc.kind) ?? [];
    list.push(doc);
    byKind.set(doc.kind, list);
  }
  const ordered: { kind: string; docs: DocumentRow[] }[] = [];
  for (const kind of KIND_OPTIONS) {
    const docs = byKind.get(kind);
    if (docs) {
      ordered.push({ kind, docs });
      byKind.delete(kind);
    }
  }
  for (const [kind, docs] of byKind) {
    ordered.push({ kind, docs });
  }
  return ordered;
};

export const BorrowerDocuments = ({
  borrowerId,
  documents,
  canEdit,
  onChanged,
  title = 'Documents',
}: {
  borrowerId: string;
  documents: DocumentRow[];
  canEdit: boolean;
  onChanged: () => void;
  title?: string;
}) => {
  const { token } = useAuth();
  const [kind, setKind] = useState<string>(DocumentKind.IdDocument);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocumentRow | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocument(`/borrowers/${borrowerId}/documents`, { kind, file }, { token });
      toast.success('Document uploaded');
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (id: string) => {
    setRemoving(id);
    try {
      await apiFetch(`/borrowers/${borrowerId}/documents/${id}`, { method: 'DELETE', token });
      toast.success('Document removed');
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setRemoving(null);
    }
  };

  const presentKinds = new Set(documents.map((doc) => doc.kind));
  const groups = groupByKind(documents);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {REQUIRED_KINDS.map((requiredKind) => {
            const present = presentKinds.has(requiredKind);
            return (
              <span
                key={requiredKind}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                  present
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'border-dashed text-muted-foreground',
                )}
                title={present ? 'On file' : 'Not uploaded yet'}
              >
                {present ? <Check className="size-3" /> : null}
                {KIND_LABELS[requiredKind]}
              </span>
            );
          })}
        </div>

        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.kind}>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  {KIND_LABELS[group.kind] ?? group.kind}
                </div>
                <ul className="divide-y">
                  {group.docs.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        {canPreview(doc) ? (
                          <button
                            type="button"
                            onClick={() => setPreview(doc)}
                            className="truncate text-left font-medium hover:underline"
                          >
                            {doc.fileName}
                          </button>
                        ) : doc.url ? (
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate font-medium hover:underline"
                          >
                            {doc.fileName}
                          </a>
                        ) : (
                          <span
                            className="truncate font-medium text-muted-foreground"
                            title="This file is temporarily unavailable"
                          >
                            {doc.fileName}
                          </span>
                        )}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          · {formatDate(doc.uploadedAt)}
                        </span>
                      </div>
                      {canEdit ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive"
                          title="Remove"
                          disabled={removing === doc.id}
                          onClick={() => remove(doc.id)}
                        >
                          {removing === doc.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {canEdit ? (
          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
            <FormField label="Type" htmlFor="doc-kind" className="w-44">
              <Select value={kind} onValueChange={(value) => setKind(value ?? DocumentKind.IdDocument)}>
                <SelectTrigger id="doc-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UPLOAD_KINDS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {KIND_LABELS[value] ?? value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0])}
            />
            <Button variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Upload (PDF, JPG, PNG)
            </Button>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={preview !== null} onOpenChange={(open) => (open ? null : setPreview(null))}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{preview?.fileName}</DialogTitle>
          </DialogHeader>
          {preview?.url ? (
            <div className="space-y-2">
              {isImage(preview.fileName) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt={preview.fileName}
                  className="max-h-[70vh] w-full rounded-md object-contain"
                />
              ) : (
                <iframe
                  src={preview.url}
                  title={preview.fileName}
                  className="h-[70vh] w-full rounded-md border"
                />
              )}
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-sm text-muted-foreground hover:underline"
              >
                Open in new tab
              </a>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
