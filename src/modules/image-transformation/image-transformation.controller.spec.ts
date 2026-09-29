import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

import type { AuthenticatedRequest } from '@/core/auth/jwt-auth.guard';

import { ImageTransformationController } from './image-transformation.controller';

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
    filename = 'input.png',
    toBuffer = jest.fn().mockResolvedValue(Buffer.from('png-content')),
    fields = { targetFormat: multipartField('jpeg') },
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

describe('ImageTransformationController', () => {
  let controller: ImageTransformationController;
  let imageConversion: { convert: jest.Mock };
  let history: { record: jest.Mock };

  beforeEach(() => {
    imageConversion = {
      convert: jest.fn().mockResolvedValue(Buffer.from('jpeg-output')),
    };
    history = { record: jest.fn().mockResolvedValue(undefined) };

    controller = new ImageTransformationController(
      imageConversion as never,
      history as never,
    );
  });

  it('builds the format list from SUPPORTED_DIRECTIONS', () => {
    expect(controller.listFormats()).toEqual([
      { source: 'png', target: ['jpeg'] },
      { source: 'jpeg', target: ['png'] },
      { source: 'svg', target: ['png', 'jpeg'] },
    ]);
  });

  describe('convert', () => {
    it('throws BadRequestException when no file is present', async () => {
      const req = buildRequest({ fileResolved: false });
      const res = buildReply();

      await expect(
        controller.convert(req as never, res as never),
      ).rejects.toBeInstanceOf(BadRequestException);
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

    it('rejects targetFormat=svg before calling the conversion service', async () => {
      const req = buildRequest({
        fields: { targetFormat: multipartField('svg') },
      });
      const res = buildReply();

      await expect(
        controller.convert(req as never, res as never),
      ).rejects.toThrow('Converting to SVG (vectorization) is not supported');
      expect(imageConversion.convert).not.toHaveBeenCalled();
    });

    it('converts with no optional fields, defaults save to false, and sets headers', async () => {
      const req = buildRequest();
      const res = buildReply();

      const output = await controller.convert(req as never, res as never);

      expect(output).toEqual(Buffer.from('jpeg-output'));
      expect(imageConversion.convert).toHaveBeenCalledWith({
        buffer: Buffer.from('png-content'),
        extFormat: 'png',
        targetFormat: 'jpeg',
        quality: undefined,
        width: undefined,
        height: undefined,
        background: undefined,
      });
      expect(history.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'IMAGE',
          sourceFormat: 'png',
          targetFormat: 'jpeg',
          status: 'SUCCESS',
          save: undefined,
        }),
      );
      expect(res.header).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(res.header).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="converted.jpg"',
      );
    });

    it('parses optional quality/width/height/background and passes save through', async () => {
      const req = buildRequest({
        fields: {
          targetFormat: multipartField('jpeg'),
          quality: multipartField('80'),
          width: multipartField('200'),
          height: multipartField('150'),
          background: multipartField('#ffffff'),
          save: multipartField('true'),
        },
      });
      const res = buildReply();

      await controller.convert(req as never, res as never);

      expect(imageConversion.convert).toHaveBeenCalledWith({
        buffer: Buffer.from('png-content'),
        extFormat: 'png',
        targetFormat: 'jpeg',
        quality: 80,
        width: 200,
        height: 150,
        background: '#ffffff',
      });
      expect(history.record).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'SUCCESS',
          save: {
            buffer: Buffer.from('jpeg-output'),
            contentType: 'image/jpeg',
            extension: 'jpg',
          },
        }),
      );
    });

    it('records an ERROR history entry and rethrows when conversion fails', async () => {
      const conversionError = new BadRequestException(
        'Invalid or corrupted image file',
      );
      imageConversion.convert.mockRejectedValue(conversionError);
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
