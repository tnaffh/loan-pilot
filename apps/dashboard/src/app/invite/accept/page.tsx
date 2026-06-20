'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';
import { SetPasswordForm } from '@/components/auth/set-password-form';
import { acceptInvite, fetchInvite, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const Accept = () => {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession } = useAuth();
  const token = params.get('token') ?? '';
  const [invite, setInvite] = useState<{ email: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(
    token ? null : 'This invitation link is missing its token.',
  );

  useEffect(() => {
    if (!token) return;
    fetchInvite(token)
      .then(setInvite)
      .catch(() => setError('This invitation is invalid or has expired.'));
  }, [token]);

  const onSubmit = async (password: string) => {
    try {
      const { accessToken, user } = await acceptInvite(token, password);
      setSession(accessToken, user);
      toast.success('Account activated');
      router.replace('/');
    } catch (submitError) {
      toast.error(submitError instanceof ApiError ? submitError.message : 'Something went wrong');
    }
  };

  if (error) {
    return (
      <AuthShell
        title="Invitation unavailable"
        subtitle={error}
        footer={
          <Link href="/login" className="text-xs text-muted-foreground hover:underline">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">Ask an administrator to send a new invite.</p>
      </AuthShell>
    );
  }

  if (!invite) {
    return (
      <AuthShell title="Accept your invitation">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Welcome, ${invite.name}`}
      subtitle={`Set a password to activate ${invite.email}.`}
    >
      <SetPasswordForm submitLabel="Activate account" onSubmit={onSubmit} />
    </AuthShell>
  );
};

const InviteAcceptPage = () => (
  <Suspense fallback={null}>
    <Accept />
  </Suspense>
);

export default InviteAcceptPage;
