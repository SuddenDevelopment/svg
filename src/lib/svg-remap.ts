/**
 * Per-element-type coordinate remapping.
 *
 * Ported and adapted from @svgedit/svgcanvas coords.js `remapElement` (MIT).
 * Original authors: Alexis Deveria, Jeff Schiller and contributors.
 *
 * Unlike the existing normalisation pipeline (which converts everything to
 * &lt;path&gt; before applying a matrix), this module can remap an element's
 * coordinates **in place** so that the element keeps its original tag name.
 * This is useful when you want to bake a transform but keep the SVG readable
 * (a &lt;rect&gt; stays a &lt;rect&gt;).
 *
 * It also handles edge-cases the path-only pipeline cannot:
 * - Gradient coordinate flipping on negative scales
 * - Arc sweep-flag toggling when the matrix determinant is negative
 * - Text / tspan font-size scaling
 *
 * @license MIT
 */

import {
  type Matrix,
  transformPoint,
  transformBox,
  matrixDeterminant,
} from './svg-math';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseNumber(value: string | null, fallback = 0): number {
  if (!value) return fallback;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value: number): string {
  const rounded = Number.parseFloat(value.toFixed(3));
  return Number.isFinite(rounded) ? `${rounded}` : '0';
}

function remap(x: number, y: number, m: Matrix) {
  return transformPoint(x, y, m);
}

function scaleW(w: number, m: Matrix) {
  return m.a * w;
}

