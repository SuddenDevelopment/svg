import { describe, expect, it } from 'vitest';
import { remapElementCoordinates } from './svg-remap';
import { parseTransformMatrix } from './svg-math';
import { SVGPathData } from 'svg-pathdata';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgElement(markup: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="${SVG_NS}">${markup}</svg>`,
    'image/svg+xml',
  );
  return doc.documentElement.children[0] as Element;
}

function transformPathData(pathData: string, m: { a: number; b: number; c: number; d: number; e: number; f: number }): string {
  return new SVGPathData(pathData).toAbs().matrix(m.a, m.b, m.c, m.d, m.e, m.f).encode();
}

describe('remapElementCoordinates', () => {
  describe('rect', () => {
    it('remaps coordinates by a translate', () => {
      const el = createSvgElement('<rect x="10" y="20" width="100" height="50" />');
      const m = parseTransformMatrix('translate(5 10)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(true);
      expect(result.removeTransform).toBe(true);
      expect(el.getAttribute('x')).toBe('15');
      expect(el.getAttribute('y')).toBe('30');
      expect(el.getAttribute('width')).toBe('100');
      expect(el.getAttribute('height')).toBe('50');
    });

    it('remaps coordinates by a scale', () => {
      const el = createSvgElement('<rect x="10" y="20" width="100" height="50" />');
      const m = parseTransformMatrix('scale(2)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(true);
      expect(el.getAttribute('x')).toBe('20');
      expect(el.getAttribute('y')).toBe('40');
      expect(el.getAttribute('width')).toBe('200');
      expect(el.getAttribute('height')).toBe('100');
    });

    it('handles negative scale (flip) by correcting x/y', () => {
      const el = createSvgElement('<rect x="10" y="20" width="100" height="50" />');
      const m = parseTransformMatrix('scale(-1 1)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(true);
      expect(Number(el.getAttribute('width'))).toBe(100);
      expect(Number(el.getAttribute('x'))).toBe(-110);
    });
  });

  describe('ellipse', () => {
    it('translates center and preserves radii', () => {
      const el = createSvgElement('<ellipse cx="50" cy="60" rx="20" ry="10" />');
      const m = parseTransformMatrix('translate(10 20)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(true);
      expect(el.getAttribute('cx')).toBe('60');
      expect(el.getAttribute('cy')).toBe('80');
      expect(el.getAttribute('rx')).toBe('20');
      expect(el.getAttribute('ry')).toBe('10');
    });

    it('scales radii', () => {
      const el = createSvgElement('<ellipse cx="0" cy="0" rx="20" ry="10" />');
      const m = parseTransformMatrix('scale(3 2)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(true);
      expect(el.getAttribute('rx')).toBe('60');
      expect(el.getAttribute('ry')).toBe('20');
    });
  });

  describe('circle', () => {
    it('translates center', () => {
      const el = createSvgElement('<circle cx="50" cy="50" r="25" />');
      const m = parseTransformMatrix('translate(10 20)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(true);
      expect(el.getAttribute('cx')).toBe('60');
      expect(el.getAttribute('cy')).toBe('70');
      expect(el.getAttribute('r')).toBe('25');
    });

    it('uniform scale changes radius', () => {
      const el = createSvgElement('<circle cx="0" cy="0" r="25" />');
      const m = parseTransformMatrix('scale(2)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(true);
      expect(el.getAttribute('r')).toBe('50');
    });
  });

  describe('line', () => {
    it('translates endpoints', () => {
      const el = createSvgElement('<line x1="0" y1="0" x2="100" y2="50" />');
      const m = parseTransformMatrix('translate(10 20)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(true);
      expect(el.getAttribute('x1')).toBe('10');
      expect(el.getAttribute('y1')).toBe('20');
      expect(el.getAttribute('x2')).toBe('110');
      expect(el.getAttribute('y2')).toBe('70');
    });
  });

  describe('polygon / polyline', () => {
    it('translates polygon points', () => {
      const el = createSvgElement('<polygon points="0,0 100,0 50,50" />');
      const m = parseTransformMatrix('translate(10 20)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(true);
      expect(el.getAttribute('points')).toBe('10,20 110,20 60,70');
    });

    it('scales polyline points', () => {
      const el = createSvgElement('<polyline points="0,0 10,10 20,0" />');
      const m = parseTransformMatrix('scale(2)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(true);
      expect(el.getAttribute('points')).toBe('0,0 20,20 40,0');
    });
  });

  describe('text', () => {
    it('translates position and scales font-size', () => {
      const el = createSvgElement('<text x="10" y="20" font-size="16">Hello</text>');
      const m = parseTransformMatrix('scale(2) translate(0 0)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(true);
      expect(el.getAttribute('x')).toBe('20');
      expect(el.getAttribute('y')).toBe('40');
      expect(el.getAttribute('font-size')).toBe('32');
    });
  });

  describe('path', () => {
    it('returns not-remapped without a transformPathData callback', () => {
      const el = createSvgElement('<path d="M0 0 L100 100" />');
      const m = parseTransformMatrix('translate(10 20)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(false);
    });

    it('remaps with a provided transformPathData callback', () => {
      const el = createSvgElement('<path d="M0 0L100 0" />');
      const m = parseTransformMatrix('translate(10 20)');
      const result = remapElementCoordinates(el, m, { transformPathData });

      expect(result.remapped).toBe(true);
      expect(result.removeTransform).toBe(true);
      const d = el.getAttribute('d') ?? '';
      expect(d).toContain('10');
    });
  });

  describe('unsupported elements', () => {
    it('returns not-remapped for an unknown element', () => {
      const el = createSvgElement('<g />');
      const m = parseTransformMatrix('translate(10 20)');
      const result = remapElementCoordinates(el, m);

      expect(result.remapped).toBe(false);
      expect(result.removeTransform).toBe(false);
    });
  });
});
