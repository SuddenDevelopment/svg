import { describe, expect, it } from 'vitest';
import {
  buildImageTracerOptions,
  buildTracedSvgFileName,
  createRasterTraceSettings,
  isSupportedRasterFile,
  postprocessTracedSvgMarkup,
} from './svg-tracing';

describe('svg-tracing', () => {
  it('recognizes supported raster file types by mime type and extension', () => {
    expect(isSupportedRasterFile({ name: 'poster.png', type: 'image/png' } as File)).toBe(true);
    expect(isSupportedRasterFile({ name: 'poster.tiff', type: '' } as File)).toBe(true);
    expect(isSupportedRasterFile({ name: 'vector.svg', type: 'image/svg+xml' } as File)).toBe(false);
    expect(isSupportedRasterFile({ name: 'notes.txt', type: 'text/plain' } as File)).toBe(false);
  });

  it('builds traced file names with an svg suffix', () => {
    expect(buildTracedSvgFileName('poster.png')).toBe('poster-traced.svg');
    expect(buildTracedSvgFileName('multi.part.name.webp')).toBe('multi.part.name-traced.svg');
  });

  it('maps monochrome settings to a two-color imagetracer configuration', () => {
    const settings = createRasterTraceSettings('logo');
    const options = buildImageTracerOptions(settings);

    expect(options.numberofcolors).toBe(2);
    expect(options.viewbox).toBe(true);
    expect(options.strokewidth).toBe(0);
    expect(options.pal).toHaveLength(2);
  });

  it('normalizes traced svg output and removes white fills when requested', () => {
    const result = postprocessTracedSvgMarkup(
      '<svg><path d="M0 0H10V10H0Z" fill="#ffffff" /><path d="M1 1H9V9H1Z" fill="#000" /></svg>',
      10,
      10,
      true,
    );

    expect(result).toContain('viewBox="0 0 10 10"');
    expect(result).not.toContain('#ffffff');
    expect(result).toContain('fill="#000"');
  });
});