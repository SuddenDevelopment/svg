import { describe, expect, it } from 'vitest';
import {
  buildAlphaFlattenedImageData,
  buildDominantPalette,
  buildEdgePreservedImageData,
  buildPosterizedImageData,
  buildImageTracerOptions,
  buildTracedSvgFileName,
  createRasterTraceSettings,
  isFlatLogoRasterAsset,
  isJpegRasterAsset,
  isSupportedRasterFile,
  postprocessTracedSvgMarkup,
  snapImageDataToPalette,
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

  it('provides a flat-logo preset for transparent low-color artwork', () => {
    const settings = createRasterTraceSettings('flat-logo');

    expect(settings.alphaCleanup).toBe(true);
    expect(settings.paletteTracing).toBe(true);
    expect(settings.removeInnerFragments).toBe(true);
    expect(isFlatLogoRasterAsset({
      fileName: 'logo.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,aaaa',
      width: 10,
      height: 10,
      bytes: 4,
      hasTransparency: true,
      isFlatArtwork: true,
    })).toBe(true);
  });

  it('flattens semi-transparent antialiasing into solid or transparent pixels', () => {
    const source = {
      data: new Uint8ClampedArray([
        12, 82, 210, 120,
        12, 82, 210, 220,
      ]),
      width: 2,
      height: 1,
    } as ImageData;

    const result = buildAlphaFlattenedImageData(source, 200);

    expect(Array.from(result.data.slice(0, 8))).toEqual([
      0, 0, 0, 0,
      12, 82, 210, 255,
    ]);
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

  it('extracts dominant colors and snaps opaque pixels to that palette', () => {
    const source = {
      data: new Uint8ClampedArray([
        2, 64, 120, 255,
        10, 70, 126, 255,
        190, 0, 20, 255,
        194, 2, 24, 255,
      ]),
      width: 4,
      height: 1,
    } as ImageData;

    const palette = buildDominantPalette(source, 2, 16);
    const snapped = snapImageDataToPalette(source, palette);

    expect(palette).toHaveLength(2);
    expect(new Set(Array.from(snapped.data).filter((_, index) => index % 4 !== 3))).toContain(0);
    expect(Array.from(snapped.data.slice(0, 4))).toEqual([palette[0].r, palette[0].g, palette[0].b, 255]);
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

  it('normalizes flat-logo color families and removes nested same-color fragments', () => {
    const result = postprocessTracedSvgMarkup(
      '<svg><path d="M0 0H40V40H0Z" fill="rgb(0,64,128)" /><path d="M5 5H25V25H5Z" fill="rgb(0,64,64)" /><path d="M50 0H90V40H50Z" fill="rgb(192,0,0)" /><path d="M55 5H75V25H55Z" fill="rgb(192,0,64)" /></svg>',
      100,
      40,
      { normalizeColorFamilies: true, removeContainedColorFragments: true },
    );

    expect(result).toContain('rgb(0,64,128)');
    expect(result).not.toContain('rgb(0,64,64)');
    expect(result).toContain('rgb(192,0,0)');
    expect(result).not.toContain('rgb(192,0,64)');
  });
});