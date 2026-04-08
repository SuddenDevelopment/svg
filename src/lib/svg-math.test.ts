import { describe, expect, it } from 'vitest';
import {
  identityMatrix,
  isIdentityMatrix,
  isNearIdentityMatrix,
  multiplyMatrix,
  multiplyMatrices,
  rotateMatrix,
  parseTransformMatrix,
  transformPoint,
  transformBox,
  snapToAngle,
  rectsIntersect,
  matrixDeterminant,
  cleanNearZero,
} from './svg-math';

describe('identityMatrix', () => {
  it('returns a fresh identity', () => {
    const m = identityMatrix();
    expect(m).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });
});

describe('isIdentityMatrix', () => {
  it('returns true for an exact identity', () => {
    expect(isIdentityMatrix(identityMatrix())).toBe(true);
  });

  it('returns false when any component differs', () => {
    expect(isIdentityMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0.001, f: 0 })).toBe(false);
  });
});

describe('isNearIdentityMatrix', () => {
  it('returns true for a near-identity with tiny residuals', () => {
    expect(isNearIdentityMatrix({ a: 1, b: 1e-12, c: -1e-15, d: 1, e: 0, f: 0 })).toBe(true);
  });

  it('returns false for a clearly non-identity', () => {
    expect(isNearIdentityMatrix({ a: 0.99, b: 0, c: 0, d: 1, e: 0, f: 0 })).toBe(false);
  });
});

describe('multiplyMatrix', () => {
  it('multiplying by identity returns the same matrix', () => {
    const m = { a: 2, b: 0, c: 0, d: 3, e: 10, f: 20 };
    expect(multiplyMatrix(identityMatrix(), m)).toEqual(m);
    expect(multiplyMatrix(m, identityMatrix())).toEqual(m);
  });

  it('composes translate then scale', () => {
    const translate = { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 };
    const scale = { a: 2, b: 0, c: 0, d: 3, e: 0, f: 0 };
    const result = multiplyMatrix(scale, translate);
    // scale applied after translate: x' = 2*(x+10), y' = 3*(y+20)
    expect(result.e).toBe(20);
    expect(result.f).toBe(60);
  });
});

describe('multiplyMatrices', () => {
  it('returns identity for zero matrices', () => {
    expect(multiplyMatrices()).toEqual(identityMatrix());
  });

  it('chains three matrices', () => {
    const t1 = { a: 1, b: 0, c: 0, d: 1, e: 5, f: 0 };
    const t2 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 10 };
    const result = multiplyMatrices(t1, t2);
    expect(result.e).toBe(5);
    expect(result.f).toBe(10);
  });
});

describe('rotateMatrix', () => {
  it('produces identity for 0°', () => {
    const m = rotateMatrix(0);
    expect(isNearIdentityMatrix(m)).toBe(true);
  });

  it('rotates 90° around origin', () => {
    const m = rotateMatrix(90);
    expect(m.a).toBeCloseTo(0, 10);
    expect(m.b).toBeCloseTo(1, 10);
    expect(m.c).toBeCloseTo(-1, 10);
    expect(m.d).toBeCloseTo(0, 10);
  });

  it('rotates 360° back to identity', () => {
    const m = rotateMatrix(360);
    expect(isNearIdentityMatrix(m)).toBe(true);
  });

  it('handles a pivot point', () => {
    const m = rotateMatrix(90, 50, 50);
    const pt = transformPoint(50, 0, m);
    expect(pt.x).toBeCloseTo(100, 5);
    expect(pt.y).toBeCloseTo(50, 5);
  });
});

