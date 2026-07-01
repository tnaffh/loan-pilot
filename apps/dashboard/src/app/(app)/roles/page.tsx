'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, KeyRound, Loader2, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  can,
  type Permission,
} from '@loan-pilot/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { FormField } from '@/components/form-field';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import type { RoleRow } from '@/lib/types';

/** null target = closed; 'new' = create; a RoleRow = edit that role. */
type SheetTarget = RoleRow | 'new' | null;

const RoleSheet = ({
  target,
  onClose,
  onSaved,
}: {
  target: SheetTarget;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { token } = useAuth();
  const role = target === 'new' || target === null ? null : target;
  const isSystem = role?.isSystem ?? false;

  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Sync form state whenever a different target is opened.
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const key = target === 'new' ? 'new' : (role?.id ?? null);
  if (target !== null && key !== syncKey) {
    setSyncKey(key);
    setName(role?.name ?? '');
    setPermissions(new Set(role?.permissions ?? []));
  }

  const toggle = (permission: Permission, checked: boolean) => {
    setPermissions((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(permission);
      } else {
        next.delete(permission);
      }
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('A role name is required');
      return;
    }
    setBusy(true);
    try {
      const body = { name: name.trim(), permissions: [...permissions] };
      if (role) {
        await apiFetch(`/roles/${role.id}`, { method: 'PATCH', body, token });
      } else {
        await apiFetch('/roles', { method: 'POST', body, token });
      }
      toast.success(role ? 'Role updated' : 'Role created');
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={target !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{role ? role.name : 'New role'}</SheetTitle>
          <SheetDescription>
            {isSystem
              ? 'This is a built-in role. Clone it to create an editable copy.'
              : 'Choose the permissions this role grants.'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          <FormField label="Role name" htmlFor="role-name">
            <Input
              id="role-name"
              value={name}
              disabled={isSystem}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>

          <div className="space-y-4">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">{group.label}</div>
                <div className="space-y-2">
                  {group.permissions.map((permission) => (
                    <label
                      key={permission}
                      className="flex items-start gap-2 text-sm"
                      htmlFor={`perm-${permission}`}
                    >
                      <Checkbox
                        id={`perm-${permission}`}
                        checked={permissions.has(permission)}
                        disabled={isSystem}
                        onCheckedChange={(checked) => toggle(permission, checked === true)}
                        className="mt-0.5"
                      />
                      <span>{PERMISSION_LABELS[permission]}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {isSystem ? null : (
          <SheetFooter>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {role ? 'Save changes' : 'Create role'}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};

const RolesPage = () => {
  const { user, token } = useAuth();
  const router = useRouter();
  const allowed = Boolean(user && can(user, 'roles:manage'));
  const { data, loading, error, refresh } = useApi<RoleRow[]>(allowed ? '/roles' : null);
  const [target, setTarget] = useState<SheetTarget>(null);
  const [removing, setRemoving] = useState<RoleRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cloning, setCloning] = useState<string | null>(null);

  // Bounce anyone without the permission who reaches this via a direct URL.
  useEffect(() => {
    if (user && !allowed) {
      router.replace('/');
    }
  }, [user, allowed, router]);

  if (!allowed) {
    return null;
  }

  const clone = async (role: RoleRow) => {
    setCloning(role.id);
    try {
      await apiFetch(`/roles/${role.id}/clone`, { method: 'POST', token });
      toast.success(`Cloned ${role.name}`);
      refresh();
    } catch (cloneError) {
      toast.error(cloneError instanceof ApiError ? cloneError.message : 'Something went wrong');
    } finally {
      setCloning(null);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await apiFetch(`/roles/${removing.id}`, { method: 'DELETE', token });
      toast.success('Role deleted');
      setRemoving(null);
      refresh();
    } catch (removeError) {
      toast.error(removeError instanceof ApiError ? removeError.message : 'Something went wrong');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Roles"
        description="Create roles and choose the permissions each one grants"
        action={
          <Button onClick={() => setTarget('new')}>
            <Plus />
            New role
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((role) => (
            <Card key={role.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <KeyRound className="size-4 text-muted-foreground" />
                    <span className="font-medium">{role.name}</span>
                    {role.isSystem ? (
                      <Badge variant="outline" className="gap-1">
                        <Lock className="size-3" /> Built-in
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'} ·{' '}
                    {role.userCount} member{role.userCount === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTarget(role)}
                    title={role.isSystem ? 'View permissions' : 'Edit role'}
                  >
                    <Pencil className="size-4" />
                    {role.isSystem ? 'View' : 'Edit'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => clone(role)}
                    disabled={cloning === role.id}
                    title="Clone role"
                  >
                    {cloning === role.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    Clone
                  </Button>
                  {role.isSystem || role.userCount > 0 ? null : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive"
                      title="Delete role"
                      onClick={() => setRemoving(role)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RoleSheet target={target} onClose={() => setTarget(null)} onSaved={refresh} />

      <AlertDialog open={removing !== null} onOpenChange={(open) => (open ? null : setRemoving(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the “{removing?.name}” role? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRemove} disabled={deleting}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RolesPage;
