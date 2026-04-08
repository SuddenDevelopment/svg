import { describe, expect, it } from 'vitest';
import {
  isKnownElement,
  isKnownAttribute,
  getAllowedAttributes,
  getKnownElementNames,
  isPresentationAttribute,
  collectWhitelistViolations,
} from './svg-whitelist';

describe('isKnownElement', () => {
  it('recognises standard geometry elements', () => {
    expect(isKnownElement('rect')).toBe(true);
    expect(isKnownElement('circle')).toBe(true);
    expect(isKnownElement('path')).toBe(true);
    expect(isKnownElement('g')).toBe(true);
    expect(isKnownElement('svg')).toBe(true);
  });

  it('recognises filter primitives', () => {
    expect(isKnownElement('feGaussianBlur')).toBe(true);
    expect(isKnownElement('feColorMatrix')).toBe(true);
    expect(isKnownElement('feMerge')).toBe(true);
  });

  it('recognises gradient elements', () => {
    expect(isKnownElement('linearGradient')).toBe(true);
    expect(isKnownElement('radialGradient')).toBe(true);
    expect(isKnownElement('stop')).toBe(true);
  });

  it('recognises text elements', () => {
    expect(isKnownElement('text')).toBe(true);
    expect(isKnownElement('tspan')).toBe(true);
    expect(isKnownElement('textPath')).toBe(true);
  });

  it('recognises animation elements', () => {
    expect(isKnownElement('animate')).toBe(true);
    expect(isKnownElement('animateTransform')).toBe(true);
    expect(isKnownElement('set')).toBe(true);
  });

  it('rejects unknown elements', () => {
    expect(isKnownElement('div')).toBe(false);
    expect(isKnownElement('span')).toBe(false);
    expect(isKnownElement('foobar')).toBe(false);
  });
});

describe('isKnownAttribute', () => {
  it('accepts geometry attributes for rect', () => {
    expect(isKnownAttribute('rect', 'x')).toBe(true);
    expect(isKnownAttribute('rect', 'y')).toBe(true);
    expect(isKnownAttribute('rect', 'width')).toBe(true);
    expect(isKnownAttribute('rect', 'height')).toBe(true);
    expect(isKnownAttribute('rect', 'rx')).toBe(true);
  });

  it('accepts generic attributes on any element', () => {
    expect(isKnownAttribute('rect', 'id')).toBe(true);
    expect(isKnownAttribute('rect', 'class')).toBe(true);
    expect(isKnownAttribute('g', 'transform')).toBe(true);
    expect(isKnownAttribute('path', 'style')).toBe(true);
  });

  it('accepts d attribute on path', () => {
    expect(isKnownAttribute('path', 'd')).toBe(true);
  });

  it('rejects unknown attributes', () => {
    expect(isKnownAttribute('rect', 'data-custom')).toBe(false);
    expect(isKnownAttribute('rect', 'onclick')).toBe(false);
  });

  it('returns false for unknown elements', () => {
    expect(isKnownAttribute('foobar', 'id')).toBe(false);
  });
});

describe('getAllowedAttributes', () => {
  it('returns a set for known elements', () => {
    const attrs = getAllowedAttributes('rect');
    expect(attrs).not.toBeNull();
    expect(attrs!.has('width')).toBe(true);
  });

  it('returns null for unknown elements', () => {
    expect(getAllowedAttributes('widget')).toBeNull();
  });
});

describe('getKnownElementNames', () => {
  it('contains all standard SVG elements', () => {
    const names = getKnownElementNames();
    expect(names.has('svg')).toBe(true);
    expect(names.has('path')).toBe(true);
    expect(names.has('use')).toBe(true);
    expect(names.size).toBeGreaterThan(40);
  });
});

describe('isPresentationAttribute', () => {
  it('recognises fill and stroke', () => {
    expect(isPresentationAttribute('fill')).toBe(true);
    expect(isPresentationAttribute('stroke')).toBe(true);
    expect(isPresentationAttribute('stroke-width')).toBe(true);
    expect(isPresentationAttribute('opacity')).toBe(true);
  });

  it('rejects non-presentation attributes', () => {
    expect(isPresentationAttribute('d')).toBe(false);
    expect(isPresentationAttribute('viewBox')).toBe(false);
    expect(isPresentationAttribute('id')).toBe(false);
  });
});

describe('collectWhitelistViolations', () => {
  function parseSvg(source: string) {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    return doc.documentElement;
  }

  it('returns empty for a clean SVG', () => {
    const root = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10" /></svg>');
    expect(collectWhitelistViolations(root)).toEqual([]);
  });

  it('detects an unknown element', () => {
    const root = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><widget /></svg>');
    const violations = collectWhitelistViolations(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({ type: 'unknown-element', elementName: 'widget' });
  });

  it('detects an unknown attribute on a known element', () => {
    const root = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10" onclick="alert(1)" /></svg>');
    const violations = collectWhitelistViolations(root);
    expect(violations.some((v) => v.type === 'unknown-attribute' && v.attributeName === 'onclick')).toBe(true);
  });

  it('skips data-* attributes', () => {
    const root = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect data-index="1" x="0" y="0" width="10" height="10" /></svg>');
    expect(collectWhitelistViolations(root)).toEqual([]);
  });

  it('deduplicates violations', () => {
    const root = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><widget /><widget /></svg>');
    const violations = collectWhitelistViolations(root);
    expect(violations).toHaveLength(1);
  });
});
