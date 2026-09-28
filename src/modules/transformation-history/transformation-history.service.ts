import { randomUUID } from 'node:crypto';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@/core/database/prisma.service';
import { ConfigService } from '@/core/config/config.service';
import { StorageService } from '@/core/storage/storage.service';
import {
  Prisma,
  TransformationHistory,
  TransformationStatus,
  TransformationType,
} from '@/generated/prisma/client';

export interface RecordTransformationParams {
  userId: string;
  type: TransformationType;
  sourceFormat: string;
  targetFormat: string;
  status: TransformationStatus;
  fileSize: number;
  durationMs: number;
  errorCode?: string;
  save?: {
    buffer: Buffer;
    contentType: string;
    extension: string;
  };
}

export interface ListHistoryParams {
  userId: string;
  cursor?: string;
  limit: number;
  type?: TransformationType;
  sourceFormat?: string;
  targetFormat?: string;
  status?: TransformationStatus;
  createdAtFrom?: Date;
  createdAtTo?: Date;
}

export interface HistoryItem {
  id: string;
  type: TransformationType;
  sourceFormat: string;
  targetFormat: string;
  status: TransformationStatus;
  fileSize: number;
  durationMs: number;
  errorCode: string | null;
  hasSavedFile: boolean;
  createdAt: Date;
}

export interface ListHistoryResult {
  items: HistoryItem[];
  nextCursor: string | null;
}

@Injectable()
export class TransformationHistoryService {
  private readonly logger = new Logger(TransformationHistoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async record(params: RecordTransformationParams): Promise<void> {
    try {
      const retentionDays = this.config.get('HISTORY_RETENTION_DAYS');
      const expiresAt = new Date(
        Date.now() + retentionDays * 24 * 60 * 60 * 1000,
      );

      let fileId: string | undefined;
      let fileContentType: string | undefined;

      if (params.save) {
        fileId = `transformations/${params.userId}/${randomUUID()}.${params.save.extension}`;
        try {
          await this.storage.upload(
            fileId,
            params.save.buffer,
            params.save.contentType,
          );
          fileContentType = params.save.contentType;
        } catch (error) {
          this.logger.error(
            `Failed to save transformation result to storage: ${String(error)}`,
          );
          fileId = undefined;
        }
      }

      await this.prisma.transformationHistory.create({
        data: {
          userId: params.userId,
          type: params.type,
          sourceFormat: params.sourceFormat,
          targetFormat: params.targetFormat,
          status: params.status,
          fileSize: params.fileSize,
          durationMs: params.durationMs,
          errorCode: params.errorCode,
          fileId,
          fileContentType,
          expiresAt,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to record transformation history: ${String(error)}`,
      );
    }
  }

  async list(params: ListHistoryParams): Promise<ListHistoryResult> {
    const {
      userId,
      cursor,
      limit,
      type,
      sourceFormat,
      targetFormat,
      status,
      createdAtFrom,
      createdAtTo,
    } = params;

    const where: Prisma.TransformationHistoryWhereInput = {
      userId,
      ...(type ? { type } : {}),
      ...(sourceFormat ? { sourceFormat } : {}),
      ...(targetFormat ? { targetFormat } : {}),
      ...(status ? { status } : {}),
      ...(createdAtFrom || createdAtTo
        ? {
            createdAt: {
              ...(createdAtFrom ? { gte: createdAtFrom } : {}),
              ...(createdAtTo ? { lte: createdAtTo } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.transformationHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((row) => this.toHistoryItem(row)),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  findById(itemId: string) {
    return this.prisma.transformationHistory.findUnique({
      where: { id: itemId },
    });
  }

  async getFileStream(
    record: TransformationHistory,
  ): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
    if (!record.fileId || record.expiresAt < new Date()) {
      throw new NotFoundException();
    }

    const stream = await this.storage.download(record.fileId);
    return {
      stream,
      contentType: record.fileContentType ?? 'application/octet-stream',
    };
  }

  private toHistoryItem(row: TransformationHistory): HistoryItem {
    return {
      id: row.id,
      type: row.type,
      sourceFormat: row.sourceFormat,
      targetFormat: row.targetFormat,
      status: row.status,
      fileSize: row.fileSize,
      durationMs: row.durationMs,
      errorCode: row.errorCode,
      hasSavedFile: row.fileId !== null && row.expiresAt >= new Date(),
      createdAt: row.createdAt,
    };
  }
}
