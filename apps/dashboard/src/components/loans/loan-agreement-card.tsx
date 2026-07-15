'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileSignature, Loader2, Mail, RefreshCw, Upload } from 'lucide-react';
import { can, type SessionUser } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, apiFetch, uploadDocument } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface AgreementView {
  id: string;
  kind: string;
  url: string | null;
  fileName: string;
  uploadedAt: string;
}

interface Props {
  loanId: string;
  user: SessionUser | null;
  token: string | null;
  /** Whether the loan carries a captured signature; drives the wet-sign hint. */
  hasSignature: boolean;
}

export const LoanAgreementCard = ({ loanId, user, token, hasSignature }: Props) => {
  const canRead = Boolean(user && can(user, 'agreements:read'));
  const canGenerate = Boolean(user && can(user, 'agreements:generate'));
  const [agreement, setAgreement] = useState<AgreementView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'generate' | 'email' | 'upload' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const latest = await apiFetch<AgreementView>(`/loans/${loanId}/agreement`, { token });
      setAgreement(latest);
    } catch (error) {
      // 404 simply means no agreement has been generated yet.
      if (!(error instanceof ApiError) || error.status !== 404) {
        toast.error(error instanceof ApiError ? error.message : 'Could not load the agreement');
      }
      setAgreement(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canRead) return;
    // A const guard (not `let`, per project convention) to ignore a late
    // response after the loan changed or the card unmounted.
    const state = { active: true };
    void (async () => {
      try {
        const latest = await apiFetch<AgreementView>(`/loans/${loanId}/agreement`, { token });
        if (state.active) setAgreement(latest);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) {
          toast.error(error instanceof ApiError ? error.message : 'Could not load the agreement');
        }
        if (state.active) setAgreement(null);
      } finally {
        if (state.active) setLoading(false);
      }
    })();
    return () => {
      state.active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanId, canRead]);

  if (!canRead) return null;

  const generate = async () => {
    setBusy('generate');
    try {
      const view = await apiFetch<AgreementView>(`/loans/${loanId}/agreement`, {
        method: 'POST',
        body: {},
        token,
      });
      setAgreement(view);
      toast.success('Agreement generated');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not generate the agreement');
    } finally {
      setBusy(null);
    }
  };

  const email = async () => {
    setBusy('email');
    try {
      await apiFetch(`/loans/${loanId}/agreement/email`, { method: 'POST', body: {}, token });
      toast.success('A copy was emailed to the borrower');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not email the agreement');
    } finally {
      setBusy(null);
    }
  };

  const uploadScan = async (file: File) => {
    setBusy('upload');
    try {
      await uploadDocument(
        `/loans/${loanId}/agreement/upload`,
        { kind: 'loan_agreement', file },
        { token },
      );
      toast.success('Signed agreement uploaded');
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not upload the scan');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="size-4 text-muted-foreground" /> Signed agreement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : agreement ? (
          <div className="flex items-center justify-between gap-2 rounded-md border p-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{agreement.fileName}</div>
              <div className="text-xs text-muted-foreground">
                Generated {formatDate(agreement.uploadedAt)}
              </div>
            </div>
            {agreement.url ? (
              <Button
                size="sm"
                variant="outline"
                render={<a href={agreement.url} target="_blank" rel="noreferrer" />}
              >
                <Download className="size-4" /> Download
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No agreement has been generated for this loan yet.
            {!hasSignature
              ? ' This loan has no captured signature — generate a copy to sign by hand, then upload the scan.'
              : ''}
          </p>
        )}

        {canGenerate ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={generate} disabled={busy !== null}>
              {busy === 'generate' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {agreement ? 'Regenerate' : 'Generate'}
            </Button>
            {agreement ? (
              <Button size="sm" variant="outline" onClick={email} disabled={busy !== null}>
                {busy === 'email' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mail className="size-4" />
                )}
                Email copy to borrower
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInput.current?.click()}
              disabled={busy !== null}
            >
              {busy === 'upload' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Upload signed scan
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadScan(file);
                event.target.value = '';
              }}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
