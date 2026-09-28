import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';

import { JwtAuthGuard } from '@/core/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '@/core/auth/jwt-auth.guard';
import { SENSITIVE_THROTTLE } from '@/core/throttler/sensitive-throttle';
import { ZodValidationPipe } from '@/core/validation/zod-validation.pipe';
import {
  TransformationStatus,
  TransformationType,
} from '@/generated/prisma/client';
import { RbacService } from '@/modules/rbac/rbac.service';

import { listHistoryQuerySchema } from './dto/list-history.dto';
import type { ListHistoryQuery } from './dto/list-history.dto';
import { TransformationHistoryService } from './transformation-history.service';

const HISTORY_ADMIN_PERMISSION = 'transformations.history.admin';

@Controller('api/transformations')
export class TransformationHistoryController {
  constructor(
    private readonly history: TransformationHistoryService,
    private readonly rbac: RbacService,
  ) {}

  @Get('history')
  @Throttle(SENSITIVE_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async list(
    @Req() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listHistoryQuerySchema))
    query: ListHistoryQuery,
  ) {
    let targetUserId = req.user.id;

    if (query.userId && query.userId !== req.user.id) {
      if (
        !(await this.rbac.hasPermission(req.user.id, HISTORY_ADMIN_PERMISSION))
      ) {
        throw new ForbiddenException();
      }
      targetUserId = query.userId;
    }

    return this.history.list({
      userId: targetUserId,
      cursor: query.cursor,
      limit: query.limit,
      type: query.type
        ? (query.type.toUpperCase() as TransformationType)
        : undefined,
      sourceFormat: query.sourceFormat,
      targetFormat: query.targetFormat,
      status: query.status
        ? (query.status.toUpperCase() as TransformationStatus)
        : undefined,
      createdAtFrom: query.createdAtFrom
        ? new Date(query.createdAtFrom)
        : undefined,
      createdAtTo: query.createdAtTo ? new Date(query.createdAtTo) : undefined,
    });
  }

  @Get('history/:itemId/download')
  @UseGuards(JwtAuthGuard)
  async download(
    @Param('itemId') itemId: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const record = await this.history.findById(itemId);
    if (!record) {
      throw new NotFoundException();
    }

    const isSelf = record.userId === req.user.id;
    if (
      !isSelf &&
      !(await this.rbac.hasPermission(req.user.id, HISTORY_ADMIN_PERMISSION))
    ) {
      throw new ForbiddenException();
    }

    const { stream, contentType } = await this.history.getFileStream(record);

    res.header('Content-Type', contentType);
    res.header(
      'Content-Disposition',
      `attachment; filename="transformation-${record.id}.${record.targetFormat}"`,
    );

    return stream;
  }
}
