import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

import type { AuthenticatedRequest } from '@/core/auth/jwt-auth.guard';

import { TransformationController } from './transformation.controller';

function multipartField(value: string) {
  return { type: 'field' as const, value };
}

function buildRequest(
  overrides: Partial<{
    filename: string;
    toBuffer: jest.Mock;
    fields: Record<string, unknown>;
    fileResolved: boolean;
  }> = {},
) {
  const {
    filename = 'input.csv',
    toBuffer = jest.fn().mockResolvedValue(Buffer.from('csv-content')),
    fields = { targetFormat: multipartField('json') },
    fileResolved = true,
  } = overrides;

  const file = fileResolved ? { filename, toBuffer, fields } : undefined;

  return {
    file: jest.fn().mockResolvedValue(file),
    user: { id: 'user-1', email: 'user1@example.com' },
  } as unknown as AuthenticatedRequest & { file: jest.Mock };
}

function buildReply() {
  return { header: jest.fn(), status: jest.fn() } as unknown as {
    header: jest.Mock;
    status: jest.Mock;
  };
}

describe('TransformationController', () => {
  let controller: TransformationController;
  let registry: { listFormats: jest.Mock };
  let conversion: { convert: jest.Mock };
  let config: { get: jest.Mock };
  let history: { record: jest.Mock };

  beforeEach(() => {
    registry = { listFormats: jest.fn() };
    conversion = {
      convert: jest.fn().mockResolvedValue(Buffer.from('json-output')),
    };
    config = { get: jest.fn().mockReturnValue(1024 * 1024) };
    history = { record: jest.fn().mockResolvedValue(undefined) };

    controller = new TransformationController(
      registry as never,
      conversion as never,
      config as never,
      history as never,
    );
  });

  it('delegates listFormats to the registry', () => {
    registry.listFormats.mockReturnValue(['direction']);
    expect(controller.listFormats()).toEqual(['direction']);
    expect(registry.listFormats).toHaveBeenCalled();
  });

  describe('convert', () => {
    it('throws BadRequestException when no file is present', async () => {
      const req = buildRequest({ fileResolved: false });
      const res = buildReply();

      await expect(
        controller.convert(req as never, res as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('converts the file, records history without a saved file, and sets headers', async () => {
      const req = buildRequest();
      const res = buildReply();

      const output = await controller.convert(req as never, res as never);

      expect(output).toEqual(Buffer.from('json-output'));
      expect(conversion.convert).toHaveBeenCalledWith(
        'csv',
        'json',
        Buffer.from('csv-content'),
      );
      expect(history.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'FILE',
          sourceFormat: 'csv',
          targetFormat: 'json',
          status: 'SUCCESS',
          fileSize: Buffer.from('csv-content').length,
          durationMs: expect.any(Number),
          save: undefined,
        }),
      );
      expect(res.header).toHaveBeenCalledWith(
        'Content-Type',
        'application/json',
      );
      expect(res.header).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="converted.json"',
      );
    });

    it('records history with the saved file when save=true', async () => {
      const req = buildRequest({
        fields: {
          targetFormat: multipartField('json'),
          save: multipartField('true'),
        },
      });
      const res = buildReply();

      await controller.convert(req as never, res as never);

      expect(history.record).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'SUCCESS',
          save: {
            buffer: Buffer.from('json-output'),
            contentType: 'application/json',
            extension: 'json',
          },
        }),
      );
    });

    it('maps FST_REQ_FILE_TOO_LARGE to PayloadTooLargeException', async () => {
      const req = buildRequest({
        toBuffer: jest
          .fn()
          .mockRejectedValue({ code: 'FST_REQ_FILE_TOO_LARGE' }),
      });
      const res = buildReply();

      await expect(
        controller.convert(req as never, res as never),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
    });

    it('rethrows other toBuffer errors unchanged', async () => {
      const req = buildRequest({
        toBuffer: jest.fn().mockRejectedValue(new Error('stream error')),
      });
      const res = buildReply();

      await expect(
        controller.convert(req as never, res as never),
      ).rejects.toThrow('stream error');
    });

    it('rejects a file larger than the configured size limit', async () => {
      config.get.mockReturnValue(1);
      const req = buildRequest();
      const res = buildReply();

      await expect(
        controller.convert(req as never, res as never),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(conversion.convert).not.toHaveBeenCalled();
    });

    it('records an ERROR history entry and rethrows when conversion fails', async () => {
      const conversionError = new BadRequestException('Invalid CSV syntax');
      conversion.convert.mockRejectedValue(conversionError);
      const req = buildRequest();
      const res = buildReply();

      await expect(controller.convert(req as never, res as never)).rejects.toBe(
        conversionError,
      );

      expect(history.record).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ERROR',
          errorCode: 'BadRequestException',
        }),
      );
    });
  });
});
