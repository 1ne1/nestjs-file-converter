import { BadRequestException } from '@nestjs/common';

import { assertSvgIsSafe } from './svg-safety';

describe('assertSvgIsSafe', () => {
  it('does not throw for a plain safe SVG', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>';
    expect(() => assertSvgIsSafe(svg)).not.toThrow();
  });

  it('does not throw for an internal fragment reference', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" xlink:href="#g"/></svg>';
    expect(() => assertSvgIsSafe(svg)).not.toThrow();
  });

  it('throws for an embedded script tag', () => {
    const svg = '<svg><script>alert(1)</script></svg>';
    expect(() => assertSvgIsSafe(svg)).toThrow(BadRequestException);
  });

  it('throws for a script tag regardless of case', () => {
    const svg = '<svg><SCRIPT>alert(1)</SCRIPT></svg>';
    expect(() => assertSvgIsSafe(svg)).toThrow(BadRequestException);
  });

  it('throws for an onclick event handler attribute', () => {
    const svg = '<svg><rect onclick="alert(1)" width="1" height="1"/></svg>';
    expect(() => assertSvgIsSafe(svg)).toThrow(BadRequestException);
  });

  it('throws for an onload event handler attribute', () => {
    const svg = '<svg onload="alert(1)"></svg>';
    expect(() => assertSvgIsSafe(svg)).toThrow(BadRequestException);
  });

  it('throws for a DOCTYPE declaration', () => {
    const svg = '<!DOCTYPE svg><svg></svg>';
    expect(() => assertSvgIsSafe(svg)).toThrow(BadRequestException);
  });

  it('throws for an ENTITY declaration', () => {
    const svg =
      '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>';
    expect(() => assertSvgIsSafe(svg)).toThrow(BadRequestException);
  });

  it('throws for an external http href reference', () => {
    const svg = '<svg><image href="http://evil.example.com/track.png"/></svg>';
    expect(() => assertSvgIsSafe(svg)).toThrow(BadRequestException);
  });

  it('throws for an external https xlink:href reference', () => {
    const svg =
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="https://evil.example.com/track.png"/></svg>';
    expect(() => assertSvgIsSafe(svg)).toThrow(BadRequestException);
  });

  it('throws for an external ftp reference', () => {
    const svg = '<svg><image href="ftp://evil.example.com/file"/></svg>';
    expect(() => assertSvgIsSafe(svg)).toThrow(BadRequestException);
  });

  it('includes a descriptive message', () => {
    const svg = '<svg><script>alert(1)</script></svg>';
    try {
      assertSvgIsSafe(svg);
      throw new Error('expected assertSvgIsSafe to throw');
    } catch (error) {
      expect((error as BadRequestException).message).toContain('unsafe');
    }
  });
});
