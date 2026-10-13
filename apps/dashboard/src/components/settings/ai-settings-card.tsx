'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, KeyRound, Loader2, PlugZap, Power, Sparkles, Trash2 } from 'lucide-react';
import { can } from '@loan-pilot/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField, selectClass } from '@/components/form-field';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { AiProviderSettings, AiSettings } from '@/lib/types';

type Busy = 'save' | 'test' | 'activate' | 'remove' | null;

const ProviderRow = ({
  provider,
  active,
  canWrite,
  onChanged,
}: {
  provider: AiProviderSettings;
  active: boolean;
  canWrite: boolean;
  onChanged: (settings: AiSettings) => void;
}) => {
  const { token } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(provider.model ?? provider.defaultModel);
  const [busy, setBusy] = useState<Busy>(null);
  const path = `/settings/ai/providers/${provider.provider}`;

  const run = async (kind: Busy, action: () => Promise<void>) => {
    setBusy(kind);

    try {
      await action();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('save', async () => {
      const settings = await apiFetch<AiSettings>(path, {
        method: 'PUT',
        token,
        body: { model, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) },
      });

      setApiKey('');
      onChanged(settings);
      toast.success(`${provider.label} key verified and saved`);
    });

  const test = () =>
    run('test', async () => {
      await apiFetch(`${path}/test`, { method: 'POST', token });
      toast.success(`${provider.label} is connected`);
    });

  const setActive = (on: boolean) =>
    run('activate', async () => {
      const settings = await apiFetch<AiSettings>('/settings/ai', {
        method: 'PATCH',
        token,
        body: { activeProvider: on ? provider.provider : null },
      });

      onChanged(settings);
      toast.success(on ? `AI review now uses ${provider.label}` : 'AI review turned off');
    });

  const remove = () =>
    run('remove', async () => {
      const settings = await apiFetch<AiSettings>(path, { method: 'DELETE', token });

      onChanged(settings);
      toast.success(`${provider.label} key removed`);
    });

  const dirty = apiKey.trim().length > 0 || (provider.configured && model !== provider.model);

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{provider.label}</span>
        <span className="text-sm text-muted-foreground">by {provider.vendor}</span>
        {active ? (
          <Badge className="border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            Active
          </Badge>
        ) : provider.configured ? (
          <Badge variant="outline">Key saved</Badge>
        ) : null}
        {!provider.available ? <Badge variant="secondary">Coming soon</Badge> : null}
      </div>

      {provider.available ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="API key"
              htmlFor={`${provider.provider}-key`}
              description={
                <a
                  href={provider.keysUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  Create a key <ExternalLink className="size-3" />
                </a>
              }
            >
              <Input
                id={`${provider.provider}-key`}
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  provider.keyHint
                    ? `Saved key ${provider.keyHint} — paste a new one to replace`
                    : provider.keyPlaceholder
                }
                disabled={!canWrite}
              />
            </FormField>
            <FormField label="Model" htmlFor={`${provider.provider}-model`}>
              <select
                id={`${provider.provider}-model`}
                className={selectClass}
                value={model}
                onChange={(event) => setModel(event.target.value)}
                disabled={!canWrite}
              >
                {provider.models.map((info) => (
                  <option key={info.id} value={info.id}>
                    {info.label}
                    {info.price
                      ? ` (US$${info.price.inputPerMTok}/${info.price.outputPerMTok} per M tokens)`
                      : ''}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {provider.updatedAt ? (
            <p className="text-xs text-muted-foreground">
              Last saved {formatDate(provider.updatedAt)}
              {provider.updatedByName ? ` by ${provider.updatedByName}` : ''}.
            </p>
          ) : null}

          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={save}
                disabled={busy !== null || !dirty || (!provider.configured && !apiKey.trim())}
              >
                {busy === 'save' ? <Loader2 className="animate-spin" /> : <KeyRound />}
                {provider.configured ? 'Save changes' : 'Verify & save'}
              </Button>
              {provider.configured ? (
                <>
                  <Button size="sm" variant="outline" onClick={test} disabled={busy !== null}>
                    {busy === 'test' ? <Loader2 className="animate-spin" /> : <PlugZap />}
                    Test connection
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActive(!active)}
                    disabled={busy !== null}
                  >
                    {busy === 'activate' ? <Loader2 className="animate-spin" /> : <Power />}
                    {active ? 'Turn off AI review' : 'Use for AI review'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={remove}
                    disabled={busy !== null}
                  >
                    {busy === 'remove' ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    Remove key
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Support for {provider.label} is planned. Keys can be added once it is available.
        </p>
      )}
    </div>
  );
};

/** Settings → AI review: provider API keys and which provider reviews run on. */
export const AiSettingsCard = () => {
  const { user } = useAuth();
  const { data, loading } = useApi<AiSettings>('/settings/ai');
  const [override, setOverride] = useState<AiSettings | null>(null);
  const settings = override ?? data;
  const canWrite = Boolean(user && can(user, 'settings:write'));

  if (loading && !settings) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  if (!settings) {
    return null;
  }

  const active = settings.providers.find(
    (provider) => provider.provider === settings.activeProvider,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" /> AI document review
        </CardTitle>
        <CardDescription>
          An AI reads an application&apos;s ID, payslip and bank statements and reports fakes,
          edits, wrong periods, failed debit orders, other lenders and affordability. It only runs
          when a loan officer clicks <span className="font-medium">AI review</span>, and each review
          is billed to the provider account below. Keys are stored encrypted and never shown again.
          Officers need the &ldquo;Run AI document reviews&rdquo; permission (Roles).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          {active ? (
            <>
              AI review is <span className="font-medium">on</span> and uses {active.label} (
              {active.models.find((info) => info.id === active.model)?.label ?? active.model}).
            </>
          ) : (
            <>
              AI review is <span className="font-medium">off</span>. Save an API key, then choose
              &ldquo;Use for AI review&rdquo;.
            </>
          )}
        </div>
        {settings.providers.map((provider) => (
          <ProviderRow
            key={`${provider.provider}-${provider.model ?? ''}-${provider.keyHint ?? ''}`}
            provider={provider}
            active={provider.provider === settings.activeProvider}
            canWrite={canWrite}
            onChanged={setOverride}
          />
        ))}
      </CardContent>
    </Card>
  );
};
