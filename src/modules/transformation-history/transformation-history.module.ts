import { Global, Module } from '@nestjs/common';

import { TransformationHistoryCleanupService } from './transformation-history-cleanup.service';
import { TransformationHistoryController } from './transformation-history.controller';
import { TransformationHistoryService } from './transformation-history.service';

@Global()
@Module({
  controllers: [TransformationHistoryController],
  providers: [
    TransformationHistoryService,
    TransformationHistoryCleanupService,
  ],
  exports: [TransformationHistoryService],
})
export class TransformationHistoryModule {}