describe('parseTransformMatrix', () => {
  it('returns identity for null', () => {
    expect(parseTransformMatrix(null)).toEqual(identityMatrix());
  });

  it('returns identity for empty string', () => {
    expect(parseTransformMatrix('')).toEqual(identityMatrix());
  });

  it('parses a translate', () => {
    const m = parseTransformMatrix('translate(10 20)');
    expect(m.e).toBe(10);
    expect(m.f).toBe(20);
  });

  it('parses a scale', () => {
    const m = parseTransformMatrix('scale(2)');
    expect(m.a).toBe(2);
    expect(m.d).toBe(2);
  });

  it('parses a non-uniform scale', () => {
    const m = parseTransformMatrix('scale(2 3)');
    expect(m.a).toBe(2);
    expect(m.d).toBe(3);
  });

  it('parses a matrix()', () => {
    const m = parseTransformMatrix('matrix(1 0 0 1 5 10)');
    expect(m).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 10 });
  });

  it('composes multiple transforms left-to-right', () => {
    const m = parseTransformMatrix('translate(10 0) scale(2)');
    // SVG applies right-to-left: scale first, then translate → e stays 10
    expect(m.a).toBe(2);
    expect(m.e).toBe(10);
  });

  it('handles skewX', () => {
    const m = parseTransformMatrix('skewX(45)');
    expect(m.c).toBeCloseTo(1, 5);
  });

  it('handles skewY', () => {
    const m = parseTransformMatrix('skewY(45)');
    expect(m.b).toBeCloseTo(1, 5);
  });
});

describe('transformPoint', () => {
  it('returns identity-transformed point unchanged', () => {
    const pt = transformPoint(3, 4, identityMatrix());
    expect(pt).toEqual({ x: 3, y: 4 });
  });

  it('applies a translate', () => {
    const m = { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 };
    const pt = transformPoint(5, 6, m);
    expect(pt).toEqual({ x: 15, y: 26 });
  });

  it('applies a scale', () => {
    const m = { a: 2, b: 0, c: 0, d: 3, e: 0, f: 0 };
    const pt = transformPoint(5, 10, m);
    expect(pt).toEqual({ x: 10, y: 30 });
  });
});

describe('transformBox', () => {
  it('returns corners and axis-aligned box for identity', () => {
    const result = transformBox(0, 0, 100, 50, identityMatrix());
    expect(result.tl).toEqual({ x: 0, y: 0 });
    expect(result.br).toEqual({ x: 100, y: 50 });
    expect(result.aabox).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it('translates the box', () => {
    const m = { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 };
    const result = transformBox(0, 0, 100, 50, m);
    expect(result.aabox).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('rotates the box', () => {
    const m = rotateMatrix(90);
    const result = transformBox(0, 0, 100, 50, m);
    expect(result.aabox.width).toBeCloseTo(50, 5);
    expect(result.aabox.height).toBeCloseTo(100, 5);
  });
});

describe('snapToAngle', () => {
  it('snaps a nearly-horizontal line to 0°', () => {
    const snap = snapToAngle(0, 0, 100, 2);
    expect(snap.angle).toBeCloseTo(0, 10);
    expect(snap.y).toBeCloseTo(0, 5);
  });

  it('snaps a 47° line to 45°', () => {
    const snap = snapToAngle(0, 0, 100, 107);
    expect(snap.angle).toBeCloseTo(Math.PI / 4, 5);
  });
});

describe('rectsIntersect', () => {
  it('detects overlapping rects', () => {
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });

  it('detects non-overlapping rects', () => {
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 10, height: 10 })).toBe(false);
  });

  it('detects adjacent rects as non-intersecting', () => {
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });
});

describe('matrixDeterminant', () => {
  it('is 1 for identity', () => {
    expect(matrixDeterminant(identityMatrix())).toBe(1);
  });

  it('is negative for a flip', () => {
    expect(matrixDeterminant({ a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 })).toBe(-1);
  });

  it('scales with the matrix', () => {
    expect(matrixDeterminant({ a: 2, b: 0, c: 0, d: 3, e: 0, f: 0 })).toBe(6);
  });
});

describe('cleanNearZero', () => {
  it('zeros out tiny residuals', () => {
    const m = { a: 1, b: 1e-15, c: -1e-12, d: 1, e: 0, f: 5 };
    const cleaned = cleanNearZero(m);
    expect(cleaned.b).toBe(0);
    expect(cleaned.c).toBe(0);
    expect(cleaned.f).toBe(5);
  });
});
