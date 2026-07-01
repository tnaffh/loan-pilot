import { Controller, Get, UseGuards } from '@nestjs/common';
import { hasPermission, type SessionUser } from '@loan-pilot/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireTenantId } from '../common/tenant';
import { StatsService, type LenderSeries, type OverviewStats } from './stats.service';

@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  overview(@CurrentUser() user: SessionUser): Promise<OverviewStats> {
    return this.stats.overview(user);
  }

  @Get('series')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('reports:read')
  series(@CurrentUser() user: SessionUser): Promise<LenderSeries> {
    return this.stats.lenderSeries(requireTenantId(user), hasPermission(user, 'finance:read'));
  }
}
