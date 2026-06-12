import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  createApplicationSchema,
  fromCents,
  type CreateApplicationInput,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TenantsService } from '../tenants/tenants.service';
import { ApplicationsService, type ApplicationWithReferences } from './applications.service';

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
  async list(@Headers('x-tenant') tenantSlug?: string): Promise<ApplicationWithReferences[]> {
    const tenant = await this.tenants.resolveForPublicRequest(tenantSlug);
    return this.applications.findAllForTenant(tenant.id);
  }
}
