import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@loan-pilot/domain';

export const PERMISSIONS_KEY = 'permissions';

/** Require the given permission(s) on a route. Use together with PermissionsGuard. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
