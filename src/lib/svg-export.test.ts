import { describe, expect, it, vi } from 'vitest';
import { buildExportFileName, copySvgSourceToClipboard, downloadSvgSource, getExportVariantLabel } from './svg-export';

describe('buildExportFileName', () => {
  it('preserves the base file name for current exports', () => {
    expect(buildExportFileName('sample.svg', 'current')).toBe('sample.svg');
  });

  it('adds a normalized suffix for safe exports', () => {
    expect(buildExportFileName('sample.svg', 'safe')).toBe('sample.normalized.svg');
  });

  it('adds a blender preset suffix for blender exports', () => {
    expect(buildExportFileName('sample.svg', 'blender')).toBe('sample.blender.svg');
  });

  it('falls back to a default file name when empty', () => {
    expect(buildExportFileName('', 'safe')).toBe('graphic.normalized.svg');
  });
});

describe('getExportVariantLabel', () => {
  it('returns stable labels for each preset', () => {
    expect(getExportVariantLabel('current')).toBe('Current SVG');
    expect(getExportVariantLabel('safe')).toBe('Normalized SVG');
    expect(getExportVariantLabel('blender')).toBe('Blender-friendly SVG');
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