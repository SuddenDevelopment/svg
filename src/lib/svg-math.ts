/**
 * Shared SVG matrix math utilities.
 *
 * Consolidates the 2D affine transform math previously duplicated across
 * svg-normalization.ts and svg-viewbox.ts, augmented with additional
 * geometry helpers ported from @svgedit/svgcanvas (MIT).
 *
 * @license MIT
 */

const NEAR_ZERO = 1e-10;

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type Matrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export type XYPoint = {
  x: number;
  y: number;
};

export type TransformedBox = {
  tl: XYPoint;
  tr: XYPoint;
  bl: XYPoint;
  br: XYPoint;
  aabox: { x: number; y: number; width: number; height: number };
};

export type AngleSnap = {
  x: number;
  y: number;
  angle: number;
};

// ---------------------------------------------------------------------------
// Matrix constructors
// ---------------------------------------------------------------------------

/** Returns a fresh 2×3 identity matrix. */
export function identityMatrix(): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

// ---------------------------------------------------------------------------
// Matrix predicates
// ---------------------------------------------------------------------------

/**
 * Strict equality check (exact zero tolerance).
 * Kept for backwards compat with the existing normalization pipeline
 * which relies on exact comparisons after building matrices from parsed
 * SVG transform strings.
 */
export function isIdentityMatrix(matrix: Matrix): boolean {
  return (
    matrix.a === 1 &&
    matrix.b === 0 &&
    matrix.c === 0 &&
    matrix.d === 1 &&
    matrix.e === 0 &&
    matrix.f === 0
  );
}

/**
 * Near-zero tolerance check (ported from svgedit math.js).
 * Use this when comparing matrices that have been through floating-point
 * arithmetic (multiply chains, trigonometry, etc.).
 */
export function isNearIdentityMatrix(matrix: Matrix): boolean {
  return (
    Math.abs(matrix.a - 1) < NEAR_ZERO &&
    Math.abs(matrix.b) < NEAR_ZERO &&
    Math.abs(matrix.c) < NEAR_ZERO &&
    Math.abs(matrix.d - 1) < NEAR_ZERO &&
    Math.abs(matrix.e) < NEAR_ZERO &&
    Math.abs(matrix.f) < NEAR_ZERO
  );
}

// ---------------------------------------------------------------------------
// Matrix arithmetic
// ---------------------------------------------------------------------------

/** Compose two matrices: result = left × right. */
export function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

/** Multiply any number of matrices left-to-right. */
export function multiplyMatrices(...matrices: Matrix[]): Matrix {
  if (matrices.length === 0) {
    return identityMatrix();
  }
  return matrices.reduce(multiplyMatrix);
}

/** Build a rotation matrix with an optional pivot point. */
export function rotateMatrix(angleDeg: number, cx = 0, cy = 0): Matrix {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: cx - cx * cos + cy * sin,
    f: cy - cx * sin - cy * cos,
  };
}

// ---------------------------------------------------------------------------
// Transform parsing
// ---------------------------------------------------------------------------

/**
 * Parse an SVG `transform` attribute into a single composed Matrix.
 * Handles: matrix, translate, scale, rotate, skewX, skewY.
 */
