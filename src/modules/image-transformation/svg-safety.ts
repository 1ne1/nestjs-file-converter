import { BadRequestException } from '@nestjs/common';

const UNSAFE_PATTERNS: RegExp[] = [
  /<script\b/i,
  /\son\w+\s*=/i,
  /<!doctype/i,
  /<!entity/i,
  /(?:xlink:href|href)\s*=\s*["']?\s*(?:https?:|ftp:)/i,
];

export function assertSvgIsSafe(svg: string): void {
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(svg)) {
      throw new BadRequestException(
        'SVG contains unsafe or unsupported content (scripts, event handlers, or external references)',
      );
    }
  }
}
