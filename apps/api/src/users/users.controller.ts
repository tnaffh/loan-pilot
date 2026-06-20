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
  UserRole,
  inviteUserSchema,
  updateUserSchema,
  type InviteUserInput,
  type SessionUser,
  type UpdateUserInput,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService, type UserRow } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.LenderAdmin, UserRole.Platform)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<UserRow[]> {
    return this.users.findAllForScope(user);
  }

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(inviteUserSchema)) body: InviteUserInput,
  ): Promise<{ user: UserRow; acceptUrl: string }> {
    return this.users.invite(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ): Promise<UserRow> {
    return this.users.update(user, id, body);
  }

  @Post(':id/resend-invite')
  @HttpCode(HttpStatus.OK)
  resend(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<{ acceptUrl: string }> {
    return this.users.resendInvite(user, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.users.remove(user, id);
  }
}
