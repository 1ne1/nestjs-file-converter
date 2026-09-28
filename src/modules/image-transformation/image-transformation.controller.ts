import {
  BadRequestException,
  Controller,
  Get,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { JwtAuthGuard } from '@/core/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '@/core/auth/jwt-auth.guard';
import {
  isFileTooLargeError,
  parseOptionalMultipartField,
  parseRequiredMultipartField,
} from '@/core/http/multipart-field';
import { TransformationType } from '@/generated/prisma/client';
import { saveFlagSchema } from '@/modules/transformation-history/dto/save-flag.dto';
import { TransformationHistoryService } from '@/modules/transformation-history/transformation-history.service';

import {
  backgroundSchema,
  dimensionSchema,
  qualitySchema,
  targetImageFormatSchema,
} from './dto/convert-image.dto';
import { ImageConversionService } from './image-conversion.service';
import {
  CONTENT_TYPES,
  detectImageFormatFromFilename,
  EXTENSIONS,
  ImageFormat,
  RasterFormat,
  SUPPORTED_DIRECTIONS,
} from './image-format.types';

@Controller('api/images')
export class ImageTransformationController {
  constructor(
    private readonly imageConversion: ImageConversionService,
    private readonly history: TransformationHistoryService,
  ) {}

  @Get('convert/formats')
  @UseGuards(JwtAuthGuard)
  listFormats() {
    return (Object.keys(SUPPORTED_DIRECTIONS) as ImageFormat[]).map(
      (source) => ({
        source,
        target: SUPPORTED_DIRECTIONS[source],
      }),
    );
  }

  @Post('convert')
  @UseGuards(JwtAuthGuard)
  async convert(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const file = await req.file();
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const extFormat = detectImageFormatFromFilename(file.filename);

    // toBuffer() must run before reading other fields - see the file
    // conversion module for why.
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (error) {
      if (isFileTooLargeError(error)) {
        throw new PayloadTooLargeException('Uploaded file is too large');
      }
      throw error;
    }

    const requestedFormat = parseRequiredMultipartField(
      file.fields.targetFormat,
      targetImageFormatSchema,
      'targetFormat must be one of: png, jpeg, svg',
    );

    if (requestedFormat === 'svg') {
      throw new BadRequestException(
        'Converting to SVG (vectorization) is not supported',
      );
    }
    const targetFormat: RasterFormat = requestedFormat;

    const quality = parseOptionalMultipartField(
      file.fields.quality,
      qualitySchema,
      'quality must be an integer between 1 and 100',
    );
    const width = parseOptionalMultipartField(
      file.fields.width,
      dimensionSchema,
      'width must be a positive integer',
    );
    const height = parseOptionalMultipartField(
      file.fields.height,
      dimensionSchema,
      'height must be a positive integer',
    );
    const background = parseOptionalMultipartField(
      file.fields.background,
      backgroundSchema,
      'background must be a non-empty string',
    );
    const save =
      parseOptionalMultipartField(
        file.fields.save,
        saveFlagSchema,
        'save must be a boolean',
      ) ?? false;

    const startedAt = Date.now();
    let output: Buffer;
    try {
      output = await this.imageConversion.convert({
        buffer,
        extFormat,
        targetFormat,
        quality,
        width,
        height,
        background,
      });
    } catch (error) {
      void this.history.record({
        userId: req.user.id,
        type: TransformationType.IMAGE,
        sourceFormat: extFormat,
        targetFormat,
        status: 'ERROR',
        fileSize: buffer.length,
        durationMs: Date.now() - startedAt,
        errorCode: errorCodeOf(error),
      });
      throw error;
    }

    void this.history.record({
      userId: req.user.id,
      type: TransformationType.IMAGE,
      sourceFormat: extFormat,
      targetFormat,
      status: 'SUCCESS',
      fileSize: buffer.length,
      durationMs: Date.now() - startedAt,
      save: save
        ? {
            buffer: output,
            contentType: CONTENT_TYPES[targetFormat],
            extension: EXTENSIONS[targetFormat],
          }
        : undefined,
    });

    res.header('Content-Type', CONTENT_TYPES[targetFormat]);
    res.header(
      'Content-Disposition',
      `attachment; filename="converted.${EXTENSIONS[targetFormat]}"`,
    );

    return output;
  }
}

function errorCodeOf(error: unknown): string {
  return error instanceof Error ? error.constructor.name : 'UnknownError';
}
