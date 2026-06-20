'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';
import { SetPasswordForm } from '@/components/auth/set-password-form';
import { fetchReset, resetPassword, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const Reset = () => {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession } = useAuth();
  const token = params.get('token') ?? '';
  const [valid, setValid] = useState<boolean | null>(token ? null : false);

  useEffect(() => {
    if (!token) return;
    fetchReset(token)
      .then(() => setValid(true))
      .catch(() => setValid(false));
  }, [token]);

  const onSubmit = async (password: string) => {
    try {
      const { accessToken, user } = await resetPassword(token, password);
      setSession(accessToken, user);
      toast.success('Password updated');
      router.replace('/');
    } catch (submitError) {
      toast.error(submitError instanceof ApiError ? submitError.message : 'Something went wrong');
    }
  };

  if (valid === false) {
    return (
      <AuthShell
        title="Link expired"
        subtitle="This password-reset link is invalid or has expired."
        footer={
          <Link href="/forgot-password" className="text-xs text-muted-foreground hover:underline">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">Reset links are valid for one hour.</p>
      </AuthShell>
    );
  }

  if (valid === null) {
    return (
      <AuthShell title="Reset your password">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Pick a strong password you don’t use elsewhere.">
      <SetPasswordForm submitLabel="Update password" onSubmit={onSubmit} />
    </AuthShell>
  );
};

const ResetPasswordPage = () => (
  <Suspense fallback={null}>
    <Reset />
  </Suspense>
);

export default ResetPasswordPage;
