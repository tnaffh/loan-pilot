import { Controller, Get, UseGuards } from '@nestjs/common';
import type { SessionUser, TenantBranding } from '@loan-pilot/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get('me')
  branding(@CurrentUser() user: SessionUser): Promise<TenantBranding | null> {
    return this.tenants.brandingForUser(user);
  }
}
