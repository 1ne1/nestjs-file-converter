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
import type { FastifyReply, FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/core/auth/jwt-auth.guard';
import {
  isFileTooLargeError,
  parseOptionalMultipartField,
  parseRequiredMultipartField,
} from '@/core/http/multipart-field';

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
  constructor(private readonly imageConversion: ImageConversionService) {}

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
    @Req() req: FastifyRequest,
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

    const output = await this.imageConversion.convert({
      buffer,
      extFormat,
      targetFormat,
      quality,
      width,
      height,
      background,
    });

    res.header('Content-Type', CONTENT_TYPES[targetFormat]);
    res.header(
      'Content-Disposition',
      `attachment; filename="converted.${EXTENSIONS[targetFormat]}"`,
    );

    return output;
  }
}
