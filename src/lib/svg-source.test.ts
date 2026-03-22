import { describe, expect, it } from 'vitest';
import { EMPTY_SVG_TEMPLATE, clearSvgSource, optimizeSvgSource, prettifySvgSource } from './svg-source';

describe('svg-source', () => {
  it('prettifies nested SVG markup into an indented layout', () => {
    const result = prettifySvgSource('<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="10" height="10" /></g></svg>');

    expect(result).toContain('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(result).toContain('  <g>');
    expect(result).toContain('    <rect width="10" height="10" />');
  });

  it('optimizes SVG markup by removing comments and layout whitespace', () => {
    const result = optimizeSvgSource(`<svg xmlns="http://www.w3.org/2000/svg">
      <!-- layout -->
      <g>
        <rect width="10" height="10" />
      </g>
    </svg>`);

    expect(result).not.toContain('<!-- layout -->');
    expect(result).not.toContain('\n');
    expect(result).toContain('<g><rect width="10" height="10"/></g>');
  });

  it('preserves meaningful text content during optimization', () => {
    const result = optimizeSvgSource('<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="10">Hello world</text></svg>');

    expect(result).toContain('>Hello world</text>');
  });

  it('clears the source to a blank SVG template', () => {
    expect(clearSvgSource()).toBe(EMPTY_SVG_TEMPLATE);
  });
});