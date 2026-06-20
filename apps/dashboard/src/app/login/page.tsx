'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { type LoginInput, loginSchema } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthShell } from '@/components/auth/auth-shell';
import { FormField } from '@/components/form-field';
import { GoogleIcon } from '@/components/auth/google-icon';
import { useAuth } from '@/lib/auth-context';
import { API_URL, ApiError } from '@/lib/api';

const OAUTH_ERRORS: Record<string, string> = {
  not_invited: 'That account has not been invited. Ask an administrator to add you.',
  domain_not_allowed: 'Sign in with your organisation Google account.',
  account_disabled: 'This account has been disabled.',
  google_disabled: 'Google sign-in is not enabled.',
  oauth: 'Google sign-in failed. Please try again.',
};

const LoginForm = () => {
  const router = useRouter();
  const params = useSearchParams();
  const { login, status } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  useEffect(() => {
    const error = params.get('error');
    if (error) toast.error(OAUTH_ERRORS[error] ?? 'Could not sign in');
  }, [params]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
      router.replace('/');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not sign in');
    }
  });

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your LoanPilot dashboard"
      footer={
        <p className="text-xs text-muted-foreground">
          By signing in you agree to the Terms of Service and Privacy Policy.
        </p>
      }
    >
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          window.location.href = `${API_URL}/auth/google`;
        }}
      >
        <GoogleIcon className="size-4" />
        Continue with Google
      </Button>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or continue with email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
        </FormField>
        <FormField
          label={
            <div className="flex items-center justify-between">
              <span>Password</span>
              <Link
                href="/forgot-password"
                className="text-xs font-normal text-muted-foreground hover:underline"
              >
                Forgot your password?
              </Link>
            </div>
          }
          htmlFor="password"
          error={errors.password?.message}
        >
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
        </FormField>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
};

const LoginPage = () => (
  <Suspense fallback={null}>
    <LoginForm />
  </Suspense>
);

export default LoginPage;
