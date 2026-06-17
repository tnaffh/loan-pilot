'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Send } from 'lucide-react';
import { type LoginInput, loginSchema } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

const LoginPage = () => {
  const router = useRouter();
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
    if (status === 'authenticated') {
      router.replace('/');
    }
  }, [status, router]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
      router.replace('/');
    } catch (error) {
      const { toast } = await import('sonner');
      toast.error(error instanceof ApiError ? error.message : 'Could not sign in');
    }
  });

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <Card className="overflow-hidden p-0">
          <CardContent className="grid p-0 md:grid-cols-2">
            <form onSubmit={onSubmit} className="p-6 md:p-8" noValidate>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-bold">Welcome back</h1>
                  <p className="text-balance text-muted-foreground">
                    Sign in to your LoanPilot dashboard
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="m@example.com"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="password">Password</Label>
                    <a
                      href="#"
                      className="ml-auto text-sm underline-offset-2 hover:underline"
                    >
                      Forgot your password?
                    </a>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    {...register('password')}
                  />
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                  Sign in
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Demo: admin@raccoons.na · ops@loanpilot.na · helena@email.na (password123)
                </p>
              </div>
            </form>
            <div className="relative hidden bg-primary text-primary-foreground md:flex md:flex-col md:items-center md:justify-center md:gap-4 md:p-10">
              <div
                className="pointer-events-none absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }}
              />
              <div className="relative flex size-12 items-center justify-center rounded-xl bg-primary-foreground/15">
                <Send className="size-6" />
              </div>
              <div className="relative text-center">
                <div className="text-xl font-semibold">LoanPilot</div>
                <p className="mt-1 text-sm text-primary-foreground/80">
                  Micro-lending management for Namibian lenders
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <p className="mt-4 px-6 text-center text-xs text-muted-foreground">
          By signing in you agree to the Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
