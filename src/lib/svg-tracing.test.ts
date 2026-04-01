import { describe, expect, it } from 'vitest';
import {
  buildEdgePreservedImageData,
  buildPosterizedImageData,
  buildImageTracerOptions,
  buildTracedSvgFileName,
  createRasterTraceSettings,
  isJpegRasterAsset,
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

  it('marks the posterized photo preset as posterized and recognizes jpeg assets', () => {
    const settings = createRasterTraceSettings('posterized-photo');

    expect(settings.photoCleanup).toBe(true);
    expect(settings.photoCleanupStrength).toBeGreaterThan(1);
    expect(settings.posterize).toBe(true);
    expect(settings.posterizeLevels).toBeGreaterThan(2);
    expect(isJpegRasterAsset({ name: 'scan.jpg', type: 'image/jpeg' } as File)).toBe(true);
    expect(isJpegRasterAsset({ name: 'scan.png', type: 'image/png' } as File)).toBe(false);
  });

  it('smooths photo noise without collapsing a strong edge', () => {
    const source = {
      data: new Uint8ClampedArray([
        20, 20, 20, 255,
        34, 34, 34, 255,
        245, 245, 245, 255,
      ]),
      width: 3,
      height: 1,
    } as ImageData;

    const result = buildEdgePreservedImageData(source, 2);

    expect(result.data[0]).toBeLessThan(40);
    expect(result.data[4]).toBeLessThan(70);
    expect(result.data[8]).toBeGreaterThan(220);
  });

  it('posterizes image data into a reduced set of channel values', () => {
    const source = {
      data: new Uint8ClampedArray([
      12, 82, 210, 255,
      96, 144, 222, 255,
      ]),
      width: 2,
      height: 1,
    } as ImageData;

    const result = buildPosterizedImageData(source, 4);

    expect(Array.from(result.data.slice(0, 8))).toEqual([
      0, 85, 170, 255,
      85, 170, 255, 255,
    ]);
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

  it('can remove a large near-white traced background shape without dropping interior artwork', () => {
    const result = postprocessTracedSvgMarkup(
      '<svg><rect x="0" y="0" width="100" height="100" fill="#fdfdfd" /><rect x="20" y="20" width="40" height="40" fill="#f5f5f5" /><path d="M20 20H60V60H20Z" fill="#333" /></svg>',
      100,
      100,
      { removeBackground: true },
    );

    expect(result).not.toContain('fill="#fdfdfd"');
    expect(result).toContain('fill="#f5f5f5"');
    expect(result).toContain('fill="#333"');
  });
});