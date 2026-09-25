import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '@/core/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '@/core/auth/jwt-auth.guard';
import { RbacService } from '@/modules/rbac/rbac.service';

import { UsersService } from './users.service';

const READ_PERMISSION = 'users.read';

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
}
