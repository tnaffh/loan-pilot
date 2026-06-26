import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole, type SessionUser } from '@loan-pilot/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  series(@CurrentUser() user: SessionUser): Promise<LenderSeries> {
    return this.stats.lenderSeries(requireTenantId(user), user.role === UserRole.LenderAdmin);
  }
}
