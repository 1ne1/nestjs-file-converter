import sharp from 'sharp';

import { ConfigService } from '@/core/config/config.service';

import { ImageConversionService } from './image-conversion.service';

describe('ImageConversionService', () => {
  let configValues: Record<string, unknown>;
  let config: ConfigService;
  let service: ImageConversionService;

  const redPng = () =>
    sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

  const blueJpeg = () =>
    sharp({
      create: {
        width: 12,
        height: 12,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();

  const svg = (extra = '') =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30">${extra}<rect width="20" height="30" fill="blue"/></svg>`,
    );

  beforeEach(() => {
    configValues = {
      IMAGE_MAX_SIZE_PNG_BYTES: 5 * 1024 * 1024,
      IMAGE_MAX_SIZE_JPEG_BYTES: 5 * 1024 * 1024,
      IMAGE_MAX_SIZE_SVG_BYTES: 5 * 1024 * 1024,
      IMAGE_MAX_RASTER_WIDTH: 4096,
      IMAGE_MAX_RASTER_HEIGHT: 4096,
      IMAGE_DEFAULT_RASTER_WIDTH: 800,
      IMAGE_DEFAULT_RASTER_HEIGHT: 600,
    };
    config = {
      get: (key: string) => configValues[key],
    } as unknown as ConfigService;
    service = new ImageConversionService(config);
  });

  it('converts png to jpeg', async () => {
    const output = await service.convert({
      buffer: await redPng(),
      extFormat: 'png',
      targetFormat: 'jpeg',
    });

    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('jpeg');
  });

  it('converts jpeg to png', async () => {
    const output = await service.convert({
      buffer: await blueJpeg(),
      extFormat: 'jpeg',
      targetFormat: 'png',
    });

    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('png');
  });

  it('rasterizes svg to png using the intrinsic size when no dimensions are given', async () => {
    const output = await service.convert({
      buffer: svg(),
      extFormat: 'svg',
      targetFormat: 'png',
    });

    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(20);
    expect(metadata.height).toBe(30);
  });

  it('rasterizes svg to jpeg using explicit width and height', async () => {
    const output = await service.convert({
      buffer: svg(),
      extFormat: 'svg',
      targetFormat: 'jpeg',
      width: 50,
      height: 40,
    });

    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(50);
    expect(metadata.height).toBe(40);
  });

  it('clamps svg rasterization to the configured maximum dimensions when no explicit size is given', async () => {
    configValues.IMAGE_MAX_RASTER_WIDTH = 15;
    configValues.IMAGE_MAX_RASTER_HEIGHT = 15;

    const output = await service.convert({
      buffer: svg(),
      extFormat: 'svg',
      targetFormat: 'png',
    });

    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(15);
    expect(metadata.height).toBe(15);
  });

  it('rejects when requested dimensions exceed the configured maximum', async () => {
    configValues.IMAGE_MAX_RASTER_WIDTH = 100;
    configValues.IMAGE_MAX_RASTER_HEIGHT = 100;

    await expect(
      service.convert({
        buffer: svg(),
        extFormat: 'svg',
        targetFormat: 'png',
        width: 500,
        height: 50,
      }),
    ).rejects.toMatchObject({
      message: 'Requested dimensions exceed the maximum of 100x100',
    });
  });

  it('rejects when the file content does not match its extension', async () => {
    await expect(
      service.convert({
        buffer: await blueJpeg(),
        extFormat: 'png',
        targetFormat: 'jpeg',
      }),
    ).rejects.toMatchObject({
      message: 'File content does not match its extension',
    });
  });

  it('rejects when the source file exceeds its configured size limit', async () => {
    configValues.IMAGE_MAX_SIZE_PNG_BYTES = 5;

    await expect(
      service.convert({
        buffer: await redPng(),
        extFormat: 'png',
        targetFormat: 'jpeg',
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('exceeds the png size limit'),
    });
  });

  it('rejects an svg containing a script tag', async () => {
    await expect(
      service.convert({
        buffer: svg('<script>alert(1)</script>'),
        extFormat: 'svg',
        targetFormat: 'png',
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('unsafe or unsupported content'),
    });
  });

  it('rejects corrupted image data', async () => {
    await expect(
      service.convert({
        buffer: Buffer.from('not an image'),
        extFormat: 'png',
        targetFormat: 'jpeg',
      }),
    ).rejects.toMatchObject({
      message: 'Invalid or corrupted image file',
    });
  });

  it('rejects an unsupported conversion direction', async () => {
    await expect(
      service.convert({
        buffer: await redPng(),
        extFormat: 'png',
        targetFormat: 'png' as never,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Unsupported conversion'),
    });
  });
});
