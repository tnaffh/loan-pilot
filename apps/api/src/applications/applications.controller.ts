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
  UserRole,
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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  ApplicationsService,
  type ApplicationDecision,
  type ApplicationWithReferences,
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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  list(@CurrentUser() user: SessionUser): Promise<ApplicationWithReferences[]> {
    return this.applications.findAllForTenant(requireTenantId(user));
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  updateStatus(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateApplicationStatusSchema)) body: UpdateApplicationStatusInput,
  ): Promise<ApplicationDecision> {
    return this.applications.updateStatus(requireTenantId(user), id, body);
  }
}
