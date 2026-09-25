import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '@/core/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '@/core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '@/core/validation/zod-validation.pipe';
import { RbacService } from '@/modules/rbac/rbac.service';

import { listUsersQuerySchema } from './dto/list-users.dto';
import type { ListUsersQuery } from './dto/list-users.dto';
import { updateUserSchema } from './dto/update-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const READ_PERMISSION = 'users.read';
const UPDATE_PERMISSION = 'users.update';
const LIST_PERMISSION = 'users.list';
const DELETE_PERMISSION = 'users.delete';
const SELF_UPDATABLE_FIELDS = ['name'] as const;
const ADMIN_UPDATABLE_FIELDS = ['name', 'email', 'status'] as const;

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rbac: RbacService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @Req() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ) {
    if (!(await this.rbac.hasPermission(req.user.id, LIST_PERMISSION))) {
      throw new ForbiddenException();
    }

    return this.usersService.list(query);
  }

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

  @Delete(':userId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    if (req.user.id === userId) {
      throw new ForbiddenException(
        'Self-service deletion requires email confirmation, not yet available',
      );
    }

    if (!(await this.rbac.hasPermission(req.user.id, DELETE_PERMISSION))) {
      throw new ForbiddenException();
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException();
    }

    await this.usersService.remove(userId);
  }
}
