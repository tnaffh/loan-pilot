import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '@loan-pilot/domain';

/** Inject the authenticated SessionUser (populated by JwtStrategy) into a handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser | undefined => {
    const request = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    return request.user;
  },
);
