import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createApplicationSchema,
  fromCents,
  updateApplicationStatusSchema,
  type CreateApplicationInput,
  type SessionUser,
  type UpdateApplicationStatusInput,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { TenantsService } from '../tenants/tenants.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  ApplicationsService,
  type ApplicationDecision,
  type ApplicationDetail,
  type ApplicationWithReferences,
  type PricingConfig,
} from './applications.service';

interface ApplicationResultDto {
  id: string;
  status: string;
  affordability: string;
  affordabilityRatio: number;
  quotedTotal: number;
  quotedInstalment: number;
  submittedAt: string;
}

@Controller('applications')
export class ApplicationsController {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly tenants: TenantsService,
  ) {}

  /** Public apply endpoint — the tenant comes from the x-tenant header. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createApplicationSchema)) body: CreateApplicationInput,
    @Headers('x-tenant') tenantSlug?: string,
  ): Promise<ApplicationResultDto> {
    const tenant = await this.tenants.resolveForPublicRequest(tenantSlug);
    const application = await this.applications.create(tenant.id, body);

    return {
      id: application.id,
      status: application.status,
      affordability: application.affordability,
      affordabilityRatio: application.affordabilityRatio,
      quotedTotal: fromCents(application.quotedTotal),
      quotedInstalment: fromCents(application.quotedInstalment),
      submittedAt: application.submittedAt.toISOString(),
    };
  }

  /** Loan-officer-captured application — the tenant comes from the session. */
  @Post('internal')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('applications:write')
  async createInternal(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createApplicationSchema)) body: CreateApplicationInput,
  ): Promise<ApplicationResultDto> {
    const application = await this.applications.create(requireTenantId(user), body);
    return {
      id: application.id,
      status: application.status,
      affordability: application.affordability,
      affordabilityRatio: application.affordabilityRatio,
      quotedTotal: fromCents(application.quotedTotal),
      quotedInstalment: fromCents(application.quotedInstalment),
      submittedAt: application.submittedAt.toISOString(),
    };
  }

  /** Public pricing config — active rate per loan type + fee settings. Tenant from x-tenant. */
  @Get('pricing')
  async pricing(@Headers('x-tenant') tenantSlug?: string): Promise<PricingConfig> {
    const tenant = await this.tenants.resolveForPublicRequest(tenantSlug);
    return this.applications.pricingConfig(tenant.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('applications:read')
  list(@CurrentUser() user: SessionUser): Promise<ApplicationWithReferences[]> {
    return this.applications.findAllForTenant(requireTenantId(user));
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('applications:read')
  detail(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<ApplicationDetail> {
    return this.applications.findOneForTenant(requireTenantId(user), id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('applications:decide')
  updateStatus(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateApplicationStatusSchema)) body: UpdateApplicationStatusInput,
  ): Promise<ApplicationDecision> {
    return this.applications.updateStatus(requireTenantId(user), id, body);
  }
}
