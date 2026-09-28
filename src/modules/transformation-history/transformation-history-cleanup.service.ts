import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '@/core/database/prisma.service';
import { StorageService } from '@/core/storage/storage.service';

@Injectable()
export class TransformationHistoryCleanupService {
  private readonly logger = new Logger(
    TransformationHistoryCleanupService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpired(): Promise<void> {
    const expired = await this.prisma.transformationHistory.findMany({
      where: { expiresAt: { lt: new Date() } },
      select: { id: true, fileId: true },
    });

    if (expired.length === 0) {
      return;
    }

    for (const record of expired) {
      if (record.fileId) {
        try {
          await this.storage.delete(record.fileId);
        } catch (error) {
          this.logger.error(
            `Failed to delete expired transformation file ${record.fileId}: ${String(error)}`,
          );
        }
      }
    }

    await this.prisma.transformationHistory.deleteMany({
      where: { id: { in: expired.map((record) => record.id) } },
    });

    this.logger.log(
      `Purged ${expired.length} expired transformation record(s)`,
    );
  }
}