export function parseTransformMatrix(transformValue: string | null): Matrix {
  if (!transformValue) {
    return identityMatrix();
  }

  const transformPattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  let current = identityMatrix();
  let match: RegExpExecArray | null;

  while ((match = transformPattern.exec(transformValue)) !== null) {
    const [, type, rawArgs] = match;
    const args = (rawArgs.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map((value) => Number.parseFloat(value));
    let next = identityMatrix();

    switch (type) {
      case 'matrix':
        next = {
          a: args[0] ?? 1,
          b: args[1] ?? 0,
          c: args[2] ?? 0,
          d: args[3] ?? 1,
          e: args[4] ?? 0,
          f: args[5] ?? 0,
        };
        break;
      case 'translate':
        next = { a: 1, b: 0, c: 0, d: 1, e: args[0] ?? 0, f: args[1] ?? 0 };
        break;
      case 'scale':
        next = { a: args[0] ?? 1, b: 0, c: 0, d: args[1] ?? args[0] ?? 1, e: 0, f: 0 };
        break;
      case 'rotate':
        next = rotateMatrix(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0);
        break;
      case 'skewX': {
        const angle = Math.tan(((args[0] ?? 0) * Math.PI) / 180);
        next = { a: 1, b: 0, c: angle, d: 1, e: 0, f: 0 };
        break;
      }
      case 'skewY': {
        const angle = Math.tan(((args[0] ?? 0) * Math.PI) / 180);
        next = { a: 1, b: angle, c: 0, d: 1, e: 0, f: 0 };
        break;
      }
    }

    current = multiplyMatrix(current, next);
  }

  return current;
}

// ---------------------------------------------------------------------------
// Point / geometry transforms
// ---------------------------------------------------------------------------

/** Transform a single point by a matrix. */
export function transformPoint(x: number, y: number, matrix: Matrix): XYPoint {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  };
}

/**
 * Transform a rectangle (l, t, w, h) by a matrix and return the four
 * transformed corners plus an axis-aligned bounding box.
 * Ported from svgedit math.js / transformBox.
 */
export function transformBox(l: number, t: number, w: number, h: number, m: Matrix): TransformedBox {
  const tl = transformPoint(l, t, m);
  const tr = transformPoint(l + w, t, m);
  const bl = transformPoint(l, t + h, m);
  const br = transformPoint(l + w, t + h, m);

  const minx = Math.min(tl.x, tr.x, bl.x, br.x);
  const maxx = Math.max(tl.x, tr.x, bl.x, br.x);
  const miny = Math.min(tl.y, tr.y, bl.y, br.y);
  const maxy = Math.max(tl.y, tr.y, bl.y, br.y);

  return {
    tl,
    tr,
    bl,
    br,
    aabox: {
      x: minx,
      y: miny,
      width: maxx - minx,
      height: maxy - miny,
    },
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers (ported from svgedit math.js)
// ---------------------------------------------------------------------------

/**
 * Snap a line from (x1,y1)→(x2,y2) to the nearest 45° angle.
 * Returns the snapped endpoint and the resolved angle in radians.
 */
export function snapToAngle(x1: number, y1: number, x2: number, y2: number): AngleSnap {
  const snap = Math.PI / 4; // 45°
  const dx = x2 - x1;
  const dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  const dist = Math.hypot(dx, dy);
  const snapAngle = Math.round(angle / snap) * snap;

  return {
    x: x1 + dist * Math.cos(snapAngle),
    y: y1 + dist * Math.sin(snapAngle),
    angle: snapAngle,
  };
}

/**
 * Check whether two axis-aligned rectangles intersect.
 * Each rect is { x, y, width, height }.
 */
export function rectsIntersect(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    r2.x < r1.x + r1.width &&
    r2.x + r2.width > r1.x &&
    r2.y < r1.y + r1.height &&
    r2.y + r2.height > r1.y
  );
}

/**
 * Compute the determinant of a matrix (ad − bc).
 * Useful for detecting flips (negative determinant) and degenerate
 * transforms (zero determinant).
 */
export function matrixDeterminant(m: Matrix): number {
  return m.a * m.d - m.b * m.c;
}

/**
 * Clamp near-zero matrix components to exactly zero.
 * Helpful after chains of trig-based transforms to avoid
 * tiny residual values like 1.2e-16.
 */
export function cleanNearZero(m: Matrix): Matrix {
  const clean = (v: number) => (Math.abs(v) < NEAR_ZERO ? 0 : v);
  return {
    a: clean(m.a),
    b: clean(m.b),
    c: clean(m.c),
    d: clean(m.d),
    e: clean(m.e),
    f: clean(m.f),
  };
}
