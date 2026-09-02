import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  saveRegulatoryReturnSchema,
  type AvailablePeriods,
  type MonthlyReport,
  type QuarterlyReturn,
  type RegulatoryFigures,
  type ReportDataQuality,
  type SaveRegulatoryReturnInput,
  type SessionUser,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReportsService } from './reports.service';

const PDF = 'application/pdf';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Regulatory and management reporting.
 *
 * Reads require `finance:read` alongside `reports:read`: both reports expose the
 * lender's capital position, which {@link StatsService} deliberately withholds
 * from staff on the overview. Saving the operator-supplied NAMFISA figures is an
 * administrator action (`reports:write`).
 */
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('periods')
  @RequirePermissions('reports:read')
  periods(@CurrentUser() user: SessionUser): Promise<AvailablePeriods> {
    return this.reports.periods(requireTenantId(user));
  }

  @Get('quarterly')
  @RequirePermissions('reports:read', 'finance:read')
  quarterly(
    @CurrentUser() user: SessionUser,
    @Query('period') period: string,
  ): Promise<QuarterlyReturn> {
    return this.reports.quarterly(requireTenantId(user), period);
  }

  @Get('quarterly/:period/pdf')
  @RequirePermissions('reports:read', 'finance:read')
  async quarterlyPdf(
    @CurrentUser() user: SessionUser,
    @Param('period') period: string,
  ): Promise<StreamableFile> {
    const pdf = await this.reports.quarterlyPdf(requireTenantId(user), period);
    return new StreamableFile(pdf, {
      type: PDF,
      disposition: `attachment; filename="namfisa-return-${period}.pdf"`,
      length: pdf.length,
    });
  }

  @Get('monthly')
  @RequirePermissions('reports:read', 'finance:read')
  monthly(
    @CurrentUser() user: SessionUser,
    @Query('month') month: string,
  ): Promise<MonthlyReport> {
    return this.reports.monthly(requireTenantId(user), month);
  }

  @Get('monthly/:month/pdf')
  @RequirePermissions('reports:read', 'finance:read')
  async monthlyPdf(
    @CurrentUser() user: SessionUser,
    @Param('month') month: string,
  ): Promise<StreamableFile> {
    const pdf = await this.reports.monthlyPdf(requireTenantId(user), month);
    return new StreamableFile(pdf, {
      type: PDF,
      disposition: `attachment; filename="monthly-report-${month}.pdf"`,
      length: pdf.length,
    });
  }

  @Get('monthly/:month/xlsx')
  @RequirePermissions('reports:read', 'finance:read')
  async monthlyXlsx(
    @CurrentUser() user: SessionUser,
    @Param('month') month: string,
  ): Promise<StreamableFile> {
    const book = await this.reports.monthlyXlsx(requireTenantId(user), month);
    return new StreamableFile(book, {
      type: XLSX,
      disposition: `attachment; filename="monthly-report-${month}.xlsx"`,
      length: book.length,
    });
  }

  /** Borrowers still missing a gender, so the gender splits can be completed. */
  @Get('data-quality')
  @RequirePermissions('reports:read')
  dataQuality(@CurrentUser() user: SessionUser): Promise<ReportDataQuality> {
    return this.reports.dataQuality(requireTenantId(user));
  }

  /** The operator-supplied figures for a quarter (empty when none saved yet). */
  @Get('quarterly/:period/figures')
  @RequirePermissions('reports:read')
  figures(
    @CurrentUser() user: SessionUser,
    @Param('period') period: string,
  ): Promise<RegulatoryFigures> {
    return this.reports.figures(requireTenantId(user), period);
  }

  @Put('quarterly/:period/figures')
  @RequirePermissions('reports:write')
  saveFigures(
    @CurrentUser() user: SessionUser,
    @Param('period') period: string,
    @Body(new ZodValidationPipe(saveRegulatoryReturnSchema)) body: SaveRegulatoryReturnInput,
  ): Promise<{ period: string; figures: RegulatoryFigures; notes: string | null }> {
    return this.reports.saveFigures(requireTenantId(user), period, body, user.name);
  }
}
