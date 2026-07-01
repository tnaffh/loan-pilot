import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createRoleSchema,
  updateRoleSchema,
  type CreateRoleInput,
  type SessionUser,
  type UpdateRoleInput,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { RolesService, type RoleRow } from './roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('roles:manage')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<RoleRow[]> {
    return this.roles.findAllForTenant(user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
  ): Promise<RoleRow> {
    return this.roles.create(user, body);
  }

  @Post(':id/clone')
  @HttpCode(HttpStatus.CREATED)
  clone(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<RoleRow> {
    return this.roles.clone(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
  ): Promise<RoleRow> {
    return this.roles.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.roles.remove(user, id);
  }
}
