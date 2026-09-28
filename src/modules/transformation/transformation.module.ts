import { Module } from '@nestjs/common';

import { FormatRegistryService } from './formats/format-registry.service';
import { TransformationController } from './transformation.controller';

@Module({
  controllers: [TransformationController],
  providers: [FormatRegistryService],
})
export class TransformationModule {}
