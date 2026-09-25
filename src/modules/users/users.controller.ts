import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '@/core/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '@/core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '@/core/validation/zod-validation.pipe';
import { RbacService } from '@/modules/rbac/rbac.service';

import { updateUserSchema } from './dto/update-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const READ_PERMISSION = 'users.read';
const UPDATE_PERMISSION = 'users.update';
const SELF_UPDATABLE_FIELDS = ['name'] as const;
const ADMIN_UPDATABLE_FIELDS = ['name', 'email', 'status'] as const;

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rbac: RbacService,
  ) {}

  @Get(':userId')
  @UseGuards(JwtAuthGuard)
  async getProfile(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const isSelf = req.user.id === userId;

    if (
      !isSelf &&
      !(await this.rbac.hasPermission(req.user.id, READ_PERMISSION))
    ) {
      throw new ForbiddenException();
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException();
    }

    return isSelf
      ? this.usersService.toSelfProfile(user)
      : this.usersService.toPublicProfile(user);
  }

  @Patch(':userId')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
  ) {
    const isSelf = req.user.id === userId;
    let allowedFields: readonly string[] = SELF_UPDATABLE_FIELDS;

    if (!isSelf) {
      if (!(await this.rbac.hasPermission(req.user.id, UPDATE_PERMISSION))) {
        throw new ForbiddenException();
      }
      allowedFields = ADMIN_UPDATABLE_FIELDS;
    }

    const forbiddenField = Object.keys(dto).find(
      (field) => !allowedFields.includes(field),
    );
    if (forbiddenField) {
      throw new ForbiddenException(`Cannot update field: ${forbiddenField}`);
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException();
    }

    const updated = await this.usersService.update(userId, dto);

    return isSelf
      ? this.usersService.toSelfProfile(updated)
      : this.usersService.toPublicProfile(updated);
  }
}
