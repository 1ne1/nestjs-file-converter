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
import { ConfigService } from '@/core/config/config.service';

import { targetFormatSchema } from './dto/convert.dto';
import { FormatRegistryService } from './formats/format-registry.service';
import {
  CONTENT_TYPES,
  detectFormatFromFilename,
  EXTENSIONS,
  FileFormat,
} from './formats/format.types';

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
    private readonly config: ConfigService,
  ) {}

  @Get('formats')
  @UseGuards(JwtAuthGuard)
  listFormats() {
    return this.registry.listFormats();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async convert(
    @Req() req: FastifyRequest,
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

    const targetFormatField = file.fields.targetFormat;
    const targetFormatEntry = Array.isArray(targetFormatField)
      ? targetFormatField[0]
      : targetFormatField;

    if (!targetFormatEntry || targetFormatEntry.type !== 'field') {
      throw new BadRequestException('targetFormat is required');
    }

    const targetFormatResult = targetFormatSchema.safeParse(
      targetFormatEntry.value,
    );
    if (!targetFormatResult.success) {
      throw new BadRequestException(
        'targetFormat must be one of: csv, json, xml, yaml',
      );
    }
    const targetFormat = targetFormatResult.data;

    const maxSize = this.config.get(SIZE_LIMIT_CONFIG_KEYS[sourceFormat]);
    if (buffer.length > maxSize) {
      throw new PayloadTooLargeException(
        `File exceeds the ${sourceFormat} size limit of ${maxSize} bytes`,
      );
    }

    const output = this.registry.convert(sourceFormat, targetFormat, buffer);

    res.header('Content-Type', CONTENT_TYPES[targetFormat]);
    res.header(
      'Content-Disposition',
      `attachment; filename="converted.${EXTENSIONS[targetFormat]}"`,
    );

    return output;
  }
}

function isFileTooLargeError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'FST_REQ_FILE_TOO_LARGE'
  );
}
