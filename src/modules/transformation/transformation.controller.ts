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
import { ConfigService } from '@/core/config/config.service';
import {
  isFileTooLargeError,
  parseOptionalMultipartField,
  parseRequiredMultipartField,
} from '@/core/http/multipart-field';
import { TransformationType } from '@/generated/prisma/client';
import { saveFlagSchema } from '@/modules/transformation-history/dto/save-flag.dto';
import { TransformationHistoryService } from '@/modules/transformation-history/transformation-history.service';

import { targetFormatSchema } from './dto/convert.dto';
import { FormatRegistryService } from './formats/format-registry.service';
import {
  CONTENT_TYPES,
  detectFormatFromFilename,
  EXTENSIONS,
  FileFormat,
} from './formats/format.types';
import { WorkerConversionService } from './formats/worker-conversion.service';

type SizeLimitConfigKey =
  | 'CONVERT_MAX_SIZE_CSV_BYTES'
  | 'CONVERT_MAX_SIZE_JSON_BYTES'
  | 'CONVERT_MAX_SIZE_XML_BYTES'
  | 'CONVERT_MAX_SIZE_YAML_BYTES';

const SIZE_LIMIT_CONFIG_KEYS: Record<FileFormat, SizeLimitConfigKey> = {
  csv: 'CONVERT_MAX_SIZE_CSV_BYTES',
  json: 'CONVERT_MAX_SIZE_JSON_BYTES',
  xml: 'CONVERT_MAX_SIZE_XML_BYTES',
  yaml: 'CONVERT_MAX_SIZE_YAML_BYTES',
};

@Controller('api/convert')
export class TransformationController {
  constructor(
    private readonly registry: FormatRegistryService,
    private readonly conversion: WorkerConversionService,
    private readonly config: ConfigService,
    private readonly history: TransformationHistoryService,
  ) {}

  @Get('formats')
  @UseGuards(JwtAuthGuard)
  listFormats() {
    return this.registry.listFormats();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async convert(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const file = await req.file();
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const sourceFormat = detectFormatFromFilename(file.filename);

    // Fields declared after the file part in the multipart body (e.g.
    // targetFormat) aren't populated on file.fields until the file stream
    // is fully drained, so toBuffer() must run before reading them.
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (error) {
      if (isFileTooLargeError(error)) {
        throw new PayloadTooLargeException('Uploaded file is too large');
      }
      throw error;
    }

    const targetFormat = parseRequiredMultipartField(
      file.fields.targetFormat,
      targetFormatSchema,
      'targetFormat must be one of: csv, json, xml, yaml',
    );

    const save =
      parseOptionalMultipartField(
        file.fields.save,
        saveFlagSchema,
        'save must be a boolean',
      ) ?? false;

    const maxSize = this.config.get(SIZE_LIMIT_CONFIG_KEYS[sourceFormat]);
    if (buffer.length > maxSize) {
      throw new PayloadTooLargeException(
        `File exceeds the ${sourceFormat} size limit of ${maxSize} bytes`,
      );
    }

    const startedAt = Date.now();
    let output: Buffer;
    try {
      output = await this.conversion.convert(
        sourceFormat,
        targetFormat,
        buffer,
      );
    } catch (error) {
      void this.history.record({
        userId: req.user.id,
        type: TransformationType.FILE,
        sourceFormat,
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
      type: TransformationType.FILE,
      sourceFormat,
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
  if (error && typeof error === 'object' && 'errorCode' in error) {
    return String((error as { errorCode: unknown }).errorCode);
  }
  return error instanceof Error ? error.constructor.name : 'UnknownError';
}
