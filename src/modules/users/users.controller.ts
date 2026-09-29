import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';

import { JwtAuthGuard } from '@/core/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '@/core/auth/jwt-auth.guard';
import {
  confirmChallengeLinkSchema,
  confirmChallengeOtpSchema,
} from '@/core/challenge/dto/confirm-challenge.dto';
import type {
  ConfirmChallengeLinkDto,
  ConfirmChallengeOtpDto,
} from '@/core/challenge/dto/confirm-challenge.dto';
import { SENSITIVE_THROTTLE } from '@/core/throttler/sensitive-throttle';
import { ZodValidationPipe } from '@/core/validation/zod-validation.pipe';
import { RbacService } from '@/modules/rbac/rbac.service';

import { initiateEmailChangeSchema } from './dto/initiate-email-change.dto';
import type { InitiateEmailChangeDto } from './dto/initiate-email-change.dto';
import { listUsersQuerySchema } from './dto/list-users.dto';
import type { ListUsersQuery } from './dto/list-users.dto';
import { updateUserSchema } from './dto/update-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const READ_PERMISSION = 'users.read';
const UPDATE_PERMISSION = 'users.update';
const LIST_PERMISSION = 'users.list';
const DELETE_PERMISSION = 'users.delete';
const SELF_UPDATABLE_FIELDS = ['name', 'photo'] as const;
const ADMIN_UPDATABLE_FIELDS = ['name', 'email', 'photo', 'status'] as const;

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rbac: RbacService,
  ) {}

  @Get()
  @Throttle(SENSITIVE_THROTTLE)
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

  @Post(':userId/email-change')
  @Throttle(SENSITIVE_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async initiateEmailChange(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(initiateEmailChangeSchema))
    dto: InitiateEmailChangeDto,
  ) {
    if (req.user.id !== userId) {
      throw new ForbiddenException();
    }

    const { challengeId } = await this.usersService.initiateEmailChange(
      userId,
      dto.newEmail,
    );

    return { requiresConfirmation: true, challengeId };
  }

  @Post(':userId/email-change/confirm')
  @Throttle(SENSITIVE_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async confirmEmailChangeOtp(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(confirmChallengeOtpSchema))
    dto: ConfirmChallengeOtpDto,
  ) {
    if (req.user.id !== userId) {
      throw new ForbiddenException();
    }

    const user = await this.usersService.confirmEmailChange(
      userId,
      dto.challengeId,
      dto.code,
    );

    return this.usersService.toSelfProfile(user);
  }

  @Get(':userId/email-change/confirm')
  @Throttle(SENSITIVE_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async confirmEmailChangeLink(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(confirmChallengeLinkSchema))
    query: ConfirmChallengeLinkDto,
  ) {
    if (req.user.id !== userId) {
      throw new ForbiddenException();
    }

    const user = await this.usersService.confirmEmailChange(
      userId,
      query.challengeId,
      query.token,
    );

    return this.usersService.toSelfProfile(user);
  }

  @Delete(':userId')
  @Throttle(SENSITIVE_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    if (req.user.id === userId) {
      const { challengeId } = await this.usersService.initiateSelfDelete(
        userId,
        req.user.email,
      );

      return { requiresConfirmation: true, challengeId };
    }

    if (!(await this.rbac.hasPermission(req.user.id, DELETE_PERMISSION))) {
      throw new ForbiddenException();
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException();
    }

    await this.usersService.remove(userId);
    res.status(204);
  }

  @Post(':userId/delete/confirm')
  @Throttle(SENSITIVE_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async confirmDeleteOtp(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(confirmChallengeOtpSchema))
    dto: ConfirmChallengeOtpDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    if (req.user.id !== userId) {
      throw new ForbiddenException();
    }

    await this.usersService.confirmSelfDelete(
      userId,
      dto.challengeId,
      dto.code,
    );
    this.clearAuthCookies(res);

    return { success: true };
  }

  @Get(':userId/delete/confirm')
  @Throttle(SENSITIVE_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async confirmDeleteLink(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(confirmChallengeLinkSchema))
    query: ConfirmChallengeLinkDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    if (req.user.id !== userId) {
      throw new ForbiddenException();
    }

    await this.usersService.confirmSelfDelete(
      userId,
      query.challengeId,
      query.token,
    );
    this.clearAuthCookies(res);

    return { success: true };
  }

  private clearAuthCookies(res: FastifyReply): void {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
  }
}
