import { Module } from '@nestjs/common';

import { ImageConversionService } from './image-conversion.service';
import { ImageTransformationController } from './image-transformation.controller';

@Module({
  controllers: [ImageTransformationController],
  providers: [ImageConversionService],
})
export class ImageTransformationModule {}
