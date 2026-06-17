import { ForbiddenException } from '@nestjs/common';
import type { SessionUser } from '@loan-pilot/domain';

/**
 * Tenant-scoped routes require a tenant-bound user. Lender and borrower
 * sessions always carry one; platform operators (tenantId = null) do not.
 */
export const requireTenantId = (user: SessionUser): string => {
  if (!user.tenantId) {
    throw new ForbiddenException('This route requires a tenant-bound account');
  }
  return user.tenantId;
};
