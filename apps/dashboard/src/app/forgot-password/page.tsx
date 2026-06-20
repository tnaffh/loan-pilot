'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MailCheck } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthShell } from '@/components/auth/auth-shell';
import { FormField } from '@/components/form-field';
import { requestPasswordReset } from '@/lib/api';

const ForgotPasswordPage = () => {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  // Always show the same confirmation (no account enumeration).
  const onSubmit = handleSubmit(async (values) => {
    await requestPasswordReset(values.email).catch(() => undefined);
    setSent(true);
  });

  return (
    <AuthShell
      title={sent ? 'Check your email' : 'Reset your password'}
      subtitle={
        sent ? undefined : 'Enter your email and we’ll send you a link to choose a new password.'
      }
      footer={
        <Link href="/login" className="text-xs text-muted-foreground hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
          <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <MailCheck className="size-5" />
          </span>
          <p>
            If an account exists for that address, a reset link is on its way. The link expires in
            one hour.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
          </FormField>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
};

export default ForgotPasswordPage;
