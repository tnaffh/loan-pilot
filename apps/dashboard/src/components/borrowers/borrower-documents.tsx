'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { DocumentKind } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { DocumentRow } from '@/lib/types';

const KIND_LABELS: Record<string, string> = {
  [DocumentKind.ProofOfResidence]: 'Proof of residence',
  [DocumentKind.IdDocument]: 'ID document',
  [DocumentKind.Payslip]: 'Payslip',
  [DocumentKind.BankStatement]: 'Bank statement',
  other: 'Other',
};

const KIND_OPTIONS = [...Object.values(DocumentKind), 'other'];

export const BorrowerDocuments = ({
  borrowerId,
  documents,
  canEdit,
  onChanged,
}: {
  borrowerId: string;
  documents: DocumentRow[];
  canEdit: boolean;
  onChanged: () => void;
}) => {
  const { token } = useAuth();
  const [kind, setKind] = useState<string>(DocumentKind.IdDocument);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <ul className="divide-y">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  {doc.url ? (
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
                    · {KIND_LABELS[doc.kind] ?? doc.kind} · {formatDate(doc.uploadedAt)}
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
        )}

        {canEdit ? (
          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
            <FormField label="Type" htmlFor="doc-kind" className="w-44">
              <Select value={kind} onValueChange={(value) => setKind(value ?? DocumentKind.IdDocument)}>
                <SelectTrigger id="doc-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((value) => (
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
    </Card>
  );
};
