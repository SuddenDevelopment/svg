import { describe, expect, it, vi } from 'vitest';
import {
  buildExportFileName,
  buildPngExportFileName,
  copySvgSourceToClipboard,
  createPngSnapshot,
  downloadSvgSource,
  getExportVariantLabel,
} from './svg-export';

describe('buildExportFileName', () => {
  it('preserves the base file name for current exports', () => {
    expect(buildExportFileName('sample.svg', 'current')).toBe('sample.svg');
  });

  it('adds a runtime suffix for browser/runtime exports', () => {
    expect(buildExportFileName('sample.svg', 'runtime')).toBe('sample.runtime.svg');
  });

  it('adds a geometry suffix for geometry-safe exports', () => {
    expect(buildExportFileName('sample.svg', 'safe')).toBe('sample.geometry.svg');
  });

  it('adds a blender preset suffix for blender exports', () => {
    expect(buildExportFileName('sample.svg', 'blender')).toBe('sample.blender.svg');
  });

  it('falls back to a default file name when empty', () => {
    expect(buildExportFileName('', 'safe')).toBe('graphic.geometry.svg');
  });
});

describe('getExportVariantLabel', () => {
  it('returns stable labels for each preset', () => {
    expect(getExportVariantLabel('current')).toBe('Current SVG');
    expect(getExportVariantLabel('runtime')).toBe('Browser/runtime SVG');
    expect(getExportVariantLabel('safe')).toBe('Geometry-safe SVG');
    expect(getExportVariantLabel('blender')).toBe('Blender-friendly SVG');
  });
});

describe('buildPngExportFileName', () => {
  it('adds a png suffix for the selected preset variant', () => {
    expect(buildPngExportFileName('sample.svg', 'current')).toBe('sample.png');
    expect(buildPngExportFileName('sample.svg', 'runtime')).toBe('sample.runtime.png');
    expect(buildPngExportFileName('sample.svg', 'safe')).toBe('sample.geometry.png');
    expect(buildPngExportFileName('sample.svg', 'blender')).toBe('sample.blender.png');
  });
});

describe('downloadSvgSource', () => {
  it('creates and revokes an object URL for download', () => {
    const createObjectURL = vi.fn(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    HTMLAnchorElement.prototype.click = click;

    try {
      downloadSvgSource('<svg />', 'sample.svg');
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
    }

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });
});

describe('createPngSnapshot', () => {
  it('rasterizes svg markup into a png blob using svg dimensions', async () => {
    const createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:svg-source');
    const revokeObjectURL = vi.fn();
    const drawImage = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalImage = globalThis.Image;
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement');

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    globalThis.Image = MockImage as unknown as typeof Image;
    createElementSpy.mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage }),
          toBlob: (callback: BlobCallback, type?: string) => {
            callback(new Blob(['png-bytes'], { type: type ?? 'image/png' }));
          },
        } as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName as keyof HTMLElementTagNameMap, options);
    }) as typeof document.createElement);

    try {
      const result = await createPngSnapshot('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" /></svg>');

      expect(result.width).toBe(40);
      expect(result.height).toBe(20);
      expect(result.blob.type).toBe('image/png');
      expect(drawImage).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:svg-source');
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      globalThis.Image = originalImage;
      createElementSpy.mockRestore();
    }
  });
});

describe('copySvgSourceToClipboard', () => {
  it('writes svg content to the clipboard when available', async () => {
    const writeText = vi.fn(async () => undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      await copySvgSourceToClipboard('<svg />');
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      }
    }

    expect(writeText).toHaveBeenCalledWith('<svg />');
  });
});