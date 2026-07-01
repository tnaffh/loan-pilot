import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { hasPermission, type Permission, type SessionUser } from '@loan-pilot/domain';
import { PERMISSIONS_KEY } from './permissions.decorator';

/**
 * Grant access when the user holds every permission required by the route.
 * Routes with no `@RequirePermissions` are unrestricted by this guard (a route
 * may still be gated by RolesGuard). Platform operators pass implicitly (see
 * {@link hasPermission}). Reads `user.permissions`, populated by JwtStrategy.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const user = request.user;
    return Boolean(user && required.every((permission) => hasPermission(user, permission)));
  }
}
