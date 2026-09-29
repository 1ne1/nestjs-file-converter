import { Module } from '@nestjs/common';

import { FormatRegistryService } from './formats/format-registry.service';
import { WorkerConversionService } from './formats/worker-conversion.service';
import { TransformationController } from './transformation.controller';

@Module({
  controllers: [TransformationController],
  providers: [FormatRegistryService, WorkerConversionService],
})
export class TransformationModule {}
