import { UnsupportedMediaTypeException } from '@nestjs/common';

export type ImageFormat = 'png' | 'jpeg' | 'svg';
export type RasterFormat = 'png' | 'jpeg';

export const SUPPORTED_DIRECTIONS: Record<ImageFormat, RasterFormat[]> = {
  png: ['jpeg'],
  jpeg: ['png'],
  svg: ['png', 'jpeg'],
};

export const CONTENT_TYPES: Record<RasterFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
};

export const EXTENSIONS: Record<RasterFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
};

export function detectImageFormatFromFilename(filename: string): ImageFormat {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext === 'png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'svg') return 'svg';

  throw new UnsupportedMediaTypeException(
    `Unsupported file extension: .${ext ?? ''}`,
  );
}
