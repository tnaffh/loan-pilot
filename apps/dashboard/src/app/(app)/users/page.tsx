'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, Mail, Plus, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { UserRole, UserStatus, isPlatform } from '@loan-pilot/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { InitialsAvatar } from '@/components/initials-avatar';
import { DataTable } from '@/components/data-table';
import { FormField, selectClass } from '@/components/form-field';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { RoleRow, UserRow } from '@/lib/types';

const ROLE_LABELS: Record<string, string> = {
  [UserRole.Platform]: 'Platform',
  [UserRole.LenderAdmin]: 'Admin',
  [UserRole.LenderStaff]: 'Staff',
  [UserRole.Borrower]: 'Borrower',
};

const InviteSheet = ({
  platformActor,
  roles,
  onInvited,
}: {
  platformActor: boolean;
  roles: RoleRow[];
  onInvited: (result: { email: string; acceptUrl: string }) => void;
}) => {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);

  const effectiveRoleId = roleId || roles[0]?.id || '';

  const submit = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (!platformActor && !effectiveRoleId) {
      toast.error('Select a role');
      return;
    }
    setBusy(true);
    try {
      const body = platformActor
        ? { name, email }
        : { name, email, roleId: effectiveRoleId };
      const result = await apiFetch<{ acceptUrl: string }>('/users/invite', {
        method: 'POST',
        body,
        token,
      });
      toast.success(`Invitation sent to ${email}`);
      setName('');
      setEmail('');
      setRoleId('');
      setOpen(false);
      onInvited({ email, acceptUrl: result.acceptUrl });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Invite user
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Invite a user</SheetTitle>
            <SheetDescription>They receive an email link to set a password and sign in.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <FormField label="Full name" htmlFor="name">
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
            </FormField>
            <FormField label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormField>
            {platformActor ? null : (
              <FormField label="Role" htmlFor="role">
                <select
                  id="role"
                  className={selectClass}
                  value={effectiveRoleId}
                  onChange={(event) => setRoleId(event.target.value)}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <SheetFooter className="px-0">
              <Button onClick={submit} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Send invitation
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

const EditSheet = ({
  platformActor,
  roles,
  target,
  onOpenChange,
  onSaved,
}: {
  platformActor: boolean;
  roles: RoleRow[];
  target: UserRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) => {
  const { token } = useAuth();
  const [roleId, setRoleId] = useState<string>('');
  const [status, setStatus] = useState<string>(UserStatus.Active);
  const [busy, setBusy] = useState(false);

  // Sync local state whenever a different user is opened.
  const [syncId, setSyncId] = useState<string | null>(null);
  if (target && target.id !== syncId) {
    setSyncId(target.id);
    setRoleId(target.roleId ?? '');
    setStatus(target.status);
  }

  const save = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const body = platformActor ? { status } : { roleId: roleId || undefined, status };
      await apiFetch(`/users/${target.id}`, { method: 'PATCH', body, token });
      toast.success('User updated');
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={target !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        {target ? (
          <>
            <SheetHeader>
              <SheetTitle>{target.name}</SheetTitle>
              <SheetDescription>{target.email}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4">
              {platformActor ? null : (
                <FormField label="Role" htmlFor="edit-role">
                  <select
                    id="edit-role"
                    className={selectClass}
                    value={roleId}
                    onChange={(event) => setRoleId(event.target.value)}
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              <FormField label="Status" htmlFor="edit-status">
                <select
                  id="edit-status"
                  className={selectClass}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value={UserStatus.Active}>Active</option>
                  <option value={UserStatus.Disabled}>Disabled</option>
                  {target.status === UserStatus.Invited ? (
                    <option value={UserStatus.Invited}>Invited</option>
                  ) : null}
                </select>
              </FormField>
            </div>
            <SheetFooter>
              <Button onClick={save} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Save changes
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};

const UsersPage = () => {
  const { user, token } = useAuth();
  const { data, loading, error, refresh } = useApi<UserRow[]>('/users');
  const platformActor = user ? isPlatform(user.role) : false;
  // Platform operators manage platform operators (no tenant roles to assign).
  const { data: roles } = useApi<RoleRow[]>(platformActor ? null : '/roles');
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [removing, setRemoving] = useState<UserRow | null>(null);
  const [inviteResult, setInviteResult] = useState<{ email: string; acceptUrl: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const resend = async (row: UserRow) => {
    try {
      const result = await apiFetch<{ acceptUrl: string }>(`/users/${row.id}/resend-invite`, {
        method: 'POST',
        token,
      });
      toast.success(`Invitation resent to ${row.email}`);
      setInviteResult({ email: row.email, acceptUrl: result.acceptUrl });
    } catch (resendError) {
      toast.error(resendError instanceof ApiError ? resendError.message : 'Something went wrong');
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await apiFetch(`/users/${removing.id}`, { method: 'DELETE', token });
      toast.success('User removed');
      setRemoving(null);
      refresh();
    } catch (removeError) {
      toast.error(removeError instanceof ApiError ? removeError.message : 'Something went wrong');
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        id: 'user',
        header: 'User',
        accessorFn: (row) => `${row.name} ${row.email}`,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <InitialsAvatar name={row.original.name} />
            <div>
              <div className="font-medium">{row.original.name}</div>
              <div className="text-xs text-muted-foreground">{row.original.email}</div>
            </div>
          </div>
        ),
      },
      {
        id: 'role',
        header: 'Role',
        accessorFn: (row) => row.roleName ?? ROLE_LABELS[row.role] ?? row.role,
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.roleName ?? ROLE_LABELS[row.original.role] ?? row.original.role}
          </Badge>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge value={row.original.status} />,
      },
      {
        id: 'signin',
        header: 'Sign-in',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.hasPassword ? (
              <Badge variant="outline" className="text-xs">
                Password
              </Badge>
            ) : null}
            {row.original.providers.map((provider) => (
              <Badge key={provider} variant="outline" className="text-xs capitalize">
                {provider}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: 'lastLogin',
        header: 'Last sign-in',
        accessorKey: 'lastLoginAt',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDate(row.original.lastLoginAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Actions</div>,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {row.original.status === UserStatus.Invited ? (
              <Button
                size="sm"
                variant="ghost"
                title="Resend invitation"
                onClick={(event) => {
                  event.stopPropagation();
                  resend(row.original);
                }}
              >
                <Mail className="size-4" />
              </Button>
            ) : null}
            {row.original.id !== user?.id ? (
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-destructive"
                title="Remove user"
                onClick={(event) => {
                  event.stopPropagation();
                  setRemoving(row.original);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id],
  );

  return (
    <div>
      <PageHeader
        title="Users"
        description="Invite teammates and manage their roles and access"
        action={
          <InviteSheet platformActor={platformActor} roles={roles ?? []} onInvited={setInviteResult} />
        }
      />

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <DataTable
          columns={columns}
          data={data ?? []}
          searchPlaceholder="Search users…"
          onRowClick={(row) => setEditing(row)}
        />
      )}

      <EditSheet
        platformActor={platformActor}
        roles={roles ?? []}
        target={editing}
        onOpenChange={(open) => (open ? null : setEditing(null))}
        onSaved={refresh}
      />

      <AlertDialog open={removing !== null} onOpenChange={(open) => (open ? null : setRemoving(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {removing?.name} ({removing?.email})? They will lose access immediately. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRemove} disabled={deleting}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={inviteResult !== null} onOpenChange={(open) => (open ? null : setInviteResult(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitation link</DialogTitle>
            <DialogDescription>
              We emailed {inviteResult?.email}. You can also share this link directly — it expires in
              7 days.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={inviteResult?.acceptUrl ?? ''} className="text-xs" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (inviteResult) {
                  navigator.clipboard.writeText(inviteResult.acceptUrl);
                  toast.success('Link copied');
                }
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
