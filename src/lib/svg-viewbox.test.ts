import { describe, expect, it } from 'vitest';
import { cropViewBoxToElements, removeViewBoxFromSource, setViewBoxToWorkspaceArea } from './svg-viewbox';

describe('setViewBoxToWorkspaceArea', () => {
  it('sets the viewBox to the explicit root workspace dimensions', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="10 12 40 22"><rect width="12" height="12" /></svg>';

    const result = setViewBoxToWorkspaceArea(source);

    expect(result.changed).toBe(true);
    expect(result.viewBox).toBe('0 0 320 180');
    expect(result.source).toContain('viewBox="0 0 320 180"');
  });
});

describe('cropViewBoxToElements', () => {
  it('crops the root viewBox to the transformed element bounds', () => {
    const source = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">',
      '<g transform="translate(10 15)"><rect x="5" y="6" width="20" height="10" /></g>',
      '<circle cx="50" cy="30" r="5" />',
      '</svg>',
    ].join('');

    const result = cropViewBoxToElements(source);

    expect(result.changed).toBe(true);
    expect(result.viewBox).toBe('15 21 40 14');
    expect(result.source).toContain('viewBox="15 21 40 14"');
  });
});

describe('removeViewBoxFromSource', () => {
  it('removes the root viewBox and preserves explicit dimensions when needed', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="5 6 70 80"><rect width="12" height="12" /></svg>';

    const result = removeViewBoxFromSource(source);

    expect(result.changed).toBe(true);
    expect(result.viewBox).toBeNull();
    expect(result.source).not.toContain('viewBox=');
    expect(result.source).toContain('width="70"');
    expect(result.source).toContain('height="80"');
  });
});