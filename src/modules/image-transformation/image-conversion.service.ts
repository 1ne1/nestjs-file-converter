import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';

import { ConfigService } from '@/core/config/config.service';

import {
  ImageFormat,
  RasterFormat,
  SUPPORTED_DIRECTIONS,
} from './image-format.types';
import { assertSvgIsSafe } from './svg-safety';

export interface ConvertImageParams {
  buffer: Buffer;
  extFormat: ImageFormat;
  targetFormat: RasterFormat;
  quality?: number;
  width?: number;
  height?: number;
  background?: string;
}

const CONVERSION_TIMEOUT_SECONDS = 30;

@Injectable()
export class ImageConversionService {
  constructor(private readonly config: ConfigService) {}

  async convert(params: ConvertImageParams): Promise<Buffer> {
    const { buffer, extFormat, targetFormat, quality } = params;
    const background = params.background ?? '#ffffff';

    const sizeLimit = this.getSizeLimit(extFormat);
    if (buffer.length > sizeLimit) {
      throw new PayloadTooLargeException(
        `File exceeds the ${extFormat} size limit of ${sizeLimit} bytes`,
      );
    }

    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(buffer, { limitInputPixels: true }).metadata();
    } catch {
      throw new BadRequestException('Invalid or corrupted image file');
    }

    const contentFormat = toImageFormat(metadata.format);
    if (contentFormat !== extFormat) {
      throw new BadRequestException(
        'File content does not match its extension',
      );
    }

    if (!SUPPORTED_DIRECTIONS[contentFormat].includes(targetFormat)) {
      throw new BadRequestException(
        `Unsupported conversion: ${contentFormat} -> ${targetFormat}`,
      );
    }

    if (contentFormat === 'svg') {
      assertSvgIsSafe(buffer.toString('utf-8'));
    }

    let pipeline = sharp(buffer, { limitInputPixels: true }).timeout({
      seconds: CONVERSION_TIMEOUT_SECONDS,
    });

    if (contentFormat === 'svg') {
      const { width, height } = this.resolveRasterDimensions(
        params.width,
        params.height,
        metadata,
      );
      pipeline = pipeline
        .resize(width, height, { fit: 'contain', background })
        .flatten({ background });
    } else if (targetFormat === 'jpeg') {
      pipeline = pipeline.flatten({ background });
    }

    try {
      return targetFormat === 'png'
        ? await pipeline.png().toBuffer()
        : await pipeline.jpeg({ quality }).toBuffer();
    } catch {
      throw new BadRequestException('Failed to convert image');
    }
  }

  private resolveRasterDimensions(
    width: number | undefined,
    height: number | undefined,
    metadata: sharp.Metadata,
  ): { width: number; height: number } {
    const maxWidth = this.config.get('IMAGE_MAX_RASTER_WIDTH');
    const maxHeight = this.config.get('IMAGE_MAX_RASTER_HEIGHT');

    if (width !== undefined || height !== undefined) {
      const resolvedWidth = width ?? Math.min(metadata.width, maxWidth);
      const resolvedHeight = height ?? Math.min(metadata.height, maxHeight);

      if (resolvedWidth > maxWidth || resolvedHeight > maxHeight) {
        throw new BadRequestException(
          `Requested dimensions exceed the maximum of ${maxWidth}x${maxHeight}`,
        );
      }
      return { width: resolvedWidth, height: resolvedHeight };
    }

    const defaultWidth = this.config.get('IMAGE_DEFAULT_RASTER_WIDTH');
    const defaultHeight = this.config.get('IMAGE_DEFAULT_RASTER_HEIGHT');

    return {
      width: Math.min(metadata.width || defaultWidth, maxWidth),
      height: Math.min(metadata.height || defaultHeight, maxHeight),
    };
  }

  private getSizeLimit(format: ImageFormat): number {
    if (format === 'png') return this.config.get('IMAGE_MAX_SIZE_PNG_BYTES');
    if (format === 'jpeg') return this.config.get('IMAGE_MAX_SIZE_JPEG_BYTES');
    return this.config.get('IMAGE_MAX_SIZE_SVG_BYTES');
  }
}

function toImageFormat(format: string): ImageFormat {
  if (format === 'png' || format === 'jpeg' || format === 'svg') {
    return format;
  }
  throw new UnsupportedMediaTypeException(
    `Unsupported image content: ${format}`,
  );
}
