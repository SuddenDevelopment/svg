import { describe, expect, it } from 'vitest';
import { reorderElementsInSource, translateElementsInSource } from './svg-style';

describe('translateElementsInSource', () => {
  it('adds a translate transform to selected elements without an existing transform', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /><circle cx="30" cy="30" r="8" /></svg>';

    const result = translateElementsInSource(source, ['0.1'], 18, 12);

    expect(result.updatedCount).toBe(1);
    expect(result.skippedPaths).toEqual([]);
    expect(result.source).toContain('<rect width="12" height="12"/>');
    expect(result.source).toContain('<circle cx="30" cy="30" r="8" transform="translate(18 12)"/>');
  });

  it('merges with an existing trailing translate transform', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" transform="rotate(15) translate(4 6)" /></svg>';

    const result = translateElementsInSource(source, ['0.0'], -2, 5);

    expect(result.updatedCount).toBe(1);
    expect(result.source).toContain('transform="rotate(15) translate(2 11)"');
  });

  it('skips unresolved target paths', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';

    const result = translateElementsInSource(source, ['0.9'], 5, 5);

    expect(result.updatedCount).toBe(0);
    expect(result.skippedPaths).toEqual(['0.9']);
    expect(result.source).toContain('<rect width="12" height="12"/>');
    expect(result.source).not.toContain('transform=');
  });
});

describe('reorderElementsInSource', () => {
  it('moves a selected element one step forward in display order and remaps its path', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="rear" /><rect id="middle" /><rect id="front" /></svg>';

    const result = reorderElementsInSource(source, ['0.0'], 'forward');

    expect(result.updatedCount).toBe(1);
    expect(result.skippedPaths).toEqual([]);
    expect(result.pathMap).toEqual({ '0.0': '0.1' });
    expect(result.source).toContain('<rect id="middle"/><rect id="rear"/><rect id="front"/>');
  });

  it('moves selected siblings backward together while preserving their relative order', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="a" /><rect id="b" /><rect id="c" /><rect id="d" /></svg>';

    const result = reorderElementsInSource(source, ['0.2', '0.3'], 'backward');

    expect(result.updatedCount).toBe(2);
    expect(result.pathMap).toEqual({
      '0.2': '0.1',
      '0.3': '0.2',
    });
    expect(result.source).toContain('<rect id="a"/><rect id="c"/><rect id="d"/><rect id="b"/>');
  });
});