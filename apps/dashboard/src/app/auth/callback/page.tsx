'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const Callback = () => {
  const router = useRouter();
  const params = useSearchParams();
  const { loginWithToken } = useAuth();

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      router.replace('/login?error=oauth');
      return;
    }
    loginWithToken(token)
      .then(() => router.replace('/'))
      .catch(() => router.replace('/login?error=oauth'));
  }, [params, loginWithToken, router]);

  return (
    <div className="flex min-h-svh items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
};

const AuthCallbackPage = () => (
  <Suspense
    fallback={
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    }
  >
    <Callback />
  </Suspense>
);

export default AuthCallbackPage;
