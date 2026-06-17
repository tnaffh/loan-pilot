import { Controller, Get, UseGuards } from '@nestjs/common';
import type { SessionUser } from '@loan-pilot/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { StatsService, type OverviewStats } from './stats.service';

@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  overview(@CurrentUser() user: SessionUser): Promise<OverviewStats> {
    return this.stats.overview(user);
  }
}