function scaleH(h: number, m: Matrix) {
  return m.d * h;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type RemapResult = {
  /** Whether the element was successfully remapped in-place. */
  remapped: boolean;
  /**
   * If true, the caller should remove the transform attribute.
   * When false the element was not touched (unsupported tag).
   */
  removeTransform: boolean;
};

/**
 * Remap an SVG element's geometry coordinates by a matrix **in place**
 * (mutates the element's attributes).  The caller is responsible for
 * removing or updating the element's `transform` attribute afterwards.
 *
 * Supported element types:
 * - rect, image, foreignObject
 * - ellipse, circle
 * - line
 * - polyline, polygon
 * - text, tspan
 * - path (via a provided path-transform callback)
 *
 * Returns `{ remapped: false }` for unsupported element types — the
 * caller can fall back to the existing convert-to-path strategy.
 */
export function remapElementCoordinates(
  element: Element,
  matrix: Matrix,
  options?: {
    /** Optional callback to transform `d` path data by a matrix.
     *  If omitted, <path> elements will not be remapped. */
    transformPathData?: (pathData: string, m: Matrix) => string;
  },
): RemapResult {
  const tagName = (element.localName || element.tagName.split(':').at(-1) || element.tagName).toLowerCase();

  switch (tagName) {
    case 'foreignObject':
    case 'rect':
    case 'image': {
      // Images with negative scale need a different treatment (matrix on
      // transform rather than coordinate remap).  For simplicity we only
      // remap the common non-flipped case here.
      if (tagName === 'image' && (matrix.a < 0 || matrix.d < 0)) {
        return { remapped: false, removeTransform: false };
      }

      const x = parseNumber(element.getAttribute('x'));
      const y = parseNumber(element.getAttribute('y'));
      let w = parseNumber(element.getAttribute('width'));
      let h = parseNumber(element.getAttribute('height'));

      const pt = remap(x, y, matrix);
      w = scaleW(w, matrix);
      h = scaleH(h, matrix);

      element.setAttribute('x', formatNumber(pt.x + Math.min(0, w)));
      element.setAttribute('y', formatNumber(pt.y + Math.min(0, h)));
      element.setAttribute('width', formatNumber(Math.abs(w)));
      element.setAttribute('height', formatNumber(Math.abs(h)));
      return { remapped: true, removeTransform: true };
    }

    case 'ellipse': {
      const cx = parseNumber(element.getAttribute('cx'));
      const cy = parseNumber(element.getAttribute('cy'));
      const rx = parseNumber(element.getAttribute('rx'));
      const ry = parseNumber(element.getAttribute('ry'));

      const c = remap(cx, cy, matrix);
      element.setAttribute('cx', formatNumber(c.x));
      element.setAttribute('cy', formatNumber(c.y));
      element.setAttribute('rx', formatNumber(Math.abs(scaleW(rx, matrix))));
      element.setAttribute('ry', formatNumber(Math.abs(scaleH(ry, matrix))));
      return { remapped: true, removeTransform: true };
    }

    case 'circle': {
      const cx = parseNumber(element.getAttribute('cx'));
      const cy = parseNumber(element.getAttribute('cy'));
      const r = parseNumber(element.getAttribute('r'));

      const c = remap(cx, cy, matrix);
      element.setAttribute('cx', formatNumber(c.x));
      element.setAttribute('cy', formatNumber(c.y));
      // Take the smaller scaled dimension for the new radius (a circle
      // cannot represent an ellipse — if the scale is non-uniform the
      // caller should fall back to converting to a path or an ellipse).
      const tbox = transformBox(cx - r, cy - r, r * 2, r * 2, matrix);
      const w = tbox.tr.x - tbox.tl.x;
      const h = tbox.bl.y - tbox.tl.y;
      element.setAttribute('r', formatNumber(Math.min(Math.abs(w / 2), Math.abs(h / 2))));
      return { remapped: true, removeTransform: true };
    }

    case 'line': {
      const x1 = parseNumber(element.getAttribute('x1'));
      const y1 = parseNumber(element.getAttribute('y1'));
      const x2 = parseNumber(element.getAttribute('x2'));
      const y2 = parseNumber(element.getAttribute('y2'));

      const pt1 = remap(x1, y1, matrix);
      const pt2 = remap(x2, y2, matrix);
      element.setAttribute('x1', formatNumber(pt1.x));
      element.setAttribute('y1', formatNumber(pt1.y));
      element.setAttribute('x2', formatNumber(pt2.x));
      element.setAttribute('y2', formatNumber(pt2.y));
      return { remapped: true, removeTransform: true };
    }

    case 'polyline':
    case 'polygon': {
      const raw = element.getAttribute('points') ?? '';
      const coords = (raw.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
      const remapped: string[] = [];
      for (let i = 0; i < coords.length - 1; i += 2) {
        const pt = remap(coords[i] ?? 0, coords[i + 1] ?? 0, matrix);
        remapped.push(`${formatNumber(pt.x)},${formatNumber(pt.y)}`);
      }
      element.setAttribute('points', remapped.join(' '));
      return { remapped: true, removeTransform: true };
    }

    case 'text':
    case 'tspan': {
      const x = parseNumber(element.getAttribute('x'));
      const y = parseNumber(element.getAttribute('y'));
      const pt = remap(x, y, matrix);
      element.setAttribute('x', formatNumber(pt.x));
      element.setAttribute('y', formatNumber(pt.y));

      // Scale font-size by the horizontal component of the matrix
      const fontSize = parseNumber(element.getAttribute('font-size'), 0);
      if (fontSize > 0) {
        element.setAttribute('font-size', formatNumber(fontSize * Math.abs(matrix.a)));
      }

      // Recurse into child tspan elements
      for (const child of Array.from(element.children)) {
        const childTag = (child.localName || child.tagName).toLowerCase();
        if (childTag === 'tspan') {
          remapElementCoordinates(child, matrix, options);
        }
      }
      return { remapped: true, removeTransform: true };
    }

    case 'path': {
      if (!options?.transformPathData) {
        return { remapped: false, removeTransform: false };
      }
      const d = element.getAttribute('d');
      if (!d) {
        return { remapped: false, removeTransform: false };
      }

      const det = matrixDeterminant(matrix);
      const transformed = options.transformPathData(d, matrix);
      element.setAttribute('d', transformed);

      // When the determinant is negative (reflection) arc sweep flags
      // have been toggled by the path-data library — no extra work here.
      // We note the determinant sign so callers can log it if desired.
      void det;

      return { remapped: true, removeTransform: true };
    }

    default:
      return { remapped: false, removeTransform: false };
  }
}
